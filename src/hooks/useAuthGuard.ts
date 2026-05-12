'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'admin' | 'user' | 'trainer' | 'qa-head';

interface AuthGuardOptions {
  /** Redirect target when not logged in. Defaults to '/login'. */
  redirectTo?: string;
  /** If provided, redirect to /dashboard when the logged-in user lacks one of these roles. */
  allowedRoles?: Role[];
  /** Redirect target when role is not permitted. Defaults to '/dashboard'. */
  unauthorizedRedirect?: string;
}

/**
 * Redirects to /login if no user is stored in localStorage.
 * Optionally checks role and redirects to /dashboard if not allowed.
 */
export function useAuthGuard(options: AuthGuardOptions = {}) {
  const router = useRouter();
  const {
    redirectTo = '/login',
    allowedRoles,
    unauthorizedRedirect = '/dashboard',
  } = options;

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      router.replace(redirectTo);
      return;
    }
    try {
      const user = JSON.parse(raw);
      if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
        router.replace(unauthorizedRedirect);
      }
    } catch {
      localStorage.removeItem('user');
      router.replace(redirectTo);
    }
  }, [router, redirectTo, allowedRoles, unauthorizedRedirect]);
}
