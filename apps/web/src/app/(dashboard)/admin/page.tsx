import { SectionCard } from "@lexora/ui";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Admin foundation"
        description="Reserved for governance, department configuration, and platform controls."
      />
      <SectionCard
        title="Security posture"
        description="Future admin flows will require explicit policy checks, audit emission, and department scoping."
      />
    </div>
  );
}

