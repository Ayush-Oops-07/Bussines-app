"""
Repository for SystemSetting key-value store.
Pure database access — no business logic here.
"""

from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.models import SystemSetting


async def get_by_key(db: AsyncSession, key: str) -> Optional[SystemSetting]:
    res = await db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    )
    return res.scalars().one_or_none()


async def upsert(db: AsyncSession, key: str, value: str) -> SystemSetting:
    """Get or create a SystemSetting, updating its value."""
    setting = await get_by_key(db, key)
    if setting is None:
        setting = SystemSetting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
        db.add(setting)
    await db.flush()
    return setting
