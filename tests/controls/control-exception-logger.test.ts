import { describe, it, expect } from "vitest";
import { ControlExceptionLogger } from "../../src/controls/control-exception-logger.js";

describe("ControlExceptionLogger", () => {
  it("logs and resolves exceptions", () => {
    const logger = new ControlExceptionLogger();
    const exc = logger.log({ controlId: "ctrl1", controlName: "Quarterly Review", exceptionType: "missed_sla", severity: "high", description: "Review delayed", owner: "alice", detectedBy: "automated" });
    expect(exc.id).toBeDefined();
    expect(exc.status).toBe("open");
    logger.resolve(exc.id, "Rescheduled to next week");
    const open = logger.getOpen();
    expect(open.length).toBe(0);
  });

  it("generates compliance report", () => {
    const logger = new ControlExceptionLogger();
    logger.log({ controlId: "ctrl1", controlName: "Test", exceptionType: "failed_check", severity: "medium", description: "check failed", owner: "bob", detectedBy: "manual" });
    const report = logger.complianceReport("2020-01-01", "2030-01-01");
    expect(report.total).toBe(1);
    expect(report.byType.failed_check).toBe(1);
  });
});
