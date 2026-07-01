"use client";

import { SectionCard } from "@lexora/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type {
  CourseOffering,
  CreateTeacherAssignmentPayload,
  ManagedUser
} from "@/lib/api-client";
import {
  ApiClientError,
  assignTeacherToCourseOffering,
  getCourseOfferings,
  getManagedUsers,
  listTeacherAssignmentsForCourseOffering,
  unassignTeacherAssignment
} from "@/lib/api-client";

interface AssignmentFormState {
  teacherUserId: string;
  roleCode: string;
}

const emptyAssignmentForm: AssignmentFormState = {
  teacherUserId: "",
  roleCode: "primary_instructor"
};

export function AdminTeacherAssignmentsPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;
  const queryClient = useQueryClient();
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [formState, setFormState] = useState<AssignmentFormState>(emptyAssignmentForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const authContext = useMemo(() => {
    if (!accessToken || !departmentId) {
      return null;
    }

    return {
      accessToken,
      departmentId
    };
  }, [accessToken, departmentId]);
  const courseOfferingsQueryKey = useMemo(
    () => ["admin", "course-offerings", departmentId] as const,
    [departmentId]
  );
  const usersQueryKey = useMemo(
    () => ["admin", "managed-users", departmentId] as const,
    [departmentId]
  );
  const assignmentsQueryKey = useMemo(
    () => ["admin", "teacher-assignments", departmentId, selectedOfferingId] as const,
    [departmentId, selectedOfferingId]
  );

  const courseOfferingsQuery = useQuery({
    queryKey: courseOfferingsQueryKey,
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getCourseOfferings(authContext);
    },
    enabled: Boolean(authContext)
  });
  const usersQuery = useQuery({
    queryKey: usersQueryKey,
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getManagedUsers(authContext);
    },
    enabled: Boolean(authContext)
  });
  const assignmentsQuery = useQuery({
    queryKey: assignmentsQueryKey,
    queryFn: () => {
      if (!authContext || !selectedOfferingId) {
        throw new Error("Select a course offering first.");
      }

      return listTeacherAssignmentsForCourseOffering(authContext, selectedOfferingId);
    },
    enabled: Boolean(authContext && selectedOfferingId)
  });

  const activeTeachers = useMemo(() => {
    return (usersQuery.data ?? [])
      .filter((user) => user.roles.includes("teacher") && user.status === "ACTIVE")
      .sort((first, second) => first.displayName.localeCompare(second.displayName));
  }, [usersQuery.data]);

  const selectedOffering = useMemo(() => {
    return (courseOfferingsQuery.data ?? []).find(
      (offering) => offering.id === selectedOfferingId
    );
  }, [courseOfferingsQuery.data, selectedOfferingId]);

  const assignMutation = useMutation({
    mutationFn: (payload: CreateTeacherAssignmentPayload) => {
      if (!authContext || !selectedOfferingId) {
        throw new Error("Select a course offering first.");
      }

      return assignTeacherToCourseOffering(authContext, selectedOfferingId, payload);
    },
    onSuccess: async (assignment) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assignmentsQueryKey }),
        queryClient.invalidateQueries({ queryKey: courseOfferingsQueryKey })
      ]);
      setSuccessMessage(
        `${formatTeacherName(assignment.teacherUser, assignment.teacherUserId)} was assigned.`
      );
      setFormError(null);
      setFormState(emptyAssignmentForm);
    },
    onError: (error) => {
      setSuccessMessage(null);
      setFormError(formatTeacherAssignmentsError(error));
    }
  });

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return unassignTeacherAssignment(authContext, assignmentId);
    },
    onSuccess: async (assignment) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assignmentsQueryKey }),
        queryClient.invalidateQueries({ queryKey: courseOfferingsQueryKey })
      ]);
      setSuccessMessage(
        `${formatTeacherName(assignment.teacherUser, assignment.teacherUserId)} was unassigned.`
      );
      setFormError(null);
    },
    onError: (error) => {
      setSuccessMessage(null);
      setFormError(formatTeacherAssignmentsError(error));
    }
  });

  function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setFormError(null);

    const teacherUserId = formState.teacherUserId.trim();
    const roleCode = formState.roleCode.trim();

    if (!selectedOfferingId) {
      setFormError("Select a course offering first.");
      return;
    }

    if (!teacherUserId) {
      setFormError("Select an active teacher.");
      return;
    }

    if (!roleCode) {
      setFormError("Role code is required.");
      return;
    }

    assignMutation.mutate({
      teacherUserId,
      roleCode
    });
  }

  function handleOfferingChange(offeringId: string) {
    setSelectedOfferingId(offeringId);
    setFormState(emptyAssignmentForm);
    setFormError(null);
    setSuccessMessage(null);
  }

  function handleUnassign(assignmentId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to unassign this teacher from the selected course offering?"
    );

    if (confirmed) {
      unassignMutation.mutate(assignmentId);
    }
  }

  const isMutating = assignMutation.isPending || unassignMutation.isPending;

  return (
    <SectionCard
      title="Teacher assignments"
      description="Assign active teachers to department course offerings."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-end">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              Course offering assignment
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Select an offering, then review and manage its teacher assignments.
            </p>
          </div>
          <label className="text-sm font-medium text-slate-700">
            Course offering
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
              disabled={courseOfferingsQuery.isLoading || isMutating}
              value={selectedOfferingId}
              onChange={(event) => handleOfferingChange(event.target.value)}
            >
              <option value="">Select offering</option>
              {(courseOfferingsQuery.data ?? []).map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {formatOfferingLabel(offering)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {successMessage ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      {courseOfferingsQuery.isError || usersQuery.isError ? (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatTeacherAssignmentsError(courseOfferingsQuery.error ?? usersQuery.error)}
        </div>
      ) : null}

      {selectedOffering ? (
        <form
          className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={handleAssign}
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-950">Assign teacher</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Role code examples: primary_instructor, co_instructor, section_teacher,
              lab_instructor.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]">
            <label className="text-sm font-medium text-slate-700">
              Teacher
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                disabled={usersQuery.isLoading || isMutating}
                required
                value={formState.teacherUserId}
                onChange={(event) =>
                  setFormState({ ...formState, teacherUserId: event.target.value })
                }
              >
                <option value="">Select active teacher</option>
                {activeTeachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {formatManagedUserLabel(teacher)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Role code
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                disabled={isMutating}
                maxLength={64}
                required
                value={formState.roleCode}
                onChange={(event) =>
                  setFormState({ ...formState, roleCode: event.target.value })
                }
              />
            </label>
          </div>

          {usersQuery.isSuccess && activeTeachers.length === 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No active teacher users are available for assignment.
            </div>
          ) : null}

          {formError ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {formError}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!authContext || !selectedOfferingId || activeTeachers.length === 0 || isMutating}
              type="submit"
            >
              {assignMutation.isPending ? "Assigning..." : "Assign teacher"}
            </button>
          </div>
        </form>
      ) : null}

      {courseOfferingsQuery.isLoading || usersQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading assignment options...</p>
      ) : null}

      {!selectedOfferingId && courseOfferingsQuery.isSuccess ? (
        <p className="text-sm text-slate-600">
          Select a course offering to view teacher assignments.
        </p>
      ) : null}

      {assignmentsQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading teacher assignments...</p>
      ) : null}

      {assignmentsQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatTeacherAssignmentsError(assignmentsQuery.error)}
        </div>
      ) : null}

      {assignmentsQuery.isSuccess && assignmentsQuery.data.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-sm font-medium text-slate-900">
            No teacher assignments recorded for this offering.
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Active assignments will appear here after a teacher is assigned.
          </p>
        </div>
      ) : null}

      {assignmentsQuery.isSuccess && assignmentsQuery.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Teacher</th>
                <th className="px-4 py-3 font-semibold">Role code</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Assigned</th>
                <th className="px-4 py-3 font-semibold">Unassigned</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {assignmentsQuery.data.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950">
                      {formatTeacherName(assignment.teacherUser, assignment.teacherUserId)}
                    </p>
                    <p className="mt-1 break-all text-xs leading-5 text-slate-500">
                      {formatValue(assignment.teacherUser?.email)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatValue(assignment.roleCode)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatStatus(assignment.status)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDate(assignment.assignedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDate(assignment.unassignedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {assignment.status === "ACTIVE" ? (
                      <button
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isMutating}
                        type="button"
                        onClick={() => handleUnassign(assignment.id)}
                      >
                        {unassignMutation.isPending ? "Unassigning..." : "Unassign"}
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">
                        Not active
                      </span>
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

function formatTeacherAssignmentsError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Teacher assignments could not be loaded right now.";
}

function formatOfferingLabel(offering: CourseOffering) {
  const courseCode = formatValue(offering.course?.code);
  const courseTitle = formatValue(offering.course?.title);
  const sectionCode = formatValue(offering.sectionCode);
  const term = formatAcademicTerm(offering);

  return `${courseCode} - ${courseTitle} / ${sectionCode} / ${term}`;
}

function formatAcademicTerm(offering: CourseOffering) {
  const code = offering.academicTerm?.code;
  const name = offering.academicTerm?.name;

  if (code && name && code !== name) {
    return `${code} - ${name}`;
  }

  return formatValue(code ?? name);
}

function formatManagedUserLabel(user: ManagedUser) {
  return `${user.displayName} - ${user.email}`;
}

function formatTeacherName(
  teacher: { displayName?: string | null } | null | undefined,
  fallbackId: string
) {
  return formatValue(teacher?.displayName ?? fallbackId);
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
