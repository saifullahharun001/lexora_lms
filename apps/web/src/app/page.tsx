import Image from "next/image";

import { HomeRouteAction } from "@/components/home/home-route-action";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-stone-950 text-stone-50">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center lg:bg-[center_right]"
        style={{ backgroundImage: "url('/images/Law_Faculty.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/78 to-teal-950/42"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-stone-950/82 via-transparent to-stone-950/36"
      />

      <div className="relative z-10 flex min-h-screen w-full items-center px-4 py-5 sm:px-6 lg:px-8">
        <section className="flex w-full max-w-xl flex-col justify-between rounded-3xl border border-amber-100/18 bg-stone-950/94 p-6 shadow-2xl shadow-stone-950/35 sm:p-8 lg:min-h-[calc(100vh-4rem)] lg:p-10">
          <header className="flex items-center gap-4 border-b border-amber-100/14 pb-6 text-left">
            <Image
              src="/images/cu-logo.png"
              alt="University of Chittagong logo"
              width={64}
              height={64}
              priority
              className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
            />
            <div>
              <p className="text-base font-semibold leading-6 text-amber-50 sm:text-lg">
                University of Chittagong
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90 sm:text-sm">
                Department of Law
              </p>
            </div>
          </header>

          <div className="py-10 sm:py-12 lg:py-14">
            <h1
              className="text-6xl font-black leading-none tracking-[0.045em] text-amber-50 sm:text-7xl lg:text-8xl"
              style={{
                fontFamily:
                  'Algerian, var(--font-heading), "EB Garamond", Georgia, serif',
                textShadow:
                  "0 4px 24px rgba(0, 0, 0, 0.52), 0 0 26px rgba(251, 191, 36, 0.12)"
              }}
            >
              Lexora
            </h1>

            <p className="mt-6 max-w-lg text-2xl font-semibold leading-8 text-stone-50 sm:text-3xl">
              Where Law Meets Learning
            </p>

            <div className="mt-7 space-y-5 text-lg leading-8 text-stone-100 sm:text-xl sm:leading-9">
              <p>
                Lexora helps law students follow their courses, classes,
                attendance, assignments, quizzes, eligibility, results, GPA, and
                transcripts through one secure academic workspace designed for
                transparent legal education.
              </p>
              <p>
                Built for the Department of Law, University of Chittagong,
                Lexora supports a disciplined academic environment where
                students, teachers, and administrators can manage legal education
                with clarity, accountability, and trust.
              </p>
            </div>

            <HomeRouteAction
              className="mt-10 inline-flex rounded-full border border-amber-100/50 bg-amber-300/92 px-7 py-3 text-base font-bold text-stone-950 shadow-lg shadow-stone-950/24 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950"
              href="/sign-in"
              routeAuthenticatedUser
            >
              Enter Lexora
            </HomeRouteAction>
          </div>

          <footer className="flex flex-col gap-3 rounded-2xl border border-amber-100/16 bg-stone-900 px-4 py-4 text-sm leading-6 text-stone-100 sm:flex-row sm:items-center sm:text-base">
            <Image
              src="/images/heat-logo.png"
              alt="HEAT Project logo"
              width={150}
              height={64}
              className="h-12 w-fit shrink-0 object-contain sm:h-14"
            />
            <p>Developed with funding from the HEAT-12211-CU Project.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
