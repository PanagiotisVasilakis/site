/**
 * useTravelMetrics - Hook for fetching travel distance/duration from origin to markers
 * 
 * Extracts the OSRM table API logic from LeafletMap into a reusable hook.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { OSRMClient, TravelMetrics, getOSRMClient } from '@/lib/osrmClient';
import type { TravelMode } from '@/lib/travelFormat';

interface MarkerWithCoords {
    id: string;
    coordinates: [number, number]; // [lng, lat]
}

interface TravelData {
    [markerId: string]: {
        driving?: TravelMetrics;
        foot?: TravelMetrics;
        cycling?: TravelMetrics;
    };
}

export interface UseTravelMetricsOptions {
    origin?: [number, number];
    markers: MarkerWithCoords[];
    modes?: TravelMode[];
    osrmBaseUrl?: string;
    debounceMs?: number;
    maxBatch?: number;
    refreshMinutes?: number;
    enabled?: boolean;
    onProfilesFailed?: (failed: TravelMode[]) => void;
}

export interface UseTravelMetricsResult {
    data: TravelData;
    loading: boolean;
    error: string | null;
}

export function useTravelMetrics({
    origin,
    markers,
    modes = ['driving', 'foot'],
    osrmBaseUrl,
    debounceMs = 350,
    maxBatch = 50,
    refreshMinutes = 15,
    enabled = true,
    onProfilesFailed
}: UseTravelMetricsOptions): UseTravelMetricsResult {
    const [data, setData] = useState<TravelData>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clientRef = useRef<OSRMClient | null>(null);
    const requestVersionRef = useRef(0);

    // Initialize client
    useEffect(() => {
        clientRef.current = getOSRMClient({ baseUrl: osrmBaseUrl });
    }, [osrmBaseUrl]);

    const fetchMetrics = useCallback(async () => {
        const requestVersion = requestVersionRef.current + 1;
        requestVersionRef.current = requestVersion;
        if (!origin || markers.length === 0 || !enabled || modes.length === 0) {
            setData({});
            setLoading(false);
            setError(null);
            return;
        }

        const client = clientRef.current;
        if (!client) return;

        setLoading(true);
        setError(null);

        try {
            const newData: TravelData = {};

            // Chunk markers if needed
            const chunks: MarkerWithCoords[][] = [];
            if (markers.length > maxBatch) {
                for (let i = 0; i < markers.length; i += maxBatch) {
                    chunks.push(markers.slice(i, i + maxBatch));
                }
            } else {
                chunks.push(markers);
            }

            for (const mode of modes) {
                if (requestVersion !== requestVersionRef.current) return;

                for (const chunk of chunks) {
                    if (requestVersion !== requestVersionRef.current) return;

                    const destinations = chunk.map(m => m.coordinates);
                    const metrics = await client.getTableMetrics(mode, origin, destinations);

                    if (metrics) {
                        chunk.forEach((marker, idx) => {
                            if (!newData[marker.id]) {
                                newData[marker.id] = {};
                            }
                            newData[marker.id][mode] = metrics[idx];
                        });
                    }
                }
            }

            if (requestVersion === requestVersionRef.current) {
                setData(newData);

                const failed = client.getFailedProfiles();
                if (failed.length > 0 && onProfilesFailed) {
                    onProfilesFailed(failed);
                }
            }
        } catch (err) {
            if (requestVersion === requestVersionRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to fetch travel metrics');
            }
        } finally {
            if (requestVersion === requestVersionRef.current) {
                setLoading(false);
            }
        }
    }, [origin, markers, modes, enabled, maxBatch, onProfilesFailed]);

    // Debounced fetch on changes
    useEffect(() => {
        if (!enabled || !origin || markers.length === 0 || modes.length === 0) {
            void fetchMetrics();
            return;
        }

        const timeout = setTimeout(() => {
            fetchMetrics();
        }, debounceMs);

        return () => {
            clearTimeout(timeout);
            requestVersionRef.current += 1;
        };
    }, [origin, markers, modes, enabled, debounceMs, fetchMetrics]);

    // Periodic refresh
    useEffect(() => {
        if (!enabled || refreshMinutes <= 0) return;

        const interval = setInterval(() => {
            fetchMetrics();
        }, refreshMinutes * 60 * 1000);

        return () => clearInterval(interval);
    }, [enabled, refreshMinutes, fetchMetrics]);

    return {
        data,
        loading,
        error
    };
}
