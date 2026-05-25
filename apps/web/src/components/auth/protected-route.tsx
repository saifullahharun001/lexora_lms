"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { useAuth } from "@/components/providers/auth-provider";

const routeRoles = [
  { path: "/admin", role: "department_admin" },
  { path: "/teacher", role: "teacher" },
  { path: "/student", role: "student" }
] as const;

const roleHomes = [
  { role: "department_admin", path: "/admin" },
  { role: "teacher", path: "/teacher" },
  { role: "student", path: "/student" }
] as const;

interface ProtectedRouteProps {
  children: ReactNode;
}

function getRequiredRole(pathname: string) {
  return routeRoles.find(
    (route) => pathname === route.path || pathname.startsWith(`${route.path}/`)
  )?.role;
}

function getRoleHome(roles: string[]) {
  return roleHomes.find((home) => roles.includes(home.role))?.path ?? "/";
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, status } = useAuth();

  const requiredRole = getRequiredRole(pathname);
  const isAllowed = Boolean(
    requiredRole && session?.user.roles.includes(requiredRole)
  );

  useEffect(() => {
    if (status === "bootstrapping") {
      return;
    }

    if (status === "anonymous") {
      router.replace("/sign-in");
      return;
    }

    if (!session || isAllowed) {
      return;
    }

    router.replace(getRoleHome(session.user.roles));
  }, [isAllowed, router, session, status]);

  if (status === "bootstrapping") {
    return (
      <div className="rounded-lg border border-stone-800 bg-stone-950/60 px-4 py-3 text-sm text-stone-300">
        Restoring your session...
      </div>
    );
  }

  if (status === "anonymous" || !isAllowed) {
    return null;
  }

  return children;
}
