'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoadingBlock } from '@/components/ui';

export default function IndexPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authed') router.replace('/dashboard');
    else if (status === 'anon') router.replace('/login');
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingBlock />
    </div>
  );
}
