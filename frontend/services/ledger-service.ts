import { apiClient } from "./api-client";
import { LedgerEntry, PartyType } from "../types";

export interface LedgerResponse {
  party_id: string;
  balance: number;
  opening_balance: number;
  entries: LedgerEntry[];
}

export const ledgerService = {
  getLedger: async (
    partyId: string,
    from?: string,
    to?: string,
    q: string = ""
  ): Promise<LedgerResponse> => {
    return apiClient<LedgerResponse>(`/api/ledger/${partyId}`, {
      params: {
        from: from || undefined,
        to: to || undefined,
        q: q || undefined,
      },
    });
  },

  addPayment: async (args: {
    party_id: string;
    amount: number;
    payment_mode?: string;
    particulars?: string;
    date: string;
    notes?: string;
  }): Promise<{ ok: boolean; entry: LedgerEntry; new_balance: number }> => {
    return apiClient<any>("/api/ledger/payment", {
      method: "POST",
      params: {
        party_id: args.party_id,
        amount: args.amount,
        payment_mode: args.payment_mode || "cash",
        particulars: args.particulars || "Payment Received",
        date: args.date,
        notes: args.notes || "",
      },
    });
  },

  addDebit: async (args: {
    party_id: string;
    amount: number;
    particulars?: string;
    date: string;
    notes?: string;
  }): Promise<{ ok: boolean; entry: LedgerEntry; new_balance: number }> => {
    return apiClient<any>("/api/ledger/debit", {
      method: "POST",
      params: {
        party_id: args.party_id,
        amount: args.amount,
        particulars: args.particulars || "Debit Entry",
        date: args.date,
        notes: args.notes || "",
      },
    });
  },

  updateEntry: async (
    entryId: string,
    args: {
      particulars?: string;
      date?: string;
      notes?: string;
      payment_mode?: string;
      amount?: number;
    }
  ): Promise<{ ok: boolean; entry: LedgerEntry; new_balance: number }> => {
    return apiClient<any>(`/api/ledger/${entryId}`, {
      method: "PUT",
      params: {
        particulars: args.particulars || undefined,
        date: args.date || undefined,
        notes: args.notes || undefined,
        payment_mode: args.payment_mode || undefined,
        amount: args.amount || undefined,
      },
    });
  },

  deleteEntry: async (
    entryId: string
  ): Promise<{ ok: boolean; new_balance: number }> => {
    return apiClient<any>(`/api/ledger/${entryId}`, {
      method: "DELETE",
    });
  },

  monthlySummary: async (
    type: PartyType,
    year: number
  ): Promise<{
    year: number;
    months: string[];
    sales: number[];
    collections: number[];
  }> => {
    return apiClient<any>("/api/ledger/monthly-summary/chart", {
      params: { type, year },
    });
  },

  recentTransactions: async (
    type: PartyType,
    limit: number = 20
  ): Promise<LedgerEntry[]> => {
    return apiClient<LedgerEntry[]>("/api/ledger/recent/list", {
      params: { type, limit },
    });
  },
};
