import { addVital, vitalsSummary } from '@/lib/analyticsStore';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    if (data && typeof data.name === 'string' && typeof data.value === 'number') {
      addVital({ name: data.name, value: data.value, id: data.id || crypto.randomUUID(), ts: Date.now() });
      return new Response('ok', { status: 201 });
    }
    return new Response('bad', { status: 400 });
  } catch { return new Response('error', { status: 500 }); }
}

export async function GET() {
  return Response.json({ vitals: vitalsSummary() });
}
