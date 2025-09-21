export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
export default function LegacySignInRedirect({ params }: { params: { locale: string } }) {
  const target = `/${params.locale || 'en'}/guest?mode=signin`;
  redirect(target);
}
