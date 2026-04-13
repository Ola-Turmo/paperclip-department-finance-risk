#!/usr/bin/env python3
"""
PyOD Ensemble Anomaly Detector — wraps PyOD for TypeScript.
Run: python3 pyod-wrapper.py <JSON_INPUT>
"""

import sys
import json
import numpy as np
from sklearn.ensemble import IsolationForest as SklearnIF
from pyod.models.hbos import HBOS
from pyod.models.knn import KNN
from pyod.models.ecod import ECOD
import os

def ensemble_anomaly_score(values: list) -> dict:
    """
    Combine 4 PyOD detectors via score averaging.
    Returns per-point anomaly scores (0-1 normalized).
    """
    try:
        import pyod
    except ImportError:
        return fallback_ensemble(values)
    
    X = np.array(values).reshape(-1, 1)
    scores = {}
    
    # ECOD (Empirical-CumulativeDistribution-based Outlier Detection)
    try:
        ecod = ECOD()
        ecod.fit(X)
        scores["ecod"] = ecod.decision_scores_.flatten().tolist()
    except Exception:
        scores["ecod"] = fallback_zscore(values)
    
    # HBOS (Histogram-based)
    try:
        hbos = HBOS()
        hbos.fit(X)
        scores["hbos"] = hbos.decision_scores_.flatten().tolist()
    except Exception:
        scores["hbos"] = fallback_zscore(values)
    
    # KNN
    try:
        knn = KNN()
        knn.fit(X)
        scores["knn"] = knn.decision_scores_.flatten().tolist()
    except Exception:
        scores["knn"] = fallback_zscore(values)
    
    # IForest (sklearn fallback if PyOD fails)
    try:
        isotree = SklearnIF(n_estimators=100, contamination=0.1, random_state=42)
        isotree.fit(X)
        # decision_function returns raw scores (higher = more anomalous)
        raw = isotree.decision_function(X).flatten().tolist()
        mn, mx = min(raw), max(raw)
        scores["isoforest"] = [(v - mn) / (mx - mn + 1e-10) for v in raw] if mx != mn else raw
    except Exception:
        scores["isoforest"] = fallback_zscore(values)
    
    # Ensemble: normalize each to 0-1, then average
    all_scores = []
    for name, s in scores.items():
        mn, mx = min(s), max(s)
        normalized = [(v - mn) / (mx - mn + 1e-10) for v in s] if mx != mn else s
        all_scores.append(normalized)
    
    ensemble = np.mean(all_scores, axis=0).flatten().tolist()
    mn, mx = min(ensemble), max(ensemble)
    ensemble_norm = [(v - mn) / (mx - mn + 1e-10) for v in ensemble] if mx != mn else ensemble
    
    return {
        "ensemble_scores": ensemble_norm,
        "component_scores": scores,
        "method": "pyod_ensemble",
        "n_detectors": len(scores),
    }

def fallback_zscore(values: list) -> list:
    vals = np.array(values)
    mean = np.mean(vals)
    std = np.std(vals) + 1e-10
    z = np.abs((vals - mean) / std)
    mn, mx = z.min(), z.max()
    return ((z - mn) / (mx - mn)).tolist()

def fallback_ensemble(values: list) -> dict:
    """Fallback when PyOD not available."""
    scores = fallback_zscore(values)
    return {"ensemble_scores": scores, "component_scores": {"zscore": scores}, "method": "zscore_fallback", "n_detectors": 1}

if __name__ == "__main__":
    try:
        data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else json.load(sys.stdin)
        result = ensemble_anomaly_score(data["values"])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e), "ensemble_scores": [], "component_scores": {}}))