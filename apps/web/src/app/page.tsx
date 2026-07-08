import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-950 px-5 py-12 pb-32 text-stone-50 sm:px-8 sm:py-16 sm:pb-36">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/Law_Faculty.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-stone-950/86 via-teal-950/60 to-stone-950/82"
      />

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <Image
          src="/images/cu-logo.png"
          alt="University of Chittagong logo"
          width={96}
          height={96}
          priority
          className="h-20 w-20 object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)] sm:h-24 sm:w-24"
        />

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-amber-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-sm">
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

        <div className="mt-8 max-w-4xl space-y-5 text-lg leading-9 text-stone-50 drop-shadow-[0_2px_12px_rgba(0,0,0,0.62)] sm:text-xl">
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
          className="mt-11 inline-flex rounded-full border border-amber-100/50 bg-amber-300/92 px-7 py-3 text-base font-bold text-stone-950 shadow-lg shadow-stone-950/24 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950"
          href="/sign-in"
        >
          Enter Lexora
        </Link>
      </section>

      <footer className="absolute bottom-6 left-1/2 z-10 flex w-full max-w-md -translate-x-1/2 flex-col items-center px-5 text-center text-sm leading-6 text-stone-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
        <Image
          src="/images/heat-logo.png"
          alt="HEAT Project logo"
          width={132}
          height={56}
          className="h-10 w-auto object-contain"
        />
        <p className="mt-2">Developed with funding from the HEAT-12211-CU Project.</p>
      </footer>
    </main>
  );
}
