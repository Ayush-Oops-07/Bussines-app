"""
backend/app/api/endpoints/adjustments.py — Invoice Adjustments API endpoints.

Thin API router: validates request, calls the AdjustmentService, and returns response.
"""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_current_user, RoleChecker
from app.models.models import User
from app.schemas.schemas import InvoiceAdjustmentCreate
from app.services import adjustment_service

router = APIRouter(prefix="/api/adjustments", tags=["adjustments"])


@router.get("/")
async def list_adjustments(
    party_id: Optional[uuid.UUID] = None,
    invoice_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await adjustment_service.list_adjustments(
        db, party_id=party_id, invoice_id=invoice_id
    )


@router.post("/", status_code=201)
async def create_adjustment(
    payload: InvoiceAdjustmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await adjustment_service.create_adjustment(
            db, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        status_code = 400
        if "not found" in str(e).lower():
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/{adj_id}")
async def delete_adjustment(
    adj_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await adjustment_service.delete_adjustment(
            db, adj_id=adj_id, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
