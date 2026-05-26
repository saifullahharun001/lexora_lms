"use client";

import { SectionCard } from "@lexora/ui";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/providers/auth-provider";
import { ApiClientError, getCourses } from "@/lib/api-client";

export function AdminCoursesPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;

  const coursesQuery = useQuery({
    queryKey: ["admin", "courses", departmentId],
    queryFn: () => {
      if (!accessToken || !departmentId) {
        throw new Error("Department session is not ready.");
      }

      return getCourses({
        accessToken,
        departmentId
      });
    },
    enabled: Boolean(accessToken && departmentId)
  });

  return (
    <SectionCard
      title="Academic courses"
      description="Department-scoped courses currently available through the Courses API."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      {coursesQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading courses...</p>
      ) : null}

      {coursesQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatCoursesError(coursesQuery.error)}
        </div>
      ) : null}

      {coursesQuery.isSuccess && coursesQuery.data.length === 0 ? (
        <p className="text-sm text-slate-600">
          No academic courses have been published for this department yet.
        </p>
      ) : null}

      {coursesQuery.isSuccess && coursesQuery.data.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Credits</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {coursesQuery.data.map((course) => (
                <tr key={course.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-950">
                    {course.code}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{course.title}</p>
                    {course.description ? (
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {course.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatCreditHours(course.creditHours)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatStatus(course.status)}
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

function formatCoursesError(error: Error) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Courses could not be loaded right now.";
}

function formatCreditHours(creditHours: string | number) {
  return String(creditHours);
}

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
