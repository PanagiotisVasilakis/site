export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
export default async function LegacySignInRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const p = await params;
  const target = `/${p.locale || 'en'}/guest?mode=signin`;
  redirect(target);
}
