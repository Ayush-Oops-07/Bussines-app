"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/auth-store";
import { authService } from "../../services/auth-service";
import { Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError("Please select a user");
      return;
    }
    if (!password) {
      setError("Please enter password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await authService.login(username, password);
      setAuth(res.access_token, res.user);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-tr from-[#E0E7FF] via-[#F6F8FC] to-[#ECFDF5] px-4 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Modern Gradient Orbs */}
      <div className="absolute -top-[200px] -left-[150px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-blue/10 to-[#8B5CF6]/5 blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute -bottom-[150px] -right-[100px] w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-green/10 to-blue/5 blur-[100px] pointer-events-none" />

      {/* Premium Glassmorphic Card */}
      <div className="relative z-10 w-full max-w-[440px] rounded-[24px] border border-white/50 bg-white/70 p-8 shadow-[0_20px_50px_rgba(37,99,235,0.06)] backdrop-blur-xl transition-all duration-300">
        {/* Brand Header */}
        <div className="flex items-center gap-4 mb-6 select-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue to-[#1D4ED8] shadow-md shadow-blue/20">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path
                d="M8 20l5-8 4 6 3-4 4 6"
                stroke="#fff"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-[#111827] uppercase leading-none">
              SANDEEP TRADERS
            </h1>
            <p className="text-[11px] text-textMuted font-bold uppercase tracking-widest mt-1">
              Thawe · Business Suite
            </p>
          </div>
        </div>

        <div className="h-[1px] w-full bg-border/60 mb-6" />

        <form onSubmit={handleLogin} className="space-y-6">
          {/* User selector dropdown */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-textMuted">
              Select User
            </label>
            <div className="relative">
              <select
                id="login-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-[46px] px-4 rounded-xl bg-white/80 border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all appearance-none cursor-pointer font-medium"
              >
                <option value="">— Select User —</option>
                <option value="admin">Admin (Administrator)</option>
                <option value="mandeep">Mandeep (Sales Executive)</option>
                <option value="sandeep">Sandeep (Owner)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-textMuted text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-textMuted">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[46px] pl-4 pr-11 rounded-xl bg-white/80 border border-border text-foreground text-sm outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-foreground transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-xs font-semibold text-red bg-red/10 border border-red/20 px-3 py-2.5 rounded-xl">
              ⚠️ {error}
            </div>
          )}

          {/* Premium Gradient Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-blue text-white font-bold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue/20 hover:shadow-lg hover:shadow-blue/30 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          >
            <span>{loading ? "Signing In..." : "Sign In"}</span>
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 mt-6 text-[10px] text-textMuted font-bold uppercase tracking-wider select-none">
          <ShieldCheck size={12} className="text-blue" />
          <span>Secured · Session expires on exit</span>
        </div>
      </div>
    </div>
  );
}
