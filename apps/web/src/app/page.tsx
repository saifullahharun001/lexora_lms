import { SectionCard } from "@lexora/ui";

import { HomeRouteAction } from "@/components/home/home-route-action";

const routeAreas = [
  {
    href: "/sign-in",
    title: "Academic workspace",
    description: "Sign in with an institutional account and continue to the right workspace."
  },
  {
    href: "/forgot-password",
    title: "Account recovery",
    description: "A calm placeholder for future institutional password recovery."
  },
  {
    href: "/admin",
    isProtected: true,
    title: "Admin Workspace",
    description: "Department-aware space for future administration and governance tools."
  },
  {
    href: "/teacher",
    isProtected: true,
    title: "Teacher Workspace",
    description: "Instruction-facing space for future course and class workflows."
  },
  {
    href: "/student",
    isProtected: true,
    title: "Student Workspace",
    description: "Learner-facing space for future coursework and academic records."
  },
  {
    href: "/verify/sample-code",
    title: "Public Verification",
    description: "Read-only placeholder for future academic document verification."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-slate-200 bg-white/88 p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.22em] text-teal-700">
            Academic foundation
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-heading)] text-4xl text-slate-950 md:text-5xl">
            Lexora LMS academic portal
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            A bright, minimal project foundation for department-scoped academic
            workspaces. These routes are intentionally simple while real LMS
            features are prepared in later phases.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {routeAreas.map((area) => (
            <SectionCard
              key={area.href}
              title={area.title}
              description={area.description}
            >
              <HomeRouteAction href={area.href} isProtected={area.isProtected} />
            </SectionCard>
          ))}
        </div>
      </div>
    </main>
  );
}
