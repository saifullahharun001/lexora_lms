"use client";

import { SectionCard } from "@lexora/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type {
  AcademicTerm,
  AcademicTermPayload,
  AcademicTermStatus,
  AcademicYear,
  AcademicYearPayload,
  AcademicYearStatus,
  UpdateAcademicTermPayload,
  UpdateAcademicYearPayload
} from "@/lib/api-client";
import {
  ApiClientError,
  createAcademicTerm,
  createAcademicYear,
  getAcademicTerms,
  getAcademicYears,
  updateAcademicTerm,
  updateAcademicYear
} from "@/lib/api-client";

const ACADEMIC_YEAR_STATUSES: AcademicYearStatus[] = [
  "PLANNED",
  "ACTIVE",
  "CLOSED"
];
const ACADEMIC_TERM_STATUSES: AcademicTermStatus[] = [
  "PLANNED",
  "ENROLLMENT_OPEN",
  "IN_PROGRESS",
  "CLOSED"
];

interface YearFormState {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: AcademicYearStatus;
}

interface TermFormState {
  academicYearId: string;
  code: string;
  name: string;
  sequence: string;
  startDate: string;
  endDate: string;
  enrollmentStartAt: string;
  enrollmentEndAt: string;
  status: AcademicTermStatus;
}

type YearMutationInput =
  | {
      mode: "create";
      payload: AcademicYearPayload;
    }
  | {
      mode: "update";
      academicYearId: string;
      payload: UpdateAcademicYearPayload;
    };

type TermMutationInput =
  | {
      mode: "create";
      payload: AcademicTermPayload;
    }
  | {
      mode: "update";
      academicTermId: string;
      payload: UpdateAcademicTermPayload;
    };

const emptyYearForm: YearFormState = {
  code: "",
  name: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  status: "PLANNED"
};

const emptyTermForm: TermFormState = {
  academicYearId: "",
  code: "",
  name: "",
  sequence: "",
  startDate: "",
  endDate: "",
  enrollmentStartAt: "",
  enrollmentEndAt: "",
  status: "PLANNED"
};

export function AdminAcademicCalendarPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;
  const queryClient = useQueryClient();
  const [yearFormState, setYearFormState] = useState<YearFormState>(emptyYearForm);
  const [termFormState, setTermFormState] = useState<TermFormState>(emptyTermForm);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);
  const [isYearFormOpen, setIsYearFormOpen] = useState(false);
  const [isTermFormOpen, setIsTermFormOpen] = useState(false);
  const [yearFormError, setYearFormError] = useState<string | null>(null);
  const [termFormError, setTermFormError] = useState<string | null>(null);
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
  const academicYearsQueryKey = useMemo(
    () => ["admin", "academic-years", departmentId] as const,
    [departmentId]
  );
  const academicTermsQueryKey = useMemo(
    () => ["admin", "academic-terms", departmentId] as const,
    [departmentId]
  );

  const academicYearsQuery = useQuery({
    queryKey: academicYearsQueryKey,
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getAcademicYears(authContext);
    },
    enabled: Boolean(authContext)
  });
  const academicTermsQuery = useQuery({
    queryKey: academicTermsQueryKey,
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getAcademicTerms(authContext);
    },
    enabled: Boolean(authContext)
  });
  const sortedAcademicYears = useMemo(
    () => [...(academicYearsQuery.data ?? [])].sort(compareYears),
    [academicYearsQuery.data]
  );
  const academicYearOrder = useMemo(() => {
    const order = new Map<string, number>();

    sortedAcademicYears.forEach((year, index) => {
      order.set(year.id, index);
    });

    return order;
  }, [sortedAcademicYears]);
  const sortedAcademicTerms = useMemo(
    () =>
      [...(academicTermsQuery.data ?? [])].sort((termA, termB) =>
        compareTerms(termA, termB, academicYearOrder)
      ),
    [academicTermsQuery.data, academicYearOrder]
  );
  const academicYearLabels = useMemo(() => {
    const labels = new Map<string, string>();

    for (const year of academicYearsQuery.data ?? []) {
      labels.set(year.id, formatAcademicYearLabel(year));
    }

    return labels;
  }, [academicYearsQuery.data]);
  const saveYearMutation = useMutation({
    mutationFn: (input: YearMutationInput) => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      if (input.mode === "update") {
        return updateAcademicYear(authContext, input.academicYearId, input.payload);
      }

      return createAcademicYear(authContext, input.payload);
    },
    onSuccess: async (year) => {
      setSuccessMessage(
        editingYear ? `${year.code} was updated.` : `${year.code} was created.`
      );
      setYearFormError(null);
      resetYearForm();
      await queryClient.invalidateQueries({ queryKey: academicYearsQueryKey });
      await queryClient.invalidateQueries({ queryKey: academicTermsQueryKey });
    },
    onError: (error) => {
      setSuccessMessage(null);
      setYearFormError(formatAcademicCalendarError(error, "Academic years"));
    }
  });
  const saveTermMutation = useMutation({
    mutationFn: (input: TermMutationInput) => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      if (input.mode === "update") {
        return updateAcademicTerm(authContext, input.academicTermId, input.payload);
      }

      return createAcademicTerm(authContext, input.payload);
    },
    onSuccess: async (term) => {
      setSuccessMessage(
        editingTerm ? `${term.code} was updated.` : `${term.code} was created.`
      );
      setTermFormError(null);
      resetTermForm();
      await queryClient.invalidateQueries({ queryKey: academicTermsQueryKey });
    },
    onError: (error) => {
      setSuccessMessage(null);
      setTermFormError(formatAcademicCalendarError(error, "Academic terms"));
    }
  });
  const isSavingYear = saveYearMutation.isPending;
  const isSavingTerm = saveTermMutation.isPending;

  function handleYearSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setYearFormError(null);

    if (
      !yearFormState.code.trim() ||
      !yearFormState.name.trim() ||
      !yearFormState.startDate.trim() ||
      !yearFormState.endDate.trim()
    ) {
      setYearFormError("Code, name, start date, and end date are required.");
      return;
    }

    const payload = buildYearPayload(yearFormState);

    if (editingYear) {
      saveYearMutation.mutate({
        mode: "update",
        academicYearId: editingYear.id,
        payload
      });
      return;
    }

    saveYearMutation.mutate({
      mode: "create",
      payload
    });
  }

  function handleTermSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setTermFormError(null);

    if (
      !termFormState.academicYearId.trim() ||
      !termFormState.code.trim() ||
      !termFormState.name.trim() ||
      !termFormState.sequence.trim() ||
      !termFormState.startDate.trim() ||
      !termFormState.endDate.trim()
    ) {
      setTermFormError(
        "Academic year, code, name, sequence, start date, and end date are required."
      );
      return;
    }

    const sequence = Number(termFormState.sequence);

    if (!Number.isInteger(sequence)) {
      setTermFormError("Sequence must be a whole number.");
      return;
    }

    const payload = buildTermPayload(termFormState);

    if (editingTerm) {
      saveTermMutation.mutate({
        mode: "update",
        academicTermId: editingTerm.id,
        payload
      });
      return;
    }

    saveTermMutation.mutate({
      mode: "create",
      payload
    });
  }

  function resetYearForm() {
    setYearFormState(emptyYearForm);
    setEditingYear(null);
    setIsYearFormOpen(false);
  }

  function resetTermForm() {
    setTermFormState(emptyTermForm);
    setEditingTerm(null);
    setIsTermFormOpen(false);
  }

  function startCreatingYear() {
    setYearFormState(emptyYearForm);
    setEditingYear(null);
    setYearFormError(null);
    setSuccessMessage(null);
    setIsYearFormOpen(true);
  }

  function startEditingYear(year: AcademicYear) {
    setEditingYear(year);
    setYearFormError(null);
    setSuccessMessage(null);
    setIsYearFormOpen(true);
    setYearFormState({
      code: year.code,
      name: year.name,
      startDate: toDateTimeLocalValue(year.startDate),
      endDate: toDateTimeLocalValue(year.endDate),
      isCurrent: year.isCurrent,
      status: year.status
    });
  }

  function startCreatingTerm() {
    setTermFormState(emptyTermForm);
    setEditingTerm(null);
    setTermFormError(null);
    setSuccessMessage(null);
    setIsTermFormOpen(true);
  }

  function startEditingTerm(term: AcademicTerm) {
    setEditingTerm(term);
    setTermFormError(null);
    setSuccessMessage(null);
    setIsTermFormOpen(true);
    setTermFormState({
      academicYearId: term.academicYearId,
      code: term.code,
      name: term.name,
      sequence: String(term.sequence),
      startDate: toDateTimeLocalValue(term.startDate),
      endDate: toDateTimeLocalValue(term.endDate),
      enrollmentStartAt: toDateTimeLocalValue(term.enrollmentStartAt),
      enrollmentEndAt: toDateTimeLocalValue(term.enrollmentEndAt),
      status: term.status
    });
  }

  return (
    <SectionCard
      title="Academic calendar"
      description="Department-scoped academic years and terms for course planning."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      {successMessage ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      <div className="min-w-0 space-y-8">
        <section className="min-w-0">
          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Academic Years</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Create or update calendar years for the department.
                </p>
              </div>
              {!isYearFormOpen ? (
                <button
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!authContext}
                  type="button"
                  onClick={startCreatingYear}
                >
                  Create year
                </button>
              ) : null}
            </div>
          </div>

          {isYearFormOpen ? (
            <form
              className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
              onSubmit={handleYearSubmit}
            >
              <FormHeader
                isSaving={isSavingYear}
                title={editingYear ? "Edit academic year" : "Create academic year"}
                onCancel={() => {
                  resetYearForm();
                  setYearFormError(null);
                }}
              />
              <div className="grid gap-3 lg:grid-cols-2">
                <TextField
                  label="Code"
                  maxLength={50}
                  required
                  value={yearFormState.code}
                  onChange={(code) => setYearFormState({ ...yearFormState, code })}
                />
                <TextField
                  label="Name"
                  maxLength={150}
                  required
                  value={yearFormState.name}
                  onChange={(name) => setYearFormState({ ...yearFormState, name })}
                />
                <DateTimeField
                  label="Start date"
                  required
                  value={yearFormState.startDate}
                  onChange={(startDate) => setYearFormState({ ...yearFormState, startDate })}
                />
                <DateTimeField
                  label="End date"
                  required
                  value={yearFormState.endDate}
                  onChange={(endDate) => setYearFormState({ ...yearFormState, endDate })}
                />
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    checked={yearFormState.isCurrent}
                    className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-400"
                    type="checkbox"
                    onChange={(event) =>
                      setYearFormState({ ...yearFormState, isCurrent: event.target.checked })
                    }
                  />
                  Current academic year
                </label>
                <StatusSelect
                  label="Status"
                  statuses={ACADEMIC_YEAR_STATUSES}
                  value={yearFormState.status}
                  onChange={(status) =>
                    setYearFormState({ ...yearFormState, status: status as AcademicYearStatus })
                  }
                />
              </div>
              <FormError message={yearFormError} />
              <SubmitRow
                disabled={!authContext || isSavingYear}
                isSaving={isSavingYear}
                label={editingYear ? "Update year" : "Create year"}
              />
            </form>
          ) : null}

          {academicYearsQuery.isLoading ? (
            <p className="text-sm text-slate-600">Loading academic years...</p>
          ) : null}
          {academicYearsQuery.isError ? (
            <ErrorBox message={formatAcademicCalendarError(academicYearsQuery.error, "Academic years")} />
          ) : null}
          {academicYearsQuery.isSuccess && sortedAcademicYears.length === 0 ? (
            <p className="text-sm text-slate-600">No academic years have been created yet.</p>
          ) : null}
          {academicYearsQuery.isSuccess && sortedAcademicYears.length > 0 ? (
            <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Date range</th>
                    <th className="px-4 py-3 font-semibold">Current</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {sortedAcademicYears.map((year) => (
                    <tr key={year.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-950">
                        {year.code}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{year.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateRange(year.startDate, year.endDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {year.isCurrent ? "Yes" : "No"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatStatus(year.status)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {year.status === "ARCHIVED" ? (
                          <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
                            Read-only
                          </span>
                        ) : (
                          <button
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSavingYear}
                            type="button"
                            onClick={() => startEditingYear(year)}
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
          ) : null}
        </section>

        <section className="min-w-0">
          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Academic Terms</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Add or revise terms linked to an academic year.
                </p>
              </div>
              {!isTermFormOpen ? (
                <button
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!authContext}
                  type="button"
                  onClick={startCreatingTerm}
                >
                  Create term
                </button>
              ) : null}
            </div>
          </div>

          {isTermFormOpen ? (
            <form
              className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
              onSubmit={handleTermSubmit}
            >
              <FormHeader
                isSaving={isSavingTerm}
                title={editingTerm ? "Edit academic term" : "Create academic term"}
                onCancel={() => {
                  resetTermForm();
                  setTermFormError(null);
                }}
              />
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Academic year
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                    disabled={academicYearsQuery.isLoading}
                    required
                    value={termFormState.academicYearId}
                    onChange={(event) =>
                      setTermFormState({
                        ...termFormState,
                        academicYearId: event.target.value
                      })
                    }
                  >
                    <option value="">Select academic year</option>
                    {sortedAcademicYears.map((year) => (
                      <option key={year.id} value={year.id}>
                        {formatAcademicYearLabel(year)}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField
                  label="Code"
                  maxLength={50}
                  required
                  value={termFormState.code}
                  onChange={(code) => setTermFormState({ ...termFormState, code })}
                />
                <TextField
                  label="Name"
                  maxLength={150}
                  required
                  value={termFormState.name}
                  onChange={(name) => setTermFormState({ ...termFormState, name })}
                />
                <TextField
                  inputMode="numeric"
                  label="Sequence"
                  required
                  type="number"
                  value={termFormState.sequence}
                  onChange={(sequence) => setTermFormState({ ...termFormState, sequence })}
                />
                <DateTimeField
                  label="Start date"
                  required
                  value={termFormState.startDate}
                  onChange={(startDate) => setTermFormState({ ...termFormState, startDate })}
                />
                <DateTimeField
                  label="End date"
                  required
                  value={termFormState.endDate}
                  onChange={(endDate) => setTermFormState({ ...termFormState, endDate })}
                />
                <DateTimeField
                  label="Enrollment starts"
                  value={termFormState.enrollmentStartAt}
                  onChange={(enrollmentStartAt) =>
                    setTermFormState({ ...termFormState, enrollmentStartAt })
                  }
                />
                <DateTimeField
                  label="Enrollment ends"
                  value={termFormState.enrollmentEndAt}
                  onChange={(enrollmentEndAt) =>
                    setTermFormState({ ...termFormState, enrollmentEndAt })
                  }
                />
                <StatusSelect
                  label="Status"
                  statuses={ACADEMIC_TERM_STATUSES}
                  value={termFormState.status}
                  onChange={(status) =>
                    setTermFormState({ ...termFormState, status: status as AcademicTermStatus })
                  }
                />
              </div>
              {academicYearsQuery.isError ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Academic years could not be loaded right now.
                </div>
              ) : null}
              <FormError message={termFormError} />
              <SubmitRow
                disabled={!authContext || isSavingTerm}
                isSaving={isSavingTerm}
                label={editingTerm ? "Update term" : "Create term"}
              />
            </form>
          ) : null}

          {academicTermsQuery.isLoading ? (
            <p className="text-sm text-slate-600">Loading academic terms...</p>
          ) : null}
          {academicTermsQuery.isError ? (
            <ErrorBox message={formatAcademicCalendarError(academicTermsQuery.error, "Academic terms")} />
          ) : null}
          {academicTermsQuery.isSuccess && sortedAcademicTerms.length === 0 ? (
            <p className="text-sm text-slate-600">No academic terms have been created yet.</p>
          ) : null}
          {academicTermsQuery.isSuccess && sortedAcademicTerms.length > 0 ? (
            <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1200px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-[180px] whitespace-nowrap px-4 py-3 font-semibold">
                      Code
                    </th>
                    <th className="min-w-[220px] max-w-[280px] px-4 py-3 font-semibold">
                      Name
                    </th>
                    <th className="w-[90px] whitespace-nowrap px-4 py-3 font-semibold">
                      Sequence
                    </th>
                    <th className="min-w-[260px] max-w-[320px] px-4 py-3 font-semibold">
                      Academic year
                    </th>
                    <th className="w-[160px] whitespace-nowrap px-4 py-3 font-semibold">
                      Term dates
                    </th>
                    <th className="w-[170px] whitespace-nowrap px-4 py-3 font-semibold">
                      Enrollment
                    </th>
                    <th className="w-[110px] whitespace-nowrap px-4 py-3 font-semibold">
                      Status
                    </th>
                    <th className="w-[100px] whitespace-nowrap px-4 py-3 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {sortedAcademicTerms.map((term) => (
                    <tr key={term.id}>
                      <td className="w-[180px] whitespace-nowrap px-4 py-3 font-semibold text-slate-950">
                        {term.code}
                      </td>
                      <td className="min-w-[220px] max-w-[280px] px-4 py-3 text-slate-600">
                        {term.name}
                      </td>
                      <td className="w-[90px] whitespace-nowrap px-4 py-3 text-slate-600">
                        {term.sequence}
                      </td>
                      <td className="min-w-[260px] max-w-[320px] px-4 py-3 text-slate-600">
                        {formatTermYearLabel(term, academicYearLabels)}
                      </td>
                      <td className="w-[160px] whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateRange(term.startDate, term.endDate)}
                      </td>
                      <td className="w-[170px] whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatOptionalDateRange(term.enrollmentStartAt, term.enrollmentEndAt)}
                      </td>
                      <td className="w-[110px] whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatStatus(term.status)}
                      </td>
                      <td className="w-[100px] whitespace-nowrap px-4 py-3">
                        {term.status === "ARCHIVED" ? (
                          <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
                            Read-only
                          </span>
                        ) : (
                          <button
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSavingTerm}
                            type="button"
                            onClick={() => startEditingTerm(term)}
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
          ) : null}
        </section>
      </div>
    </SectionCard>
  );
}

function FormHeader({
  isSaving,
  title,
  onCancel
}: {
  isSaving: boolean;
  title: string;
  onCancel: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <button
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="button"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

function TextField({
  inputMode,
  label,
  maxLength,
  required,
  type = "text",
  value,
  onChange
}: {
  inputMode?: "numeric";
  label: string;
  maxLength?: number;
  required?: boolean;
  type?: "number" | "text";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DateTimeField({
  label,
  required,
  value,
  onChange
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        required={required}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatusSelect({
  label,
  statuses,
  value,
  onChange
}: {
  label: string;
  statuses: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {statuses.map((status) => (
          <option key={status} value={status}>
            {formatStatus(status)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      {message}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      {message}
    </div>
  );
}

function SubmitRow({
  disabled,
  isSaving,
  label
}: {
  disabled: boolean;
  isSaving: boolean;
  label: string;
}) {
  return (
    <div className="mt-4 flex justify-end">
      <button
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        type="submit"
      >
        {isSaving ? "Saving..." : label}
      </button>
    </div>
  );
}

function buildYearPayload(formState: YearFormState): AcademicYearPayload {
  return {
    code: formState.code.trim(),
    name: formState.name.trim(),
    startDate: new Date(formState.startDate).toISOString(),
    endDate: new Date(formState.endDate).toISOString(),
    isCurrent: formState.isCurrent,
    status: formState.status
  };
}

function buildTermPayload(formState: TermFormState): AcademicTermPayload {
  const payload: AcademicTermPayload = {
    academicYearId: formState.academicYearId,
    code: formState.code.trim(),
    name: formState.name.trim(),
    sequence: Number(formState.sequence),
    startDate: new Date(formState.startDate).toISOString(),
    endDate: new Date(formState.endDate).toISOString(),
    status: formState.status
  };
  const enrollmentStartAt = formState.enrollmentStartAt.trim();
  const enrollmentEndAt = formState.enrollmentEndAt.trim();

  if (enrollmentStartAt) {
    payload.enrollmentStartAt = new Date(enrollmentStartAt).toISOString();
  }

  if (enrollmentEndAt) {
    payload.enrollmentEndAt = new Date(enrollmentEndAt).toISOString();
  }

  return payload;
}

function formatAcademicCalendarError(error: Error, resourceName: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return `${resourceName} could not be loaded right now.`;
}

function formatAcademicYearLabel(year: Pick<AcademicYear, "code" | "name">) {
  return `${year.code} - ${year.name}`;
}

function formatTermYearLabel(term: AcademicTerm, labels: Map<string, string>) {
  if (term.academicYear?.code && term.academicYear.name) {
    return `${term.academicYear.code} - ${term.academicYear.name}`;
  }

  return labels.get(term.academicYearId) ?? "Not set";
}

function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function formatOptionalDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  if (!startDate && !endDate) {
    return "Not set";
  }

  return formatDateRange(startDate, endDate);
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

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function compareYears(yearA: AcademicYear, yearB: AcademicYear) {
  return yearB.startDate.localeCompare(yearA.startDate);
}

function compareTerms(
  termA: AcademicTerm,
  termB: AcademicTerm,
  academicYearOrder: Map<string, number>
) {
  const yearOrderA = getAcademicYearOrder(termA, academicYearOrder);
  const yearOrderB = getAcademicYearOrder(termB, academicYearOrder);

  if (yearOrderA !== yearOrderB) {
    return yearOrderA - yearOrderB;
  }

  if (yearOrderA === Number.MAX_SAFE_INTEGER) {
    const yearContextComparison = compareTermYearContext(termA, termB);

    if (yearContextComparison !== 0) {
      return yearContextComparison;
    }
  }

  if (termA.sequence !== termB.sequence) {
    return termA.sequence - termB.sequence;
  }

  const codeComparison = termA.code.localeCompare(termB.code, undefined, {
    numeric: true,
    sensitivity: "base"
  });

  if (codeComparison !== 0) {
    return codeComparison;
  }

  return termA.id.localeCompare(termB.id);
}

function getAcademicYearOrder(
  term: AcademicTerm,
  academicYearOrder: Map<string, number>
) {
  const knownOrder = academicYearOrder.get(term.academicYearId);

  if (knownOrder !== undefined) {
    return knownOrder;
  }

  return Number.MAX_SAFE_INTEGER;
}

function compareTermYearContext(termA: AcademicTerm, termB: AcademicTerm) {
  const startDateA = termA.academicYear?.startDate;
  const startDateB = termB.academicYear?.startDate;

  if (startDateA && startDateB && startDateA !== startDateB) {
    return startDateB.localeCompare(startDateA);
  }

  if (startDateA && !startDateB) {
    return -1;
  }

  if (!startDateA && startDateB) {
    return 1;
  }

  const codeComparison = (termA.academicYear?.code ?? "").localeCompare(
    termB.academicYear?.code ?? "",
    undefined,
    {
      numeric: true,
      sensitivity: "base"
    }
  );

  if (codeComparison !== 0) {
    return codeComparison;
  }

  const nameComparison = (termA.academicYear?.name ?? "").localeCompare(
    termB.academicYear?.name ?? "",
    undefined,
    {
      numeric: true,
      sensitivity: "base"
    }
  );

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return termA.academicYearId.localeCompare(termB.academicYearId);
}
