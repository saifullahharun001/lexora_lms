"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { AuthProvider } from "@/components/providers/auth-provider";
import { createQueryClient } from "@/lib/query-client";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
