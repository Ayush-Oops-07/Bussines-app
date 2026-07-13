"""
backend/app/services/payment_service.py — Payment business logic layer.

Coordinates database calls through payment, party, ledger, adjustment, and audit repositories.
Thin API routes call this service.
"""

import uuid
from decimal import Decimal
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import PaymentTransaction, LedgerEntry
from app.schemas.schemas import PaymentTransactionCreate
from app.repositories import (
    payment_repository,
    party_repository,
    ledger_repository,
    adjustment_repository,
    audit_repository,
)
from app.services.ledger_service import (
    d,
    to_float,
    recalculate_party_balance,
    get_customer_ledger_summary,
)

VALID_PAYMENT_MODES = ("cash", "upi", "bank_transfer", "bank", "cheque", "other")


def normalize_payment_mode(mode: str) -> str:
    """Normalize and validate payment_mode."""
    mode = mode.strip().lower()
    if mode == "bank":
        mode = "bank_transfer"
    if mode not in VALID_PAYMENT_MODES:
        mode = "other"
    return mode


def particulars_for(payment_type: str, reference_no: Optional[str]) -> str:
    """Build the particulars string for a payment ledger entry."""
    base = "Payment Received" if payment_type == "RECEIVED" else "Payment Given"
    if reference_no:
        base += f" (Ref: {reference_no})"
    return base


def classify_entry_type(party_balance: Decimal, payment_type: str) -> str:
    """
    Classify as payment vs advance based on current outstanding.

    BUSINESS RULE (Issue 5 — Advance accounting):
      - RECEIVED with no outstanding debt → advance_received
      - GIVEN with no outstanding debt → advance_paid
    """
    if payment_type == "RECEIVED":
        return "advance_received" if d(party_balance) <= 0 else "payment"
    else:
        return "advance_paid" if d(party_balance) >= 0 else "payment"


def payment_txn_to_dict(t: PaymentTransaction) -> dict:
    return {
        "id": str(t.id),
        "customer_id": str(t.customer_id),
        "customer_name": t.customer.name if t.customer else "",
        "payment_type": t.payment_type,
        "amount": float(t.amount or 0),
        "payment_mode": t.payment_mode or "",
        "reference_no": t.reference_no or "",
        "note": t.note or "",
        "transaction_date": t.transaction_date.isoformat() if t.transaction_date else None,
        "ledger_entry_id": str(t.ledger_entry_id) if t.ledger_entry_id else None,
        "created_by": str(t.created_by) if t.created_by else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


async def list_payments(
    db: AsyncSession,
    customer_id: Optional[uuid.UUID] = None,
    payment_type: Optional[str] = None,
    limit: int = 50,
) -> List[dict]:
    txns = await payment_repository.list_filtered(
        db, customer_id=customer_id, payment_type=payment_type, limit=limit
    )
    return [payment_txn_to_dict(t) for t in txns]


async def create_payment(
    db: AsyncSession,
    payload: PaymentTransactionCreate,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    amount = d(payload.amount)
    if amount <= 0:
        raise ValueError("Amount must be greater than 0")
    if amount > 999999999:
        raise ValueError("Amount exceeds maximum allowed limit of ₹99,99,99,999")

    payment_type = payload.payment_type.strip().upper()
    if payment_type not in ("RECEIVED", "GIVEN"):
        raise ValueError("Invalid payment_type")

    customer = await party_repository.get_by_id(db, payload.customer_id)
    if not customer:
        raise ValueError("Customer not found")

    payment_mode = normalize_payment_mode(payload.payment_mode)
    reference_no = payload.reference_no.strip() if payload.reference_no else None
    note = payload.note.strip() if payload.note else None

    is_received = payment_type == "RECEIVED"
    entry_type = classify_entry_type(d(customer.balance), payment_type)

    # 1. Create Mirrored Ledger Entry
    ledger_entry = await ledger_repository.create(
        db=db,
        party_id=payload.customer_id,
        entry_date=payload.transaction_date,
        entry_type=entry_type,
        particulars=particulars_for(payment_type, reference_no),
        debit=Decimal("0.00") if is_received else amount,
        credit=amount if is_received else Decimal("0.00"),
        payment_mode=payment_mode,
        notes=note,
        created_by=user_id,
    )

    # 2. Create Payment Transaction
    txn = await payment_repository.create(
        db=db,
        customer_id=payload.customer_id,
        payment_type=payment_type,
        amount=amount,
        payment_mode=payment_mode,
        reference_no=reference_no,
        note=note,
        transaction_date=payload.transaction_date,
        ledger_entry_id=ledger_entry.id,
        created_by=user_id,
    )

    # 3. Recalculate balances
    await recalculate_party_balance(db, payload.customer_id)

    summary = await get_customer_ledger_summary(db, payload.customer_id)

    serialized = payment_txn_to_dict(txn)

    await audit_repository.create(
        db=db,
        action="create_payment",
        table_name="payment_transactions",
        record_id=txn.id,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {
        "ok": True,
        "transaction": serialized,
        "ledger_entry_id": str(ledger_entry.id),
        "new_balance": summary["current_balance"],
        "summary": summary,
    }


async def update_payment(
    db: AsyncSession,
    txn_id: uuid.UUID,
    payload: PaymentTransactionCreate,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    txn = await payment_repository.get_by_id(db, txn_id)
    if not txn:
        raise ValueError("Payment transaction not found")

    amount = d(payload.amount)
    if amount <= 0:
        raise ValueError("Amount must be greater than 0")
    if amount > 999999999:
        raise ValueError("Amount exceeds maximum allowed limit of ₹99,99,99,999")

    payment_type = payload.payment_type.strip().upper()
    if payment_type not in ("RECEIVED", "GIVEN"):
        raise ValueError("Invalid payment_type")

    customer = await party_repository.get_by_id(db, payload.customer_id)
    if not customer:
        raise ValueError("Customer not found")

    old_customer_id = txn.customer_id
    new_customer_id = payload.customer_id
    old_values = payment_txn_to_dict(txn)

    payment_mode = normalize_payment_mode(payload.payment_mode)
    reference_no = payload.reference_no.strip() if payload.reference_no else None
    note = payload.note.strip() if payload.note else None

    txn.customer_id = new_customer_id
    txn.payment_type = payment_type
    txn.amount = amount
    txn.payment_mode = payment_mode
    txn.reference_no = reference_no
    txn.note = note
    txn.transaction_date = payload.transaction_date
    await payment_repository.update(db, txn)

    # Sync ledger entry
    is_received = payment_type == "RECEIVED"
    if txn.ledger_entry_id:
        ledger_entry = await ledger_repository.get_by_id(db, txn.ledger_entry_id)
        if ledger_entry:
            ledger_entry.party_id = new_customer_id
            ledger_entry.entry_date = payload.transaction_date
            ledger_entry.particulars = particulars_for(payment_type, reference_no)
            ledger_entry.debit = Decimal("0.00") if is_received else amount
            ledger_entry.credit = amount if is_received else Decimal("0.00")
            ledger_entry.payment_mode = payment_mode
            ledger_entry.notes = note
            await ledger_repository.update(db, ledger_entry)

    await recalculate_party_balance(db, new_customer_id)
    if old_customer_id != new_customer_id:
        await recalculate_party_balance(db, old_customer_id)

    summary = await get_customer_ledger_summary(db, new_customer_id)

    serialized = payment_txn_to_dict(txn)

    await audit_repository.create(
        db=db,
        action="update_payment",
        table_name="payment_transactions",
        record_id=txn.id,
        old_values=old_values,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {
        "ok": True,
        "transaction": serialized,
        "new_balance": summary["current_balance"],
        "summary": summary,
    }


async def delete_payment(
    db: AsyncSession,
    txn_id: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    txn = await payment_repository.get_by_id(db, txn_id)
    if not txn:
        raise ValueError("Payment transaction not found")

    customer_id = txn.customer_id
    ledger_entry_id = txn.ledger_entry_id
    old_values = payment_txn_to_dict(txn)

    # 1. Soft Delete PaymentTransaction
    txn.is_deleted = True
    txn.deleted_at = datetime.utcnow()
    await payment_repository.update(db, txn)

    # 2. Soft Delete mirrored LedgerEntry and any InvoiceAdjustments
    if ledger_entry_id:
        linked_adjustments = await adjustment_repository.find_by_payment_entry(db, ledger_entry_id)
        for link in linked_adjustments:
            if link.adjustment_ledger_entry_id:
                adj_entry = await ledger_repository.get_by_id(db, link.adjustment_ledger_entry_id)
                if adj_entry:
                    adj_entry.is_deleted = True
                    adj_entry.deleted_at = datetime.utcnow()
                    await ledger_repository.update(db, adj_entry)
            link.is_deleted = True
            link.deleted_at = datetime.utcnow()
            await adjustment_repository.create(db, **{
                "id": link.id, "party_id": link.party_id, "payment_ledger_entry_id": link.payment_ledger_entry_id,
                "invoice_id": link.invoice_id, "amount": link.amount, "adjustment_date": link.adjustment_date,
                "is_deleted": True, "deleted_at": link.deleted_at
            })

        ledger_entry = await ledger_repository.get_by_id(db, ledger_entry_id)
        if ledger_entry:
            ledger_entry.is_deleted = True
            ledger_entry.deleted_at = datetime.utcnow()
            await ledger_repository.update(db, ledger_entry)

    await recalculate_party_balance(db, customer_id)

    summary = await get_customer_ledger_summary(db, customer_id)

    await audit_repository.create(
        db=db,
        action="delete_payment",
        table_name="payment_transactions",
        record_id=txn.id,
        old_values=old_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()

    return {
        "ok": True,
        "new_balance": summary["current_balance"],
        "summary": summary,
    }
