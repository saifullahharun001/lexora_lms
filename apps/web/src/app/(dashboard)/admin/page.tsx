import { SectionCard } from "@lexora/ui";
import Link from "next/link";

import { AdminAcademicCalendarPanel } from "@/components/admin/admin-academic-calendar-panel";
import { AdminCourseOfferingsPanel } from "@/components/admin/admin-course-offerings-panel";
import { AdminCoursesPanel } from "@/components/admin/admin-courses-panel";
import { AdminProgramsPanel } from "@/components/admin/admin-programs-panel";
import { AdminTeacherAssignmentsPanel } from "@/components/admin/admin-teacher-assignments-panel";
import { AdminUsersPanel } from "@/components/admin/admin-users-panel";
import {
  adminWorkspaceSections,
  type AdminWorkspaceSectionSlug,
  getAdminWorkspaceSectionSlug} from "@/components/admin/admin-workspace-sections";

interface AdminPageProps {
  searchParams?: Promise<{
    section?: string | string[];
  }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const section = getAdminWorkspaceSectionSlug(params?.section);

  return <div className="min-w-0 space-y-4">{renderAdminSection(section)}</div>;
}

function renderAdminSection(section: AdminWorkspaceSectionSlug) {
  switch (section) {
    case "programs":
      return <AdminProgramsPanel />;
    case "calendar":
      return <AdminAcademicCalendarPanel />;
    case "courses":
      return <AdminCoursesPanel />;
    case "offerings":
      return <AdminCourseOfferingsPanel />;
    case "assignments":
      return <AdminTeacherAssignmentsPanel />;
    case "users":
      return (
        <div className="space-y-4">
          <SectionCard
            title="People & Access"
            description="Department identity tools stay policy-protected and scoped to the active department."
          />
          <AdminUsersPanel />
        </div>
      );
    case "overview":
    default:
      return <AdminOverview />;
  }
}

function AdminOverview() {
  const moduleSections = adminWorkspaceSections.filter(
    (section) => section.slug !== "overview"
  );

  return (
    <SectionCard
      title="Admin workspace"
      description="Choose one department administration module from the sidebar or the quick links below. Only the selected module renders in this workspace."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {moduleSections.map((section) => (
          <Link
            key={section.slug}
            href={`/admin?section=${section.slug}`}
            className="rounded-xl border border-white/18 bg-white/10 p-4 text-left transition hover:border-amber-200/50 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200/50"
          >
            <span className="block text-sm font-semibold text-amber-50">
              {section.label}
            </span>
            <span className="mt-2 block text-sm leading-6 text-stone-200">
              {section.description}
            </span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}


