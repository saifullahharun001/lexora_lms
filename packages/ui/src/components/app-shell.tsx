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
    <div className={cn("min-h-screen bg-transparent text-stone-50", className)}>
      <div className="mx-auto grid min-h-screen max-w-7xl min-w-0 gap-6 px-4 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
        <aside className="lexora-workspace-sidebar rounded-3xl border border-white/22 bg-stone-950/34 p-5 shadow-xl shadow-stone-950/18 backdrop-blur-2xl">
          <div className="mb-8 border-b border-white/18 pb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-teal-200">Lexora</p>
            <h1 className="mt-3 text-xl font-semibold text-amber-50">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-stone-200">{subtitle}</p>
          </div>
          {sidebar}
        </aside>
        <main className="min-w-0 rounded-3xl border border-white/20 bg-stone-950/24 p-6 shadow-xl shadow-stone-950/18 backdrop-blur-xl">
          {children}
        </main>
      </div>
    </div>
  );
}