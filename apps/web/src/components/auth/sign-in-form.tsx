"use client";

import { FormEvent, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ApiClientError } from "@/lib/api-client";

type SignInStatus = "idle" | "submitting" | "success";

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
  const [departmentCode, setDepartmentCode] = useState("LAW");
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
      await signIn({
        departmentCode: departmentCode.trim(),
        email: email.trim(),
        password,
        deviceLabel: "Lexora Web"
      });

      setStatus("success");
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
      setStatus("idle");
    }
  }

  return (
    <div>
      <p className="text-sm uppercase tracking-[0.28em] text-amber-400">Lexora LMS</p>
      <h1 className="mt-4 text-3xl font-semibold text-stone-50">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-stone-400">
        Use your institutional account to continue to the academic workspace.
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-stone-200" htmlFor="departmentCode">
            Department code
          </label>
          <input
            id="departmentCode"
            name="departmentCode"
            autoComplete="organization"
            className="mt-2 block w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-50 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            disabled={isSubmitting}
            onChange={(event) => setDepartmentCode(event.target.value)}
            required
            type="text"
            value={departmentCode}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-200" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            autoComplete="email"
            className="mt-2 block w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-50 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            disabled={isSubmitting}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-200" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            autoComplete="current-password"
            className="mt-2 block w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-50 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
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
            className="rounded-lg border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm leading-6 text-red-100"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-stone-900 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {session ? (
        <section
          aria-live="polite"
          className="mt-8 rounded-lg border border-emerald-900/70 bg-emerald-950/25 p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-emerald-100">Signed in successfully</p>
            <button
              className="rounded-lg border border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-600 hover:bg-emerald-950"
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
              <dt className="text-stone-500">Name</dt>
              <dd className="mt-1 text-stone-100">{session.user.displayName}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Email</dt>
              <dd className="mt-1 text-stone-100">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Department ID</dt>
              <dd className="mt-1 break-all text-stone-100">{session.user.departmentId}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Roles</dt>
              <dd className="mt-1 text-stone-100">
                {session.user.roles.length > 0 ? session.user.roles.join(", ") : "None"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
