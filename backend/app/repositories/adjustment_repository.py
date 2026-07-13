"""
Repository for InvoiceAdjustment CRUD operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.models import InvoiceAdjustment


async def get_by_id(
    db: AsyncSession, adj_id: uuid.UUID
) -> Optional[InvoiceAdjustment]:
    res = await db.execute(
        select(InvoiceAdjustment).where(
            InvoiceAdjustment.id == adj_id,
            InvoiceAdjustment.is_deleted == False,
        )
    )
    return res.scalars().first()


async def list_filtered(
    db: AsyncSession,
    party_id: Optional[uuid.UUID] = None,
    invoice_id: Optional[uuid.UUID] = None,
    limit: int = 100,
) -> List[InvoiceAdjustment]:
    query = select(InvoiceAdjustment).where(
        InvoiceAdjustment.is_deleted == False
    )
    if party_id:
        query = query.where(InvoiceAdjustment.party_id == party_id)
    if invoice_id:
        query = query.where(InvoiceAdjustment.invoice_id == invoice_id)

    query = query.order_by(InvoiceAdjustment.created_at.desc()).limit(limit)
    res = await db.execute(query)
    return list(res.scalars().all())


async def sum_adjusted_for_payment(
    db: AsyncSession, payment_ledger_entry_id: uuid.UUID
) -> float:
    """Sum of amounts already adjusted from a payment entry."""
    res = await db.execute(
        select(func.coalesce(func.sum(InvoiceAdjustment.amount), 0)).where(
            InvoiceAdjustment.payment_ledger_entry_id == payment_ledger_entry_id,
            InvoiceAdjustment.is_deleted == False,
        )
    )
    return float(res.scalar() or 0)


async def sum_adjusted_for_invoice(
    db: AsyncSession, invoice_id: uuid.UUID
) -> float:
    """Sum of amounts already adjusted against an invoice."""
    res = await db.execute(
        select(func.coalesce(func.sum(InvoiceAdjustment.amount), 0)).where(
            InvoiceAdjustment.invoice_id == invoice_id,
            InvoiceAdjustment.is_deleted == False,
        )
    )
    return float(res.scalar() or 0)


async def find_by_payment_entry(
    db: AsyncSession, payment_ledger_entry_id: uuid.UUID
) -> List[InvoiceAdjustment]:
    """Find all adjustments linked to a specific payment ledger entry."""
    res = await db.execute(
        select(InvoiceAdjustment).where(
            InvoiceAdjustment.payment_ledger_entry_id == payment_ledger_entry_id,
            InvoiceAdjustment.is_deleted == False,
        )
    )
    return list(res.scalars().all())


async def create(db: AsyncSession, **kwargs) -> InvoiceAdjustment:
    adj = InvoiceAdjustment(**kwargs)
    db.add(adj)
    await db.flush()
    return adj


async def delete(db: AsyncSession, adj: InvoiceAdjustment):
    await db.delete(adj)
    await db.flush()
