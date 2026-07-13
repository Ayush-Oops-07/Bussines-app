"""
backend/app/services/audit.py — Audit logging service.

Provides a centralized service to read and write audit trail records.
"""

import uuid
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AuditLog
from app.repositories import audit_repository


def sanitize_audit_values(values: Optional[dict]) -> Optional[dict]:
    if not values:
        return values
    sanitized = values.copy()
    sensitive_keys = {"password", "password_hash", "old_password", "new_password", "token", "access_token", "refresh_token", "secret", "secret_key"}
    for key in list(sanitized.keys()):
        if any(s in key.lower() for s in sensitive_keys):
            sanitized[key] = "[REDACTED]"
    return sanitized


async def log_action(
    db: AsyncSession,
    action: str,
    table_name: str,
    record_id: Optional[uuid.UUID] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    user_id: Optional[uuid.UUID] = None,
    username: Optional[str] = None,
    ip_address: Optional[str] = None,
    success: bool = True,
) -> AuditLog:
    """Inserts a new entry into the audit_logs table, sanitizing secrets and injecting metadata."""
    clean_old = sanitize_audit_values(old_values)
    clean_new = sanitize_audit_values(new_values)
    
    if clean_new is None:
        clean_new = {}
    
    clean_new["_metadata"] = {
        "ip_address": ip_address,
        "success": success
    }
    
    return await audit_repository.create(
        db=db,
        action=action,
        table_name=table_name,
        record_id=record_id,
        old_values=clean_old,
        new_values=clean_new,
        user_id=user_id,
        username=username,
    )


async def list_audit_logs(
    db: AsyncSession,
    action: Optional[str] = None,
    table_name: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
) -> dict:
    logs, total = await audit_repository.list_paginated(
        db, action=action, table_name=table_name, page=page, per_page=per_page
    )

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "logs": [
            {
                "id": str(log.id),
                "user_id": str(log.user_id) if log.user_id else None,
                "username": log.username,
                "action": log.action,
                "table_name": log.table_name,
                "record_id": str(log.record_id) if log.record_id else None,
                "old_values": log.old_values,
                "new_values": log.new_values,
                "ip_address": log.new_values.get("_metadata", {}).get("ip_address") if isinstance(log.new_values, dict) else None,
                "success": log.new_values.get("_metadata", {}).get("success", True) if isinstance(log.new_values, dict) else True,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }
