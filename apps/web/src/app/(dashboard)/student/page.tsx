"use client";

import { SectionCard } from "@lexora/ui";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/providers/auth-provider";
import { ApiClientError, getMyEnrollments } from "@/lib/api-client";

export default function StudentPage() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;

  const enrollmentsQuery = useQuery({
    queryKey: ["student", "enrollments", departmentId, session?.user.id],
    queryFn: () => {
      if (!accessToken || !departmentId) {
        throw new Error("Student session is not ready.");
      }

      return getMyEnrollments({
        accessToken,
        departmentId
      });
    },
    enabled: Boolean(accessToken && departmentId)
  });

  return (
    <div className="space-y-4">
      <SectionCard
        title="My enrolled courses"
        description="Courses currently tied to your student enrollment record."
      >
        {!accessToken || !departmentId ? (
          <p className="text-sm text-slate-600">Preparing student session...</p>
        ) : null}

        {enrollmentsQuery.isLoading ? (
          <p className="text-sm text-slate-600">Loading enrolled courses...</p>
        ) : null}

        {enrollmentsQuery.isError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {formatEnrollmentsError(enrollmentsQuery.error)}
          </div>
        ) : null}

        {enrollmentsQuery.isSuccess && enrollmentsQuery.data.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-medium text-slate-900">
              No enrolled courses yet.
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Your approved or pending course enrollments will appear here once
              they are recorded by your department.
            </p>
          </div>
        ) : null}

        {enrollmentsQuery.isSuccess && enrollmentsQuery.data.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {enrollmentsQuery.data.map((enrollment) => {
              const course = enrollment.courseOffering.course;
              const term = enrollment.academicTerm;

              return (
                <article
                  key={enrollment.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        {course.code || "Course"}
                      </p>
                      <h3 className="mt-1 text-base font-semibold leading-6 text-slate-950">
                        {course.title || "Untitled course"}
                      </h3>
                    </div>
                    <StatusPill label={formatStatus(enrollment.status)} />
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Section</dt>
                      <dd className="mt-1 font-medium text-slate-900">
                        {enrollment.courseOffering.sectionCode || "Not assigned"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Term</dt>
                      <dd className="mt-1 font-medium text-slate-900">
                        {formatTerm(term.name, term.code)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium text-slate-500">
                        Eligibility
                      </dt>
                      <dd className="mt-1 font-medium text-slate-900">
                        {formatStatus(enrollment.eligibilityStatus)}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
      {label}
    </span>
  );
}

function formatEnrollmentsError(error: Error) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Enrolled courses could not be loaded right now.";
}

function formatTerm(name: string, code: string) {
  if (name && code && name !== code) {
    return `${name} (${code})`;
  }

  return name || code || "Not assigned";
}

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
