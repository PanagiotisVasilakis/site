export async function POST() {
  const res = new Response('ok', { status: 200 });
  // Expire cookie
  res.headers.append('Set-Cookie', 'admin_jwt=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
  return res;
}
