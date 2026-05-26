"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";

interface HomeRouteActionProps {
  href: string;
  isProtected?: boolean;
}

const actionClassName =
  "inline-flex rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 transition hover:border-teal-300 hover:bg-teal-100";

export function HomeRouteAction({
  href,
  isProtected = false
}: HomeRouteActionProps) {
  const router = useRouter();
  const { status } = useAuth();

  if (!isProtected) {
    return (
      <Link href={href} className={actionClassName}>
        Open route
      </Link>
    );
  }

  const isBootstrapping = status === "bootstrapping";

  return (
    <button
      className={`${actionClassName} disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
      disabled={isBootstrapping}
      onClick={() => {
        router.replace(status === "anonymous" ? "/sign-in" : href);
      }}
      type="button"
    >
      {isBootstrapping ? "Checking session..." : "Open route"}
    </button>
  );
}
