import uuid
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Numeric,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
    Enum as SAEnum,
    JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from backend.app.models.base import Base, UUIDModelMixin

# ─────────────────────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────────────────────

MODULE_TYPES = ("customer", "shoper")
ENTRY_TYPES = (
    "sale",
    "payment",
    "debit",
    "credit",
    "opening",
    "advance_received",
    "advance_paid",
    "adjustment",
    "return"
)
PAYMENT_MODES = ("cash", "upi", "bank_transfer", "cheque", "other")
USER_ROLES = ("admin", "owner", "manager", "staff")
PAYMENT_TRANSACTION_TYPES = ("RECEIVED", "GIVEN")
INVOICE_ITEM_TYPES = ("inventory", "service")

_module_type_enum = SAEnum(*MODULE_TYPES, name="module_type")
_entry_type_enum = SAEnum(*ENTRY_TYPES, name="entry_type")
_payment_mode_enum = SAEnum(*PAYMENT_MODES, name="payment_mode")
_user_role_enum = SAEnum(*USER_ROLES, name="user_role")
_payment_txn_type_enum = SAEnum(*PAYMENT_TRANSACTION_TYPES, name="payment_transaction_type")
_invoice_item_type_enum = SAEnum(*INVOICE_ITEM_TYPES, name="invoice_item_type")

# ─────────────────────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────────────────────

class User(Base, UUIDModelMixin):
    __tablename__ = "users"

    username = Column(String(60), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=False, default="")
    role = Column(_user_role_enum, nullable=False, default="staff")
    is_active = Column(Boolean, default=True, nullable=False)
    last_login = Column(DateTime, nullable=True)

class Party(Base, UUIDModelMixin):
    __tablename__ = "parties"

    party_type = Column(_module_type_enum, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    mobile = Column(String(20))
    mobile2 = Column(String(20))
    address = Column(Text)
    city = Column(String(100))
    gstin = Column(String(30))
    email = Column(String(120))
    opening_balance = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    balance = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text)

    # Relationships
    ledger_entries = relationship(
        "LedgerEntry",
        back_populates="party",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="LedgerEntry.entry_date, LedgerEntry.id"
    )

    invoices = relationship(
        "Invoice",
        back_populates="party",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    purchase_returns = relationship(
        "PurchaseReturn",
        back_populates="party",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    __table_args__ = (
        Index("ix_parties_name", "name"),
        Index("ix_parties_type_name", "party_type", "name"),
    )

class Product(Base, UUIDModelMixin):
    __tablename__ = "products"

    party_type = Column(_module_type_enum, nullable=False, default="customer", index=True)
    name = Column(String(200), nullable=False, index=True)
    default_unit = Column(String(40), nullable=True)
    default_rate = Column(Numeric(12, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        Index("ix_products_type_name", "party_type", "name"),
    )

class Invoice(Base, UUIDModelMixin):
    __tablename__ = "invoices"

    invoice_number = Column(String(60), unique=True, nullable=False, index=True)
    party_id = Column(UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    party_type = Column(_module_type_enum, nullable=False)
    invoice_date = Column(Date, nullable=False, default=date.today)
    due_date = Column(Date)
    subtotal = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    discount_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    gst_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    notes = Column(Text)
    is_cancelled = Column(Boolean, default=False, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    party = relationship("Party", back_populates="invoices")
    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceItem.created_at"
    )
    ledger_entry = relationship(
        "LedgerEntry",
        back_populates="invoice",
        foreign_keys="LedgerEntry.invoice_id",
        uselist=False
    )
    purchase_returns = relationship(
        "PurchaseReturn",
        back_populates="reference_invoice",
        cascade="save-update, merge"
    )

class InvoiceItem(Base, UUIDModelMixin):
    __tablename__ = "invoice_items"

    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    unit = Column(String(40))
    quantity = Column(Numeric(12, 3), default=Decimal("0.000"), nullable=False)
    rate = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_pct = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    gst_pct = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    total = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    item_type = Column(String(20), nullable=False, default="bill_item")
    is_manual_total = Column(Boolean, default=False, nullable=False)

    invoice = relationship("Invoice", back_populates="items")

class LedgerEntry(Base, UUIDModelMixin):
    __tablename__ = "ledger_entries"

    party_id = Column(UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    entry_type = Column(_entry_type_enum, nullable=False)
    particulars = Column(String(500), nullable=False, default="")
    debit = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    credit = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    running_balance = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    payment_mode = Column(_payment_mode_enum, nullable=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    purchase_return_id = Column(UUID(as_uuid=True), ForeignKey("purchase_returns.id", ondelete="SET NULL"), nullable=True)
    invoice_number = Column(String(60))
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    party = relationship("Party", back_populates="ledger_entries")
    invoice = relationship("Invoice", back_populates="ledger_entry", foreign_keys=[invoice_id])
    purchase_return = relationship("PurchaseReturn", back_populates="ledger_entry", foreign_keys=[purchase_return_id])

    __table_args__ = (
        Index("ix_ledger_party_date", "party_id", "entry_date"),
    )

class InvoiceAdjustment(Base, UUIDModelMixin):
    __tablename__ = "invoice_adjustments"

    party_id = Column(UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_ledger_entry_id = Column(UUID(as_uuid=True), ForeignKey("ledger_entries.id", ondelete="CASCADE"), nullable=False)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True)
    amount = Column(Numeric(14, 2), nullable=False)
    adjustment_date = Column(Date, nullable=False, default=date.today)
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    adjustment_ledger_entry_id = Column(UUID(as_uuid=True), ForeignKey("ledger_entries.id", ondelete="SET NULL"), nullable=True)

    party = relationship("Party", foreign_keys=[party_id])
    payment_entry = relationship("LedgerEntry", foreign_keys=[payment_ledger_entry_id])
    invoice = relationship("Invoice", foreign_keys=[invoice_id])
    adjustment_entry = relationship("LedgerEntry", foreign_keys=[adjustment_ledger_entry_id])

class PaymentTransaction(Base, UUIDModelMixin):
    __tablename__ = "payment_transactions"

    customer_id = Column(UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_type = Column(_payment_txn_type_enum, nullable=False)
    amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    payment_mode = Column(_payment_mode_enum, default="cash", nullable=False)
    reference_no = Column(String(100))
    note = Column(Text)
    transaction_date = Column(Date, nullable=False, default=date.today, index=True)
    ledger_entry_id = Column(UUID(as_uuid=True), ForeignKey("ledger_entries.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    customer = relationship("Party", foreign_keys=[customer_id])
    ledger_entry = relationship("LedgerEntry", foreign_keys=[ledger_entry_id])

    __table_args__ = (
        Index("ix_payment_txn_customer_date", "customer_id", "transaction_date"),
    )

class SystemSetting(Base, UUIDModelMixin):
    __tablename__ = "system_settings"

    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text)

class PurchaseReturn(Base, UUIDModelMixin):
    __tablename__ = "purchase_returns"

    return_number = Column(String(60), unique=True, nullable=False, index=True)
    party_id = Column(UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    party_type = Column(String(20), nullable=False)
    return_date = Column(Date, nullable=False, default=date.today, index=True)
    reference_invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    subtotal = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    discount_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    gst_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    notes = Column(Text)
    is_cancelled = Column(Boolean, default=False, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    party = relationship("Party", back_populates="purchase_returns")
    reference_invoice = relationship("Invoice", back_populates="purchase_returns")
    items = relationship(
        "PurchaseReturnItem",
        back_populates="purchase_return",
        cascade="all, delete-orphan",
        order_by="PurchaseReturnItem.created_at"
    )
    ledger_entry = relationship(
        "LedgerEntry",
        back_populates="purchase_return",
        foreign_keys="LedgerEntry.purchase_return_id",
        uselist=False
    )

class PurchaseReturnItem(Base, UUIDModelMixin):
    __tablename__ = "purchase_return_items"

    purchase_return_id = Column(UUID(as_uuid=True), ForeignKey("purchase_returns.id", ondelete="CASCADE"), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    unit = Column(String(40))
    quantity = Column(Numeric(12, 3), default=Decimal("0.000"), nullable=False)
    rate = Column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_pct = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    gst_pct = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    total = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    item_type = Column(String(20), default="inventory", nullable=False)
    is_manual_total = Column(Boolean, default=False, nullable=False)

    purchase_return = relationship("PurchaseReturn", back_populates="items")

# ─────────────────────────────────────────────────────────────
# AUDIT LOG MODEL
# ─────────────────────────────────────────────────────────────

class AuditLog(Base, UUIDModelMixin):
    __tablename__ = "audit_logs"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(60), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    table_name = Column(String(100), nullable=False, index=True)
    record_id = Column(UUID(as_uuid=True), nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
