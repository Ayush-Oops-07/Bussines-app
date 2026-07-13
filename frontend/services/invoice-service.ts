import { apiClient } from "./api-client";
import { Invoice, PartyType } from "../types";

export interface InvoiceItemPayload {
  product_name: string;
  unit?: string;
  quantity: number;
  rate: number;
  discount_pct?: number;
  gst_pct?: number;
  item_type?: "inventory" | "service";
  is_manual_total?: boolean;
  total?: number;
}

export interface InvoiceCreatePayload {
  party_id: string;
  party_type: PartyType;
  invoice_date: string;
  due_date?: string;
  notes?: string;
  items: InvoiceItemPayload[];
}

export interface InvoicesListResponse {
  total: number;
  page: number;
  per_page: number;
  invoices: Invoice[];
}

export const invoiceService = {
  list: async (args: {
    party_type: PartyType;
    party_id?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    per_page?: number;
  }): Promise<InvoicesListResponse> => {
    return apiClient<InvoicesListResponse>("/api/invoices/", {
      params: {
        party_type: args.party_type,
        party_id: args.party_id,
        q: args.q,
        from: args.from,
        to: args.to,
        page: args.page,
        per_page: args.per_page,
      },
    });
  },

  get: async (invId: string): Promise<Invoice & { returns: any[] }> => {
    return apiClient<any>(`/api/invoices/${invId}`);
  },

  create: async (payload: InvoiceCreatePayload): Promise<any> => {
    return apiClient<any>("/api/invoices/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update: async (invId: string, payload: InvoiceCreatePayload): Promise<any> => {
    return apiClient<any>(`/api/invoices/${invId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete: async (invId: string): Promise<any> => {
    return apiClient<any>(`/api/invoices/${invId}`, {
      method: "DELETE",
    });
  },

  cancel: async (invId: string): Promise<any> => {
    return apiClient<any>(`/api/invoices/${invId}/cancel`, {
      method: "POST",
    });
  },
};
