import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import { X402Error, classifyError } from "./error-types";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

/**
 * Comprehensive error monitoring and alerting system for x402 clients
 */

interface AlertConfig {
  errorRateThreshold: number; // Percentage (0-100)
  paymentFailureThreshold: number; // Number of failures
  timeWindowMinutes: number;
  webhookUrl?: string;
  enableConsoleAlerts: boolean;
}

interface MetricSnapshot {
  timestamp: Date;
  totalRequests: number;
  failedRequests: number;
  paymentFailures: number;
  errorRate: number;
  averageLatency: number;
  activeErrors: string[];
}

class ErrorMonitor {
  private metrics: MetricSnapshot[] = [];
  private alertConfig: AlertConfig;
  private errorCounts: Map<string, number> = new Map();
  private latencyMeasurements: number[] = [];

  constructor(alertConfig: AlertConfig) {
    this.alertConfig = alertConfig;
    this.startPeriodicMonitoring();
  }

  recordRequest(duration: number, error?: X402Error): void {
    this.latencyMeasurements.push(duration);
    
    if (error) {
      const errorKey = `${error.code}_${error.statusCode || 'unknown'}`;
      this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
      
      // Log structured error for external monitoring systems
      this.logStructuredError(error, duration);
    }
  }

  private logStructuredError(error: X402Error, duration: number): void {
    const errorLog = {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      service: "x402-client",
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: error.retryable,
        paymentAttempted: error.paymentAttempted,
      },
      metrics: {
        requestDuration: duration,
        errorRate: this.calculateCurrentErrorRate(),
      },
      // Add correlation IDs, user context, etc. in production
      metadata: {
        userAgent: "x402-monitoring-client/1.0",
        environment: process.env.NODE_ENV || "development",
      }
    };

    // In production, send to logging service (Datadog, Splunk, etc.)
    console.log("📊 STRUCTURED_LOG:", JSON.stringify(errorLog));
  }

  private calculateCurrentErrorRate(): number {
    const recentWindow = this.getRecentMetrics(this.alertConfig.timeWindowMinutes);
    if (recentWindow.length === 0) return 0;

    const totalRequests = recentWindow.reduce((sum, m) => sum + m.totalRequests, 0);
    const failedRequests = recentWindow.reduce((sum, m) => sum + m.failedRequests, 0);

    return totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
  }

  private startPeriodicMonitoring(): void {
    // Capture metrics every 30 seconds
    setInterval(() => {
      this.captureMetricSnapshot();
    }, 30000);

    // Check for alerts every minute
    setInterval(() => {
      this.checkAlerts();
    }, 60000);
  }

  private captureMetricSnapshot(): void {
    const snapshot: MetricSnapshot = {
      timestamp: new Date(),
      totalRequests: this.latencyMeasurements.length,
      failedRequests: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      paymentFailures: this.errorCounts.get('PAYMENT_ERROR_402') || 0,
      errorRate: this.calculateCurrentErrorRate(),
      averageLatency: this.latencyMeasurements.length > 0
        ? this.latencyMeasurements.reduce((a, b) => a + b, 0) / this.latencyMeasurements.length
        : 0,
      activeErrors: Array.from(this.errorCounts.keys()),
    };

    this.metrics.push(snapshot);

    // Keep only last hour of metrics
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > oneHourAgo);

    console.log("📈 Metric snapshot captured:", {
      errorRate: `${snapshot.errorRate.toFixed(2)}%`,
      avgLatency: `${Math.round(snapshot.averageLatency)}ms`,
      activeErrors: snapshot.activeErrors.length
    });
  }

  private async checkAlerts(): Promise<void> {
    const currentErrorRate = this.calculateCurrentErrorRate();
    const recentPaymentFailures = this.getRecentPaymentFailures();

    // Alert on high error rate
    if (currentErrorRate > this.alertConfig.errorRateThreshold) {
      await this.sendAlert({
        type: "HIGH_ERROR_RATE",
        message: `Error rate is ${currentErrorRate.toFixed(2)}% (threshold: ${this.alertConfig.errorRateThreshold}%)`,
        severity: "WARNING",
        details: { errorRate: currentErrorRate },
      });
    }

    // Alert on payment failures
    if (recentPaymentFailures > this.alertConfig.paymentFailureThreshold) {
      await this.sendAlert({
        type: "PAYMENT_FAILURES",
        message: `${recentPaymentFailures} payment failures in the last ${this.alertConfig.timeWindowMinutes} minutes`,
        severity: "CRITICAL",
        details: { paymentFailures: recentPaymentFailures },
      });
    }

    // Alert on latency spikes
    const recentLatency = this.getRecentAverageLatency();
    if (recentLatency > 10000) { // 10 seconds
      await this.sendAlert({
        type: "HIGH_LATENCY",
        message: `Average latency is ${Math.round(recentLatency)}ms`,
        severity: "WARNING",
        details: { latency: recentLatency },
      });
    }
  }

  private getRecentMetrics(windowMinutes: number): MetricSnapshot[] {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  private getRecentPaymentFailures(): number {
    const recentMetrics = this.getRecentMetrics(this.alertConfig.timeWindowMinutes);
    return recentMetrics.reduce((sum, m) => sum + m.paymentFailures, 0);
  }

  private getRecentAverageLatency(): number {
    const recentMetrics = this.getRecentMetrics(this.alertConfig.timeWindowMinutes);
    if (recentMetrics.length === 0) return 0;
    
    const totalLatency = recentMetrics.reduce((sum, m) => sum + (m.averageLatency * m.totalRequests), 0);
    const totalRequests = recentMetrics.reduce((sum, m) => sum + m.totalRequests, 0);
    
    return totalRequests > 0 ? totalLatency / totalRequests : 0;
  }

  private async sendAlert(alert: {
    type: string;
    message: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    details: any;
  }): Promise<void> {
    const alertPayload = {
      timestamp: new Date().toISOString(),
      source: "x402-client-monitor",
      ...alert,
    };

    if (this.alertConfig.enableConsoleAlerts) {
      const emoji = alert.severity === "CRITICAL" ? "🚨" : "⚠️";
      console.log(`${emoji} ALERT [${alert.severity}]: ${alert.message}`);
      console.log("   Details:", JSON.stringify(alert.details, null, 2));
    }

    // Send to webhook if configured
    if (this.alertConfig.webhookUrl) {
      try {
        const response = await fetch(this.alertConfig.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alertPayload),
        });

        if (!response.ok) {
          console.log(`❌ Failed to send alert to webhook: ${response.statusText}`);
        }
      } catch (error) {
        console.log("❌ Webhook alert failed:", error);
      }
    }
  }

  getMetricsSummary(): string {
    const recentMetrics = this.getRecentMetrics(60); // Last hour
    if (recentMetrics.length === 0) {
      return "📊 No metrics available";
    }

    const totalRequests = recentMetrics.reduce((sum, m) => sum + m.totalRequests, 0);
    const totalErrors = recentMetrics.reduce((sum, m) => sum + m.failedRequests, 0);
    const avgLatency = recentMetrics.reduce((sum, m) => sum + m.averageLatency, 0) / recentMetrics.length;

    return `
📊 Error Monitoring Summary (Last Hour)

🔢 Request Stats:
  Total Requests: ${totalRequests}
  Total Errors: ${totalErrors}
  Error Rate: ${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0'}%
  Average Latency: ${Math.round(avgLatency)}ms

🚨 Alert Configuration:
  Error Rate Threshold: ${this.alertConfig.errorRateThreshold}%
  Payment Failure Threshold: ${this.alertConfig.paymentFailureThreshold}
  Monitoring Window: ${this.alertConfig.timeWindowMinutes} minutes
  Console Alerts: ${this.alertConfig.enableConsoleAlerts ? 'ON' : 'OFF'}
  Webhook URL: ${this.alertConfig.webhookUrl ? 'Configured' : 'Not configured'}

📈 Top Error Types:
${Array.from(this.errorCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([error, count]) => `  ${error}: ${count}`)
  .join('\n') || '  No errors recorded'}
    `.trim();
  }
}

/**
 * Example demonstrating comprehensive error monitoring
 */
async function errorMonitoringDemo(): Promise<void> {
  console.log("📊 Error Monitoring and Alerting Demo\n");

  // Configure monitoring
  const monitor = new ErrorMonitor({
    errorRateThreshold: 20, // Alert if error rate > 20%
    paymentFailureThreshold: 3, // Alert if > 3 payment failures
    timeWindowMinutes: 5, // Monitor 5-minute windows
    enableConsoleAlerts: true,
    // webhookUrl: "https://hooks.slack.com/services/...", // Slack/Discord webhook
  });

  const evmSigner = privateKeyToAccount(evmPrivateKey);
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));
  client.register("solana:*", new ExactSvmScheme(svmSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // Simulate various request scenarios
  const testScenarios = [
    { name: "Successful request", url: `${baseURL}/weather`, shouldSucceed: true },
    { name: "Payment required", url: `${baseURL}/premium-data`, shouldSucceed: true },
    { name: "Rate limited", url: `${baseURL}/rate-limited`, shouldSucceed: false },
    { name: "Server error", url: `${baseURL}/server-error`, shouldSucceed: false },
    { name: "Network error", url: "http://nonexistent.local/api", shouldSucceed: false },
  ];

  console.log("🧪 Running test scenarios to generate monitoring data...\n");

  for (let i = 0; i < testScenarios.length; i++) {
    const scenario = testScenarios[i];
    console.log(`${i + 1}. Testing: ${scenario.name}`);

    const startTime = Date.now();
    try {
      const response = await fetchWithPayment(scenario.url, {
        method: "GET",
        timeout: 5000,
      });

      const duration = Date.now() - startTime;
      monitor.recordRequest(duration);
      
      console.log(`   ✅ Success (${duration}ms)`);
      
    } catch (rawError: any) {
      const duration = Date.now() - startTime;
      const error = classifyError(rawError);
      
      monitor.recordRequest(duration, error);
      console.log(`   ❌ Failed (${duration}ms): ${error.code}`);
    }

    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Let monitoring system process the data
  console.log("\n⏳ Waiting for monitoring system to process data...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Display monitoring summary
  console.log("\n" + monitor.getMetricsSummary());

  // Simulate high error rate to trigger alerts
  console.log("\n🚨 Simulating high error rate to test alerting...");
  
  for (let i = 0; i < 5; i++) {
    const startTime = Date.now();
    try {
      await fetchWithPayment("http://fail.local/api");
    } catch (rawError: any) {
      const duration = Date.now() - startTime;
      const error = classifyError(rawError);
      monitor.recordRequest(duration, error);
    }
  }

  console.log("\n⏳ Processing error data for alerts...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log("\n" + monitor.getMetricsSummary());
}

/**
 * Demonstrate integration with external monitoring services
 */
async function externalMonitoringDemo(): Promise<void> {
  console.log("\n🔌 External Monitoring Integration Demo\n");

  console.log("📡 Integration patterns for production monitoring:");
  console.log("   • Structured JSON logging for log aggregation services");
  console.log("   • Webhook alerts for Slack/Discord/PagerDuty");
  console.log("   • Metrics export for Prometheus/Grafana");
  console.log("   • Error tracking for Sentry/Rollbar");
  console.log("   • APM integration for Datadog/New Relic");

  console.log("\n💡 Sample integrations:");

  // Example: Structured logging for external systems
  const structuredLog = {
    "@timestamp": new Date().toISOString(),
    level: "ERROR",
    service: "x402-client",
    event: "payment_failure",
    error: {
      code: "INSUFFICIENT_FUNDS",
      message: "Wallet balance too low for payment",
    },
    payment: {
      amount: "0.05",
      currency: "USDC",
      network: "base",
      endpoint: "/premium-data",
    },
    user: {
      wallet: "0x742d35Cc6673C0532925a3b8D23EA6c8Ad0C0532",
    },
    trace: {
      requestId: "req_1234567890",
      sessionId: "sess_abcdef",
    }
  };

  console.log("📄 Structured log format:");
  console.log(JSON.stringify(structuredLog, null, 2));

  // Example: Prometheus metrics export
  console.log("\n📊 Prometheus metrics format:");
  console.log(`
# HELP x402_requests_total Total number of x402 requests
# TYPE x402_requests_total counter
x402_requests_total{status="success",endpoint="/weather"} 25
x402_requests_total{status="error",endpoint="/premium-data",error_code="PAYMENT_ERROR"} 3

# HELP x402_payment_duration_seconds Time spent on payment processing
# TYPE x402_payment_duration_seconds histogram
x402_payment_duration_seconds_bucket{le="0.1"} 15
x402_payment_duration_seconds_bucket{le="0.5"} 23
x402_payment_duration_seconds_bucket{le="1.0"} 24
x402_payment_duration_seconds_bucket{le="5.0"} 25
x402_payment_duration_seconds_bucket{le="+Inf"} 25
x402_payment_duration_seconds_sum 8.2
x402_payment_duration_seconds_count 25
  `.trim());
}

async function main(): Promise<void> {
  console.log("🎯 x402 Error Monitoring Examples\n");
  
  await errorMonitoringDemo();
  await externalMonitoringDemo();
  
  console.log("\n🏆 Error monitoring examples completed!");
  console.log("\n📋 Production Checklist:");
  console.log("   ✅ Structured logging configured");
  console.log("   ✅ Error rate alerts set up");
  console.log("   ✅ Payment failure monitoring");
  console.log("   ✅ Latency tracking enabled");
  console.log("   ✅ External service integration");
  console.log("   ✅ Alert routing configured");
}

main().catch(error => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});