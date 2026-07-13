"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../store/ui-store";
import { productService, ProductCreatePayload } from "../../services/product-service";
import MainLayout from "../../components/layout/MainLayout";
import { Product } from "../../types";
import { Search, Plus, Trash2, X, Archive, HelpCircle, Edit2 } from "lucide-react";
import { useAuthStore } from "../../store/auth-store";

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const activeModule = useUIStore((s) => s.activeModule);
  const user = useAuthStore((s) => s.user);

  const [q, setQ] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form fields state
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [formError, setFormError] = useState("");

  // Fetch products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", activeModule, q],
    queryFn: () => productService.list(activeModule, q),
  });

  // Save product mutation
  const saveMutation = useMutation({
    mutationFn: (payload: ProductCreatePayload) => productService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      closeProductModal();
    },
    onError: (err: any) => {
      setFormError(err.message || "An error occurred");
    },
  });

  // Update product mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      productService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      closeProductModal();
    },
    onError: (err: any) => {
      setFormError(err.message || "An error occurred");
    },
  });

  // Delete product mutation
  const deleteMutation = useMutation({
    mutationFn: (pid: string) => productService.delete(pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const openAddModal = () => {
    setName("");
    setUnit("");
    setRate("");
    setFormError("");
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setUnit(p.default_unit || "");
    setRate(p.default_rate !== null ? String(p.default_rate) : "");
    setFormError("");
    setIsModalOpen(true);
  };

  const closeProductModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }

    const payload = {
      name: name.trim().toUpperCase(),
      party_type: activeModule,
      default_unit: unit.trim().toUpperCase() || undefined,
      default_rate: rate ? parseFloat(rate) : undefined,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, payload });
    } else {
      saveMutation.mutate(payload);
    }
  };

  const handleDelete = (p: Product) => {
    if (confirm(`Are you sure you want to delete ${p.name}?`)) {
      deleteMutation.mutate(p.id);
    }
  };



  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-wide">📦 Item Catalog</h1>
            <p className="text-xs text-textMuted mt-1">
              Configure items and define base billing rates.
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue hover:bg-blue/90 text-white font-semibold text-xs transition-colors shadow shadow-blue/10 cursor-pointer self-start"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Add New Item</span>
          </button>
        </div>

        {/* Filter controls */}
        <div className="flex bg-card p-4 rounded-xl border border-white/5">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input
              type="text"
              placeholder="Search products by name..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => {
            // Eager stats properties from list API
            const returnedQty = (p as any).total_returned_qty || 0;
            const latestReturnDate = (p as any).latest_return_date;

            return (
              <div
                key={p.id}
                className="relative rounded-xl border border-white/5 bg-card p-5 hover:border-white/10 transition-colors flex flex-col justify-between"
              >
                <div>
                  {/* Product title */}
                  <h3 className="font-extrabold text-foreground tracking-wide line-clamp-2">
                    {p.name}
                  </h3>

                  {/* Pricing details */}
                  <div className="text-xs text-textMuted mt-1.5 flex items-baseline gap-1 select-none">
                    <span className="text-sm font-extrabold text-foreground">
                      ₹{p.default_rate.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span>/ {p.default_unit || "UNIT"}</span>
                  </div>



                  {/* Return statistics (if present) */}
                  {returnedQty > 0 && (
                    <div className="mt-4 p-2 rounded bg-white/2 border border-white/5 space-y-1">
                      <div className="flex justify-between text-[10px] text-textMuted">
                        <span>Total Returned:</span>
                        <span className="font-bold text-appRed">{returnedQty} {p.default_unit}</span>
                      </div>
                      {latestReturnDate && (
                        <div className="flex justify-between text-[9px] text-textMuted">
                          <span>Latest Date:</span>
                          <span className="font-semibold">{latestReturnDate}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex justify-end gap-2 border-t border-border pt-3 mt-4">
                  <button
                    onClick={() => openEditModal(p)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-blue/20 hover:bg-blue/10 text-blue cursor-pointer transition-colors"
                    title="Edit Item"
                  >
                    <Edit2 size={12} />
                  </button>
                  {user?.role !== "staff" && (
                    <button
                      onClick={() => handleDelete(p)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-appRed/20 hover:bg-appRed/10 text-appRed cursor-pointer transition-colors"
                      title="Delete Product"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {products.length === 0 && (
            <div className="col-span-full py-16 text-center text-textMuted border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2">
              <Archive size={32} className="text-textDark" />
              <span>{isLoading ? "Loading catalog..." : "No products found."}</span>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">
                {editingProduct ? "✏️ Edit Item Details" : "📦 Add New Item"}
              </h3>
              <button
                type="button"
                onClick={closeProductModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ULTRATECH CEMENT"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Default Unit
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BAG, TON, PCS"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Selling Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>
              </div>

              {formError && (
                <div className="text-xs font-semibold text-red bg-red/10 border border-red/20 px-3 py-2 rounded-lg">
                  ⚠️ {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border mt-5">
                <button
                  type="button"
                  onClick={closeProductModal}
                  className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending || updateMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {saveMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingProduct
                    ? "Save Changes"
                    : "Add Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
