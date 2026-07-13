"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../store/ui-store";
import { returnService, ReturnCreatePayload, ReturnItemPayload } from "../../services/return-service";
import { customerService } from "../../services/customer-service";
import { invoiceService } from "../../services/invoice-service";
import { productService } from "../../services/product-service";
import MainLayout from "../../components/layout/MainLayout";
import { PurchaseReturn, Invoice, Party } from "../../types";
import {
  Search,
  Plus,
  Trash2,
  Printer,
  X,
  RotateCcw,
  Eye,
  Calendar,
} from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../store/auth-store";
import CustomerSearchCombobox from "../../components/ui/CustomerSearchCombobox";
import ProductSearchCombobox from "../../components/ui/ProductSearchCombobox";

function ReturnsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const activeModule = useUIStore((s) => s.activeModule);
  const user = useAuthStore((s) => s.user);

  // Filter States
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewReturn, setPreviewReturn] = useState<PurchaseReturn | null>(null);

  // Form Fields State
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [partySearchQ, setPartySearchQ] = useState("");
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [refInvoiceId, setRefInvoiceId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReturnItemPayload[]>([
    { product_name: "", unit: "BAG", quantity: 1, rate: 0, discount_pct: 0, gst_pct: 0, total: 0 },
  ]);
  const [formError, setFormError] = useState("");

  // Product autocomplete state
  const [prodSearchActiveIdx, setProdSearchActiveIdx] = useState<number | null>(null);
  const [prodSearchQ, setProdSearchQ] = useState("");

  // Fetch Returns
  const { data: returnsData, isLoading } = useQuery({
    queryKey: ["returns", activeModule, q, fromDate, toDate, page],
    queryFn: () =>
      returnService.list({
        party_type: activeModule,
        q,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        per_page: 25,
      }),
  });

  // Fetch Parties for lookups
  const { data: partiesList = [] } = useQuery({
    queryKey: ["parties-lookup-ret", activeModule, partySearchQ],
    queryFn: () => customerService.list(activeModule, partySearchQ),
    enabled: partySearchQ.length > 0,
  });

  // Fetch Reference invoices for chosen party
  const { data: refInvoices = { invoices: [], total: 0, page: 1, per_page: 100 } } = useQuery({
    queryKey: ["ref-invoices", activeModule, selectedParty?.id],
    queryFn: () =>
      invoiceService.list({
        party_type: activeModule,
        party_id: selectedParty?.id,
        per_page: 100,
      }),
    enabled: !!selectedParty?.id,
  });

  // Fetch products for product search suggestions
  const { data: productsList = [] } = useQuery({
    queryKey: ["products-lookup-ret", activeModule, prodSearchQ],
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

  // Handle ref invoice change -> pre-populate returned items
  const handleRefInvoiceChange = async (id: string) => {
    setRefInvoiceId(id);
    if (!id) return;

    try {
      const fullInvoice = await invoiceService.get(id);
      if (fullInvoice && fullInvoice.items) {
        setItems(
          fullInvoice.items.map((it) => ({
            product_name: it.product_name,
            unit: it.unit,
            quantity: it.quantity,
            rate: it.rate,
            discount_pct: it.discount_pct,
            gst_pct: it.gst_pct,
            total: it.total,
          }))
        );
      }
    } catch (err: any) {
      alert("Error loading reference invoice items: " + err.message);
    }
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: ReturnCreatePayload) => returnService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["party-summary"] });
      closeCreateModal();
    },
    onError: (err: any) => setFormError(err.message || "An error occurred"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => returnService.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setIsPreviewOpen(false);
      setPreviewReturn(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => returnService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setIsPreviewOpen(false);
      setPreviewReturn(null);
    },
  });

  const openCreateModal = () => {
    setSelectedParty(null);
    setPartySearchQ("");
    setReturnDate(new Date().toISOString().split("T")[0]);
    setRefInvoiceId("");
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
  const updateItemField = (idx: number, field: keyof ReturnItemPayload, value: any) => {
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

  // Compute aggregates
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

  const handleSaveReturn = (e: React.FormEvent) => {
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
      setFormError("Each returned item must have a valid description and positive rate/amount");
      return;
    }

    createMutation.mutate({
      party_id: selectedParty.id,
      party_type: activeModule,
      return_date: returnDate,
      reference_invoice_id: refInvoiceId || undefined,
      notes: notes.trim(),
      items: items.map((it) => ({
        ...it,
        product_name: it.product_name.toUpperCase(),
        unit: it.unit ? it.unit.toUpperCase() : undefined,
      })),
    });
  };

  const handleCancelReturn = (id: string) => {
    if (confirm("Are you sure you want to CANCEL this return invoice? This will reset credit totals to 0.")) {
      cancelMutation.mutate(id);
    }
  };

  const handleDeleteReturn = (id: string) => {
    if (confirm("Are you sure you want to completely DELETE this return invoice from database?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenPreview = async (ret: PurchaseReturn) => {
    try {
      const details = await returnService.get(ret.id);
      setPreviewReturn(details);
      setIsPreviewOpen(true);
    } catch (err: any) {
      alert("Error loading return details: " + err.message);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const returns = returnsData?.returns || [];

  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
          <div>
            <h1 className="text-xl font-bold tracking-wide">🔄 Purchase Returns</h1>
            <p className="text-xs text-textMuted mt-1">
              Track customer return invoices, reference sold items, and recalculate store balances.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue hover:bg-blue/90 text-white font-semibold text-xs transition-colors shadow shadow-blue/10 cursor-pointer self-start"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Create Return</span>
          </button>
        </div>

        {/* Filter controls */}
        <div className="flex flex-col md:flex-row gap-4 justify-between bg-card p-4 rounded-xl border border-white/5 no-print">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input
              type="text"
              placeholder="Search return number or party..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
            <span className="text-xs text-textMuted">to</span>
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
              }}
              className="text-xs font-bold text-blue hover:underline cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Returns list table */}
        <div className="rounded-xl border border-white/5 bg-card overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/5 bg-bg2/40 text-textMuted font-bold uppercase tracking-wider">
                  <th className="px-4 py-3">Return #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Ref Invoice</th>
                  <th className="px-4 py-3">Party Name</th>
                  <th className="px-4 py-3 text-right">Amount (₹)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-semibold text-foreground">{ret.return_number}</td>
                    <td className="px-4 py-3 text-textMuted">{ret.return_date}</td>
                    <td className="px-4 py-3 font-medium text-blue">
                      {ret.reference_invoice_number || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">{ret.party_name}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-foreground">
                      ₹{ret.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      {ret.is_cancelled ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-appRed/10 text-appRed">
                          Cancelled
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-appGreen/10 text-appGreen">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right flex justify-end items-center gap-2">
                      <button
                        onClick={() => handleOpenPreview(ret)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue/10 hover:bg-blue/20 text-blue font-bold tracking-wide transition-colors cursor-pointer"
                      >
                        <Eye size={12} />
                        <span>Preview</span>
                      </button>
                      {!ret.is_cancelled && user?.role !== "staff" && (
                        <button
                          onClick={() => handleCancelReturn(ret.id)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-appRed/20 hover:bg-appRed/10 text-appRed cursor-pointer transition-colors"
                          title="Cancel Return"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-textMuted">
                      {isLoading ? "Loading returns list..." : "No return invoices found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Return modal form */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-[24px] border border-border bg-card p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[95vh] transition-all duration-300">
              <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
                <h3 className="text-base font-bold text-foreground">🔄 Create Return Invoice</h3>
                <button
                  onClick={closeCreateModal}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveReturn} className="space-y-5">
                {/* Party selector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Select Party Name <span className="text-red">*</span>
                    </label>
                    <CustomerSearchCombobox
                      partyType={activeModule}
                      selectedPartyId={selectedParty?.id || ""}
                      onSelect={(party) => {
                        setSelectedParty(party);
                        setRefInvoiceId("");
                      }}
                    />
                  </div>

                  {/* Ref Invoice selection dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                      Reference Sales Invoice (Optional)
                    </label>
                    <select
                      value={refInvoiceId}
                      onChange={(e) => handleRefInvoiceChange(e.target.value)}
                      disabled={!selectedParty}
                      className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-xs outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer disabled:opacity-50 text-foreground font-semibold"
                    >
                      <option value="">— Select Invoice —</option>
                      {refInvoices.invoices?.map((inv: Invoice) => (
                        <option key={inv.id} value={inv.id}>
                          Invoice {inv.invoice_number} ({inv.invoice_date}) — Total: ₹{inv.total_amount}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Return Date details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                      Return Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                      Return Invoice Number
                    </label>
                    <input
                      type="text"
                      placeholder="Auto (Generated)"
                      className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium disabled:opacity-50"
                      disabled
                    />
                  </div>
                </div>

                {/* Itemized returned lines list */}
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                      Returned Products List
                    </span>
                    <button
                      type="button"
                      onClick={addRow}
                      className="px-2 py-1 rounded bg-blue/10 hover:bg-blue/20 text-blue font-bold text-[10px] transition-colors cursor-pointer"
                    >
                      + Add Item Row
                    </button>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-bg2/40 border border-white/5 rounded-xl relative animate-fadeIn"
                      >
                        {/* Dropdown selector for Item Type */}
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[9px] font-bold text-textMuted uppercase tracking-wider">
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
                            className="absolute -top-2.5 -right-2 h-5 w-5 bg-[#0f1624] hover:bg-white/5 border border-white/10 text-textMuted hover:text-appRed flex items-center justify-center rounded-full cursor-pointer transition-colors animate-scaleIn"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Calculations sum box */}
                  <div className="mt-4 flex flex-col items-end gap-1.5 p-4 rounded-xl bg-bg2/30 border border-white/5 w-full md:max-w-xs ml-auto">
                    <div className="flex justify-between w-full text-xs text-textMuted select-none">
                      <span>Subtotal:</span>
                      <span className="font-bold">₹{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between w-full text-xs text-textMuted select-none">
                        <span>Discount Value:</span>
                        <span className="font-bold">-₹{totals.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totals.gst > 0 && (
                      <div className="flex justify-between w-full text-xs text-textMuted select-none">
                        <span>GST Amount:</span>
                        <span className="font-bold">+₹{totals.gst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="h-[1px] w-full bg-white/5 my-1" />
                    <div className="flex justify-between w-full text-xs font-extrabold select-none">
                      <span>Return Value:</span>
                      <span className="text-sm font-extrabold text-foreground">
                        ₹{totals.grand.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                    Notes
                  </label>
                  <textarea
                    placeholder="Enter notes on return invoice..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium"
                  />
                </div>

                {formError && (
                  <div className="text-xs font-semibold text-appRed bg-appRed/10 border border-appRed/20 px-3 py-2 rounded-lg">
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
                    {createMutation.isPending ? "Generating..." : "Save Return Invoice"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Return Preview Print friendly Modal */}
        {isPreviewOpen && previewReturn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-3xl rounded-[20px] border border-border bg-card p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between mb-5 border-b border-border pb-3 no-print">
                <h3 className="text-sm font-bold text-foreground">
                  🔄 Return Preview ({previewReturn.return_number})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue text-white text-xs font-bold transition-all cursor-pointer shadow shadow-blue/20"
                  >
                    <Printer size={14} />
                    <span>Print PDF</span>
                  </button>
                  {!previewReturn.is_cancelled && user?.role !== "staff" && (
                    <button
                      onClick={() => handleCancelReturn(previewReturn.id)}
                      className="px-3 py-1.5 rounded-lg border border-appRed/20 hover:bg-appRed/10 text-appRed text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel Return
                    </button>
                  )}
                  {user?.role !== "staff" && (
                    <button
                      onClick={() => handleDeleteReturn(previewReturn.id)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-textMuted hover:text-foreground text-xs font-bold transition-colors cursor-pointer"
                      title="Delete permanently"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsPreviewOpen(false);
                      setPreviewReturn(null);
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
                      CREDIT NOTE / RETURN INVOICE
                    </h3>
                    <div className="mt-1 space-y-0.5">
                      <div><strong>Return #:</strong> {previewReturn.return_number}</div>
                      <div><strong>Date:</strong> {previewReturn.return_date}</div>
                      {previewReturn.reference_invoice_number && (
                        <div><strong>Ref Invoice:</strong> {previewReturn.reference_invoice_number}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Party Details */}
                <div className="mb-6 text-xs bg-gray-50 p-3 rounded border border-gray-200 flex justify-between">
                  <div>
                    <div className="text-gray-500 font-bold uppercase tracking-wider text-[9px] mb-1">
                      Returned By
                    </div>
                    <div className="font-bold text-sm">{previewReturn.party_name}</div>
                    <div className="text-gray-600 mt-1">
                      Account Ledger credited by {previewReturn.total_amount} INR
                    </div>
                  </div>
                  <div className="text-right text-gray-600">
                    <div>Status: <strong>{previewReturn.is_cancelled ? "CANCELLED" : "ACTIVE"}</strong></div>
                    {previewReturn.notes && <div className="mt-1">Notes: {previewReturn.notes}</div>}
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
                    {previewReturn.items?.map((item, idx) => (
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

                {/* Totals Summary */}
                <div className="mt-6 flex justify-end">
                  <div className="w-full max-w-xs space-y-1.5 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-bold">₹{previewReturn.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount Value:</span>
                      <span className="font-bold">-₹{previewReturn.discount_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST Amount:</span>
                      <span className="font-bold">+₹{previewReturn.gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="h-[1px] bg-gray-200 my-1" />
                    <div className="flex justify-between text-sm font-extrabold text-black">
                      <span>Credit Value:</span>
                      <span>₹{previewReturn.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-400 text-center select-none">
                  Credit Note Generated by Sandeep Traders
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-textMuted">Loading returns page...</div>}>
      <ReturnsContent />
    </Suspense>
  );
}
