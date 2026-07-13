"""
backend/app/services/dashboard_service.py — Dashboard business logic layer.

Coordinates database calls through party and ledger repositories.
Thin API routes call this service.
"""

from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from sqlalchemy.orm import selectinload

from backend.app.models.models import Party, LedgerEntry
from backend.app.services.party_service import party_to_dict
from backend.app.services.ledger_service import entry_to_dict


async def get_dashboard(
    db: AsyncSession,
    party_type: str,
    year: int,
) -> dict:
    # 1. KPI Counts
    base_q = select(Party).where(
        Party.party_type == party_type,
        Party.is_active == True,
        Party.is_deleted == False,
    )

    # Total parties
    total_parties_res = await db.execute(
        select(func.count()).select_from(base_q.subquery())
    )
    total_parties = total_parties_res.scalar() or 0

    # Pending count (balance > 0)
    pending_count_res = await db.execute(
        select(func.count()).select_from(base_q.where(Party.balance > 0).subquery())
    )
    pending_count = pending_count_res.scalar() or 0

    # Advance count (balance < 0)
    advance_count_res = await db.execute(
        select(func.count()).select_from(base_q.where(Party.balance < 0).subquery())
    )
    advance_count = advance_count_res.scalar() or 0

    # Clear count (balance == 0)
    clear_count_res = await db.execute(
        select(func.count()).select_from(base_q.where(Party.balance == 0).subquery())
    )
    clear_count = clear_count_res.scalar() or 0

    # Total Pending amount
    total_pending_res = await db.execute(
        select(func.coalesce(func.sum(Party.balance), 0)).where(
            Party.party_type == party_type,
            Party.is_active == True,
            Party.is_deleted == False,
            Party.balance > 0,
        )
    )
    total_pending = float(total_pending_res.scalar() or 0)

    # Total Advance amount
    total_advance_res = await db.execute(
        select(func.coalesce(func.sum(Party.balance), 0)).where(
            Party.party_type == party_type,
            Party.is_active == True,
            Party.is_deleted == False,
            Party.balance < 0,
        )
    )
    total_advance = abs(float(total_advance_res.scalar() or 0))
    net_outstanding = total_pending - total_advance

    # 2. Today's stats
    today_val = date.today()

    # Today Sales
    today_sales_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.debit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "sale",
            LedgerEntry.entry_date == today_val,
            LedgerEntry.is_deleted == False,
        )
    )
    today_sales = float(today_sales_res.scalar() or 0)

    # Today Collections
    today_coll_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.credit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_received")),
            LedgerEntry.entry_date == today_val,
            LedgerEntry.is_deleted == False,
        )
    )
    today_collections = float(today_coll_res.scalar() or 0)

    # Today Returns
    today_ret_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.credit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "return",
            LedgerEntry.entry_date == today_val,
            LedgerEntry.is_deleted == False,
        )
    )
    today_returns = float(today_ret_res.scalar() or 0)

    # Total Returns
    total_ret_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.credit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "return",
            LedgerEntry.is_deleted == False,
        )
    )
    total_returns = float(total_ret_res.scalar() or 0)

    # Cash Received (credit payment/advance today with cash mode)
    today_cash_rec_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.credit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_received")),
            LedgerEntry.payment_mode == "cash",
            LedgerEntry.entry_date == today_val,
            LedgerEntry.is_deleted == False,
        )
    )
    today_cash_received = float(today_cash_rec_res.scalar() or 0)

    # Cash Given (debit payment/advance today with cash mode)
    today_cash_giv_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.debit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_paid")),
            LedgerEntry.payment_mode == "cash",
            LedgerEntry.entry_date == today_val,
            LedgerEntry.is_deleted == False,
        )
    )
    today_cash_given = float(today_cash_giv_res.scalar() or 0)

    # Net Collections (all-time credit payments/advances - all-time debit payments/advances)
    total_coll_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.credit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_received")),
            LedgerEntry.is_deleted == False,
        )
    )
    total_collections = float(total_coll_res.scalar() or 0)

    total_payments_given_res = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.debit), 0))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_paid")),
            LedgerEntry.is_deleted == False,
        )
    )
    total_payments_given = float(total_payments_given_res.scalar() or 0)
    net_collections = total_collections - total_payments_given

    # Counts for Business Summary and Card Subtitles
    invoices_count_res = await db.execute(
        select(func.count(LedgerEntry.id))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "sale",
            LedgerEntry.is_deleted == False
        )
    )
    total_invoices_count = invoices_count_res.scalar() or 0

    returns_count_res = await db.execute(
        select(func.count(LedgerEntry.id))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "return",
            LedgerEntry.is_deleted == False
        )
    )
    total_returns_count = returns_count_res.scalar() or 0

    pmt_rec_count_res = await db.execute(
        select(func.count(LedgerEntry.id))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_received")),
            LedgerEntry.is_deleted == False
        )
    )
    total_payments_received_count = pmt_rec_count_res.scalar() or 0

    pmt_giv_count_res = await db.execute(
        select(func.count(LedgerEntry.id))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_paid")),
            LedgerEntry.is_deleted == False
        )
    )
    total_payments_given_count = pmt_giv_count_res.scalar() or 0

    today_sales_count_res = await db.execute(
        select(func.count(LedgerEntry.id))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "sale",
            LedgerEntry.entry_date == today_val,
            LedgerEntry.is_deleted == False
        )
    )
    today_sales_count = today_sales_count_res.scalar() or 0

    today_collections_count_res = await db.execute(
        select(func.count(LedgerEntry.id))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_received")),
            LedgerEntry.entry_date == today_val,
            LedgerEntry.is_deleted == False
        )
    )
    today_collections_count = today_collections_count_res.scalar() or 0

    # 3. Monthly Chart Data
    sales_rows_res = await db.execute(
        select(
            extract("month", LedgerEntry.entry_date).label("m"),
            func.coalesce(func.sum(LedgerEntry.debit), 0).label("total"),
        )
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "sale",
            extract("year", LedgerEntry.entry_date) == year,
            LedgerEntry.is_deleted == False,
        )
        .group_by("m")
    )
    sales_rows = sales_rows_res.all()

    coll_rows_res = await db.execute(
        select(
            extract("month", LedgerEntry.entry_date).label("m"),
            func.coalesce(func.sum(LedgerEntry.credit), 0).label("total"),
        )
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_received")),
            extract("year", LedgerEntry.entry_date) == year,
            LedgerEntry.is_deleted == False,
        )
        .group_by("m")
    )
    coll_rows = coll_rows_res.all()

    payments_given_rows_res = await db.execute(
        select(
            extract("month", LedgerEntry.entry_date).label("m"),
            func.coalesce(func.sum(LedgerEntry.debit), 0).label("total"),
        )
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type.in_(("payment", "advance_paid")),
            extract("year", LedgerEntry.entry_date) == year,
            LedgerEntry.is_deleted == False,
        )
        .group_by("m")
    )
    payments_given_rows = payments_given_rows_res.all()

    return_rows_res = await db.execute(
        select(
            extract("month", LedgerEntry.entry_date).label("m"),
            func.coalesce(func.sum(LedgerEntry.credit), 0).label("total"),
        )
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(
            Party.party_type == party_type,
            LedgerEntry.entry_type == "return",
            extract("year", LedgerEntry.entry_date) == year,
            LedgerEntry.is_deleted == False,
        )
        .group_by("m")
    )
    return_rows = return_rows_res.all()

    sales_map = {int(r[0]): float(r[1]) for r in sales_rows}
    coll_map = {int(r[0]): float(r[1]) for r in coll_rows}
    payments_given_map = {int(r[0]): float(r[1]) for r in payments_given_rows}
    return_map = {int(r[0]): float(r[1]) for r in return_rows}

    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    sales_arr = [sales_map.get(i, 0) for i in range(1, 13)]
    returns_arr = [return_map.get(i, 0) for i in range(1, 13)]
    coll_arr = [coll_map.get(i, 0) for i in range(1, 13)]
    payments_given_arr = [payments_given_map.get(i, 0) for i in range(1, 13)]

    # 4. Top 10 Pending Parties
    top10_res = await db.execute(
        select(Party)
        .where(
            Party.party_type == party_type,
            Party.is_active == True,
            Party.is_deleted == False,
            Party.balance > 0,
        )
        .order_by(Party.balance.desc())
        .limit(10)
    )
    top10 = top10_res.scalars().all()

    # 5. Recent 15 Ledger Entries
    recent_res = await db.execute(
        select(LedgerEntry)
        .options(selectinload(LedgerEntry.party))
        .join(Party, Party.id == LedgerEntry.party_id)
        .where(Party.party_type == party_type, LedgerEntry.is_deleted == False)
        .order_by(
            LedgerEntry.entry_date.desc(),
            LedgerEntry.created_at.desc(),
            LedgerEntry.id.desc(),
        )
        .limit(15)
    )
    recent = recent_res.scalars().all()

    recent_list = []
    for e in recent:
        d_dict = entry_to_dict(e)
        d_dict["party_name"] = e.party.name if e.party else ""
        recent_list.append(d_dict)

    portfolio = {"pending": pending_count, "advance": advance_count, "clear": clear_count}

    return {
        "kpi": {
            "total_parties": total_parties,
            "pending_count": pending_count,
            "advance_count": advance_count,
            "clear_count": clear_count,
            "total_pending": total_pending,
            "total_advance": total_advance,
            "net_outstanding": net_outstanding,
            "today_sales": today_sales,
            "today_collections": today_collections,
            "today_returns": today_returns,
            "total_returns": total_returns,
            "today_cash_received": today_cash_received,
            "today_cash_given": today_cash_given,
            "net_collections": net_collections,
            "total_invoices_count": total_invoices_count,
            "total_returns_count": total_returns_count,
            "total_payments_received_count": total_payments_received_count,
            "total_payments_given_count": total_payments_given_count,
            "today_sales_count": today_sales_count,
            "today_collections_count": today_collections_count,
        },
        "charts": {
            "months": months,
            "sales": sales_arr,
            "returns": returns_arr,
            "collections": coll_arr,
            "payments_given": payments_given_arr,
        },
        "top_pending": [party_to_dict(p) for p in top10],
        "recent_transactions": recent_list,
        "portfolio": portfolio,
    }
