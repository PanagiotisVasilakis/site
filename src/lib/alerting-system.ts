/**
 * Alerting & Notification System
 * Comprehensive alert management with threshold-based monitoring and anomaly detection
 */

import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'anomaly';
  threshold?: number;
  aggregation?: 'average' | 'sum';
  timeWindow: number; // milliseconds
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  tags?: Record<string, string>;
  
  // Notification settings
  notifications: {
    channels: ('email' | 'webhook' | 'console' | 'dashboard')[];
    cooldown: number; // milliseconds between notifications
    escalation?: {
      after: number; // milliseconds
      channels: ('email' | 'webhook' | 'console' | 'dashboard')[];
    };
  };
  
  // Anomaly detection settings (for anomaly condition)
  anomalyDetection?: {
    sensitivity: 'low' | 'medium' | 'high';
    historicalWindow: number; // milliseconds
    minDataPoints: number;
  };
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  value: number;
  threshold?: number;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'acknowledged';
  timestamp: number;
  resolvedAt?: number;
  acknowledgedAt?: number;
  message: string;
  tags?: Record<string, string>;
  
  // Notification tracking
  notifications: {
    sent: Array<{
      channel: string;
      timestamp: number;
      success: boolean;
      error?: string;
    }>;
    lastSent?: number;
    escalated: boolean;
    escalationSentAt?: number;
  };
}

export interface NotificationChannel {
  type: 'email' | 'webhook' | 'console' | 'dashboard';
  config: {
    email?: {
      to: string[];
      from: string;
      subject?: string;
    };
    webhook?: {
      url: string;
      method: 'POST' | 'PUT';
      headers?: Record<string, string>;
      timeout: number;
    };
    console?: {
      level: 'info' | 'warn' | 'error';
    };
    dashboard?: {
      persistent: boolean;
      autoHide: number; // milliseconds
    };
  };
}

class AnomalyDetector {
  private historicalData: Map<string, number[]> = new Map();
  
  detectAnomaly(
    metric: string, 
    currentValue: number, 
    config: AlertRule['anomalyDetection']
  ): { isAnomaly: boolean; score: number; reason: string } {
    if (!config) {
      return { isAnomaly: false, score: 0, reason: 'No anomaly config' };
    }
    
    const historical = this.historicalData.get(metric) || [];
    
    if (historical.length < config.minDataPoints) {
      // Not enough data for anomaly detection
      historical.push(currentValue);
      this.historicalData.set(metric, historical.slice(-100)); // Keep last 100 points
      return { isAnomaly: false, score: 0, reason: 'Insufficient historical data' };
    }
    
    // Simple statistical anomaly detection
    const mean = historical.reduce((sum, val) => sum + val, 0) / historical.length;
    const variance = historical.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / historical.length;
    const stdDev = Math.sqrt(variance);
    
    // Calculate z-score
    const zScore = Math.abs((currentValue - mean) / stdDev);
    
    // Determine threshold based on sensitivity
    let threshold = 2; // default for medium sensitivity
    switch (config.sensitivity) {
      case 'low':
        threshold = 3; // 3 standard deviations
        break;
      case 'medium':
        threshold = 2; // 2 standard deviations
        break;
      case 'high':
        threshold = 1.5; // 1.5 standard deviations
        break;
    }
    
    const isAnomaly = zScore > threshold;
    
    // Update historical data
    historical.push(currentValue);
    this.historicalData.set(metric, historical.slice(-100));
    
    return {
      isAnomaly,
      score: zScore,
      reason: isAnomaly 
        ? `Value ${currentValue} deviates ${zScore.toFixed(2)} standard deviations from mean ${mean.toFixed(2)}`
        : 'Within normal range',
    };
  }
}

export class AlertingSystem {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private notificationChannels: Map<string, NotificationChannel> = new Map();
  private anomalyDetector = new AnomalyDetector();
  private evaluationInterval: NodeJS.Timeout | null = null;
  
  constructor(options: { autoStart?: boolean } = {}) {
    this.setupDefaultRules();
    this.setupDefaultChannels();
    if (options.autoStart !== false) {
      this.startEvaluation();
    }
  }
  
  private setupDefaultRules(): void {
    // High error rate alert
    this.addRule({
      id: 'high-error-rate',
      name: 'High Error Rate',
      description: 'Alert when more than five server errors are recorded in five minutes',
      metric: 'http.errors',
      condition: 'greater_than',
      threshold: 5,
      aggregation: 'sum',
      timeWindow: 300000, // 5 minutes
      severity: 'high',
      enabled: true,
      notifications: {
        channels: ['console', 'dashboard'],
        cooldown: 300000, // 5 minutes
        escalation: {
          after: 900000, // 15 minutes
          channels: ['webhook'],
        },
      },
    }, false);
    
    // Slow response time alert
    this.addRule({
      id: 'slow-response-time',
      name: 'Slow Response Time',
      description: 'Alert when average response time exceeds 1000ms',
      metric: 'http.response_time',
      condition: 'greater_than',
      threshold: 1000,
      timeWindow: 300000, // 5 minutes
      severity: 'medium',
      enabled: true,
      notifications: {
        channels: ['console', 'dashboard'],
        cooldown: 600000, // 10 minutes
      },
    }, false);
    
    // Memory usage alert
    this.addRule({
      id: 'high-memory-usage',
      name: 'High Memory Usage',
      description: 'Alert when memory usage exceeds 85%',
      metric: 'system.memory.percentage',
      condition: 'greater_than',
      threshold: 85,
      timeWindow: 180000, // 3 minutes
      severity: 'high',
      enabled: true,
      notifications: {
        channels: ['console', 'dashboard'],
        cooldown: 300000, // 5 minutes
        escalation: {
          after: 600000, // 10 minutes
          channels: ['webhook'],
        },
      },
    }, false);
    
    // Health check failure alert
    this.addRule({
      id: 'health-check-failure',
      name: 'Health Check Failure',
      description: 'Alert when health checks fail',
      metric: 'health_check.errors',
      condition: 'greater_than',
      threshold: 0,
      timeWindow: 60000, // 1 minute
      severity: 'critical',
      enabled: true,
      notifications: {
        channels: ['console', 'dashboard', 'webhook'],
        cooldown: 120000, // 2 minutes
      },
    }, false);
    
    // Anomaly detection for request volume
    this.addRule({
      id: 'request-volume-anomaly',
      name: 'Request Volume Anomaly',
      description: 'Alert on unusual request volume patterns',
      metric: 'http.requests',
      condition: 'anomaly',
      timeWindow: 600000, // 10 minutes
      severity: 'medium',
      enabled: true,
      notifications: {
        channels: ['console', 'dashboard'],
        cooldown: 1800000, // 30 minutes
      },
      anomalyDetection: {
        sensitivity: 'medium',
        historicalWindow: 86400000, // 24 hours
        minDataPoints: 20,
      },
    }, false);
  }
  
  private setupDefaultChannels(): void {
    // Console notification channel
    this.addNotificationChannel('console', {
      type: 'console',
      config: {
        console: {
          level: 'warn',
        },
      },
    }, false);
    
    // Dashboard notification channel
    this.addNotificationChannel('dashboard', {
      type: 'dashboard',
      config: {
        dashboard: {
          persistent: true,
          autoHide: 300000, // 5 minutes for non-critical alerts
        },
      },
    }, false);

    // Webhook notification channel (example)
    const webhookToken = process.env.ALERT_WEBHOOK_TOKEN;
    if (webhookToken) {
      this.addNotificationChannel('webhook', {
        type: 'webhook',
        config: {
          webhook: {
            url: process.env.ALERT_WEBHOOK_URL || 'http://localhost:3000/api/alerts/webhook',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${webhookToken}`,
            },
            timeout: 5000,
          },
        },
      }, false);
    } else if (process.env.ALERT_WEBHOOK_REQUIRED === '1') {
      logger.warn('ALERT_WEBHOOK_TOKEN not configured; webhook channel disabled');
    }
  }
  
  private startEvaluation(): void {
    if (this.evaluationInterval) return;
    // Evaluate rules every 30 seconds
    this.evaluationInterval = setInterval(() => {
      this.evaluateRules();
    }, 30000);
    this.evaluationInterval.unref?.();
  }
  
  addRule(rule: AlertRule, log = true): void {
    this.rules.set(rule.id, rule);
    if (log) logger.info('Alert rule added', {
      ruleId: rule.id,
      name: rule.name,
      metric: rule.metric,
      condition: rule.condition,
      severity: rule.severity,
    });
  }
  
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    // Resolve any active alerts for this rule
    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.ruleId === ruleId) {
        this.resolveAlert(alertId);
      }
    }
    logger.info('Alert rule removed', { ruleId });
  }
  
  addNotificationChannel(name: string, channel: NotificationChannel, log = true): void {
    this.notificationChannels.set(name, channel);
    if (log) logger.info('Notification channel added', {
      name,
      type: channel.type,
    });
  }
  
  private async evaluateRules(): Promise<void> {
    const now = Date.now();
    
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;
      
      try {
        await this.evaluateRule(rule, now);
      } catch (error) {
        logger.error('Rule evaluation failed', {
          ruleId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // Check for escalations
    await this.checkEscalations(now);
  }
  
  private async evaluateRule(rule: AlertRule, now: number): Promise<void> {
    const since = now - rule.timeWindow;
    
    try {
      // Get metric data
      const metricData = metrics.getMetrics(rule.metric, since);
      
      if (metricData.length === 0) {
        return; // No data to evaluate
      }
      
      const total = metricData.reduce((sum, metric) => sum + metric.value, 0);
      const currentValue = rule.aggregation === 'sum' ? total : total / metricData.length;
      
      let shouldAlert = false;
      let alertMessage = '';
      
      if (rule.condition === 'anomaly') {
        const anomalyResult = this.anomalyDetector.detectAnomaly(
          rule.metric,
          currentValue,
          rule.anomalyDetection
        );
        
        shouldAlert = anomalyResult.isAnomaly;
        alertMessage = `Anomaly detected in ${rule.metric}: ${anomalyResult.reason}`;
      } else {
        // Threshold-based conditions
        const threshold = rule.threshold!;
        
        switch (rule.condition) {
          case 'greater_than':
            shouldAlert = currentValue > threshold;
            alertMessage = `${rule.metric} (${currentValue.toFixed(2)}) exceeds threshold (${threshold})`;
            break;
          case 'less_than':
            shouldAlert = currentValue < threshold;
            alertMessage = `${rule.metric} (${currentValue.toFixed(2)}) below threshold (${threshold})`;
            break;
          case 'equals':
            shouldAlert = Math.abs(currentValue - threshold) < 0.001;
            alertMessage = `${rule.metric} equals threshold (${threshold})`;
            break;
          case 'not_equals':
            shouldAlert = Math.abs(currentValue - threshold) >= 0.001;
            alertMessage = `${rule.metric} (${currentValue.toFixed(2)}) does not equal threshold (${threshold})`;
            break;
        }
      }
      
      // Check if we already have an active alert for this rule
      const existingAlert = Array.from(this.activeAlerts.values())
        .find(alert => alert.ruleId === rule.id && alert.status === 'active');
      
      if (shouldAlert && !existingAlert) {
        // Create new alert
        await this.createAlert(rule, currentValue, alertMessage, now);
      } else if (!shouldAlert && existingAlert) {
        // Resolve existing alert
        await this.resolveAlert(existingAlert.id, now);
      }
      
    } catch (error) {
      logger.error('Metric evaluation failed', {
        ruleId: rule.id,
        metric: rule.metric,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  private async createAlert(
    rule: AlertRule, 
    value: number, 
    message: string, 
    timestamp: number
  ): Promise<void> {
    const alertId = `alert-${rule.id}-${timestamp}`;
    
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      condition: rule.condition,
      severity: rule.severity,
      status: 'active',
      timestamp,
      message,
      tags: rule.tags,
      notifications: {
        sent: [],
        escalated: false,
      },
    };
    
    this.activeAlerts.set(alertId, alert);
    
    // Send notifications
    await this.sendNotifications(alert, rule.notifications.channels);
    
    // Track alert creation metrics
    metrics.counter('alerts.created', 1, {
      rule: rule.id,
      severity: rule.severity,
      metric: rule.metric,
    });
    
    logger.warn('Alert created', {
      alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      severity: rule.severity,
      message,
    });
  }
  
  private async resolveAlert(alertId: string, timestamp?: number): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return;
    
    alert.status = 'resolved';
    alert.resolvedAt = timestamp || Date.now();
    
    // Track alert resolution metrics
    const duration = alert.resolvedAt - alert.timestamp;
    metrics.timer('alerts.duration', duration, {
      rule: alert.ruleId,
      severity: alert.severity,
    });
    
    metrics.counter('alerts.resolved', 1, {
      rule: alert.ruleId,
      severity: alert.severity,
    });
    
    logger.info('Alert resolved', {
      alertId,
      ruleId: alert.ruleId,
      duration,
      severity: alert.severity,
    });
    
    // Remove from active alerts after a delay (for audit trail)
    setTimeout(() => {
      this.activeAlerts.delete(alertId);
    }, 300000); // Keep for 5 minutes
  }
  
  private async checkEscalations(now: number): Promise<void> {
    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.status !== 'active' || alert.notifications.escalated) continue;
      
      const rule = this.rules.get(alert.ruleId);
      if (!rule?.notifications.escalation) continue;
      
      const escalationTime = alert.timestamp + rule.notifications.escalation.after;
      
      if (now >= escalationTime) {
        alert.notifications.escalated = true;
        alert.notifications.escalationSentAt = now;
        
        await this.sendNotifications(alert, rule.notifications.escalation.channels);
        
        metrics.counter('alerts.escalated', 1, {
          rule: rule.id,
          severity: rule.severity,
        });
        
        logger.error('Alert escalated', {
          alertId,
          ruleId: rule.id,
          severity: rule.severity,
          escalationChannels: rule.notifications.escalation.channels,
        });
      }
    }
  }
  
  private async sendNotifications(alert: Alert, channels: string[]): Promise<void> {
    const rule = this.rules.get(alert.ruleId);
    if (!rule) return;
    
    // Check cooldown
    if (alert.notifications.lastSent && 
        Date.now() - alert.notifications.lastSent < rule.notifications.cooldown) {
      return;
    }
    
    for (const channelName of channels) {
      const channel = this.notificationChannels.get(channelName);
      if (!channel) continue;
      
      try {
        await this.sendNotification(alert, channel);
        
        alert.notifications.sent.push({
          channel: channelName,
          timestamp: Date.now(),
          success: true,
        });
        
      } catch (error) {
        alert.notifications.sent.push({
          channel: channelName,
          timestamp: Date.now(),
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        
        logger.error('Notification failed', {
          alertId: alert.id,
          channel: channelName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    alert.notifications.lastSent = Date.now();
  }
  
  private async sendNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
    switch (channel.type) {
      case 'console':
        this.sendConsoleNotification(alert, channel);
        break;
      case 'webhook':
        await this.sendWebhookNotification(alert, channel);
        break;
      case 'dashboard':
        this.sendDashboardNotification(alert, channel);
        break;
      default:
        logger.warn('Unknown notification channel type', { type: channel.type });
    }
  }
  
  private sendConsoleNotification(alert: Alert, channel: NotificationChannel): void {
    const level = channel.config.console?.level || 'warn';
    const message = `[ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`;
    
    switch (level) {
      case 'info':
        logger.info(message, { alertId: alert.id, severity: alert.severity });
        break;
      case 'warn':
        logger.warn(message, { alertId: alert.id, severity: alert.severity });
        break;
      case 'error':
        logger.error(message, { alertId: alert.id, severity: alert.severity });
        break;
    }
  }
  
  private async sendWebhookNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
    const config = channel.config.webhook;
    if (!config) return;
    
    const payload = {
      alert: {
        id: alert.id,
        rule: alert.ruleName,
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold,
        severity: alert.severity,
        status: alert.status,
        message: alert.message,
        timestamp: alert.timestamp,
      },
      timestamp: Date.now(),
    };
    
    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeout),
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }
      
      logger.info('Webhook notification sent', {
        alertId: alert.id,
        url: config.url,
        status: response.status,
      });
      
    } catch (error) {
      logger.error('Webhook notification failed', {
        alertId: alert.id,
        url: config.url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  
  private sendDashboardNotification(alert: Alert, channel: NotificationChannel): void {
    // In a real implementation, this would push to a dashboard notification system
    logger.info('Dashboard notification', {
      alertId: alert.id,
      severity: alert.severity,
      message: alert.message,
      persistent: channel.config.dashboard?.persistent,
    });
  }
  
  // Public API methods
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'active')
      .sort((a, b) => {
        // Sort by severity, then by timestamp
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aSeverity = severityOrder[a.severity];
        const bSeverity = severityOrder[b.severity];
        
        if (aSeverity !== bSeverity) {
          return bSeverity - aSeverity;
        }
        
        return b.timestamp - a.timestamp;
      });
  }
  
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.status !== 'active') return false;
    
    alert.status = 'acknowledged';
    alert.acknowledgedAt = Date.now();
    
    metrics.counter('alerts.acknowledged', 1, {
      rule: alert.ruleId,
      severity: alert.severity,
    });
    
    logger.info('Alert acknowledged', {
      alertId,
      acknowledgedAt: alert.acknowledgedAt,
    });
    
    return true;
  }
  
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }
  
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }
  
  updateRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    
    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    
    logger.info('Alert rule updated', { ruleId, updates });
    return true;
  }
  
  getAlertHistory(hours: number = 24): Alert[] {
    const since = Date.now() - (hours * 60 * 60 * 1000);
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.timestamp >= since)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  destroy(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
  }
}

// Global alerting system instance
export const alertingSystem = new AlertingSystem();
