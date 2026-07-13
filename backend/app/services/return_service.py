"""
backend/app/services/return_service.py — Purchase Return business logic layer.

Coordinates database calls through return, party, invoice, ledger, and audit repositories,
and stock service. Thin API routes call this service.
"""

import uuid
from decimal import Decimal
from typing import Optional, List
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload

from app.models.models import PurchaseReturn, PurchaseReturnItem, Invoice, Party, LedgerEntry
from app.repositories import (
    return_repository,
    party_repository,
    invoice_repository,
    ledger_repository,
    audit_repository,
)
from app.services.ledger_service import (
    d,
    to_float,
    next_return_number,
    recalculate_party_balance,
)


def calc_item_total(
    qty: Decimal, rate: Decimal, discount_pct: Decimal, gst_pct: Decimal
) -> Decimal:
    base = d(qty) * d(rate)
    after_discount = base * (1 - d(discount_pct) / 100)
    total = after_discount * (1 + d(gst_pct) / 100)
    return total


def purchase_return_to_dict(pr: PurchaseReturn, include_items: bool = False, party_name: str = None) -> dict:
    data = {
        "id": str(pr.id),
        "return_number": pr.return_number,
        "party_id": str(pr.party_id),
        "party_type": pr.party_type,
        "party_name": party_name if party_name is not None else (pr.party.name if pr.party else ""),
        "return_date": pr.return_date.isoformat() if pr.return_date else None,
        "reference_invoice_id": str(pr.reference_invoice_id) if pr.reference_invoice_id else None,
        "reference_invoice_number": pr.reference_invoice.invoice_number if pr.reference_invoice else "",
        "subtotal": to_float(pr.subtotal),
        "discount_amount": to_float(pr.discount_amount),
        "gst_amount": to_float(pr.gst_amount),
        "total_amount": to_float(pr.total_amount),
        "notes": pr.notes or "",
        "is_cancelled": pr.is_cancelled,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
    }
    if include_items and pr.items:
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
                "item_type": it.item_type or "bill_item",
                "is_manual_total": bool(it.is_manual_total),
            }
            for it in pr.items
        ]
    return data


async def validate_return_items(
    db: AsyncSession,
    items_data: List,
    reference_invoice: Optional[Invoice],
    party_type: str,
    current_return_id: Optional[uuid.UUID] = None,
) -> tuple[List[dict], dict]:
    """
    Validate return items:
      - Validates qty, rate, discount_pct, gst_pct bounds
      - If reference invoice provided, ensures:
        - Product was actually sold on that invoice
        - Return qty <= sold qty - already returned qty
        - Uses rate/discount/gst from original invoice for financial consistency
    """
    cleaned = []
    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    gst_total = Decimal("0.00")
    return_total = Decimal("0.00")

    existing_returned = {}
    sold_items = {}

    if reference_invoice:
        existing_returned = await return_repository.get_existing_returned_qty(
            db, reference_invoice.id, exclude_return_id=current_return_id
        )

        for it in reference_invoice.items:
            sold_items[it.product_name] = {
                "qty": d(it.quantity),
                "unit": it.unit,
                "rate": d(it.rate),
                "discount_pct": d(it.discount_pct),
                "gst_pct": d(it.gst_pct),
            }

    for item_d in items_data:
        description = getattr(item_d, "product_name", "").strip().upper()
        if not description:
            continue

        qty = d(getattr(item_d, "quantity", 0))
        rate = d(getattr(item_d, "rate", 0))
        disc_pct = d(getattr(item_d, "discount_pct", 0))
        gst_pct = d(getattr(item_d, "gst_pct", 0))
        unit = (getattr(item_d, "unit", "") or "").strip() or None
        item_type = getattr(item_d, "item_type", "bill_item").strip().lower()
        is_manual_total = bool(getattr(item_d, "is_manual_total", False))

        if qty <= 0:
            raise ValueError(f"Quantity for product '{description}' must be greater than zero")
        if rate < 0:
            raise ValueError(f"Rate for product '{description}' cannot be negative")
        if disc_pct < 0 or disc_pct > 100:
            raise ValueError("Discount must be between 0% and 100%")
        if gst_pct < 0 or gst_pct > 100:
            raise ValueError("GST must be between 0% and 100%")

        if reference_invoice:
            if description not in sold_items:
                raise ValueError(
                    f"Product '{description}' was not sold in Sales Invoice "
                    f"#{reference_invoice.invoice_number}"
                )

            sold_qty = sold_items[description]["qty"]
            already_returned_qty = existing_returned.get(description, Decimal("0.00"))
            max_eligible = sold_qty - already_returned_qty
            if qty > max_eligible:
                raise ValueError(
                    f"Cannot return {to_float(qty)} of '{description}'. "
                    f"Eligible return quantity is {to_float(max_eligible)} "
                    f"({to_float(sold_qty)} sold, {to_float(already_returned_qty)} already returned)."
                )

            # Financial consistency: use original invoice values
            rate = sold_items[description]["rate"]
            disc_pct = sold_items[description]["discount_pct"]
            gst_pct = sold_items[description]["gst_pct"]
            unit = sold_items[description]["unit"]

        auto_total = calc_item_total(qty, rate, disc_pct, gst_pct)
        if is_manual_total and getattr(item_d, "total", None) is not None:
            line_total = d(getattr(item_d, "total", 0))
        else:
            line_total = auto_total
            is_manual_total = False

        base_amt = qty * rate
        disc_amt = base_amt * disc_pct / 100
        gst_amt = (base_amt - disc_amt) * gst_pct / 100

        subtotal += base_amt
        discount_total += disc_amt
        gst_total += gst_amt
        return_total += line_total

        cleaned.append(
            {
                "product_name": description,
                "unit": unit,
                "quantity": qty,
                "rate": rate,
                "discount_pct": disc_pct,
                "gst_pct": gst_pct,
                "total": line_total,
                "item_type": item_type,
                "is_manual_total": is_manual_total,
            }
        )

    if return_total <= 0:
        raise ValueError("Return total must be greater than zero")

    return cleaned, {
        "subtotal": subtotal,
        "discount_amount": discount_total,
        "gst_amount": gst_total,
        "total_amount": return_total,
    }


async def list_returns(
    db: AsyncSession,
    party_type: str = "customer",
    party_id: Optional[uuid.UUID] = None,
    q: str = "",
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    returns, total = await return_repository.list_paginated(
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
        "returns": [purchase_return_to_dict(r, include_items=False) for r in returns],
    }


async def get_return(db: AsyncSession, return_id: uuid.UUID) -> dict:
    pr = await return_repository.get_by_id(db, return_id, load_items=True)
    if not pr:
        raise ValueError("Return invoice not found")
    return purchase_return_to_dict(pr, include_items=True)


async def create_return(
    db: AsyncSession,
    payload: any,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    party = await party_repository.get_by_id(db, payload.party_id)
    if not party:
        raise ValueError("Party not found")

    party_type = payload.party_type.strip().lower()
    ref_invoice_id = payload.reference_invoice_id
    notes = payload.notes.strip() if payload.notes else None

    ref_invoice = None
    if ref_invoice_id:
        ref_invoice = await invoice_repository.get_by_id(db, ref_invoice_id, load_items=True)
        if not ref_invoice:
            raise ValueError("Reference Sales Invoice not found for this customer")
        if ref_invoice.is_cancelled:
            raise ValueError("Cannot return items against a cancelled Sales Invoice")

    cleaned_items, totals = await validate_return_items(db, payload.items, ref_invoice, party_type)

    return_number = await next_return_number(db, party_type)
    return_date = payload.return_date

    pr = await return_repository.create(
        db=db,
        return_number=return_number,
        party_id=payload.party_id,
        party_type=party_type,
        return_date=return_date,
        reference_invoice_id=ref_invoice.id if ref_invoice else None,
        subtotal=totals["subtotal"],
        discount_amount=totals["discount_amount"],
        gst_amount=totals["gst_amount"],
        total_amount=totals["total_amount"],
        notes=notes,
        created_by=user_id,
    )

    for it in cleaned_items:
        await return_repository.create_item(
            db=db,
            purchase_return_id=pr.id,
            product_name=it["product_name"],
            unit=it["unit"],
            quantity=it["quantity"],
            rate=it["rate"],
            discount_pct=it["discount_pct"],
            gst_pct=it["gst_pct"],
            total=it["total"],
            item_type=it["item_type"],
            is_manual_total=it["is_manual_total"],
        )

    particulars = f"Purchase Return #{return_number}"
    if ref_invoice:
        particulars += f" vs Sales Invoice #{ref_invoice.invoice_number}"

    # Mirrored ledger entry
    ledger_entry = await ledger_repository.create(
        db=db,
        party_id=payload.party_id,
        entry_date=return_date,
        entry_type="return",
        particulars=particulars,
        debit=Decimal("0.00"),
        credit=totals["total_amount"],
        purchase_return_id=pr.id,
        notes=notes,
        created_by=user_id,
    )

    await recalculate_party_balance(db, payload.party_id)

    # Eagerly fetch the fresh return to avoid lazy loading MissingGreenlet issues
    pr_fresh = await return_repository.get_by_id(db, pr.id, load_items=True)
    serialized = purchase_return_to_dict(pr_fresh, include_items=True)

    await audit_repository.create(
        db=db,
        action="create_purchase_return",
        table_name="purchase_returns",
        record_id=pr.id,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "return": serialized,
        "new_balance": to_float(party.balance),
    }


async def update_return(
    db: AsyncSession,
    return_id: uuid.UUID,
    payload: any,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    pr = await return_repository.get_by_id(db, return_id, load_items=True)
    if not pr:
        raise ValueError("Return invoice not found")
    if pr.is_cancelled:
        raise ValueError("Cannot edit a cancelled return invoice")

    party_id = pr.party_id
    party_type = pr.party_type
    old_values = purchase_return_to_dict(pr, include_items=True)

    pr.return_date = payload.return_date
    pr.notes = payload.notes.strip() if payload.notes else None

    # 2. Validate new return items
    ref_invoice = None
    if pr.reference_invoice_id:
        ref_invoice = await invoice_repository.get_by_id(db, pr.reference_invoice_id, load_items=True)

    cleaned_items, totals = await validate_return_items(
        db, payload.items, ref_invoice, party_type, current_return_id=pr.id
    )

    # 3. Delete old items
    await return_repository.delete_items(db, pr)

    # 4. Save new return items
    for it in cleaned_items:
        await return_repository.create_item(
            db=db,
            purchase_return_id=pr.id,
            product_name=it["product_name"],
            unit=it["unit"],
            quantity=it["quantity"],
            rate=it["rate"],
            discount_pct=it["discount_pct"],
            gst_pct=it["gst_pct"],
            total=it["total"],
            item_type=it["item_type"],
            is_manual_total=it["is_manual_total"],
        )

    pr.subtotal = totals["subtotal"]
    pr.discount_amount = totals["discount_amount"]
    pr.gst_amount = totals["gst_amount"]
    pr.total_amount = totals["total_amount"]
    await return_repository.update(db, pr)

    # 6. Sync ledger entry
    ledger_entry = await ledger_repository.find_by_purchase_return(db, pr.id)
    if ledger_entry:
        ledger_entry.credit = pr.total_amount
        ledger_entry.entry_date = pr.return_date
        ledger_entry.notes = pr.notes
        await ledger_repository.update(db, ledger_entry)
    else:
        particulars = f"Purchase Return #{pr.return_number}"
        if pr.reference_invoice:
            particulars += f" vs Sales Invoice #{pr.reference_invoice.invoice_number}"

        await ledger_repository.create(
            db=db,
            party_id=party_id,
            entry_date=pr.return_date,
            entry_type="return",
            particulars=particulars,
            debit=Decimal("0.00"),
            credit=pr.total_amount,
            purchase_return_id=pr.id,
            notes=pr.notes,
            created_by=user_id,
        )

    await recalculate_party_balance(db, party_id)

    # Eagerly fetch fresh return to avoid lazy loading MissingGreenlet issues
    pr_fresh = await return_repository.get_by_id(db, pr.id, load_items=True)
    serialized = purchase_return_to_dict(pr_fresh, include_items=True)

    party = await party_repository.get_by_id(db, party_id)

    await audit_repository.create(
        db=db,
        action="update_purchase_return",
        table_name="purchase_returns",
        record_id=pr.id,
        old_values=old_values,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "return": serialized,
        "new_balance": to_float(party.balance),
    }


async def cancel_return(
    db: AsyncSession,
    return_id: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    pr = await return_repository.get_by_id(db, return_id, load_items=True)
    if not pr:
        raise ValueError("Return invoice not found")
    if pr.is_cancelled:
        raise ValueError("Return invoice already cancelled")

    party_id = pr.party_id
    party_type = pr.party_type

    pr.is_cancelled = True
    await return_repository.update(db, pr)

    # 2. Soft delete mirrored ledger entry
    ledger_entry = await ledger_repository.find_by_purchase_return(db, pr.id)
    if ledger_entry:
        ledger_entry.is_deleted = True
        ledger_entry.deleted_at = datetime.utcnow()
        await ledger_repository.update(db, ledger_entry)

    await recalculate_party_balance(db, party_id)

    party = await party_repository.get_by_id(db, party_id)

    await audit_repository.create(
        db=db,
        action="cancel_purchase_return",
        table_name="purchase_returns",
        record_id=pr.id,
        new_values={"id": str(pr.id), "is_cancelled": True},
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "new_balance": to_float(party.balance),
    }


async def delete_return(
    db: AsyncSession,
    return_id: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    pr = await return_repository.get_by_id(db, return_id, load_items=True)
    if not pr:
        raise ValueError("Return invoice not found")

    party_id = pr.party_id
    party_type = pr.party_type
    old_values = purchase_return_to_dict(pr, include_items=True)

    # Delete the linked LedgerEntry
    ledger_entry = await ledger_repository.find_by_purchase_return(db, pr.id)
    if ledger_entry:
        ledger_entry.is_deleted = True
        ledger_entry.deleted_at = datetime.utcnow()
        await ledger_repository.update(db, ledger_entry)

    # Soft delete the return and return items
    pr.is_deleted = True
    pr.deleted_at = datetime.utcnow()
    await return_repository.update(db, pr)

    for item in pr.items:
        item.is_deleted = True
        item.deleted_at = datetime.utcnow()
        db.add(item)

    await db.flush()
    await recalculate_party_balance(db, party_id)

    party = await party_repository.get_by_id(db, party_id)

    await audit_repository.create(
        db=db,
        action="delete_purchase_return",
        table_name="purchase_returns",
        record_id=pr.id,
        old_values=old_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "new_balance": to_float(party.balance),
    }
