"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import type { AuthResponse, AuthUser, LoginPayload } from "@/lib/api-client";
import {
  login,
  logout,
  refreshSession
} from "@/lib/api-client";

type AuthStatus = "bootstrapping" | "authenticated" | "anonymous";

interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshTokenExpiresAt: string;
}

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  signIn: (payload: LoginPayload) => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let bootstrapRefreshPromise: Promise<AuthResponse> | null = null;

function toSession(response: AuthResponse): AuthSession {
  return {
    user: response.user,
    accessToken: response.accessToken,
    refreshTokenExpiresAt: response.refreshTokenExpiresAt
  };
}

function refreshSessionOnce() {
  bootstrapRefreshPromise ??= refreshSession().finally(() => {
    bootstrapRefreshPromise = null;
  });

  return bootstrapRefreshPromise;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("bootstrapping");

  useEffect(() => {
    let isActive = true;

    refreshSessionOnce()
      .then((response) => {
        if (!isActive) {
          return;
        }

        setSession(toSession(response));
        setStatus("authenticated");
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setSession(null);
        setStatus("anonymous");
      });

    return () => {
      isActive = false;
    };
  }, []);

  const signIn = useCallback(async (payload: LoginPayload) => {
    const response = await login(payload);

    setSession(toSession(response));
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    setStatus("anonymous");

    try {
      await logout();
    } catch {
      // The browser state is already cleared; the server may have no active cookie.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      signIn,
      signOut
    }),
    [session, signIn, signOut, status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
