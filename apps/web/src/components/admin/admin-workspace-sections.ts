export const adminWorkspaceSections = [
  {
    slug: "overview",
    label: "Overview",
    description: "Start here and jump into a focused admin module."
  },
  {
    slug: "programs",
    label: "Academic Programs",
    description: "Review department programs and academic structure."
  },
  {
    slug: "calendar",
    label: "Academic Calendar",
    description: "Manage academic years, terms, and term status."
  },
  {
    slug: "courses",
    label: "Courses",
    description: "Maintain course catalog details for the department."
  },
  {
    slug: "offerings",
    label: "Course Offerings",
    description: "Open courses for specific academic terms."
  },
  {
    slug: "assignments",
    label: "Teacher Assignments",
    description: "Assign teachers to active course offerings."
  },
  {
    slug: "users",
    label: "People & Access / Users",
    description: "Manage department identities, roles, and access status."
  }
] as const;

export type AdminWorkspaceSectionSlug =
  (typeof adminWorkspaceSections)[number]["slug"];

const adminWorkspaceSectionSlugs = adminWorkspaceSections.map(
  (section) => section.slug
);

export function getAdminWorkspaceSectionSlug(
  value: string | string[] | null | undefined
): AdminWorkspaceSectionSlug {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (
    rawValue &&
    adminWorkspaceSectionSlugs.includes(rawValue as AdminWorkspaceSectionSlug)
  ) {
    return rawValue as AdminWorkspaceSectionSlug;
  }

  return "overview";
}
