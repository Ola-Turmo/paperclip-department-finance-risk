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

// ============================================
// Connector Health Types (XAF-007)
// ============================================

export type ConnectorHealthStatus = "ok" | "degraded" | "error" | "unknown";

export interface ConnectorHealthState {
  toolkitId: string;
  status: ConnectorHealthStatus;
  lastChecked: string;
  error?: string;
  limitationMessage?: string;
}

export interface ToolkitLimitation {
  toolkitId: string;
  displayName: string;
  limitationMessage: string;
  severity: "critical" | "high" | "medium" | "low";
  affectedWorkflows: string[];
  suggestedAction: string;
}

export interface ConnectorHealthSummary {
  overallStatus: ConnectorHealthStatus;
  checkedAt: string;
  connectors: ConnectorHealthState[];
  limitations: ToolkitLimitation[];
  hasLimitations: boolean;
}

export interface SetConnectorHealthParams {
  toolkitId: string;
  status: ConnectorHealthStatus;
  error?: string;
}

export interface GetConnectorHealthParams {
  toolkitId?: string;
}

// ============================================
// Approval Intelligence Types (VAL-DEPT-FR-001)
// ============================================

export interface ApprovalIntelligenceState {
  pendingRequests: TrackedApprovalRequest[];
  historicalApprovals: HistoricalApproval[];
  approverCapacity: Record<string, ApproverCapacity>;
}

export interface TrackedApprovalRequest {
  requestId: string;
  category: ApprovalCategory;
  priority: ApprovalPriority;
  amount?: number;
  currency?: string;
  approverRoleKeys: string[];
  slaDeadlineHours: number;
  requestedAt: string;
  riskScore?: number;
}

export interface HistoricalApproval {
  requestId: string;
  approverRoleKey: string;
  decision: "approved" | "rejected" | "exception" | "delegated";
  decidedAt: string;
  durationHours: number;
}

export interface ApproverCapacity {
  pendingCount: number;
  avgApprovalTimeHours: number;
  utilizationPercent: number;
  recentApprovals?: number;
}

export interface ApprovalRecommendation {
  requestId: string;
  suggestedApprover: string;
  confidence: number;
  reasoning: string;
  riskContext: ApprovalRiskContext;
  priorityFactors: string[];
}

export interface ApprovalRiskContext {
  riskScore: number;
  isHighValue: boolean;
  controlBoundaryLevel: ControlBoundaryLevel;
  requiresSecondApproval: boolean;
  segregationRisk: boolean;
  exceptionCount: number;
  urgencyLevel: ApprovalPriority;
}

export interface DelegationSuggestion {
  fromRoleKey: string;
  suggestedDelegate: string;
  confidence: number;
  reasoning: string;
  urgency: ApprovalPriority;
  estimatedTimeSavedHours?: number;
}

export interface BottleneckPrediction {
  approverRoleKey: string;
  currentLoad: number;
  predictedDelayHours: number;
  slaAtRisk: boolean;
  pendingRequestCount: number;
  reason: string;
}

export interface PipelineAnalytics {
  totalPending: number;
  avgTimeInQueueHours: number;
  approvalRate: number;
  topBottlenecks: Array<{
    approverRoleKey: string;
    loadPercent: number;
    pendingCount: number;
  }>;
  categoryBreakdown: Record<ApprovalCategory, number>;
  priorityBreakdown: Record<ApprovalPriority, number>;
}

// ============================================
// Statistical Anomaly Detection Types (VAL-DEPT-FR-002)
// Phase 1: Anomaly Engine - Time-series anomaly detection with pure statistics
// ============================================

export type StatisticalMethod = "zscore" | "iqr" | "ensemble";
export type TimeSeriesPoint = { timestamp: string; value: number };

export interface StatisticalAnomalyDetectionParams {
  method: StatisticalMethod;
  threshold?: number;
  multiplier?: number;
  windowSize?: number;
  period?: number;
  minDataPoints?: number;
}

export interface StatisticalAnomalyResult {
  id: string;
  detectedAt: string;
  method: StatisticalMethod;
  anomalies: StatisticalAnomalyMarker[];
  statistics: StatisticalStatistics;
  explanation: string;
  insufficientData: boolean;
  timeSeriesData?: TimeSeriesPoint[];
  seasonalProfile?: Record<number, { mean: number; stdDev: number; count: number }>;
}

export interface StatisticalAnomalyMarker {
  index: number;
  value: number;
  timestamp?: string;
  severityScore: number;
  zScore?: number;
  deviationFromExpected?: number;
  methods: string[];
  votes?: number;
}

export interface StatisticalStatistics {
  mean: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  count: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  volatilityRatio?: number;
}

export interface VolatilityThreshold {
  mean: number;
  upper: number;
  lower: number;
  stdDev: number;
  volatilityRatio: number;
}

export interface RollingStats {
  values: (number | null)[];
  windowSize: number;
  timestamps?: string[];
}

export interface CrossoverSignal {
  index: number;
  type: "bullish" | "bearish";
  shortMA: number;
  longMA: number;
}

export interface ForecastResult {
  forecast: number[];
  periods: number;
  method: string;
  confidence?: number;
}

// Action Parameters - Statistical Anomaly Detection

export interface DetectStatisticalAnomalyParams {
  title: string;
  description: string;
  dataPoints: Array<{ timestamp: string; value: number }>;
  method: StatisticalMethod;
  threshold?: number;
  multiplier?: number;
  windowSize?: number;
  period?: number;
  seasonalityEnabled?: boolean;
  volatilityAdjusted?: boolean;
  ownerRoleKey?: string;
}

export interface GetStatisticalAnomalyParams {
  anomalyId: string;
}

export interface AnalyzeTimeSeriesParams {
  dataPoints: Array<{ timestamp: string; value: number }>;
  windowSize?: number;
  detectCrossovers?: boolean;
  shortWindow?: number;
  longWindow?: number;
}

// ============================================
// Continuous Controls Monitoring Types (VAL-DEPT-FR-001)
// ============================================

export type ControlHealthStatus = "healthy" | "degraded" | "failing" | "unknown";

export interface ControlHealth {
  controlId: string;
  controlName?: string;
  description?: string;
  status: ControlHealthStatus;
  lastChecked: string;
  consecutiveFailures: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  threshold: {
    minSuccessRate: number;
    maxConsecutiveFailures: number;
  };
}

export interface ControlException {
  id: string;
  controlId: string;
  type: "evidence-gap" | "segregation-violation" | "sla-breach" | "policy-conflict" | "scope-exceeded" | "approval-violation" | "other";
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  reportedAt: string;
  reportedByRoleKey?: string;
  ownerRoleKey?: string;
  dueDate?: string;
  slaDays?: number;
  isBreached: boolean;
  disposition: "pending" | "accepted" | "waived" | "escalated" | "rejected";
  resolution?: string;
  resolvedAt?: string;
  resolvedByRoleKey?: string;
  completionNotes?: string[];
  linkedToRequestId?: string;
}

export interface ControlExecution {
  id: string;
  controlId: string;
  executedAt: string;
  success: boolean;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ControlEffectivenessMetrics {
  controlId: string;
  periodStart: string;
  periodEnd: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  exceptionCount: number;
  effectivenessRate: number;
  exceptionRate: number;
}

export interface ControlHealthSummary {
  generatedAt: string;
  totalControls: number;
  healthyCount: number;
  degradedCount: number;
  failingCount: number;
  unknownCount: number;
  overallHealthStatus: ControlHealthStatus;
  pendingExceptions: number;
  breachedExceptions: number;
  resolvedExceptions: number;
  averageEffectivenessRate: number;
}

export interface ControlFailurePattern {
  controlId: string;
  failures: Array<{
    date: string;
    type: string;
    exceptionId?: string;
  }>;
  isRecurring: boolean;
  recurrencePattern?: string;
  failureCount: number;
  suggestedAction?: string;
}

export interface ControlsMonitoringState {
  controls: Record<string, ControlHealth>;
  exceptions: Record<string, ControlException>;
  executions: Record<string, ControlExecution>;
  lastUpdated: string;
}

// Action Parameters - Controls Monitoring

export interface RecordControlExecutionParams {
  controlId: string;
  success: boolean;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface RecordControlExceptionParams {
  controlId: string;
  type: ControlException["type"];
  description: string;
  severity: ControlException["severity"];
  reportedByRoleKey?: string;
  ownerRoleKey?: string;
  dueDate?: string;
  slaDays?: number;
  linkedToRequestId?: string;
}

export interface ResolveControlExceptionParams {
  exceptionId: string;
  resolution: string;
  disposition: ControlException["disposition"];
  resolvedByRoleKey: string;
  completionNotes?: string[];
}

export interface GetControlHealthParams {
  controlId: string;
}

export interface GetControlExceptionsParams {
  controlId?: string;
  disposition?: ControlException["disposition"];
  severity?: ControlException["severity"];
}

export interface GetControlEffectivenessParams {
  controlId: string;
  periodDays?: number;
}
