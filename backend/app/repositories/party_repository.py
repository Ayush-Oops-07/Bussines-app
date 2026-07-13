"""
Repository for Party (Customer / Shoper) CRUD operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.models import Party


async def get_by_id(db: AsyncSession, party_id: uuid.UUID) -> Optional[Party]:
    res = await db.execute(
        select(Party).where(Party.id == party_id, Party.is_deleted == False)
    )
    return res.scalars().first()


async def list_filtered(
    db: AsyncSession,
    party_type: str,
    search_q: str = "",
    status_filter: Optional[str] = None,
) -> List[Party]:
    query = select(Party).where(
        Party.party_type == party_type,
        Party.is_active == True,
        Party.is_deleted == False,
    )

    if search_q:
        like = f"%{search_q}%"
        query = query.where(
            or_(Party.name.ilike(like), Party.mobile.ilike(like))
        )

    if status_filter == "pending":
        query = query.where(Party.balance > 0)
    elif status_filter == "advance":
        query = query.where(Party.balance < 0)
    elif status_filter == "clear":
        query = query.where(Party.balance == 0)

    query = query.order_by(Party.name.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def create(db: AsyncSession, **kwargs) -> Party:
    party = Party(**kwargs)
    db.add(party)
    await db.flush()
    return party


async def update(db: AsyncSession, party: Party) -> Party:
    db.add(party)
    await db.flush()
    return party


async def soft_delete(db: AsyncSession, party: Party) -> Party:
    party.is_active = False
    party.is_deleted = True
    party.deleted_at = datetime.utcnow()
    db.add(party)
    await db.flush()
    return party


async def check_duplicate(
    db: AsyncSession, name: str, party_type: str
) -> Optional[Party]:
    """Check if an active, non-deleted party with the same name+type exists."""
    res = await db.execute(
        select(Party).where(
            Party.name == name,
            Party.party_type == party_type,
            Party.is_active == True,
            Party.is_deleted == False,
        )
    )
    return res.scalars().first()


async def get_stats(db: AsyncSession, party_type: str) -> dict:
    """Aggregate statistics for the party list page."""
    base = select(Party).where(
        Party.party_type == party_type,
        Party.is_active == True,
        Party.is_deleted == False,
    )

    total_res = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_res.scalar() or 0

    pending_res = await db.execute(
        select(func.count()).select_from(base.where(Party.balance > 0).subquery())
    )
    pending_count = pending_res.scalar() or 0

    advance_res = await db.execute(
        select(func.count()).select_from(base.where(Party.balance < 0).subquery())
    )
    advance_count = advance_res.scalar() or 0

    clear_res = await db.execute(
        select(func.count()).select_from(base.where(Party.balance == 0).subquery())
    )
    clear_count = clear_res.scalar() or 0

    pending_amt_res = await db.execute(
        select(func.coalesce(func.sum(Party.balance), 0)).where(
            Party.party_type == party_type,
            Party.is_active == True,
            Party.is_deleted == False,
            Party.balance > 0,
        )
    )
    total_pending = float(pending_amt_res.scalar() or 0)

    advance_amt_res = await db.execute(
        select(func.coalesce(func.sum(Party.balance), 0)).where(
            Party.party_type == party_type,
            Party.is_active == True,
            Party.is_deleted == False,
            Party.balance < 0,
        )
    )
    total_advance = abs(float(advance_amt_res.scalar() or 0))

    return {
        "total_parties": total,
        "pending_count": pending_count,
        "advance_count": advance_count,
        "clear_count": clear_count,
        "total_pending": total_pending,
        "total_advance": total_advance,
        "net_outstanding": total_pending - total_advance,
    }
