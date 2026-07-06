import Link from "next/link";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/45 bg-white/82 p-8 shadow-2xl shadow-stone-950/25 backdrop-blur-2xl">
        <div className="mb-8 flex gap-3 text-sm text-slate-600">
          <Link href="/sign-in" className="hover:text-teal-800">
            Sign in
          </Link>
          <Link href="/forgot-password" className="hover:text-teal-800">
            Forgot password
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}
