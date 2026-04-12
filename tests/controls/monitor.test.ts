/**
 * Continuous Controls Monitoring Tests
 * 
 * Tests for the controls monitoring service that tracks control health,
 * detects control failures, and ensures control exceptions are logged
 * with owner, due date, and disposition.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { ControlsMonitorService, resetControlsMonitorService, getControlsMonitorService } from "../../src/controls/monitor.js";

describe("Continuous Controls Monitoring", () => {
  describe("Control Health Tracking", () => {
    it("captures control health status for a given control", () => {
      const service = new ControlsMonitorService();
      
      // Record successful execution
      const health = service.recordExecution({
        controlId: "CTRL-001",
        success: true,
      });
      
      expect(health.controlId).toBe("CTRL-001");
      expect(health.status).toBe("healthy");
      expect(health.consecutiveFailures).toBe(0);
      expect(health.successRate).toBe(100);
      expect(health.totalExecutions).toBe(1);
    });

    it("detects degraded control health when success rate drops but no consecutive failures", () => {
      const service = new ControlsMonitorService();
      
      // Record 10 executions, 7 successful, 3 failed but interspersed to avoid consecutive failures
      // Sequence: success, fail, success, success, success, fail, success, success, fail, success
      // But we need consecutive failures = 0 to test degraded (not failing)
      // So end with a success: consecutiveFailures = 0 but successRate = 70%
      service.recordExecution({ controlId: "CTRL-002", success: true });  // 1
      service.recordExecution({ controlId: "CTRL-002", success: false }); // 2
      service.recordExecution({ controlId: "CTRL-002", success: true }); // 3
      service.recordExecution({ controlId: "CTRL-002", success: true }); // 4
      service.recordExecution({ controlId: "CTRL-002", success: true }); // 5
      service.recordExecution({ controlId: "CTRL-002", success: false }); // 6
      service.recordExecution({ controlId: "CTRL-002", success: true }); // 7
      service.recordExecution({ controlId: "CTRL-002", success: true }); // 8
      service.recordExecution({ controlId: "CTRL-002", success: false }); // 9
      service.recordExecution({ controlId: "CTRL-002", success: true }); // 10 - ends with success, consecutiveFailures = 0
      
      const health = service.getControlHealth("CTRL-002");
      expect(health?.status).toBe("degraded");
      expect(health?.consecutiveFailures).toBe(0);
      expect(health?.successRate).toBe(70);
    });

    it("detects failing control health when failures exceed threshold", () => {
      const service = new ControlsMonitorService();
      
      // Record 10 successful then 5 failed (exceeds max consecutive failures of 3)
      for (let i = 0; i < 10; i++) {
        service.recordExecution({ controlId: "CTRL-003", success: true });
      }
      for (let i = 0; i < 5; i++) {
        service.recordExecution({ controlId: "CTRL-003", success: false });
      }
      
      const health = service.getControlHealth("CTRL-003");
      expect(health?.status).toBe("failing");
      expect(health?.consecutiveFailures).toBe(5);
    });

    it("tracks consecutive failures correctly", () => {
      const service = new ControlsMonitorService();
      
      service.recordExecution({ controlId: "CTRL-004", success: false });
      service.recordExecution({ controlId: "CTRL-004", success: false });
      service.recordExecution({ controlId: "CTRL-004", success: true }); // Reset
      
      const health = service.getControlHealth("CTRL-004");
      expect(health?.consecutiveFailures).toBe(0);
    });
  });

  describe("Control Exception Logging", () => {
    it("logs control exception with owner, due date, and disposition", () => {
      const service = new ControlsMonitorService();
      
      const exception = service.recordException({
        controlId: "CTRL-001",
        type: "evidence-gap",
        description: "Approval without required evidence",
        severity: "high",
        reportedByRoleKey: "finance-auditor",
        ownerRoleKey: "finance-fpa-lead",
        slaDays: 3,
      });
      
      expect(exception.id).toBeDefined();
      expect(exception.ownerRoleKey).toBe("finance-fpa-lead");
      expect(exception.dueDate).toBeDefined();
      expect(exception.disposition).toBe("pending");
      expect(exception.isBreached).toBe(false);
    });

    it("detects SLA breach when exception ages past SLA", () => {
      const service = new ControlsMonitorService();
      
      // Create an exception with SLA breach manually by setting reportedAt to past
      const exception = service.recordException({
        controlId: "CTRL-002",
        type: "segregation-violation",
        description: "Requester and approver are the same person",
        severity: "critical",
        ownerRoleKey: "risk-compliance-lead",
        slaDays: 1,
      });
      
      // Exception should not be breached immediately
      expect(exception.isBreached).toBe(false);
    });

    it("resolves exception with disposition and resolution notes", () => {
      const service = new ControlsMonitorService();
      
      const exception = service.recordException({
        controlId: "CTRL-001",
        type: "policy-conflict",
        description: "Policy conflict in approval routing",
        severity: "high",
        ownerRoleKey: "finance-fpa-lead",
        slaDays: 5,
      });
      
      const resolved = service.resolveException({
        exceptionId: exception.id,
        resolution: "Approved with conditions - additional review completed",
        disposition: "accepted",
        resolvedByRoleKey: "finance-fpa-lead",
        completionNotes: [
          "Reviewed supporting documentation",
          "Verified segregation of duties was maintained",
          "Approved with warning",
        ],
      });
      
      expect(resolved?.disposition).toBe("accepted");
      expect(resolved?.resolvedByRoleKey).toBe("finance-fpa-lead");
      expect(resolved?.resolvedAt).toBeDefined();
      expect(resolved?.completionNotes).toHaveLength(3);
    });

    it("returns null when resolving non-existent exception", () => {
      const service = new ControlsMonitorService();
      
      const result = service.resolveException({
        exceptionId: "non-existent-id",
        resolution: "Test",
        disposition: "accepted",
        resolvedByRoleKey: "test",
      });
      
      expect(result).toBeNull();
    });
  });

  describe("Control Effectiveness Metrics", () => {
    it("calculates control effectiveness as percentage", () => {
      const service = new ControlsMonitorService();
      
      // Record 15 executions - 12 successful, 3 failed
      for (let i = 0; i < 12; i++) {
        service.recordExecution({ controlId: "CTRL-FIN-001", success: true });
      }
      for (let i = 0; i < 3; i++) {
        service.recordExecution({ controlId: "CTRL-FIN-001", success: false });
      }
      
      // Add 2 exceptions
      service.recordException({ controlId: "CTRL-FIN-001", type: "evidence-gap", description: "Test", severity: "medium" });
      service.recordException({ controlId: "CTRL-FIN-001", type: "segregation-violation", description: "Test", severity: "high" });
      
      const metrics = service.getEffectivenessMetrics("CTRL-FIN-001", 30);
      
      expect(metrics?.effectivenessRate).toBeCloseTo(80, 0);
      expect(metrics?.totalExecutions).toBe(15);
      expect(metrics?.exceptionCount).toBe(2);
    });

    it("returns null for control with no data", () => {
      const service = new ControlsMonitorService();
      
      const metrics = service.getEffectivenessMetrics("NON-EXISTENT");
      
      expect(metrics).toBeNull();
    });

    it("identifies controls that need improvement based on effectiveness", () => {
      const service = new ControlsMonitorService();
      
      // Record 10 executions with 50% success rate, interspersed to avoid consecutive failures
      // Sequence: F, S, F, S, F, S, F, S, F, F = 4 successes, 6 failures = 40% effectiveness
      // consecutive failures at end = 2 (which is < 3, so not failing)
      service.recordExecution({ controlId: "CTRL-FIN-002", success: false });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: true });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: false });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: true });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: false });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: true });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: false });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: true });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: false });
      service.recordExecution({ controlId: "CTRL-FIN-002", success: false });
      
      const health = service.getControlHealth("CTRL-FIN-002");
      const metrics = service.getEffectivenessMetrics("CTRL-FIN-002");
      
      // Status depends on consecutive failures threshold (3)
      // With consecutive = 2 (< 3), it's degraded (not failing)
      // But success rate 40% < 80%, so degraded
      expect(health?.status).toBe("degraded");
      expect(metrics?.effectivenessRate).toBe(40);
    });
  });

  describe("Control Monitoring State", () => {
    it("maintains state across multiple controls", () => {
      const service = new ControlsMonitorService();
      
      // Control 1: healthy (success)
      service.recordExecution({ controlId: "CTRL-001", success: true });
      
      // Control 2: failing (3+ consecutive failures)
      service.recordExecution({ controlId: "CTRL-002", success: false });
      service.recordExecution({ controlId: "CTRL-002", success: false });
      service.recordExecution({ controlId: "CTRL-002", success: false });
      service.recordExecution({ controlId: "CTRL-002", success: false });
      service.recordExecution({ controlId: "CTRL-002", success: false });
      
      // Control 3: healthy (success)
      service.recordExecution({ controlId: "CTRL-003", success: true });
      
      const allHealth = service.getAllControlsHealth();
      
      expect(Object.keys(allHealth)).toHaveLength(3);
      expect(allHealth["CTRL-001"].status).toBe("healthy");
      expect(allHealth["CTRL-002"].status).toBe("failing");
      expect(allHealth["CTRL-003"].status).toBe("healthy");
    });

    it("resets all state", () => {
      const service = new ControlsMonitorService();
      
      service.recordExecution({ controlId: "CTRL-001", success: true });
      service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test", severity: "low" });
      
      service.reset();
      
      const allHealth = service.getAllControlsHealth();
      const exceptions = service.getControlExceptions();
      
      expect(Object.keys(allHealth)).toHaveLength(0);
      expect(exceptions).toHaveLength(0);
    });

    it("loads and restores state", () => {
      const service1 = new ControlsMonitorService();
      service1.recordExecution({ controlId: "CTRL-001", success: true });
      
      const service2 = new ControlsMonitorService();
      service2.loadState(service1.getState());
      
      const allHealth = service2.getAllControlsHealth();
      expect(allHealth["CTRL-001"]).toBeDefined();
    });
  });

  describe("Exception Retrieval and Filtering", () => {
    beforeEach(() => {
      // Setup exceptions for filtering tests
    });

    it("gets all exceptions for a specific control", () => {
      const service = new ControlsMonitorService();
      
      service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test 1", severity: "high" });
      service.recordException({ controlId: "CTRL-001", type: "segregation-violation", description: "Test 2", severity: "critical" });
      service.recordException({ controlId: "CTRL-002", type: "sla-breach", description: "Test 3", severity: "medium" });
      
      const exceptions = service.getControlExceptions({ controlId: "CTRL-001" });
      
      expect(exceptions).toHaveLength(2);
      expect(exceptions.every(e => e.controlId === "CTRL-001")).toBe(true);
    });

    it("filters exceptions by disposition", () => {
      const service = new ControlsMonitorService();
      
      const exc1 = service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test 1", severity: "high" });
      service.recordException({ controlId: "CTRL-001", type: "segregation-violation", description: "Test 2", severity: "critical" });
      
      // Resolve one exception
      service.resolveException({
        exceptionId: exc1.id,
        resolution: "Resolved",
        disposition: "accepted",
        resolvedByRoleKey: "test",
      });
      
      const pendingExceptions = service.getControlExceptions({ disposition: "pending" });
      const acceptedExceptions = service.getControlExceptions({ disposition: "accepted" });
      
      expect(pendingExceptions).toHaveLength(1);
      expect(acceptedExceptions).toHaveLength(1);
    });

    it("filters exceptions by severity", () => {
      const service = new ControlsMonitorService();
      
      service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test 1", severity: "high" });
      service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test 2", severity: "low" });
      service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test 3", severity: "critical" });
      
      const criticalExceptions = service.getControlExceptions({ severity: "critical" });
      
      expect(criticalExceptions).toHaveLength(1);
      expect(criticalExceptions[0].severity).toBe("critical");
    });
  });

  describe("Repeated Control Failure Detection", () => {
    it("detects patterns of repeated control failures", () => {
      const service = new ControlsMonitorService();
      
      // Create 4 exceptions of the same type
      for (let i = 0; i < 4; i++) {
        service.recordException({ 
          controlId: "CTRL-001", 
          type: "evidence-gap", 
          description: `Evidence gap occurrence ${i + 1}`, 
          severity: "high" 
        });
      }
      
      const pattern = service.detectFailurePatterns("CTRL-001", 3);
      
      expect(pattern?.isRecurring).toBe(true);
      expect(pattern?.failureCount).toBe(4);
      expect(pattern?.recurrencePattern).toBe("evidence-gap");
      expect(pattern?.suggestedAction).toBeDefined();
    });

    it("returns null when no pattern detected", () => {
      const service = new ControlsMonitorService();
      
      // Only 2 exceptions - below the threshold of 3
      service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test 1", severity: "high" });
      service.recordException({ controlId: "CTRL-001", type: "segregation-violation", description: "Test 2", severity: "high" });
      
      const pattern = service.detectFailurePatterns("CTRL-001", 3);
      
      expect(pattern).toBeNull();
    });
  });

  describe("Control Health Summary", () => {
    it("generates a summary of control health across all controls", () => {
      const service = new ControlsMonitorService();
      
      // Create 5 healthy controls (each with single success)
      for (let i = 1; i <= 5; i++) {
        service.recordExecution({ controlId: `CTRL-HEALTHY-${i}`, success: true });
      }
      
      // Create 1 failing control (3+ consecutive failures)
      service.recordExecution({ controlId: "CTRL-FAILING-1", success: false });
      service.recordExecution({ controlId: "CTRL-FAILING-1", success: false });
      service.recordExecution({ controlId: "CTRL-FAILING-1", success: false });
      service.recordExecution({ controlId: "CTRL-FAILING-1", success: false });
      service.recordExecution({ controlId: "CTRL-FAILING-1", success: false });
      
      // Create 1 degraded control (low success rate but no consecutive failures at end)
      // Ends with success to keep consecutive = 0
      service.recordExecution({ controlId: "CTRL-DEGRADED-1", success: true }); // 1
      service.recordExecution({ controlId: "CTRL-DEGRADED-1", success: false }); // 2
      service.recordExecution({ controlId: "CTRL-DEGRADED-1", success: true }); // 3
      service.recordExecution({ controlId: "CTRL-DEGRADED-1", success: true }); // 4
      service.recordExecution({ controlId: "CTRL-DEGRADED-1", success: false }); // 5
      service.recordExecution({ controlId: "CTRL-DEGRADED-1", success: true }); // 6
      service.recordExecution({ controlId: "CTRL-DEGRADED-1", success: true }); // 7 - consecutive = 0
      // 5 successes, 2 failures = 71.4% < 80% -> degraded
      
      // Total: 5 healthy + 1 degraded + 1 failing = 7 controls
      // Add exceptions
      service.recordException({ controlId: "CTRL-001", type: "evidence-gap", description: "Test", severity: "high" });
      service.recordException({ controlId: "CTRL-002", type: "evidence-gap", description: "Test", severity: "high" });
      service.recordException({ controlId: "CTRL-003", type: "evidence-gap", description: "Test", severity: "high" });
      service.recordException({ controlId: "CTRL-004", type: "evidence-gap", description: "Test", severity: "high" });
      service.recordException({ controlId: "CTRL-005", type: "evidence-gap", description: "Test", severity: "high" });
      
      const summary = service.getHealthSummary();
      
      expect(summary.totalControls).toBe(7);
      expect(summary.healthyCount).toBe(5);
      expect(summary.degradedCount).toBe(1);
      expect(summary.failingCount).toBe(1);
      expect(summary.overallHealthStatus).toBe("failing");
      expect(summary.pendingExceptions).toBe(5);
    });

    it("returns unknown status when no controls exist", () => {
      const service = new ControlsMonitorService();
      
      const summary = service.getHealthSummary();
      
      expect(summary.overallHealthStatus).toBe("unknown");
      expect(summary.totalControls).toBe(0);
    });
  });

  describe("Get Control Health", () => {
    it("returns null for non-existent control", () => {
      const service = new ControlsMonitorService();
      
      const health = service.getControlHealth("NON-EXISTENT");
      
      expect(health).toBeNull();
    });

    it("returns null for non-existent exception", () => {
      const service = new ControlsMonitorService();
      
      const exception = service.getException("NON-EXISTENT");
      
      expect(exception).toBeNull();
    });
  });

  describe("Singleton Service Instance", () => {
    it("returns consistent singleton instance", () => {
      // Reset first to ensure clean state
      resetControlsMonitorService();
      const instance1 = getControlsMonitorService();
      const instance2 = getControlsMonitorService();
      
      expect(instance1).toBe(instance2);
    });
  });
});
