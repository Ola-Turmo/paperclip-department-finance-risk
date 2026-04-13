#!/usr/bin/env python3
"""
DoWhy Causal Root Cause wrapper — formal causal inference for financial anomalies.
Run: python3 dowhy-wrapper.py <JSON_INPUT>
"""

import sys
import json
import os

def causal_root_cause(data: dict) -> dict:
    """
    Use DoWhy to estimate causal effects of factors on an anomalous metric.
    Returns per-factor causal effect sizes with confidence.
    """
    try:
        import pandas as pd
        import dowhy
        from dowhy import CausalModel
    except ImportError:
        return {"error": "dowhy not installed", "causal_effects": {}, "method": "unavailable"}

    try:
        df = pd.DataFrame(data["factors"])  # cols: factor1, factor2, ..., outcome
        treatment_vars = [c for c in df.columns if c != data["outcome_var"]]
        
        model = CausalModel(
            data=df,
            treatment=treatment_vars,
            outcome=data["outcome_var"],
            common_causes=data.get("common_causes", ["seasonality_idx", "economic_idx"]),
        )

        identified_estimand = model.identify_effect(proceed_when_unidentifiable=True)
        
        estimate = model.estimate_effect(
            identified_estimand,
            method_name="backdoor.linear_regression"
        )

        # Refutation: placebo treatment
        refute = model.refute_estimate(
            identified_estimand, estimate,
            method_name="placebo_treatment_refuter",
            placebo_type="random_common_cause"
        )

        causal_effects = {}
        if hasattr(estimate, "attention_weights") and estimate.attention_weights:
            for var in treatment_vars:
                causal_effects[var] = estimate.attention_weights.get(var, 0)
        elif hasattr(estimate, "effect"):
            total = float(estimate.effect)
            for var in treatment_vars:
                causal_effects[var] = total / len(treatment_vars)
        else:
            for var in treatment_vars:
                causal_effects[var] = float(estimate.value) if hasattr(estimate, "value") else 0

        return {
            "causal_effects": causal_effects,
            "total_effect": float(estimate.value) if hasattr(estimate, "value") else 0,
            "method": "dowhy_backdoor_linear",
            "placebo_p_value": float(refute.new_effect) if hasattr(refute, "new_effect") else None,
            "refutation_significant": refute.refutation_result["p_value"] < 0.05 if hasattr(refute, "refutation_result") else None,
            "confidence": "high" if (hasattr(refute, "refutation_result") and refute.refutation_result.get("p_value", 1) < 0.05) else "medium",
        }
    except Exception as e:
        return {"error": str(e), "causal_effects": {}, "method": "error"}

if __name__ == "__main__":
    try:
        data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        result = causal_root_cause(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))