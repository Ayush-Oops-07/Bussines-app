"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUIStore } from "../../store/ui-store";
import { useAuthStore } from "../../store/auth-store";
import {
  Menu,
  Plus,
  ChevronDown,
  User as UserIcon,
  Key,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import clsx from "clsx";

export default function Topbar() {
  const router = useRouter();
  const pathname = usePathname();

  const { activeModule, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const userRef = useRef<HTMLDivElement>(null);

  // Initialize theme mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("themeMode") as "light" | "dark" | null;
      const initialTheme = savedTheme || "light";
      setThemeMode(initialTheme);
      if (initialTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = themeMode === "light" ? "dark" : "light";
    setThemeMode(nextTheme);
    localStorage.setItem("themeMode", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const getBreadcrumbLabel = () => {
    if (pathname.includes("/dashboard")) return "Dashboard";
    if (pathname.includes("/customers")) {
      return activeModule === "customer" ? "Customers" : "Shopers";
    }
    if (pathname.includes("/products")) return "Products";
    if (pathname.includes("/invoices")) return "Invoices";
    if (pathname.includes("/purchase-returns")) return "Purchase Returns";
    if (pathname.includes("/ledger")) return "Ledger";
    if (pathname.includes("/reports")) return "Reports";
    if (pathname.includes("/settings")) return "Settings";
    return "";
  };

  const getSubTitle = () => {
    if (pathname.includes("/dashboard")) {
      return activeModule === "customer" ? "Customer Module" : "Shoper Module";
    }
    if (pathname.includes("/customers")) {
      return activeModule === "customer" ? "Manage retail clients" : "Manage wholesale shopers";
    }
    if (pathname.includes("/invoices")) return "Manage sale invoices";
    if (pathname.includes("/purchase-returns")) return "Manage credit return invoices";
    if (pathname.includes("/ledger")) return "Statements and accounts overview";
    if (pathname.includes("/reports")) return "Monthly analytics exports";
    if (pathname.includes("/settings")) return "Configure billing profiles";
    return "Operations Panel";
  };

  return (
    <header className="no-print sticky top-0 z-30 flex h-[70px] w-full items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-2">
        {/* Mobile menu toggle */}
        <button
          onClick={toggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] md:hidden cursor-pointer"
        >
          <Menu size={20} />
        </button>

        {/* Dynamic Page Title & Subtitle */}
        <div className="flex flex-col">
          <span className="text-[20px] font-bold text-foreground leading-tight">
            {getBreadcrumbLabel()}
          </span>
          <span className="text-[11px] font-semibold text-textMuted leading-none mt-0.5">
            {getSubTitle()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Toggle Theme Mode Button */}
        <button
          onClick={toggleTheme}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-textMuted hover:bg-[#F6F8FC] cursor-pointer transition-colors"
          title="Toggle Light/Dark Theme"
        >
          {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Quick New Entry Actions */}
        <button
          onClick={() => {
            router.push("/invoices?new=true");
          }}
          className="flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-blue hover:bg-blue/90 text-white font-bold text-[14px] shadow-sm shadow-blue/20 transition-all cursor-pointer active:scale-98"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>New Invoice</span>
        </button>

        {/* User Pill profile dropdown */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2 h-11 px-4 rounded-xl border border-border bg-card hover:bg-[#F6F8FC] transition-colors cursor-pointer"
          >
            <UserIcon size={15} className="text-textMuted" />
            <span className="hidden text-xs font-semibold md:inline text-foreground">
              {user?.username || "Admin"}
            </span>
            <ChevronDown size={14} className="text-textMuted" />
          </button>

          {/* User dropdown card */}
          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card p-1 shadow-lg z-50">
              <div className="px-3 py-2">
                <div className="text-xs font-bold text-foreground capitalize">
                  {user?.full_name || "Administrator"}
                </div>
                <div className="text-[10px] text-textMuted capitalize">
                  {user?.role || "admin"}
                </div>
              </div>
              <div className="h-[1px] w-full bg-border my-1" />
              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  router.push("/settings");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-textMuted hover:bg-[#F6F8FC] hover:text-foreground text-left cursor-pointer transition-colors"
              >
                <Key size={14} />
                <span>Change Password</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red hover:bg-red/10 text-left cursor-pointer transition-colors"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
