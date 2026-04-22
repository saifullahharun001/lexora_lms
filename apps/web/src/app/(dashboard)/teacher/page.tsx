import { SectionCard } from "@lexora/ui";

export default function TeacherPage() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Teacher foundation"
        description="Reserved for course delivery, class sessions, attendance, and assessment workflows."
      />
      <SectionCard
        title="Scoped experience"
        description="Teacher-visible data will later be constrained by department, course assignment, and object-level policy."
      />
    </div>
  );
}

