"""
Repository for AuditLog operations.
Pure database access — no business logic here.
"""

import uuid
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AuditLog


async def create(
    db: AsyncSession,
    action: str,
    table_name: str,
    record_id: Optional[uuid.UUID] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    user_id: Optional[uuid.UUID] = None,
    username: Optional[str] = None,
) -> AuditLog:
    audit = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        table_name=table_name,
        record_id=record_id,
        old_values=old_values,
        new_values=new_values,
    )
    db.add(audit)
    await db.flush()
    return audit


async def list_paginated(
    db: AsyncSession,
    action: Optional[str] = None,
    table_name: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
) -> tuple[List[AuditLog], int]:
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)
    if table_name:
        query = query.where(AuditLog.table_name == table_name)

    count_query = select(func.count()).select_from(query.subquery())
    count_res = await db.execute(count_query)
    total = count_res.scalar() or 0

    query = (
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    res = await db.execute(query)
    return list(res.scalars().all()), total
