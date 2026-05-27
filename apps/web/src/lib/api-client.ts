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
  academicProgramId: string;
  code: string;
  title: string;
  description: string | null;
  creditHours: string | number;
  lectureHours: string | number;
  labHours: string | number;
  status: string;
}

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

export function getCourses(authContext: ApiAuthContext) {
  return apiAuthenticatedGet<AcademicCourse[]>("/courses?status=ACTIVE", authContext);
}

export function getMyEnrollments(authContext: ApiAuthContext) {
  return apiAuthenticatedGet<MyEnrollment[]>("/enrollments/me", authContext);
}
