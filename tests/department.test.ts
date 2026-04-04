import { describe, expect, it } from "vitest";
import { connectors, department, jobs, roles, skills } from "../src";
import { ApprovalService } from "../src/approval-service.js";
import { VarianceAnomalyService } from "../src/variance-anomaly-service.js";

describe("@uos/department-finance-risk", () => {
  it("captures the finance-risk department boundary", () => {
    expect(department.departmentId).toBe("finance-risk");
    expect(department.parentFunctionId).toBe("finance-risk");
    expect(department.moduleId).toBeNull();
  });

  it("includes the finance and risk roles", () => {
    expect(roles.some((role) => role.roleKey === "finance-fpa-lead")).toBe(true);
    expect(roles.some((role) => role.roleKey === "risk-compliance-lead")).toBe(true);
    expect(jobs.map((job) => job.jobKey)).toEqual([
      "finance-monthly-review",
      "risk-weekly-exception-review",
    ]);
  });

  it("keeps the finance-risk skills and connectors together", () => {
    expect(skills.bundleIds).toContain("uos-finance-risk");
    expect(skills.externalSkills.some((skill) => skill.id === "kurs-ing-policy-surface-review")).toBe(true);
    expect(connectors.requiredToolkits).toContain("googlesheets");
    expect(connectors.requiredToolkits).toContain("stripe");
    expect(connectors.roleToolkits.some((role) => role.roleKey === "finance-fpa-lead")).toBe(true);
  });
});

// ============================================
// Approval Routing Tests (VAL-DEPT-FR-001)
// ============================================

describe("Approval Routing Service", () => {
  describe("Approval Route Management", () => {
    it("creates an approval route with control boundaries", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Standard Expense Approval",
        category: "expense",
        description: "Standard approval route for expenses under $10,000",
        requiredApproverRoleKeys: ["finance-reviewer", "finance-controllership-lead"],
        minimumApprovals: 1,
        controlBoundary: {
          level: "standard",
          description: "Standard control boundary",
          requiresSecondApproval: false,
          escalationRequired: false,
          blockedRoles: [],
        },
        evidenceRequirements: ["receipt", "justification"],
        slaBusinessDays: 2,
      });

      expect(route.id).toBeDefined();
      expect(route.name).toBe("Standard Expense Approval");
      expect(route.category).toBe("expense");
      expect(route.minimumApprovals).toBe(1);
      expect(route.controlBoundary.level).toBe("standard");
      expect(route.evidenceRequirements).toContain("receipt");
    });

    it("retrieves routes by category", () => {
      const service = new ApprovalService();
      service.createRoute({
        name: "Expense Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: [],
        slaBusinessDays: 2,
      });
      service.createRoute({
        name: "Purchase Route",
        category: "purchase",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: [],
        slaBusinessDays: 5,
      });

      const expenseRoutes = service.getRoutesByCategory("expense");
      expect(expenseRoutes.length).toBe(1);
      expect(expenseRoutes[0].name).toBe("Expense Route");
    });
  });

  describe("Approval Request Workflow", () => {
    it("creates an approval request with evidence", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Test Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer", "finance-controllership-lead"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: ["receipt", "justification"],
        slaBusinessDays: 2,
      });

      const request = service.createRequest({
        routeId: route.id,
        title: "Office Supplies Purchase",
        description: "Purchase of office supplies for Q2",
        requesterRoleKey: "finance-fpa-lead",
        priority: "medium",
        amount: 500,
        currency: "USD",
        evidence: [
          { type: "receipt", title: "Receipt", description: "Store receipt", confidence: "high", collectedByRoleKey: "finance-fpa-lead" },
          { type: "justification", title: "Business Justification", description: "Required for daily operations", confidence: "high", collectedByRoleKey: "finance-fpa-lead" },
        ],
      });

      expect(request.id).toBeDefined();
      expect(request.title).toBe("Office Supplies Purchase");
      expect(request.status).toBe("pending");
      expect(request.requesterRoleKey).toBe("finance-fpa-lead");
      expect(request.amount).toBe(500);
      expect(request.evidence.length).toBe(2);
      expect(request.approvalChain.length).toBe(2);
      expect(request.auditTrail.length).toBeGreaterThan(0);
    });

    it("preserves segregation of duties - requester cannot approve", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Test Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: [],
        slaBusinessDays: 2,
      });

      const request = service.createRequest({
        routeId: route.id,
        title: "Test Request",
        description: "Test",
        requesterRoleKey: "finance-reviewer", // Same as approver
      });

      // Try to submit decision as the requester (who is also the approver)
      const result = service.submitDecision({
        requestId: request.id,
        approverRoleKey: "finance-reviewer",
        decision: { decision: "approved", rationale: "Approved" },
      });

      // Should create a segregation violation exception instead of approving
      expect(result).toBeDefined();
      expect(result!.exceptions.length).toBeGreaterThan(0);
      expect(result!.exceptions[0].type).toBe("segregation-violation");
    });

    it("completes approval workflow with sufficient approvals", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Test Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: [],
        slaBusinessDays: 2,
      });

      const request = service.createRequest({
        routeId: route.id,
        title: "Test Request",
        description: "Test",
        requesterRoleKey: "finance-fpa-lead",
      });

      const result = service.submitDecision({
        requestId: request.id,
        approverRoleKey: "finance-reviewer",
        decision: { decision: "approved", rationale: "Looks good" },
      });

      expect(result).toBeDefined();
      expect(result!.status).toBe("approved");
      expect(result!.disposition.status).toBe("approved");
    });

    it("handles rejection properly", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Test Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: [],
        slaBusinessDays: 2,
      });

      const request = service.createRequest({
        routeId: route.id,
        title: "Test Request",
        description: "Test",
        requesterRoleKey: "finance-fpa-lead",
      });

      const result = service.submitDecision({
        requestId: request.id,
        approverRoleKey: "finance-reviewer",
        decision: { decision: "rejected", rationale: "Insufficient documentation" },
      });

      expect(result).toBeDefined();
      expect(result!.status).toBe("rejected");
      expect(result!.disposition.status).toBe("rejected");
    });

    it("tracks SLA status", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Test Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: [],
        slaBusinessDays: 2,
      });

      const request = service.createRequest({
        routeId: route.id,
        title: "Test Request",
        description: "Test",
        requesterRoleKey: "finance-fpa-lead",
      });

      const slaStatus = service.getSLAStatus(request.id);
      expect(slaStatus.status).toBeDefined();
      expect(slaStatus.slaBusinessDays).toBe(2);
    });

    it("generates approval report with evidence summary", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Test Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "elevated", description: "", requiresSecondApproval: true, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: ["receipt"],
        slaBusinessDays: 2,
      });

      const request = service.createRequest({
        routeId: route.id,
        title: "Test Request",
        description: "Test",
        requesterRoleKey: "finance-fpa-lead",
        evidence: [
          { type: "receipt", title: "Receipt", description: "Test", confidence: "high" },
        ],
      });

      const report = service.generateRequestReport(request.id);
      expect(report).toBeDefined();
      expect(report!.summary.totalEvidence).toBe(1);
      expect(report!.summary.controlBoundaryLevel).toBe("elevated");
    });
  });

  describe("Exception Handling", () => {
    it("reports and resolves exceptions", () => {
      const service = new ApprovalService();
      const route = service.createRoute({
        name: "Test Route",
        category: "expense",
        description: "Test",
        requiredApproverRoleKeys: ["finance-reviewer"],
        minimumApprovals: 1,
        controlBoundary: { level: "standard", description: "", requiresSecondApproval: false, escalationRequired: false, blockedRoles: [] },
        evidenceRequirements: [],
        slaBusinessDays: 2,
      });

      const request = service.createRequest({
        routeId: route.id,
        title: "Test Request",
        description: "Test",
        requesterRoleKey: "finance-fpa-lead",
      });

      const withException = service.reportException({
        requestId: request.id,
        type: "evidence-gap",
        description: "Missing receipt for purchase over $100",
        severity: "high",
        reportedByRoleKey: "finance-reviewer",
      });

      expect(withException).toBeDefined();
      expect(withException!.exceptions.length).toBe(1);
      expect(withException!.status).toBe("exception");

      const resolved = service.resolveException({
        requestId: request.id,
        exceptionId: withException!.exceptions[0].id,
        resolution: "Waived - receipt recovered from vendor portal",
        disposition: "waived",
        resolvedByRoleKey: "finance-controllership-lead",
      });

      expect(resolved).toBeDefined();
      expect(resolved!.exceptions[0].resolvedAt).toBeDefined();
      expect(resolved!.exceptions[0].disposition).toBe("waived");
    });
  });
});

// ============================================
// Variance and Anomaly Tests (VAL-DEPT-FR-002)
// ============================================

describe("Variance and Anomaly Service", () => {
  describe("Forecast Variance Workflow", () => {
    it("detects a material forecast variance", () => {
      const service = new VarianceAnomalyService();
      const variance = service.detectVariance({
        title: "Q2 Revenue Variance",
        description: "Q2 revenue came in 15% below forecast",
        varianceType: "forecast",
        previousValue: 1000000,
        currentValue: 850000,
        materialityThreshold: 50000,
        ownerRoleKey: "finance-fpa-lead",
      });

      expect(variance.id).toBeDefined();
      expect(variance.title).toBe("Q2 Revenue Variance");
      expect(variance.varianceAmount).toBe(-150000);
      expect(variance.variancePercentage).toBe(-15);
      expect(variance.isMaterial).toBe(true);
      expect(variance.status).toBe("detected");
    });

    it("explains variance with driver analysis", () => {
      const service = new VarianceAnomalyService();
      const variance = service.detectVariance({
        title: "Test Variance",
        description: "Test",
        varianceType: "forecast",
        previousValue: 100000,
        currentValue: 80000,
        materialityThreshold: 5000,
      });

      const explained = service.explainVariance({
        varianceId: variance.id,
        driverCategories: ["volume", "price"],
        primaryDriver: "volume",
        driverExplanations: [
          { category: "volume", explanation: "Sales volume decreased 10% due to seasonal factors", quantifiedImpact: -12000, confidence: "high" },
          { category: "price", explanation: "Average selling price decreased 5%", quantifiedImpact: -8000, confidence: "medium" },
        ],
        isMaterial: true,
        impactDescription: "Material variance requiring follow-up",
        lessonsLearned: ["Seasonal adjustments should be applied earlier"],
      });

      expect(explained).toBeDefined();
      expect(explained!.status).toBe("explained");
      expect(explained!.primaryDriver).toBe("volume");
      expect(explained!.driverExplanations.length).toBe(2);
      expect(explained!.explainedAt).toBeDefined();
    });

    it("assigns follow-up action with reversibility info", () => {
      const service = new VarianceAnomalyService();
      const variance = service.detectVariance({
        title: "Test Variance",
        description: "Test",
        varianceType: "forecast",
        previousValue: 100000,
        currentValue: 80000,
        materialityThreshold: 5000,
      });

      const withFollowUp = service.assignVarianceFollowUp({
        varianceId: variance.id,
        title: "Review pricing strategy",
        description: "Investigate if pricing adjustments can recover lost revenue",
        priority: "high",
        ownerRoleKey: "finance-fpa-lead",
        dueDate: "2026-04-15",
        reversibility: "partially-reversible",
        rollbackProcedure: "Revert pricing changes if customer feedback is negative",
        verificationCriteria: "Revenue recovers by 5% within 30 days",
      });

      expect(withFollowUp).toBeDefined();
      expect(withFollowUp!.status).toBe("action-assigned");
      expect(withFollowUp!.followUpActions.length).toBe(1);
      expect(withFollowUp!.followUpActions[0].reversibility).toBe("partially-reversible");
      expect(withFollowUp!.followUpActions[0].rollbackProcedure).toBeDefined();
    });

    it("completes follow-up workflow and resolves variance", () => {
      const service = new VarianceAnomalyService();
      const variance = service.detectVariance({
        title: "Test Variance",
        description: "Test",
        varianceType: "forecast",
        previousValue: 100000,
        currentValue: 80000,
        materialityThreshold: 5000,
      });

      const withFollowUp = service.assignVarianceFollowUp({
        varianceId: variance.id,
        title: "Test Action",
        description: "Test",
        priority: "medium",
        reversibility: "fully-reversible",
      });

      const completed = service.updateVarianceFollowUpStatus({
        varianceId: variance.id,
        followUpId: withFollowUp!.followUpActions[0].id,
        status: "completed",
        completionNotes: ["Pricing strategy adjusted successfully"],
      });

      expect(completed).toBeDefined();
      expect(completed!.status).toBe("resolved");
      expect(completed!.resolvedAt).toBeDefined();
    });

    it("generates variance summary", () => {
      const service = new VarianceAnomalyService();
      service.detectVariance({
        title: "Variance 1",
        description: "Test",
        varianceType: "forecast",
        previousValue: 100000,
        currentValue: 80000,
        materialityThreshold: 5000,
      });
      service.detectVariance({
        title: "Variance 2",
        description: "Test",
        varianceType: "budget",
        previousValue: 50000,
        currentValue: 55000,
        materialityThreshold: 5000,
      });

      const summary = service.generateVarianceSummary();
      expect(summary.totalVariances).toBe(2);
      expect(summary.materialVariances).toBe(2); // Both variances are material
    });
  });

  describe("Financial Anomaly Workflow", () => {
    it("detects a financial anomaly", () => {
      const service = new VarianceAnomalyService();
      const anomaly = service.detectAnomaly({
        title: "Unusual Spending Spike",
        description: "Credit card spending 3x higher than normal in marketing category",
        category: "spending-spike",
        detectedValue: 45000,
        expectedValue: 15000,
        ownerRoleKey: "risk-compliance-lead",
      });

      expect(anomaly.id).toBeDefined();
      expect(anomaly.title).toBe("Unusual Spending Spike");
      expect(anomaly.deviationAmount).toBe(30000);
      expect(anomaly.deviationPercentage).toBe(200);
      expect(anomaly.status).toBe("detected");
    });

    it("explains anomaly with cause analysis", () => {
      const service = new VarianceAnomalyService();
      const anomaly = service.detectAnomaly({
        title: "Test Anomaly",
        description: "Test",
        category: "spending-spike",
        detectedValue: 10000,
        expectedValue: 5000,
      });

      const explained = service.explainAnomaly({
        anomalyId: anomaly.id,
        possibleCauses: [
          { description: "Conference registration fees", likelihood: "confirmed", quantifiedImpact: 3000, requiresInvestigation: false },
          { description: "Team building expenses", likelihood: "likely", quantifiedImpact: 1500, requiresInvestigation: true },
          { description: "Fraudulent transaction", likelihood: "unlikely", requiresInvestigation: true },
        ],
        primaryCauseDescription: "Conference registration fees",
        explanation: "The spike is primarily due to annual conference registrations processed in this period",
      });

      expect(explained).toBeDefined();
      expect(explained!.status).toBe("explained");
      expect(explained!.primaryCause).toBeDefined();
      expect(explained!.primaryCause!.description).toBe("Conference registration fees");
    });

    it("marks false positive with reason", () => {
      const service = new VarianceAnomalyService();
      const anomaly = service.detectAnomaly({
        title: "Test Anomaly",
        description: "Test",
        category: "spending-spike",
        detectedValue: 10000,
        expectedValue: 5000,
      });

      const marked = service.markFalsePositive({
        anomalyId: anomaly.id,
        reason: "Expected seasonal increase - marketing campaign launched as planned",
        markedByRoleKey: "finance-controllership-lead",
      });

      expect(marked).toBeDefined();
      expect(marked!.status).toBe("false-positive");
      expect(marked!.falsePositiveReason).toContain("seasonal increase");
    });

    it("assigns follow-up with reversibility info", () => {
      const service = new VarianceAnomalyService();
      const anomaly = service.detectAnomaly({
        title: "Test Anomaly",
        description: "Test",
        category: "budget-overrun",
        detectedValue: 60000,
        expectedValue: 50000,
      });

      const withFollowUp = service.assignAnomalyFollowUp({
        anomalyId: anomaly.id,
        title: "Implement spending controls",
        description: "Set up additional approval requirements for marketing spend",
        priority: "high",
        ownerRoleKey: "finance-controllership-lead",
        dueDate: "2026-04-20",
        reversibility: "partially-reversible",
        rollbackProcedure: "Remove additional approval step after quarterly review",
        verificationCriteria: "Spending returns to within 10% of budget for next quarter",
      });

      expect(withFollowUp).toBeDefined();
      expect(withFollowUp!.status).toBe("follow-up-assigned");
      expect(withFollowUp!.followUpActions[0].reversibility).toBe("partially-reversible");
    });

    it("links anomaly to related variance", () => {
      const service = new VarianceAnomalyService();
      const variance = service.detectVariance({
        title: "Test Variance",
        description: "Test",
        varianceType: "budget",
        previousValue: 100000,
        currentValue: 80000,
        materialityThreshold: 5000,
      });

      const anomaly = service.detectAnomaly({
        title: "Test Anomaly",
        description: "Test",
        category: "budget-overrun",
        detectedValue: 60000,
        expectedValue: 50000,
      });

      const linked = service.linkAnomalyToVariance(anomaly.id, variance.id);
      expect(linked).toBe(true);

      const updatedAnomaly = service.getAnomaly(anomaly.id);
      expect(updatedAnomaly!.relatedVarianceIds).toContain(variance.id);
    });

    it("generates anomaly summary with severity breakdown", () => {
      const service = new VarianceAnomalyService();
      service.detectAnomaly({
        title: "Critical Anomaly",
        description: "Test",
        category: "spending-spike",
        detectedValue: 100000,
        expectedValue: 10000,
      });
      service.detectAnomaly({
        title: "Low Anomaly",
        description: "Test",
        category: "revenue-dip",
        detectedValue: 51000,
        expectedValue: 50000,
      });

      const summary = service.generateAnomalySummary();
      expect(summary.totalAnomalies).toBe(2);
      expect(summary.urgentAnomalies).toBe(0); // Both have medium severity by default
    });

    it("completes follow-up and resolves anomaly", () => {
      const service = new VarianceAnomalyService();
      const anomaly = service.detectAnomaly({
        title: "Test Anomaly",
        description: "Test",
        category: "budget-overrun",
        detectedValue: 60000,
        expectedValue: 50000,
      });

      const withFollowUp = service.assignAnomalyFollowUp({
        anomalyId: anomaly.id,
        title: "Test Action",
        description: "Test",
        priority: "medium",
        reversibility: "fully-reversible",
      });

      const completed = service.updateAnomalyFollowUpStatus({
        anomalyId: anomaly.id,
        followUpId: withFollowUp!.followUpActions[0].id,
        status: "completed",
        completionNotes: ["Control implemented"],
      });

      expect(completed).toBeDefined();
      expect(completed!.status).toBe("resolved");
    });
  });
});
