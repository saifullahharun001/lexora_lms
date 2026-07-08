"use client";

import { SectionCard } from "@lexora/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type {
  AcademicCourse,
  AcademicTerm,
  CourseOffering,
  CourseOfferingPayload,
  CourseOfferingStatus,
  UpdateCourseOfferingPayload
} from "@/lib/api-client";
import {
  ApiClientError,
  createCourseOffering,
  getAcademicTerms,
  getCourseOfferings,
  getCourses,
  updateCourseOffering
} from "@/lib/api-client";

const OFFERING_FORM_STATUSES: CourseOfferingStatus[] = [
  "PLANNED",
  "PUBLISHED",
  "ENROLLMENT_OPEN",
  "IN_PROGRESS",
  "CANCELED"
];

interface OfferingFormState {
  courseId: string;
  academicTermId: string;
  sectionCode: string;
  capacity: string;
  status: CourseOfferingStatus;
  visibilityStartAt: string;
  visibilityEndAt: string;
}

type OfferingMutationInput =
  | {
      mode: "create";
      payload: CourseOfferingPayload;
    }
  | {
      mode: "update";
      offeringId: string;
      payload: UpdateCourseOfferingPayload;
    };

const emptyOfferingForm: OfferingFormState = {
  courseId: "",
  academicTermId: "",
  sectionCode: "",
  capacity: "",
  status: "PLANNED",
  visibilityStartAt: "",
  visibilityEndAt: ""
};

export function AdminCourseOfferingsPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<OfferingFormState>(emptyOfferingForm);
  const [editingOffering, setEditingOffering] = useState<CourseOffering | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
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
  const activeCoursesQuery = useQuery({
    queryKey: ["admin", "courses", departmentId, "active"],
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getCourses(authContext, { status: "ACTIVE" });
    },
    enabled: Boolean(authContext)
  });
  const academicTermsQuery = useQuery({
    queryKey: ["admin", "academic-terms", departmentId],
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getAcademicTerms(authContext);
    },
    enabled: Boolean(authContext)
  });
  const saveOfferingMutation = useMutation({
    mutationFn: (input: OfferingMutationInput) => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      if (input.mode === "update") {
        return updateCourseOffering(authContext, input.offeringId, input.payload);
      }

      return createCourseOffering(authContext, input.payload);
    },
    onSuccess: async (offering) => {
      await queryClient.invalidateQueries({ queryKey: courseOfferingsQueryKey });
      setSuccessMessage(
        editingOffering
          ? `${formatOfferingName(offering)} was updated.`
          : `${formatOfferingName(offering)} was created.`
      );
      setFormError(null);
      resetForm();
    },
    onError: (error) => {
      setSuccessMessage(null);
      setFormError(formatCourseOfferingsError(error));
    }
  });
  const isSaving = saveOfferingMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setFormError(null);

    if (editingOffering) {
      const payload = buildUpdateOfferingPayload(formState);

      if (!payload.sectionCode) {
        setFormError("Section code is required.");
        return;
      }

      saveOfferingMutation.mutate({
        mode: "update",
        offeringId: editingOffering.id,
        payload
      });
      return;
    }

    const payload = buildCreateOfferingPayload(formState);

    if (!payload.courseId || !payload.academicTermId || !payload.sectionCode) {
      setFormError("Course, academic term, and section code are required.");
      return;
    }

    saveOfferingMutation.mutate({
      mode: "create",
      payload
    });
  }

  function resetForm() {
    setFormState(emptyOfferingForm);
    setEditingOffering(null);
    setIsFormOpen(false);
  }

  function startCreating() {
    setFormState(emptyOfferingForm);
    setEditingOffering(null);
    setFormError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function startEditing(offering: CourseOffering) {
    setEditingOffering(offering);
    setFormError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
    setFormState({
      courseId: offering.courseId ?? offering.course?.id ?? "",
      academicTermId: offering.academicTermId ?? offering.academicTerm?.id ?? "",
      sectionCode: offering.sectionCode ?? "",
      capacity: offering.capacity === null || offering.capacity === undefined ? "" : String(offering.capacity),
      status: offering.status ?? "PLANNED",
      visibilityStartAt: toDateTimeLocalValue(offering.visibilityStartAt),
      visibilityEndAt: toDateTimeLocalValue(offering.visibilityEndAt)
    });
  }

  const formStatusOptions = getFormStatusOptions(formState.status);

  return (
    <SectionCard
      title="Course offerings"
      description="Department-scoped course sections available through the Course Offerings API."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Offering management</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Add or update course sections for academic terms.
            </p>
          </div>
          {!isFormOpen ? (
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!authContext}
              type="button"
              onClick={startCreating}
            >
              Create offering
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
              {editingOffering ? "Edit offering" : "Create offering"}
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

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Course
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                disabled={Boolean(editingOffering) || activeCoursesQuery.isLoading}
                required
                value={formState.courseId}
                onChange={(event) =>
                  setFormState({ ...formState, courseId: event.target.value })
                }
              >
                <option value="">Select course</option>
                {editingOffering && formState.courseId ? (
                  <option value={formState.courseId}>
                    {formatCourseSelectLabel(editingOffering.course, formState.courseId)}
                  </option>
                ) : null}
                {(activeCoursesQuery.data ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Academic term
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                disabled={Boolean(editingOffering) || academicTermsQuery.isLoading}
                required
                value={formState.academicTermId}
                onChange={(event) =>
                  setFormState({ ...formState, academicTermId: event.target.value })
                }
              >
                <option value="">Select term</option>
                {editingOffering && formState.academicTermId ? (
                  <option value={formState.academicTermId}>
                    {formatTermSelectLabel(editingOffering.academicTerm, formState.academicTermId)}
                  </option>
                ) : null}
                {(academicTermsQuery.data ?? []).map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.code} - {term.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Section code
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                maxLength={20}
                required
                value={formState.sectionCode}
                onChange={(event) =>
                  setFormState({ ...formState, sectionCode: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Capacity
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                inputMode="numeric"
                min={1}
                type="number"
                value={formState.capacity}
                onChange={(event) =>
                  setFormState({ ...formState, capacity: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={formState.status}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    status: event.target.value as CourseOfferingStatus
                  })
                }
              >
                {formStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <div aria-hidden className="hidden md:block" />
            <label className="text-sm font-medium text-slate-700">
              Visibility starts
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                type="datetime-local"
                value={formState.visibilityStartAt}
                onChange={(event) =>
                  setFormState({ ...formState, visibilityStartAt: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Visibility ends
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                type="datetime-local"
                value={formState.visibilityEndAt}
                onChange={(event) =>
                  setFormState({ ...formState, visibilityEndAt: event.target.value })
                }
              />
            </label>
          </div>

          {activeCoursesQuery.isError || academicTermsQuery.isError ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Courses or academic terms could not be loaded right now.
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
              {isSaving
                ? "Saving..."
                : editingOffering
                  ? "Update offering"
                  : "Create offering"}
            </button>
          </div>
        </form>
      ) : null}

      {courseOfferingsQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading course offerings...</p>
      ) : null}

      {courseOfferingsQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatCourseOfferingsError(courseOfferingsQuery.error)}
        </div>
      ) : null}

      {courseOfferingsQuery.isSuccess && courseOfferingsQuery.data.length === 0 ? (
        <p className="text-sm text-slate-600">
          No course offerings have been published for this department yet.
        </p>
      ) : null}

      {courseOfferingsQuery.isSuccess && courseOfferingsQuery.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Section</th>
                <th className="px-4 py-3 font-semibold">Term</th>
                <th className="px-4 py-3 font-semibold">Capacity</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Visibility</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {courseOfferingsQuery.data.map((offering) => (
                <tr key={offering.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950">
                      {formatCourseCode(offering)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {formatCourseTitle(offering)}
                    </p>
                    {offering.course?.status && offering.course.status !== "ACTIVE" ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Course is {formatStatus(offering.course.status)}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatValue(offering.sectionCode)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatAcademicTerm(offering)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatCapacity(offering.capacity)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatStatus(offering.status)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatVisibilityRange(offering.visibilityStartAt, offering.visibilityEndAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSaving}
                      type="button"
                      onClick={() => startEditing(offering)}
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

function buildCreateOfferingPayload(formState: OfferingFormState): CourseOfferingPayload {
  const payload: CourseOfferingPayload = {
    courseId: formState.courseId,
    academicTermId: formState.academicTermId,
    sectionCode: formState.sectionCode.trim(),
    status: formState.status
  };
  const capacity = formState.capacity.trim();
  const visibilityStartAt = formState.visibilityStartAt.trim();
  const visibilityEndAt = formState.visibilityEndAt.trim();

  if (capacity) {
    payload.capacity = Number(capacity);
  }

  if (visibilityStartAt) {
    payload.visibilityStartAt = new Date(visibilityStartAt).toISOString();
  }

  if (visibilityEndAt) {
    payload.visibilityEndAt = new Date(visibilityEndAt).toISOString();
  }

  return payload;
}

function buildUpdateOfferingPayload(formState: OfferingFormState): UpdateCourseOfferingPayload {
  return buildMutableOfferingPayload(formState);
}

function buildMutableOfferingPayload(
  formState: OfferingFormState
): UpdateCourseOfferingPayload {
  const payload: UpdateCourseOfferingPayload = {
    sectionCode: formState.sectionCode.trim(),
    status: formState.status
  };
  const capacity = formState.capacity.trim();
  const visibilityStartAt = formState.visibilityStartAt.trim();
  const visibilityEndAt = formState.visibilityEndAt.trim();

  if (capacity) {
    payload.capacity = Number(capacity);
  }

  if (visibilityStartAt) {
    payload.visibilityStartAt = new Date(visibilityStartAt).toISOString();
  }

  if (visibilityEndAt) {
    payload.visibilityEndAt = new Date(visibilityEndAt).toISOString();
  }

  return payload;
}

function getFormStatusOptions(currentStatus: CourseOfferingStatus) {
  if (OFFERING_FORM_STATUSES.includes(currentStatus)) {
    return OFFERING_FORM_STATUSES;
  }

  return [currentStatus, ...OFFERING_FORM_STATUSES];
}

function formatCourseOfferingsError(error: Error) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Course offerings could not be loaded right now.";
}

function formatOfferingName(offering: CourseOffering) {
  return `${formatCourseCode(offering)} ${formatValue(offering.sectionCode)}`;
}

function formatCourseSelectLabel(course: Partial<AcademicCourse> | null | undefined, fallbackId: string) {
  if (course?.code && course.title) {
    return `${course.code} - ${course.title}`;
  }

  return formatValue(course?.code ?? course?.title ?? fallbackId);
}

function formatTermSelectLabel(term: Partial<AcademicTerm> | null | undefined, fallbackId: string) {
  if (term?.code && term.name) {
    return `${term.code} - ${term.name}`;
  }

  return formatValue(term?.code ?? term?.name ?? fallbackId);
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

  if (code && name) {
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

function formatVisibilityRange(startAt: string | null | undefined, endAt: string | null | undefined) {
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

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return offsetDate.toISOString().slice(0, 16);
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
