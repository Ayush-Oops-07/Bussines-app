"""
backend/app/services/adjustment_service.py — Invoice Adjustment business logic layer.

Coordinates database calls through adjustment, party, invoice, ledger, and audit repositories.
Thin API routes call this service.
"""

import uuid
from decimal import Decimal
from typing import Optional, List
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import InvoiceAdjustment, LedgerEntry
from app.schemas.schemas import InvoiceAdjustmentCreate
from app.repositories import (
    adjustment_repository,
    party_repository,
    invoice_repository,
    ledger_repository,
    audit_repository,
)
from app.services.ledger_service import (
    d,
    to_float,
    recalculate_party_balance,
)


def adj_to_dict(adj: InvoiceAdjustment) -> dict:
    return {
        "id": str(adj.id),
        "party_id": str(adj.party_id),
        "payment_ledger_entry_id": str(adj.payment_ledger_entry_id),
        "invoice_id": str(adj.invoice_id) if adj.invoice_id else None,
        "amount": to_float(adj.amount),
        "adjustment_date": adj.adjustment_date.isoformat() if adj.adjustment_date else None,
        "notes": adj.notes or "",
        "created_at": adj.created_at.isoformat() if adj.created_at else None,
        "adjustment_ledger_entry_id": str(adj.adjustment_ledger_entry_id) if adj.adjustment_ledger_entry_id else None,
    }


async def list_adjustments(
    db: AsyncSession,
    party_id: Optional[uuid.UUID] = None,
    invoice_id: Optional[uuid.UUID] = None,
) -> List[dict]:
    adjs = await adjustment_repository.list_filtered(
        db, party_id=party_id, invoice_id=invoice_id
    )
    return [adj_to_dict(a) for a in adjs]


async def create_adjustment(
    db: AsyncSession,
    payload: InvoiceAdjustmentCreate,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    payment_entry_id = payload.payment_ledger_entry_id
    invoice_id = payload.invoice_id
    amount = d(payload.amount)
    notes = payload.notes.strip() if payload.notes else None
    adj_date = payload.adjustment_date

    if amount <= 0:
        raise ValueError("Amount must be greater than 0")

    # 1. Fetch & Validate payment ledger entry
    pay_entry = await ledger_repository.get_by_id(db, payment_entry_id)
    if not pay_entry:
        raise ValueError("Payment ledger entry not found")

    party_id = pay_entry.party_id

    # Must be a payment/credit (credit > 0)
    if d(pay_entry.credit) <= 0:
        raise ValueError(
            "Selected entry is not a credit/payment — only Payment Received entries can be adjusted"
        )

    # Calculate already adjusted amount
    already_adjusted = await adjustment_repository.sum_adjusted_for_payment(db, payment_entry_id)
    available = d(pay_entry.credit) - d(already_adjusted)

    if amount > available:
        raise ValueError(
            f"Cannot adjust more than the available balance (₹{to_float(available):.2f}) on this payment entry"
        )

    # 2. Fetch & Validate invoice outstanding
    invoice = None
    inv_label = ""
    if invoice_id:
        invoice = await invoice_repository.get_by_id(db, invoice_id)
        if not invoice:
            raise ValueError("Invoice not found for this customer")
        if invoice.is_cancelled:
            raise ValueError("Cannot adjust against a cancelled invoice")

        # Check remaining invoice outstanding (Bug #8 fix)
        already_adjusted_for_invoice = await adjustment_repository.sum_adjusted_for_invoice(db, invoice_id)
        invoice_outstanding = d(invoice.total_amount) - d(already_adjusted_for_invoice)

        if amount > invoice_outstanding:
            raise ValueError(
                f"Cannot adjust more than the remaining invoice outstanding (₹{to_float(invoice_outstanding):.2f})"
            )

        inv_label = f" vs Invoice #{invoice.invoice_number}"

    particulars = f"Payment adjustment{inv_label}"
    if notes:
        particulars += f" — {notes}"

    # 3. Create adjustment ledger entry
    adj_entry = await ledger_repository.create(
        db=db,
        party_id=party_id,
        entry_date=adj_date,
        entry_type="adjustment",
        particulars=particulars,
        debit=Decimal("0.00"),
        credit=Decimal("0.00"),
        invoice_id=invoice.id if invoice else None,
        invoice_number=invoice.invoice_number if invoice else None,
        notes=notes,
        created_by=user_id,
    )

    # 4. Create InvoiceAdjustment
    adj = await adjustment_repository.create(
        db=db,
        party_id=party_id,
        payment_ledger_entry_id=payment_entry_id,
        invoice_id=invoice.id if invoice else None,
        amount=amount,
        adjustment_date=adj_date,
        notes=notes,
        adjustment_ledger_entry_id=adj_entry.id,
        created_by=user_id,
    )

    await recalculate_party_balance(db, party_id)

    party = await party_repository.get_by_id(db, party_id)

    serialized = adj_to_dict(adj)

    await audit_repository.create(
        db=db,
        action="create_adjustment",
        table_name="invoice_adjustments",
        record_id=adj.id,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "adjustment": serialized,
        "summary": {
            "payment_amount": to_float(pay_entry.credit),
            "adjusted_amount": to_float(amount),
            "remaining_advance": to_float(available - amount),
            "invoice_total": to_float(invoice.total_amount) if invoice else None,
            "customer_balance": to_float(party.balance),
        },
    }


async def delete_adjustment(
    db: AsyncSession,
    adj_id: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    adj = await adjustment_repository.get_by_id(db, adj_id)
    if not adj:
        raise ValueError("Adjustment not found")

    party_id = adj.party_id
    entry_id = adj.adjustment_ledger_entry_id
    old_values = adj_to_dict(adj)

    # 1. Soft Delete InvoiceAdjustment
    adj.is_deleted = True
    adj.deleted_at = datetime.utcnow()
    await adjustment_repository.create(db, **{
        "id": adj.id, "party_id": adj.party_id, "payment_ledger_entry_id": adj.payment_ledger_entry_id,
        "invoice_id": adj.invoice_id, "amount": adj.amount, "adjustment_date": adj.adjustment_date,
        "is_deleted": True, "deleted_at": adj.deleted_at
    })

    # 2. Soft Delete associated zero-value LedgerEntry
    if entry_id:
        entry = await ledger_repository.get_by_id(db, entry_id)
        if entry:
            entry.is_deleted = True
            entry.deleted_at = datetime.utcnow()
            await ledger_repository.update(db, entry)

    await recalculate_party_balance(db, party_id)

    await audit_repository.create(
        db=db,
        action="delete_adjustment",
        table_name="invoice_adjustments",
        record_id=adj.id,
        old_values=old_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {"ok": True}
