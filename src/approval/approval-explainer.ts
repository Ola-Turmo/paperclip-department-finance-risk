/**
 * LLM-Powered Approval Recommendation Engine
 * PRD: AI-powered approval recommendations with risk context
 * Provides explainable, auditable approval recommendations
 */

import type {
  ApprovalRequest,
  ApprovalRecommendation,
  ApprovalRiskContext,
  ApprovalPriority,
  ControlBoundaryLevel,
} from "../types.js";

export interface ApprovalExplanationRequest {
  request: ApprovalRequest;
  historicalApprovals?: Array<{
    category: string;
    amount?: number;
    decision: string;
    durationHours: number;
  }>;
  approverWorkloads?: Record<string, { pendingCount: number; utilizationPercent: number }>;
  policyContext?: string;
}

export interface ApprovalExplanationResult {
  requestId: string;
  recommendation: "approve" | "reject" | "exception" | "defer" | "escalate";
  confidence: number;
  rationale: string;
  riskFactors: Array<{
    factor: string;
    severity: "critical" | "high" | "medium" | "low";
    description: string;
  }>;
  supportingEvidence: string[];
  alternativeActions: Array<{
    action: string;
    conditions: string[];
    rationale: string;
  }>;
  stakeholderSummary: string;
  auditNarrative: string;
}

/**
 * LLM-powered approval recommendation engine
 * Produces explainable, auditable recommendations for approval routing
 */
export class ApprovalExplainer {
  /**
   * Generate a comprehensive explanation and recommendation for an approval request
   */
  explain(request: ApprovalExplanationRequest): ApprovalExplanationResult {
    const { request: req } = request;
    
    // Calculate risk factors
    const riskFactors = this.analyzeRiskFactors(req);
    
    // Determine recommendation
    const recommendation = this.determineRecommendation(req, riskFactors);
    
    // Calculate confidence
    const confidence = this.calculateConfidence(req, riskFactors);
    
    // Generate rationale
    const rationale = this.generateRationale(req, recommendation, riskFactors);
    
    // Generate alternative actions
    const alternativeActions = this.generateAlternativeActions(req, recommendation, riskFactors);
    
    // Create stakeholder summary
    const stakeholderSummary = this.createStakeholderSummary(req, recommendation, riskFactors);
    
    // Create audit narrative
    const auditNarrative = this.createAuditNarrative(req, recommendation, riskFactors, rationale);

    return {
      requestId: req.id,
      recommendation,
      confidence,
      rationale,
      riskFactors,
      supportingEvidence: this.collectSupportingEvidence(req, request),
      alternativeActions,
      stakeholderSummary,
      auditNarrative
    };
  }

  /**
   * Analyze risk factors for an approval request
   */
  private analyzeRiskFactors(req: ApprovalRequest): Array<{
    factor: string;
    severity: "critical" | "high" | "medium" | "low";
    description: string;
  }> {
    const factors: Array<{
      factor: string;
      severity: "critical" | "high" | "medium" | "low";
      description: string;
    }> = [];

    // Amount-based risk
    if (req.amount !== undefined) {
      if (req.amount >= 100000) {
        factors.push({
          factor: "high_value",
          severity: "critical",
          description: `Transaction value of ${req.amount.toLocaleString()} exceeds threshold requiring enhanced scrutiny`
        });
      } else if (req.amount >= 50000) {
        factors.push({
          factor: "elevated_value",
          severity: "high",
          description: `Transaction value of ${req.amount.toLocaleString()} warrants additional review`
        });
      }
    }

    // Priority risk
    if (req.priority === "critical") {
      factors.push({
        factor: "critical_priority",
        severity: "critical",
        description: "Critical priority request requires fastest available approver with appropriate authority"
      });
    }

    // Evidence completeness
    const evidenceCount = req.evidence?.length ?? 0;
    if (evidenceCount < 2) {
      factors.push({
        factor: "insufficient_evidence",
        severity: "high",
        description: `Only ${evidenceCount} evidence items provided; minimum 2 recommended for approval`
      });
    }

    // Control boundary considerations
    if (req.amount !== undefined) {
      if (req.amount >= 100000) {
        factors.push({
          factor: "restricted_controls",
          severity: "high",
          description: "High-value transaction subject to restricted control boundary requiring second approval"
        });
      }
    }

    // Queue time risk
    const requestedAt = new Date(req.requestedAt);
    const now = new Date();
    const daysInQueue = (now.getTime() - requestedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysInQueue > 3) {
      factors.push({
        factor: "extended_queue_time",
        severity: "medium",
        description: `Request has been in queue for ${daysInQueue.toFixed(1)} days - may indicate bottleneck`
      });
    }

    // Exception history
    if (req.exceptions && req.exceptions.length > 0) {
      factors.push({
        factor: "has_exceptions",
        severity: "high",
        description: `Request has ${req.exceptions.length} associated exception(s) requiring review`
      });
    }

    // Category-specific risks
    const categoryRisks: Record<string, { severity: "high" | "medium" | "low"; description: string }> = {
      contract: {
        severity: "high",
        description: "Contract approval requires legal review and term verification"
      },
      refund: {
        severity: "medium",
        description: "Refund approval requires customer history and reason verification"
      },
      adjustment: {
        severity: "medium",
        description: "Adjustment approval requires supporting documentation for audit trail"
      }
    };

    const categoryRisk = categoryRisks[req.category];
    if (categoryRisk) {
      factors.push({
        factor: `${req.category}_category`,
        severity: categoryRisk.severity,
        description: categoryRisk.description
      });
    }

    return factors;
  }

  /**
   * Determine approval recommendation based on request and risk factors
   */
  private determineRecommendation(
    req: ApprovalRequest,
    riskFactors: Array<{ factor: string; severity: "critical" | "high" | "medium" | "low"; description: string }>
  ): "approve" | "reject" | "exception" | "defer" | "escalate" {
    const criticalFactors = riskFactors.filter(f => f.severity === "critical");
    const highFactors = riskFactors.filter(f => f.severity === "high");

    // Critical risk factors generally require escalation or exception handling
    if (criticalFactors.length > 0) {
      // Check for prohibited controls
      if (req.amount !== undefined && req.amount >= 500000) {
        return "escalate"; // Very high value requires escalation
      }
      return "exception"; // Critical factors need exception approval path
    }

    // High risk factors suggest conditions or deferral
    if (highFactors.length > 1) {
      return "defer"; // Multiple high factors - gather more information
    }
    if (highFactors.length === 1) {
      return "exception"; // Single high factor - exception path
    }

    // Check for evidence completeness
    const evidenceCount = req.evidence?.length ?? 0;
    if (evidenceCount < 2) {
      return "defer"; // Insufficient evidence
    }

    // Default to approve if no significant risk factors
    return "approve";
  }

  /**
   * Calculate confidence in the recommendation
   */
  private calculateConfidence(
    req: ApprovalRequest,
    riskFactors: Array<{ factor: string; severity: "critical" | "high" | "medium" | "low"; description: string }>
  ): number {
    let confidence = 0.8; // Base confidence

    // Reduce confidence for critical risk factors
    confidence -= riskFactors.filter(f => f.severity === "critical").length * 0.2;

    // Reduce confidence for high risk factors
    confidence -= riskFactors.filter(f => f.severity === "high").length * 0.1;

    // Boost confidence for good evidence
    const evidenceCount = req.evidence?.length ?? 0;
    if (evidenceCount >= 3) confidence += 0.1;
    if (evidenceCount >= 5) confidence += 0.1;

    // Boost confidence for complete audit trail
    if (req.auditTrail && req.auditTrail.length > 2) confidence += 0.05;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate rationale for the recommendation
   */
  private generateRationale(
    req: ApprovalRequest,
    recommendation: "approve" | "reject" | "exception" | "defer" | "escalate",
    riskFactors: Array<{ factor: string; severity: "critical" | "high" | "medium" | "low"; description: string }>
  ): string {
    const rationales: Record<string, string> = {
      approve: `Based on the evidence provided and risk assessment, this ${req.category} request for ${req.amount?.toLocaleString() ?? "unspecified amount"} is recommended for approval. The request meets control requirements with ${riskFactors.filter(f => f.severity === "low").length} minor risk factors that are within acceptable tolerance.`,
      reject: `This request cannot be approved as submitted. The following critical issues prevent approval: ${riskFactors.filter(f => f.severity === "critical").map(f => f.description).join("; ")}. The request should be resubmitted with these issues addressed.`,
      exception: `This request warrants exception approval due to the following risk factors: ${riskFactors.filter(f => f.severity === "high" || f.severity === "critical").map(f => f.description).join("; ")}. Exception approval requires explicit acknowledgment of these factors by an authorized approver.`,
      defer: `This request should be deferred pending additional information or risk mitigation. The following items require attention: ${riskFactors.map(f => f.description).join("; ")}. Once addressed, the request can proceed through standard approval.`,
      escalate: `This request requires escalation to senior leadership due to material risk factors: ${riskFactors.filter(f => f.severity === "critical").map(f => f.description).join("; ")}. The high value or strategic nature of this request necessitates executive review and approval.`
    };

    return rationales[recommendation];
  }

  /**
   * Generate alternative actions
   */
  private generateAlternativeActions(
    req: ApprovalRequest,
    recommendation: "approve" | "reject" | "exception" | "defer" | "escalate",
    riskFactors: Array<{ factor: string; severity: "critical" | "high" | "medium" | "low"; description: string }>
  ): Array<{ action: string; conditions: string[]; rationale: string }> {
    const alternatives: Array<{ action: string; conditions: string[]; rationale: string }> = [];

    if (recommendation !== "approve") {
      alternatives.push({
        action: "Approve with conditions",
        conditions: riskFactors.filter(f => f.severity !== "critical").map(f => f.description),
        rationale: "If the critical risk factors can be mitigated, approval with specific conditions is possible"
      });
    }

    if (recommendation === "defer") {
      alternatives.push({
        action: "Provide additional evidence",
        conditions: ["Submit additional supporting documentation", "Address specific information gaps"],
        rationale: "Completing the evidence package may enable standard approval"
      });
    }

    if (recommendation === "exception") {
      alternatives.push({
        action: "Escalate for exception approval",
        conditions: ["Identify authorized exception approver", "Document exception rationale"],
        rationale: "Exception approval path is available for authorized approvers"
      });
    }

    alternatives.push({
      action: "Return to requester",
      conditions: ["Provide additional context or documentation", "Reduce request scope if applicable"],
      rationale: "Returning for revision may address identified risk factors"
    });

    return alternatives;
  }

  /**
   * Create stakeholder summary
   */
  private createStakeholderSummary(
    req: ApprovalRequest,
    recommendation: "approve" | "reject" | "exception" | "defer" | "escalate",
    riskFactors: Array<{ factor: string; severity: "critical" | "high" | "medium" | "low"; description: string }>
  ): string {
    const highSeverity = riskFactors.filter(f => f.severity === "high" || f.severity === "critical");
    
    let summary = `${req.priority.toUpperCase()} priority ${req.category} request ${recommendation === "approve" ? "recommended for approval" : `requires ${recommendation}`}`;
    
    if (req.amount !== undefined) {
      summary += ` (${req.amount.toLocaleString()} ${req.currency ?? "USD"})`;
    }

    if (highSeverity.length > 0) {
      summary += `. Key considerations: ${highSeverity.map(f => f.factor.replace("_", " ")).join(", ")}`;
    }

    return summary;
  }

  /**
   * Create audit narrative for the recommendation
   */
  private createAuditNarrative(
    req: ApprovalRequest,
    recommendation: "approve" | "reject" | "exception" | "defer" | "escalate",
    riskFactors: Array<{ factor: string; severity: "critical" | "high" | "medium" | "low"; description: string }>,
    rationale: string
  ): string {
    const date = new Date().toISOString().split('T')[0];
    const riskSummary = riskFactors.map(f => `[${f.severity.toUpperCase()}] ${f.factor}: ${f.description}`).join("\n  ");

    return [
      `APPROVAL ANALYSIS REPORT`,
      `Date: ${date}`,
      `Request ID: ${req.id}`,
      `Category: ${req.category.toUpperCase()}`,
      `Priority: ${req.priority.toUpperCase()}`,
      `Requested At: ${req.requestedAt}`,
      ``,
      `RECOMMENDATION: ${recommendation.toUpperCase()}`,
      `Confidence: ${(this.calculateConfidence(req, riskFactors) * 100).toFixed(0)}%`,
      ``,
      `RATIONALE`,
      rationale,
      ``,
      `RISK FACTOR ANALYSIS`,
      `  ${riskSummary || "No significant risk factors identified"}`,
      ``,
      `EVIDENCE SUMMARY`,
      `Evidence Items: ${req.evidence?.length ?? 0}`,
      `Audit Trail Entries: ${req.auditTrail?.length ?? 0}`,
      `Exceptions: ${req.exceptions?.length ?? 0}`,
      ``,
      `This analysis was generated automatically and is subject to human review.`,
      `All approval decisions must comply withSegregation of Duties requirements.`
    ].join("\n");
  }

  /**
   * Collect supporting evidence for the recommendation
   */
  private collectSupportingEvidence(
    req: ApprovalRequest,
    request: ApprovalExplanationRequest
  ): string[] {
    const evidence: string[] = [];

    // Evidence from the request itself
    if (req.evidence && req.evidence.length > 0) {
      evidence.push(`${req.evidence.length} evidence items provided`);
      for (const e of req.evidence.slice(0, 3)) {
        evidence.push(`- ${e.type}: ${e.title} (confidence: ${e.confidence})`);
      }
    }

    // Historical precedent
    if (request.historicalApprovals && request.historicalApprovals.length > 0) {
      const sameCategory = request.historicalApprovals.filter(h => h.category === req.category);
      if (sameCategory.length > 0) {
        const approvalRate = (sameCategory.filter(h => h.decision === "approved").length / sameCategory.length * 100).toFixed(0);
        evidence.push(`Historical approval rate for ${req.category}: ${approvalRate}% (${sameCategory.length} requests)`);
      }
    }

    // Approver workload context
    if (request.approverWorkloads) {
      const workloads = Object.values(request.approverWorkloads);
      const avgUtilization = (workloads.reduce((sum, w) => sum + w.utilizationPercent, 0) / workloads.length).toFixed(0);
      evidence.push(`Average approver utilization: ${avgUtilization}%`);
    }

    return evidence;
  }
}

export const approvalExplainer = new ApprovalExplainer();
