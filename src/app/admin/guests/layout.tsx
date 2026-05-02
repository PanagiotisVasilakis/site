import type { ReactNode } from 'react';
import { requireAdminPageSession } from '@/lib/adminPageAuth';

export const dynamic = 'force-dynamic';

export default async function AdminGuestsLayout({ children }: { children: ReactNode }) {
  await requireAdminPageSession();
  return children;
}
