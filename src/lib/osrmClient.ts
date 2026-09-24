/**
 * OSRM Client - Centralized routing/distance API client
 * 
 * Provides type-safe access to OSRM table and route APIs with:
 * - Retry logic with exponential backoff
 * - In-memory caching
 * - Profile fallbacks (e.g., 'foot' -> 'walking')
 */

import type { TravelMode } from '@/lib/travelFormat';

export interface TravelMetrics {
    distance: number; // meters
    duration: number; // seconds
}

export interface OSRMTableResponse {
    code: string;
    distances: number[][];
    durations: number[][];
}

// Profile name candidates for each mode (OSRM servers may use different names)
const PROFILE_CANDIDATES: Record<TravelMode, string[]> = {
    driving: ['driving', 'car'],
    foot: ['foot', 'walking'],
    cycling: ['cycling', 'bike', 'bicycle']
};

// In-memory cache for table responses
const tableCache = new Map<string, OSRMTableResponse>();

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry<T>(
    url: string,
    attempts = 2,
    baseDelay = 500
): Promise<T | null> {
    for (let i = 0; i <= attempts; i++) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                return (await res.json()) as T;
            }
        } catch {
            // Network error, will retry
        }
        if (i < attempts) {
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
        }
    }
    return null;
}

export interface OSRMClientOptions {
    baseUrl?: string;
}

export class OSRMClient {
    private baseUrl: string;
    private failedProfiles = new Set<string>();

    constructor(options: OSRMClientOptions = {}) {
        this.baseUrl = (options.baseUrl || 'https://router.project-osrm.org').replace(/\/$/, '');
    }

    /**
     * Get travel metrics (distance/duration) from origin to multiple destinations
     * using the OSRM table API.
     * 
     * @param mode - Travel mode (driving, foot, cycling)
     * @param origin - Origin coordinates [lng, lat]
     * @param destinations - Array of destination coordinates [lng, lat]
     * @returns Array of TravelMetrics for each destination, or null if failed
     */
    async getTableMetrics(
        mode: TravelMode,
        origin: [number, number],
        destinations: Array<[number, number]>
    ): Promise<TravelMetrics[] | null> {
        if (this.failedProfiles.has(mode)) {
            return null;
        }

        const coordList = [origin, ...destinations];
        const coordString = coordList.map(c => `${c[0]},${c[1]}`).join(';');
        const cacheKey = `${mode}:${coordString}`;

        // Check cache
        if (tableCache.has(cacheKey)) {
            const cached = tableCache.get(cacheKey)!;
            return this.parseTableResponse(cached, destinations.length);
        }

        // Try each profile candidate
        const profiles = PROFILE_CANDIDATES[mode] || [mode];
        for (const profile of profiles) {
            const url = `${this.baseUrl}/table/v1/${profile}/${coordString}?annotations=distance,duration`;
            const data = await fetchWithRetry<OSRMTableResponse>(url);

            if (data && data.distances && data.durations) {
                tableCache.set(cacheKey, data);
                return this.parseTableResponse(data, destinations.length);
            }
        }

        // All profiles failed
        this.failedProfiles.add(mode);
        return null;
    }

    private parseTableResponse(
        data: OSRMTableResponse,
        destinationCount: number
    ): TravelMetrics[] {
        const distances = data.distances?.[0] || [];
        const durations = data.durations?.[0] || [];

        const result: TravelMetrics[] = [];
        for (let i = 0; i < destinationCount; i++) {
            result.push({
                distance: distances[i + 1] || 0,
                duration: durations[i + 1] || 0
            });
        }
        return result;
    }

    /**
     * Get all failed profiles
     */
    getFailedProfiles(): TravelMode[] {
        return Array.from(this.failedProfiles) as TravelMode[];
    }
}

// Singleton instance for convenience
let defaultClient: OSRMClient | null = null;

export function getOSRMClient(options?: OSRMClientOptions): OSRMClient {
    if (!defaultClient || options?.baseUrl) {
        defaultClient = new OSRMClient(options);
    }
    return defaultClient;
}
