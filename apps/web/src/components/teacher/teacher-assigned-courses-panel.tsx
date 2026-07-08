"use client";

import { SectionCard } from "@lexora/ui";
import { useQuery } from "@tanstack/react-query";
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
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Section</th>
                <th className="px-4 py-3 font-semibold">Term</th>
                <th className="px-4 py-3 font-semibold">Capacity</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Visibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {assignedCoursesQuery.data.map((offering) => (
                <tr key={offering.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950">
                      {formatCourseCode(offering)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {formatCourseTitle(offering)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatValue(offering.sectionCode)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatAcademicTerm(offering)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatCapacity(offering.capacity)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusPill label={formatStatus(offering.status)} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatVisibilityRange(
                      offering.visibilityStartAt,
                      offering.visibilityEndAt
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </SectionCard>
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
