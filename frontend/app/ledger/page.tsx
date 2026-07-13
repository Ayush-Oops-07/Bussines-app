"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../store/ui-store";
import { ledgerService } from "../../services/ledger-service";
import { customerService } from "../../services/customer-service";
import { paymentService } from "../../services/payment-service";
import { adjustmentService } from "../../services/adjustment-service";
import { invoiceService } from "../../services/invoice-service";
import MainLayout from "../../components/layout/MainLayout";
import { LedgerEntry, Invoice } from "../../types";
import {
  ArrowLeft,
  Plus,
  Minus,
  CreditCard,
  RotateCcw,
  Printer,
  Search,
  Calendar,
  X,
  Trash2,
  Edit3,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../store/auth-store";
import CustomerSearchCombobox from "../../components/ui/CustomerSearchCombobox";

function LedgerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const partyId = searchParams.get("party") || "";
  const activeModule = useUIStore((s) => s.activeModule);
  const user = useAuthStore((s) => s.user);

  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<"RECEIVED" | "GIVEN">("RECEIVED");
  const [isDebitModalOpen, setIsDebitModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Form Fields State
  const [amount, setAmount] = useState("");
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [particulars, setParticulars] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [selectedPaymentEntryId, setSelectedPaymentEntryId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");

  // Edit fields
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);

  // Fetch Party Details
  const { data: summary } = useQuery({
    queryKey: ["party-summary", partyId],
    queryFn: () => customerService.summary(partyId),
    enabled: !!partyId,
  });

  const party = summary?.party;

  // Fetch Ledger entries
  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ["ledger", partyId, fromDate, toDate, q],
    queryFn: () => ledgerService.getLedger(partyId, fromDate, toDate, q),
    enabled: !!partyId,
  });

  // Recalculate totals dynamically
  const entries = ledgerData?.entries || [];

  // Fetch active invoices for adjustment lookup
  const { data: invoicesData } = useQuery({
    queryKey: ["party-invoices", partyId],
    queryFn: () => invoiceService.list({ party_type: activeModule, party_id: partyId, per_page: 200 }),
    enabled: !!partyId && isAdjustmentModalOpen,
  });
  const partyInvoices = invoicesData?.invoices || [];

  // Fetch adjustments for this customer/party
  const { data: adjustments = [] } = useQuery({
    queryKey: ["adjustments", partyId],
    queryFn: () => adjustmentService.list({ party_id: partyId }),
    enabled: !!partyId,
  });

  const adjustedPerPayment: Record<string, number> = {};
  adjustments.forEach((adj) => {
    adjustedPerPayment[adj.payment_ledger_entry_id] = (adjustedPerPayment[adj.payment_ledger_entry_id] || 0) + adj.amount;
  });

  const adjustedPerInvoice: Record<string, number> = {};
  adjustments.forEach((adj) => {
    if (adj.invoice_id) {
      adjustedPerInvoice[adj.invoice_id] = (adjustedPerInvoice[adj.invoice_id] || 0) + adj.amount;
    }
  });

  const paymentEntriesToAdjust = entries.filter((e) => {
    if (e.credit <= 0) return false;
    const totalAdjusted = adjustedPerPayment[e.id] || 0;
    return e.credit - totalAdjusted > 0.01;
  });

  const invoicesToAdjust = partyInvoices.filter((inv) => {
    if (inv.is_cancelled) return false;
    const totalAdjusted = adjustedPerInvoice[inv.id] || 0;
    return inv.total_amount - totalAdjusted > 0.01;
  });

  // Mutations for adjustments
  const addAdjustmentMutation = useMutation({
    mutationFn: (args: any) => adjustmentService.create(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      queryClient.invalidateQueries({ queryKey: ["adjustments"] });
      closeAdjustmentModal();
    },
    onError: (err: any) => setFormError(err.message || "An error occurred"),
  });

  const deleteAdjustmentMutation = useMutation({
    mutationFn: (id: string) => adjustmentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      queryClient.invalidateQueries({ queryKey: ["adjustments"] });
    },
    onError: (err: any) => alert(err.message || "Could not delete adjustment"),
  });

  const openAdjustmentModal = () => {
    setSelectedPaymentEntryId("");
    setSelectedInvoiceId("");
    setAdjustmentAmount("");
    setAdjustmentNotes("");
    setFormError("");
    setIsAdjustmentModalOpen(true);
  };
  const closeAdjustmentModal = () => setIsAdjustmentModalOpen(false);

  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(adjustmentAmount);
    if (!selectedPaymentEntryId) {
      setFormError("Please select a payment entry");
      return;
    }
    if (!selectedInvoiceId) {
      setFormError("Please select an invoice");
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setFormError("Amount must be greater than 0");
      return;
    }

    addAdjustmentMutation.mutate({
      party_id: partyId,
      payment_ledger_entry_id: selectedPaymentEntryId,
      invoice_id: selectedInvoiceId,
      amount: amt,
      adjustment_date: new Date().toISOString().split("T")[0],
      notes: adjustmentNotes,
    });
  };

  const handleDeleteAdjustment = (id: string) => {
    if (confirm("Are you sure you want to delete this payment adjustment?")) {
      deleteAdjustmentMutation.mutate(id);
    }
  };

  // Mutations
  const addPaymentMutation = useMutation({
    mutationFn: (args: any) => paymentService.create(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closePaymentModal();
    },
    onError: (err: any) => setFormError(err.message || "An error occurred"),
  });

  const addDebitMutation = useMutation({
    mutationFn: (args: any) => ledgerService.addDebit(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closeDebitModal();
    },
    onError: (err: any) => setFormError(err.message || "An error occurred"),
  });

  const editEntryMutation = useMutation({
    mutationFn: (args: any) => ledgerService.updateEntry(args.id, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closeEditModal();
    },
    onError: (err: any) => setFormError(err.message || "An error occurred"),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => ledgerService.deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Modal actions
  const openPaymentModal = (type: "RECEIVED" | "GIVEN") => {
    setPaymentType(type);
    setAmount("");
    setTxnDate(new Date().toISOString().split("T")[0]);
    setParticulars(type === "RECEIVED" ? "Payment Received" : "Payment Given");
    setPaymentMode("cash");
    setReferenceNo("");
    setNotes("");
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => setIsPaymentModalOpen(false);

  const openDebitModal = () => {
    setAmount("");
    setTxnDate(new Date().toISOString().split("T")[0]);
    setParticulars("Debit Entry");
    setNotes("");
    setFormError("");
    setIsDebitModalOpen(true);
  };

  const closeDebitModal = () => setIsDebitModalOpen(false);

  const openEditModal = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setAmount(String(entry.debit > 0 ? entry.debit : entry.credit));
    setTxnDate(entry.entry_date);
    setParticulars(entry.particulars);
    setPaymentMode(entry.payment_mode || "cash");
    setNotes(entry.notes);
    setFormError("");
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingEntry(null);
  };

  // Submit operations
  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Amount must be greater than 0");
      return;
    }

    addPaymentMutation.mutate({
      customer_id: partyId,
      payment_type: paymentType,
      amount: amt,
      payment_mode: paymentMode,
      reference_no: referenceNo,
      note: notes,
      transaction_date: txnDate,
    });
  };

  const handleAddDebit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Amount must be greater than 0");
      return;
    }

    addDebitMutation.mutate({
      party_id: partyId,
      amount: amt,
      particulars,
      date: txnDate,
      notes,
    });
  };

  const handleEditEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Amount must be greater than 0");
      return;
    }

    editEntryMutation.mutate({
      id: editingEntry.id,
      amount: amt,
      particulars,
      date: txnDate,
      notes,
      payment_mode: editingEntry.entry_type === "payment" ? paymentMode : undefined,
    });
  };

  const handleDeleteEntry = (entry: LedgerEntry) => {
    const typeLabel = entry.invoice_id ? "INVOICE (Warning: This will CANCEL the invoice!)" : "ledger entry";
    if (confirm(`Are you sure you want to delete this ${typeLabel}?`)) {
      deleteEntryMutation.mutate(entry.id);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleDownload = async (format: "pdf" | "excel") => {
    const token = useAuthStore.getState().token;
    
    const searchParams = new URLSearchParams();
    searchParams.append("customer_id", partyId);
    if (fromDate) searchParams.append("from", fromDate);
    if (toDate) searchParams.append("to", toDate);
    
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/backend";
    const endpoint = format === "pdf" ? "/api/reports/customer-ledger/pdf" : "/api/reports/customer-ledger/excel";
    const downloadUrl = `${apiBase}${endpoint}?${searchParams.toString()}`;
    const filename = format === "pdf" 
      ? `ledger_statement_${party?.name || "customer"}.pdf`
      : `ledger_statement_${party?.name || "customer"}.xlsx`;

    try {
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error("Failed to export ledger");
      
      const blob = await response.blob();
      const fileUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(fileUrl);
    } catch (err: any) {
      alert("Export failed: " + err.message);
    }
  };

  if (!partyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] max-w-md mx-auto text-center gap-6">
        <div className="bg-blue/10 p-4 rounded-full text-blue mt-12">
          <Search size={40} />
        </div>
        <div className="w-full text-left">
          <h2 className="text-xl font-bold text-foreground text-center mb-2">Select a {activeModule === 'customer' ? 'Customer' : 'Shoper'}</h2>
          <p className="text-sm text-textMuted text-center mb-6">Search and select a party to view their ledger report</p>
          <CustomerSearchCombobox
            partyType={activeModule}
            selectedPartyId=""
            onSelect={(party) => {
              if (party) {
                router.push(`/ledger?party=${party.id}`);
              }
            }}
            placeholder={`Search ${activeModule}...`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Ledger Header details info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4 no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/customers")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-textMuted hover:bg-white/5 border border-white/5 bg-bg2 cursor-pointer transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-wide">
              {party?.name || "Loading name..."}
            </h1>
            <p className="text-xs text-textMuted mt-0.5">
              📞 {party?.mobile || "No mobile contact"} · 📍 {party?.city || "No city details"}
            </p>
          </div>
        </div>

        {/* Current Balance chip */}
        <div className="rounded-xl border border-white/5 bg-card px-4 py-2 flex items-center justify-between gap-6">
          <div>
            <span className="text-[9px] uppercase font-bold text-textMuted">Current Balance</span>
            <div
              className={clsx(
                "text-base font-extrabold",
                party?.balance > 0 ? "text-appRed" : party?.balance < 0 ? "text-appGreen" : "text-textMuted"
              )}
            >
              ₹{Math.abs(party?.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              {party?.balance > 0 ? " Dr" : party?.balance < 0 ? " Cr" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Actions buttons row */}
      <div className="flex flex-wrap gap-2 items-center bg-card p-3 rounded-xl border border-white/5 no-print">
        <button
          onClick={() => openPaymentModal("RECEIVED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-appGreen hover:bg-appGreen/90 text-white font-semibold text-xs cursor-pointer transition-colors"
        >
          <Plus size={14} />
          <span>Payment Receive</span>
        </button>
        <button
          onClick={() => openPaymentModal("GIVEN")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-appRed hover:bg-appRed/90 text-white font-semibold text-xs cursor-pointer transition-colors"
        >
          <Minus size={14} />
          <span>Payment Give</span>
        </button>
        <button
          onClick={() => router.push(`/invoices?new=true&party=${partyId}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue hover:bg-blue/90 text-white font-semibold text-xs cursor-pointer transition-colors"
        >
          <CreditCard size={14} />
          <span>Sale Invoice</span>
        </button>
        <button
          onClick={() => router.push(`/purchase-returns?new=true&party=${partyId}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-textMuted hover:text-foreground font-semibold text-xs cursor-pointer transition-colors"
        >
          <RotateCcw size={14} />
          <span>Return Goods</span>
        </button>
        <button
          onClick={openDebitModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-textMuted hover:text-foreground font-semibold text-xs cursor-pointer transition-colors"
        >
          <span>+ Debit</span>
        </button>
        <button
          onClick={openAdjustmentModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue/20 hover:bg-blue/10 text-blue font-semibold text-xs cursor-pointer transition-colors"
        >
          <span>🔗 Adjust Payments</span>
        </button>
        <button
          onClick={() => handleDownload("pdf")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-appRed hover:bg-appRed/90 text-white font-semibold text-xs cursor-pointer transition-colors ml-auto"
        >
          <FileDown size={14} />
          <span>Download PDF</span>
        </button>
        <button
          onClick={() => handleDownload("excel")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-appGreen hover:bg-appGreen/90 text-white font-semibold text-xs cursor-pointer transition-colors"
        >
          <FileSpreadsheet size={14} />
          <span>Download Excel</span>
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-textMuted hover:text-foreground font-semibold text-xs cursor-pointer transition-colors"
        >
          <Printer size={14} />
          <span>Print Ledger</span>
        </button>
      </div>

      {/* Ledger Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-card p-4 rounded-xl border border-white/5 no-print">
        {/* Search */}
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
          <input
            type="text"
            placeholder="Search particulars..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
          />
        </div>

        {/* Date Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
          </div>
          <span className="text-xs text-textMuted">to</span>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
          </div>
        </div>

        <button
          onClick={() => {
            setQ("");
            setFromDate("");
            setToDate("");
          }}
          className="text-xs font-bold text-blue hover:underline cursor-pointer"
        >
          Clear Filters
        </button>
      </div>

      {/* Summary statistics bar / Customer Profile */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 bg-bg2/40 border border-white/5 p-4 rounded-xl no-print text-[11px] md:text-xs">
          <div className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-[10px] text-textMuted uppercase font-bold">
              {activeModule === "customer" ? "Total Sales" : "Total Purchases"}
            </span>
            <span className="text-sm font-extrabold text-appAmber">
              ₹{summary.total_sales?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-[10px] text-textMuted uppercase font-bold">Total Payments</span>
            <span className="text-sm font-extrabold text-appGreen">
              ₹{(activeModule === "customer" ? summary.total_payments_received : summary.total_payments_given)?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-[10px] text-textMuted uppercase font-bold">Total Returns</span>
            <span className="text-sm font-extrabold text-blue">
              ₹{summary.total_returns_amount?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-[10px] text-textMuted uppercase font-bold">Outstanding</span>
            <span className="text-sm font-extrabold text-appRed">
              ₹{summary.outstanding?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-[10px] text-textMuted uppercase font-bold">Advance Balance</span>
            <span className="text-sm font-extrabold text-appGreen">
              ₹{summary.advance?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-center md:text-left col-span-2 md:col-span-1 border-t md:border-t-0 md:border-l border-white/5 pt-3 md:pt-0 md:pl-4">
            <span className="text-[10px] text-textMuted uppercase font-bold">Last Transaction</span>
            <span className="text-xs font-bold text-foreground block truncate" title={summary.last_txn_particulars || "N/A"}>
              {summary.last_txn_date ? `${summary.last_txn_date} · ${summary.last_txn_particulars}` : "No transactions"}
            </span>
          </div>
        </div>
      )}

      {/* Ledger Table rendering print friendly */}
      <div className="rounded-xl border border-white/5 bg-card overflow-hidden">
        {/* Print only header */}
        <div className="hidden print-only mb-6 p-4 border-b border-black text-black">
          <div className="text-center font-bold text-xl uppercase tracking-wider">
            SANDEEP TRADERS — LEDGER REPORT
          </div>
          <div className="text-center text-xs mt-1">Pakhopali Road, Thawe, Gopalganj</div>
          <div className="flex justify-between mt-6 text-sm">
            <div>
              <strong>Party:</strong> {party?.name} <br />
              <strong>Contact:</strong> {party?.mobile || "—"}
            </div>
            <div className="text-right">
              <strong>Period:</strong> {fromDate || "Beginning"} to {toDate || "Present"} <br />
              <strong>Net Balance:</strong> ₹
              {Math.abs(party?.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              {party?.balance > 0 ? " Dr" : party?.balance < 0 ? " Cr" : ""}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left print:text-black">
            <thead>
              <tr className="border-b border-white/5 bg-bg2/40 text-textMuted font-bold uppercase tracking-wider print:bg-gray-100 print:text-black print:border-black">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Particulars</th>
                <th className="px-4 py-3 text-right">Debit (Dr) ₹</th>
                <th className="px-4 py-3 text-right">Credit (Cr) ₹</th>
                <th className="px-4 py-3 text-right">Balance ₹</th>
                <th className="px-4 py-3 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-black">
              {entries.map((e, idx) => (
                <tr key={e.id} className="hover:bg-white/2 print:hover:bg-transparent">
                  <td className="px-4 py-3 text-textMuted print:text-black">{idx + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{e.entry_date}</td>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{e.particulars}</span>
                      {e.invoice_id && (
                        <button 
                          onClick={() => router.push(`/invoices?view=${e.invoice_id}`)}
                          className="text-[9px] bg-blue/10 text-blue px-2 py-0.5 rounded-full hover:bg-blue/20 transition-colors font-bold whitespace-nowrap no-print cursor-pointer"
                        >
                          View Invoice
                        </button>
                      )}
                    </div>
                    {e.notes && (
                      <span className="block text-[10px] text-textMuted font-normal mt-0.5 print:text-black">
                        Note: {e.notes}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground print:text-black">
                    {Number(e.debit) > 0 ? Number(e.debit).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-appGreen print:text-black">
                    {Number(e.credit) > 0 ? Number(e.credit).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-foreground print:text-black">
                    {Number(e.running_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right no-print flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => openEditModal(e)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-white/5 hover:bg-white/5 text-textMuted hover:text-foreground cursor-pointer transition-colors"
                      title="Edit ledger entry"
                    >
                      <Edit3 size={11} />
                    </button>
                    {user?.role !== "staff" && (
                      <button
                        onClick={() => handleDeleteEntry(e)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-appRed/20 hover:bg-appRed/10 text-appRed cursor-pointer transition-colors"
                        title="Delete entry"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-textMuted print:text-black">
                    {isLoading ? "Loading ledger..." : "No ledger entries found for this query."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">
                {paymentType === "RECEIVED" ? "💰 Receive Payment" : "📤 Record Payment Given"}
              </h3>
              <button
                onClick={closePaymentModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddPayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-semibold"
                  >
                    <option value="cash">💵 Cash</option>
                    <option value="upi">⚡ UPI</option>
                    <option value="bank_transfer">🏛️ Bank Transfer</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI Ref, Check No."
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Note
                  </label>
                  <textarea
                    placeholder="Enter notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium placeholder-gray-400"
                  />
                </div>
              </div>

              {formError && (
                <div className="text-xs font-semibold text-appRed bg-appRed/10 border border-appRed/20 px-3 py-2 rounded-lg">
                  ⚠️ {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border mt-5">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPaymentMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {addPaymentMutation.isPending ? "Posting..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Debit Modal */}
      {isDebitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">
                ➕ Add Debit Entry
              </h3>
              <button
                onClick={closeDebitModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddDebit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Debit Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Particulars *
                  </label>
                  <input
                    type="text"
                    required
                    value={particulars}
                    onChange={(e) => setParticulars(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Note
                  </label>
                  <textarea
                    placeholder="Enter notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium placeholder-gray-400"
                  />
                </div>
              </div>

              {formError && (
                <div className="text-xs font-semibold text-appRed bg-appRed/10 border border-appRed/20 px-3 py-2 rounded-lg">
                  ⚠️ {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border mt-5">
                <button
                  type="button"
                  onClick={closeDebitModal}
                  className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addDebitMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {addDebitMutation.isPending ? "Posting..." : "Save Debit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {isEditModalOpen && editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">
                ✏️ Edit Ledger Entry
              </h3>
              <button
                onClick={closeEditModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEditEntry} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    disabled={editingEntry.entry_type === "sale" || editingEntry.entry_type === "return"}
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                  />
                </div>

                {editingEntry.entry_type === "payment" && (
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-semibold"
                    >
                      <option value="cash">💵 Cash</option>
                      <option value="upi">⚡ UPI</option>
                      <option value="bank_transfer">🏛️ Bank Transfer</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Particulars *
                  </label>
                  <input
                    type="text"
                    required
                    value={particulars}
                    onChange={(e) => setParticulars(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Note
                  </label>
                  <textarea
                    placeholder="Enter notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium placeholder-gray-400"
                  />
                </div>
              </div>

              {formError && (
                <div className="text-xs font-semibold text-appRed bg-appRed/10 border border-appRed/20 px-3 py-2 rounded-lg">
                  ⚠️ {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border mt-5">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editEntryMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {editEntryMutation.isPending ? "Saving..." : "Update Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Invoice Adjustment Modal */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[20px] border border-border bg-card p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">
                🔗 Adjust Payments Against Invoices
              </h3>
              <button
                onClick={closeAdjustmentModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form Side */}
              <form onSubmit={handleAddAdjustment} className="space-y-4 border-r border-white/5 pr-6">
                <h4 className="text-xs font-bold text-foreground">Create New Adjustment</h4>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Select Credit/Payment Entry *
                  </label>
                  <select
                    value={selectedPaymentEntryId}
                    onChange={(e) => {
                      setSelectedPaymentEntryId(e.target.value);
                      const entry = paymentEntriesToAdjust.find((p) => p.id === e.target.value);
                      if (entry) {
                        const avail = entry.credit - (adjustedPerPayment[entry.id] || 0);
                        setAdjustmentAmount(String(avail.toFixed(2)));
                      }
                    }}
                    required
                    className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-semibold"
                  >
                    <option value="">— Select Payment/Credit —</option>
                    {paymentEntriesToAdjust.map((e) => {
                      const avail = e.credit - (adjustedPerPayment[e.id] || 0);
                      return (
                        <option key={e.id} value={e.id}>
                          {e.entry_date} · Total: ₹{e.credit} (Available: ₹{avail.toFixed(2)})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Select Sales Invoice *
                  </label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                      const inv = invoicesToAdjust.find((i) => i.id === e.target.value);
                      const entry = paymentEntriesToAdjust.find((p) => p.id === selectedPaymentEntryId);
                      if (inv && entry) {
                        const pAvail = entry.credit - (adjustedPerPayment[entry.id] || 0);
                        const iOut = inv.total_amount - (adjustedPerInvoice[inv.id] || 0);
                        const min = Math.min(pAvail, iOut);
                        setAdjustmentAmount(String(min.toFixed(2)));
                      }
                    }}
                    required
                    className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-semibold"
                  >
                    <option value="">— Select Invoice —</option>
                    {invoicesToAdjust.map((i) => {
                      const out = i.total_amount - (adjustedPerInvoice[i.id] || 0);
                      return (
                        <option key={i.id} value={i.id}>
                          Invoice {i.invoice_number} ({i.invoice_date}) · Unpaid: ₹{out.toFixed(2)}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Adjustment Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Notes
                  </label>
                  <textarea
                    placeholder="Enter notes..."
                    value={adjustmentNotes}
                    onChange={(e) => setAdjustmentNotes(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium placeholder-gray-400"
                  />
                </div>

                {formError && (
                  <div className="text-xs font-semibold text-appRed bg-appRed/10 border border-appRed/20 px-3 py-2 rounded-lg">
                    ⚠️ {formError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3 mt-5">
                  <button
                    type="button"
                    onClick={closeAdjustmentModal}
                    className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={addAdjustmentMutation.isPending}
                    className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {addAdjustmentMutation.isPending ? "Adjusting..." : "Adjust"}
                  </button>
                </div>
              </form>

              {/* List Side */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-foreground">Current Active Adjustments</h4>
                {adjustments.length === 0 ? (
                  <div className="text-center py-8 text-textMuted text-xs">No adjustments created yet.</div>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {adjustments.map((adj: any) => (
                      <div
                        key={adj.id}
                        className="p-3 bg-bg2/40 border border-white/5 rounded-xl flex items-center justify-between gap-4 text-[11px]"
                      >
                        <div className="space-y-0.5 text-textMuted">
                          <div className="font-bold text-foreground">₹{adj.amount.toFixed(2)} Adjusted</div>
                          <div>Invoice ID/No: {adj.invoice?.invoice_number || adj.invoice_id?.substring(0, 8)}</div>
                          <div>Date: {adj.adjustment_date}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteAdjustment(adj.id)}
                          disabled={deleteAdjustmentMutation.isPending}
                          className="h-7 w-7 rounded-lg bg-appRed/10 hover:bg-appRed/20 text-appRed flex items-center justify-center cursor-pointer transition-colors"
                          title="Delete adjustment"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LedgerPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="text-center py-12 text-textMuted">Loading ledger details...</div>}>
        <LedgerContent />
      </Suspense>
    </MainLayout>
  );
}
