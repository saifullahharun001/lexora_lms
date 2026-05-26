import { AppShell } from "@lexora/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { dashboardNavigation } from "@/lib/navigation";

interface DashboardShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function DashboardShell({
  title,
  subtitle,
  children
}: DashboardShellProps) {
  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      sidebar={
        <nav className="space-y-2">
          {dashboardNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      }
    >
      {children}
    </AppShell>
  );
}

