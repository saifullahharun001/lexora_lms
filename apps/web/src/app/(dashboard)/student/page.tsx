import { SectionCard } from "@lexora/ui";

export default function StudentPage() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Student workspace"
        description="Reserved for future coursework and academic record access."
      />
      <SectionCard
        title="Academic records"
        description="Future records will align with verification-ready delivery paths."
      />
    </div>
  );
}
