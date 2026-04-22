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
    <section className={cn("rounded-2xl border border-stone-800 bg-stone-900/70 p-5", className)}>
      <h2 className="text-lg font-semibold text-stone-50">{title}</h2>
      <p className="mt-2 text-sm text-stone-400">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

