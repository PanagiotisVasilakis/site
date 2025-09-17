/**
 * Admin Dashboard Page
 * Comprehensive monitoring and observability interface
 */

import React from 'react';
import ObservabilityDashboard from '@/components/ObservabilityDashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Dashboard | Monitoring & Observability',
  description: 'Comprehensive system monitoring, health checks, and performance analytics',
  robots: 'noindex, nofollow', // Don't index admin pages
};

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen">
      <ObservabilityDashboard 
        refreshInterval={30000} // 30 seconds
        autoRefresh={true}
      />
    </div>
  );
}