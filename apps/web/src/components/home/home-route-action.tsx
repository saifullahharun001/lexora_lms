"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { getRoleHome } from "@/lib/navigation";

interface HomeRouteActionProps {
  href: string;
  isProtected?: boolean;
  children?: ReactNode;
  className?: string;
  routeAuthenticatedUser?: boolean;
}

const actionClassName =
  "inline-flex rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 transition hover:border-teal-300 hover:bg-teal-100";

export function HomeRouteAction({
  href,
  isProtected = false,
  children = "Open route",
  className = actionClassName,
  routeAuthenticatedUser = false
}: HomeRouteActionProps) {
  const router = useRouter();
  const { session, status } = useAuth();

  if (!isProtected && !routeAuthenticatedUser) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  const isBootstrapping = status === "bootstrapping";

  return (
    <button
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
      disabled={isBootstrapping}
      onClick={() => {
        if (status === "anonymous") {
          router.push(href);
          return;
        }

        if (isProtected) {
          router.push(href);
          return;
        }

        router.push(getRoleHome(session?.user.roles ?? [], href));
      }}
      type="button"
    >
      {isBootstrapping ? "Checking session..." : children}
    </button>
  );
}
