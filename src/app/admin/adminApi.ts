import internalFetch from '@/lib/internalFetchClient';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export type CheckInRequest = {
  id: string;
  bookingId?: string;
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  requestedTime: string;
  message?: string;
  status: RequestStatus;
  notificationStatus?: 'pending' | 'leased' | 'delivered' | 'dead' | null;
  createdAt: string;
  updatedAt: string;
};

export type Summary = {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
};

export const emptySummary: Summary = {
  pending: 0,
  approved: 0,
  rejected: 0,
  total: 0,
};

type AdminApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

// Network failures still throw, so each caller keeps its own catch.
export async function adminRequest<T = unknown>(
  fallbackMessage: string,
  ...request: Parameters<typeof internalFetch>
): Promise<AdminApiResult<T>> {
  const response = await internalFetch(...request);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    return { ok: false, message: body?.error?.message || fallbackMessage };
  }
  return { ok: true, data: body.data };
}
