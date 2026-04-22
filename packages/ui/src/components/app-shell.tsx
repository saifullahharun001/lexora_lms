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
    <div className={cn("min-h-screen bg-stone-950 text-stone-100", className)}>
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr] lg:px-6">
        <aside className="rounded-3xl border border-stone-800 bg-stone-900/90 p-5 shadow-2xl shadow-black/20">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-400">Lexora</p>
            <h1 className="mt-3 text-xl font-semibold text-stone-50">{title}</h1>
            <p className="mt-2 text-sm text-stone-400">{subtitle}</p>
          </div>
          {sidebar}
        </aside>
        <main className="rounded-3xl border border-stone-800 bg-gradient-to-br from-stone-900 via-stone-900 to-stone-950 p-6 shadow-2xl shadow-black/20">
          {children}
        </main>
      </div>
    </div>
  );
}

