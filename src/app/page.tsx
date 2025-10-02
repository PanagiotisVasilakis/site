import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { locales, defaultLocale } from "@/i18n/config";

export default async function Home() { 
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("lang")?.value;
  const isValidCookie = cookieLocale && (locales as readonly string[]).includes(cookieLocale);
  const targetLocale = isValidCookie ? cookieLocale : defaultLocale;
  
  redirect(`/${targetLocale}`);
}
