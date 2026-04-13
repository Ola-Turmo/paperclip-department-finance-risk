/**
 * Learning Loop System
 * PRD: Learning loops from exceptions, misses, and forecast error
 * Captures lessons and promotes reusable abstractions
 */

export interface LearningEntry {
  id: string;
  type: "variance_miss" | "anomaly_false_positive" | "control_exception" | "forecast_error" | "approval_reversal";
  timestamp: string;
  summary: string;
  rootCause: string;
  contributingFactors: string[];
  lessonsLearned: string[];
  recommendedActions: string[];
  durableArtifact?: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface LearningQuery {
  type?: LearningEntry["type"];
  since?: string;
  minConfidence?: number;
  limit?: number;
}

export interface LearningInsight {
  insight: string;
  frequency: number;
  confidence: number;
  relatedTypes: LearningEntry["type"][];
  recommendedAction: string;
}

/**
 * Learning Loop - captures and retrieves institutional knowledge
 */
export class LearningLoop {
  private entries: LearningEntry[] = [];

  /**
   * Record a new learning entry
   */
  record(entry: Omit<LearningEntry, "id" | "timestamp">): LearningEntry {
    const fullEntry: LearningEntry = {
      ...entry,
      id: `learn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString()
    };
    
    this.entries.push(fullEntry);
    this.promoteToDurableArtifact(fullEntry);
    
    return fullEntry;
  }

  /**
   * Record a variance miss
   */
  recordVarianceMiss(params: {
    varianceId: string;
    expectedValue: number;
    actualValue: number;
    predictedDrivers?: string[];
    actualDriver?: string;
    rootCause: string;
    contributingFactors: string[];
    lessonsLearned: string[];
  }): LearningEntry {
    return this.record({
      type: "variance_miss",
      summary: `Variance miss: expected ${params.expectedValue}, actual ${params.actualValue}`,
      rootCause: params.rootCause,
      contributingFactors: params.contributingFactors,
      lessonsLearned: params.lessonsLearned,
      recommendedActions: this.deriveActions(params.rootCause, params.contributingFactors),
      confidence: 0.8,
      metadata: {
        varianceId: params.varianceId,
        expectedValue: params.expectedValue,
        actualValue: params.actualValue,
        predictedDrivers: params.predictedDrivers,
        actualDriver: params.actualDriver
      }
    });
  }

  /**
   * Record an anomaly false positive
   */
  recordAnomalyFalsePositive(params: {
    anomalyId: string;
    anomalyType: string;
    predictedCause: string;
    actualCause: string;
    explanation: string;
    lessonsLearned: string[];
  }): LearningEntry {
    return this.record({
      type: "anomaly_false_positive",
      summary: `False positive anomaly: ${params.anomalyType}`,
      rootCause: params.actualCause,
      contributingFactors: [params.predictedCause],
      lessonsLearned: params.lessonsLearned,
      recommendedActions: [
        "Update anomaly detection thresholds",
        "Refine exclusion rules for known patterns",
        "Document false positive patterns"
      ],
      confidence: 0.9,
      metadata: {
        anomalyId: params.anomalyId,
        anomalyType: params.anomalyType,
        predictedCause: params.predictedCause,
        actualCause: params.actualCause,
        explanation: params.explanation
      }
    });
  }

  /**
   * Record a control exception
   */
  recordControlException(params: {
    exceptionId: string;
    controlType: string;
    exceptionType: string;
    rootCause: string;
    resolution: string;
    lessonsLearned: string[];
    recurrenceCount?: number;
  }): LearningEntry {
    return this.record({
      type: "control_exception",
      summary: `Control exception: ${params.controlType} - ${params.exceptionType}`,
      rootCause: params.rootCause,
      contributingFactors: [params.exceptionType],
      lessonsLearned: params.lessonsLearned,
      recommendedActions: [
        `Review ${params.controlType} control design`,
        "Update control procedures",
        "Implement preventive measures"
      ],
      confidence: 0.95,
      metadata: {
        exceptionId: params.exceptionId,
        controlType: params.controlType,
        exceptionType: params.exceptionType,
        resolution: params.resolution,
        recurrenceCount: params.recurrenceCount ?? 1
      }
    });
  }

  /**
   * Record a forecast error
   */
  recordForecastError(params: {
    forecastId: string;
    forecastPeriod: string;
    expectedValue: number;
    actualValue: number;
    methodology: string;
    errorFactors: string[];
    lessonsLearned: string[];
  }): LearningEntry {
    const errorPercentage = params.expectedValue > 0 
      ? Math.abs((params.actualValue - params.expectedValue) / params.expectedValue * 100)
      : 0;
    
    return this.record({
      type: "forecast_error",
      summary: `Forecast error for ${params.forecastPeriod}: ${errorPercentage.toFixed(1)}% deviation`,
      rootCause: params.errorFactors.join("; ") || "Unknown",
      contributingFactors: params.errorFactors,
      lessonsLearned: params.lessonsLearned,
      recommendedActions: this.deriveForecastActions(params.methodology, params.errorFactors),
      confidence: 0.85,
      metadata: {
        forecastId: params.forecastId,
        forecastPeriod: params.forecastPeriod,
        expectedValue: params.expectedValue,
        actualValue: params.actualValue,
        methodology: params.methodology,
        errorPercentage
      }
    });
  }

  /**
   * Record an approval reversal
   */
  recordApprovalReversal(params: {
    requestId: string;
    originalDecision: string;
    reversalReason: string;
    lessonsLearned: string[];
  }): LearningEntry {
    return this.record({
      type: "approval_reversal",
      summary: `Approval reversal for request ${params.requestId}`,
      rootCause: params.reversalReason,
      contributingFactors: [params.originalDecision],
      lessonsLearned: params.lessonsLearned,
      recommendedActions: [
        "Review approval criteria",
        "Enhance evidence requirements",
        "Update approval routing rules"
      ],
      confidence: 0.9,
      metadata: {
        requestId: params.requestId,
        originalDecision: params.originalDecision,
        reversalReason: params.reversalReason
      }
    });
  }

  /**
   * Query learning entries
   */
  query(params: LearningQuery = {}): LearningEntry[] {
    let results = [...this.entries];

    if (params.type) {
      results = results.filter(e => e.type === params.type);
    }

    if (params.since) {
      const sinceDate = new Date(params.since);
      results = results.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    if (params.minConfidence !== undefined) {
      results = results.filter(e => e.confidence >= params.minConfidence!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (params.limit) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  /**
   * Get actionable insights from learning history
   */
  getInsights(limit: number = 10): LearningInsight[] {
    const insights: Map<string, LearningInsight> = new Map();

    // Analyze patterns in root causes
    for (const entry of this.entries) {
      const key = entry.rootCause;
      const existing = insights.get(key);

      if (existing) {
        existing.frequency++;
        existing.confidence = (existing.confidence + entry.confidence) / 2;
        if (!existing.relatedTypes.includes(entry.type)) {
          existing.relatedTypes.push(entry.type);
        }
      } else {
        insights.set(key, {
          insight: key,
          frequency: 1,
          confidence: entry.confidence,
          relatedTypes: [entry.type],
          recommendedAction: entry.recommendedActions[0] ?? "Monitor"
        });
      }
    }

    // Sort by frequency and confidence
    return Array.from(insights.values())
      .sort((a, b) => (b.frequency * b.confidence) - (a.frequency * a.confidence))
      .slice(0, limit);
  }

  /**
   * Get recurring patterns
   */
  getRecurringPatterns(minRecurrence: number = 2): Array<{
    pattern: string;
    recurrenceCount: number;
    lastOccurrence: string;
    recommendedAction: string;
  }> {
    const patterns: Map<string, { count: number; lastDate: string }> = new Map();

    for (const entry of this.entries) {
      // Look for patterns in root causes
      const rootCauseWords = entry.rootCause.toLowerCase().split(/\s+/);
      for (const word of rootCauseWords) {
        if (word.length > 4) { // Ignore short words
          const existing = patterns.get(word) ?? { count: 0, lastDate: entry.timestamp };
          existing.count++;
          if (new Date(entry.timestamp) > new Date(existing.lastDate)) {
            existing.lastDate = entry.timestamp;
          }
          patterns.set(word, existing);
        }
      }

      // Look for patterns in contributing factors
      for (const factor of entry.contributingFactors) {
        const factorWords = factor.toLowerCase().split(/\s+/);
        for (const word of factorWords) {
          if (word.length > 4) {
            const existing = patterns.get(word) ?? { count: 0, lastDate: entry.timestamp };
            existing.count++;
            if (new Date(entry.timestamp) > new Date(existing.lastDate)) {
              existing.lastDate = entry.timestamp;
            }
            patterns.set(word, existing);
          }
        }
      }
    }

    return Array.from(patterns.entries())
      .filter(([, data]) => data.count >= minRecurrence)
      .map(([pattern, data]) => ({
        pattern,
        recurrenceCount: data.count,
        lastOccurrence: data.lastDate,
        recommendedAction: this.entries.find(e => 
          e.rootCause.toLowerCase().includes(pattern) || 
          e.contributingFactors.some(f => f.toLowerCase().includes(pattern))
        )?.recommendedActions[0] ?? "Review pattern"
      }))
      .sort((a, b) => b.recurrenceCount - a.recurrenceCount);
  }

  /**
   * Get lessons for a specific variance driver
   */
  getLessonsForDriver(driver: string): LearningEntry[] {
    return this.entries.filter(e =>
      e.type === "variance_miss" &&
      (e.rootCause.toLowerCase().includes(driver.toLowerCase()) ||
       e.contributingFactors.some(f => f.toLowerCase().includes(driver.toLowerCase())))
    );
  }

  /**
   * Derive recommended actions from root cause and factors
   */
  private deriveActions(rootCause: string, factors: string[]): string[] {
    const actions: string[] = [];
    const rootCauseLower = rootCause.toLowerCase();

    if (rootCauseLower.includes("data") || rootCauseLower.includes("measurement")) {
      actions.push("Improve data collection and validation processes");
    }
    if (rootCauseLower.includes("methodology") || rootCauseLower.includes("model")) {
      actions.push("Review and refine forecasting or analysis methodology");
    }
    if (rootCauseLower.includes("assumption") || rootCauseLower.includes("expectation")) {
      actions.push("Document and validate assumptions before analysis");
    }
    if (factors.some(f => f.toLowerCase().includes("timing") || f.toLowerCase().includes("seasonal"))) {
      actions.push("Update seasonal adjustment factors and timing assumptions");
    }
    if (factors.some(f => f.toLowerCase().includes("control") || f.toLowerCase().includes("process"))) {
      actions.push("Review and strengthen control procedures");
    }

    if (actions.length === 0) {
      actions.push("Document findings and continue monitoring");
    }

    return actions;
  }

  /**
   * Derive actions specific to forecast errors
   */
  private deriveForecastActions(methodology: string, errorFactors: string[]): string[] {
    const actions: string[] = [];

    if (methodology.toLowerCase().includes("moving average")) {
      actions.push("Consider shorter lookback periods for volatile data");
    }
    if (methodology.toLowerCase().includes("regression")) {
      actions.push("Review independent variable selection and multicollinearity");
    }
    if (errorFactors.some(f => f.toLowerCase().includes("seasonal") || f.toLowerCase().includes("cyclical"))) {
      actions.push("Implement seasonal decomposition or SARIMA modeling");
    }
    if (errorFactors.some(f => f.toLowerCase().includes("trend") || f.toLowerCase().includes("structural"))) {
      actions.push("Consider trend extrapolation with regime change detection");
    }

    actions.push("Compare multiple forecasting methodologies for robustness");

    return actions;
  }

  /**
   * Promote high-value learnings to durable artifacts
   */
  private promoteToDurableArtifact(entry: LearningEntry): void {
    // High-confidence, recurring learnings should be promoted
    if (entry.confidence >= 0.9 && entry.lessonsLearned.length > 0) {
      entry.durableArtifact = `PLAYBOOK: ${entry.lessonsLearned[0]}`;
    }
  }

  /**
   * Export learnings for documentation
   */
  exportForDocumentation(): string {
    const insights = this.getInsights(20);
    const patterns = this.getRecurringPatterns();

    return [
      `# Learning Archive - ${new Date().toISOString().split('T')[0]}`,
      ``,
      `## Key Insights`,
      ...insights.map(i => `- [${(i.confidence * 100).toFixed(0)}%] ${i.insight} (${i.frequency} occurrences)`),
      ``,
      `## Recurring Patterns`,
      ...patterns.map(p => `- "${p.pattern}" occurred ${p.recurrenceCount} times - ${p.recommendedAction}`),
      ``,
      `## Recent Learnings`,
      ...this.query({ limit: 10 }).map(e => [
        ``,
        `### ${e.type.replace(/_/g, ' ').toUpperCase()}: ${e.id}`,
        `**Summary:** ${e.summary}`,
        `**Root Cause:** ${e.rootCause}`,
        `**Lessons Learned:**`,
        ...e.lessonsLearned.map(l => `  - ${l}`),
        `**Recommended Actions:**`,
        ...e.recommendedActions.map(a => `  - ${a}`)
      ].join('\n')),
      ``,
      `---`,
      `Total learning entries: ${this.entries.length}`
    ].join('\n');
  }
}

export const learningLoop = new LearningLoop();
