"""
backend/app/api/endpoints/products.py — Products API endpoints.

Thin API router: validates request, calls the ProductService, and returns response.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_current_user, RoleChecker
from app.models.models import User
from app.schemas.schemas import ProductCreate, ProductUpdate
from app.services import product_service

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("/")
async def list_products(
    party_type: str = "customer",
    q: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await product_service.list_products(
        db, party_type=party_type, search_q=q
    )


@router.post("/", status_code=201)
async def create_product(
    payload: ProductCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await product_service.create_product(
            db, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        status_code = status.HTTP_400_BAD_REQUEST
        if "already exists" in str(e):
            status_code = status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/{pid}")
async def delete_product(
    pid: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await product_service.delete_product(
            db, pid, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{pid}")
async def update_product(
    pid: uuid.UUID,
    payload: ProductUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await product_service.update_product(
            db, pid, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

