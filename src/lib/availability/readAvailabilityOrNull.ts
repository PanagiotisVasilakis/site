import { logger } from '@/lib/logger-enterprise';
import { readPublicAvailability, type PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

/** The public availability, or null when it cannot be read: the page then renders without it. */
export async function readAvailabilityOrNull(now: Date, failureMessage: string): Promise<PublicAvailability | null> {
  try {
    return await readPublicAvailability(now);
  } catch {
    // No details: the error may carry connection data.
    logger.error(failureMessage);
    return null;
  }
}
