import { SectionCard } from "@lexora/ui";

import { AdminAcademicCalendarPanel } from "@/components/admin/admin-academic-calendar-panel";
import { AdminCourseOfferingsPanel } from "@/components/admin/admin-course-offerings-panel";
import { AdminCoursesPanel } from "@/components/admin/admin-courses-panel";
import { AdminProgramsPanel } from "@/components/admin/admin-programs-panel";

export default function AdminPage() {
  return (
    <div className="min-w-0 space-y-4">
      <SectionCard
        title="Admin workspace"
        description="Reserved for future department administration and governance tools."
      />
      <AdminProgramsPanel />
      <AdminAcademicCalendarPanel />
      <AdminCoursesPanel />
      <AdminCourseOfferingsPanel />
      <SectionCard
        title="Academic operations"
        description="Future admin flows will stay department-scoped and policy-aware."
      />
    </div>
  );
}
