export type Role = "admin" | "staff" | "owner";

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export type PartyType = "customer" | "shoper";

export interface Party {
  id: string;
  party_type: PartyType;
  name: string;
  mobile: string;
  mobile2: string;
  address: string;
  city: string;
  gstin: string;
  email: string;
  opening_balance: number;
  balance: number;
  is_active: boolean;
  notes: string;
  created_at: string | null;
}

export interface Product {
  id: string;
  name: string;
  party_type: PartyType;
  default_unit: string;
  default_rate: number;
  stock_qty: number | null;
  is_active: boolean;
  total_returned_qty?: number;
  latest_return_date?: string | null;
}

export type ItemType = "inventory" | "service";

export interface InvoiceItem {
  id: string;
  product_name: string;
  unit: string;
  quantity: number;
  rate: number;
  discount_pct: number;
  gst_pct: number;
  total: number;
  item_type: ItemType;
  is_manual_total: boolean;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  party_id: string;
  party_type: PartyType;
  party_name: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  discount_amount: number;
  gst_amount: number;
  total_amount: number;
  notes: string;
  is_cancelled: boolean;
  created_at: string | null;
  items?: InvoiceItem[];
}

export type EntryType =
  | "opening"
  | "sale"
  | "payment"
  | "advance_received"
  | "advance_paid"
  | "return"
  | "debit"
  | "adjustment";

export interface LedgerEntry {
  id: string;
  party_id: string;
  entry_date: string;
  entry_type: EntryType;
  particulars: string;
  debit: number;
  credit: number;
  running_balance: number;
  payment_mode: string;
  invoice_id: string | null;
  invoice_number: string;
  purchase_return_id: string | null;
  notes: string;
  created_at: string | null;
  party_name?: string;
}

export type PaymentType = "RECEIVED" | "GIVEN";

export interface PaymentTransaction {
  id: string;
  customer_id: string;
  customer_name: string;
  payment_type: PaymentType;
  amount: number;
  payment_mode: string;
  reference_no: string;
  note: string;
  transaction_date: string;
  ledger_entry_id: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface InvoiceAdjustment {
  id: string;
  party_id: string;
  payment_ledger_entry_id: string;
  invoice_id: string | null;
  amount: number;
  adjustment_date: string;
  notes: string;
  created_at: string | null;
  adjustment_ledger_entry_id: string | null;
}

export interface PurchaseReturnItem {
  id: string;
  product_name: string;
  unit: string;
  quantity: number;
  rate: number;
  discount_pct: number;
  gst_pct: number;
  total: number;
  item_type: ItemType;
  is_manual_total: boolean;
}

export interface PurchaseReturn {
  id: string;
  return_number: string;
  party_id: string;
  party_type: PartyType;
  party_name: string;
  return_date: string;
  reference_invoice_id: string | null;
  reference_invoice_number: string;
  subtotal: number;
  discount_amount: number;
  gst_amount: number;
  total_amount: number;
  notes: string;
  is_cancelled: boolean;
  created_at: string | null;
  items?: PurchaseReturnItem[];
}

export interface DashboardKPI {
  total_parties: number;
  pending_count: number;
  advance_count: number;
  clear_count: number;
  total_pending: number;
  total_advance: number;
  net_outstanding: number;
  today_sales: number;
  today_collections: number;
  today_returns: number;
  total_returns: number;
  today_cash_received: number;
  today_cash_given: number;
  net_collections: number;
  total_invoices_count?: number;
  total_returns_count?: number;
  total_payments_received_count?: number;
  total_payments_given_count?: number;
  today_sales_count?: number;
  today_collections_count?: number;
}

export interface DashboardCharts {
  months: string[];
  sales: number[];
  returns: number[];
  collections: number[];
  payments_given: number[];
}

export interface DashboardData {
  kpi: DashboardKPI;
  charts: DashboardCharts;
  top_pending: Party[];
  recent_transactions: LedgerEntry[];
  portfolio: {
    pending: number;
    advance: number;
    clear: number;
  };
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  username: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  created_at: string;
}
