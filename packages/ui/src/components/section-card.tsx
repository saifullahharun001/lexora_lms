import type { ReactNode } from "react";

import { cn } from "../lib/cn";

interface SectionCardProps {
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  children,
  className
}: SectionCardProps) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      {children ? <div className="mt-4 min-w-0">{children}</div> : null}
    </section>
  );
}
