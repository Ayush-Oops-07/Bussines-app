"""
Repository for Product CRUD operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Product, PurchaseReturn, PurchaseReturnItem


async def get_by_id(db: AsyncSession, product_id: uuid.UUID) -> Optional[Product]:
    res = await db.execute(
        select(Product).where(Product.id == product_id, Product.is_deleted == False)
    )
    return res.scalars().first()


async def find_by_name_and_type(
    db: AsyncSession, name: str, party_type: str, include_inactive: bool = False
) -> Optional[Product]:
    query = select(Product).where(
        Product.name == name,
        Product.party_type == party_type,
        Product.is_deleted == False,
    )
    if not include_inactive:
        query = query.where(Product.is_active == True)
    res = await db.execute(query)
    return res.scalars().first()


async def find_inactive(
    db: AsyncSession, name: str, party_type: str
) -> Optional[Product]:
    """Find an inactive (but not deleted) product for reactivation."""
    res = await db.execute(
        select(Product).where(
            Product.name == name,
            Product.party_type == party_type,
            Product.is_active == False,
            Product.is_deleted == False,
        )
    )
    return res.scalars().first()


async def list_filtered(
    db: AsyncSession,
    party_type: str,
    search_q: str = "",
    limit: int = 50,
) -> List[Product]:
    query = select(Product).where(
        Product.is_active == True,
        Product.is_deleted == False,
    )
    if party_type in ("customer", "shoper"):
        query = query.where(Product.party_type == party_type)
    else:
        query = query.where(Product.party_type == "customer")

    if search_q:
        query = query.where(Product.name.ilike(f"%{search_q}%"))

    query = query.order_by(Product.name.asc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_return_stats(db: AsyncSession, party_type: str) -> dict:
    """Return stats for products (total returned qty, last date)."""
    returns_query = (
        select(
            PurchaseReturnItem.product_name,
            func.sum(PurchaseReturnItem.quantity).label("total_qty"),
            func.max(PurchaseReturn.return_date).label("last_date"),
        )
        .join(PurchaseReturn, PurchaseReturn.id == PurchaseReturnItem.purchase_return_id)
        .where(
            PurchaseReturn.party_type == party_type,
            PurchaseReturn.is_cancelled == False,
            PurchaseReturn.is_deleted == False,
        )
        .group_by(PurchaseReturnItem.product_name)
    )
    returns_res = await db.execute(returns_query)
    stats_map = {}
    for r in returns_res.all():
        stats_map[r[0]] = (float(r[1] or 0), r[2].isoformat() if r[2] else None)
    return stats_map


async def create(db: AsyncSession, **kwargs) -> Product:
    product = Product(**kwargs)
    db.add(product)
    await db.flush()
    return product


async def update(db: AsyncSession, product: Product) -> Product:
    db.add(product)
    await db.flush()
    return product


async def soft_delete(db: AsyncSession, product: Product) -> Product:
    product.is_active = False
    product.is_deleted = True
    product.deleted_at = datetime.utcnow()
    db.add(product)
    await db.flush()
    return product
