import { apiClient } from "./api-client";
import { InvoiceAdjustment } from "../types";

export interface AdjustmentCreatePayload {
  payment_ledger_entry_id: string;
  invoice_id?: string;
  amount: number;
  notes?: string;
  adjustment_date: string;
}

export const adjustmentService = {
  list: async (args: {
    party_id?: string;
    invoice_id?: string;
  }): Promise<InvoiceAdjustment[]> => {
    return apiClient<InvoiceAdjustment[]>("/api/adjustments/", {
      params: {
        party_id: args.party_id,
        invoice_id: args.invoice_id,
      },
    });
  },

  create: async (payload: AdjustmentCreatePayload): Promise<any> => {
    return apiClient<any>("/api/adjustments/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  delete: async (adjId: string): Promise<any> => {
    return apiClient<any>(`/api/adjustments/${adjId}`, {
      method: "DELETE",
    });
  },
};
