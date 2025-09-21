export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
export default function LegacySignUpRedirect({ params }: { params: { locale: string } }) {
  const target = `/${params.locale || 'en'}/guest?mode=signup`;
  redirect(target);
}
