import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** "Account" became Settings; old links and bookmarks land there. */
export default function AccountPage() {
  redirect('/dashboard/settings');
}
