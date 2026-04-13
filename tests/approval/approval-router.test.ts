import { describe, it, expect } from "vitest";
import { ApprovalRouter } from "../../src/approval/approval-router.js";

describe("ApprovalRouter", () => {
  it("routes to eligible approvers", () => {
    const router = new ApprovalRouter();
    const decision = router.route({
      request: { id: "req1", amount: 500, category: "software", requesterRole: "engineer", description: "Tool license" },
      availableApprovers: [
        { id: "mgr1", role: "manager", maxAmount: 5000, currentLoad: 2 },
        { id: "dir1", role: "director", maxAmount: 50000, currentLoad: 5 },
      ],
      requesterHistory: [{ approved: true, amount: 300, approverId: "mgr1" }],
      segregationMatrix: {},
    });
    expect(decision.approverId).toBe("mgr1");
    expect(decision.predictedOutcome).toBeDefined();
  });

  it("escalates when no eligible approvers", () => {
    const router = new ApprovalRouter();
    const decision = router.route({
      request: { id: "req2", amount: 100000, category: "software", requesterRole: "engineer" },
      availableApprovers: [{ id: "mgr1", role: "manager", maxAmount: 1000, currentLoad: 1 }],
      requesterHistory: [],
      segregationMatrix: {},
    });
    expect(decision.predictedOutcome).toBe("escalate");
    expect(decision.riskFlags).toContain("no_approver");
  });
});
