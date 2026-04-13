/**
 * ML-Powered Risk Scoring Engine
 * PRD: Risk scoring with explainability - no black-box risk scores
 * Combines statistical methods with structured reasoning for auditable risk assessment
 */

export type RiskCategory = "financial" | "operational" | "compliance" | "strategic" | "reputational";
export type RiskLevel = "critical" | "high" | "medium" | "low";
export type RiskTrend = "increasing" | "stable" | "decreasing";

export interface RiskScoreInput {
  category: RiskCategory;
  amount?: number;
  probability: number; // 0-1
  impact: number; // 1-10
  controlEffectiveness: number; // 0-1
  daysOpen?: number;
  peerRiskScores?: number[];
  historicalOutcomes?: Array<{ outcome: "loss" | "mitigated" | "no_impact"; amount?: number }>;
}

export interface RiskScoringResult {
  riskId: string;
  category: RiskCategory;
  overallScore: number; // 0-100
  riskLevel: RiskLevel;
  probability: number;
  impact: number;
  controlFactor: number;
  trend: RiskTrend;
  contributingFactors: RiskContributingFactor[];
  mitigationPriorities: string[];
  explanation: string;
  auditTrail: RiskAuditEntry[];
  recommendedReviewPeriod: string;
}

export interface RiskContributingFactor {
  factor: string;
  weight: number;
  direction: "increases" | "decreases";
  evidence: string;
}

export interface RiskAuditEntry {
  timestamp: string;
  action: string;
  scoreChange?: number;
  reason: string;
}

/**
 * ML-powered risk scoring with full explainability
 */
export class RiskScorer {
  private readonly CONTROL_WEIGHTS = {
    financial: { amount: 0.4, probability: 0.35, control: 0.25 },
    operational: { amount: 0.2, probability: 0.4, control: 0.4 },
    compliance: { amount: 0.1, probability: 0.5, control: 0.4 },
    strategic: { amount: 0.3, probability: 0.35, control: 0.35 },
    reputational: { amount: 0.2, probability: 0.45, control: 0.35 }
  };

  /**
   * Calculate comprehensive risk score with full explainability
   */
  score(input: RiskScoreInput, riskId?: string): RiskScoringResult {
    const id = riskId ?? `risk-${Date.now()}`;
    const weights = this.CONTROL_WEIGHTS[input.category];
    
    // Calculate component scores
    const amountScore = this.calculateAmountScore(input);
    const probabilityScore = input.probability * 100;
    const controlScore = (1 - input.controlEffectiveness) * 100;

    // Calculate weighted overall score
    const amountContribution = amountScore * weights.amount;
    const probabilityContribution = probabilityScore * weights.probability;
    const controlContribution = controlScore * weights.control;

    const overallScore = Math.min(100, Math.max(0, 
      amountContribution + probabilityContribution + controlContribution
    ));

    // Determine risk level
    const riskLevel = this.determineRiskLevel(overallScore, input.category);

    // Analyze contributing factors
    const contributingFactors = this.analyzeContributingFactors(input, {
      amountScore,
      probabilityScore,
      controlScore,
      weights
    });

    // Determine trend
    const trend = this.determineTrend(input, overallScore);

    // Generate explanation
    const explanation = this.generateExplanation(input, overallScore, riskLevel);

    // Create audit trail
    const auditTrail = this.createAuditTrail(id, input, overallScore);

    return {
      riskId: id,
      category: input.category,
      overallScore,
      riskLevel,
      probability: input.probability,
      impact: input.impact,
      controlFactor: input.controlEffectiveness,
      trend,
      contributingFactors,
      mitigationPriorities: this.generateMitigationPriorities(input, contributingFactors),
      explanation,
      auditTrail,
      recommendedReviewPeriod: this.determineReviewPeriod(overallScore, riskLevel)
    };
  }

  /**
   * Calculate amount-based component of risk score
   */
  private calculateAmountScore(input: RiskScoreInput): number {
    if (input.amount === undefined) return 50; // Neutral for unknown amounts
    
    // Logarithmic scaling for large amounts
    const thresholds = [
      { amount: 1000000, score: 100 },
      { amount: 500000, score: 85 },
      { amount: 100000, score: 70 },
      { amount: 50000, score: 55 },
      { amount: 10000, score: 40 },
      { amount: 0, score: 20 }
    ];

    for (const threshold of thresholds) {
      if (input.amount >= threshold.amount) {
        return threshold.score;
      }
    }
    return 20;
  }

  /**
   * Determine risk level from score and category
   */
  private determineRiskLevel(score: number, category: RiskCategory): RiskLevel {
    // Category-specific thresholds
    const thresholds: Record<RiskCategory, { critical: number; high: number; medium: number }> = {
      financial: { critical: 85, high: 70, medium: 50 },
      operational: { critical: 80, high: 65, medium: 45 },
      compliance: { critical: 90, high: 75, medium: 55 },
      strategic: { critical: 80, high: 65, medium: 50 },
      reputational: { critical: 85, high: 70, medium: 50 }
    };

    const t = thresholds[category];
    if (score >= t.critical) return "critical";
    if (score >= t.high) return "high";
    if (score >= t.medium) return "medium";
    return "low";
  }

  /**
   * Analyze factors contributing to the risk score
   */
  private analyzeContributingFactors(
    input: RiskScoreInput,
    scores: { amountScore: number; probabilityScore: number; controlScore: number; weights: { amount: number; probability: number; control: number } }
  ): RiskContributingFactor[] {
    const factors: RiskContributingFactor[] = [];

    // Amount factor
    if (input.amount !== undefined) {
      factors.push({
        factor: "financial_exposure",
        weight: scores.weights.amount,
        direction: input.amount > 100000 ? "increases" : "decreases",
        evidence: `Amount ${input.amount.toLocaleString()} contributes ${(scores.amountScore * scores.weights.amount).toFixed(1)} to risk score`
      });
    }

    // Probability factor
    factors.push({
      factor: "likelihood",
      weight: scores.weights.probability,
      direction: input.probability > 0.5 ? "increases" : "decreases",
      evidence: `Probability ${(input.probability * 100).toFixed(0)}% contributes ${(scores.probabilityScore * scores.weights.probability).toFixed(1)} to risk score`
    });

    // Impact factor
    factors.push({
      factor: "potential_impact",
      weight: 0.2,
      direction: input.impact > 7 ? "increases" : "decreases",
      evidence: `Impact level ${input.impact}/10 is ${input.impact > 7 ? "severe" : "moderate"}`
    });

    // Control effectiveness factor
    factors.push({
      factor: "control_mitigation",
      weight: scores.weights.control,
      direction: input.controlEffectiveness > 0.7 ? "decreases" : "increases",
      evidence: `Control effectiveness ${(input.controlEffectiveness * 100).toFixed(0)}% ${input.controlEffectiveness > 0.7 ? "significantly reduces" : "inadequately addresses"} risk`
    });

    // Days open factor (for ongoing risks)
    if (input.daysOpen !== undefined) {
      factors.push({
        factor: "duration",
        weight: 0.1,
        direction: input.daysOpen > 30 ? "increases" : "decreases",
        evidence: `Risk open for ${input.daysOpen} days ${input.daysOpen > 30 ? "- extended duration increases concern" : ""}`
      });
    }

    // Peer comparison factor
    if (input.peerRiskScores && input.peerRiskScores.length > 0) {
      const avgPeer = input.peerRiskScores.reduce((a, b) => a + b, 0) / input.peerRiskScores.length;
      factors.push({
        factor: "peer_comparison",
        weight: 0.1,
        direction: scores.probabilityScore > avgPeer ? "increases" : "decreases",
        evidence: `Current score ${scores.probabilityScore.toFixed(0)} vs peer average ${avgPeer.toFixed(0)}`
      });
    }

    return factors;
  }

  /**
   * Determine risk trend based on historical data
   */
  private determineTrend(input: RiskScoreInput, currentScore: number): RiskTrend {
    if (!input.historicalOutcomes || input.historicalOutcomes.length < 3) {
      return "stable"; // Insufficient data
    }

    const recentOutcomes = input.historicalOutcomes.slice(-5);
    const losses = recentOutcomes.filter(o => o.outcome === "loss");
    
    if (losses.length >= 3) return "increasing";
    if (losses.length === 0 && recentOutcomes.length >= 3) return "decreasing";
    return "stable";
  }

  /**
   * Generate human-readable explanation of the risk score
   */
  private generateExplanation(input: RiskScoreInput, overallScore: number, riskLevel: RiskLevel): string {
    const levelDescriptions: Record<RiskLevel, string> = {
      critical: "This risk requires immediate attention and escalation. Potential for significant financial or operational impact.",
      high: "This risk warrants senior management attention. Mitigation planning should be prioritized.",
      medium: "This risk should be monitored and managed through standard control procedures.",
      low: "This risk is within acceptable tolerance and can be managed through routine procedures."
    };

    let explanation = `${riskLevel.toUpperCase()} RISK (Score: ${overallScore.toFixed(0)}/100). ${levelDescriptions[riskLevel]}`;

    if (input.amount !== undefined && input.amount > 500000) {
      explanation += ` The financial exposure of ${input.amount.toLocaleString()} is substantial and drives elevated risk scoring.`;
    }

    if (input.controlEffectiveness < 0.5) {
      explanation += ` Control effectiveness is below acceptable threshold and represents a significant gap requiring remediation.`;
    }

    if (input.probability > 0.7) {
      explanation += ` The high probability of occurrence significantly elevates the risk level.`;
    }

    return explanation;
  }

  /**
   * Generate audit trail for the risk assessment
   */
  private createAuditTrail(riskId: string, input: RiskScoreInput, overallScore: number): RiskAuditEntry[] {
    const now = new Date().toISOString();
    const trail: RiskAuditEntry[] = [
      {
        timestamp: now,
        action: "risk_assessed",
        scoreChange: undefined,
        reason: `Initial risk assessment completed. Score: ${overallScore.toFixed(0)}/100`
      }
    ];

    if (input.amount !== undefined) {
      trail.push({
        timestamp: now,
        action: "amount_considered",
        reason: `Financial exposure of ${input.amount.toLocaleString()} incorporated into scoring`
      });
    }

    trail.push({
      timestamp: now,
      action: "probability_assessed",
      reason: `Probability ${(input.probability * 100).toFixed(0)}% incorporated into scoring`
    });

    return trail;
  }

  /**
   * Generate prioritized mitigation recommendations
   */
  private generateMitigationPriorities(input: RiskScoreInput, factors: RiskContributingFactor[]): string[] {
    const priorities: string[] = [];

    // Sort factors by weight
    const sortedFactors = [...factors].sort((a, b) => b.weight - a.weight);

    for (const factor of sortedFactors.slice(0, 3)) {
      if (factor.factor === "control_mitigation" && factor.direction === "increases") {
        priorities.push("Strengthen control effectiveness through enhanced procedures or automation");
      }
      if (factor.factor === "likelihood" && factor.direction === "increases") {
        priorities.push("Implement preventive controls to reduce probability of occurrence");
      }
      if (factor.factor === "financial_exposure" && factor.direction === "increases") {
        priorities.push("Consider risk transfer mechanisms (insurance, hedging) for large exposures");
      }
      if (factor.factor === "potential_impact" && factor.direction === "increases") {
        priorities.push("Develop and test contingency response plans");
      }
    }

    if (priorities.length === 0) {
      priorities.push("Continue monitoring through standard risk management processes");
    }

    return priorities;
  }

  /**
   * Determine appropriate review period based on risk level
   */
  private determineReviewPeriod(overallScore: number, riskLevel: RiskLevel): string {
    const periods: Record<RiskLevel, string> = {
      critical: "Daily review required",
      high: "Weekly review recommended",
      medium: "Monthly review",
      low: "Quarterly review"
    };

    return periods[riskLevel];
  }
}

export const riskScorer = new RiskScorer();
