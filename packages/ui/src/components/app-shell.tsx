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
      <div className="mx-auto flex min-h-screen max-w-7xl min-w-0 flex-col gap-4 px-3 py-4 sm:px-4 sm:py-5 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:py-6">
        <aside className="lexora-workspace-sidebar min-w-0 rounded-2xl border border-white/22 bg-stone-950/34 p-4 shadow-xl shadow-stone-950/18 backdrop-blur-2xl sm:rounded-3xl sm:p-5">
          <div className="mb-6 border-b border-white/18 pb-5 sm:mb-8 sm:pb-6">
            <a
              href="/"
              className="inline-block rounded-md text-xs uppercase tracking-[0.22em] text-teal-200 transition hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200/70 focus:ring-offset-2 focus:ring-offset-stone-950"
            >
              Lexora
            </a>
            <h1 className="mt-3 text-xl font-semibold text-amber-50">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-stone-200">{subtitle}</p>
          </div>
          {sidebar}
        </aside>
        <main className="min-w-0 rounded-2xl border border-white/20 bg-stone-950/24 p-4 shadow-xl shadow-stone-950/18 backdrop-blur-xl sm:rounded-3xl sm:p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
