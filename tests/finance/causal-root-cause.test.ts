import { describe, it, expect, vi } from "vitest";
import { CausalRootCauseAnalyzer } from "../../src/finance/causal-root-cause.js";

// Mock child_process at module level so CausalRootCauseAnalyzer captures the mock
// when it does `import { spawn } from "child_process"` (ESM live binding issue).
vi.mock("child_process", () => {
  const mockProc = {
    stdout: { on: (event: string, cb: (d: { toString: () => string }) => void) => { if (event === "data") cb({ toString: () => "" }); } },
    stderr: { on: (event: string, cb: (d: { toString: () => string }) => void) => { if (event === "data") cb({ toString: () => "python not found" }); } },
    on: (event: string, cb: (code: number) => void) => { if (event === "close") cb(127); },
    kill: vi.fn(),
  };
  return { spawn: () => mockProc };
});

describe("CausalRootCauseAnalyzer", () => {
  it("analyzes and returns narrative", async () => {
    const analyzer = new CausalRootCauseAnalyzer();
    const factors = [
      { period: "2024-01", marketing_spend: 10000, revenue: 50000 },
      { period: "2024-02", marketing_spend: 15000, revenue: 65000 },
      { period: "2024-03", marketing_spend: 12000, revenue: 60000 },
    ];
    const result = await analyzer.analyze({ factors, outcomeVar: "revenue" });
    expect(result.narrative).toBeDefined();
    expect(result.method).toBeDefined();
    expect(result.confidence).toMatch(/^(high|medium|low)$/);
  });

  it("returns correlation fallback when Python subprocess fails", async () => {
    const analyzer = new CausalRootCauseAnalyzer();
    const factors = [{ period: "2024-01", x: 10, y: 20, z: 30, outcome: 100 }];
    const result = await analyzer.analyze({ factors, outcomeVar: "outcome" });

    expect(result.narrative.length).toBeGreaterThan(0);
    expect(result.method).toBe("correlation_fallback");
  });
});
