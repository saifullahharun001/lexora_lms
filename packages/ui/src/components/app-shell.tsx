import type { ReactNode } from "react";

import { cn } from "../lib/cn";

interface AppShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  sidebar?: ReactNode;
  className?: string;
}

export function AppShell({
  title,
  subtitle,
  children,
  sidebar,
  className
}: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-stone-50 text-slate-900", className)}>
      <div className="mx-auto grid min-h-screen max-w-7xl min-w-0 gap-6 px-4 py-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-3xl border border-slate-200 bg-white/92 p-5 shadow-sm">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.22em] text-teal-700">Lexora</p>
            <h1 className="mt-3 text-xl font-semibold text-slate-950">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
          </div>
          {sidebar}
        </aside>
        <main className="min-w-0 rounded-3xl border border-slate-200 bg-white/88 p-6 shadow-sm">
          {children}
        </main>
      </div>
    </div>
  );
}
