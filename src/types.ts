/**
 * Finance Risk Department Types
 * VAL-DEPT-FR-001: Approval routing preserves evidence, traceability, and control boundaries
 * VAL-DEPT-FR-002: Forecast variance and anomaly workflows produce explainable follow-up actions
 */

// ============================================
// Approval Routing Types (VAL-DEPT-FR-001)
// ============================================

export type ApprovalStatus = "pending" | "in-review" | "approved" | "rejected" | "exception" | "cancelled";
export type ApprovalPriority = "critical" | "high" | "medium" | "low";
export type ApprovalCategory = "expense" | "purchase" | "budget" | "contract" | "refund" | "adjustment" | "other";
export type ControlBoundaryLevel = "standard" | "elevated" | "restricted" | "prohibited";
export type SegregationDutyRole = "requester" | "reviewer" | "approver" | "executor" | "auditor";

export interface ApprovalEvidence {
  id: string;
  type: "document" | "calculation" | "receipt" | "invoice" | "contract" | "policy" | "justification" | "other";
  title: string;
  description: string;
  sourceUrl?: string;
  collectedAt: string;
  confidence: "high" | "medium" | "low";
  collectedByRoleKey?: string;
}

export interface ControlBoundary {
  level: ControlBoundaryLevel;
  description: string;
  requiresSecondApproval: boolean;
  escalationRequired: boolean;
  blockedRoles: SegregationDutyRole[];
}

export interface ApprovalRoute {
  id: string;
  name: string;
  category: ApprovalCategory;
  description: string;
  requiredApproverRoleKeys: string[];
  minimumApprovals: number;
  controlBoundary: ControlBoundary;
  evidenceRequirements: ApprovalEvidence["type"][];
  slaBusinessDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequest {
  id: string;
  routeId: string;
  title: string;
  description: string;
  category: ApprovalCategory;
  priority: ApprovalPriority;
  status: ApprovalStatus;
  requesterRoleKey: string;
  requestedAt: string;
  updatedAt: string;
  
  // Amount/value if applicable
  amount?: number;
  currency?: string;
  
  // Evidence package
  evidence: ApprovalEvidence[];
  
  // Approval chain with segregation-of-duties tracking
  approvalChain: ApprovalChainEntry[];
  
  // Final disposition
  disposition: ApprovalDisposition;
  
  // Exception handling
  exceptions: ApprovalException[];
  
  // Audit trail
  auditTrail: ApprovalAuditEntry[];
  
  // Links to related requests
  relatedRequestIds: string[];
}

export interface ApprovalChainEntry {
  id: string;
  approverRoleKey: string;
  status: "pending" | "approved" | "rejected" | "skipped" | "delegated" | "exception";
  decision?: ApprovalDecision;
  decisionRationale?: string;
  decidedAt?: string;
  delegatedToRoleKey?: string;
  delegatedAt?: string;
  evidenceContributed?: ApprovalEvidence[];
}

export interface ApprovalDecision {
  decision: "approved" | "rejected" | "exception" | "delegated";
  rationale: string;
  conditions?: string[];
}

export interface ApprovalDisposition {
  status: "approved" | "rejected" | "exception" | "cancelled";
  summary: string;
  decidedByRoleKey?: string;
  decidedAt?: string;
  conditions?: string[];
  followUpRequired?: boolean;
}

export interface ApprovalException {
  id: string;
  type: "segregation-violation" | "sla-breach" | "evidence-gap" | "policy-conflict" | "scope-exceeded";
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  reportedAt: string;
  reportedByRoleKey?: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedByRoleKey?: string;
  disposition?: "accepted" | "waived" | "escalated" | "rejected";
}

export interface ApprovalAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  performedByRoleKey?: string;
  details: string;
  previousValue?: string;
  newValue?: string;
}

// ============================================
// Variance and Anomaly Types (VAL-DEPT-FR-002)
// ============================================

export type VarianceStatus = "detected" | "analyzing" | "explained" | "action-assigned" | "resolved" | "dismissed";
export type AnomalyStatus = "detected" | "triaging" | "explained" | "follow-up-assigned" | "resolved" | "false-positive";
export type VarianceSeverity = "critical" | "high" | "medium" | "low";
export type VarianceDriverCategory = "volume" | "price" | "mix" | "timing" | "currency" | "one-time" | "model-error" | "other";
export type AnomalyCategory = "spending-spike" | "revenue-dip" | "pattern-break" | "correlation-shift" | "forecast-miss" | "budget-overrun" | "anomaly-detection" | "other";
export type FollowUpActionStatus = "proposed" | "assigned" | "in-progress" | "completed" | "cancelled" | "superseded";
export type FollowUpReversibility = "fully-reversible" | "partially-reversible" | "not-reversible";

export interface ForecastVariance {
  id: string;
  title: string;
  description: string;
  
  // Variance details
  varianceType: "forecast" | "budget" | "actual";
  previousValue: number;
  currentValue: number;
  varianceAmount: number;
  variancePercentage: number;
  
  // Driver analysis
  driverCategories: VarianceDriverCategory[];
  primaryDriver: VarianceDriverCategory;
  driverExplanations: VarianceDriverExplanation[];
  
  // Impact assessment
  materialityThreshold: number;
  isMaterial: boolean;
  impactDescription: string;
  
  // Status tracking
  status: VarianceStatus;
  confidence: "high" | "medium" | "low";
  
  // Timeline
  detectedAt: string;
  updatedAt: string;
  explainedAt?: string;
  resolvedAt?: string;
  
  // Ownership
  ownerRoleKey?: string;
  
  // Follow-up
  followUpActions: VarianceFollowUpAction[];
  
  // Evidence
  evidenceIds: string[];
  
  // Lessons learned
  lessonsLearned?: string[];
}

export interface VarianceDriverExplanation {
  category: VarianceDriverCategory;
  explanation: string;
  quantifiedImpact: number;
  confidence: "high" | "medium" | "low";
  source?: string;
}

export interface FinancialAnomaly {
  id: string;
  title: string;
  description: string;
  
  // Anomaly details
  category: AnomalyCategory;
  severity: VarianceSeverity;
  
  // Signal detection
  detectedValue: number;
  expectedValue: number;
  deviationAmount: number;
  deviationPercentage: number;
  
  // Analysis
  possibleCauses: AnomalyCause[];
  primaryCause?: AnomalyCause;
  explanation?: string;
  confidence: "high" | "medium" | "low";
  
  // Status tracking
  status: AnomalyStatus;
  
  // Timeline
  detectedAt: string;
  updatedAt: string;
  triagedAt?: string;
  explainedAt?: string;
  resolvedAt?: string;
  
  // Ownership
  ownerRoleKey?: string;
  
  // Follow-up
  followUpActions: AnomalyFollowUpAction[];
  
  // Evidence
  evidenceIds: string[];
  
  // Related items
  relatedVarianceIds: string[];
  relatedRequestIds: string[];
  
  // False positive tracking
  falsePositiveReason?: string;
  markedFalsePositiveByRoleKey?: string;
  markedFalsePositiveAt?: string;
}

export interface AnomalyCause {
  description: string;
  likelihood: "confirmed" | "likely" | "possible" | "unlikely";
  quantifiedImpact?: number;
  requiresInvestigation: boolean;
  investigationNotes?: string;
}

export interface VarianceFollowUpAction {
  id: string;
  title: string;
  description: string;
  status: FollowUpActionStatus;
  priority: "critical" | "high" | "medium" | "low";
  ownerRoleKey?: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  completedAt?: string;
  reversibility: FollowUpReversibility;
  rollbackProcedure?: string;
  verificationCriteria?: string;
  completionNotes?: string[];
  linkedToRequestId?: string;
}

export interface AnomalyFollowUpAction {
  id: string;
  title: string;
  description: string;
  status: FollowUpActionStatus;
  priority: "critical" | "high" | "medium" | "low";
  ownerRoleKey?: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  completedAt?: string;
  reversibility: FollowUpReversibility;
  rollbackProcedure?: string;
  verificationCriteria?: string;
  completionNotes?: string[];
  linkedToRequestId?: string;
}

// ============================================
// Service State Types
// ============================================

export interface ApprovalWorkflowState {
  routes: Record<string, ApprovalRoute>;
  requests: Record<string, ApprovalRequest>;
  lastUpdated: string;
}

export interface VarianceAnomalyState {
  variances: Record<string, ForecastVariance>;
  anomalies: Record<string, FinancialAnomaly>;
  lastUpdated: string;
}

export interface FinanceRiskWorkflowState extends ApprovalWorkflowState, VarianceAnomalyState {}

// ============================================
// Action Parameters - Approval Routing (VAL-DEPT-FR-001)
// ============================================

export interface CreateApprovalRouteParams {
  name: string;
  category: ApprovalCategory;
  description: string;
  requiredApproverRoleKeys: string[];
  minimumApprovals: number;
  controlBoundary: ControlBoundary;
  evidenceRequirements: ApprovalEvidence["type"][];
  slaBusinessDays: number;
}

export interface CreateApprovalRequestParams {
  routeId: string;
  title: string;
  description: string;
  category: ApprovalCategory;
  priority?: ApprovalPriority;
  requesterRoleKey: string;
  amount?: number;
  currency?: string;
  evidence?: Omit<ApprovalEvidence, "id" | "collectedAt">[];
  relatedRequestIds?: string[];
}

export interface SubmitApprovalDecisionParams {
  requestId: string;
  approverRoleKey: string;
  decision: ApprovalDecision;
}

export interface DelegateApprovalParams {
  requestId: string;
  approverRoleKey: string;
  delegateToRoleKey: string;
  rationale: string;
}

export interface ReportApprovalExceptionParams {
  requestId: string;
  type: ApprovalException["type"];
  description: string;
  severity: ApprovalException["severity"];
  reportedByRoleKey?: string;
}

export interface ResolveApprovalExceptionParams {
  requestId: string;
  exceptionId: string;
  resolution: string;
  disposition: ApprovalException["disposition"];
  resolvedByRoleKey: string;
}

export interface CancelApprovalRequestParams {
  requestId: string;
  cancelledByRoleKey: string;
  reason: string;
}

export interface AddApprovalEvidenceParams {
  requestId: string;
  evidence: Omit<ApprovalEvidence, "id" | "collectedAt">;
}

// ============================================
// Action Parameters - Variance and Anomaly (VAL-DEPT-FR-002)
// ============================================

export interface DetectVarianceParams {
  title: string;
  description: string;
  varianceType: ForecastVariance["varianceType"];
  previousValue: number;
  currentValue: number;
  materialityThreshold: number;
  ownerRoleKey?: string;
}

export interface ExplainVarianceParams {
  varianceId: string;
  driverCategories: VarianceDriverCategory[];
  primaryDriver: VarianceDriverCategory;
  driverExplanations: Array<{
    category: VarianceDriverCategory;
    explanation: string;
    quantifiedImpact: number;
    confidence: "high" | "medium" | "low";
    source?: string;
  }>;
  isMaterial: boolean;
  impactDescription: string;
  lessonsLearned?: string[];
}

export interface AssignVarianceFollowUpParams {
  varianceId: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  ownerRoleKey?: string;
  dueDate?: string;
  reversibility: FollowUpReversibility;
  rollbackProcedure?: string;
  verificationCriteria?: string;
  linkedToRequestId?: string;
}

export interface UpdateVarianceFollowUpStatusParams {
  varianceId: string;
  followUpId: string;
  status: FollowUpActionStatus;
  completionNotes?: string[];
}

export interface DetectAnomalyParams {
  title: string;
  description: string;
  category: AnomalyCategory;
  detectedValue: number;
  expectedValue: number;
  ownerRoleKey?: string;
}

export interface ExplainAnomalyParams {
  anomalyId: string;
  possibleCauses: Array<{
    description: string;
    likelihood: AnomalyCause["likelihood"];
    quantifiedImpact?: number;
    requiresInvestigation: boolean;
    investigationNotes?: string;
  }>;
  primaryCauseDescription?: string;
  explanation?: string;
}

export interface MarkAnomalyFalsePositiveParams {
  anomalyId: string;
  reason: string;
  markedByRoleKey: string;
}

export interface AssignAnomalyFollowUpParams {
  anomalyId: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  ownerRoleKey?: string;
  dueDate?: string;
  reversibility: FollowUpReversibility;
  rollbackProcedure?: string;
  verificationCriteria?: string;
  linkedToRequestId?: string;
}

export interface UpdateAnomalyFollowUpStatusParams {
  anomalyId: string;
  followUpId: string;
  status: FollowUpActionStatus;
  completionNotes?: string[];
}
