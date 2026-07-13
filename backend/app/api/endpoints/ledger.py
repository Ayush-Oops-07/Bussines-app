"""
backend/app/api/endpoints/ledger.py — Ledger API endpoints.

Thin API router: validates request, calls the LedgerService, and returns response.
"""

import uuid
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.dependencies import get_db, get_current_user, RoleChecker
from backend.app.models.models import User
from backend.app.services import ledger_service

router = APIRouter(prefix="/api/ledger", tags=["ledger"])


@router.get("/{party_id}")
async def get_ledger(
    party_id: uuid.UUID,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    q: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ledger_service.get_ledger(
            db, party_id=party_id, from_date=from_date, to_date=to_date, search_q=q
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/payment", status_code=201)
async def add_payment(
    party_id: uuid.UUID,
    amount: float,
    payment_mode: str = "cash",
    particulars: str = "Payment Received",
    date_val: date = Query(..., alias="date"),
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ledger_service.add_payment(
            db,
            party_id=party_id,
            amount=amount,
            payment_mode=payment_mode,
            particulars=particulars,
            date_val=date_val,
            notes=notes,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/debit", status_code=201)
async def add_debit(
    party_id: uuid.UUID,
    amount: float,
    particulars: str = "Debit Entry",
    date_val: date = Query(..., alias="date"),
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ledger_service.add_debit(
            db,
            party_id=party_id,
            amount=amount,
            particulars=particulars,
            date_val=date_val,
            notes=notes,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{entry_id}")
async def update_entry(
    entry_id: uuid.UUID,
    particulars: Optional[str] = None,
    date_val: Optional[date] = Query(None, alias="date"),
    notes: Optional[str] = None,
    payment_mode: Optional[str] = None,
    amount: Optional[float] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ledger_service.update_entry(
            db,
            entry_id=entry_id,
            particulars=particulars,
            date_val=date_val,
            notes=notes,
            payment_mode=payment_mode,
            amount=amount,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        status_code = 400
        if "Entry not found" in str(e):
            status_code = 404
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ledger_service.delete_entry(
            db, entry_id=entry_id, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/monthly-summary/chart")
async def monthly_summary(
    type: str = "customer",
    year: int = date.today().year,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await ledger_service.get_monthly_summary(db, party_type=type.strip().lower(), year=year)


@router.get("/recent/list")
async def recent_transactions(
    type: str = "customer",
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await ledger_service.get_recent_transactions(
        db, party_type=type.strip().lower(), limit=limit
    )
