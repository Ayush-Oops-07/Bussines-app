"""
backend/app/api/endpoints/audit.py — Audit logs API endpoints.

Thin API router: validates request, calls the AuditService, and returns response.
"""

from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, RoleChecker
from app.models.models import User
from app.services import audit as audit_service

router = APIRouter(prefix="/api/admin/audit-logs", tags=["audit"])


@router.get("/")
async def list_audit_logs(
    action: Optional[str] = None,
    table_name: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
    current_user: User = Depends(RoleChecker(["admin", "owner"])),
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    per_page = min(100, max(1, per_page))
    return await audit_service.list_audit_logs(
        db, action=action, table_name=table_name, page=page, per_page=per_page
    )
