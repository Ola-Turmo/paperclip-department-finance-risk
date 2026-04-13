// src/finance/causal-root-cause.ts
/**
 * Causal Root Cause Analyzer — TypeScript interface to DoWhy causal inference.
 * Uses child_process to call Python DoWhy wrapper.
 */

import { spawn } from "child_process";
import { join } from "path";

export interface CausalFactor {
  period: string;
  [key: string]: string | number;  // e.g., { period: "2024-01", marketing_spend: 50000, pricing: 1.2, revenue: 120000 }
}

export interface CausalRootCauseResult {
  causalEffects: Record<string, number>;
  totalEffect: number;
  method: string;
  confidence: "high" | "medium" | "low";
  placeboPValue?: number;
  topCause: string;
  narrative: string;
}

export class CausalRootCauseAnalyzer {
  /**
   * Given an anomalous outcome (e.g., revenue spike) and candidate causal factors,
   * use DoWhy to estimate each factor's causal contribution.
   */
  async analyze(params: {
    factors: CausalFactor[];
    outcomeVar: string;
    commonCauses?: string[];
    anomalyDescription?: string;
  }): Promise<CausalRootCauseResult> {
    const { factors, outcomeVar, commonCauses = ["seasonality_idx", "economic_idx"] } = params;
    const pythonScript = join(__dirname, "..", "python", "dowhy-wrapper.py");

    return new Promise((resolve) => {
      const proc = spawn("python3", [
        pythonScript,
        JSON.stringify({ factors, outcome_var: outcomeVar, common_causes: commonCauses }),
      ], { timeout: 60000 });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              resolve(this.fallbackNarrative(params, result.error));
              return;
            }
            const topCause = Object.entries(result.causal_effects ?? {})
              .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))[0]?.[0] ?? "unknown";
            resolve({
              causalEffects: result.causal_effects ?? {},
              totalEffect: result.total_effect ?? 0,
              method: result.method ?? "dowhy",
              confidence: result.confidence ?? "medium",
              placeboPValue: result.placebo_p_value,
              topCause,
              narrative: this.generateNarrative(topCause, result.causal_effects, params.anomalyDescription),
            });
          } catch {
            resolve(this.fallbackNarrative(params, "parse error"));
          }
        } else {
          resolve(this.fallbackNarrative(params, stderr || "no python"));
        }
      });

      proc.on("error", () => resolve(this.fallbackNarrative(params, "process error")));
    });
  }

  private generateNarrative(topCause: string, effects: Record<string, number>, anomalyDesc?: string): string {
    const sorted = Object.entries(effects).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top = sorted[0];
    if (!top) return anomalyDesc ?? "Insufficient data for causal narrative.";
    const direction = top[1] > 0 ? "increased" : "decreased";
    return `Primary causal driver: ${topCause} (${direction} outcome by ${Math.abs(top[1]).toFixed(2)} units). Secondary factors: ${sorted.slice(1, 3).map(([k, v]) => `${k} (${v > 0 ? "+" : ""}${v.toFixed(2)})`).join(", ")}.`;
  }

  private fallbackNarrative(params: { factors: CausalFactor[]; outcomeVar: string; anomalyDescription?: string }, _error: string): CausalRootCauseResult {
    // Simple correlation-based fallback when DoWhy unavailable
    const nums: Record<string, number[]> = {};
    for (const f of params.factors) {
      for (const [k, v] of Object.entries(f)) {
        if (k === "period") continue;
        if (typeof v === "number") {
          if (!nums[k]) nums[k] = [];
          nums[k].push(v);
        }
      }
    }
    const outcome = params.outcomeVar;
    const outcomeVals = nums[outcome] ?? [];
    const mean = outcomeVals.reduce((a, b) => a + b, 0) / (outcomeVals.length || 1);
    const topCause = Object.entries(nums)
      .filter(([k]) => k !== outcome)
      .map(([k, vals]) => {
        const corr = this.simpleCorrelation(vals, outcomeVals);
        return [k, Math.abs(corr)] as [string, number];
      })
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    return {
      causalEffects: {},
      totalEffect: 0,
      method: "correlation_fallback",
      confidence: "low",
      topCause,
      narrative: this.generateNarrative(topCause, {}, params.anomalyDescription),
    };
  }

  private simpleCorrelation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n === 0) return 0;
    const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      num += da * db;
      denA += da * da;
      denB += db * db;
    }
    const den = Math.sqrt(denA * denB);
    return den > 0 ? num / den : 0;
  }
}