"use client";

import { AppShell, cn } from "@lexora/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

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
  const { session, signOut } = useAuth();

  const roles = session?.user.roles ?? [];
  const navigationItems = dashboardNavigation.filter((item) =>
    roles.includes(item.role)
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
        <div className="flex h-full flex-col justify-between gap-8">
          <nav aria-label="Dashboard workspace navigation" className="space-y-2">
            {navigationItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "block rounded-lg border px-3 py-2 transition",
                    isActive
                      ? "border-teal-200 bg-teal-50 text-teal-900 shadow-sm"
                      : "border-transparent text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800"
                  )}
                >
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {item.description}
                  </span>
                </Link>
              );
            })}
          </nav>

          {session ? (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
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

