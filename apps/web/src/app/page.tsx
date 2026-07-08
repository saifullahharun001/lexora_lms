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
        className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/84 to-stone-950/18"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-stone-950/86 via-teal-950/18 to-stone-950/24"
      />

      <div className="relative z-10 flex min-h-screen w-full items-center px-5 py-8 sm:px-8 lg:px-14 xl:px-20">
        <section className="w-full max-w-3xl py-4 lg:max-w-[52rem]">
          <header className="flex max-w-xl items-center gap-4 text-left drop-shadow-[0_3px_14px_rgba(0,0,0,0.72)]">
            <Image
              src="/images/cu-logo.png"
              alt="University of Chittagong logo"
              width={64}
              height={64}
              priority
              className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
            />
            <div>
              <p className="text-base font-bold leading-6 text-amber-50 sm:text-lg">
                University of Chittagong
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200 sm:text-sm">
                Department of Law
              </p>
            </div>
          </header>

          <div className="mt-12 sm:mt-14 lg:mt-16">
            <h1
              className="text-6xl font-black leading-none tracking-[0.045em] text-amber-50 sm:text-7xl lg:text-8xl"
              style={{
                fontFamily:
                  'Algerian, var(--font-heading), "EB Garamond", Georgia, serif',
                textShadow:
                  "0 5px 28px rgba(0, 0, 0, 0.74), 0 0 28px rgba(251, 191, 36, 0.16)"
              }}
            >
              Lexora
            </h1>

            <p className="mt-6 max-w-2xl text-2xl font-bold leading-8 text-stone-50 drop-shadow-[0_3px_14px_rgba(0,0,0,0.72)] sm:text-3xl">
              Where Law Meets Learning
            </p>

            <div className="mt-8 max-w-3xl space-y-5 text-lg font-medium leading-9 text-stone-50 drop-shadow-[0_3px_14px_rgba(0,0,0,0.78)] sm:text-xl sm:leading-9">
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
              className="mt-10 inline-flex rounded-full border border-amber-100/60 bg-amber-300 px-7 py-3 text-base font-bold text-stone-950 shadow-xl shadow-stone-950/35 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-stone-950"
              href="/sign-in"
              routeAuthenticatedUser
            >
              Enter Lexora
            </HomeRouteAction>
          </div>

          <footer className="mt-12 flex max-w-2xl flex-col gap-3 border-t border-amber-100/22 pt-5 text-sm leading-6 text-stone-100 drop-shadow-[0_3px_14px_rgba(0,0,0,0.78)] sm:flex-row sm:items-center sm:text-base">
            <Image
              src="/images/heat-logo.png"
              alt="HEAT Project logo"
              width={150}
              height={64}
              className="h-11 w-fit shrink-0 object-contain sm:h-12"
            />
            <p>Developed with funding from the HEAT-12211-CU Project.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
