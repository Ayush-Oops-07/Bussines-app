"""
Repository for LedgerEntry CRUD operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from datetime import date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import LedgerEntry, Party


async def get_by_id(db: AsyncSession, entry_id: uuid.UUID) -> Optional[LedgerEntry]:
    res = await db.execute(
        select(LedgerEntry).where(
            LedgerEntry.id == entry_id, LedgerEntry.is_deleted == False
        )
    )
    return res.scalars().first()


async def get_by_party(
    db: AsyncSession,
    party_id: uuid.UUID,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search_q: str = "",
) -> List[LedgerEntry]:
    query = select(LedgerEntry).where(
        LedgerEntry.party_id == party_id,
        LedgerEntry.is_deleted == False,
    )

    if from_date:
        query = query.where(LedgerEntry.entry_date >= from_date)
    if to_date:
        query = query.where(LedgerEntry.entry_date <= to_date)
    if search_q:
        query = query.where(LedgerEntry.particulars.ilike(f"%{search_q}%"))

    query = query.order_by(
        LedgerEntry.entry_date.asc(),
        LedgerEntry.created_at.asc(),
        LedgerEntry.id.asc(),
    )
    res = await db.execute(query)
    return list(res.scalars().all())


async def get_all_for_party_ordered(
    db: AsyncSession, party_id: uuid.UUID
) -> List[LedgerEntry]:
    """Get ALL non-deleted entries for a party, chronologically ordered.
    Used by the ledger recalculation engine."""
    res = await db.execute(
        select(LedgerEntry)
        .where(LedgerEntry.party_id == party_id, LedgerEntry.is_deleted == False)
        .order_by(
            LedgerEntry.entry_date.asc(),
            LedgerEntry.created_at.asc(),
            LedgerEntry.id.asc(),
        )
    )
    return list(res.scalars().all())


async def get_period_sums(
    db: AsyncSession,
    party_id: uuid.UUID,
    before_date: date,
) -> tuple:
    """Get sum(debit) and sum(credit) for entries BEFORE a given date."""
    res = await db.execute(
        select(
            func.coalesce(func.sum(LedgerEntry.debit), 0),
            func.coalesce(func.sum(LedgerEntry.credit), 0),
        ).where(
            LedgerEntry.party_id == party_id,
            LedgerEntry.is_deleted == False,
            LedgerEntry.entry_date < before_date,
        )
    )
    return res.fetchone()


async def create(db: AsyncSession, **kwargs) -> LedgerEntry:
    entry = LedgerEntry(**kwargs)
    db.add(entry)
    await db.flush()
    return entry


async def update(db: AsyncSession, entry: LedgerEntry) -> LedgerEntry:
    db.add(entry)
    await db.flush()
    return entry


async def delete(db: AsyncSession, entry: LedgerEntry):
    await db.delete(entry)
    await db.flush()


async def find_by_invoice(
    db: AsyncSession, invoice_id: uuid.UUID
) -> Optional[LedgerEntry]:
    """Find the ledger entry linked to an invoice."""
    res = await db.execute(
        select(LedgerEntry).where(
            LedgerEntry.invoice_id == invoice_id,
            LedgerEntry.entry_type == "sale",
            LedgerEntry.is_deleted == False,
        )
    )
    return res.scalars().first()


async def find_by_purchase_return(
    db: AsyncSession, purchase_return_id: uuid.UUID
) -> Optional[LedgerEntry]:
    """Find the ledger entry linked to a purchase return."""
    res = await db.execute(
        select(LedgerEntry).where(
            LedgerEntry.purchase_return_id == purchase_return_id,
            LedgerEntry.entry_type == "return",
            LedgerEntry.is_deleted == False,
        )
    )
    return res.scalars().first()


async def get_recent(
    db: AsyncSession,
    party_type: str,
    limit: int = 15,
) -> List[LedgerEntry]:
    """Get recent ledger entries across all parties of a given type."""
    res = await db.execute(
        select(LedgerEntry)
        .options(selectinload(LedgerEntry.party))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(Party.party_type == party_type, LedgerEntry.is_deleted == False)
        .order_by(
            LedgerEntry.entry_date.desc(),
            LedgerEntry.created_at.desc(),
            LedgerEntry.id.desc(),
        )
        .limit(limit)
    )
    return list(res.scalars().all())
