export async function POST() {
  const res = new Response('ok', { status: 200 });
  
  // Properly expire cookie with all security flags and explicit expiration
  const cookieFlags = `Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
  
  res.headers.append('Set-Cookie', `admin_jwt=; ${cookieFlags}`);
  return res;
}
