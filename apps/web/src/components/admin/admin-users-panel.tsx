"use client";

import { SectionCard } from "@lexora/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type {
  CreateManagedUserPayload,
  ManagedUser,
  ManagedUserInitialStatus,
  ManagedUserRoleCode,
  ManagedUserStatus
} from "@/lib/api-client";
import {
  ApiClientError,
  createManagedUser,
  getManagedUsers,
  updateManagedUserStatus
} from "@/lib/api-client";

const USER_STATUSES: ManagedUserStatus[] = [
  "ACTIVE",
  "INVITED",
  "LOCKED",
  "SUSPENDED",
  "ARCHIVED"
];
const INITIAL_USER_STATUSES: ManagedUserInitialStatus[] = ["ACTIVE", "INVITED"];

interface UserFormState {
  roleCode: ManagedUserRoleCode;
  displayName: string;
  email: string;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
  status: ManagedUserInitialStatus;
}

const emptyUserForm: UserFormState = {
  roleCode: "student",
  displayName: "",
  email: "",
  temporaryPassword: "",
  confirmTemporaryPassword: "",
  status: "ACTIVE"
};

export function AdminUsersPanel() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const departmentId = session?.user.departmentId;
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<UserFormState>(emptyUserForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<ManagedUserRoleCode | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<ManagedUserStatus | "ALL">("ALL");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editStatus, setEditStatus] = useState<ManagedUserStatus>("ACTIVE");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const authContext = useMemo(() => {
    if (!accessToken || !departmentId) {
      return null;
    }

    return {
      accessToken,
      departmentId
    };
  }, [accessToken, departmentId]);
  const usersQueryKey = useMemo(
    () => ["admin", "managed-users", departmentId] as const,
    [departmentId]
  );

  const usersQuery = useQuery({
    queryKey: usersQueryKey,
    queryFn: () => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return getManagedUsers(authContext);
    },
    enabled: Boolean(authContext)
  });

  const createUserMutation = useMutation({
    mutationFn: (payload: CreateManagedUserPayload) => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return createManagedUser(authContext, payload);
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey });
      setSuccessMessage(`${user.displayName} was created.`);
      setFormError(null);
      resetForm();
    },
    onError: (error) => {
      setSuccessMessage(null);
      setFormError(formatUsersError(error));
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: (input: { userId: string; status: ManagedUserStatus }) => {
      if (!authContext) {
        throw new Error("Department session is not ready.");
      }

      return updateManagedUserStatus(authContext, input.userId, {
        status: input.status
      });
    },
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey });
      setSuccessMessage(`${user.displayName} status was updated.`);
      setFormError(null);
      setEditingUser(null);
    },
    onError: (error) => {
      setSuccessMessage(null);
      setFormError(formatUsersError(error));
    }
  });

  const filteredUsers = useMemo(() => {
    return (usersQuery.data ?? []).filter((user) => {
      const matchesRole = roleFilter === "ALL" || user.roles.includes(roleFilter);
      const matchesStatus = statusFilter === "ALL" || user.status === statusFilter;

      return matchesRole && matchesStatus;
    });
  }, [roleFilter, statusFilter, usersQuery.data]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setFormError(null);

    if (formState.temporaryPassword !== formState.confirmTemporaryPassword) {
      setFormError("Temporary password confirmation does not match.");
      return;
    }

    createUserMutation.mutate({
      email: formState.email.trim(),
      displayName: formState.displayName.trim(),
      roleCode: formState.roleCode,
      temporaryPassword: formState.temporaryPassword,
      status: formState.status
    });
  }

  function resetForm() {
    setFormState(emptyUserForm);
    setIsFormOpen(false);
  }

  function startEditing(user: ManagedUser) {
    setEditingUser(user);
    setEditStatus(user.status);
    setIsFormOpen(false);
    setFormError(null);
    setSuccessMessage(null);
  }

  function cancelEditing() {
    setEditingUser(null);
    setFormError(null);
  }

  function handleStatusUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setFormError(null);

    if (!editingUser) {
      return;
    }

    updateStatusMutation.mutate({
      userId: editingUser.id,
      status: editStatus
    });
  }

  return (
    <SectionCard
      title="Users"
      description="Department-scoped student and teacher account creation."
    >
      {!accessToken || !departmentId ? (
        <p className="text-sm text-slate-600">Preparing department session...</p>
      ) : null}

      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">People & access</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Create department users with student or teacher roles.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              <span>Role</span>
              <select
                className="w-full min-w-36 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as ManagedUserRoleCode | "ALL")
                }
              >
                <option value="ALL">All roles</option>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              <span>Status</span>
              <select
                className="w-full min-w-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as ManagedUserStatus | "ALL")
                }
              >
                <option value="ALL">All statuses</option>
                {USER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            {!isFormOpen ? (
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!authContext}
                type="button"
                onClick={() => {
                  setSuccessMessage(null);
                  setFormError(null);
                  setEditingUser(null);
                  setIsFormOpen(true);
                }}
              >
                Create user
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {successMessage ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      {isFormOpen ? (
        <form
          className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={handleSubmit}
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-slate-950">Create user</h3>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={createUserMutation.isPending}
              type="button"
              onClick={() => {
                resetForm();
                setFormError(null);
              }}
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Role
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={formState.roleCode}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    roleCode: event.target.value as ManagedUserRoleCode
                  })
                }
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={formState.status}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    status: event.target.value as ManagedUserInitialStatus
                  })
                }
              >
                {INITIAL_USER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Display name
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                maxLength={200}
                minLength={2}
                required
                value={formState.displayName}
                onChange={(event) =>
                  setFormState({ ...formState, displayName: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Email
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                maxLength={320}
                required
                type="email"
                value={formState.email}
                onChange={(event) =>
                  setFormState({ ...formState, email: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Temporary password
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                maxLength={128}
                required
                type="password"
                value={formState.temporaryPassword}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    temporaryPassword: event.target.value
                  })
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Confirm temporary password
              <input
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                maxLength={128}
                required
                type="password"
                value={formState.confirmTemporaryPassword}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    confirmTemporaryPassword: event.target.value
                  })
                }
              />
            </label>
          </div>

          {formError ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {formError}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!authContext || createUserMutation.isPending}
              type="submit"
            >
              {createUserMutation.isPending ? "Creating..." : "Create user"}
            </button>
          </div>
        </form>
      ) : null}

      {editingUser ? (
        <form
          className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={handleStatusUpdate}
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Edit user status</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Review the account before saving a status change.
              </p>
            </div>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={updateStatusMutation.isPending}
              type="button"
              onClick={cancelEditing}
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-500">Display name</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {editingUser.displayName}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-500">Email</p>
              <p className="mt-1 break-all text-sm font-semibold text-slate-950">
                {editingUser.email}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-500">Role</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {formatRoles(editingUser.roles)}
              </p>
            </div>
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={editStatus}
                onChange={(event) =>
                  setEditStatus(event.target.value as ManagedUserStatus)
                }
              >
                {USER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {formError ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {formError}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!authContext || updateStatusMutation.isPending}
              type="submit"
            >
              {updateStatusMutation.isPending ? "Saving..." : "Save update"}
            </button>
          </div>
        </form>
      ) : null}

      {!isFormOpen && !editingUser && formError ? (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formError}
        </div>
      ) : null}

      {usersQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading users...</p>
      ) : null}

      {usersQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {formatUsersError(usersQuery.error)}
        </div>
      ) : null}

      {usersQuery.isSuccess && filteredUsers.length === 0 ? (
        <p className="text-sm text-slate-600">No users match the current view.</p>
      ) : null}

      {usersQuery.isSuccess && filteredUsers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Last login</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950">{user.displayName}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{user.email}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatRoles(user.roles)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatStatus(user.status)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDate(user.lastLoginAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {isManagedUser(user) ? (
                      <button
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={updateStatusMutation.isPending}
                        type="button"
                        onClick={() => startEditing(user)}
                      >
                        Edit
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">
                        Protected
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </SectionCard>
  );
}

function formatUsersError(error: Error) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "Users could not be loaded right now.";
}

function formatRoles(roles: string[]) {
  if (roles.length === 0) {
    return "Not set";
  }

  return roles.map(formatStatus).join(", ");
}

function isManagedUser(user: ManagedUser) {
  return user.roles.length > 0 && user.roles.every(isManagedRole);
}

function isManagedRole(role: string): role is ManagedUserRoleCode {
  return role === "student" || role === "teacher";
}

function formatStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Never";
  }

  return date.toLocaleDateString();
}
