"""
backend/app/api/endpoints/dashboard.py — Dashboard API endpoints.

Thin API router: validates request, calls the DashboardService, and returns response.
"""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_current_user
from app.models.models import User
from app.services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/")
async def get_dashboard(
    type: str = "customer",
    year: int = date.today().year,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_dashboard(
        db, party_type=type.strip().lower(), year=year
    )
