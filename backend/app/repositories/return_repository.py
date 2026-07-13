"""
Repository for PurchaseReturn and PurchaseReturnItem CRUD operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from datetime import date
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import PurchaseReturn, PurchaseReturnItem, Party


async def get_by_id(
    db: AsyncSession,
    return_id: uuid.UUID,
    load_items: bool = False,
) -> Optional[PurchaseReturn]:
    query = select(PurchaseReturn).where(
        PurchaseReturn.id == return_id,
        PurchaseReturn.is_deleted == False,
    )
    if load_items:
        query = query.options(
            selectinload(PurchaseReturn.items),
            selectinload(PurchaseReturn.party),
            selectinload(PurchaseReturn.reference_invoice),
        )
    res = await db.execute(query)
    return res.scalars().first()


async def list_paginated(
    db: AsyncSession,
    party_type: str,
    party_id: Optional[uuid.UUID] = None,
    search_q: str = "",
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[List[PurchaseReturn], int]:
    query = select(PurchaseReturn).where(
        PurchaseReturn.party_type == party_type,
        PurchaseReturn.is_deleted == False,
    )

    if party_id:
        query = query.where(PurchaseReturn.party_id == party_id)
    if from_date:
        query = query.where(PurchaseReturn.return_date >= from_date)
    if to_date:
        query = query.where(PurchaseReturn.return_date <= to_date)
    if search_q:
        query = query.join(Party, Party.id == PurchaseReturn.party_id).where(
            or_(
                PurchaseReturn.return_number.ilike(f"%{search_q}%"),
                Party.name.ilike(f"%{search_q}%"),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    count_res = await db.execute(count_query)
    total = count_res.scalar() or 0

    query = (
        query.options(
            selectinload(PurchaseReturn.party),
            selectinload(PurchaseReturn.reference_invoice),
        )
        .order_by(PurchaseReturn.return_date.desc(), PurchaseReturn.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    res = await db.execute(query)
    return list(res.scalars().all()), total


async def get_existing_returned_qty(
    db: AsyncSession,
    reference_invoice_id: uuid.UUID,
    exclude_return_id: Optional[uuid.UUID] = None,
) -> dict:
    """Sum quantities already returned per product for a reference invoice."""
    query = (
        select(PurchaseReturnItem.product_name, PurchaseReturnItem.quantity)
        .join(PurchaseReturn, PurchaseReturn.id == PurchaseReturnItem.purchase_return_id)
        .where(
            PurchaseReturn.reference_invoice_id == reference_invoice_id,
            PurchaseReturn.is_cancelled == False,
            PurchaseReturn.is_deleted == False,
        )
    )
    if exclude_return_id:
        query = query.where(PurchaseReturn.id != exclude_return_id)

    res = await db.execute(query)
    result = {}
    for name, qty in res.all():
        from decimal import Decimal
        result[name] = result.get(name, Decimal("0.00")) + Decimal(str(qty))
    return result


async def create(db: AsyncSession, **kwargs) -> PurchaseReturn:
    pr = PurchaseReturn(**kwargs)
    db.add(pr)
    await db.flush()
    return pr


async def create_item(db: AsyncSession, **kwargs) -> PurchaseReturnItem:
    item = PurchaseReturnItem(**kwargs)
    db.add(item)
    await db.flush()
    return item


async def delete_items(db: AsyncSession, pr: PurchaseReturn):
    """Delete all items for a purchase return."""
    for item in list(pr.items):
        await db.delete(item)
    await db.flush()


async def update(db: AsyncSession, pr: PurchaseReturn) -> PurchaseReturn:
    db.add(pr)
    await db.flush()
    return pr


async def delete(db: AsyncSession, pr: PurchaseReturn):
    await db.delete(pr)
    await db.flush()
