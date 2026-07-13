"""
backend/app/core/dependencies.py — Shared FastAPI dependencies.

Centralizes common dependencies (DB session, auth, pagination) so
endpoint files can import from a single location.
"""

from typing import Optional
from fastapi import Query

from backend.app.db.session import get_db  # noqa: F401 — re-export
from backend.app.security.auth import get_current_user, RoleChecker  # noqa: F401


class PaginationParams:
    """Reusable pagination dependency for list endpoints."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number (1-indexed)"),
        per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    ):
        self.page = page
        self.per_page = per_page
        self.offset = (page - 1) * per_page
