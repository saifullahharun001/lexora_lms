import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@lexora/ui";

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
              className="block rounded-xl border border-stone-800 px-3 py-2 text-sm text-stone-300 transition hover:border-amber-400/50 hover:text-stone-50"
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

