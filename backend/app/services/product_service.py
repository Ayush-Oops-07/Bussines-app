"""
backend/app/services/product_service.py — Product business logic layer.

Coordinates database calls through product and audit repositories.
Thin API routes call this service.
"""

import uuid
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Product
from app.schemas.schemas import ProductCreate, ProductUpdate
from app.repositories import product_repository, audit_repository
from app.services.ledger_service import d, to_float


def product_to_dict(p: Product) -> dict:
    """Serialize a Product ORM object to a frontend-compatible dict."""
    return {
        "id": str(p.id),
        "name": p.name or "",
        "default_unit": p.default_unit or "",
        "default_rate": to_float(p.default_rate or 0),
        "stock_qty": None,
        "party_type": p.party_type,
        "is_active": p.is_active,
    }


async def list_products(
    db: AsyncSession, party_type: str, search_q: str = ""
) -> List[dict]:
    party_type = party_type.strip().lower()
    search_q = search_q.strip()

    # 1. Fetch active products matching criteria
    products = await product_repository.list_filtered(
        db, party_type=party_type, search_q=search_q
    )

    # 2. Fetch purchase return stats for these products to preserve Bug #11 fix
    stats_map = await product_repository.get_return_stats(db, party_type)

    response = []
    for p in products:
        stats = stats_map.get(p.name, (0.0, None))
        response.append(
            {
                "id": str(p.id),
                "name": p.name or "",
                "default_unit": p.default_unit or "",
                "default_rate": to_float(p.default_rate or 0),
                "stock_qty": None,
                "party_type": p.party_type,
                "total_returned_qty": stats[0],
                "latest_return_date": stats[1],
            }
        )
    return response


async def create_product(
    db: AsyncSession,
    payload: ProductCreate,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    name = payload.name.strip().upper()
    party_type = payload.party_type.strip().lower()

    if not name:
        raise ValueError("Name required")

    # Check existing active product
    existing = await product_repository.find_by_name_and_type(
        db, name, party_type, include_inactive=False
    )
    if existing:
        raise ValueError("Product already exists")

    # Check inactive product for reactivation (Bug #10 fix)
    inactive = await product_repository.find_inactive(db, name, party_type)
    if inactive:
        inactive.is_active = True
        inactive.default_unit = (
            payload.default_unit.strip() if payload.default_unit else None
        )
        inactive.default_rate = d(payload.default_rate or 0)
        await product_repository.update(db, inactive)

        serialized = {
            "id": str(inactive.id),
            "name": inactive.name,
            "is_active": True,
        }

        await audit_repository.create(
            db=db,
            action="reactivate_product",
            table_name="products",
            record_id=inactive.id,
            new_values=serialized,
            user_id=user_id,
            username=username,
        )
        await db.commit()
        return {"id": str(inactive.id), "name": inactive.name}

    p = await product_repository.create(
        db,
        name=name,
        party_type=party_type,
        default_unit=payload.default_unit.strip() if payload.default_unit else None,
        default_rate=d(payload.default_rate or 0),
    )

    await audit_repository.create(
        db=db,
        action="create_product",
        table_name="products",
        record_id=p.id,
        new_values={
            "id": str(p.id),
            "name": p.name,
            "party_type": p.party_type,
        },
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {"id": str(p.id), "name": p.name}


async def delete_product(
    db: AsyncSession,
    pid: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    p = await product_repository.get_by_id(db, pid)
    if not p:
        raise ValueError("Product not found")

    old_values = {"id": str(p.id), "name": p.name}
    await product_repository.soft_delete(db, p)

    await audit_repository.create(
        db=db,
        action="delete_product",
        table_name="products",
        record_id=p.id,
        old_values=old_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {"ok": True}


async def update_product(
    db: AsyncSession,
    pid: uuid.UUID,
    payload: ProductUpdate,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    p = await product_repository.get_by_id(db, pid)
    if not p:
        raise ValueError("Product not found")

    old_name = p.name
    new_name = payload.name.strip().upper()

    if new_name != old_name:
        existing = await product_repository.find_by_name_and_type(
            db, new_name, p.party_type, include_inactive=False
        )
        if existing and existing.id != pid:
            raise ValueError("Another product with this name already exists")

    old_values = {
        "id": str(p.id),
        "name": p.name,
        "default_unit": p.default_unit,
        "default_rate": to_float(p.default_rate or 0),
        "is_active": p.is_active,
    }

    p.name = new_name
    p.default_unit = payload.default_unit.strip() if payload.default_unit else None
    p.default_rate = d(payload.default_rate or 0)
    p.is_active = payload.is_active

    await product_repository.update(db, p)

    new_values = {
        "id": str(p.id),
        "name": p.name,
        "default_unit": p.default_unit,
        "default_rate": to_float(p.default_rate or 0),
        "is_active": p.is_active,
    }

    await audit_repository.create(
        db=db,
        action="update_product",
        table_name="products",
        record_id=p.id,
        old_values=old_values,
        new_values=new_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return product_to_dict(p)

