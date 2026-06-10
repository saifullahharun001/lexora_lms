"use client";

import { SectionCard } from "@lexora/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type { AcademicCourse, CoursePayload, CourseStatus } from "@/lib/api-client";
import {
  ApiClientError,
  createCourse,
  getCourses,
  getPrograms,
  updateCourse
} from "@/lib/api-client";

const COURSE_FORM_STATUSES: CourseStatus[] = ["DRAFT", "ACTIVE", "INACTIVE"];
const COURSE_BUCKETS: Array<{
  status: CourseStatus;
  label: string;
  emptyMessage: string;
}> = [
  {
    status: "ACTIVE",
    label: "Active courses",
    emptyMessage: "No active courses found."
  },
  {
    status: "INACTIVE",
    label: "Inactive courses",
    emptyMessage: "No inactive courses found."
  },
  {
    status: "DRAFT",
    label: "Draft courses",
    emptyMessage: "No draft courses found."
  },
  {
    status: "ARCHIVED",
    label: "Archived courses",
    emptyMessage: "No archived courses found."
  }
];

interface CourseFormState {
  academicProgramId: string;
  code: string;
  title: string;
  description: string;
  creditHours: string;
  lectureHours: string;
  status: CourseStatus;
}

const emptyCourseForm: CourseFormState = {
  academicProgramId: "",
  code: "",
  title: "",
  description: "",
  creditHours: "",
  lectureHours: "",
  status: "ACTIVE"
};

export function AdminCoursesPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<CourseFormState>(emptyCourseForm);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBucketStatus, setSelectedBucketStatus] = useState<CourseStatus | null>(null);
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
  const programsQuery = useQuery({
    queryKey: ["admin", "programs", departmentId],
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getPrograms(authContext);
    },
    enabled: Boolean(authContext)
  });
  const courseCounts = useMemo(() => {
    const counts: Record<CourseStatus, number> = {
      ACTIVE: 0,
      INACTIVE: 0,
      DRAFT: 0,
      ARCHIVED: 0
    };

    for (const course of coursesQuery.data ?? []) {
      counts[course.status] += 1;
    }

    return counts;
  }, [coursesQuery.data]);
  const selectedBucket = COURSE_BUCKETS.find(
    (bucket) => bucket.status === selectedBucketStatus
  );
  const visibleCourses = useMemo(
    () =>
      selectedBucketStatus
        ? (coursesQuery.data ?? []).filter((course) => course.status === selectedBucketStatus)
        : [],
    [coursesQuery.data, selectedBucketStatus]
  );
  const sortedVisibleCourses = useMemo(
    () => [...visibleCourses].sort(compareCoursesByCode),
    [visibleCourses]
  );
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
    onSuccess: (course) => {
      queryClient.setQueryData<AcademicCourse[]>(coursesQueryKey, (currentCourses) => {
        if (!currentCourses) {
          return [course];
        }

        const courseExists = currentCourses.some((currentCourse) => currentCourse.id === course.id);

        if (!courseExists) {
          return [...currentCourses, course];
        }

        return currentCourses.map((currentCourse) =>
          currentCourse.id === course.id ? course : currentCourse
        );
      });

      if (isCourseStatus(course.status)) {
        setSelectedBucketStatus(course.status);
      }

      setSuccessMessage(
        editingCourseId
          ? `${course.code} was updated.`
          : `${course.code} was created.`
      );
      setFormError(null);
      resetForm();
      void queryClient.invalidateQueries({ queryKey: coursesQueryKey });
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
    setIsFormOpen(false);
  }

  function startCreating() {
    setFormState(emptyCourseForm);
    setEditingCourseId(null);
    setFormError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function startEditing(course: AcademicCourse) {
    setEditingCourseId(course.id);
    setFormError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
    setFormState({
      academicProgramId: course.academicProgramId ?? "",
      code: course.code,
      title: course.title,
      description: course.description ?? "",
      creditHours: String(course.creditHours),
      lectureHours: course.lectureHours === null ? "" : String(course.lectureHours),
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

      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Course management</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Add or update Law department courses.
            </p>
          </div>
          {!isFormOpen ? (
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!authContext}
              type="button"
              onClick={startCreating}
            >
              Create course
            </button>
          ) : null}
        </div>
      </div>

      {successMessage ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      {isFormOpen ? (
        <form
          className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={handleSubmit}
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-slate-950">
              {editingCourseId ? "Edit course" : "Create course"}
            </h3>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={() => {
                resetForm();
                setFormError(null);
              }}
            >
              Cancel
            </button>
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
              Academic program
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                disabled={programsQuery.isLoading}
                value={formState.academicProgramId}
                onChange={(event) =>
                  setFormState({ ...formState, academicProgramId: event.target.value })
                }
              >
                <option value="">No program selected</option>
                {(programsQuery.data ?? []).map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.code} - {program.name}
                  </option>
                ))}
              </select>
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
                {COURSE_FORM_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
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

          {programsQuery.isError ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Programs could not be loaded right now. You can save the course without a
              program.
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
              disabled={!authContext || isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : editingCourseId ? "Update course" : "Create course"}
            </button>
          </div>
        </form>
      ) : null}

      {coursesQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading courses...</p>
      ) : null}

      {coursesQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatCoursesError(coursesQuery.error)}
        </div>
      ) : null}

      {coursesQuery.isSuccess ? (
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Courses</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Open a status bucket to review and manage courses.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COURSE_BUCKETS.map((bucket) => {
              const isSelected = bucket.status === selectedBucketStatus;

              return (
                <button
                  key={bucket.status}
                  className={[
                    "rounded-lg border px-4 py-3 text-left transition",
                    isSelected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
                  ].join(" ")}
                  type="button"
                  onClick={() => setSelectedBucketStatus(bucket.status)}
                >
                  <span className="block text-xs font-medium uppercase tracking-wide">
                    {bucket.label}
                  </span>
                  <span className="mt-2 block text-2xl font-semibold">
                    {courseCounts[bucket.status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {coursesQuery.isSuccess && selectedBucket ? (
        sortedVisibleCourses.length === 0 ? (
          <p className="text-sm text-slate-600">{selectedBucket.emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-950">{selectedBucket.label}</h3>
            </div>
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
                {sortedVisibleCourses.map((course) => (
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
                      {course.status === "ARCHIVED" ? (
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
                          Read-only
                        </span>
                      ) : (
                        <button
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving}
                          type="button"
                          onClick={() => startEditing(course)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
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

  if (academicProgramId) {
    payload.academicProgramId = academicProgramId;
  }

  if (description) {
    payload.description = description;
  }

  if (lectureHours) {
    payload.lectureHours = lectureHours;
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

function isCourseStatus(status: string): status is CourseStatus {
  return COURSE_BUCKETS.some((bucket) => bucket.status === status);
}

function compareCoursesByCode(courseA: AcademicCourse, courseB: AcademicCourse) {
  return courseA.code.localeCompare(courseB.code, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
