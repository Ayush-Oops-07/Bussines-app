"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../store/ui-store";
import { paymentService } from "../../services/payment-service";
import MainLayout from "../../components/layout/MainLayout";
import { PaymentTransaction } from "../../types";
import { useAuthStore } from "../../store/auth-store";
import { Plus, Trash2, Calendar, FileText, Search, CreditCard, ChevronDown } from "lucide-react";
import clsx from "clsx";

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const activeModule = useUIStore((s) => s.activeModule);
  const user = useAuthStore((s) => s.user);

  // Fetch payments list
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments-list", activeModule],
    queryFn: () => paymentService.list({ limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments-list"] });
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete payment transaction");
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this payment transaction?")) {
      deleteMutation.mutate(id);
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    });
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h1 className="text-[30px] font-bold text-foreground tracking-wide uppercase">
              Payments
            </h1>
            <p className="text-xs text-textMuted mt-1">
              View and manage client billing receipts and payments.
            </p>
          </div>
        </div>

        {/* Payments Table */}
        <div className="rounded-[18px] border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] text-left">
              <thead>
                <tr className="border-b border-border bg-[#F6F8FC] text-textMuted font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Transaction Date</th>
                  <th className="px-6 py-4">Party Name</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Payment Mode</th>
                  <th className="px-6 py-4">Reference No</th>
                  {user?.role === "admin" && <th className="px-6 py-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-foreground">
                      {p.transaction_date}
                    </td>
                    <td className="px-6 py-4 font-semibold text-foreground">
                      {p.customer_name || p.party_name || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={clsx(
                          "inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide",
                          p.payment_type === "RECEIVED"
                            ? "bg-green/10 text-green"
                            : "bg-red/10 text-red"
                        )}
                      >
                        {p.payment_type === "RECEIVED" ? "Payment In" : "Payment Out"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-extrabold text-foreground">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-6 py-4 uppercase text-xs font-semibold text-textMuted">
                      {p.payment_mode}
                    </td>
                    <td className="px-6 py-4 text-textMuted truncate max-w-[150px]">
                      {p.reference_no || "—"}
                    </td>
                    {user?.role === "admin" && (
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDelete(p.id)}
                          title="Delete Payment"
                          className="p-1.5 rounded-lg border border-border text-red hover:bg-red/10 cursor-pointer transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-textMuted font-medium">
                      {isLoading ? "Loading transactions..." : "No payment transactions recorded yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
