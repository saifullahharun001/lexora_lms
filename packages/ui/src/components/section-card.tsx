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
    <section className={cn("lexora-glass-card min-w-0 rounded-2xl p-5", className)}>
      <h2 className="text-lg font-semibold text-amber-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-200">{description}</p>
      {children ? <div className="mt-4 min-w-0">{children}</div> : null}
    </section>
  );
}