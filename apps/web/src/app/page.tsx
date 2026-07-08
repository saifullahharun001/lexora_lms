import Image from "next/image";

import { HomeRouteAction } from "@/components/home/home-route-action";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-stone-950 px-5 py-6 text-stone-50 sm:px-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/Law_Faculty.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-stone-950/88 via-teal-950/62 to-stone-950/84"
      />

      <header className="relative z-10 flex max-w-full items-center gap-3 rounded-2xl border border-amber-100/20 bg-stone-950/88 px-4 py-3 text-left shadow-xl shadow-stone-950/28 sm:rounded-full sm:px-5">
        <Image
          src="/images/cu-logo.png"
          alt="University of Chittagong logo"
          width={52}
          height={52}
          priority
          className="h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12"
        />
        <div>
          <p className="text-sm font-semibold leading-5 text-amber-50 sm:text-base">
            University of Chittagong
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/90 sm:text-sm">
            Department of Law
          </p>
        </div>
      </header>

      <section className="relative z-10 mx-auto my-10 flex w-full max-w-5xl flex-col items-center text-center sm:my-12">
        <h1
          className="text-7xl font-black leading-none tracking-[0.045em] text-amber-50 sm:text-8xl lg:text-9xl"
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

        <HomeRouteAction
          className="mt-11 inline-flex rounded-full border border-amber-100/50 bg-amber-300/92 px-7 py-3 text-base font-bold text-stone-950 shadow-lg shadow-stone-950/24 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950"
          href="/sign-in"
          routeAuthenticatedUser
        >
          Enter Lexora
        </HomeRouteAction>
      </section>

      <footer className="relative z-10 flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-amber-100/20 bg-stone-950/88 px-5 py-4 text-center text-sm leading-6 text-stone-100 shadow-xl shadow-stone-950/28 sm:flex-row sm:px-6 sm:text-left sm:text-base">
        <Image
          src="/images/heat-logo.png"
          alt="HEAT Project logo"
          width={150}
          height={64}
          className="h-12 w-auto shrink-0 object-contain sm:h-14"
        />
        <p>Developed with funding from the HEAT-12211-CU Project.</p>
      </footer>
    </main>
  );
}
