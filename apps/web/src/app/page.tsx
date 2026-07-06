import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-950 px-5 py-16 text-stone-50 sm:px-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/Law_Faculty.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-stone-950/78 via-teal-950/44 to-stone-950/70"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backdropFilter: "blur(1.6px) saturate(1.1) brightness(1.04)" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.16),transparent_32%),linear-gradient(118deg,rgba(255,255,255,0.11),transparent_24%,rgba(255,255,255,0.045)_48%,transparent_72%)]"
      />

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-sm">
          Department of Law · University of Chittagong
        </p>

        <h1
          className="mt-7 text-7xl font-black leading-none tracking-[0.045em] text-amber-50 sm:text-8xl lg:text-9xl"
          style={{
            fontFamily: 'Algerian, var(--font-heading), "EB Garamond", Georgia, serif',
            textShadow:
              "0 4px 26px rgba(0, 0, 0, 0.58), 0 0 30px rgba(251, 191, 36, 0.16)"
          }}
        >
          Lexora
        </h1>

        <p className="mt-6 max-w-3xl text-2xl font-semibold leading-8 text-stone-50 drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-3xl">
          Where Law Meets Learning
        </p>

        <div className="mt-8 max-w-3xl space-y-5 text-base leading-8 text-stone-50 drop-shadow-[0_2px_12px_rgba(0,0,0,0.62)] sm:text-lg">
          <p>
            Lexora helps law students follow their courses, classes, attendance,
            assignments, quizzes, eligibility, results, GPA, and transcripts
            through one secure academic workspace designed for transparent legal
            education.
          </p>
          <p>
            Built for the Department of Law, University of Chittagong, Lexora
            supports a disciplined academic environment where students, teachers,
            and administrators can manage legal education with clarity,
            accountability, and trust.
          </p>
        </div>

        <Link
          className="mt-11 inline-flex rounded-full border border-amber-100/50 bg-amber-300/92 px-7 py-3 text-base font-bold text-stone-950 shadow-lg shadow-stone-950/24 backdrop-blur-sm transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950"
          href="/sign-in"
        >
          Enter Lexora
        </Link>
      </section>
    </main>
  );
}