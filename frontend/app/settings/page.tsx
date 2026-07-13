"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authService } from "../../services/auth-service";
import MainLayout from "../../components/layout/MainLayout";
import { useAuthStore } from "../../store/auth-store";
import { Key, Lock, CheckCircle, AlertTriangle, ShieldAlert } from "lucide-react";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  if (user?.role === "staff") {
    return (
      <MainLayout>
        <div className="max-w-md mx-auto rounded-xl border border-white/5 bg-card p-6 shadow-xl text-center space-y-4 my-12 select-none">
          <div className="flex justify-center text-appRed">
            <ShieldAlert size={48} />
          </div>
          <h2 className="text-base font-bold text-foreground">Access Denied</h2>
          <p className="text-xs text-textMuted">
            You do not have permissions to access settings. Please contact your administrator.
          </p>
        </div>
      </MainLayout>
    );
  }

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const changeMutation = useMutation({
    mutationFn: () => authService.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
    },
    onError: (err: any) => {
      setError(err.message || "An error occurred");
      setSuccess(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      setError("Please enter current password");
      return;
    }
    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError("");
    setSuccess(false);
    changeMutation.mutate();
  };

  return (
    <MainLayout>
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-wide flex items-center gap-2">
            <Lock size={20} className="text-blue" />
            <span>Settings & Security</span>
          </h1>
          <p className="text-xs text-textMuted mt-1">
            Manage your account passwords and security preferences.
          </p>
        </div>

        <div className="rounded-xl border border-white/5 bg-card p-6 shadow-xl">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
            <Key size={16} />
            <span>Change Account Password</span>
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                Current Password *
              </label>
              <input
                type="password"
                required
                placeholder="Enter current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                New Password *
              </label>
              <input
                type="password"
                required
                placeholder="Enter new password (min 4 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                Confirm New Password *
              </label>
              <input
                type="password"
                required
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
              />
            </div>

            {error && (
              <div className="text-xs font-semibold text-appRed bg-appRed/10 border border-appRed/20 px-3 py-2 rounded-lg flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="text-xs font-semibold text-appGreen bg-appGreen/10 border border-appGreen/20 px-3 py-2 rounded-lg flex items-center gap-1.5">
                <CheckCircle size={14} />
                <span>Password changed successfully!</span>
              </div>
            )}

            <button
              type="submit"
              disabled={changeMutation.isPending}
              className="flex w-full h-[46px] items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-blue to-blue/90 hover:from-blue/95 hover:to-blue/85 text-white font-bold text-sm transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              {changeMutation.isPending ? "Updating Password..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </MainLayout>
  );
}
