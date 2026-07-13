"""
backend/app/db/seed.py — Seed default users and products on first startup.
"""

import logging
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import User, Product
from app.security.auth import get_password_hash
from app.core.config import settings

logger = logging.getLogger("sandeep-traders.seed")

DEFAULT_USERS = [
    ("admin",   "Ayush@841440",  "Admin",   "admin"),
    ("mandeep", "Thawe@841440",  "Mandeep", "staff"),
    ("sandeep", "Thawe@841440",  "Sandeep", "owner"),
]

DEFAULT_PRODUCTS = [
    "NUVOCO CEMENT", "NUVOCO UNO CEMENT", "DALMIA CEMENT", "KONARK CEMENT",
    "DSP CEMENT", "SATNA CEMENT", "UNIQUE CEMENT", "PRISM CEMENT",
    "BALMUKUND TMT 8MM", "BALMUKUND TMT 10MM", "BALMUKUND TMT 12MM", "BALMUKUND TMT 16MM",
    "KAMDHENU TMT 8MM", "KAMDHENU TMT 10MM", "KAMDHENU TMT 12MM", "KAMDHENU TMT 16MM",
    "BALMUKUND TMT 10MM/12MM/16MM", "KAMDHENU TMT 10MM/12MM/16MM",
    "COIL", "TAR", "KATI", "TENT PIPE", "RING", "RING MAJDURI", "WATER PIPE",
    "KARKAT 8'", "KARKAT 6'", "KARKAT 10'", "KARKAT 12'",
    "TINA 8'", "TINA 10'", "TINA 12'",
    "BALU", "UJALA BALU", "G GITI", "P GITI", "JIRA GITI",
    "COVER BLOCK", "COVER BLOCK BORA",
    "DESIGN FOM 1 INCH", "DESIGN FOM 1.5 INCH", "DESIGN FOM 2 INCH",
    "FRIGHT", "POLDARI", "RETURN FRIGHT", "RETURN POLDARI",
    "TOTAL BACK DUE", "TOTAL PURJA", "GAMALA", "KATA BRUSH",
]


async def seed_defaults(db: AsyncSession):
    """Seed default users and products if not already present."""
    try:
        # 1. Seed Users (only in development)
        if settings.ENVIRONMENT == "development":
            user_count_res = await db.execute(select(func.count(User.id)))
            user_count = user_count_res.scalar() or 0

            if user_count == 0:
                for username, password, full_name, role in DEFAULT_USERS:
                    db.add(User(
                        username=username,
                        password_hash=get_password_hash(password),
                        full_name=full_name,
                        role=role,
                        is_active=True
                    ))
                await db.flush()
                logger.info("Default users seeded.")
        else:
            logger.info("Non-development environment detected; skipping default user seeding.")

        # 2. Seed Products
        for party_type in ("customer", "shoper"):
            existing_res = await db.execute(
                select(Product.name).where(
                    Product.party_type == party_type,
                    Product.is_deleted == False
                )
            )
            existing_names = {r[0] for r in existing_res.all()}

            added = 0
            for name in DEFAULT_PRODUCTS:
                name_clean = name.strip().upper()
                if name_clean not in existing_names:
                    db.add(Product(
                        name=name_clean,
                        party_type=party_type,
                        is_active=True
                    ))
                    added += 1
            if added > 0:
                await db.flush()
                logger.info(f"Seeded {added} products for party_type={party_type}.")

        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Seed error: {e}")
