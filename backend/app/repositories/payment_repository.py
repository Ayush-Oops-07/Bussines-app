"""
Repository for PaymentTransaction CRUD operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.models import PaymentTransaction


async def get_by_id(
    db: AsyncSession, txn_id: uuid.UUID
) -> Optional[PaymentTransaction]:
    res = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.id == txn_id,
            PaymentTransaction.is_deleted == False,
        )
    )
    return res.scalars().first()


async def list_filtered(
    db: AsyncSession,
    customer_id: Optional[uuid.UUID] = None,
    payment_type: Optional[str] = None,
    limit: int = 50,
) -> List[PaymentTransaction]:
    query = select(PaymentTransaction).where(
        PaymentTransaction.is_deleted == False
    )
    query = query.options(selectinload(PaymentTransaction.customer))

    if customer_id:
        query = query.where(PaymentTransaction.customer_id == customer_id)
    if payment_type and payment_type in ("RECEIVED", "GIVEN"):
        query = query.where(PaymentTransaction.payment_type == payment_type)

    query = query.order_by(
        PaymentTransaction.transaction_date.desc(),
        PaymentTransaction.id.desc(),
    ).limit(limit)

    res = await db.execute(query)
    return list(res.scalars().all())


async def create(db: AsyncSession, **kwargs) -> PaymentTransaction:
    txn = PaymentTransaction(**kwargs)
    db.add(txn)
    await db.flush()
    return txn


async def update(db: AsyncSession, txn: PaymentTransaction) -> PaymentTransaction:
    db.add(txn)
    await db.flush()
    return txn


async def delete(db: AsyncSession, txn: PaymentTransaction):
    await db.delete(txn)
    await db.flush()


async def find_by_ledger_entry(
    db: AsyncSession, ledger_entry_id: uuid.UUID
) -> Optional[PaymentTransaction]:
    """Find a payment transaction linked to a specific ledger entry."""
    res = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.ledger_entry_id == ledger_entry_id,
            PaymentTransaction.is_deleted == False,
        )
    )
    return res.scalars().first()
