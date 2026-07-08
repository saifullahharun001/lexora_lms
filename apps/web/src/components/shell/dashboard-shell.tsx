"use client";

import { AppShell, cn } from "@lexora/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import {
  adminWorkspaceSections,
  getAdminWorkspaceSectionSlug
} from "@/components/admin/admin-workspace-sections";
import { useAuth } from "@/components/providers/auth-provider";
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, signOut } = useAuth();

  const roles = session?.user.roles ?? [];
  const navigationItems = dashboardNavigation.filter((item) =>
    roles.includes(item.role)
  );
  const isAdminWorkspace = pathname === "/admin";
  const activeAdminSection = getAdminWorkspaceSectionSlug(
    searchParams.get("section")
  );

  const handleSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      sidebar={
        <div className="flex min-h-0 flex-col gap-6 lg:h-full lg:justify-between lg:gap-8">
          <div className="min-w-0 space-y-5 lg:space-y-6">
            <nav aria-label="Dashboard workspace navigation" className="min-w-0 space-y-2">
              {navigationItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "block min-w-0 rounded-lg border px-3 py-2 transition",
                      isActive
                        ? "border-teal-200 bg-teal-50 text-teal-900 shadow-sm"
                        : "border-transparent text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800"
                    )}
                  >
                    <span className="block min-w-0 text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block min-w-0 text-xs leading-5 text-slate-500">
                      {item.description}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {isAdminWorkspace ? (
              <nav
                aria-label="Admin module navigation"
                className="min-w-0 rounded-2xl border border-white/16 bg-white/8 p-3 shadow-inner shadow-stone-950/10"
              >
                <p className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                  Admin modules
                </p>
                <div className="mt-3 max-h-72 min-w-0 space-y-1.5 overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible lg:pr-0">
                  {adminWorkspaceSections.map((section) => {
                    const isActive = activeAdminSection === section.slug;
                    const href =
                      section.slug === "overview"
                        ? "/admin"
                        : `/admin?section=${section.slug}`;

                    return (
                      <Link
                        key={section.slug}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "block min-w-0 rounded-xl border px-3 py-2.5 transition",
                          isActive
                            ? "border-amber-200/60 bg-amber-100/18 text-amber-50 shadow-sm"
                            : "border-transparent text-stone-200 hover:border-white/24 hover:bg-white/10 hover:text-amber-50"
                        )}
                      >
                        <span className="block min-w-0 text-sm font-semibold">
                          {section.label}
                        </span>
                        <span className="mt-1 block min-w-0 text-xs leading-5 text-stone-300">
                          {section.description}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            ) : null}
          </div>

          {session ? (
            <section className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">
                {session.user.displayName}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {formatRoles(roles)}
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-800"
              >
                Sign out
              </button>
            </section>
          ) : null}
        </div>
      }
    >
      {children}
    </AppShell>
  );
}

function formatRoles(roles: string[]) {
  if (roles.length === 0) {
    return "No workspace roles";
  }

  return roles.map(formatRole).join(", ");
}

function formatRole(role: string) {
  return role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
