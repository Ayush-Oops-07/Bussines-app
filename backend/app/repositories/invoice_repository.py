"""
Repository for Invoice and InvoiceItem CRUD operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from datetime import date
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Invoice, InvoiceItem, Party


async def get_by_id(
    db: AsyncSession, invoice_id: uuid.UUID, load_items: bool = False
) -> Optional[Invoice]:
    query = select(Invoice).where(
        Invoice.id == invoice_id, Invoice.is_deleted == False
    )
    if load_items:
        query = query.options(
            selectinload(Invoice.items),
            selectinload(Invoice.party),
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
) -> tuple[List[Invoice], int]:
    query = select(Invoice).where(
        Invoice.party_type == party_type,
        Invoice.is_deleted == False,
    )

    if party_id:
        query = query.where(Invoice.party_id == party_id)
    if from_date:
        query = query.where(Invoice.invoice_date >= from_date)
    if to_date:
        query = query.where(Invoice.invoice_date <= to_date)
    if search_q:
        query = query.join(Party, Party.id == Invoice.party_id).where(
            or_(
                Invoice.invoice_number.ilike(f"%{search_q}%"),
                Party.name.ilike(f"%{search_q}%"),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    count_res = await db.execute(count_query)
    total = count_res.scalar() or 0

    query = (
        query.options(selectinload(Invoice.party))
        .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    res = await db.execute(query)
    return list(res.scalars().all()), total


async def create(db: AsyncSession, **kwargs) -> Invoice:
    invoice = Invoice(**kwargs)
    db.add(invoice)
    await db.flush()
    return invoice


async def create_item(db: AsyncSession, **kwargs) -> InvoiceItem:
    item = InvoiceItem(**kwargs)
    db.add(item)
    await db.flush()
    return item


async def delete_items(db: AsyncSession, invoice: Invoice):
    """Delete all items for an invoice."""
    for item in list(invoice.items):
        await db.delete(item)
    await db.flush()


async def update(db: AsyncSession, invoice: Invoice) -> Invoice:
    db.add(invoice)
    await db.flush()
    return invoice


async def delete(db: AsyncSession, invoice: Invoice):
    await db.delete(invoice)
    await db.flush()
