export const dashboardNavigation = [
  {
    href: "/admin",
    label: "Admin workspace",
    role: "department_admin",
    description: "Department operations and governance"
  },
  {
    href: "/teacher",
    label: "Teacher workspace",
    role: "teacher",
    description: "Assigned courses and teaching work"
  },
  {
    href: "/student",
    label: "Student workspace",
    role: "student",
    description: "Own courses, progress, and academic records"
  }
] as const;
