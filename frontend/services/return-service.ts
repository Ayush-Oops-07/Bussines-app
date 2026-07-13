import { apiClient } from "./api-client";
import { PurchaseReturn, PartyType } from "../types";

export interface ReturnItemPayload {
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

export interface ReturnCreatePayload {
  party_id: string;
  party_type: PartyType;
  return_date: string;
  reference_invoice_id?: string;
  notes?: string;
  items: ReturnItemPayload[];
}

export interface ReturnsListResponse {
  total: number;
  page: number;
  per_page: number;
  returns: PurchaseReturn[];
}

export const returnService = {
  list: async (args: {
    party_type: PartyType;
    party_id?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    per_page?: number;
  }): Promise<ReturnsListResponse> => {
    return apiClient<ReturnsListResponse>("/api/returns/", {
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

  get: async (returnId: string): Promise<PurchaseReturn> => {
    return apiClient<PurchaseReturn>(`/api/returns/${returnId}`);
  },

  create: async (payload: ReturnCreatePayload): Promise<any> => {
    return apiClient<any>("/api/returns/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update: async (returnId: string, payload: ReturnCreatePayload): Promise<any> => {
    return apiClient<any>(`/api/returns/${returnId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  cancel: async (returnId: string): Promise<any> => {
    return apiClient<any>(`/api/returns/${returnId}/cancel`, {
      method: "POST",
    });
  },

  delete: async (returnId: string): Promise<any> => {
    return apiClient<any>(`/api/returns/${returnId}`, {
      method: "DELETE",
    });
  },
};
