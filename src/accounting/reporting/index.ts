/**
 * Reporting Module — World-Class Financial Reporting
 * 
 * Architecture:
 * dimensional/   — Dimension tables (account, entity, time, currency, FX)
 * warehouse/     — Financial data warehouse (fact tables, balance aggregation)
 * engine/        — Report engine (universal report generator)
 * statutory/     — Formal financial statements (BS, P&L, CF, equity) + XBRL
 * consolidation/ — Multi-entity consolidation (elimination, NCI, CTA)
 * budget/        — Budget vs Actual (variance analysis, KPI scorecard)
 * audit/         — Audit trail and SOX compliance reports
 */

export * from './dimensional/index.js';
export * from './warehouse/index.js';
export * from './engine/index.js';
export * from './pivot.js';
export { StatutoryReportService } from './statutory/statutory-reports.js';
export { ConsolidationEngine, EliminationEntry, NCICalculation, CurrencyTranslationResult } from './consolidation/consolidation-engine.js';
export { BudgetVsActualEngine } from './budget/index.js';
export type { BudgetLine, VarianceAnalysis, KPIScorecard } from './budget/index.js';
export { AuditReportService, AuditEntry, UserActivitySummary, SODViolation } from './audit/audit-report-service.js';
export { FinancialReportService, ReportResult, ReportDefinition, ReportRow, ReportSection } from './engine/report-engine.js';
