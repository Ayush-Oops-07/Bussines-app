"""
backend/app/api/endpoints/returns.py — Purchase Returns API endpoints.

Thin API router: validates request, calls the ReturnService, and returns response.
"""

import uuid
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.dependencies import get_db, get_current_user, RoleChecker
from backend.app.models.models import User
from backend.app.schemas.schemas import PurchaseReturnCreate
from backend.app.services import return_service

router = APIRouter(prefix="/api/returns", tags=["returns"])


@router.get("/")
async def list_returns(
    party_id: Optional[uuid.UUID] = None,
    party_type: str = "customer",
    page: int = 1,
    per_page: int = 20,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    q: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    per_page = min(50, per_page)
    return await return_service.list_returns(
        db,
        party_type=party_type.strip().lower(),
        party_id=party_id,
        q=q.strip(),
        from_date=from_date,
        to_date=to_date,
        page=page,
        per_page=per_page,
    )


@router.get("/{return_id}")
async def get_return(
    return_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await return_service.get_return(db, return_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/", status_code=201)
async def create_return(
    payload: PurchaseReturnCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await return_service.create_return(
            db, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        status_code = 400
        if "Party not found" in str(e) or "Sales Invoice not found" in str(e):
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.put("/{return_id}")
async def update_return(
    return_id: uuid.UUID,
    payload: PurchaseReturnCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await return_service.update_return(
            db,
            return_id=return_id,
            payload=payload,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        status_code = 400
        if "return invoice not found" in str(e).lower() or "party not found" in str(e).lower():
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.post("/{return_id}/cancel")
async def cancel_return(
    return_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await return_service.cancel_return(
            db, return_id=return_id, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        status_code = 400
        if "Return invoice not found" in str(e):
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/{return_id}")
async def delete_return(
    return_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await return_service.delete_return(
            db, return_id=return_id, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
