import { SectionCard } from "@lexora/ui";

import { AdminCoursesPanel } from "@/components/admin/admin-courses-panel";
import { AdminProgramsPanel } from "@/components/admin/admin-programs-panel";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Admin workspace"
        description="Reserved for future department administration and governance tools."
      />
      <AdminProgramsPanel />
      <AdminCoursesPanel />
      <SectionCard
        title="Academic operations"
        description="Future admin flows will stay department-scoped and policy-aware."
      />
    </div>
  );
}
