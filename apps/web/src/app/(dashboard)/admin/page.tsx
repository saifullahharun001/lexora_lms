import { SectionCard } from "@lexora/ui";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Admin workspace"
        description="Reserved for future department administration and governance tools."
      />
      <SectionCard
        title="Academic operations"
        description="Future admin flows will stay department-scoped and policy-aware."
      />
    </div>
  );
}
