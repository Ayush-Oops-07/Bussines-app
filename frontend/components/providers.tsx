"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth-store";
import { useUIStore } from "../store/ui-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  }));

  const initializeAuth = useAuthStore((s) => s.initialize);
  const initializeUI = useUIStore((s) => s.initializeUI);

  useEffect(() => {
    initializeAuth();
    initializeUI();
  }, [initializeAuth, initializeUI]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
