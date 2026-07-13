"""
backend/app/services/invoice_service.py — Invoice business logic layer.

Coordinates database calls through invoice, party, ledger, audit repositories and stock service.
Thin API routes call this service.
"""

import uuid
from decimal import Decimal
from typing import Optional, List
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.models import Invoice, InvoiceItem, Party, LedgerEntry, PurchaseReturn
from app.repositories import (
    invoice_repository,
    party_repository,
    ledger_repository,
    audit_repository,
    return_repository,
)
from app.services.ledger_service import (
    d,
    to_float,
    next_invoice_number,
    recalculate_party_balance,
)


def calc_item_total(
    qty: Decimal, rate: Decimal, discount_pct: Decimal, gst_pct: Decimal
) -> Decimal:
    """
    BUSINESS RULE:
    total = qty × rate × (1 − discount_pct/100) × (1 + gst_pct/100)
    """
    base = d(qty) * d(rate)
    after_discount = base * (1 - d(discount_pct) / 100)
    total = after_discount * (1 + d(gst_pct) / 100)
    return total


def invoice_to_dict(inv: Invoice, include_items: bool = False, party_name: str = None) -> dict:
    data = {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "party_id": str(inv.party_id),
        "party_type": inv.party_type,
        "party_name": party_name if party_name is not None else (inv.party.name if inv.party else ""),
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "subtotal": to_float(inv.subtotal),
        "discount_amount": to_float(inv.discount_amount),
        "gst_amount": to_float(inv.gst_amount),
        "total_amount": to_float(inv.total_amount),
        "notes": inv.notes or "",
        "is_cancelled": inv.is_cancelled,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }
    if include_items and inv.items:
        data["items"] = [
            {
                "id": str(it.id),
                "product_name": it.product_name,
                "unit": it.unit or "",
                "quantity": float(it.quantity),
                "rate": float(it.rate),
                "discount_pct": float(it.discount_pct),
                "gst_pct": float(it.gst_pct),
                "total": float(it.total),
                "item_type": it.item_type or "inventory",
                "is_manual_total": bool(it.is_manual_total),
            }
            for it in inv.items
        ]
    return data


async def process_invoice_items(
    db: AsyncSession,
    items_data: List,
    invoice_id: uuid.UUID,
    party_type: str,
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    Process invoice items: validate, compute totals, create InvoiceItem rows,
    and deduct stock for inventory items.
    """
    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    gst_total = Decimal("0.00")
    invoice_total = Decimal("0.00")

    for item_d in items_data:
        # Resolve item data properties safely
        item_type = getattr(item_d, "item_type", "bill_item").strip().lower()
        if item_type not in ("bill_item", "service", "inventory"):
            item_type = "bill_item"

        description = getattr(item_d, "product_name", "").strip()
        if item_type in ("bill_item", "inventory"):
            description = description.upper()
        if not description:
            continue

        is_manual_total = bool(getattr(item_d, "is_manual_total", False))

        if item_type == "service":
            qty = Decimal("0.000")
            rate = Decimal("0.00")
            disc_pct = Decimal("0.00")
            gst_pct = Decimal("0.00")
            unit = None
            is_manual_total = True

            line_total = d(
                getattr(item_d, "amount", None) or getattr(item_d, "total", None)
            )
            base_amt = line_total
            disc_amt = Decimal("0.00")
            gst_amt = Decimal("0.00")
        else:
            qty = d(getattr(item_d, "quantity", 0))
            rate = d(getattr(item_d, "rate", 0))
            disc_pct = d(getattr(item_d, "discount_pct", 0))
            gst_pct = d(getattr(item_d, "gst_pct", 0))
            unit = (getattr(item_d, "unit", "") or "").strip() or None

            if qty < 0:
                raise ValueError("Quantity cannot be negative")
            if rate < 0:
                raise ValueError("Rate cannot be negative")
            if disc_pct < 0 or disc_pct > 100:
                raise ValueError("Discount must be between 0% and 100%")
            if gst_pct < 0 or gst_pct > 100:
                raise ValueError("GST must be between 0% and 100%")

            auto_total = calc_item_total(qty, rate, disc_pct, gst_pct)
            if is_manual_total and getattr(item_d, "total", None) is not None:
                line_total = d(getattr(item_d, "total", 0))
            else:
                line_total = auto_total
                is_manual_total = False

            base_amt = qty * rate
            disc_amt = base_amt * disc_pct / 100
            gst_amt = (base_amt - disc_amt) * gst_pct / 100

        if line_total <= 0 and item_type == "service":
            continue
        if item_type in ("bill_item", "inventory") and qty <= 0 and not is_manual_total:
            continue

        subtotal += base_amt
        discount_total += disc_amt
        gst_total += gst_amt
        invoice_total += line_total

        await invoice_repository.create_item(
            db=db,
            invoice_id=invoice_id,
            product_name=description,
            unit=unit,
            quantity=qty,
            rate=rate,
            discount_pct=disc_pct,
            gst_pct=gst_pct,
            total=line_total,
            item_type=item_type,
            is_manual_total=is_manual_total,
        )

    if invoice_total <= 0:
        raise ValueError("Invoice total must be greater than zero")

    return subtotal, discount_total, gst_total, invoice_total


async def list_invoices(
    db: AsyncSession,
    party_type: str = "customer",
    party_id: Optional[uuid.UUID] = None,
    q: str = "",
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    invoices, total = await invoice_repository.list_paginated(
        db,
        party_type=party_type,
        party_id=party_id,
        search_q=q,
        from_date=from_date,
        to_date=to_date,
        page=page,
        per_page=per_page,
    )
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "invoices": [invoice_to_dict(inv, include_items=False) for inv in invoices],
    }


async def get_invoice(db: AsyncSession, inv_id: uuid.UUID) -> dict:
    invoice = await invoice_repository.get_by_id(db, inv_id, load_items=True)
    if not invoice:
        raise ValueError("Invoice not found")

    # Load returns matching this reference invoice
    returns_res = await db.execute(
        select(PurchaseReturn)
        .options(selectinload(PurchaseReturn.items))
        .where(
            PurchaseReturn.reference_invoice_id == inv_id,
            PurchaseReturn.is_deleted == False,
        )
    )
    linked_returns = returns_res.scalars().all()

    res_data = invoice_to_dict(invoice, include_items=True)
    res_data["returns"] = [
        {
            "id": str(r.id),
            "return_number": r.return_number,
            "return_date": r.return_date.isoformat(),
            "total_amount": float(r.total_amount),
            "is_cancelled": r.is_cancelled,
            "items": [
                {
                    "product_name": it.product_name,
                    "quantity": float(it.quantity),
                    "total": float(it.total),
                }
                for it in r.items
            ],
        }
        for r in linked_returns
    ]
    return res_data


async def create_invoice(
    db: AsyncSession,
    payload: any,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    party = await party_repository.get_by_id(db, payload.party_id)
    if not party:
        raise ValueError("Party not found")

    party_type = payload.party_type.strip().lower()
    inv_number = await next_invoice_number(db, party_type)

    invoice = await invoice_repository.create(
        db=db,
        invoice_number=inv_number,
        party_id=payload.party_id,
        party_type=party_type,
        invoice_date=payload.invoice_date,
        due_date=payload.due_date,
        notes=payload.notes.strip() if payload.notes else None,
        created_by=user_id,
    )

    subtotal, discount_total, gst_total, invoice_total = await process_invoice_items(
        db, payload.items, invoice.id, party_type
    )

    invoice.subtotal = subtotal
    invoice.discount_amount = discount_total
    invoice.gst_amount = gst_total
    invoice.total_amount = invoice_total
    await invoice_repository.update(db, invoice)

    # Mirrored ledger entry
    ledger_entry = await ledger_repository.create(
        db=db,
        party_id=payload.party_id,
        entry_date=payload.invoice_date,
        entry_type="sale",
        particulars=f"Invoice #{inv_number}",
        debit=invoice_total,
        credit=Decimal("0.00"),
        invoice_id=invoice.id,
        invoice_number=inv_number,
        created_by=user_id,
    )

    await recalculate_party_balance(db, payload.party_id)

    # To avoid MissingGreenlet error, fetch invoice eagerly with items loaded before serializing
    invoice_fresh = await invoice_repository.get_by_id(db, invoice.id, load_items=True)
    serialized = invoice_to_dict(invoice_fresh, include_items=True)

    await audit_repository.create(
        db=db,
        action="create_invoice",
        table_name="invoices",
        record_id=invoice.id,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "invoice": serialized,
        "new_balance": to_float(party.balance),
    }


async def update_invoice(
    db: AsyncSession,
    inv_id: uuid.UUID,
    payload: any,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    invoice = await invoice_repository.get_by_id(db, inv_id, load_items=True)
    if not invoice:
        raise ValueError("Invoice not found")
    if invoice.is_cancelled:
        raise ValueError("Cannot edit a cancelled invoice")

    old_party_id = invoice.party_id
    new_party_id = payload.party_id
    party_type = invoice.party_type

    old_values = invoice_to_dict(invoice, include_items=True)

    invoice.invoice_date = payload.invoice_date
    invoice.due_date = payload.due_date
    invoice.notes = payload.notes.strip() if payload.notes else None
    invoice.party_id = new_party_id

    # 1. Delete old items
    await invoice_repository.delete_items(db, invoice)

    # 3. Process new items
    subtotal, discount_total, gst_total, invoice_total = await process_invoice_items(
        db, payload.items, invoice.id, party_type
    )

    invoice.subtotal = subtotal
    invoice.discount_amount = discount_total
    invoice.gst_amount = gst_total
    invoice.total_amount = invoice_total
    await invoice_repository.update(db, invoice)

    # 4. Sync ledger entry
    ledger_entry = await ledger_repository.find_by_invoice(db, invoice.id)
    if ledger_entry:
        ledger_entry.party_id = new_party_id
        ledger_entry.entry_date = invoice.invoice_date
        ledger_entry.debit = invoice_total
        ledger_entry.invoice_number = invoice.invoice_number
        ledger_entry.particulars = f"Invoice #{invoice.invoice_number}"
        await ledger_repository.update(db, ledger_entry)
    else:
        await ledger_repository.create(
            db=db,
            party_id=new_party_id,
            entry_date=invoice.invoice_date,
            entry_type="sale",
            particulars=f"Invoice #{invoice.invoice_number}",
            debit=invoice_total,
            credit=Decimal("0.00"),
            invoice_id=invoice.id,
            invoice_number=invoice.invoice_number,
            created_by=user_id,
        )

    await recalculate_party_balance(db, new_party_id)
    if new_party_id != old_party_id:
        await recalculate_party_balance(db, old_party_id)

    # To avoid MissingGreenlet error, fetch invoice eagerly with items loaded before serializing
    invoice_fresh = await invoice_repository.get_by_id(db, invoice.id, load_items=True)
    serialized = invoice_to_dict(invoice_fresh, include_items=True)

    party = await party_repository.get_by_id(db, new_party_id)

    await audit_repository.create(
        db=db,
        action="update_invoice",
        table_name="invoices",
        record_id=invoice.id,
        old_values=old_values,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "invoice": serialized,
        "new_balance": to_float(party.balance),
    }


async def delete_invoice(
    db: AsyncSession,
    inv_id: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    invoice = await invoice_repository.get_by_id(db, inv_id, load_items=True)
    if not invoice:
        raise ValueError("Invoice not found")

    party_id = invoice.party_id
    party_type = invoice.party_type
    old_values = invoice_to_dict(invoice, include_items=True)

    # 2. Delete ledger entry
    ledger_entry = await ledger_repository.find_by_invoice(db, invoice.id)
    if ledger_entry:
        ledger_entry.is_deleted = True
        ledger_entry.deleted_at = datetime.utcnow()
        await ledger_repository.update(db, ledger_entry)

    # 3. Soft delete the invoice and items
    invoice.is_deleted = True
    invoice.deleted_at = datetime.utcnow()
    await invoice_repository.update(db, invoice)

    for item in invoice.items:
        item.is_deleted = True
        item.deleted_at = datetime.utcnow()
        db.add(item)

    await db.flush()
    await recalculate_party_balance(db, party_id)

    party = await party_repository.get_by_id(db, party_id)

    await audit_repository.create(
        db=db,
        action="delete_invoice",
        table_name="invoices",
        record_id=invoice.id,
        old_values=old_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "new_balance": to_float(party.balance),
    }


async def cancel_invoice(
    db: AsyncSession,
    inv_id: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    invoice = await invoice_repository.get_by_id(db, inv_id, load_items=True)
    if not invoice:
        raise ValueError("Invoice not found")
    if invoice.is_cancelled:
        raise ValueError("Invoice already cancelled")

    party_id = invoice.party_id
    party_type = invoice.party_type

    invoice.is_cancelled = True
    await invoice_repository.update(db, invoice)

    # 2. Soft delete mirrored sale ledger entry
    ledger_entry = await ledger_repository.find_by_invoice(db, invoice.id)
    if ledger_entry:
        ledger_entry.is_deleted = True
        ledger_entry.deleted_at = datetime.utcnow()
        await ledger_repository.update(db, ledger_entry)

    await recalculate_party_balance(db, party_id)

    party = await party_repository.get_by_id(db, party_id)

    await audit_repository.create(
        db=db,
        action="cancel_invoice",
        table_name="invoices",
        record_id=invoice.id,
        new_values={"id": str(invoice.id), "is_cancelled": True},
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "new_balance": to_float(party.balance),
    }
