"""
backend/app/api/endpoints/invoices.py — Invoices API endpoints.

Thin API router: validates request, calls the InvoiceService, and returns response.
"""

import uuid
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.dependencies import get_db, get_current_user, RoleChecker
from backend.app.models.models import User
from backend.app.schemas.schemas import InvoiceCreate
from backend.app.services import invoice_service

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("/")
async def list_invoices(
    party_type: str = "customer",
    party_id: Optional[uuid.UUID] = None,
    q: str = "",
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    page: int = 1,
    per_page: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    per_page = min(100, max(1, per_page))
    return await invoice_service.list_invoices(
        db,
        party_type=party_type.strip().lower(),
        party_id=party_id,
        q=q.strip(),
        from_date=from_date,
        to_date=to_date,
        page=page,
        per_page=per_page,
    )


@router.get("/{inv_id}")
async def get_invoice(
    inv_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await invoice_service.get_invoice(db, inv_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/", status_code=201)
async def create_invoice(
    payload: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await invoice_service.create_invoice(
            db, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        status_code = 400
        if "Party not found" in str(e):
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.put("/{inv_id}")
async def update_invoice(
    inv_id: uuid.UUID,
    payload: InvoiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await invoice_service.update_invoice(
            db,
            inv_id=inv_id,
            payload=payload,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        status_code = 400
        if "invoice not found" in str(e).lower() or "party not found" in str(e).lower():
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/{inv_id}")
async def delete_invoice(
    inv_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await invoice_service.delete_invoice(
            db, inv_id=inv_id, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{inv_id}/cancel")
async def cancel_invoice(
    inv_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await invoice_service.cancel_invoice(
            db, inv_id=inv_id, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        status_code = 400
        if "Invoice not found" in str(e):
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))
