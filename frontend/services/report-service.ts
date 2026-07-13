import { apiClient } from "./api-client";

export interface MonthlySalesInvoice {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  mobile: string;
  total_amount: number;
  payment_status: string;
  outstanding: number;
}

export interface MonthlySalesResponse {
  total_sales: number;
  total_paid: number;
  total_outstanding: number;
  num_invoices: number;
  invoices: MonthlySalesInvoice[];
  from_date: string;
  to_date: string;
}

export interface CustomerLedgerResponse {
  party: {
    name: string;
    mobile: string;
    address: string;
    opening_balance: number;
    balance: number;
  };
  from_date: string;
  to_date: string;
  opening_balance: number;
  entries: any[];
  summary: {
    total_debit: number;
    total_credit: number;
    current_outstanding: number;
    advance_balance: number;
  };
}

export const reportService = {
  getMonthlySales: async (params: {
    from?: string;
    to?: string;
    month?: number;
    year?: number;
  }): Promise<MonthlySalesResponse> => {
    return apiClient<MonthlySalesResponse>("/api/reports/monthly-sales", {
      params: {
        from: params.from || undefined,
        to: params.to || undefined,
        month: params.month || undefined,
        year: params.year || undefined,
      },
    });
  },

  getCustomerLedger: async (
    customerId: string,
    params: {
      from?: string;
      to?: string;
      month?: number;
      year?: number;
    }
  ): Promise<CustomerLedgerResponse> => {
    return apiClient<CustomerLedgerResponse>(`/api/reports/customer-ledger/${customerId}`, {
      params: {
        from: params.from || undefined,
        to: params.to || undefined,
        month: params.month || undefined,
        year: params.year || undefined,
      },
    });
  },
};
