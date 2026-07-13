import { apiClient } from "./api-client";
import { Product, PartyType } from "../types";

export interface ProductCreatePayload {
  name: string;
  party_type: PartyType;
  default_unit?: string;
  default_rate?: number;
  stock_qty?: number;
}

export const productService = {
  list: async (party_type: PartyType, q: string = ""): Promise<Product[]> => {
    return apiClient<Product[]>("/api/products/", {
      params: { party_type, q },
    });
  },

  create: async (payload: ProductCreatePayload): Promise<Product> => {
    return apiClient<Product>("/api/products/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  delete: async (pid: string): Promise<{ ok: boolean }> => {
    return apiClient<{ ok: boolean }>(`/api/products/${pid}`, {
      method: "DELETE",
    });
  },

  update: async (pid: string, payload: any): Promise<Product> => {
    return apiClient<Product>(`/api/products/${pid}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};
