"""
backend/app/api/endpoints/payments.py — Payments API endpoints.

Thin API router: validates request, calls the PaymentService, and returns response.
"""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.dependencies import get_db, get_current_user, RoleChecker
from backend.app.models.models import User
from backend.app.schemas.schemas import PaymentTransactionCreate
from backend.app.services import payment_service

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("/")
async def list_payments(
    customer_id: Optional[uuid.UUID] = None,
    payment_type: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    limit = min(max(1, limit), 200)
    return await payment_service.list_payments(
        db, customer_id=customer_id, payment_type=payment_type, limit=limit
    )


@router.post("/", status_code=201)
async def create_payment(
    payload: PaymentTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await payment_service.create_payment(
            db, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        status_code = 400
        if "Customer not found" in str(e):
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.put("/{txn_id}")
async def update_payment(
    txn_id: uuid.UUID,
    payload: PaymentTransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await payment_service.update_payment(
            db,
            txn_id=txn_id,
            payload=payload,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        status_code = 400
        if "transaction not found" in str(e).lower() or "customer not found" in str(e).lower():
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/{txn_id}")
async def delete_payment(
    txn_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await payment_service.delete_payment(
            db, txn_id=txn_id, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
