"""
backend/app/services/accounting.py — Backward compatibility shim.

All real logic lives in ledger_service.py now. This module re-exports
everything so existing imports (`from backend.app.services.accounting import ...`)
continue to work without modification.
"""

from backend.app.services.ledger_service import (  # noqa: F401
    d,
    to_float,
    next_invoice_number,
    next_return_number,
    recalculate_party_balance,
    recalculate_customer_ledger,
    get_customer_ledger_summary,
)
