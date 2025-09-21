export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
export default async function LegacySignUpRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const p = await params;
  const target = `/${p.locale || 'en'}/guest?mode=signup`;
  redirect(target);
}
