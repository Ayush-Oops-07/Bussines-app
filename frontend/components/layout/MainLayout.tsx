"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/auth-store";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken && !token) {
      router.push("/login");
    } else {
      setLoading(false);
    }
  }, [token, router]);

  // Automatic idle logout after 15 minutes of inactivity
  useEffect(() => {
    if (!token) return;

    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logout();
        router.push("/login");
        alert("Session expired due to inactivity. Please sign in again.");
      }, INACTIVITY_LIMIT);
    };

    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [token, router, logout]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Sidebar - fixed on desktop, toggleable on mobile */}
      <Sidebar />

      {/* Main body wrapper */}
      <div className="flex-1 flex flex-col md:pl-[260px]">
        {/* Sticky Topbar */}
        <Topbar />

        {/* Scrollable page content */}
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
