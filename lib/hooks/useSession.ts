'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';

interface UseSessionOptions {
  requiredRole?: string | string[];
}

export function useSession(options: UseSessionOptions = {}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (!response.ok) {
          router.push('/');
          return;
        }

        const data = await response.json();
        const { requiredRole } = options;

        if (requiredRole) {
          const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
          if (!roles.includes(data.user.role)) {
            router.push('/');
            return;
          }
        }

        setUser(data.user);
      } catch {
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  return { user, loading };
}
