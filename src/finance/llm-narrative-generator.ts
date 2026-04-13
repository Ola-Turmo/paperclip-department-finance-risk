// src/finance/llm-narrative-generator.ts
/**
 * LLM-powered anomaly narrative generation.
 * Converts detected anomalies into CFO-ready plain-English explanations.
 */

import { callMiniMaxLLM } from "../llm-client.js";

export interface AnomalyContext {
  period: string;
  metric: string;
  expected: number;
  actual: number;
  anomalyType: string;
  factors: string[];
  topDriver?: string;
  causalEffects?: Record<string, number>;
  confidence?: number;
  region?: string;
  businessUnit?: string;
  recentEvents?: string[];
  seasonalityDescription?: string;
}

export interface AnomalyNarrative {
  executiveSummary: string;
  whatHappened: string;
  whyItMatters: string;
  recommendedAction: string;
  riskAssessment: "high" | "medium" | "low";
  generatedAt: string;
}

/**
 * Generate CFO-ready narrative from anomaly detection results.
 */
export async function generateAnomalyNarrative(ctx: AnomalyContext): Promise<AnomalyNarrative> {
  const prompt = `You are a CFO's analytical assistant. Generate a structured anomaly narrative.

ANOMALY:
- Period: ${ctx.period}
- Metric: ${ctx.metric}
- Expected: $${ctx.expected.toLocaleString()}
- Actual: $${ctx.actual.toLocaleString()}
- Variance: ${((ctx.actual / ctx.expected - 1) * 100).toFixed(1)}%
- Type: ${ctx.anomalyType}
${ctx.topDriver ? `- Primary driver: ${ctx.topDriver}` : ""}
${ctx.causalEffects ? `- Causal effects: ${JSON.stringify(ctx.causalEffects)}` : ""}
${ctx.confidence != null ? `- Confidence: ${(ctx.confidence * 100).toFixed(0)}%` : ""}
${ctx.region ? `- Region: ${ctx.region}` : ""}
${ctx.businessUnit ? `- Business Unit: ${ctx.businessUnit}` : ""}
${ctx.recentEvents?.length ? `- Recent events: ${ctx.recentEvents.join("; ")}` : ""}
${ctx.seasonalityDescription ? `- Seasonality: ${ctx.seasonalityDescription}` : ""}

Return JSON (5 fields only):
{
  "executiveSummary": "2 sentence max, plain English",
  "whatHappened": "1-2 sentences describing what the data shows",
  "whyItMatters": "1-2 sentences on business impact",
  "recommendedAction": "1 specific concrete next step",
  "riskAssessment": "high|medium|low"
}`;

  const response = await callMiniMaxLLM({
    prompt,
    system: "You are an expert financial analyst and CFO advisor. Be precise and data-driven.",
    maxTokens: 400,
    temperature: 0.3,
  });

  if (!response) return templateNarrative(ctx);

  try {
    const parsed = JSON.parse(response);
    return {
      executiveSummary: parsed.executiveSummary ?? "",
      whatHappened: parsed.whatHappened ?? "",
      whyItMatters: parsed.whyItMatters ?? "",
      recommendedAction: parsed.recommendedAction ?? "Investigate further",
      riskAssessment: (["high", "medium", "low"].includes(parsed.riskAssessment)) ? parsed.riskAssessment : "medium",
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return templateNarrative(ctx);
  }
}

function templateNarrative(ctx: AnomalyContext): AnomalyNarrative {
  const variance = ((ctx.actual / ctx.expected - 1) * 100).toFixed(1);
  const direction = ctx.actual > ctx.expected ? "up" : "down";
  const risk: AnomalyNarrative["riskAssessment"] = Math.abs(Number(variance)) > 30 ? "high" : Math.abs(Number(variance)) > 15 ? "medium" : "low";
  return {
    executiveSummary: `${ctx.metric} was ${Math.abs(Number(variance))}% ${direction} expectations in ${ctx.period}${ctx.region ? ` in ${ctx.region}` : ""}. This ${risk === "high" ? "warrants" : "may warrant"} immediate investigation.`,
    whatHappened: `${ctx.anomalyType === "spike" ? "A significant increase" : ctx.anomalyType === "drop" ? "A significant decrease" : "A variance"} of ${Math.abs(Number(variance))}% was detected in ${ctx.metric} for ${ctx.period}${ctx.topDriver ? `, primarily driven by ${ctx.topDriver}` : ""}.`,
    whyItMatters: `${ctx.metric} variance of ${Math.abs(Number(variance))}% represents approximately $${Math.abs(ctx.actual - ctx.expected).toLocaleString()} in impact${ctx.region ? ` for ${ctx.region}` : ""}.`,
    recommendedAction: `Investigate ${ctx.topDriver ?? "the contributing factors"} and confirm whether this is a one-time event or a structural change.`,
    riskAssessment: risk,
    generatedAt: new Date().toISOString(),
  };
}