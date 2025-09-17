/**
 * Security Monitoring and Reporting
 * Enterprise-grade security monitoring with alerting and reporting capabilities
 */

import { 
  getSecurityConfig, 
  type SecurityEvent 
} from '@/lib/security-config';

// Security metrics collection
interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  topIPs: Array<{ ip: string; count: number }>;
  alertsTriggered: number;
  lastUpdated: string;
}

class SecurityMonitor {
  private metrics: SecurityMetrics = {
    totalEvents: 0,
    eventsByType: {},
    eventsBySeverity: {},
    topIPs: [],
    alertsTriggered: 0,
    lastUpdated: new Date().toISOString(),
  };

  private eventBuffer: SecurityEvent[] = [];
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly ALERT_THRESHOLDS = {
    high_severity_events: 5, // Alert after 5 high severity events in 5 minutes
    total_events_per_minute: 50, // Alert after 50 events per minute
    unique_ips_threshold: 20, // Alert after 20 unique IPs in suspicious activity
  };

  public recordEvent(event: SecurityEvent): void {
    // Add to buffer
    this.eventBuffer.push(event);
    
    // Maintain buffer size
    if (this.eventBuffer.length > this.MAX_BUFFER_SIZE) {
      this.eventBuffer.shift();
    }

    // Update metrics
    this.updateMetrics(event);

    // Check for alerts
  this.checkAlerts();

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('🔐 Security Event:', {
        type: event.type,
        severity: event.severity,
        ip: event.ip,
        url: event.url,
        details: event.details,
      });
    }
  }

  private updateMetrics(event: SecurityEvent): void {
    this.metrics.totalEvents++;
    this.metrics.eventsByType[event.type] = (this.metrics.eventsByType[event.type] || 0) + 1;
    this.metrics.eventsBySeverity[event.severity] = (this.metrics.eventsBySeverity[event.severity] || 0) + 1;
    
    // Update top IPs
    const existingIP = this.metrics.topIPs.find(item => item.ip === event.ip);
    if (existingIP) {
      existingIP.count++;
    } else {
      this.metrics.topIPs.push({ ip: event.ip, count: 1 });
    }
    
    // Sort and limit top IPs
    this.metrics.topIPs.sort((a, b) => b.count - a.count);
    this.metrics.topIPs = this.metrics.topIPs.slice(0, 10);
    
    this.metrics.lastUpdated = new Date().toISOString();
  }

  private checkAlerts(): void {
    const config = getSecurityConfig();
    if (!config.monitoring.alertOnViolations) return;

    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    const recentEvents = this.eventBuffer.filter(e => 
      new Date(e.timestamp).getTime() > fiveMinutesAgo
    );

    // Check for high severity events
    const highSeverityEvents = recentEvents.filter(e => 
      e.severity === 'high' || e.severity === 'critical'
    );

    if (highSeverityEvents.length >= this.ALERT_THRESHOLDS.high_severity_events) {
      this.triggerAlert('high_severity_threshold', {
        count: highSeverityEvents.length,
        threshold: this.ALERT_THRESHOLDS.high_severity_events,
        events: highSeverityEvents.slice(-5), // Last 5 events
      });
    }

    // Check for event rate
    const oneMinuteAgo = now - (60 * 1000);
    const recentMinuteEvents = this.eventBuffer.filter(e => 
      new Date(e.timestamp).getTime() > oneMinuteAgo
    );

    if (recentMinuteEvents.length >= this.ALERT_THRESHOLDS.total_events_per_minute) {
      this.triggerAlert('high_event_rate', {
        eventsPerMinute: recentMinuteEvents.length,
        threshold: this.ALERT_THRESHOLDS.total_events_per_minute,
      });
    }

    // Check for suspicious IP activity
    const uniqueIPs = new Set(recentEvents.map(e => e.ip)).size;
    if (uniqueIPs >= this.ALERT_THRESHOLDS.unique_ips_threshold) {
      this.triggerAlert('suspicious_ip_activity', {
        uniqueIPs,
        threshold: this.ALERT_THRESHOLDS.unique_ips_threshold,
        timeWindow: '5 minutes',
      });
    }
  }

  private triggerAlert(alertType: string, data: Record<string, unknown>): void {
    this.metrics.alertsTriggered++;
    
    const alert = {
      type: alertType,
      timestamp: new Date().toISOString(),
      data,
    };

    // Log alert
    console.error('🚨 Security Alert:', alert);

    // Send to external monitoring if configured
    this.sendToExternalMonitoring(alert);
  }

  private async sendToExternalMonitoring(alert: Record<string, unknown>): Promise<void> {
    const config = getSecurityConfig();
    
    if (config.monitoring.reportToSentry && process.env.SENTRY_DSN) {
      try {
        // In a real implementation, you would use Sentry SDK
        console.log('📤 Would send to Sentry:', alert);
      } catch (error) {
        console.error('Failed to send alert to Sentry:', error);
      }
    }

    // Could also send to other monitoring services like DataDog, New Relic, etc.
  }

  public getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  public getRecentEvents(minutes: number = 60): SecurityEvent[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.eventBuffer.filter(event => 
      new Date(event.timestamp).getTime() > cutoff
    );
  }

  public clearMetrics(): void {
    this.metrics = {
      totalEvents: 0,
      eventsByType: {},
      eventsBySeverity: {},
      topIPs: [],
      alertsTriggered: 0,
      lastUpdated: new Date().toISOString(),
    };
    this.eventBuffer = [];
  }
}

// Singleton instance
let securityMonitor: SecurityMonitor | null = null;

export function getSecurityMonitor(): SecurityMonitor {
  if (!securityMonitor) {
    securityMonitor = new SecurityMonitor();
  }
  return securityMonitor;
}

// Convenience function for recording events
export function recordSecurityEvent(event: SecurityEvent): void {
  const monitor = getSecurityMonitor();
  monitor.recordEvent(event);
}

// CSP violation reporter
type CspReport = {
  'document-uri'?: string;
  'violated-directive'?: string;
  'blocked-uri'?: string;
  'original-policy'?: string;
  'source-file'?: string;
  'line-number'?: number;
  'column-number'?: number;
  [key: string]: unknown;
};

export async function handleCSPViolation(
  violationReport: CspReport, 
  request: { ip?: string; userAgent?: string }
): Promise<void> {
  const event: SecurityEvent = {
    type: 'csp_violation',
    severity: 'medium',
    timestamp: new Date().toISOString(),
    ip: request.ip || 'unknown',
    userAgent: request.userAgent,
    url: violationReport['document-uri'] || 'unknown',
    details: {
      violatedDirective: violationReport['violated-directive'],
      blockedURI: violationReport['blocked-uri'],
      originalPolicy: violationReport['original-policy'],
      sourceFile: violationReport['source-file'],
      lineNumber: violationReport['line-number'],
      columnNumber: violationReport['column-number'],
    },
  };

  recordSecurityEvent(event);
}

// Security report generator
export class SecurityReportGenerator {
  public generateDailyReport(): string {
    const monitor = getSecurityMonitor();
    const metrics = monitor.getMetrics();
    const recentEvents = monitor.getRecentEvents(24 * 60); // Last 24 hours

    const report = `
# Daily Security Report
Generated: ${new Date().toISOString()}

## Summary
- Total Events: ${metrics.totalEvents}
- Alerts Triggered: ${metrics.alertsTriggered}
- Unique IPs: ${metrics.topIPs.length}

## Events by Type
${Object.entries(metrics.eventsByType)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join('\n')}

## Events by Severity
${Object.entries(metrics.eventsBySeverity)
  .map(([severity, count]) => `- ${severity}: ${count}`)
  .join('\n')}

## Top IP Addresses
${metrics.topIPs.slice(0, 5)
  .map(({ ip, count }) => `- ${ip}: ${count} events`)
  .join('\n')}

## Recent High-Priority Events
${recentEvents
  .filter(e => e.severity === 'high' || e.severity === 'critical')
  .slice(-10)
  .map(e => `- ${e.timestamp}: ${e.type} from ${e.ip}`)
  .join('\n')}
    `.trim();

    return report;
  }

  public generateWeeklyTrends(): Record<string, unknown> {
    // Using unknown values narrowed below where accessed
    const monitor = getSecurityMonitor();
    const weekEvents = monitor.getRecentEvents(7 * 24 * 60); // Last 7 days
    
    // Group events by day
    const eventsByDay: Record<string, number> = {};
    weekEvents.forEach(event => {
      const day = event.timestamp.split('T')[0];
      eventsByDay[day] = (eventsByDay[day] || 0) + 1;
    });

    // Calculate trends
    const days = Object.keys(eventsByDay).sort();
    const trends = {
      totalEvents: weekEvents.length,
      averagePerDay: weekEvents.length / 7,
      peakDay: days.reduce((peak, day) => 
        eventsByDay[day] > eventsByDay[peak] ? day : peak, days[0]
      ),
      eventsByDay,
      typeDistribution: weekEvents.reduce((acc, event) => {
        acc[event.type] = (acc[event.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return trends;
  }
}

// Export report generator instance
export const securityReportGenerator = new SecurityReportGenerator();

// Health check for security monitoring
export function getSecurityHealthStatus(): {
  status: 'healthy' | 'warning' | 'critical';
  checks: Record<string, boolean>;
  message: string;
} {
  const config = getSecurityConfig();
  const monitor = getSecurityMonitor();
  const metrics = monitor.getMetrics();
  
  const checks = {
    monitoringEnabled: config.monitoring.enabled,
    cspEnabled: config.csp.enabled,
    hstsEnabled: config.headers.hsts.enabled,
    rateLimitEnabled: config.rateLimit.enabled,
    corsEnabled: config.cors.enabled,
    recentAlerts: metrics.alertsTriggered < 10, // Less than 10 alerts is healthy
  };

  const healthyChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  
  let status: 'healthy' | 'warning' | 'critical';
  let message: string;

  if (healthyChecks === totalChecks) {
    status = 'healthy';
    message = 'All security systems operational';
  } else if (healthyChecks >= totalChecks * 0.8) {
    status = 'warning';
    message = 'Some security features need attention';
  } else {
    status = 'critical';
    message = 'Critical security issues detected';
  }

  return { status, checks, message };
}

export type { SecurityMetrics };