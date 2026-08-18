"use client";

import { SectionCard } from "@lexora/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type { CourseOffering } from "@/lib/api-client";
import { ApiClientError, getCourseOfferings } from "@/lib/api-client";

export function TeacherAssignedCoursesPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;

  const authContext = useMemo(() => {
    if (!accessToken || !departmentId) {
      return null;
    }

    return {
      accessToken,
      departmentId
    };
  }, [accessToken, departmentId]);

  const assignedCoursesQuery = useQuery({
    queryKey: ["teacher", "course-offerings", departmentId],
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getCourseOfferings(authContext);
    },
    enabled: Boolean(authContext)
  });

  return (
    <SectionCard
      title="Assigned course offerings"
      description="Course sections currently assigned to you by the department."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      {assignedCoursesQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading assigned course offerings...</p>
      ) : null}

      {assignedCoursesQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatCourseOfferingsError(assignedCoursesQuery.error)}
        </div>
      ) : null}

      {assignedCoursesQuery.isSuccess && assignedCoursesQuery.data.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-sm font-medium text-slate-900">
            No assigned course offerings yet.
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Your assigned course sections will appear here once they are recorded by
            your department.
          </p>
        </div>
      ) : null}

      {assignedCoursesQuery.isSuccess && assignedCoursesQuery.data.length > 0 ? (
        <ul className="grid min-w-0 gap-3">
          {assignedCoursesQuery.data.map((offering) => (
            <li
              key={offering.id}
              className="min-w-0 rounded-lg border border-slate-200 bg-white p-4"
            >
              <article className="min-w-0">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">
                      {formatCourseCode(offering)}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      {formatCourseTitle(offering)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Link
                      href={`/teacher/courses/${encodeURIComponent(offering.id)}`}
                      className="inline-flex w-full justify-center rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:border-teal-300 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-300 sm:w-auto"
                    >
                      Open workspace
                    </Link>
                  </div>
                </div>

                <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3">
                  <CourseMetadata
                    label="Section"
                    value={formatValue(offering.sectionCode)}
                  />
                  <CourseMetadata
                    label="Academic term"
                    value={formatAcademicTerm(offering)}
                  />
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </dt>
                    <dd className="mt-1">
                      <StatusPill label={formatStatus(offering.status)} />
                    </dd>
                  </div>
                </dl>

                <dl className="mt-4 flex min-w-0 flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-3 text-xs text-slate-600">
                  <div className="flex min-w-0 gap-1.5">
                    <dt className="font-semibold text-slate-700">Capacity:</dt>
                    <dd>{formatCapacity(offering.capacity)}</dd>
                  </div>
                  <div className="flex min-w-0 gap-1.5">
                    <dt className="shrink-0 font-semibold text-slate-700">
                      Visibility:
                    </dt>
                    <dd className="min-w-0">
                      {formatVisibilityRange(
                        offering.visibilityStartAt,
                        offering.visibilityEndAt
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

function CourseMetadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
      {label}
    </span>
  );
}

function formatCourseOfferingsError(error: Error) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Assigned course offerings could not be loaded right now.";
}

function formatCourseCode(offering: CourseOffering) {
  return formatValue(offering.course?.code);
}

function formatCourseTitle(offering: CourseOffering) {
  return formatValue(offering.course?.title);
}

function formatAcademicTerm(offering: CourseOffering) {
  const code = offering.academicTerm?.code;
  const name = offering.academicTerm?.name;

  if (code && name && code !== name) {
    return `${code} - ${name}`;
  }

  return formatValue(code ?? name);
}

function formatCapacity(capacity: number | null | undefined) {
  if (typeof capacity === "number") {
    return String(capacity);
  }

  return "Not set";
}

function formatVisibilityRange(
  startAt: string | null | undefined,
  endAt: string | null | undefined
) {
  if (!startAt && !endAt) {
    return "Not set";
  }

  return `${formatDate(startAt)} - ${formatDate(endAt)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString();
}

function formatStatus(status: string | null | undefined) {
  if (!status) {
    return "Not set";
  }

  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return String(value);
}
