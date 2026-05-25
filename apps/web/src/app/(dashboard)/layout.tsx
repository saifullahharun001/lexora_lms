import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardShell } from "@/components/shell/dashboard-shell";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <DashboardShell
      title="Lexora Control Surface"
      subtitle="Shared application shell for department-aware workspaces."
    >
      <ProtectedRoute>{children}</ProtectedRoute>
    </DashboardShell>
  );
}
