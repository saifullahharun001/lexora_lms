import Link from "next/link";

import { SectionCard } from "@lexora/ui";

const routeAreas = [
  {
    href: "/sign-in",
    title: "Auth Surface",
    description: "Identity entry points, session bootstrap, and account recovery shells."
  },
  {
    href: "/forgot-password",
    title: "Recovery Surface",
    description: "Password recovery shell for audited identity-access flows."
  },
  {
    href: "/admin",
    title: "Admin Workspace",
    description: "Department-aware administrative shell for configuration and governance."
  },
  {
    href: "/teacher",
    title: "Teacher Workspace",
    description: "Instruction-facing shell for course delivery and class operations."
  },
  {
    href: "/student",
    title: "Student Workspace",
    description: "Learner-facing shell for enrollment, coursework, and record access."
  },
  {
    href: "/verify/sample-code",
    title: "Public Verification",
    description: "Public verification surface for transcripts and academic artifacts."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-lexora-grid bg-grid px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-stone-800 bg-stone-900/80 p-8 shadow-2xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.35em] text-amber-400">
            Security-First Foundation
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-heading)] text-4xl text-stone-50 md:text-5xl">
            Lexora LMS project foundation
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-300">
            This initial scaffold establishes a modular monolith, department-scoped
            tenancy assumptions, shared configuration, and workspace conventions without
            introducing business features.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {routeAreas.map((area) => (
            <SectionCard
              key={area.href}
              title={area.title}
              description={area.description}
            >
              <Link
                href={area.href}
                className="inline-flex rounded-full border border-amber-400/40 px-4 py-2 text-sm text-amber-300 hover:border-amber-300 hover:text-amber-200"
              >
                Open route
              </Link>
            </SectionCard>
          ))}
        </div>
      </div>
    </main>
  );
}
