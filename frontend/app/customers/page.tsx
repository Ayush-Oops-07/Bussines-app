"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../store/ui-store";
import { customerService, PartyCreatePayload } from "../../services/customer-service";
import MainLayout from "../../components/layout/MainLayout";
import { Party } from "../../types";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/auth-store";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  X,
  Phone,
  MapPin,
  FileText,
} from "lucide-react";
import clsx from "clsx";

export default function CustomersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const activeModule = useUIStore((s) => s.activeModule);
  const user = useAuthStore((s) => s.user);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "", "pending", "advance", "clear"
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);

  // Form Fields State
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobile2, setMobile2] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // Fetch Parties list
  const { data: parties = [], isLoading } = useQuery({
    queryKey: ["parties", activeModule, q, statusFilter],
    queryFn: () => customerService.list(activeModule, q, statusFilter),
  });

  // Mutate Save Party (Create / Update)
  const saveMutation = useMutation({
    mutationFn: (payload: PartyCreatePayload) => {
      if (editingParty) {
        return customerService.update(editingParty.id, payload);
      }
      return customerService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closePartyModal();
    },
    onError: (err: any) => {
      setFormError(err.message || "An error occurred");
    },
  });

  // Mutate Delete Party
  const deleteMutation = useMutation({
    mutationFn: (pid: string) => customerService.delete(pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const openAddModal = () => {
    setEditingParty(null);
    setName("");
    setMobile("");
    setMobile2("");
    setCity("");
    setAddress("");
    setGstin("");
    setOpeningBalance("0");
    setNotes("");
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (party: Party) => {
    setEditingParty(party);
    setName(party.name);
    setMobile(party.mobile);
    setMobile2(party.mobile2);
    setCity(party.city);
    setAddress(party.address);
    setGstin(party.gstin);
    setOpeningBalance(String(party.opening_balance));
    setNotes(party.notes);
    setFormError("");
    setIsModalOpen(true);
  };

  const closePartyModal = () => {
    setIsModalOpen(false);
    setEditingParty(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }

    saveMutation.mutate({
      party_type: activeModule,
      name: name.trim().toUpperCase(),
      mobile: mobile.trim(),
      mobile2: mobile2.trim(),
      city: city.trim(),
      address: address.trim(),
      gstin: gstin.trim(),
      opening_balance: parseFloat(openingBalance) || 0,
      notes: notes.trim(),
    });
  };

  const handleDelete = (party: Party) => {
    if (
      confirm(
        `Are you sure you want to delete ${party.name}? This will hide the account but preserve transaction history.`
      )
    ) {
      deleteMutation.mutate(party.id);
    }
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-appRed font-bold";
    if (balance < 0) return "text-appGreen font-bold";
    return "text-textMuted font-bold";
  };

  const getBalanceStatusBadge = (balance: number) => {
    if (balance > 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-appRed/10 text-appRed">
          Pending
        </span>
      );
    }
    if (balance < 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-appGreen/10 text-appGreen">
          Advance
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-textMuted">
        Clear
      </span>
    );
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-wide">
              {activeModule === "customer" ? "👥 Customer Management" : "🏬 Wholesale Shoper Accounts"}
            </h1>
            <p className="text-xs text-textMuted mt-1">
              Add accounts, edit profiles, and launch individual business ledgers.
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue hover:bg-blue/90 text-white font-semibold text-xs transition-colors shadow shadow-blue/10 cursor-pointer self-start"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Add New Account</span>
          </button>
        </div>

        {/* Filter controls */}
        <div className="flex flex-col md:flex-row gap-4 justify-between bg-card p-4 rounded-xl border border-white/5">
          {/* Quick search input */}
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input
              type="text"
              placeholder="Search by name or mobile..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex rounded-[12px] bg-[#F8FAFC] dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] p-1 gap-1">
            {[
              { id: "", label: "All" },
              { id: "pending", label: "Pending" },
              { id: "advance", label: "Advance" },
              { id: "clear", label: "Clear" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={clsx(
                  "px-3 py-1 text-xs font-bold rounded cursor-pointer transition-colors",
                  statusFilter === tab.id
                    ? activeModule === "customer"
                      ? "bg-blue text-white"
                      : "bg-appViolet text-white"
                    : "text-textMuted hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block rounded-xl border border-white/5 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/5 bg-bg2/40 text-textMuted font-bold uppercase tracking-wider">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">Balance (₹)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {parties.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 text-textMuted">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-textMuted">{p.mobile || "—"}</td>
                    <td className="px-4 py-3 text-textMuted">
                      {p.city ? `${p.city}, ${p.address || ""}`.substring(0, 30) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right ${getBalanceColor(p.balance)}`}>
                      {p.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">{getBalanceStatusBadge(p.balance)}</td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                      <button
                        onClick={() => router.push(`/ledger?party=${p.id}`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue/10 hover:bg-blue/20 text-blue font-bold tracking-wide transition-colors cursor-pointer"
                        title="Open Ledger"
                      >
                        <BookOpen size={12} />
                        <span>Ledger</span>
                      </button>
                      <button
                        onClick={() => openEditModal(p)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-white/5 hover:bg-white/5 text-textMuted hover:text-foreground cursor-pointer transition-colors"
                        title="Edit profile"
                      >
                        <Edit2 size={12} />
                      </button>
                      {user?.role !== "staff" && (
                        <button
                          onClick={() => handleDelete(p)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-appRed/20 hover:bg-appRed/10 text-appRed cursor-pointer transition-colors"
                          title="Delete Party"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {parties.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-textMuted">
                      {isLoading ? "Loading accounts..." : "No accounts found matching your filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards View */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {parties.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/5 bg-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-foreground">{p.name}</h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-textMuted mt-1">
                    <Phone size={10} />
                    <span>{p.mobile || "No mobile"}</span>
                  </div>
                </div>
                {getBalanceStatusBadge(p.balance)}
              </div>

              {p.address && (
                <div className="flex items-start gap-1.5 text-[10px] text-textMuted">
                  <MapPin size={12} className="shrink-0 mt-0.5" />
                  <span>
                    {p.city ? `${p.city}, ` : ""}
                    {p.address}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center py-2 border-t border-b border-white/5 my-1">
                <span className="text-[10px] text-textMuted uppercase font-bold">Outstanding Balance</span>
                <span className={`text-sm ${getBalanceColor(p.balance)}`}>
                  ₹{p.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => router.push(`/ledger?party=${p.id}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue text-white text-xs font-bold transition-all cursor-pointer shadow"
                >
                  <BookOpen size={14} />
                  <span>Ledger History</span>
                </button>
                <button
                  onClick={() => openEditModal(p)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 hover:bg-white/5 text-textMuted hover:text-foreground cursor-pointer transition-colors"
                >
                  <Edit2 size={14} />
                </button>
                {user?.role !== "staff" && (
                  <button
                    onClick={() => handleDelete(p)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-appRed/20 hover:bg-appRed/10 text-appRed cursor-pointer transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {parties.length === 0 && (
            <div className="py-12 text-center text-textMuted border border-dashed border-white/5 rounded-xl">
              {isLoading ? "Loading accounts..." : "No accounts found."}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Party Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[20px] border border-border bg-card p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">
                {editingParty ? "✏️ Edit Party Details" : "👥 Add New Account"}
              </h3>
              <button
                onClick={closePartyModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    placeholder="10-digit number"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Alternate Mobile
                  </label>
                  <input
                    type="text"
                    placeholder="Secondary contact"
                    value={mobile2}
                    onChange={(e) => setMobile2(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="Enter city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Full Address
                  </label>
                  <textarea
                    placeholder="Street, locality, area details..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    placeholder="GST number"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    disabled={!!editingParty}
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Notes
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
                  onClick={closePartyModal}
                  className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : "Save Party"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
