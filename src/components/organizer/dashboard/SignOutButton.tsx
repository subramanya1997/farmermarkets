'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <Button type="button" variant="ghost" size="sm" onClick={signOut} disabled={pending} className="h-9 text-zinc-700 dark:text-zinc-300">
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LogOut aria-hidden="true" className="size-4" />}
      {pending ? 'Signing out...' : 'Sign out'}
    </Button>
  );
}
