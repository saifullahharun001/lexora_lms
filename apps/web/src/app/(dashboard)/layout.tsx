import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardShell } from "@/components/shell/dashboard-shell";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <ProtectedRoute>
      <DashboardShell
        title="Lexora Workspace"
        subtitle="A shared academic shell for department-aware workspaces."
      >
        {children}
      </DashboardShell>
    </ProtectedRoute>
  );
}
