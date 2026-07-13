"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { customerService } from "../../services/customer-service";
import { Party, PartyType } from "../../types";
import { Search, Plus, X, Check, UserPlus } from "lucide-react";
import clsx from "clsx";

interface CustomerSearchComboboxProps {
  partyType: PartyType;
  selectedPartyId: string;
  onSelect: (party: Party | null) => void;
  placeholder?: string;
  className?: string;
}

export default function CustomerSearchCombobox({
  partyType,
  selectedPartyId,
  onSelect,
  placeholder = "Search party by name, mobile, or GSTIN...",
  className,
}: CustomerSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [parties, setParties] = useState<Party[]>([]);
  const [filteredParties, setFilteredParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  // Quick Customer Modal state
  const [isQuickModalOpen, setIsQuickModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustMobile, setNewCustMobile] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustOpeningBal, setNewCustOpeningBal] = useState("0");
  const [quickModalError, setQuickModalError] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch all parties for lookup on focus
  const fetchParties = async () => {
    setLoading(true);
    try {
      const list = await customerService.list(partyType, "");
      setParties(list);
    } catch (err) {
      console.error("Failed to fetch parties", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParties();
  }, [partyType]);

  // Handle selectedPartyId prop change
  useEffect(() => {
    if (selectedPartyId) {
      const match = parties.find((p) => p.id === selectedPartyId);
      if (match) {
        setSelectedParty(match);
        setSearchQuery(match.name);
      } else {
        // Fetch specific if not in cached list
        customerService.get(selectedPartyId).then((p) => {
          setSelectedParty(p);
          setSearchQuery(p.name);
        }).catch(() => {});
      }
    } else {
      setSelectedParty(null);
      setSearchQuery("");
    }
  }, [selectedPartyId, parties]);

  // Filter parties locally
  useEffect(() => {
    if (!searchQuery) {
      setFilteredParties(parties);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const filtered = parties.filter((p) => {
      const nameMatch = p.name?.toLowerCase().includes(q);
      const mobileMatch = p.mobile?.includes(q) || p.mobile2?.includes(q);
      const gstinMatch = p.gstin?.toLowerCase().includes(q);
      return nameMatch || mobileMatch || gstinMatch;
    });
    setFilteredParties(filtered);
  }, [searchQuery, parties]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset query to active selection name if open and selection exists
        if (selectedParty) {
          setSearchQuery(selectedParty.name);
        } else if (!selectedPartyId) {
          setSearchQuery("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedParty, selectedPartyId]);

  const handleSelect = (party: Party) => {
    setSelectedParty(party);
    setSearchQuery(party.name);
    onSelect(party);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedParty(null);
    setSearchQuery("");
    onSelect(null);
    setIsOpen(false);
  };

  const openQuickAdd = () => {
    setNewCustName(searchQuery);
    setNewCustMobile("");
    setNewCustAddress("");
    setNewCustOpeningBal("0");
    setQuickModalError("");
    setIsQuickModalOpen(true);
    setIsOpen(false);
  };

  const handleSaveQuickCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newCustName.trim()) {
      setQuickModalError("Name is required");
      return;
    }
    setQuickSaving(true);
    setQuickModalError("");

    try {
      const payload = {
        party_type: partyType,
        name: newCustName.trim().toUpperCase(),
        mobile: newCustMobile.trim() || undefined,
        address: newCustAddress.trim() || undefined,
        opening_balance: parseFloat(newCustOpeningBal) || 0,
      };

      const newParty = await customerService.create(payload);
      // Refresh local copy
      await fetchParties();
      // Auto select newly created customer
      handleSelect(newParty);
      setIsQuickModalOpen(false);
    } catch (err: any) {
      setQuickModalError(err.message || "Failed to save customer");
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
        className="relative flex items-center justify-between w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] cursor-pointer select-none focus-within:ring-2 focus-within:ring-blue/15 focus-within:border-blue transition-all"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-8">
          <Search size={16} className="text-textMuted shrink-0" />
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
            <span className={clsx("text-sm truncate font-medium", selectedParty ? "text-foreground font-bold" : "text-gray-400")}>
              {selectedParty ? `${selectedParty.name} ${selectedParty.mobile ? `(${selectedParty.mobile})` : ""}` : placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 absolute right-3">
          {selectedParty && (
            <button
              onClick={handleClear}
              className="p-1 rounded-full text-textMuted hover:bg-[#E5E7EB] dark:hover:bg-[#1e293b] cursor-pointer hover:text-foreground transition-all"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <span className="text-[10px] text-textMuted">▼</span>
        </div>
      </div>

      {/* Combobox Dropdown Results List */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-[12px] border border-border bg-card p-1.5 shadow-xl z-50 animate-fadeIn select-none">
          {filteredParties.slice(0, 30).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className={clsx(
                "flex items-center justify-between w-full text-left px-3.5 py-2.5 text-xs rounded-lg cursor-pointer transition-all",
                selectedPartyId === p.id
                  ? "bg-blue text-white font-bold"
                  : "text-foreground hover:bg-blue/5 dark:hover:bg-blue/10 font-bold"
              )}
            >
              <div>
                <span className="capitalize">{p.name}</span>
                <span className={clsx("block text-[10px] mt-0.5 font-medium", selectedPartyId === p.id ? "text-white/80" : "text-textMuted")}>
                  {p.mobile ? `📞 ${p.mobile}` : "No mobile"} {p.gstin ? ` · GSTIN: ${p.gstin}` : ""} {p.city ? ` · ${p.city}` : ""}
                </span>
              </div>
              {selectedPartyId === p.id && <Check size={14} className="shrink-0" />}
            </button>
          ))}

          {/* Quick Add Option */}
          <button
            type="button"
            onClick={openQuickAdd}
            className="flex items-center gap-2 w-full text-left px-3.5 py-3 text-xs text-blue hover:bg-blue/5 dark:hover:bg-blue/10 rounded-lg cursor-pointer font-bold border-t border-border mt-1"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>➕ Add "{searchQuery || "New Customer"}" instantly</span>
          </button>
        </div>
      )}

      {/* QUICK CUSTOMER / PARTY CREATION MODAL */}
      {isQuickModalOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div 
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-6 shadow-2xl animate-scaleIn text-left">
                <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <UserPlus size={18} className="text-blue" />
                    <span>Quick Add {partyType === "customer" ? "Customer" : "Shoper"}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsQuickModalOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSaveQuickCustomer} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter full name"
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue font-medium placeholder-gray-400 uppercase"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                        Mobile Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 9876543210"
                        value={newCustMobile}
                        onChange={(e) => setNewCustMobile(e.target.value)}
                        className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue font-medium placeholder-gray-400"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                        Opening Bal (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={newCustOpeningBal}
                        onChange={(e) => setNewCustOpeningBal(e.target.value)}
                        className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue font-medium placeholder-gray-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                      Address
                    </label>
                    <input
                      type="text"
                      placeholder="Enter shop or residence address"
                      value={newCustAddress}
                      onChange={(e) => setNewCustAddress(e.target.value)}
                      className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue font-medium placeholder-gray-400"
                    />
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
                      {quickSaving ? "Saving..." : "Save Customer"}
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
