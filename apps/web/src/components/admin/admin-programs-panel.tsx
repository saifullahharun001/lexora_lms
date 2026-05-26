"use client";

import { SectionCard } from "@lexora/ui";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/components/providers/auth-provider";
import { ApiClientError, getPrograms } from "@/lib/api-client";

export function AdminProgramsPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;

  const programsQuery = useQuery({
    queryKey: ["admin", "programs", departmentId],
    queryFn: () => {
      if (!accessToken || !departmentId) {
        throw new Error("Department session is not ready.");
      }

      return getPrograms({
        accessToken,
        departmentId
      });
    },
    enabled: Boolean(accessToken && departmentId)
  });

  return (
    <SectionCard
      title="Academic programs"
      description="Department-scoped programs currently available through the Programs API."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      {programsQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading programs...</p>
      ) : null}

      {programsQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatProgramsError(programsQuery.error)}
        </div>
      ) : null}

      {programsQuery.isSuccess && programsQuery.data.length === 0 ? (
        <p className="text-sm text-slate-600">
          No academic programs have been published for this department yet.
        </p>
      ) : null}

      {programsQuery.isSuccess && programsQuery.data.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Program</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {programsQuery.data.map((program) => (
                <tr key={program.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-950">
                    {program.code}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{program.name}</p>
                    {program.description ? (
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {program.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatStatus(program.status)}
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

function formatProgramsError(error: Error) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Programs could not be loaded right now.";
}

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
