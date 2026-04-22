import { SectionCard } from "@lexora/ui";

export default function StudentPage() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Student foundation"
        description="Reserved for enrollment, coursework, results, and transcript access surfaces."
      />
      <SectionCard
        title="Verification-aware"
        description="Student-facing records will later align with transcript verification and audit-ready delivery paths."
      />
    </div>
  );
}

