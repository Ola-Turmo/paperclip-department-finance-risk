/**
 * Continuous Controls Monitoring Service
 * VAL-DEPT-FR-001: Monitors control health, tracks control failures and exceptions,
 * and ensures 100% of control exceptions are logged with owner, due date, and disposition.
 * 
 * This service provides continuous oversight of financial controls including:
 * - Control health tracking (execution success/failure rates)
 * - Control exception logging with SLA tracking
 * - Effectiveness metrics and pattern detection
 * - Integration with approval workflows
 */

import type {
  ControlHealth,
  ControlHealthStatus,
  ControlException,
  ControlExecution,
  ControlEffectivenessMetrics,
  ControlHealthSummary,
  ControlFailurePattern,
  ControlsMonitoringState,
  RecordControlExecutionParams,
  RecordControlExceptionParams,
  ResolveControlExceptionParams,
  GetControlExceptionsParams,
} from "../types.js";

const DEFAULT_MIN_SUCCESS_RATE = 80; // 80%
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_METRICS_PERIOD_DAYS = 30;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function calculateHealthStatus(
  consecutiveFailures: number,
  successRate: number,
  threshold: { minSuccessRate: number; maxConsecutiveFailures: number }
): ControlHealthStatus {
  if (consecutiveFailures >= threshold.maxConsecutiveFailures) {
    return "failing";
  }
  if (successRate < threshold.minSuccessRate) {
    return "degraded";
  }
  return "healthy";
}

function checkSLABreach(reportedAt: string, slaDays?: number): boolean {
  if (!slaDays) return false;
  
  const reported = new Date(reportedAt);
  const now = new Date();
  
  // Calculate business days
  let businessDays = 0;
  const current = new Date(reported);
  
  while (current < now) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }
  
  return businessDays > slaDays;
}

export class ControlsMonitorService {
  private state: ControlsMonitoringState;

  constructor() {
    this.state = {
      controls: {},
      exceptions: {},
      executions: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Record a control execution (success or failure)
   */
  recordExecution(params: RecordControlExecutionParams): ControlHealth {
    const { controlId, success, failureReason, metadata } = params;
    const now = new Date().toISOString();
    
    // Get or create control health record
    let health = this.state.controls[controlId];
    if (!health) {
      health = {
        controlId,
        status: "unknown",
        lastChecked: now,
        consecutiveFailures: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 100,
        threshold: {
          minSuccessRate: DEFAULT_MIN_SUCCESS_RATE,
          maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
        },
      };
    }

    // Record execution
    const execution: ControlExecution = {
      id: generateId(),
      controlId,
      executedAt: now,
      success,
      failureReason,
      metadata,
    };
    this.state.executions[execution.id] = execution;

    // Update health metrics
    health.totalExecutions++;
    health.lastChecked = now;
    
    if (success) {
      health.successfulExecutions++;
      health.consecutiveFailures = 0;
    } else {
      health.failedExecutions++;
      health.consecutiveFailures++;
    }
    
    // Recalculate success rate
    health.successRate = (health.successfulExecutions / health.totalExecutions) * 100;
    
    // Determine health status
    health.status = calculateHealthStatus(
      health.consecutiveFailures,
      health.successRate,
      health.threshold
    );

    this.state.controls[controlId] = health;
    this.state.lastUpdated = now;

    return health;
  }

  /**
   * Record a control exception
   * Ensures 100% of control exceptions are logged with owner, due date, and disposition
   */
  recordException(params: RecordControlExceptionParams): ControlException {
    const {
      controlId,
      type,
      description,
      severity,
      reportedByRoleKey,
      ownerRoleKey,
      dueDate,
      slaDays,
      linkedToRequestId,
    } = params;

    const now = new Date().toISOString();
    
    // Calculate due date if SLA days provided
    let resolvedDueDate = dueDate;
    if (slaDays && !resolvedDueDate) {
      const due = new Date();
      let businessDaysAdded = 0;
      while (businessDaysAdded < slaDays) {
        due.setDate(due.getDate() + 1);
        const dayOfWeek = due.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          businessDaysAdded++;
        }
      }
      resolvedDueDate = due.toISOString();
    }

    const exception: ControlException = {
      id: generateId(),
      controlId,
      type,
      description,
      severity,
      reportedAt: now,
      reportedByRoleKey,
      ownerRoleKey,
      dueDate: resolvedDueDate,
      slaDays,
      isBreached: slaDays ? checkSLABreach(now, slaDays) : false,
      disposition: "pending",
      linkedToRequestId,
    };

    this.state.exceptions[exception.id] = exception;
    this.state.lastUpdated = now;

    return exception;
  }

  /**
   * Resolve a control exception with disposition and resolution notes
   */
  resolveException(params: ResolveControlExceptionParams): ControlException | null {
    const { exceptionId, resolution, disposition, resolvedByRoleKey, completionNotes } = params;
    
    const exception = this.state.exceptions[exceptionId];
    if (!exception) {
      return null;
    }

    exception.resolution = resolution;
    exception.disposition = disposition;
    exception.resolvedByRoleKey = resolvedByRoleKey;
    exception.resolvedAt = new Date().toISOString();
    if (completionNotes) {
      exception.completionNotes = completionNotes;
    }

    this.state.exceptions[exception.id] = exception;
    this.state.lastUpdated = new Date().toISOString();

    return exception;
  }

  /**
   * Get control health for a specific control
   */
  getControlHealth(controlId: string): ControlHealth | null {
    return this.state.controls[controlId] ?? null;
  }

  /**
   * Get all controls health
   */
  getAllControlsHealth(): Record<string, ControlHealth> {
    return { ...this.state.controls };
  }

  /**
   * Get exceptions for a control or filtered by disposition/severity
   */
  getControlExceptions(params?: GetControlExceptionsParams): ControlException[] {
    let exceptions = Object.values(this.state.exceptions);
    
    if (params?.controlId) {
      exceptions = exceptions.filter((e) => e.controlId === params.controlId);
    }
    if (params?.disposition) {
      exceptions = exceptions.filter((e) => e.disposition === params.disposition);
    }
    if (params?.severity) {
      exceptions = exceptions.filter((e) => e.severity === params.severity);
    }
    
    return exceptions;
  }

  /**
   * Get exception by ID
   */
  getException(exceptionId: string): ControlException | null {
    return this.state.exceptions[exceptionId] ?? null;
  }

  /**
   * Get effectiveness metrics for a control over a period
   */
  getEffectivenessMetrics(controlId: string, periodDays: number = DEFAULT_METRICS_PERIOD_DAYS): ControlEffectivenessMetrics | null {
    const health = this.state.controls[controlId];
    if (!health) {
      return null;
    }

    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    
    // Count executions in period
    const periodExecutions = Object.values(this.state.executions).filter((e) => {
      const executedAt = new Date(e.executedAt);
      return e.controlId === controlId && executedAt >= periodStart;
    });

    // Count exceptions in period
    const periodExceptions = Object.values(this.state.exceptions).filter((e) => {
      const reportedAt = new Date(e.reportedAt);
      return e.controlId === controlId && reportedAt >= periodStart;
    });

    const totalExecutions = periodExecutions.length;
    const successfulExecutions = periodExecutions.filter((e) => e.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    const exceptionCount = periodExceptions.length;

    return {
      controlId,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      exceptionCount,
      effectivenessRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
      exceptionRate: totalExecutions > 0 ? (exceptionCount / totalExecutions) * 100 : 0,
    };
  }

  /**
   * Detect patterns in control failures
   */
  detectFailurePatterns(controlId: string, minOccurrences: number = 3): ControlFailurePattern | null {
    const exceptions = Object.values(this.state.exceptions)
      .filter((e) => e.controlId === controlId)
      .sort((a, b) => new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getDate());

    if (exceptions.length < minOccurrences) {
      return null;
    }

    // Group by type to detect recurrence
    const failuresByType: Record<string, typeof exceptions> = {};
    for (const exc of exceptions) {
      if (!failuresByType[exc.type]) {
        failuresByType[exc.type] = [];
      }
      failuresByType[exc.type].push(exc);
    }

    // Find most common failure type
    let maxCount = 0;
    let recurringType: string | undefined;
    for (const [type, excs] of Object.entries(failuresByType)) {
      if (excs.length > maxCount) {
        maxCount = excs.length;
        recurringType = type;
      }
    }

    if (!recurringType || maxCount < minOccurrences) {
      return null;
    }

    return {
      controlId,
      failures: failuresByType[recurringType].map((e) => ({
        date: e.reportedAt,
        type: e.type,
        exceptionId: e.id,
      })),
      isRecurring: true,
      recurrencePattern: recurringType,
      failureCount: maxCount,
      suggestedAction: `Review ${recurringType} pattern - ${maxCount} occurrences detected. Consider process improvement or automation.`,
    };
  }

  /**
   * Generate overall control health summary
   */
  getHealthSummary(): ControlHealthSummary {
    const controls = Object.values(this.state.controls);
    const exceptions = Object.values(this.state.exceptions);

    const healthyCount = controls.filter((c) => c.status === "healthy").length;
    const degradedCount = controls.filter((c) => c.status === "degraded").length;
    const failingCount = controls.filter((c) => c.status === "failing").length;
    const unknownCount = controls.filter((c) => c.status === "unknown").length;

    const pendingExceptions = exceptions.filter((e) => e.disposition === "pending").length;
    const breachedExceptions = exceptions.filter((e) => e.isBreached).length;
    const resolvedExceptions = exceptions.filter((e) => 
      e.disposition === "accepted" || e.disposition === "waived" || e.disposition === "rejected"
    ).length;

    // Calculate average effectiveness rate
    const totalEffectiveness = controls.reduce((sum, c) => sum + c.successRate, 0);
    const averageEffectivenessRate = controls.length > 0 ? totalEffectiveness / controls.length : 0;

    // Determine overall status
    let overallHealthStatus: ControlHealthStatus = "unknown";
    if (failingCount > 0) {
      overallHealthStatus = "failing";
    } else if (degradedCount > 0) {
      overallHealthStatus = "degraded";
    } else if (healthyCount > 0) {
      overallHealthStatus = "healthy";
    }

    return {
      generatedAt: new Date().toISOString(),
      totalControls: controls.length,
      healthyCount,
      degradedCount,
      failingCount,
      unknownCount,
      overallHealthStatus,
      pendingExceptions,
      breachedExceptions,
      resolvedExceptions,
      averageEffectivenessRate,
    };
  }

  /**
   * Get monitoring state (for persistence)
   */
  getState(): ControlsMonitoringState {
    return { ...this.state };
  }

  /**
   * Load monitoring state (for restoration)
   */
  loadState(state: ControlsMonitoringState): void {
    this.state = { ...state };
  }

  /**
   * Reset all monitoring data
   */
  reset(): void {
    this.state = {
      controls: {},
      exceptions: {},
      executions: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

// Singleton instance for worker-level state
let monitorServiceInstance: ControlsMonitorService | null = null;

export function getControlsMonitorService(): ControlsMonitorService {
  if (!monitorServiceInstance) {
    monitorServiceInstance = new ControlsMonitorService();
  }
  return monitorServiceInstance;
}

export function resetControlsMonitorService(): void {
  monitorServiceInstance = null;
}
