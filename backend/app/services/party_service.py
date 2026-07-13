"""
backend/app/services/party_service.py — Party business logic layer.

Coordinates database calls through repositories, executes calculations,
and triggers audit logging. Thin API routes call this service.
"""

import uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.models import Party
from backend.app.schemas.schemas import PartyCreate, PartyUpdate
from backend.app.repositories import party_repository, audit_repository
from backend.app.services.ledger_service import (
    to_float,
    d,
    recalculate_party_balance,
    get_customer_ledger_summary,
)


def party_to_dict(p: Party) -> dict:
    """Serialize a Party ORM object to a frontend-compatible dict."""
    return {
        "id": str(p.id),
        "party_type": p.party_type,
        "name": p.name,
        "mobile": p.mobile or "",
        "mobile2": p.mobile2 or "",
        "address": p.address or "",
        "city": p.city or "",
        "gstin": p.gstin or "",
        "email": p.email or "",
        "opening_balance": to_float(p.opening_balance),
        "balance": to_float(p.balance),
        "is_active": p.is_active,
        "notes": p.notes or "",
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


async def list_parties(
    db: AsyncSession,
    party_type: str,
    search_q: str = "",
    status_filter: Optional[str] = None,
) -> List[dict]:
    parties = await party_repository.list_filtered(
        db, party_type=party_type, search_q=search_q, status_filter=status_filter
    )
    return [party_to_dict(p) for p in parties]


async def get_party(db: AsyncSession, pid: uuid.UUID) -> dict:
    party = await party_repository.get_by_id(db, pid)
    if not party:
        raise ValueError("Party not found")
    return party_to_dict(party)


async def create_party(
    db: AsyncSession,
    payload: PartyCreate,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    name = payload.name.strip().upper()
    party_type = payload.party_type.strip().lower()

    if not name:
        raise ValueError("Name is required")
    if party_type not in ("customer", "shoper"):
        raise ValueError("Invalid party_type")

    # Check if active party exists with same name & type
    existing = await party_repository.check_duplicate(db, name, party_type)
    if existing:
        raise ValueError("Party already exists")

    opening = d(payload.opening_balance)

    party = await party_repository.create(
        db,
        party_type=party_type,
        name=name,
        mobile=payload.mobile.strip() if payload.mobile else None,
        mobile2=payload.mobile2.strip() if payload.mobile2 else None,
        address=payload.address.strip() if payload.address else None,
        city=payload.city.strip() if payload.city else None,
        gstin=payload.gstin.strip() if payload.gstin else None,
        email=payload.email.strip() if payload.email else None,
        opening_balance=opening,
        balance=opening,
        notes=payload.notes.strip() if payload.notes else None,
        is_active=True,
    )
    # Recalculate ledger balance (even if opening is 0, ensures consistency)
    await recalculate_party_balance(db, party.id)

    serialized = party_to_dict(party)

    await audit_repository.create(
        db=db,
        action="create_party",
        table_name="parties",
        record_id=party.id,
        new_values=serialized,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return serialized


async def update_party(
    db: AsyncSession,
    pid: uuid.UUID,
    payload: PartyUpdate,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    party = await party_repository.get_by_id(db, pid)
    if not party:
        raise ValueError("Party not found")

    name = payload.name.strip().upper()
    if not name:
        raise ValueError("Name cannot be empty")

    old_values = party_to_dict(party)

    party.name = name
    party.mobile = payload.mobile.strip() if payload.mobile else None
    party.mobile2 = payload.mobile2.strip() if payload.mobile2 else None
    party.address = payload.address.strip() if payload.address else None
    party.city = payload.city.strip() if payload.city else None
    party.gstin = payload.gstin.strip() if payload.gstin else None
    party.email = payload.email.strip() if payload.email else None
    party.notes = payload.notes.strip() if payload.notes else None

    old_opening = d(party.opening_balance)
    new_opening = d(payload.opening_balance)

    if old_opening != new_opening:
        party.opening_balance = new_opening
        await party_repository.update(db, party)
        # Recalculate since opening balance changed
        await recalculate_party_balance(db, party.id)
    else:
        await party_repository.update(db, party)

    new_values = party_to_dict(party)

    await audit_repository.create(
        db=db,
        action="update_party",
        table_name="parties",
        record_id=party.id,
        old_values=old_values,
        new_values=new_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return new_values


async def delete_party(
    db: AsyncSession,
    pid: uuid.UUID,
    user_id: uuid.UUID,
    username: str,
) -> dict:
    party = await party_repository.get_by_id(db, pid)
    if not party:
        raise ValueError("Party not found")

    old_values = party_to_dict(party)
    await party_repository.soft_delete(db, party)

    await audit_repository.create(
        db=db,
        action="delete_party",
        table_name="parties",
        record_id=party.id,
        old_values=old_values,
        user_id=user_id,
        username=username,
    )
    await db.commit()
    return {
        "ok": True,
        "message": "Party hidden from listings. All transaction history has been preserved.",
    }


async def get_party_summary(db: AsyncSession, pid: uuid.UUID) -> dict:
    party = await party_repository.get_by_id(db, pid)
    if not party:
        raise ValueError("Party not found")

    # Always recalculate before reading, so summary is fresh
    await recalculate_party_balance(db, pid)
    await db.commit()

    summary = await get_customer_ledger_summary(db, pid)
    summary["party"] = party_to_dict(party)
    return summary


async def get_party_stats(db: AsyncSession, party_type: str) -> dict:
    if party_type not in ("customer", "shoper"):
        raise ValueError("Invalid party_type")

    stats = await party_repository.get_stats(db, party_type)

    # Fetch top 10 pending parties
    parties = await party_repository.list_filtered(
        db, party_type=party_type, status_filter="pending"
    )
    # Sort by balance descending, limit to 10
    parties_sorted = sorted(parties, key=lambda p: p.balance, reverse=True)[:10]

    return {
        "total": stats["total_parties"],
        "pending": stats["pending_count"],
        "advance": stats["advance_count"],
        "clear": stats["clear_count"],
        "total_pending_amount": stats["total_pending"],
        "total_advance_amount": stats["total_advance"],
        "net_outstanding": stats["net_outstanding"],
        "top_pending": [party_to_dict(p) for p in parties_sorted],
    }
