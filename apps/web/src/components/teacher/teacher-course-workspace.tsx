"use client";

import { SectionCard } from "@lexora/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type {
  BoundSyllabusVersion,
  CourseOffering
} from "@/lib/api-client";
import {
  ApiClientError,
  getCourseOffering,
  getCourseOfferingSyllabus
} from "@/lib/api-client";

interface TeacherCourseWorkspaceProps {
  courseOfferingId: string;
}

const workspaceSections = [
  { label: "Overview", available: true },
  { label: "Course Outline", available: false },
  { label: "Lesson Plan", available: false },
  { label: "Sessions", available: false },
  { label: "Attendance", available: false },
  { label: "Assessments", available: false },
  { label: "Course File", available: false }
] as const;

export function TeacherCourseWorkspace({
  courseOfferingId
}: TeacherCourseWorkspaceProps) {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;

  const authContext = useMemo(() => {
    if (!accessToken || !departmentId) {
      return null;
    }

    return { accessToken, departmentId };
  }, [accessToken, departmentId]);

  const offeringQuery = useQuery({
    queryKey: ["teacher", "course-offering", departmentId, courseOfferingId],
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getCourseOffering(authContext, courseOfferingId);
    },
    enabled: Boolean(authContext && courseOfferingId),
    retry: shouldRetryQuery
  });

  const syllabusQuery = useQuery({
    queryKey: [
      "teacher",
      "course-offering",
      courseOfferingId,
      "syllabus",
      departmentId
    ],
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getCourseOfferingSyllabus(authContext, courseOfferingId);
    },
    enabled: Boolean(authContext && offeringQuery.isSuccess),
    retry: shouldRetryQuery
  });

  if (!accessToken || !departmentId || offeringQuery.isLoading) {
    return <WorkspaceLoading />;
  }

  if (offeringQuery.isError) {
    return (
      <WorkspaceUnavailable
        isSafeNotFound={isSafeAccessFailure(offeringQuery.error)}
        onRetry={() => offeringQuery.refetch()}
      />
    );
  }

  if (!offeringQuery.data) {
    return (
      <WorkspaceUnavailable
        isSafeNotFound
        onRetry={() => offeringQuery.refetch()}
      />
    );
  }

  const offering = offeringQuery.data;

  return (
    <div className="min-w-0 space-y-4">
      <Link
        href="/teacher"
        className="inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-stone-100 transition hover:border-teal-200/60 hover:text-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-200/70"
      >
        Back to assigned courses
      </Link>

      <SectionCard
        title={`${formatValue(offering.course?.code)} · ${formatValue(
          offering.course?.title
        )}`}
        description="Read-only workspace for this assigned course offering. Access remains enforced by the course assignment recorded by your department."
      >
        <div className="flex flex-wrap gap-2">
          <StatusPill label={formatStatus(offering.status)} />
          <span className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
            Section {formatValue(offering.sectionCode)}
          </span>
          <span className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
            {formatAcademicTerm(offering)}
          </span>
        </div>
      </SectionCard>

      <WorkspaceNavigation />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <OfferingSummary offering={offering} />
        <SyllabusSummary
          syllabus={syllabusQuery.data}
          isLoading={syllabusQuery.isLoading}
          error={syllabusQuery.error}
          onRetry={() => syllabusQuery.refetch()}
        />
      </div>
    </div>
  );
}

function WorkspaceNavigation() {
  return (
    <nav
      aria-label="Course workspace sections"
      className="lexora-glass-card min-w-0 rounded-2xl p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {workspaceSections.map((section) =>
          section.available ? (
            <span
              key={section.label}
              aria-current="page"
              className="rounded-lg border border-teal-200/60 bg-teal-50/20 px-3 py-2 text-sm font-semibold text-teal-50"
            >
              {section.label}
            </span>
          ) : (
            <button
              key={section.label}
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-stone-400 opacity-75"
            >
              <span className="block font-semibold">{section.label}</span>
              <span className="mt-0.5 block text-xs">Coming later</span>
            </button>
          )
        )}
      </div>
    </nav>
  );
}

function OfferingSummary({ offering }: { offering: CourseOffering }) {
  const course = offering.course;
  const term = offering.academicTerm;

  return (
    <SectionCard
      title="Course offering"
      description="Department-recorded identity and schedule context for this assigned section."
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <DataField label="Course code" value={course?.code} />
        <DataField label="Course title" value={course?.title} />
        <DataField label="Section" value={offering.sectionCode} />
        <DataField label="Offering status" value={formatStatus(offering.status)} />
        <DataField label="Academic term" value={formatAcademicTerm(offering)} />
        <DataField label="Term status" value={formatStatus(term?.status)} />
        <DataField
          label="Term dates"
          value={formatDateRange(term?.startDate, term?.endDate)}
        />
        <DataField label="Capacity" value={formatCapacity(offering.capacity)} />
        <DataField label="Credit hours" value={course?.creditHours} />
        <DataField label="Lecture hours" value={course?.lectureHours} />
        <DataField label="Lab hours" value={course?.labHours} />
        <DataField
          label="Visibility window"
          value={formatDateRange(
            offering.visibilityStartAt,
            offering.visibilityEndAt
          )}
        />
      </dl>
    </SectionCard>
  );
}

interface SyllabusSummaryProps {
  syllabus: BoundSyllabusVersion | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

function SyllabusSummary({
  syllabus,
  isLoading,
  error,
  onRetry
}: SyllabusSummaryProps) {
  return (
    <SectionCard
      title="Bound syllabus"
      description="The exact syllabus version currently bound to this course offering."
    >
      {isLoading ? (
        <p className="text-sm text-slate-600">Loading syllabus context...</p>
      ) : null}

      {error && isNotFound(error) ? (
        <NeutralNotice>
          No syllabus is currently bound to this course offering.
        </NeutralNotice>
      ) : null}

      {error && !isNotFound(error) ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-medium text-rose-900">
            Syllabus context could not be loaded right now.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-900"
          >
            Try again
          </button>
        </div>
      ) : null}

      {syllabus ? <BoundSyllabusDetails syllabus={syllabus} /> : null}
    </SectionCard>
  );
}

function BoundSyllabusDetails({
  syllabus
}: {
  syllabus: BoundSyllabusVersion;
}) {
  const curriculum = syllabus.curriculumCourse;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold text-slate-950">
          {syllabus.code} · Version {syllabus.versionNumber}
        </p>
        <StatusPill label={formatStatus(syllabus.status)} />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <DataField
          label="Effective period"
          value={formatDateRange(syllabus.effectiveFrom, syllabus.effectiveTo)}
        />
        <DataField label="Approved" value={formatDate(syllabus.approvedAt)} />
        <DataField label="Archived" value={formatDate(syllabus.archivedAt)} />
        <DataField
          label="Curriculum"
          value={`${curriculum.curriculumVersion.code} · ${curriculum.curriculumVersion.name}`}
        />
        <DataField
          label="Academic session"
          value={curriculum.curriculumVersion.effectiveAcademicSessionCode}
        />
        <DataField
          label="Curriculum course"
          value={`${curriculum.courseCodeSnapshot} · ${curriculum.courseTitleSnapshot}`}
        />
        <DataField label="Category" value={curriculum.categoryCode} />
        <DataField
          label="Year / semester"
          value={`Year ${curriculum.academicYearNumber}, Semester ${curriculum.semesterNumber}`}
        />
        <DataField
          label="Credit hours"
          value={curriculum.creditHoursSnapshot}
        />
        <DataField label="Total marks" value={curriculum.totalMarksSnapshot} />
        <DataField
          label="Assessment template"
          value={`${curriculum.assessmentTemplate.code} · ${curriculum.assessmentTemplate.name}`}
        />
        <DataField
          label="Assessment template status"
          value={formatStatus(curriculum.assessmentTemplate.status)}
        />
      </dl>
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <SectionCard
      title="Course workspace"
      description="Loading the assigned course offering and its read-only academic context."
    >
      <p className="text-sm text-slate-600">Preparing course workspace...</p>
    </SectionCard>
  );
}

function WorkspaceUnavailable({
  isSafeNotFound,
  onRetry
}: {
  isSafeNotFound: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <Link
        href="/teacher"
        className="inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-stone-100"
      >
        Back to assigned courses
      </Link>
      <SectionCard
        title="Course workspace unavailable"
        description={
          isSafeNotFound
            ? "This course offering could not be found or is not available to your account."
            : "The course workspace could not be loaded right now."
        }
      >
        {!isSafeNotFound ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
          >
            Try again
          </button>
        ) : null}
      </SectionCard>
    </div>
  );
}

function DataField({
  label,
  value
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">
        {formatValue(value)}
      </dd>
    </div>
  );
}

function NeutralNotice({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
      {children}
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

function isSafeAccessFailure(error: Error) {
  return error instanceof ApiClientError && [401, 403, 404].includes(error.status);
}

function isNotFound(error: Error) {
  return error instanceof ApiClientError && error.status === 404;
}

function shouldRetryQuery(failureCount: number, error: Error) {
  if (isSafeAccessFailure(error)) {
    return false;
  }

  return failureCount < 2;
}

function formatAcademicTerm(offering: CourseOffering) {
  const code = offering.academicTerm?.code;
  const name = offering.academicTerm?.name;

  if (code && name && code !== name) {
    return `${code} · ${name}`;
  }

  return formatValue(code ?? name);
}

function formatCapacity(capacity: number | null | undefined) {
  return typeof capacity === "number" ? String(capacity) : "Not set";
}

function formatDateRange(
  startAt: string | null | undefined,
  endAt: string | null | undefined
) {
  if (!startAt && !endAt) {
    return "Not set";
  }

  return `${formatDate(startAt)} – ${formatDate(endAt)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
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
