"""
backend/app/api/endpoints/parties.py — Parties API endpoints.

Thin API router: validates request, calls the PartyService, and returns response.
"""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.dependencies import get_db, get_current_user, RoleChecker
from backend.app.models.models import User
from backend.app.schemas.schemas import PartyCreate, PartyUpdate
from backend.app.services import party_service

router = APIRouter(prefix="/api/parties", tags=["parties"])


@router.get("/")
async def list_parties(
    type: str = "customer",
    q: str = "",
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    party_type = type.strip().lower()
    search_q = q.strip()
    return await party_service.list_parties(
        db, party_type=party_type, search_q=search_q, status_filter=status_filter
    )


@router.get("/stats")
async def get_party_stats(
    type: str = "customer",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await party_service.get_party_stats(db, type.strip().lower())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{pid}")
async def get_party(
    pid: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await party_service.get_party(db, pid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/", status_code=201)
async def create_party(
    payload: PartyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await party_service.create_party(
            db, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        # Check if it was a duplicate party conflict (409) or bad request (400)
        status_code = status.HTTP_400_BAD_REQUEST
        if "already exists" in str(e):
            status_code = status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=str(e))


@router.put("/{pid}")
async def update_party(
    pid: uuid.UUID,
    payload: PartyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await party_service.update_party(
            db, pid, payload, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{pid}")
async def delete_party(
    pid: uuid.UUID,
    current_user: User = Depends(RoleChecker(["admin", "owner", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await party_service.delete_party(
            db, pid, user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{pid}/summary")
async def get_party_summary(
    pid: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await party_service.get_party_summary(db, pid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
