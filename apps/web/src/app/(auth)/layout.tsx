import Link from "next/link";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-stone-950/62 p-8 text-stone-50 shadow-2xl shadow-stone-950/35 backdrop-blur-2xl">
        <div className="mb-8 flex gap-3 text-sm font-medium text-stone-200">
          <Link href="/sign-in" className="hover:text-amber-200">
            Sign in
          </Link>
          <Link href="/forgot-password" className="hover:text-amber-200">
            Forgot password
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}
