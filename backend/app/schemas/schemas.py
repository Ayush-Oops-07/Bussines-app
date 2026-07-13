import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr

# ─────────────────────────────────────────────────────────────
# USER SCHEMAS
# ─────────────────────────────────────────────────────────────

class UserLogin(BaseModel):
    username: str
    password: str

class UserChangePassword(BaseModel):
    old_password: str
    new_password: str

class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "staff"

# ─────────────────────────────────────────────────────────────
# PARTY SCHEMAS
# ─────────────────────────────────────────────────────────────

class PartyCreate(BaseModel):
    party_type: str = "customer"
    name: str
    mobile: Optional[str] = None
    mobile2: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    opening_balance: Decimal = Decimal("0.00")
    notes: Optional[str] = None

class PartyUpdate(BaseModel):
    name: str
    mobile: Optional[str] = None
    mobile2: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    opening_balance: Decimal = Decimal("0.00")
    notes: Optional[str] = None

class PartyResponse(BaseModel):
    id: uuid.UUID
    party_type: str
    name: str
    mobile: str
    mobile2: str
    address: str
    city: str
    gstin: str
    email: str
    opening_balance: float
    balance: float
    is_active: bool
    notes: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# PRODUCT SCHEMAS
# ─────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    party_type: str = "customer"
    default_unit: Optional[str] = None
    default_rate: Optional[Decimal] = None

class ProductUpdate(BaseModel):
    name: str
    default_unit: Optional[str] = None
    default_rate: Optional[Decimal] = None
    is_active: bool = True

class ProductResponse(BaseModel):
    id: uuid.UUID
    name: str
    party_type: str
    default_unit: Optional[str] = None
    default_rate: Optional[float] = None
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# INVOICE SCHEMAS
# ─────────────────────────────────────────────────────────────

class InvoiceItemCreate(BaseModel):
    product_name: str
    unit: Optional[str] = None
    quantity: Decimal = Decimal("0.000")
    rate: Decimal = Decimal("0.00")
    discount_pct: Decimal = Decimal("0.00")
    gst_pct: Decimal = Decimal("0.00")
    total: Optional[Decimal] = None
    item_type: str = "bill_item"
    is_manual_total: bool = False
    amount: Optional[Decimal] = None  # Service amount mapping

class InvoiceItemResponse(BaseModel):
    id: uuid.UUID
    product_name: str
    unit: str
    quantity: float
    rate: float
    discount_pct: float
    gst_pct: float
    total: float
    item_type: str
    is_manual_total: bool

    class Config:
        from_attributes = True

class InvoiceCreate(BaseModel):
    party_id: uuid.UUID
    party_type: str = "customer"
    invoice_date: date
    due_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[InvoiceItemCreate]

class InvoiceResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    party_id: uuid.UUID
    party_type: str
    party_name: str
    invoice_date: date
    due_date: Optional[date] = None
    subtotal: float
    discount_amount: float
    gst_amount: float
    total_amount: float
    notes: str
    is_cancelled: bool
    created_at: Optional[datetime] = None
    items: Optional[List[InvoiceItemResponse]] = None

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# PURCHASE RETURN SCHEMAS
# ─────────────────────────────────────────────────────────────

class PurchaseReturnItemCreate(BaseModel):
    product_name: str
    unit: Optional[str] = None
    quantity: Decimal = Decimal("0.000")
    rate: Decimal = Decimal("0.00")
    discount_pct: Decimal = Decimal("0.00")
    gst_pct: Decimal = Decimal("0.00")
    total: Optional[Decimal] = None
    item_type: str = "bill_item"
    is_manual_total: bool = False

class PurchaseReturnItemResponse(BaseModel):
    id: uuid.UUID
    product_name: str
    unit: str
    quantity: float
    rate: float
    discount_pct: float
    gst_pct: float
    total: float
    item_type: str
    is_manual_total: bool

    class Config:
        from_attributes = True

class PurchaseReturnCreate(BaseModel):
    party_id: uuid.UUID
    party_type: str
    return_date: date
    reference_invoice_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    items: List[PurchaseReturnItemCreate]

class PurchaseReturnResponse(BaseModel):
    id: uuid.UUID
    return_number: str
    party_id: uuid.UUID
    party_type: str
    party_name: str
    return_date: date
    reference_invoice_id: Optional[uuid.UUID] = None
    reference_invoice_number: str
    subtotal: float
    discount_amount: float
    gst_amount: float
    total_amount: float
    notes: str
    is_cancelled: bool
    created_at: Optional[datetime] = None
    items: Optional[List[PurchaseReturnItemResponse]] = None

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# LEDGER SCHEMAS
# ─────────────────────────────────────────────────────────────

class LedgerEntryResponse(BaseModel):
    id: uuid.UUID
    party_id: uuid.UUID
    entry_date: date
    entry_type: str
    particulars: str
    debit: float
    credit: float
    running_balance: float
    payment_mode: str
    invoice_id: Optional[uuid.UUID] = None
    invoice_number: str
    purchase_return_id: Optional[uuid.UUID] = None
    notes: str
    created_at: Optional[datetime] = None
    party_name: Optional[str] = None

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# PAYMENT TRANSACTION SCHEMAS
# ─────────────────────────────────────────────────────────────

class PaymentTransactionCreate(BaseModel):
    customer_id: uuid.UUID
    payment_type: str  # RECEIVED or GIVEN
    amount: Decimal
    payment_mode: str = "cash"
    reference_no: Optional[str] = None
    note: Optional[str] = None
    transaction_date: date

class PaymentTransactionResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: Optional[str] = None
    payment_type: str
    amount: float
    payment_mode: str
    reference_no: str
    note: str
    transaction_date: date
    ledger_entry_id: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# INVOICE ADJUSTMENT SCHEMAS
# ─────────────────────────────────────────────────────────────

class InvoiceAdjustmentCreate(BaseModel):
    party_id: uuid.UUID
    payment_ledger_entry_id: uuid.UUID
    invoice_id: uuid.UUID
    amount: Decimal
    adjustment_date: date
    notes: Optional[str] = None

class InvoiceAdjustmentResponse(BaseModel):
    id: uuid.UUID
    party_id: uuid.UUID
    party_name: Optional[str] = None
    payment_ledger_entry_id: uuid.UUID
    invoice_id: uuid.UUID
    invoice_number: Optional[str] = None
    amount: float
    adjustment_date: date
    notes: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# SYSTEM SETTING SCHEMAS
# ─────────────────────────────────────────────────────────────

class SystemSettingResponse(BaseModel):
    id: uuid.UUID
    key: str
    value: str

    class Config:
        from_attributes = True

# ─────────────────────────────────────────────────────────────
# AUDIT LOG SCHEMAS
# ─────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    username: Optional[str] = None
    action: str
    table_name: str
    record_id: Optional[uuid.UUID] = None
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True
