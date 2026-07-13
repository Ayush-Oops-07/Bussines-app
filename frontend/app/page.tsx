"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../store/auth-store";

export default function Home() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    // If auth state is initialized (not null), redirect appropriately
    const storedToken = localStorage.getItem("token");
    if (storedToken || token) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [token, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#080c18]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue border-t-transparent"></div>
    </div>
  );
}
