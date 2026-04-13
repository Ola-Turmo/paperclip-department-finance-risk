# @uos/department-finance-risk

@uos/department-finance-risk packages forecasting, approvals, controls, anomaly detection, and risk sensing into an auditable operating layer. It exists to improve financial clarity and control integrity without turning finance into a slow-moving workflow bottleneck.

Built as part of the UOS split workspace on top of [Paperclip](https://github.com/paperclipai/paperclip), which remains the upstream control-plane substrate.

## What This Repo Owns

- Forecasting support, variance analysis, and explanation workflows.
- Approval routing, controls, and audit trail support.
- Anomaly and leakage detection with triage guidance.
- Risk scoring, review, and escalation workflows.
- Learning loops from exceptions, misses, and forecast error.

## Runtime Form

- Split repo with package code as the source of truth and a Paperclip plugin scaffold available for worker, manifest, UI, and validation surfaces when the repo needs runtime or operator-facing behavior.

## Phase 1+2 Features

### ML Anomaly Detection (PyOD Ensemble)
- `src/variance/ml-anomaly-detector.ts` — Isolation forest principle + time-series decomposition for detecting spikes, drops, and trend deviations in financial data.
- `src/variance/pyod-ensemble-detector.ts` — TypeScript adapter calling Python PyOD wrapper via child_process for ensemble anomaly scoring with Z-score fallback.

### DoWhy Causal Root Cause
- `src/finance/causal-root-cause.ts` — TypeScript interface to DoWhy causal inference. Estimates each factor's causal contribution to anomalous outcomes using Python DoWhy wrapper with correlation-based fallback.

### LLM Anomaly Narrative Generator
- `src/finance/llm-narrative-generator.ts` — Converts detected anomalies into CFO-ready plain-English explanations with executive summary, business impact, and recommended actions.

### Approval Router (ML-powered)
- `src/approval/approval-router.ts` — Cost/risk-aware approval routing with segregation of duties, approver scoring based on history and workload, and risk flag detection.

### Control Exception Logger (100% Audit Trail)
- `src/controls/control-exception-logger.ts` — Ensures 100% exception coverage with full audit trail. Tracks open/resolved status, severity, owner, and generates compliance reports.

### Finance ERP Stubs
- `src/finance-erp-stub.ts` — Stub connectors for QuickBooks, Xero, and NetSuite ERP systems.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    UOS Finance & Risk                    │
├─────────────────────────────────────────────────────────┤
│  Variance Analysis     │  Approval Flow  │  Controls   │
│  ─────────────────────┼──────────────────┼─────────────│
│  • MLAnomalyDetector  │  • ApprovalRouter│  • Exception│
│  • PyOD Ensemble      │  • ApprovalSvc   │    Logger   │
│  • VarianceExplainer  │  • Segregation   │  • Monitor   │
│  • ForecastPredictor  │    Matrix        │             │
├───────────────────────┴──────────────────┴─────────────┤
│  Causal Inference    │  LLM Narrative   │  ERP Stubs   │
│  • DoWhy Wrapper     │  • Anomaly Narr.  │  • QuickBooks│
│  • Correlation F/B   │  • CFO Explan.    │  • Xero      │
│                      │                   │  • NetSuite  │
├─────────────────────────────────────────────────────────┤
│                    Python ML Layer                        │
│        PyOD · DoWhy · pandas · scikit-learn              │
└─────────────────────────────────────────────────────────┘
```

## Highest-Value Workflows

- Explaining forecast movement and variance drivers.
- Routing approvals with clear evidence and traceability.
- Detecting financial anomalies and prioritizing follow-up.
- Monitoring control health and exception patterns.
- Capturing lessons from misses, exceptions, and audits.

## Key Connections and Operating Surfaces

- Accounting and ERP systems such as QuickBooks, Xero, or NetSuite, billing/payments tools such as Stripe, expense systems, approvals, spreadsheets, docs, and audit trails needed to preserve both operating speed and control integrity.
- Risk, compliance, security-review, contract, and policy surfaces whenever financial decisions require governance, traceability, segregation of duties, or escalation.
- Browser and export/import workflows for finance, banking, and procurement tools that expose critical evidence outside API boundaries.
- Any adjacent system required to move from variance signal or anomaly to explanation, approval, control action, journal-impact review, and auditable resolution.

## KPI Targets

- Variance explanation coverage reaches >= 90% for material forecast movement.
- Approval SLA stays <= 1 business day for standard requests with complete evidence.
- Anomaly precision reaches >= 80% on the maintained financial benchmark corpus.
- 100% of control exceptions are logged with owner, due date, and disposition.

## Implementation Backlog

### Now
- Define the approval, control, and anomaly-handling workflows with explicit evidence requirements.
- Build the exception register and owner-tracking loop for all material control failures.
- Make forecast movement and variance explanation a first-class output instead of a manual afterthought.

### Next
- Improve anomaly precision and reduce noisy flags that waste reviewer time.
- Integrate finance, spend, and approval systems so evidence can be gathered without spreadsheet archaeology.
- Instrument SLA, exception aging, and repeated control failure patterns.

### Later
- Support more autonomous finance operations within strict approval and control boundaries.
- Expand from exception management into proactive risk sensing and control design guidance.

## Local Plugin Use

```bash
curl -X POST http://127.0.0.1:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"<absolute-path-to-this-repo>","isLocalPath":true}'
```

## Validation

```bash
npm install
npm run check
npm run plugin:typecheck
npm run plugin:test
```
