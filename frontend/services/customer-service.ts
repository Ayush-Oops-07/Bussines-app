import { apiClient } from "./api-client";
import { Party, PartyType } from "../types";

export interface PartyCreatePayload {
  party_type: PartyType;
  name: string;
  mobile?: string;
  mobile2?: string;
  address?: string;
  city?: string;
  gstin?: string;
  opening_balance: number;
  notes?: string;
}

export const customerService = {
  list: async (
    type: PartyType,
    q: string = "",
    status?: string
  ): Promise<Party[]> => {
    return apiClient<Party[]>("/api/parties/", {
      params: { type, q, status },
    });
  },

  getStats: async (
    type: PartyType
  ): Promise<{
    total: number;
    pending: number;
    advance: number;
    clear: number;
    total_pending_amount: number;
    total_advance_amount: number;
    net_outstanding: number;
    top_pending: Party[];
  }> => {
    return apiClient<any>("/api/parties/stats", {
      params: { type },
    });
  },

  get: async (pid: string): Promise<Party> => {
    return apiClient<Party>(`/api/parties/${pid}`);
  },

  create: async (payload: PartyCreatePayload): Promise<Party> => {
    return apiClient<Party>("/api/parties/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update: async (pid: string, payload: PartyCreatePayload): Promise<Party> => {
    return apiClient<Party>(`/api/parties/${pid}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete: async (pid: string): Promise<{ ok: boolean; message: string }> => {
    return apiClient<{ ok: boolean; message: string }>(`/api/parties/${pid}`, {
      method: "DELETE",
    });
  },

  summary: async (pid: string): Promise<any> => {
    return apiClient<any>(`/api/parties/${pid}/summary`);
  },
};
