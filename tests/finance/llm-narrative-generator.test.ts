import { describe, it, expect } from "vitest";
import { generateAnomalyNarrative } from "../../src/finance/llm-narrative-generator.js";

describe("generateAnomalyNarrative", () => {
  it("generates structured narrative", async () => {
    const narrative = await generateAnomalyNarrative({
      period: "2024-01", metric: "Revenue", expected: 100000, actual: 140000,
      anomalyType: "spike", factors: ["holiday_campaign"], region: "EMEA",
    });
    expect(narrative.executiveSummary).toBeDefined();
    expect(narrative.whatHappened).toBeDefined();
    expect(narrative.recommendedAction).toBeDefined();
    expect(narrative.riskAssessment).toMatch(/^(high|medium|low)$/);
  });

  it("returns template on LLM failure", async () => {
    const narrative = await generateAnomalyNarrative({
      period: "2024-01", metric: "Cost", expected: 50000, actual: 30000,
      anomalyType: "drop", factors: [],
    });
    expect(narrative.executiveSummary.length).toBeGreaterThan(10);
    expect(narrative.riskAssessment).toMatch(/^(high|medium|low)$/);
  });
});
