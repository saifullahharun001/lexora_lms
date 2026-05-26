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
      <p className="text-sm uppercase tracking-[0.22em] text-teal-700">Lexora LMS</p>
      <h1 className="mt-4 text-3xl font-semibold text-slate-950">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Use your institutional account to continue to the academic workspace.
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="departmentCode">
            Department code
          </label>
          <input
            id="departmentCode"
            name="departmentCode"
            autoComplete="organization"
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            disabled={isSubmitting}
            onChange={(event) => setDepartmentCode(event.target.value)}
            required
            type="text"
            value={departmentCode}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            autoComplete="email"
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            disabled={isSubmitting}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            autoComplete="current-password"
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
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
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {session ? (
        <section
          aria-live="polite"
          className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-emerald-800">Signed in successfully</p>
            <button
              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
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
              <dt className="text-slate-500">Name</dt>
              <dd className="mt-1 text-slate-900">{session.user.displayName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="mt-1 text-slate-900">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Department ID</dt>
              <dd className="mt-1 break-all text-slate-900">{session.user.departmentId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Roles</dt>
              <dd className="mt-1 text-slate-900">
                {session.user.roles.length > 0 ? session.user.roles.join(", ") : "None"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
