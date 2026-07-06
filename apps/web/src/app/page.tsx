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
        className="absolute inset-0 bg-gradient-to-br from-stone-950/95 via-teal-950/82 to-stone-950/92"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-stone-950/18" />

      <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300 sm:text-sm">
          Department of Law · University of Chittagong
        </p>

        <h1 className="mt-6 font-[family-name:var(--font-heading)] text-6xl font-semibold tracking-normal text-white sm:text-7xl lg:text-8xl">
          Lexora
        </h1>

        <p className="mt-5 max-w-3xl text-xl font-medium leading-8 text-stone-100 sm:text-2xl">
          Learn Law. Track Progress. Trust Every Record.
        </p>

        <div className="mt-7 max-w-3xl space-y-5 text-base leading-8 text-stone-200 sm:text-lg">
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
          className="mt-10 inline-flex rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-stone-950 shadow-sm transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950"
          href="/sign-in"
        >
          Enter Lexora
        </Link>
      </section>
    </main>
  );
}
