"use client";

import { SectionCard } from "@lexora/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type { AcademicCourse, CoursePayload, CourseStatus } from "@/lib/api-client";
import { ApiClientError, createCourse, getCourses, updateCourse } from "@/lib/api-client";

const COURSE_STATUSES: CourseStatus[] = ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"];

interface CourseFormState {
  academicProgramId: string;
  code: string;
  title: string;
  description: string;
  creditHours: string;
  lectureHours: string;
  labHours: string;
  status: CourseStatus;
}

const emptyCourseForm: CourseFormState = {
  academicProgramId: "",
  code: "",
  title: "",
  description: "",
  creditHours: "",
  lectureHours: "",
  labHours: "",
  status: "ACTIVE"
};

export function AdminCoursesPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<CourseFormState>(emptyCourseForm);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
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
  const coursesQueryKey = useMemo(
    () => ["admin", "courses", departmentId] as const,
    [departmentId]
  );

  const coursesQuery = useQuery({
    queryKey: coursesQueryKey,
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getCourses(authContext, { status: "ALL" });
    },
    enabled: Boolean(authContext)
  });
  const saveCourseMutation = useMutation({
    mutationFn: (payload: CoursePayload) => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      if (editingCourseId) {
        return updateCourse(authContext, editingCourseId, payload);
      }

      return createCourse(authContext, payload);
    },
    onSuccess: async (course) => {
      await queryClient.invalidateQueries({ queryKey: coursesQueryKey });
      setSuccessMessage(
        editingCourseId
          ? `${course.code} was updated.`
          : `${course.code} was created.`
      );
      setFormError(null);
      resetForm();
    },
    onError: (error) => {
      setSuccessMessage(null);
      setFormError(formatCoursesError(error));
    }
  });
  const isSaving = saveCourseMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setFormError(null);

    const payload = buildCoursePayload(formState);

    if (!payload.code || !payload.title || !payload.creditHours) {
      setFormError("Code, title, and credit hours are required.");
      return;
    }

    saveCourseMutation.mutate(payload);
  }

  function resetForm() {
    setFormState(emptyCourseForm);
    setEditingCourseId(null);
  }

  function startEditing(course: AcademicCourse) {
    setEditingCourseId(course.id);
    setFormError(null);
    setSuccessMessage(null);
    setFormState({
      academicProgramId: course.academicProgramId ?? "",
      code: course.code,
      title: course.title,
      description: course.description ?? "",
      creditHours: String(course.creditHours),
      lectureHours: course.lectureHours === null ? "" : String(course.lectureHours),
      labHours: course.labHours === null ? "" : String(course.labHours),
      status: course.status
    });
  }

  return (
    <SectionCard
      title="Academic courses"
      description="Department-scoped courses currently available through the Courses API."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      <form
        className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4"
        onSubmit={handleSubmit}
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {editingCourseId ? "Edit course" : "Create course"}
            </h3>
          </div>
          {editingCourseId ? (
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={() => {
                resetForm();
                setFormError(null);
                setSuccessMessage(null);
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Code
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              maxLength={50}
              required
              value={formState.code}
              onChange={(event) => setFormState({ ...formState, code: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Title
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              maxLength={200}
              required
              value={formState.title}
              onChange={(event) => setFormState({ ...formState, title: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Credit hours
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              inputMode="decimal"
              required
              value={formState.creditHours}
              onChange={(event) =>
                setFormState({ ...formState, creditHours: event.target.value })
              }
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              value={formState.status}
              onChange={(event) =>
                setFormState({ ...formState, status: event.target.value as CourseStatus })
              }
            >
              {COURSE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Lecture hours
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              inputMode="decimal"
              value={formState.lectureHours}
              onChange={(event) =>
                setFormState({ ...formState, lectureHours: event.target.value })
              }
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Lab hours
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              inputMode="decimal"
              value={formState.labHours}
              onChange={(event) => setFormState({ ...formState, labHours: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Academic program ID
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              value={formState.academicProgramId}
              onChange={(event) =>
                setFormState({ ...formState, academicProgramId: event.target.value })
              }
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Description
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              maxLength={2000}
              value={formState.description}
              onChange={(event) =>
                setFormState({ ...formState, description: event.target.value })
              }
            />
          </label>
        </div>

        {formError ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {formError}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!authContext || isSaving}
            type="submit"
          >
            {isSaving ? "Saving..." : editingCourseId ? "Update course" : "Create course"}
          </button>
        </div>
      </form>

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
          No academic courses have been created for this department yet.
        </p>
      ) : null}

      {coursesQuery.isSuccess && coursesQuery.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Credits</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
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
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSaving}
                      type="button"
                      onClick={() => startEditing(course)}
                    >
                      Edit
                    </button>
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

function buildCoursePayload(formState: CourseFormState): CoursePayload {
  const payload: CoursePayload = {
    code: formState.code.trim(),
    title: formState.title.trim(),
    creditHours: formState.creditHours.trim(),
    status: formState.status
  };

  const academicProgramId = formState.academicProgramId.trim();
  const description = formState.description.trim();
  const lectureHours = formState.lectureHours.trim();
  const labHours = formState.labHours.trim();

  if (academicProgramId) {
    payload.academicProgramId = academicProgramId;
  }

  if (description) {
    payload.description = description;
  }

  if (lectureHours) {
    payload.lectureHours = lectureHours;
  }

  if (labHours) {
    payload.labHours = labHours;
  }

  return payload;
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
