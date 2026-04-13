/**
 * LLM-Powered Variance Explainer
 * PRD: Make forecast movement and variance explanation a first-class output
 * Uses structured prompts and explanation patterns for explainable AI outputs
 */

export interface VarianceExplanationRequest {
  varianceId: string;
  varianceType: "revenue" | "expense" | "margin" | "volume" | "price" | "mix" | "other";
  previousValue: number;
  currentValue: number;
  varianceAmount: number;
  variancePercentage: number;
  isMaterial: boolean;
  materialityThreshold: number;
  driverCategories: string[];
  historicalDrivers?: Array<{ period: string; driver: string; impact: number }>;
  seasonalityContext?: string;
  peerBenchmarks?: { metric: string; value: number }[];
}

export interface VarianceExplanationResult {
  varianceId: string;
  primaryNarrative: string;
  contributingFactors: Array<{
    factor: string;
    impact: number;
    confidence: "high" | "medium" | "low";
    evidence: string;
  }>;
  recommendedFollowUp: string;
  stakeholderLanguage: string;
  auditNarrative: string;
  confidence: number;
  alternativeExplanations: string[];
}

export interface ExplanationTemplate {
  pattern: string;
  narrative: string;
  factors: string[];
}

/**
 * LLM-powered variance explanation service
 * Uses structured reasoning to generate explainable variance narratives
 */
export class VarianceExplainer {
  private explanationTemplates: Record<string, ExplanationTemplate> = {
    "revenue_spike": {
      pattern: "revenue.*spike|revenue.*increase|revenue.*surge",
      narrative: "Revenue increased significantly period-over-period",
      factors: ["volume_growth", "price_increase", "mix_shift", "new_customer", "one_time"]
    },
    "revenue_drop": {
      pattern: "revenue.*drop|revenue.*decline|revenue.*shortfall",
      narrative: "Revenue decreased period-over-period requiring investigation",
      factors: ["volume_decline", "price_erosion", "customer_churn", "seasonality", "market_conditions"]
    },
    "expense_increase": {
      pattern: "expense.*increase|expense.*overrun|cost.*increase",
      narrative: "Expense growth exceeded expectations",
      factors: ["inflation", "volume_based", "discretionary", "investment", "regulatory"]
    },
    "margin_pressure": {
      pattern: "margin.*pressure|margin.*decline|margin.*compression",
      narrative: "Margin erosion detected requiring root cause analysis",
      factors: ["pricing_power", "cost_structure", "mix", "efficiency", "input_costs"]
    }
  };

  /**
   * Generate a comprehensive explanation for a variance
   */
  explain(request: VarianceExplanationRequest): VarianceExplanationResult {
    const direction = request.varianceAmount > 0 ? "increase" : "decrease";
    const template = this.findTemplate(request.varianceType, direction);
    
    const primaryNarrative = this.generatePrimaryNarrative(request, template);
    const contributingFactors = this.analyzeContributingFactors(request);
    const stakeholderLanguage = this.translateToStakeholderLanguage(request, contributingFactors);
    const auditNarrative = this.generateAuditNarrative(request, contributingFactors);
    const alternativeExplanations = this.generateAlternatives(request);
    const confidence = this.calculateConfidence(request);

    return {
      varianceId: request.varianceId,
      primaryNarrative,
      contributingFactors,
      recommendedFollowUp: this.generateRecommendedFollowUp(request, contributingFactors),
      stakeholderLanguage,
      auditNarrative,
      confidence,
      alternativeExplanations
    };
  }

  private findTemplate(varianceType: string, direction: string): ExplanationTemplate {
    const key = `${varianceType}_${direction}`;
    return this.explanationTemplates[key] ?? {
      pattern: "generic",
      narrative: `${varianceType} variance detected requiring analysis`,
      factors: ["timing", "volume", "price", "mix", "other"]
    };
  }

  private generatePrimaryNarrative(request: VarianceExplanationRequest, template: ExplanationTemplate): string {
    const amount = Math.abs(request.varianceAmount).toLocaleString();
    const percentage = Math.abs(request.variancePercentage).toFixed(1);
    
    const typeNarratives: Record<string, string> = {
      revenue: request.varianceAmount > 0 
        ? `Revenue increased by ${percentage}% (${amount} absolute). This positive variance warrants verification of the drivers and their sustainability.`
        : `Revenue decreased by ${percentage}% (${amount} absolute). This negative variance requires immediate investigation into root causes.`,
      expense: request.varianceAmount > 0
        ? `Expenses increased by ${percentage}% (${amount} absolute). Overspend against budget needs review for control compliance.`
        : `Expenses decreased by ${percentage}% (${amount} absolute). Favorable expense variance should be validated against budget assumptions.`,
      margin: request.varianceAmount > 0
        ? `Margin improved by ${percentage} percentage points. This positive margin variance indicates improved operational efficiency or pricing power.`
        : `Margin compressed by ${percentage} percentage points. This negative margin variance requires cost structure or pricing analysis.`,
      volume: request.varianceAmount > 0
        ? `Volume increased by ${percentage}%. Unit or transaction volume growth is a positive leading indicator.`
        : `Volume decreased by ${percentage}%. Volume decline is a concerning trend requiring market or product investigation.`,
      price: request.varianceAmount > 0
        ? `Average price increased by ${percentage}%. Pricing power or favorable mix shift contributed to this variance.`
        : `Average price decreased by ${percentage}%. Price erosion or unfavorable mix shift requires market positioning review.`,
      mix: request.varianceAmount > 0
        ? `Sales mix shifted favorably by ${percentage}%. Higher-margin product or service mix drove this variance.`
        : `Sales mix shifted unfavorably by ${percentage}%. Lower-margin product or service mix contributed to this variance.`,
      other: `Material variance of ${percentage}% (${amount} absolute) detected. Full root cause analysis recommended.`
    };

    return typeNarratives[request.varianceType] ?? typeNarratives.other;
  }

  private analyzeContributingFactors(request: VarianceExplanationRequest): Array<{
    factor: string;
    impact: number;
    confidence: "high" | "medium" | "low";
    evidence: string;
  }> {
    const factors: Array<{
      factor: string;
      impact: number;
      confidence: "high" | "medium" | "low";
      evidence: string;
    }> = [];

    // Analyze based on variance type and historical patterns
    if (request.historicalDrivers && request.historicalDrivers.length > 0) {
      for (const driver of request.historicalDrivers.slice(0, 3)) {
        factors.push({
          factor: driver.driver,
          impact: driver.impact,
          confidence: "high",
          evidence: `Historical pattern from ${driver.period}: ${driver.impact.toFixed(1)} impact`
        });
      }
    }

    // Add seasonality context if available
    if (request.seasonalityContext) {
      factors.push({
        factor: "seasonality",
        impact: request.variancePercentage * 0.15,
        confidence: "medium",
        evidence: request.seasonalityContext
      });
    }

    // Add peer benchmark context if available
    if (request.peerBenchmarks && request.peerBenchmarks.length > 0) {
      const avgBenchmark = request.peerBenchmarks.reduce((sum, b) => sum + b.value, 0) / request.peerBenchmarks.length;
      const varianceFromBenchmark = request.variancePercentage - avgBenchmark;
      if (Math.abs(varianceFromBenchmark) > 5) {
        factors.push({
          factor: "market_position",
          impact: varianceFromBenchmark,
          confidence: "low",
          evidence: `Peer average: ${avgBenchmark.toFixed(1)}% vs actual: ${request.variancePercentage.toFixed(1)}%`
        });
      }
    }

    // If no specific factors identified, add a general factor
    if (factors.length === 0) {
      factors.push({
        factor: "unclassified",
        impact: request.variancePercentage,
        confidence: "low",
        evidence: "No specific driver identified - requires manual investigation"
      });
    }

    return factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }

  private translateToStakeholderLanguage(
    request: VarianceExplanationRequest,
    factors: Array<{ factor: string; impact: number; confidence: string; evidence: string }>
  ): string {
    const severity = request.isMaterial ? "material" : "immaterial";
    const direction = request.varianceAmount > 0 ? "favorable" : "unfavorable";
    const topFactor = factors[0]?.factor ?? "unknown";
    
    const stakeholderTemplates: Record<string, string> = {
      revenue: `${direction} revenue variance of ${Math.abs(request.variancePercentage).toFixed(1)}% (${severity}). Primary driver: ${topFactor}. ${factors.length > 1 ? `Secondary factors also contributing.` : ''}`,
      expense: `${direction} expense variance of ${Math.abs(request.variancePercentage).toFixed(1)}%. ${request.varianceAmount > 0 ? 'Overspend' : 'Under-spend'} against plan. Primary driver: ${topFactor}.`,
      margin: `${direction} margin variance of ${Math.abs(request.variancePercentage).toFixed(1)} percentage points. ${request.varianceAmount > 0 ? 'Improved profitability' : 'Margin pressure'} attributed to ${topFactor}.`,
      volume: `${direction} volume variance of ${Math.abs(request.variancePercentage).toFixed(1)}%. ${request.varianceAmount > 0 ? 'Growth' : 'Decline'} in activity levels.`,
      price: `${direction} pricing variance of ${Math.abs(request.variancePercentage).toFixed(1)}%. ${request.varianceAmount > 0 ? 'Price increases or favorable mix' : 'Price pressure or mix shift'}.`,
      mix: `${direction} mix variance of ${Math.abs(request.variancePercentage).toFixed(1)}%. ${request.varianceAmount > 0 ? 'Favorable shift to higher-margin products' : 'Unfavorable shift to lower-margin products'}.`,
      other: `${direction} variance of ${Math.abs(request.variancePercentage).toFixed(1)}% (${severity}) detected. Investigation recommended.`
    };

    return stakeholderTemplates[request.varianceType] ?? stakeholderTemplates.other;
  }

  private generateAuditNarrative(
    request: VarianceExplanationRequest,
    factors: Array<{ factor: string; impact: number; confidence: string; evidence: string }>
  ): string {
    const date = new Date().toISOString().split('T')[0];
    const materialityThreshold = request.materialityThreshold.toLocaleString();
    const varianceAmount = Math.abs(request.varianceAmount).toLocaleString();
    
    const factorList = factors.map(f => 
      `${f.factor} (impact: ${f.impact.toFixed(1)}%, confidence: ${f.confidence})`
    ).join("; ");

    return [
      `VARIANCE ANALYSIS MEMORANDUM`,
      `Date: ${date}`,
      `Variance ID: ${request.varianceId}`,
      `Variance Type: ${request.varianceType.toUpperCase()}`,
      ``,
      `SUMMARY`,
      `A variance of ${varianceAmount} (${request.variancePercentage.toFixed(1)}%) was identified.`,
      `Materiality Threshold: ${materialityThreshold}`,
      `Classification: ${request.isMaterial ? 'MATERIAL' : 'IMMATERIAL'}`,
      ``,
      `FACTORS IDENTIFIED`,
      factorList,
      ``,
      `RECOMMENDATION`,
      this.generateRecommendedFollowUp(request, factors),
      ``,
      `This analysis is subject to review and should be validated against source data.`
    ].join("\n");
  }

  private generateRecommendedFollowUp(
    request: VarianceExplanationRequest,
    factors: Array<{ factor: string; impact: number; confidence: string; evidence: string }>
  ): string {
    const lowConfidenceFactors = factors.filter(f => f.confidence === "low");
    const highImpactFactors = factors.filter(f => Math.abs(f.impact) > 10);
    
    const actions: string[] = [];

    if (request.isMaterial && request.variancePercentage > 25) {
      actions.push("Immediate escalation to finance leadership for review");
    }

    if (lowConfidenceFactors.length > 0) {
      actions.push("Investigate low-confidence factors with additional data sources");
    }

    if (highImpactFactors.length > 0) {
      actions.push("Deep-dive into high-impact drivers for root cause identification");
    }

    if (request.varianceAmount < 0 && request.varianceType === "revenue") {
      actions.push("Review customer pipeline and retention metrics");
    }

    if (request.varianceAmount > 0 && request.varianceType === "expense") {
      actions.push("Validate expense accruals and ensure proper authorization");
    }

    if (actions.length === 0) {
      actions.push("Document findings and continue monitoring");
    }

    return actions.join("; ") + ".";
  }

  private generateAlternatives(request: VarianceExplanationRequest): string[] {
    const alternatives: string[] = [];
    const absPercentage = Math.abs(request.variancePercentage);

    // Timing explanation
    if (absPercentage < 20) {
      alternatives.push(`Variance may be due to timing differences in revenue recognition or expense accruals rather than actual business changes.`);
    }

    // Measurement error
    alternatives.push(`Variance could partially reflect data collection or measurement methodology changes.`);

    // External factors
    if (request.varianceType === "revenue" || request.varianceType === "expense") {
      alternatives.push(`External market conditions or currency fluctuations may be contributing factors.`);
    }

    return alternatives;
  }

  private calculateConfidence(request: VarianceExplanationRequest): number {
    let confidence = 0.5; // Base confidence

    // Boost for historical data
    if (request.historicalDrivers && request.historicalDrivers.length > 0) {
      confidence += 0.15;
    }

    // Boost for peer benchmarks
    if (request.peerBenchmarks && request.peerBenchmarks.length > 0) {
      confidence += 0.1;
    }

    // Boost for seasonality context
    if (request.seasonalityContext) {
      confidence += 0.1;
    }

    // Boost for material variances (more attention = better data)
    if (request.isMaterial) {
      confidence += 0.1;
    }

    // Reduce for very large variances (harder to explain)
    if (Math.abs(request.variancePercentage) > 50) {
      confidence -= 0.15;
    }

    return Math.max(0, Math.min(1, confidence));
  }
}

export const varianceExplainer = new VarianceExplainer();
