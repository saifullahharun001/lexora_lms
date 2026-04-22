import Link from "next/link";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-stone-800 bg-stone-900/80 p-8 shadow-2xl shadow-black/20">
        <div className="mb-8 flex gap-3 text-sm text-stone-400">
          <Link href="/sign-in" className="hover:text-stone-100">
            Sign in
          </Link>
          <Link href="/forgot-password" className="hover:text-stone-100">
            Forgot password
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}

