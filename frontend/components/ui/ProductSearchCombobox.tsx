"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { productService } from "../../services/product-service";
import { Product, PartyType } from "../../types";
import { Search, Plus, X, Check, PackagePlus } from "lucide-react";
import clsx from "clsx";

interface ProductSearchComboboxProps {
  partyType: PartyType;
  selectedProductName: string;
  onSelect: (product: { name: string; default_unit: string; default_rate: number } | null) => void;
  placeholder?: string;
  className?: string;
}

export default function ProductSearchCombobox({
  partyType,
  selectedProductName,
  onSelect,
  placeholder = "Search product by name...",
  className,
}: ProductSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  // Quick Product Modal state
  const [isQuickModalOpen, setIsQuickModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdUnit, setNewProdUnit] = useState("BAG");
  const [newProdRate, setNewProdRate] = useState("");
  const [quickModalError, setQuickModalError] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch all products for lookup
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const list = await productService.list(partyType, "");
      setProducts(list);
    } catch (err) {
      console.error("Failed to fetch products", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [partyType]);

  // Handle selectedProductName prop change
  useEffect(() => {
    setSearchQuery(selectedProductName || "");
  }, [selectedProductName]);

  // Filter products locally
  useEffect(() => {
    if (!searchQuery) {
      setFilteredProducts(products);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const filtered = products.filter((p) => p.name?.toLowerCase().includes(q));
    setFilteredProducts(filtered);
  }, [searchQuery, products]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset query to active selection name if open and selection exists
        if (selectedProductName) {
          setSearchQuery(selectedProductName);
        } else {
          setSearchQuery("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedProductName]);

  const handleSelect = (p: Product | { name: string; default_unit: string; default_rate: number }) => {
    setSearchQuery(p.name);
    onSelect({
      name: p.name,
      default_unit: p.default_unit || "BAG",
      default_rate: p.default_rate || 0,
    });
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchQuery("");
    onSelect(null);
    setIsOpen(false);
  };

  const openQuickAdd = () => {
    setNewProdName(searchQuery);
    setNewProdUnit("BAG");
    setNewProdRate("");
    setQuickModalError("");
    setIsQuickModalOpen(true);
    setIsOpen(false);
  };

  const handleSaveQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newProdName.trim()) {
      setQuickModalError("Product Name is required");
      return;
    }
    setQuickSaving(true);
    setQuickModalError("");

    try {
      const payload = {
        name: newProdName.trim().toUpperCase(),
        party_type: partyType,
        default_unit: newProdUnit,
        default_rate: parseFloat(newProdRate) || 0,
        stock_qty: 0,
      };

      const newProduct = await productService.create(payload);
      // Refresh local list
      await fetchProducts();
      // Auto select newly created product
      handleSelect(newProduct);
      setIsQuickModalOpen(false);
    } catch (err: any) {
      setQuickModalError(err.message || "Failed to save product");
    } finally {
      setQuickSaving(false);
    }
  };

  return (
    <div ref={containerRef} className={clsx("relative w-full", className)}>
      <div
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }}
        className="relative flex items-center justify-between w-full h-[46px] px-3.5 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue/15 focus-within:border-blue transition-all"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 pr-6">
          {isOpen ? (
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm text-foreground outline-none border-none font-medium placeholder-gray-400 p-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={clsx("text-sm truncate font-medium", selectedProductName ? "text-foreground font-bold" : "text-gray-400")}>
              {selectedProductName || placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 absolute right-3">
          {selectedProductName && (
            <button
              onClick={handleClear}
              className="p-1 rounded-full text-textMuted hover:bg-[#E5E7EB] dark:hover:bg-[#1e293b] cursor-pointer hover:text-foreground transition-all"
              title="Clear selection"
            >
              <X size={12} />
            </button>
          )}
          <span className="text-[9px] text-textMuted">▼</span>
        </div>
      </div>

      {/* Combobox Dropdown Results List */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 max-h-48 overflow-y-auto rounded-[12px] border border-border bg-card p-1.5 shadow-xl z-50 animate-fadeIn select-none">
          {filteredProducts.slice(0, 30).map((p) => {
            const text = p.name || "";
            const query = searchQuery || "";
            let contentNode = <span>{text}</span>;
            if (query) {
              const parts = text.split(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
              contentNode = (
                <span>
                  {parts.map((part, i) => 
                    part.toLowerCase() === query.toLowerCase() ? (
                      <mark key={i} className="bg-blue/20 text-blue font-extrabold px-0.5 rounded">{part}</mark>
                    ) : (
                      part
                    )
                  )}
                </span>
              );
            }

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className={clsx(
                  "flex items-center justify-between w-full text-left px-3.5 py-2.5 text-xs rounded-lg cursor-pointer transition-all",
                  selectedProductName === p.name
                    ? "bg-blue text-white font-bold"
                    : "text-foreground hover:bg-blue/5 dark:hover:bg-blue/10 font-bold"
                )}
              >
                <div>
                  <span className="uppercase">{contentNode}</span>
                  <span className={clsx("block text-[10px] mt-0.5 font-medium", selectedProductName === p.name ? "text-white/80" : "text-textMuted")}>
                    Rate: ₹{p.default_rate || "0.00"} · Unit: {p.default_unit || "unit"}
                  </span>
                </div>
                {selectedProductName === p.name && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}

          {/* Quick Add Product Option */}
          <button
            type="button"
            onClick={openQuickAdd}
            className="flex items-center gap-2 w-full text-left px-3.5 py-3 text-xs text-blue hover:bg-blue/5 dark:hover:bg-blue/10 rounded-lg cursor-pointer font-bold border-t border-border mt-1"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>➕ Add "{searchQuery || "New Product"}" instantly</span>
          </button>
        </div>
      )}

      {/* QUICK PRODUCT CREATION MODAL */}
      {isQuickModalOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div 
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-6 shadow-2xl animate-scaleIn text-left">
                <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <PackagePlus size={18} className="text-blue" />
                    <span>Quick Add Product</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsQuickModalOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSaveQuickProduct} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter product name"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue font-medium placeholder-gray-400 uppercase"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                        Default Unit *
                      </label>
                      <select
                        value={newProdUnit}
                        onChange={(e) => setNewProdUnit(e.target.value)}
                        className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-medium"
                      >
                        <option value="BAG">BAG</option>
                        <option value="TON">TON</option>
                        <option value="KG">KG</option>
                        <option value="PCS">PCS</option>
                        <option value="BOX">BOX</option>
                        <option value="LTR">LTR</option>
                        <option value="MTR">MTR</option>
                        <option value="DOZ">DOZ</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                        Selling Rate (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={newProdRate}
                        onChange={(e) => setNewProdRate(e.target.value)}
                        className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue font-medium placeholder-gray-400"
                      />
                    </div>
                  </div>

                  {quickModalError && (
                    <div className="text-xs font-semibold text-red bg-red/10 border border-red/20 px-3 py-2 rounded-xl">
                      ⚠️ {quickModalError}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3 border-t border-border mt-5">
                    <button
                      type="button"
                      onClick={() => setIsQuickModalOpen(false)}
                      className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={quickSaving}
                      className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-md shadow-blue/20 cursor-pointer disabled:opacity-50"
                    >
                      {quickSaving ? "Saving..." : "Save Product"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
