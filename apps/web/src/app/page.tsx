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
        className="absolute inset-0 bg-gradient-to-br from-stone-950/86 via-teal-950/58 to-stone-950/78"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backdropFilter: "blur(1.5px) saturate(1.08) brightness(1.03)" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.15),transparent_31%),linear-gradient(115deg,rgba(255,255,255,0.1),transparent_25%,rgba(255,255,255,0.045)_46%,transparent_70%)]"
      />

      <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center rounded-[2rem] border border-white/12 bg-stone-950/18 px-6 py-10 text-center shadow-2xl shadow-stone-950/28 backdrop-blur-[1.5px] sm:px-10 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-200 sm:text-sm">
          Department of Law · University of Chittagong
        </p>

        <h1
          className="mt-6 text-7xl font-black leading-none tracking-[0.045em] text-amber-50 sm:text-8xl lg:text-9xl"
          style={{
            fontFamily: 'Algerian, var(--font-heading), "EB Garamond", Georgia, serif',
            textShadow: "0 3px 24px rgba(0, 0, 0, 0.52), 0 0 28px rgba(251, 191, 36, 0.14)"
          }}
        >
          Lexora
        </h1>

        <p className="mt-6 max-w-3xl text-2xl font-semibold leading-8 text-stone-50 sm:text-3xl">
          Where Law Meets Learning
        </p>

        <div className="mt-7 max-w-3xl space-y-5 text-base leading-8 text-stone-100 sm:text-lg">
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
          className="mt-10 inline-flex rounded-full bg-amber-300 px-7 py-3 text-base font-bold text-stone-950 shadow-lg shadow-stone-950/20 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950"
          href="/sign-in"
        >
          Enter Lexora
        </Link>
      </section>
    </main>
  );
}
