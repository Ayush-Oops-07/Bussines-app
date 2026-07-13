"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../store/ui-store";
import { invoiceService, InvoiceCreatePayload, InvoiceItemPayload } from "../../services/invoice-service";
import { customerService } from "../../services/customer-service";
import { productService } from "../../services/product-service";
import MainLayout from "../../components/layout/MainLayout";
import { Invoice, Product, Party } from "../../types";
import {
  Search,
  Plus,
  Trash2,
  Printer,
  X,
  FileText,
  AlertCircle,
  Eye,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../store/auth-store";
import CustomerSearchCombobox from "../../components/ui/CustomerSearchCombobox";
import ProductSearchCombobox from "../../components/ui/ProductSearchCombobox";

function InvoicesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const activeModule = useUIStore((s) => s.activeModule);
  const user = useAuthStore((s) => s.user);

  // States
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedFilterParty, setSelectedFilterParty] = useState<Party | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // Invoice creation form state
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [partySearchQ, setPartySearchQ] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItemPayload[]>([
    { product_name: "", unit: "BAG", quantity: 1, rate: 0, discount_pct: 0, gst_pct: 0, total: 0 },
  ]);
  const [formError, setFormError] = useState("");

  // Product suggestions
  const [prodSearchActiveIdx, setProdSearchActiveIdx] = useState<number | null>(null);
  const [prodSearchQ, setProdSearchQ] = useState("");

  // Fetch Invoices
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["invoices", activeModule, q, fromDate, toDate, page, selectedFilterParty?.id],
    queryFn: () =>
      invoiceService.list({
        party_type: activeModule,
        party_id: selectedFilterParty?.id || undefined,
        q,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        per_page: 25,
      }),
  });

  // Fetch parties for invoice builder search
  const { data: partiesList = [] } = useQuery({
    queryKey: ["parties-lookup", activeModule, partySearchQ],
    queryFn: () => customerService.list(activeModule, partySearchQ),
    enabled: partySearchQ.length > 0,
  });

  // Fetch products for product search
  const { data: productsList = [] } = useQuery({
    queryKey: ["products-lookup", activeModule, prodSearchQ],
    queryFn: () => productService.list(activeModule, prodSearchQ),
    enabled: prodSearchActiveIdx !== null,
  });

  // Check if routed with "?new=true" to auto-open modal
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      const defaultPartyId = searchParams.get("party");
      if (defaultPartyId) {
        customerService.get(defaultPartyId).then((p) => {
          setSelectedParty(p);
          openCreateModal();
        });
      } else {
        openCreateModal();
      }
    }
  }, [searchParams]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: InvoiceCreatePayload) => invoiceService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      closeCreateModal();
    },
    onError: (err: any) => setFormError(err.message || "An error occurred"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => invoiceService.cancel(id),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      // update preview
      setIsPreviewOpen(false);
      setPreviewInvoice(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoiceService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setIsPreviewOpen(false);
      setPreviewInvoice(null);
    },
  });

  const openCreateModal = () => {
    setSelectedParty(null);
    setPartySearchQ("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setInvoiceNumber("");
    setDueDate("");
    setNotes("");
    setItems([{ product_name: "", unit: "BAG", quantity: 1, rate: 0, discount_pct: 0, gst_pct: 0, total: 0, item_type: "inventory", is_manual_total: false }]);
    setFormError("");
    setProdSearchActiveIdx(null);
    setProdSearchQ("");
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setSelectedParty(null);
    setPartySearchQ("");
  };

  // Math calculators for items
  const updateItemField = (idx: number, field: keyof InvoiceItemPayload, value: any) => {
    const updated = [...items];

    if (field === "item_type") {
      if (value === "service") {
        updated[idx] = {
          ...updated[idx],
          item_type: "service",
          quantity: 0,
          rate: 0,
          discount_pct: 0,
          gst_pct: 0,
          unit: "",
          is_manual_total: true,
          total: 0,
        };
      } else {
        updated[idx] = {
          ...updated[idx],
          item_type: "inventory",
          quantity: 1,
          rate: 0,
          discount_pct: 0,
          gst_pct: 0,
          unit: "BAG",
          is_manual_total: false,
          total: 0,
        };
      }
      setItems(updated);
      return;
    }

    updated[idx] = { ...updated[idx], [field]: value };

    if (updated[idx].item_type === "service") {
      if (field === "total") {
        updated[idx].total = parseFloat(value) || 0;
      }
      updated[idx].is_manual_total = true;
    } else {
      if (field === "total") {
        updated[idx].is_manual_total = true;
        updated[idx].total = parseFloat(value) || 0;
      } else {
        const qty = parseFloat(String(updated[idx].quantity)) || 0;
        const rate = parseFloat(String(updated[idx].rate)) || 0;
        const disc = parseFloat(String(updated[idx].discount_pct)) || 0;
        const gst = parseFloat(String(updated[idx].gst_pct)) || 0;

        const base = qty * rate;
        const withDisc = base - (base * disc) / 100;
        const total = withDisc + (withDisc * gst) / 100;

        updated[idx].total = parseFloat(total.toFixed(2));
        updated[idx].is_manual_total = false;
      }
    }
    setItems(updated);
  };

  const addRow = () => {
    setItems([
      ...items,
      { product_name: "", unit: "BAG", quantity: 1, rate: 0, discount_pct: 0, gst_pct: 0, total: 0, item_type: "inventory", is_manual_total: false },
    ]);
  };

  const removeRow = (idx: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== idx));
    }
  };

  // Compute final aggregates
  const calculateTotals = () => {
    let subtotal = 0;
    let discount = 0;
    let gst = 0;
    let grand = 0;

    items.forEach((item) => {
      if (item.item_type === "service") {
        const itemTotal = parseFloat(String(item.total)) || 0;
        subtotal += itemTotal;
        grand += itemTotal;
      } else {
        const qty = parseFloat(String(item.quantity)) || 0;
        const rate = parseFloat(String(item.rate)) || 0;
        const discPct = parseFloat(String(item.discount_pct)) || 0;
        const gstPct = parseFloat(String(item.gst_pct)) || 0;

        const base = qty * rate;
        const discAmount = (base * discPct) / 100;
        const gstAmount = ((base - discAmount) * gstPct) / 100;

        subtotal += base;
        discount += discAmount;
        gst += gstAmount;

        if (item.is_manual_total && item.total !== undefined) {
          grand += parseFloat(String(item.total)) || 0;
        } else {
          grand += base - discAmount + gstAmount;
        }
      }
    });

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      gst: parseFloat(gst.toFixed(2)),
      grand: parseFloat(grand.toFixed(2)),
    };
  };

  const totals = calculateTotals();

  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) {
      setFormError("Please select a party");
      return;
    }
    const invalidItem = items.some((item) => {
      if (item.item_type === "service") {
        return !item.product_name.trim() || (item.total || 0) <= 0;
      }
      return !item.product_name.trim() || item.quantity <= 0 || item.rate < 0;
    });
    if (invalidItem) {
      setFormError("Each item must have a valid description and positive total/rate");
      return;
    }

    createMutation.mutate({
      party_id: selectedParty.id,
      party_type: activeModule,
      invoice_date: invoiceDate,
      due_date: dueDate || undefined,
      notes: notes.trim(),
      items: items.map((it) => ({
        ...it,
        product_name: it.product_name.toUpperCase(),
        unit: it.unit ? it.unit.toUpperCase() : undefined,
      })),
    });
  };

  const handleCancelInvoice = (id: string) => {
    if (confirm("Are you sure you want to CANCEL this invoice? This will set amount to 0 and recalculate ledger balances.")) {
      cancelMutation.mutate(id);
    }
  };

  const handleDeleteInvoice = (id: string) => {
    if (confirm("Are you sure you want to completely DELETE this invoice from database records?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenPreview = async (inv: Invoice) => {
    try {
      const details = await invoiceService.get(inv.id);
      setPreviewInvoice(details);
      setIsPreviewOpen(true);
    } catch (err: any) {
      alert("Error loading invoice preview: " + err.message);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const invoices = invoicesData?.invoices || [];

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 font-sans">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print select-none">
          <div>
            <h1 className="text-[32px] font-bold text-foreground tracking-tight leading-none">🧾 Sales Invoices</h1>
            <p className="text-sm text-textMuted mt-2 font-medium">
              Browse invoices list, create sales, and download statements.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 h-[46px] px-5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white font-bold text-sm transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer self-start"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>New Invoice</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border no-print">
          
          <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto flex-1">
            {/* Customer Filter */}
            <div className="w-full md:w-[250px]">
              <CustomerSearchCombobox
                partyType={activeModule}
                selectedPartyId={selectedFilterParty?.id || ""}
                onSelect={(party) => setSelectedFilterParty(party)}
                placeholder={`Search ${activeModule}...`}
              />
            </div>

            {/* Quick Search */}
            <div className="relative w-full md:w-[250px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
              <input
                type="text"
                placeholder="Search invoice #..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
              />
            </div>
          </div>

          {/* Date range selection */}
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-textMuted select-none">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
                setSelectedFilterParty(null);
                setQ("");
              }}
              className="h-[46px] px-4 text-xs font-bold text-blue hover:text-blue/80 hover:bg-blue/5 rounded-xl transition-all cursor-pointer select-none"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Invoices list table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden no-print shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-[#F6F8FC]/50 dark:bg-[#0f172a]/30 text-[#475569] font-bold uppercase tracking-wider text-[11px] select-none">
                  <th className="px-6 py-4">Invoice #</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Party Name</th>
                  <th className="px-6 py-4 text-right">Amount (₹)</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="odd:bg-transparent even:bg-[#F6F8FC]/30 hover:bg-blue/5 dark:hover:bg-blue/10 transition-colors">
                    <td className="px-6 py-3 font-semibold text-foreground">{inv.invoice_number}</td>
                    <td className="px-6 py-3 text-textMuted">{inv.invoice_date}</td>
                    <td className="px-6 py-3 font-medium text-foreground capitalize">{inv.party_name}</td>
                    <td className="px-6 py-3 text-right font-extrabold text-foreground">
                      ₹{inv.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3">
                      {inv.is_cancelled ? (
                        <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red/10 text-red">
                          Cancelled
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green/10 text-green">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right flex justify-end items-center gap-3">
                      <button
                        onClick={() => handleOpenPreview(inv)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue/10 hover:bg-blue/20 text-blue font-bold tracking-wide transition-colors cursor-pointer text-xs"
                      >
                        <Eye size={13} />
                        <span>Preview</span>
                      </button>
                      {!inv.is_cancelled && user?.role !== "staff" && (
                        <button
                          onClick={() => handleCancelInvoice(inv.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-red/20 hover:bg-red/10 text-red cursor-pointer transition-colors"
                          title="Cancel Invoice"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-textMuted font-medium">
                      {isLoading ? "Loading invoices..." : "No invoices found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoice Creation Drawer Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-[24px] border border-border bg-card p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[95vh] transition-all duration-300">
              <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
                <h3 className="text-base font-bold text-foreground">🧾 Create Sales Invoice</h3>
                <button
                  onClick={closeCreateModal}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveInvoice} className="space-y-5">
                {/* Party selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Select Customer / Party <span className="text-red">*</span>
                  </label>
                  <CustomerSearchCombobox
                    partyType={activeModule}
                    selectedPartyId={selectedParty?.id || ""}
                    onSelect={(party) => setSelectedParty(party)}
                  />
                </div>

                {/* Meta details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Invoice Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      placeholder="Auto (Generates automatically)"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full h-[46px] px-4 rounded-[12px] bg-gray-50 dark:bg-[#0f172a]/50 border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium disabled:opacity-75"
                      disabled
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Items rows creation */}
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex justify-between items-center select-none">
                    <span className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Itemized Line Details
                    </span>
                    <button
                      type="button"
                      onClick={addRow}
                      className="flex items-center gap-1.5 h-[34px] px-3.5 rounded-lg bg-blue/10 hover:bg-blue/20 text-blue font-bold text-xs transition-all cursor-pointer"
                    >
                      <Plus size={12} strokeWidth={2.5} />
                      <span>Add Row</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-[#F6F8FC]/40 dark:bg-[#0f172a]/20 border border-border rounded-xl relative animate-fadeIn"
                      >
                        {/* Dropdown selector for Item Type */}
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                            Item Type
                          </label>
                          <select
                            value={item.item_type || "inventory"}
                            onChange={(e) => updateItemField(idx, "item_type", e.target.value)}
                            className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-medium"
                          >
                            <option value="inventory">Bill Item</option>
                            <option value="service">Service / Charge</option>
                          </select>
                        </div>

                        {item.item_type === "service" ? (
                          <>
                            {/* Service description */}
                            <div className="md:col-span-7 space-y-1">
                              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                Description *
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Labour Charge, Transport..."
                                value={item.product_name}
                                onChange={(e) => updateItemField(idx, "product_name", e.target.value)}
                                className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium text-foreground"
                              />
                            </div>

                            {/* Service Amount */}
                            <div className="md:col-span-3 space-y-1">
                              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                Amount (₹) *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                required
                                min="0.01"
                                placeholder="0.00"
                                value={item.total || ""}
                                onChange={(e) => updateItemField(idx, "total", e.target.value)}
                                className="w-full h-[46px] px-4 text-right rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-bold text-foreground"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Bill Item Description name search */}
                            <div className="md:col-span-5 space-y-1">
                              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                Description *
                              </label>
                              <ProductSearchCombobox
                                partyType={activeModule}
                                selectedProductName={item.product_name}
                                onSelect={(prod) => {
                                  const updated = [...items];
                                  updated[idx] = {
                                    ...updated[idx],
                                    product_name: prod ? prod.name : "",
                                    unit: prod ? prod.default_unit : "BAG",
                                    rate: prod ? prod.default_rate : 0,
                                  };
                                  const qty = parseFloat(String(updated[idx].quantity)) || 0;
                                  const rate = parseFloat(String(updated[idx].rate)) || 0;
                                  const base = qty * rate;
                                  updated[idx].total = parseFloat(base.toFixed(2));
                                  updated[idx].is_manual_total = false;
                                  setItems(updated);
                                }}
                              />
                            </div>

                            <div className="md:col-span-1 space-y-1">
                              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                Unit
                              </label>
                              <select
                                value={item.unit}
                                onChange={(e) => updateItemField(idx, "unit", e.target.value)}
                                className="w-full h-[46px] px-2 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-xs outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-medium"
                              >
                                <option value="BAG">BAG</option>
                                <option value="TON">TON</option>
                                <option value="KG">KG</option>
                                <option value="PCS">PCS</option>
                                <option value="BOX">BOX</option>
                                <option value="LTR">LTR</option>
                                <option value="MTR">MTR</option>
                                <option value="DOZ">DOZ</option>
                                <option value="NONE">NONE</option>
                              </select>
                            </div>

                            <div className="md:col-span-1 space-y-1">
                              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                Qty *
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                required
                                min="0.001"
                                value={item.quantity}
                                onChange={(e) => updateItemField(idx, "quantity", e.target.value)}
                                className="w-full h-[46px] px-2 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                              />
                            </div>

                            <div className="md:col-span-1 space-y-1">
                              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                Rate *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                required
                                min="0"
                                value={item.rate}
                                onChange={(e) => updateItemField(idx, "rate", e.target.value)}
                                className="w-full h-[46px] px-2 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                              />
                            </div>

                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                Amount (₹) *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                required
                                min="0"
                                placeholder="0.00"
                                value={item.total || ""}
                                onChange={(e) => updateItemField(idx, "total", e.target.value)}
                                className="w-full h-[46px] px-2 text-right rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-bold text-foreground"
                              />
                            </div>
                          </>
                        )}

                        {/* Delete row button */}
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="absolute -top-2.5 -right-2 h-6 w-6 bg-card hover:bg-red/10 border border-border text-textMuted hover:text-red flex items-center justify-center rounded-full cursor-pointer transition-all shadow-sm"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Calculations sum row */}
                  <div className="mt-4 flex flex-col gap-2 p-5 rounded-2xl bg-blue/5 dark:bg-blue/10 border border-blue/15 w-full md:max-w-xs ml-auto">
                    <div className="flex justify-between w-full text-xs text-textMuted font-semibold select-none">
                      <span>Subtotal:</span>
                      <span className="font-extrabold text-foreground">₹{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between w-full text-xs text-textMuted font-semibold select-none">
                        <span>Discount Value:</span>
                        <span className="font-extrabold text-red">-₹{totals.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totals.gst > 0 && (
                      <div className="flex justify-between w-full text-xs text-textMuted font-semibold select-none">
                        <span>GST Amount:</span>
                        <span className="font-extrabold text-foreground">+₹{totals.gst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="h-[1px] w-full bg-blue/10 my-1.5" />
                    <div className="flex justify-between items-center w-full select-none">
                      <span className="text-xs font-bold text-foreground">Grand Total:</span>
                      <span className="text-xl font-bold text-blue tracking-tight">
                        ₹{totals.grand.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Notes
                  </label>
                  <textarea
                    placeholder="Enter notes on invoice..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-[#F6F8FC] dark:bg-[#0f172a] border border-border text-sm outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium placeholder-gray-400"
                  />
                </div>

                {formError && (
                  <div className="text-xs font-semibold text-red bg-red/10 border border-red/20 px-3 py-2.5 rounded-xl">
                    ⚠️ {formError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] bg-white dark:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {createMutation.isPending ? "Generating..." : "Save & Generate Invoice"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invoice Preview Print friendly Modal */}
        {isPreviewOpen && previewInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-3xl rounded-[20px] border border-border bg-card p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between mb-5 border-b border-border pb-3 no-print">
                <h3 className="text-sm font-bold text-foreground">
                  🧾 Invoice Preview ({previewInvoice.invoice_number})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue text-white text-xs font-bold transition-all cursor-pointer shadow shadow-blue/20"
                  >
                    <Printer size={14} />
                    <span>Print PDF</span>
                  </button>
                  {!previewInvoice.is_cancelled && user?.role !== "staff" && (
                    <button
                      onClick={() => handleCancelInvoice(previewInvoice.id)}
                      className="px-3 py-1.5 rounded-lg border border-appRed/20 hover:bg-appRed/10 text-appRed text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel Sale
                    </button>
                  )}
                  {user?.role !== "staff" && (
                    <button
                      onClick={() => handleDeleteInvoice(previewInvoice.id)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-textMuted hover:text-foreground text-xs font-bold transition-colors cursor-pointer"
                      title="Delete permanently"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsPreviewOpen(false);
                      setPreviewInvoice(null);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-white/5 cursor-pointer ml-2"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* PRINTABLE AREA */}
              <div className="bg-white text-black p-6 rounded-xl border border-gray-200 font-sans print:border-0 print:p-0 print:m-0">
                {/* Header */}
                <div className="flex justify-between border-b border-gray-300 pb-4 mb-4 text-xs">
                  <div>
                    <h2 className="text-lg font-bold uppercase tracking-wider text-black">
                      SANDEEP TRADERS
                    </h2>
                    <p className="text-gray-500 font-medium mt-0.5">
                      Pakhopali Road, Thawe, Gopalganj <br />
                      GSTIN: 10ABCPD1234F1Z0
                    </p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-sm font-extrabold uppercase text-gray-700">
                      TAX INVOICE
                    </h3>
                    <div className="mt-1 space-y-0.5">
                      <div><strong>Invoice #:</strong> {previewInvoice.invoice_number}</div>
                      <div><strong>Date:</strong> {previewInvoice.invoice_date}</div>
                      {previewInvoice.due_date && <div><strong>Due Date:</strong> {previewInvoice.due_date}</div>}
                    </div>
                  </div>
                </div>

                {/* Party Details */}
                <div className="mb-6 text-xs bg-gray-50 p-3 rounded border border-gray-200 flex justify-between">
                  <div>
                    <div className="text-gray-500 font-bold uppercase tracking-wider text-[9px] mb-1">
                      Billed To
                    </div>
                    <div className="font-bold text-sm">{previewInvoice.party_name}</div>
                    <div className="text-gray-600 mt-1">
                      {previewInvoice.party_id ? "Active Account Customer" : "One-off Counter Sale"}
                    </div>
                  </div>
                  <div className="text-right text-gray-600">
                    <div>Status: <strong>{previewInvoice.is_cancelled ? "CANCELLED" : "ACTIVE"}</strong></div>
                    {previewInvoice.notes && <div className="mt-1">Notes: {previewInvoice.notes}</div>}
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full text-xs text-left border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold">
                      <th className="px-3 py-2 border-r border-gray-200">#</th>
                      <th className="px-3 py-2 border-r border-gray-200">Product Name</th>
                      <th className="px-3 py-2 border-r border-gray-200">Qty</th>
                      <th className="px-3 py-2 border-r border-gray-200 text-right">Rate</th>
                      <th className="px-3 py-2 border-r border-gray-200 text-right">Disc %</th>
                      <th className="px-3 py-2 border-r border-gray-200 text-right">GST %</th>
                      <th className="px-3 py-2 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {previewInvoice.items?.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="px-3 py-2 border-r border-gray-200 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2 border-r border-gray-200 font-semibold">{item.product_name}</td>
                        <td className="px-3 py-2 border-r border-gray-200">
                          {item.quantity} {item.unit || "BAG"}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200 text-right">
                          ₹{item.rate.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200 text-right">{item.discount_pct}%</td>
                        <td className="px-3 py-2 border-r border-gray-200 text-right">{item.gst_pct}%</td>
                        <td className="px-3 py-2 text-right font-bold">
                          ₹{item.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Final values summary */}
                <div className="mt-6 flex justify-end">
                  <div className="w-full max-w-xs space-y-1.5 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-bold">₹{previewInvoice.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount Value:</span>
                      <span className="font-bold">-₹{previewInvoice.discount_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST Amount:</span>
                      <span className="font-bold">+₹{previewInvoice.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="h-[1px] bg-gray-200 my-1" />
                    <div className="flex justify-between text-sm font-extrabold text-black">
                      <span>Grand Total:</span>
                      <span>₹{previewInvoice.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-400 text-center select-none">
                  Thank you for your business. Sandeep Traders · Business Suite
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-textMuted">Loading invoices page...</div>}>
      <InvoicesContent />
    </Suspense>
  );
}
