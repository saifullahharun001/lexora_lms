import { clientEnv } from "@/lib/env";

export interface AuthUser {
  id: string;
  departmentId: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  twoFactor: {
    enabled: boolean;
    required: boolean;
    availableMethods: string[];
  };
}

export interface LoginPayload {
  departmentCode: string;
  email: string;
  password: string;
  deviceLabel?: string;
  deviceFingerprint?: string;
}

export interface LogoutResponse {
  success: boolean;
}

export interface ApiAuthContext {
  accessToken: string;
  departmentId: string;
}

export type CourseStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type AcademicYearStatus = "PLANNED" | "ACTIVE" | "CLOSED" | "ARCHIVED";
export type AcademicTermStatus =
  | "PLANNED"
  | "ENROLLMENT_OPEN"
  | "IN_PROGRESS"
  | "CLOSED"
  | "ARCHIVED";
export type CourseOfferingStatus =
  | "PLANNED"
  | "PUBLISHED"
  | "ENROLLMENT_OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED"
  | "ARCHIVED";

export interface AcademicProgram {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
}

export interface AcademicCourse {
  id: string;
  departmentId: string;
  academicProgramId: string | null;
  code: string;
  title: string;
  description: string | null;
  creditHours: string | number;
  lectureHours: string | number | null;
  labHours: string | number | null;
  status: CourseStatus;
}

export interface CoursePayload {
  academicProgramId?: string;
  code: string;
  title: string;
  description?: string;
  creditHours: string;
  lectureHours?: string;
  labHours?: string;
  status?: CourseStatus;
}

export type UpdateCoursePayload = Partial<CoursePayload>;

export interface AcademicTerm {
  id: string;
  departmentId?: string;
  academicYearId: string;
  code: string;
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
  enrollmentStartAt?: string | null;
  enrollmentEndAt?: string | null;
  status: AcademicTermStatus;
  academicYear?: Partial<AcademicYear> | null;
}

export interface AcademicYear {
  id: string;
  departmentId?: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: AcademicYearStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface AcademicYearPayload {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
  status?: AcademicYearStatus;
}

export type UpdateAcademicYearPayload = Partial<AcademicYearPayload>;

export interface AcademicTermPayload {
  academicYearId: string;
  code: string;
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
  enrollmentStartAt?: string;
  enrollmentEndAt?: string;
  status?: AcademicTermStatus;
}

export type UpdateAcademicTermPayload = Partial<AcademicTermPayload>;

export interface CourseOffering {
  id: string;
  departmentId?: string;
  courseId?: string;
  academicTermId?: string;
  sectionCode?: string | null;
  capacity?: number | null;
  status?: CourseOfferingStatus | null;
  visibilityStartAt?: string | null;
  visibilityEndAt?: string | null;
  course?: Partial<AcademicCourse> | null;
  academicTerm?: Partial<AcademicTerm> | null;
}

export interface CourseOfferingPayload {
  courseId: string;
  academicTermId: string;
  sectionCode: string;
  capacity?: number;
  status?: CourseOfferingStatus;
  visibilityStartAt?: string;
  visibilityEndAt?: string;
}

export type UpdateCourseOfferingPayload = Partial<
  Pick<
    CourseOfferingPayload,
    "sectionCode" | "capacity" | "status" | "visibilityStartAt" | "visibilityEndAt"
  >
>;

export interface EnrollmentAcademicTerm {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface EnrollmentCourseOffering {
  id: string;
  sectionCode: string;
  status: string;
  course: AcademicCourse;
}

export interface MyEnrollment {
  id: string;
  departmentId: string;
  academicTermId: string;
  courseOfferingId: string;
  studentUserId: string;
  status: string;
  eligibilityStatus: string;
  enrolledAt: string | null;
  droppedAt: string | null;
  academicTerm: EnrollmentAcademicTerm;
  courseOffering: EnrollmentCourseOffering;
}

interface ApiErrorResponse {
  code?: string;
  message?: string;
  statusCode?: number;
}

export class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

async function parseApiError(response: Response): Promise<ApiClientError> {
  let errorBody: ApiErrorResponse | undefined;

  try {
    errorBody = (await response.json()) as ApiErrorResponse;
  } catch {
    errorBody = undefined;
  }

  return new ApiClientError(
    errorBody?.message ?? "Request failed",
    response.status,
    errorBody?.code
  );
}

export async function apiPost<TResponse, TPayload>(
  path: string,
  payload: TPayload
): Promise<TResponse> {
  const response = await fetch(`${clientEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as TResponse;
}

export async function apiAuthenticatedGet<TResponse>(
  path: string,
  { accessToken, departmentId }: ApiAuthContext
): Promise<TResponse> {
  const response = await fetch(`${clientEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-department-id": departmentId
    },
    credentials: "include"
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as TResponse;
}

async function apiAuthenticatedJson<TResponse, TPayload>(
  method: "POST" | "PATCH",
  path: string,
  { accessToken, departmentId }: ApiAuthContext,
  payload: TPayload
): Promise<TResponse> {
  const response = await fetch(`${clientEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-department-id": departmentId
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as TResponse;
}

export function login(payload: LoginPayload) {
  return apiPost<AuthResponse, LoginPayload>("/auth/login", payload);
}

export function refreshSession() {
  return apiPost<AuthResponse, Record<string, never>>("/auth/refresh", {});
}

export function logout() {
  return apiPost<LogoutResponse, Record<string, never>>("/auth/logout", {});
}

export function getPrograms(authContext: ApiAuthContext) {
  return apiAuthenticatedGet<AcademicProgram[]>("/programs", authContext);
}

export function getCourses(
  authContext: ApiAuthContext,
  filters: { status?: CourseStatus | "ALL" } = { status: "ACTIVE" }
) {
  const query =
    filters.status && filters.status !== "ALL"
      ? `?status=${encodeURIComponent(filters.status)}`
      : "";

  return apiAuthenticatedGet<AcademicCourse[]>(`/courses${query}`, authContext);
}

export function getAcademicYears(
  authContext: ApiAuthContext,
  filters: Record<string, string | number | boolean | undefined> = {}
) {
  return apiAuthenticatedGet<AcademicYear[]>(
    `/academic-years${buildQueryString(filters)}`,
    authContext
  );
}

export function createAcademicYear(
  authContext: ApiAuthContext,
  payload: AcademicYearPayload
) {
  return apiAuthenticatedJson<AcademicYear, AcademicYearPayload>(
    "POST",
    "/academic-years",
    authContext,
    payload
  );
}

export function updateAcademicYear(
  authContext: ApiAuthContext,
  academicYearId: string,
  payload: UpdateAcademicYearPayload
) {
  return apiAuthenticatedJson<AcademicYear, UpdateAcademicYearPayload>(
    "PATCH",
    `/academic-years/${encodeURIComponent(academicYearId)}`,
    authContext,
    payload
  );
}

export function getAcademicTerms(
  authContext: ApiAuthContext,
  filters: Record<string, string | number | boolean | undefined> = {}
) {
  return apiAuthenticatedGet<AcademicTerm[]>(
    `/academic-terms${buildQueryString(filters)}`,
    authContext
  );
}

export function createAcademicTerm(
  authContext: ApiAuthContext,
  payload: AcademicTermPayload
) {
  return apiAuthenticatedJson<AcademicTerm, AcademicTermPayload>(
    "POST",
    "/academic-terms",
    authContext,
    payload
  );
}

export function updateAcademicTerm(
  authContext: ApiAuthContext,
  academicTermId: string,
  payload: UpdateAcademicTermPayload
) {
  return apiAuthenticatedJson<AcademicTerm, UpdateAcademicTermPayload>(
    "PATCH",
    `/academic-terms/${encodeURIComponent(academicTermId)}`,
    authContext,
    payload
  );
}

export function createCourse(authContext: ApiAuthContext, payload: CoursePayload) {
  return apiAuthenticatedJson<AcademicCourse, CoursePayload>(
    "POST",
    "/courses",
    authContext,
    payload
  );
}

export function updateCourse(
  authContext: ApiAuthContext,
  courseId: string,
  payload: UpdateCoursePayload
) {
  return apiAuthenticatedJson<AcademicCourse, UpdateCoursePayload>(
    "PATCH",
    `/courses/${encodeURIComponent(courseId)}`,
    authContext,
    payload
  );
}

export function getCourseOfferings(authContext: ApiAuthContext) {
  return apiAuthenticatedGet<CourseOffering[]>("/course-offerings", authContext);
}

export function createCourseOffering(
  authContext: ApiAuthContext,
  payload: CourseOfferingPayload
) {
  return apiAuthenticatedJson<CourseOffering, CourseOfferingPayload>(
    "POST",
    "/course-offerings",
    authContext,
    payload
  );
}

export function updateCourseOffering(
  authContext: ApiAuthContext,
  offeringId: string,
  payload: UpdateCourseOfferingPayload
) {
  return apiAuthenticatedJson<CourseOffering, UpdateCourseOfferingPayload>(
    "PATCH",
    `/course-offerings/${encodeURIComponent(offeringId)}`,
    authContext,
    payload
  );
}

export function getMyEnrollments(authContext: ApiAuthContext) {
  return apiAuthenticatedGet<MyEnrollment[]>("/enrollments/me", authContext);
}

function buildQueryString(filters: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();

  return queryString ? `?${queryString}` : "";
}
