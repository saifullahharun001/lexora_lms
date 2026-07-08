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

const roleHomes = [
  { role: "department_admin", path: "/admin" },
  { role: "teacher", path: "/teacher" },
  { role: "student", path: "/student" }
] as const;

export function getRoleHome(roles: string[], fallbackPath = "/") {
  return roleHomes.find((home) => roles.includes(home.role))?.path ?? fallbackPath;
}
