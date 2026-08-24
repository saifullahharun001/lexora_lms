import { Transform } from "class-transformer";

export const TrimAcademicManagementString = () =>
  Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
