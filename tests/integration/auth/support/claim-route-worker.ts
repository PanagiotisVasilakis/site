import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

export type ClaimRaceScenario = 'a2' | 'a3';
export type ClaimRaceActor = 'a' | 'b';

export const CLAIM_RACE_BOOKING_ID = '25000000-0000-4000-8000-000000000001';
export const CLAIM_RACE_GRANT_ID = '35000000-0000-4000-8000-000000000001';
export const CLAIM_RACE_SIBLING_GRANT_ID = '35000000-0000-4000-8000-000000000002';
export const CLAIM_RACE_TOKEN = `claim_${'R'.repeat(43)}`;
export const CLAIM_RACE_SIBLING_TOKEN = `claim_${'S'.repeat(43)}`;
export const CLAIM_RACE_TOKEN_PEPPER = 'pr02b-claim-race-token-pepper-only';
export const CLAIM_RACE_SECURITY_PEPPER = 'pr02b-claim-race-security-pepper-only';
export const CLAIM_RACE_JWT_SECRET = 'pr02b-claim-race-jwt-secret-only';

const CLAIM_URL = 'http://integration.invalid/api/portal/claims';

const CLAIMANTS = {
  a2: {
    a: {
      phone: '+12025550301',
      password: 'pr02b-a2-claimant-a-password-only',
    },
    b: {
      phone: '+12025550302',
      password: 'pr02b-a2-claimant-b-password-only',
    },
  },
  a3: {
    a: {
      phone: '+12025550303',
      password: 'pr02b-a3-identical-password-only',
    },
    b: {
      phone: '+12025550303',
      password: 'pr02b-a3-identical-password-only',
    },
  },
} as const;

export function claimRaceClaimant(
  scenario: ClaimRaceScenario,
  actor: ClaimRaceActor,
): { phone: string; password: string } {
  return CLAIMANTS[scenario][actor];
}

export interface SafeClaimRaceWorkerEvidence {
  actor: ClaimRaceActor;
  status: number;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  bookingId: string | null;
  sessionCookie: {
    present: boolean;
    cleared: boolean;
    maxAge: number | null;
    httpOnly: boolean;
    sameSite: string | null;
    path: string | null;
  };
  refreshCookie: {
    present: boolean;
    cleared: boolean;
    maxAge: number | null;
    httpOnly: boolean;
    sameSite: string | null;
    path: string | null;
  };
  sessionBinding: {
    sessionId: string;
    userId: string;
    bookingId: string;
  } | null;
  refreshGenerationId: string | null;
  responseRedacted: boolean;
}

interface WorkerResultMessage {
  type: 'claim-race-result';
  evidence: SafeClaimRaceWorkerEvidence;
}

interface WorkerFailureMessage {
  type: 'claim-race-worker-failure';
  phase: 'configuration' | 'request' | 'disconnect';
  errorCode: string | null;
}

function requiredWorkerValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing claim race worker configuration: ${name}`);
  return value;
}

function readWorkerScenario(): ClaimRaceScenario {
  const value = requiredWorkerValue('CLAIM_RACE_SCENARIO');
  if (value !== 'a2' && value !== 'a3') {
    throw new Error('Invalid claim race worker scenario');
  }
  return value;
}

function readWorkerActor(): ClaimRaceActor {
  const value = requiredWorkerValue('CLAIM_RACE_ACTOR');
  if (value !== 'a' && value !== 'b') {
    throw new Error('Invalid claim race worker actor');
  }
  return value;
}

function safeCookie(cookie: ResponseCookie | undefined): SafeClaimRaceWorkerEvidence['sessionCookie'] {
  return {
    present: Boolean(cookie),
    cleared: cookie?.value === '',
    maxAge: cookie?.maxAge ?? null,
    httpOnly: cookie?.httpOnly === true,
    sameSite: cookie?.sameSite ? String(cookie.sameSite).toLowerCase() : null,
    path: cookie?.path ?? null,
  };
}

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^P[0-9]{4}$/.test(code) ? code : null;
}

async function sendWorkerMessage(message: WorkerResultMessage | WorkerFailureMessage): Promise<void> {
  if (!process.send) throw new Error('Claim race worker IPC channel is unavailable');
  await new Promise<void>((resolve, reject) => {
    process.send?.(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function disconnectApplicationPrisma(): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.$disconnect();
}

async function executeClaimWorker(): Promise<void> {
  let phase: WorkerFailureMessage['phase'] = 'configuration';
  let disconnectFailure = false;
  try {
    const scenario = readWorkerScenario();
    const actor = readWorkerActor();
    const claimant = claimRaceClaimant(scenario, actor);
    const databaseUrl = requiredWorkerValue('DATABASE_URL');
    phase = 'request';

    const [{ NextRequest }, claimRoute, guestSession] = await Promise.all([
      import('next/server'),
      import('@/app/api/portal/claims/route'),
      import('@/lib/guestSession'),
    ]);
    const request = new NextRequest(CLAIM_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `pr02b-${scenario}-claim-${actor}`,
        'x-forwarded-for': '198.51.100.73',
      },
      body: JSON.stringify({
        claimToken: CLAIM_RACE_TOKEN,
        origin: 'ABROAD',
        phone: claimant.phone,
        password: claimant.password,
        remember: true,
        acceptTerms: true,
      }),
    });
    const response = await claimRoute.POST(request, { params: Promise.resolve({}) });
    const responseText = await response.text();
    const responseBody = JSON.parse(responseText) as {
      success?: boolean;
      data?: { bookingId?: string };
      error?: { code?: string; message?: string };
    };
    const sessionCookie = response.cookies.get('guest_session');
    const refreshCookie = response.cookies.get('guest_rt');
    const session = guestSession.parseGuestSession(sessionCookie?.value);
    const refreshGenerationId = refreshCookie?.value
      ? refreshCookie.value.split('.', 1)[0] ?? null
      : null;

    const evidence: SafeClaimRaceWorkerEvidence = {
      actor,
      status: response.status,
      success: responseBody.success === true,
      errorCode: responseBody.error?.code ?? null,
      errorMessage: responseBody.error?.message ?? null,
      bookingId: responseBody.data?.bookingId ?? null,
      sessionCookie: safeCookie(sessionCookie),
      refreshCookie: safeCookie(refreshCookie),
      sessionBinding: typeof session?.sid === 'string'
        && typeof session.user?.id === 'string'
        && typeof session.booking?.id === 'string'
        ? {
          sessionId: session.sid,
          userId: session.user.id,
          bookingId: session.booking.id,
        }
        : null,
      refreshGenerationId,
      responseRedacted: ![
        CLAIM_RACE_TOKEN,
        CLAIM_RACE_SIBLING_TOKEN,
        claimant.phone,
        claimant.password,
        databaseUrl,
      ].some((secret) => responseText.includes(secret)),
    };

    phase = 'disconnect';
    try {
      await disconnectApplicationPrisma();
    } catch {
      disconnectFailure = true;
    }
    if (disconnectFailure) {
      await sendWorkerMessage({
        type: 'claim-race-worker-failure',
        phase: 'disconnect',
        errorCode: null,
      });
      process.exitCode = 1;
      return;
    }
    await sendWorkerMessage({ type: 'claim-race-result', evidence });
  } catch (error) {
    if (phase !== 'configuration') {
      try {
        await disconnectApplicationPrisma();
      } catch {
        // The parent process still terminates and inspects the exact child.
      }
    }
    await sendWorkerMessage({
      type: 'claim-race-worker-failure',
      phase,
      errorCode: safeErrorCode(error),
    }).catch(() => undefined);
    process.exitCode = 1;
  } finally {
    process.disconnect?.();
  }
}

if (process.env.CLAIM_RACE_WORKER === '1') {
  await executeClaimWorker();
}
