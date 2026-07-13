import { apiClient } from "./api-client";
import { PaymentTransaction, PaymentType } from "../types";

export interface PaymentCreatePayload {
  customer_id: string;
  payment_type: PaymentType;
  amount: number;
  payment_mode: string;
  reference_no?: string;
  note?: string;
  transaction_date: string;
}

export const paymentService = {
  list: async (args: {
    customer_id?: string;
    payment_type?: PaymentType;
    limit?: number;
  }): Promise<PaymentTransaction[]> => {
    return apiClient<PaymentTransaction[]>("/api/payments/", {
      params: {
        customer_id: args.customer_id,
        payment_type: args.payment_type,
        limit: args.limit,
      },
    });
  },

  create: async (payload: PaymentCreatePayload): Promise<any> => {
    return apiClient<any>("/api/payments/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update: async (txnId: string, payload: PaymentCreatePayload): Promise<any> => {
    return apiClient<any>(`/api/payments/${txnId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  delete: async (txnId: string): Promise<any> => {
    return apiClient<any>(`/api/payments/${txnId}`, {
      method: "DELETE",
    });
  },
};
