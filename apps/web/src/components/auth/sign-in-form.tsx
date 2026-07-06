"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ApiClientError } from "@/lib/api-client";

type SignInStatus = "idle" | "submitting" | "success";

const roleHomes = [
  { role: "department_admin", path: "/admin" },
  { role: "teacher", path: "/teacher" },
  { role: "student", path: "/student" }
] as const;

const inputClassName =
  "mt-2 block w-full rounded-lg border border-white/30 bg-white/14 px-3 py-2.5 text-sm text-stone-50 shadow-inner shadow-stone-950/10 outline-none transition placeholder:text-stone-300/70 focus:border-amber-200 focus:bg-white/18 focus:ring-2 focus:ring-amber-200/25 disabled:cursor-not-allowed disabled:opacity-60";

function getRoleHome(roles: string[]) {
  return roleHomes.find((home) => roles.includes(home.role))?.path;
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "The email, password, or department code did not match our records.";
    }

    if (error.status === 403) {
      return "This account does not have access to sign in here.";
    }

    if (error.status >= 500) {
      return "Lexora could not complete sign in right now. Please try again shortly.";
    }

    return error.message || "Sign in failed. Please check the form and try again.";
  }

  return "Sign in failed. Please check your connection and try again.";
}

export function SignInForm() {
  const router = useRouter();
  const [departmentCode, setDepartmentCode] = useState("0421");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<SignInStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { session, signIn, signOut } = useAuth();

  const isSubmitting = status === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const nextSession = await signIn({
        departmentCode: departmentCode.trim(),
        email: email.trim(),
        password,
        deviceLabel: "Lexora Web"
      });

      const roleHome = getRoleHome(nextSession.user.roles);

      if (roleHome) {
        router.replace(roleHome);
        return;
      }

      setStatus("success");
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
      setStatus("idle");
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">
        Lexora LMS
      </p>
      <h1 className="mt-4 text-3xl font-semibold text-stone-50">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-stone-200">
        Use your institutional account to continue to the academic workspace.
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-semibold text-stone-100" htmlFor="departmentCode">
            Department code
          </label>
          <input
            id="departmentCode"
            name="departmentCode"
            autoComplete="organization"
            className={inputClassName}
            disabled={isSubmitting}
            onChange={(event) => setDepartmentCode(event.target.value)}
            required
            type="text"
            value={departmentCode}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-stone-100" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            autoComplete="email"
            className={inputClassName}
            disabled={isSubmitting}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-stone-100" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            autoComplete="current-password"
            className={inputClassName}
            disabled={isSubmitting}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        {errorMessage ? (
          <p
            aria-live="polite"
            className="rounded-lg border border-red-300/40 bg-red-950/55 px-3 py-2 text-sm leading-6 text-red-50"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          className="w-full rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-bold text-stone-950 shadow-lg shadow-stone-950/15 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-stone-300"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {session ? (
        <section
          aria-live="polite"
          className="mt-8 rounded-lg border border-emerald-200/35 bg-emerald-950/42 p-4 text-stone-100"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-emerald-100">Signed in successfully</p>
            <button
              className="rounded-lg border border-emerald-100/35 bg-white/12 px-3 py-1.5 text-xs font-semibold text-emerald-50 transition hover:bg-white/18"
              onClick={() => {
                void signOut();
                setStatus("idle");
              }}
              type="button"
            >
              Log out
            </button>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-stone-300">Name</dt>
              <dd className="mt-1 text-stone-50">{session.user.displayName}</dd>
            </div>
            <div>
              <dt className="text-stone-300">Email</dt>
              <dd className="mt-1 text-stone-50">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-stone-300">Department ID</dt>
              <dd className="mt-1 break-all text-stone-50">{session.user.departmentId}</dd>
            </div>
            <div>
              <dt className="text-stone-300">Roles</dt>
              <dd className="mt-1 text-stone-50">
                {session.user.roles.length > 0 ? session.user.roles.join(", ") : "None"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
