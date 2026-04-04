/**
 * Variance and Anomaly Service
 * VAL-DEPT-FR-002: Forecast variance and anomaly workflows produce explainable follow-up actions
 * 
 * Explains material forecast movement or anomaly signals, prioritizes follow-up,
 * and captures lessons from misses or exceptions with reversible and reviewable actions.
 */

import type {
  ForecastVariance,
  FinancialAnomaly,
  VarianceFollowUpAction,
  AnomalyFollowUpAction,
  VarianceAnomalyState,
  DetectVarianceParams,
  ExplainVarianceParams,
  AssignVarianceFollowUpParams,
  UpdateVarianceFollowUpStatusParams,
  DetectAnomalyParams,
  ExplainAnomalyParams,
  MarkAnomalyFalsePositiveParams,
  AssignAnomalyFollowUpParams,
  UpdateAnomalyFollowUpStatusParams,
  VarianceStatus,
  AnomalyStatus,
  FollowUpReversibility,
} from "./types.js";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function calculateVarianceAmount(previous: number, current: number): number {
  return current - previous;
}

function calculateVariancePercentage(previous: number, current: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function determineVarianceSeverity(percentage: number, isMaterial: boolean): "critical" | "high" | "medium" | "low" {
  if (!isMaterial) return "low";
  if (Math.abs(percentage) > 50) return "critical";
  if (Math.abs(percentage) > 25) return "high";
  if (Math.abs(percentage) > 10) return "medium";
  return "low";
}

export class VarianceAnomalyService {
  private state: VarianceAnomalyState;

  constructor(initialState?: VarianceAnomalyState) {
    this.state = initialState ?? {
      variances: {},
      anomalies: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  // ============================================
  // Forecast Variance Management
  // ============================================

  /**
   * Detect a new forecast variance
   * VAL-DEPT-FR-002
   */
  detectVariance(params: DetectVarianceParams): ForecastVariance {
    const now = new Date().toISOString();
    const varianceAmount = calculateVarianceAmount(params.previousValue, params.currentValue);
    const variancePercentage = calculateVariancePercentage(params.previousValue, params.currentValue);
    const isMaterial = Math.abs(varianceAmount) >= params.materialityThreshold;

    const variance: ForecastVariance = {
      id: generateId(),
      title: params.title,
      description: params.description,
      varianceType: params.varianceType,
      previousValue: params.previousValue,
      currentValue: params.currentValue,
      varianceAmount,
      variancePercentage,
      driverCategories: [],
      primaryDriver: "other",
      driverExplanations: [],
      materialityThreshold: params.materialityThreshold,
      isMaterial,
      impactDescription: "",
      status: "detected",
      confidence: "medium",
      detectedAt: now,
      updatedAt: now,
      ownerRoleKey: params.ownerRoleKey,
      followUpActions: [],
      evidenceIds: [],
      lessonsLearned: [],
    };

    this.state.variances[variance.id] = variance;
    this.state.lastUpdated = now;

    return variance;
  }

  /**
   * Get a variance by ID
   */
  getVariance(varianceId: string): ForecastVariance | undefined {
    return this.state.variances[varianceId];
  }

  /**
   * Get all variances
   */
  getAllVariances(): ForecastVariance[] {
    return Object.values(this.state.variances);
  }

  /**
   * Get variances by status
   */
  getVariancesByStatus(status: VarianceStatus): ForecastVariance[] {
    return Object.values(this.state.variances).filter((v) => v.status === status);
  }

  /**
   * Get variances by owner
   */
  getVariancesByOwner(ownerRoleKey: string): ForecastVariance[] {
    return Object.values(this.state.variances).filter((v) => v.ownerRoleKey === ownerRoleKey);
  }

  /**
   * Get material variances
   */
  getMaterialVariances(): ForecastVariance[] {
    return Object.values(this.state.variances).filter((v) => v.isMaterial);
  }

  /**
   * Explain a variance with driver analysis
   * VAL-DEPT-FR-002
   */
  explainVariance(params: ExplainVarianceParams): ForecastVariance | undefined {
    const variance = this.state.variances[params.varianceId];
    if (!variance) return undefined;

    const now = new Date().toISOString();

    variance.status = "explained";
    variance.driverCategories = params.driverCategories;
    variance.primaryDriver = params.primaryDriver;
    variance.driverExplanations = params.driverExplanations;
    variance.isMaterial = params.isMaterial;
    variance.impactDescription = params.impactDescription;
    variance.explainedAt = now;

    if (params.lessonsLearned) {
      variance.lessonsLearned = params.lessonsLearned;
    }

    // Calculate overall confidence based on driver explanations
    if (params.driverExplanations.length > 0) {
      const avgConfidence = params.driverExplanations.reduce((sum, exp) => {
        const weights = { high: 1.0, medium: 0.6, low: 0.3 };
        return sum + weights[exp.confidence];
      }, 0) / params.driverExplanations.length;
      variance.confidence = avgConfidence >= 0.7 ? "high" : avgConfidence >= 0.4 ? "medium" : "low";
    }

    variance.updatedAt = now;
    this.state.lastUpdated = now;

    return variance;
  }

  /**
   * Assign a follow-up action to a variance
   * VAL-DEPT-FR-002
   */
  assignVarianceFollowUp(params: AssignVarianceFollowUpParams): ForecastVariance | undefined {
    const variance = this.state.variances[params.varianceId];
    if (!variance) return undefined;

    const now = new Date().toISOString();

    const followUp: VarianceFollowUpAction = {
      id: generateId(),
      title: params.title,
      description: params.description,
      status: "proposed",
      priority: params.priority,
      ownerRoleKey: params.ownerRoleKey,
      createdAt: now,
      updatedAt: now,
      dueDate: params.dueDate,
      reversibility: params.reversibility,
      rollbackProcedure: params.rollbackProcedure,
      verificationCriteria: params.verificationCriteria,
      linkedToRequestId: params.linkedToRequestId,
      completionNotes: [],
    };

    variance.followUpActions.push(followUp);
    variance.status = "action-assigned";
    variance.updatedAt = now;
    this.state.lastUpdated = now;

    return variance;
  }

  /**
   * Update variance follow-up status
   * VAL-DEPT-FR-002
   */
  updateVarianceFollowUpStatus(params: UpdateVarianceFollowUpStatusParams): ForecastVariance | undefined {
    const variance = this.state.variances[params.varianceId];
    if (!variance) return undefined;

    const followUp = variance.followUpActions.find((f) => f.id === params.followUpId);
    if (!followUp) return undefined;

    const now = new Date().toISOString();
    followUp.status = params.status;
    followUp.updatedAt = now;

    if (params.status === "completed") {
      followUp.completedAt = now;
      if (params.completionNotes) {
        followUp.completionNotes = params.completionNotes;
      }
    }

    // Check if all follow-ups are completed
    const openFollowUps = variance.followUpActions.filter(
      (f) => !["completed", "cancelled", "superseded"].includes(f.status)
    );
    if (openFollowUps.length === 0) {
      variance.status = "resolved";
      variance.resolvedAt = now;
    }

    variance.updatedAt = now;
    this.state.lastUpdated = now;

    return variance;
  }

  /**
   * Resolve a variance (mark as resolved manually)
   */
  resolveVariance(varianceId: string): ForecastVariance | undefined {
    const variance = this.state.variances[varianceId];
    if (!variance) return undefined;

    const now = new Date().toISOString();
    variance.status = "resolved";
    variance.resolvedAt = now;
    variance.updatedAt = now;
    this.state.lastUpdated = now;

    return variance;
  }

  /**
   * Dismiss a variance (mark as dismissed - not a real issue)
   */
  dismissVariance(varianceId: string, reason: string): ForecastVariance | undefined {
    const variance = this.state.variances[varianceId];
    if (!variance) return undefined;

    const now = new Date().toISOString();
    variance.status = "dismissed";
    variance.resolvedAt = now;
    if (!variance.lessonsLearned) {
      variance.lessonsLearned = [];
    }
    variance.lessonsLearned.push(`Dismissed: ${reason}`);
    variance.updatedAt = now;
    this.state.lastUpdated = now;

    return variance;
  }

  // ============================================
  // Financial Anomaly Management
  // ============================================

  /**
   * Detect a new financial anomaly
   * VAL-DEPT-FR-002
   */
  detectAnomaly(params: DetectAnomalyParams): FinancialAnomaly {
    const now = new Date().toISOString();
    const deviationAmount = params.detectedValue - params.expectedValue;
    const deviationPercentage = params.expectedValue !== 0 
      ? ((params.detectedValue - params.expectedValue) / Math.abs(params.expectedValue)) * 100 
      : 0;

    const anomaly: FinancialAnomaly = {
      id: generateId(),
      title: params.title,
      description: params.description,
      category: params.category,
      severity: "medium",
      detectedValue: params.detectedValue,
      expectedValue: params.expectedValue,
      deviationAmount,
      deviationPercentage,
      possibleCauses: [],
      primaryCause: undefined,
      explanation: undefined,
      confidence: "medium",
      status: "detected",
      detectedAt: now,
      updatedAt: now,
      ownerRoleKey: params.ownerRoleKey,
      followUpActions: [],
      evidenceIds: [],
      relatedVarianceIds: [],
      relatedRequestIds: [],
    };

    this.state.anomalies[anomaly.id] = anomaly;
    this.state.lastUpdated = now;

    return anomaly;
  }

  /**
   * Get an anomaly by ID
   */
  getAnomaly(anomalyId: string): FinancialAnomaly | undefined {
    return this.state.anomalies[anomalyId];
  }

  /**
   * Get all anomalies
   */
  getAllAnomalies(): FinancialAnomaly[] {
    return Object.values(this.state.anomalies);
  }

  /**
   * Get anomalies by status
   */
  getAnomaliesByStatus(status: AnomalyStatus): FinancialAnomaly[] {
    return Object.values(this.state.anomalies).filter((a) => a.status === status);
  }

  /**
   * Get anomalies by owner
   */
  getAnomaliesByOwner(ownerRoleKey: string): FinancialAnomaly[] {
    return Object.values(this.state.anomalies).filter((a) => a.ownerRoleKey === ownerRoleKey);
  }

  /**
   * Get anomalies by severity
   */
  getAnomaliesBySeverity(severity: "critical" | "high" | "medium" | "low"): FinancialAnomaly[] {
    return Object.values(this.state.anomalies).filter((a) => a.severity === severity);
  }

  /**
   * Get critical/high severity anomalies
   */
  getUrgentAnomalies(): FinancialAnomaly[] {
    return Object.values(this.state.anomalies).filter(
      (a) => (a.severity === "critical" || a.severity === "high") && 
              !["resolved", "false-positive", "dismissed"].includes(a.status)
    );
  }

  /**
   * Explain an anomaly with cause analysis
   * VAL-DEPT-FR-002
   */
  explainAnomaly(params: ExplainAnomalyParams): FinancialAnomaly | undefined {
    const anomaly = this.state.anomalies[params.anomalyId];
    if (!anomaly) return undefined;

    const now = new Date().toISOString();

    anomaly.possibleCauses = params.possibleCauses.map((cause) => ({
      ...cause,
    }));

    if (params.primaryCauseDescription) {
      anomaly.primaryCause = anomaly.possibleCauses.find(
        (c) => c.description === params.primaryCauseDescription
      );
    }

    if (params.explanation) {
      anomaly.explanation = params.explanation;
    }

    // Calculate overall confidence
    if (anomaly.possibleCauses.length > 0) {
      let confidenceScore = 0;
      for (const cause of anomaly.possibleCauses) {
        if (cause.likelihood === "confirmed") confidenceScore += 1.0;
        else if (cause.likelihood === "likely") confidenceScore += 0.7;
        else if (cause.likelihood === "possible") confidenceScore += 0.4;
        else confidenceScore += 0.1;
      }
      confidenceScore /= anomaly.possibleCauses.length;
      anomaly.confidence = confidenceScore >= 0.7 ? "high" : confidenceScore >= 0.4 ? "medium" : "low";
    }

    anomaly.status = "explained";
    anomaly.explainedAt = now;
    anomaly.updatedAt = now;
    this.state.lastUpdated = now;

    return anomaly;
  }

  /**
   * Mark an anomaly as false positive
   * VAL-DEPT-FR-002
   */
  markFalsePositive(params: MarkAnomalyFalsePositiveParams): FinancialAnomaly | undefined {
    const anomaly = this.state.anomalies[params.anomalyId];
    if (!anomaly) return undefined;

    const now = new Date().toISOString();
    anomaly.status = "false-positive";
    anomaly.falsePositiveReason = params.reason;
    anomaly.markedFalsePositiveByRoleKey = params.markedByRoleKey;
    anomaly.markedFalsePositiveAt = now;
    anomaly.resolvedAt = now;
    anomaly.updatedAt = now;
    this.state.lastUpdated = now;

    return anomaly;
  }

  /**
   * Assign a follow-up action to an anomaly
   * VAL-DEPT-FR-002
   */
  assignAnomalyFollowUp(params: AssignAnomalyFollowUpParams): FinancialAnomaly | undefined {
    const anomaly = this.state.anomalies[params.anomalyId];
    if (!anomaly) return undefined;

    const now = new Date().toISOString();

    const followUp: AnomalyFollowUpAction = {
      id: generateId(),
      title: params.title,
      description: params.description,
      status: "proposed",
      priority: params.priority,
      ownerRoleKey: params.ownerRoleKey,
      createdAt: now,
      updatedAt: now,
      dueDate: params.dueDate,
      reversibility: params.reversibility,
      rollbackProcedure: params.rollbackProcedure,
      verificationCriteria: params.verificationCriteria,
      linkedToRequestId: params.linkedToRequestId,
      completionNotes: [],
    };

    anomaly.followUpActions.push(followUp);
    anomaly.status = "follow-up-assigned";
    anomaly.updatedAt = now;
    this.state.lastUpdated = now;

    return anomaly;
  }

  /**
   * Update anomaly follow-up status
   * VAL-DEPT-FR-002
   */
  updateAnomalyFollowUpStatus(params: UpdateAnomalyFollowUpStatusParams): FinancialAnomaly | undefined {
    const anomaly = this.state.anomalies[params.anomalyId];
    if (!anomaly) return undefined;

    const followUp = anomaly.followUpActions.find((f) => f.id === params.followUpId);
    if (!followUp) return undefined;

    const now = new Date().toISOString();
    followUp.status = params.status;
    followUp.updatedAt = now;

    if (params.status === "completed") {
      followUp.completedAt = now;
      if (params.completionNotes) {
        followUp.completionNotes = params.completionNotes;
      }
    }

    // Check if all follow-ups are completed
    const openFollowUps = anomaly.followUpActions.filter(
      (f) => !["completed", "cancelled", "superseded"].includes(f.status)
    );
    if (openFollowUps.length === 0) {
      anomaly.status = "resolved";
      anomaly.resolvedAt = now;
    }

    anomaly.updatedAt = now;
    this.state.lastUpdated = now;

    return anomaly;
  }

  /**
   * Resolve an anomaly (mark as resolved manually)
   */
  resolveAnomaly(anomalyId: string): FinancialAnomaly | undefined {
    const anomaly = this.state.anomalies[anomalyId];
    if (!anomaly) return undefined;

    const now = new Date().toISOString();
    anomaly.status = "resolved";
    anomaly.resolvedAt = now;
    anomaly.updatedAt = now;
    this.state.lastUpdated = now;

    return anomaly;
  }

  // ============================================
  // Linkage Management
  // ============================================

  /**
   * Link an anomaly to a variance
   */
  linkAnomalyToVariance(anomalyId: string, varianceId: string): boolean {
    const anomaly = this.state.anomalies[anomalyId];
    const variance = this.state.variances[varianceId];
    if (!anomaly || !variance) return false;

    if (!anomaly.relatedVarianceIds.includes(varianceId)) {
      anomaly.relatedVarianceIds.push(varianceId);
    }
    if (!variance.evidenceIds.includes(anomalyId)) {
      variance.evidenceIds.push(anomalyId);
    }

    this.state.lastUpdated = new Date().toISOString();
    return true;
  }

  /**
   * Link an anomaly to an approval request
   */
  linkAnomalyToRequest(anomalyId: string, requestId: string): boolean {
    const anomaly = this.state.anomalies[anomalyId];
    if (!anomaly) return false;

    if (!anomaly.relatedRequestIds.includes(requestId)) {
      anomaly.relatedRequestIds.push(requestId);
    }

    this.state.lastUpdated = new Date().toISOString();
    return true;
  }

  // ============================================
  // Reporting
  // ============================================

  /**
   * Generate variance summary
   */
  generateVarianceSummary(): {
    totalVariances: number;
    byStatus: Record<VarianceStatus, number>;
    materialVariances: number;
    openFollowUps: number;
    averageVariancePercentage: number;
  } {
    const variances = Object.values(this.state.variances);
    
    const byStatus: Record<VarianceStatus, number> = {
      detected: 0,
      analyzing: 0,
      explained: 0,
      "action-assigned": 0,
      resolved: 0,
      dismissed: 0,
    };

    let totalPercentage = 0;
    let materialCount = 0;
    let openFollowUps = 0;

    for (const v of variances) {
      byStatus[v.status]++;
      totalPercentage += Math.abs(v.variancePercentage);
      if (v.isMaterial) materialCount++;
      openFollowUps += v.followUpActions.filter(
        (f) => !["completed", "cancelled", "superseded"].includes(f.status)
      ).length;
    }

    return {
      totalVariances: variances.length,
      byStatus,
      materialVariances: materialCount,
      openFollowUps,
      averageVariancePercentage: variances.length > 0 ? totalPercentage / variances.length : 0,
    };
  }

  /**
   * Generate anomaly summary
   */
  generateAnomalySummary(): {
    totalAnomalies: number;
    byStatus: Record<AnomalyStatus, number>;
    bySeverity: Record<string, number>;
    urgentAnomalies: number;
    openFollowUps: number;
    falsePositives: number;
  } {
    const anomalies = Object.values(this.state.anomalies);
    
    const byStatus: Record<AnomalyStatus, number> = {
      detected: 0,
      triaging: 0,
      explained: 0,
      "follow-up-assigned": 0,
      resolved: 0,
      "false-positive": 0,
    };

    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    let urgentCount = 0;
    let openFollowUps = 0;
    let falsePositives = 0;

    for (const a of anomalies) {
      byStatus[a.status]++;
      bySeverity[a.severity]++;
      if (a.severity === "critical" || a.severity === "high") {
        urgentCount++;
      }
      openFollowUps += a.followUpActions.filter(
        (f) => !["completed", "cancelled", "superseded"].includes(f.status)
      ).length;
      if (a.status === "false-positive") {
        falsePositives++;
      }
    }

    return {
      totalAnomalies: anomalies.length,
      byStatus,
      bySeverity,
      urgentAnomalies: urgentCount,
      openFollowUps,
      falsePositives,
    };
  }

  /**
   * Get current state for persistence
   */
  getState(): VarianceAnomalyState {
    return this.state;
  }

  /**
   * Load state from persistence
   */
  loadState(state: VarianceAnomalyState): void {
    this.state = state;
  }
}
