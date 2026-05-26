import { SectionCard } from "@lexora/ui";

export default function TeacherPage() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Teacher workspace"
        description="Reserved for future course delivery and class workflows."
      />
      <SectionCard
        title="Class context"
        description="Future teacher views will reflect department and course assignments."
      />
    </div>
  );
}
