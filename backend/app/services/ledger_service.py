"""
backend/app/services/ledger_service.py — ONE Ledger Engine.

All balance calculations, running balance rebuilds, ledger summaries,
and ledger CRUD operations flow through this service.

BUSINESS RULES PRESERVED:
- Balance = Opening + Σ(Debit) − Σ(Credit)
- Chronological ordering by entry_date ASC, created_at ASC, id ASC.
- Edit/delete entry cascades to linked transactions, invoices, and returns.
"""

import uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import select, func, extract, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.models import (
    Party,
    LedgerEntry,
    PaymentTransaction,
    InvoiceAdjustment,
    Invoice,
    PurchaseReturn,
    SystemSetting,
)
from backend.app.repositories import (
    ledger_repository,
    party_repository,
    payment_repository,
    adjustment_repository,
    invoice_repository,
    return_repository,
    audit_repository,
)

TWO = Decimal("0.01")


def d(value) -> Decimal:
    """Convert any value to Decimal safely with rounding."""
    if value is None:
        return Decimal("0.00")
    try:
        return Decimal(str(value)).quantize(TWO, rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def to_float(value) -> float:
    return float(d(value))


def entry_to_dict(e: LedgerEntry) -> dict:
    return {
        "id": str(e.id),
        "party_id": str(e.party_id),
        "entry_date": e.entry_date.isoformat() if e.entry_date else None,
        "entry_type": e.entry_type,
        "particulars": e.particulars or "",
        "debit": to_float(e.debit),
        "credit": to_float(e.credit),
        "running_balance": to_float(e.running_balance),
        "payment_mode": e.payment_mode or "",
        "invoice_id": str(e.invoice_id) if e.invoice_id else None,
        "invoice_number": e.invoice_number or "",
        "purchase_return_id": str(e.purchase_return_id) if e.purchase_return_id else None,
        "notes": e.notes or "",
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ── Invoice Numbering ─────────────────────────────────────────────────────────

async def next_invoice_number(db: AsyncSession, party_type: str) -> str:
    """Generates sequential invoice numbers: C-0001 / S-0001."""
    prefix = "C" if party_type == "customer" else "S"
    key = f"last_invoice_{party_type}"

    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalars().one_or_none()

    if setting is None:
        last_res = await db.execute(
            select(func.max(Invoice.invoice_number)).where(Invoice.party_type == party_type)
        )
        last = last_res.scalar()
        if last:
            try:
                seq = int(last.split("-")[-1])
            except Exception:
                seq = 0
        else:
            seq = 0
        setting = SystemSetting(key=key, value=str(seq))
        db.add(setting)
        await db.flush()

    next_seq = int(setting.value or 0) + 1
    setting.value = str(next_seq)
    db.add(setting)
    await db.flush()

    for _ in range(100):
        candidate = f"{prefix}-{next_seq:04d}"
        exists_res = await db.execute(select(Invoice).where(Invoice.invoice_number == candidate))
        exists = exists_res.scalars().first()
        if not exists:
            return candidate
        next_seq += 1
        setting.value = str(next_seq)
        db.add(setting)
        await db.flush()

    raise RuntimeError("Could not generate unique invoice number")


# ── Return Numbering ──────────────────────────────────────────────────────────

async def next_return_number(db: AsyncSession, party_type: str) -> str:
    """Generates sequential return numbers: PR-000001."""
    key = f"last_return_{party_type}"

    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalars().one_or_none()

    if setting is None:
        last_res = await db.execute(
            select(func.max(PurchaseReturn.return_number)).where(PurchaseReturn.party_type == party_type)
        )
        last = last_res.scalar()
        if last:
            try:
                seq = int(last.split("-")[-1])
            except Exception:
                seq = 0
        else:
            seq = 0
        setting = SystemSetting(key=key, value=str(seq))
        db.add(setting)
        await db.flush()

    next_seq = int(setting.value or 0) + 1
    setting.value = str(next_seq)
    db.add(setting)
    await db.flush()

    for _ in range(100):
        candidate = f"PR-{next_seq:06d}"
        exists_res = await db.execute(select(PurchaseReturn).where(PurchaseReturn.return_number == candidate))
        exists = exists_res.scalars().first()
        if not exists:
            return candidate
        next_seq += 1
        setting.value = str(next_seq)
        db.add(setting)
        await db.flush()

    raise RuntimeError("Could not generate unique return number")


# ── Balance Recalculation (THE ONE LEDGER ENGINE) ─────────────────────────────

async def recalculate_party_balance(db: AsyncSession, party_id: uuid.UUID) -> Decimal:
    """
    Recalculate running balance for ALL ledger entries of a party chronologically.
    Tie-breaker: created_at ASC, then id ASC.
    """
    party = await party_repository.get_by_id(db, party_id)
    if not party:
        raise ValueError("Party not found")

    entries = await ledger_repository.get_all_for_party_ordered(db, party_id)

    running = d(party.opening_balance)
    for entry in entries:
        running = running + d(entry.debit) - d(entry.credit)
        entry.running_balance = running
        await ledger_repository.update(db, entry)

    party.balance = running
    await party_repository.update(db, party)
    return running


recalculate_customer_ledger = recalculate_party_balance


# ── Ledger Summary ────────────────────────────────────────────────────────────

async def get_customer_ledger_summary(db: AsyncSession, party_id: uuid.UUID) -> dict:
    """Single source of truth for dashboard cards and outstanding calculations."""
    party = await party_repository.get_by_id(db, party_id)
    if not party:
        raise ValueError("Party not found")

    # Total debit and credit
    totals = await ledger_repository.get_period_sums(db, party_id, date.max)
    total_debit = d(totals[0] if totals else 0)
    total_credit = d(totals[1] if totals else 0)

    # Total Sales
    sales_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.debit), 0)).where(
            LedgerEntry.party_id == party_id,
            LedgerEntry.entry_type == "sale",
            LedgerEntry.is_deleted == False,
        )
    )
    total_sales = d(sales_res.scalar() or 0)

    # Total payments received
    pmt_rec_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.credit), 0)).where(
            LedgerEntry.party_id == party_id,
            LedgerEntry.entry_type.in_(("payment", "advance_received")),
            LedgerEntry.is_deleted == False,
        )
    )
    total_payments_received = d(pmt_rec_res.scalar() or 0)

    # Total payments given
    pmt_giv_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.debit), 0)).where(
            LedgerEntry.party_id == party_id,
            LedgerEntry.entry_type.in_(("payment", "advance_paid")),
            LedgerEntry.is_deleted == False,
        )
    )
    total_payments_given = d(pmt_giv_res.scalar() or 0)

    # Returns summary
    returns_res = await db.execute(
        select(
            func.count(PurchaseReturn.id).label("count"),
            func.coalesce(func.sum(PurchaseReturn.total_amount), 0).label("amount"),
            func.max(PurchaseReturn.return_date).label("last_date"),
        ).where(
            PurchaseReturn.party_id == party_id,
            PurchaseReturn.is_cancelled == False,
            PurchaseReturn.is_deleted == False,
        )
    )
    returns_summary = returns_res.fetchone()
    ret_count = int(returns_summary[0] or 0) if returns_summary else 0
    ret_amount = d(returns_summary[1] or 0) if returns_summary else Decimal("0.00")
    last_ret_date = returns_summary[2] if returns_summary else None

    current_balance = d(party.opening_balance) + total_debit - total_credit

    # Last transaction date & particulars
    last_entry_res = await db.execute(
        select(LedgerEntry.entry_date, LedgerEntry.particulars)
        .where(LedgerEntry.party_id == party_id, LedgerEntry.is_deleted == False)
        .order_by(LedgerEntry.entry_date.desc(), LedgerEntry.created_at.desc(), LedgerEntry.id.desc())
        .limit(1)
    )
    last_entry = last_entry_res.fetchone()
    last_txn_date = last_entry[0].isoformat() if last_entry else None
    last_txn_particulars = last_entry[1] if last_entry else None

    return {
        "party_id": str(party_id),
        "opening_balance": to_float(party.opening_balance),
        "total_debit": to_float(total_debit),
        "total_credit": to_float(total_credit),
        "total_sales": to_float(total_sales),
        "total_payments_received": to_float(total_payments_received),
        "total_payments_given": to_float(total_payments_given),
        "outstanding": to_float(current_balance if current_balance > 0 else 0),
        "advance": to_float(abs(current_balance) if current_balance < 0 else 0),
        "current_balance": to_float(current_balance),
        "total_returns_count": ret_count,
        "total_returns_amount": to_float(ret_amount),
        "last_return_date": last_ret_date.isoformat() if last_ret_date else None,
        "last_txn_date": last_txn_date,
        "last_txn_particulars": last_txn_particulars,
    }


# ── Ledger CRUD Operations (Thin Router delegates to these) ────────────────────

async def get_ledger(
    db: AsyncSession,
    party_id: uuid.UUID,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search_q: str = "",
) -> dict:
    party = await party_repository.get_by_id(db, party_id)
    if not party:
        raise ValueError("Party not found")

    entries = await ledger_repository.get_by_party(
        db, party_id=party_id, from_date=from_date, to_date=to_date, search_q=search_q
    )

    # Compute period opening balance
    period_opening = d(party.opening_balance)
    if from_date:
        pre_sums = await ledger_repository.get_period_sums(db, party_id, from_date)
        if pre_sums:
            period_opening = period_opening + d(pre_sums[0]) - d(pre_sums[1])

    is_filtered = from_date is not None or to_date is not None or bool(search_q)
    running = period_opening
    response_entries = []

    for e in entries:
        running = running + d(e.debit) - d(e.credit)
        ed = entry_to_dict(e)
        if is_filtered:
            ed["running_balance"] = to_float(running)
        response_entries.append(ed)

    return {
        "party_id": str(party_id),
        "balance": to_float(party.balance),
        "opening_balance": to_float(period_opening),
        "entries": response_entries,
    }


async def add_payment(
    db: AsyncSession,
    party_id: uuid.UUID,
    amount: float,
    payment_mode: str,
    particulars: str,
    date_val: date,
    notes: Optional[str],
    user_id: uuid.UUID,
    username: str,
) -> dict:
    amt = d(amount)
    if amt <= 0:
        raise ValueError("Amount must be > 0")

    party = await party_repository.get_by_id(db, party_id)
    if not party:
        raise ValueError("Party not found")

    entry = await ledger_repository.create(
        db=db,
        party_id=party_id,
        entry_date=date_val,
        entry_type="payment",
        particulars=particulars.strip(),
        debit=Decimal("0.00"),
        credit=amt,
        payment_mode=payment_mode.strip().lower(),
        notes=notes.strip() if notes else None,
        created_by=user_id,
    )

    await recalculate_party_balance(db, party_id)

    serialized = entry_to_dict(entry)

    await audit_repository.create(
        db=db,
        action="add_payment_ledger",
        table_name="ledger_entries",
        record_id=entry.id,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {
        "ok": True,
        "entry": serialized,
        "new_balance": to_float(party.balance),
    }


async def add_debit(
    db: AsyncSession,
    party_id: uuid.UUID,
    amount: float,
    particulars: str,
    date_val: date,
    notes: Optional[str],
    user_id: uuid.UUID,
    username: str,
) -> dict:
    amt = d(amount)
    if amt <= 0:
        raise ValueError("Amount must be > 0")

    party = await party_repository.get_by_id(db, party_id)
    if not party:
        raise ValueError("Party not found")

    entry = await ledger_repository.create(
        db=db,
        party_id=party_id,
        entry_date=date_val,
        entry_type="debit",
        particulars=particulars.strip(),
        debit=amt,
        credit=Decimal("0.00"),
        notes=notes.strip() if notes else None,
        created_by=user_id,
    )

    await recalculate_party_balance(db, party_id)

    serialized = entry_to_dict(entry)

    await audit_repository.create(
        db=db,
        action="add_debit_ledger",
        table_name="ledger_entries",
        record_id=entry.id,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {
        "ok": True,
        "entry": serialized,
        "new_balance": to_float(party.balance),
    }


async def update_entry(
    db: AsyncSession,
    entry_id: uuid.UUID,
    particulars: Optional[str],
    date_val: Optional[date],
    notes: Optional[str],
    payment_mode: Optional[str],
    amount: Optional[float],
    user_id: uuid.UUID,
    username: str,
) -> dict:
    entry = await ledger_repository.get_by_id(db, entry_id)
    if not entry:
        raise ValueError("Entry not found")

    if entry.invoice_id and entry.entry_type == "sale":
        raise ValueError("Edit the invoice to change this entry")

    old_values = entry_to_dict(entry)

    if particulars is not None:
        entry.particulars = particulars.strip()
    if date_val is not None:
        entry.entry_date = date_val
    if notes is not None:
        entry.notes = notes.strip() or None
    if payment_mode is not None:
        entry.payment_mode = payment_mode.strip().lower() or None

    if amount is not None and not entry.invoice_id:
        amt = d(amount)
        if amt <= 0:
            raise ValueError("Amount must be > 0")
        if entry.entry_type in ("payment", "advance_received"):
            entry.credit = amt
            entry.debit = Decimal("0.00")
        else:
            entry.debit = amt
            entry.credit = Decimal("0.00")

    # Sync linked payment transaction
    linked_txn = await payment_repository.find_by_ledger_entry(db, entry.id)
    if linked_txn:
        if amount is not None and not entry.invoice_id:
            linked_txn.amount = d(amount)
        if date_val is not None:
            linked_txn.transaction_date = entry.entry_date
        if payment_mode is not None:
            linked_txn.payment_mode = entry.payment_mode
        if notes is not None:
            linked_txn.note = entry.notes
        await payment_repository.update(db, linked_txn)

    await ledger_repository.update(db, entry)

    party_id = entry.party_id
    await recalculate_party_balance(db, party_id)

    party = await party_repository.get_by_id(db, party_id)

    serialized = entry_to_dict(entry)

    await audit_repository.create(
        db=db,
        action="update_ledger_entry",
        table_name="ledger_entries",
        record_id=entry.id,
        old_values=old_values,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {
        "ok": True,
        "entry": serialized,
        "new_balance": to_float(party.balance),
    }


async def delete_entry(
    db: AsyncSession,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    entry = await ledger_repository.get_by_id(db, entry_id)
    if not entry:
        raise ValueError("Entry not found")

    party_id = entry.party_id
    old_values = entry_to_dict(entry)

    # 1. Linked to sale invoice -> Cancel Invoice
    if entry.invoice_id and entry.entry_type == "sale":
        inv = await invoice_repository.get_by_id(db, entry.invoice_id, load_items=True)
        if inv and not inv.is_cancelled:
            inv.is_cancelled = True
            await invoice_repository.update(db, inv)

    # 2. Linked to return -> Cancel return
    if entry.purchase_return_id and entry.entry_type == "return":
        pr = await return_repository.get_by_id(db, entry.purchase_return_id, load_items=True)
        if pr:
            pr.is_deleted = True
            pr.deleted_at = datetime.utcnow()
            await return_repository.update(db, pr)

    # 3. Linked to payment -> Soft Delete PaymentTransaction
    linked_txn = await payment_repository.find_by_ledger_entry(db, entry.id)
    if linked_txn:
        linked_txn.is_deleted = True
        linked_txn.deleted_at = datetime.utcnow()
        await payment_repository.update(db, linked_txn)

    # 4. Clean up linked adjustments
    linked_adjs = await adjustment_repository.find_by_payment_entry(db, entry.id)
    # Also find adjustments where this entry is the adjustment_ledger_entry_id
    adj_by_adj_res = await db.execute(
        select(InvoiceAdjustment).where(
            InvoiceAdjustment.adjustment_ledger_entry_id == entry.id,
            InvoiceAdjustment.is_deleted == False,
        )
    )
    linked_adjs.extend(adj_by_adj_res.scalars().all())

    for link in linked_adjs:
        link.is_deleted = True
        link.deleted_at = datetime.utcnow()
        await adjustment_repository.create(db, **{
            "id": link.id, "party_id": link.party_id, "payment_ledger_entry_id": link.payment_ledger_entry_id,
            "invoice_id": link.invoice_id, "amount": link.amount, "adjustment_date": link.adjustment_date,
            "is_deleted": True, "deleted_at": link.deleted_at
        })

    # 5. Soft Delete this ledger entry
    entry.is_deleted = True
    entry.deleted_at = datetime.utcnow()
    await ledger_repository.update(db, entry)

    await recalculate_party_balance(db, party_id)

    party = await party_repository.get_by_id(db, party_id)

    await audit_repository.create(
        db=db,
        action="delete_ledger_entry",
        table_name="ledger_entries",
        record_id=entry.id,
        old_values=old_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {"ok": True, "new_balance": to_float(party.balance)}


async def get_monthly_summary(
    db: AsyncSession,
    party_type: str,
    year: int,
) -> dict:
    # Monthly sales
    sales_res = await db.execute(
        select(
            extract("month", LedgerEntry.entry_date).label("month"),
            func.coalesce(func.sum(LedgerEntry.debit), 0).label("total"),
        )
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "sale",
            extract("year", LedgerEntry.entry_date) == year,
            LedgerEntry.is_deleted == False,
        )
        .group_by("month")
    )
    sales = sales_res.all()

    # Monthly collections
    coll_res = await db.execute(
        select(
            extract("month", LedgerEntry.entry_date).label("month"),
            func.coalesce(func.sum(LedgerEntry.credit), 0).label("total"),
        )
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "payment",
            extract("year", LedgerEntry.entry_date) == year,
            LedgerEntry.is_deleted == False,
        )
        .group_by("month")
    )
    collections = coll_res.all()

    sales_map = {int(r[0]): float(r[1]) for r in sales}
    coll_map = {int(r[0]): float(r[1]) for r in collections}

    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return {
        "year": year,
        "months": months,
        "sales": [sales_map.get(i, 0) for i in range(1, 13)],
        "collections": [coll_map.get(i, 0) for i in range(1, 13)],
    }


async def get_recent_transactions(
    db: AsyncSession,
    party_type: str,
    limit: int = 20,
) -> List[dict]:
    limit = min(max(1, limit), 100)
    entries = await ledger_repository.get_recent(db, party_type=party_type, limit=limit)

    result = []
    for e in entries:
        d_dict = entry_to_dict(e)
        d_dict["party_name"] = e.party.name if e.party else ""
        result.append(d_dict)

    return result
