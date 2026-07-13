"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUIStore } from "../../store/ui-store";
import { useAuthStore } from "../../store/auth-store";
import {
  LayoutDashboard,
  Users,
  FileText,
  RotateCcw,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  CreditCard,
} from "lucide-react";
import clsx from "clsx";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const { activeModule, sidebarOpen, closeSidebar, setModule } = useUIStore();
  const { user, logout } = useAuthStore();
  const [profileOpen, setProfileOpen] = useState(false);

  const mainItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
    },
    {
      id: "customers",
      label: activeModule === "customer" ? "Customers" : "Shopers",
      icon: Users,
      path: "/customers",
    },
    {
      id: "invoices",
      label: "Invoices",
      icon: FileText,
      path: "/invoices",
    },
    {
      id: "payments",
      label: "Payments",
      icon: CreditCard,
      path: "/payments",
    },
    {
      id: "returns",
      label: "Purchase Returns",
      icon: RotateCcw,
      path: "/purchase-returns",
    },
    {
      id: "ledger",
      label: "Ledger",
      icon: BookOpen,
      path: "/ledger",
    },
  ];

  const reportItems = [
    {
      id: "monthly_sales",
      label: "Sales Report",
      icon: BarChart3,
      path: "/reports/monthly-sales",
    },
    {
      id: "customer_ledger_report",
      label: "Customer Ledger",
      icon: FileText,
      path: "/ledger",
    },
  ];

  const handleNavigate = (path: string) => {
    closeSidebar();
    router.push(path);
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-[#111827]/40 backdrop-blur-sm transition-opacity md:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={clsx(
          "fixed top-0 bottom-0 left-0 z-50 flex w-[260px] flex-col border-r border-border bg-card text-foreground transition-transform md:translate-x-0 shadow-sm",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header brand info */}
        <div className="flex h-[70px] items-center px-6 border-b border-border">
          <div className="flex items-center gap-2.5 font-bold text-sm tracking-wide">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue text-white shadow-sm shadow-blue/10">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                <path
                  d="M8 20l5-8 4 6 3-4 4 6"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-[15px] font-extrabold uppercase text-foreground tracking-wider leading-none">
              SANDEEP TRADERS
            </span>
          </div>
        </div>

        {/* Module Switcher Tab */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 p-1 rounded-full bg-[#E5E7EB]/40 border border-[#E5E7EB]">
            <button
              onClick={() => {
                setModule("customer");
                router.push("/dashboard");
              }}
              className={clsx(
                "py-1.5 rounded-full text-xs font-bold text-center cursor-pointer transition-all duration-200",
                activeModule === "customer"
                  ? "bg-blue text-white shadow-sm"
                  : "text-textMuted hover:text-foreground"
              )}
            >
              Customer
            </button>
            <button
              onClick={() => {
                setModule("shoper");
                router.push("/dashboard");
              }}
              className={clsx(
                "py-1.5 rounded-full text-xs font-bold text-center cursor-pointer transition-all duration-200",
                activeModule === "shoper"
                  ? "bg-blue text-white shadow-sm"
                  : "text-textMuted hover:text-foreground"
              )}
            >
              Shoper
            </button>
          </div>
        </div>

        {/* Nav Menu */}
        <nav className="flex-1 px-4 py-2 space-y-6 overflow-y-auto">
          {/* Main items */}
          <div className="space-y-1">
            <div className="px-4 text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">
              Main
            </div>
            {mainItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.path)}
                  className={clsx(
                    "flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all duration-150 text-left",
                    active
                      ? "bg-blue/10 text-blue font-bold shadow-sm"
                      : "text-textMuted hover:bg-[#F6F8FC] hover:text-foreground"
                  )}
                >
                  <Icon size={16} className={clsx(active ? "text-blue" : "text-textMuted")} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Reports Section */}
          <div className="space-y-1 mt-6">
            <div className="px-4 text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">
              Reports
            </div>
            {reportItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path && item.id !== "customer_ledger_report"; // Ledger has its own active state above, we only highlight if actually on reports
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.path)}
                  className={clsx(
                    "flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all duration-150 text-left",
                    active
                      ? "bg-blue/10 text-blue font-bold shadow-sm"
                      : "text-textMuted hover:bg-[#F6F8FC] hover:text-foreground"
                  )}
                >
                  <Icon size={16} className={clsx(active ? "text-blue" : "text-textMuted")} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Others Section */}
          <div className="space-y-1">
            <div className="px-4 text-[10px] font-bold text-textMuted uppercase tracking-widest mb-3">
              Others
            </div>
            <button
              onClick={() => handleNavigate("/settings")}
              className={clsx(
                "flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all duration-150 text-left",
                pathname === "/settings"
                  ? "bg-blue/10 text-blue font-bold shadow-sm"
                  : "text-textMuted hover:bg-[#F6F8FC] hover:text-foreground"
              )}
            >
              <Settings size={16} className={clsx(pathname === "/settings" ? "text-blue" : "text-textMuted")} />
              <span>Settings</span>
            </button>
          </div>
        </nav>

        {/* Sidebar Footer profile with popup menu */}
        <div className="relative mt-auto p-4 border-t border-border">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex w-full items-center gap-3 p-2 rounded-xl hover:bg-[#F6F8FC] transition-colors text-left cursor-pointer"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue text-white font-bold text-base shadow-sm">
              {user?.username?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate leading-snug">
                {user?.username || "admin"}
              </p>
              <p className="text-[10px] text-textMuted capitalize truncate">
                {user?.role === "admin" ? "Administrator" : user?.role || "User"}
              </p>
            </div>
            <ChevronDown
              size={14}
              className={clsx("text-textMuted transition-transform duration-200", profileOpen && "rotate-180")}
            />
          </button>
          {profileOpen && (
            <div className="absolute bottom-20 left-4 right-4 bg-card border border-border rounded-xl shadow-lg p-2 z-50 animate-fadeIn">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold text-red hover:bg-red/10 cursor-pointer transition-colors"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
