/**
 * Budget vs Actual Engine — variance analysis, flex budgets, KPI dashboard.
 * 
 * Capabilities:
 * - Budget loading (from spreadsheet, API, or planning system)
 * - Variance analysis (absolute $, percentage, and trend)
 * - Flex budget adjustment based on actual volume drivers
 * - KPI scorecard with traffic-light thresholds
 * - CFO dashboard: executive summary with drill-through
 */

import { FinancialDataWarehouse } from '../warehouse/warehouse.js';
import { DimAccountService } from '../dimensional/dim-services.js';
import { DimTimeService } from '../dimensional/dim-services.js';
import { BudgetEntry, BudgetEntryRepository } from '../../core/interfaces.js';
import { InMemoryBudgetEntryRepo } from '../../core/interfaces.js';

export interface BudgetLine {
  id?: string;             // Optional — generated if not provided
  accountKey: string;
  accountCode: string;
  accountName: string;
  periodKey: string;           // "2025-03" or "2025-Q1"
  budgetAmount: string;
  forecastAmount?: string;     // Optional updated forecast
}

export interface VarianceAnalysis {
  accountKey: string;
  accountCode: string;
  accountName: string;
  actualAmount: string;
  budgetAmount: string;
  forecastAmount?: string;
  variance: string;            // actual - budget
  variancePct: string;        // variance / budget as %
  varianceType: 'FAVORABLE' | 'UNFAVORABLE' | 'ON_BUDGET';
  isMaterial: boolean;         // True if variance > materiality threshold
  trend: 'IMPROVING' | 'WORSENING' | 'STABLE';
  commentary?: string;
}

export interface FlexBudgetResult {
  accountKey: string;
  originalBudget: string;
  flexedBudget: string;
  actualAmount: string;
  flexVariance: string;
  driverVariance: string;     // Variance explained by volume differences
  priceVariance: string;      // Variance explained by price differences
}

export interface KPIScorecard {
  periodKey: string;
  generatedAt: Date;
  kpis: Array<{
    name: string;
    category: 'profitability' | 'liquidity' | 'leverage' | 'efficiency' | 'growth';
    value: string;
    unit: 'currency' | 'days' | 'ratio' | 'percent';
    status: 'GREEN' | 'AMBER' | 'RED';
    threshold: { amber: string; red: string; };
    priorPeriodValue?: string;
    trend: 'IMPROVING' | 'WORSENING' | 'STABLE';
    description: string;
  }>;
  summary: { greenCount: number; amberCount: number; redCount: number; };
}

export class BudgetVsActualEngine {
  constructor(
    private warehouse: FinancialDataWarehouse,
    private dimAccount: DimAccountService,
    private dimTime: DimTimeService,
    private budgetRepo: BudgetEntryRepository = new InMemoryBudgetEntryRepo(),
  ) {}

  /** Load budget data from an array — typically from a spreadsheet import.
   *  Persists via the injected BudgetEntryRepository. */
  async loadBudget(budgetLines: BudgetLine[]): Promise<void> {
    const entries: BudgetEntry[] = budgetLines.map(line => ({
      id: line.id ?? `${line.periodKey}:${line.accountKey}`,
      accountKey: line.accountKey,
      accountCode: line.accountCode,
      accountName: line.accountName,
      periodKey: line.periodKey,
      budgetAmount: line.budgetAmount,
      forecastAmount: line.forecastAmount,
    }));
    await this.budgetRepo.saveMany(entries);
  }

  /** Clear budget data for a period via the repository. */
  async clearBudget(periodKey: string): Promise<void> {
    await this.budgetRepo.deleteByPeriod(periodKey);
  }

  /**
   * Full variance analysis for a period.
   */
  async analyzeVariance(params: {
    dateKey: string;
    entityKey: string;
    materialityThreshold?: number;  // Default 5% = show if variance > 5%
    includePriorPeriod?: boolean;
  }): Promise<VarianceAnalysis[]> {
    const { dateKey, entityKey, materialityThreshold = 0.05 } = params;
    const periodKey = dateKey.substring(0, 7);  // "2025-03"
    const budgetLines = await this.budgetRepo.findByPeriod(periodKey);
    const actualBalances = await this.warehouse.getTrialBalanceData({ entityKey, dateKey, includeZeroBalance: false });
    const priorDateKey = this.getPriorPeriodDateKey(dateKey);
    const priorBalances = await this.warehouse.getTrialBalanceData({ entityKey, dateKey: priorDateKey, includeZeroBalance: false });

    const results: VarianceAnalysis[] = [];

    for (const bal of actualBalances) {
      const budgetLine = budgetLines.find(b => b.accountCode === bal.accountCode);
      const actual = parseFloat(bal.endingBalance);
      const budget = budgetLine ? parseFloat(budgetLine.budgetAmount) : 0;

      if (budget === 0 && actual === 0) continue;  // Skip zero-zero rows

      const variance = actual - budget;
      const variancePct = budget !== 0 ? (variance / Math.abs(budget)) : (actual !== 0 ? 1 : 0);
      const isMaterial = Math.abs(variancePct) >= materialityThreshold;
      const varianceType = variancePct === 0 ? 'ON_BUDGET' : (variancePct > 0 ? 'FAVORABLE' : 'UNFAVORABLE');

      // Trend: compare this variance to prior period
      const priorBal = priorBalances.find(b => b.accountCode === bal.accountCode);
      const priorActual = priorBal ? parseFloat(priorBal.endingBalance) : 0;
      const priorBudget = 0;  // simplified
      const trend = priorActual < actual ? 'IMPROVING' : priorActual > actual ? 'WORSENING' : 'STABLE';

      results.push({
        accountKey: bal.accountKey,
        accountCode: bal.accountCode,
        accountName: bal.accountName,
        actualAmount: actual.toFixed(2),
        budgetAmount: budget.toFixed(2),
        forecastAmount: budgetLine?.forecastAmount,
        variance: variance.toFixed(2),
        variancePct: (variancePct * 100).toFixed(1) + '%',
        varianceType,
        isMaterial,
        trend,
      });
    }

    return results.sort((a, b) => Math.abs(parseFloat(b.variance)) - Math.abs(parseFloat(a.variance)));
  }

  /**
   * KPI Scorecard — CFO dashboard with traffic-light indicators.
   */
  async generateKPIScorecard(params: {
    dateKey: string;
    entityKey: string;
    currency: string;
  }): Promise<KPIScorecard> {
    const { dateKey, entityKey, currency } = params;
    const balances = await this.warehouse.getTrialBalanceData({ entityKey, dateKey, includeZeroBalance: false });
    const priorDateKey = this.getPriorPeriodDateKey(dateKey);
    const priorBalances = await this.warehouse.getTrialBalanceData({ entityKey, dateKey: priorDateKey, includeZeroBalance: false });

    const getBal = (code: string, bals: typeof balances): number => {
      const b = bals.find(b => b.accountCode === code);
      return b ? parseFloat(b.endingBalance) : 0;
    };

    const getPriorBal = (code: string) => getBal(code, priorBalances);

    // Extract key balances
    const cash = Math.abs(getBal('1000', balances));
    const ar = Math.abs(getBal('1100', balances));
    const inventory = Math.abs(getBal('1200', balances));
    const ap = Math.abs(getBal('2000', balances));
    const debt = Math.abs(getBal('2500', balances));
    const revenue = Math.abs(getBal('4000', balances));
    const cogs = Math.abs(getBal('5000', balances));
    const opex = Math.abs(getBal('6000', balances)) + Math.abs(getBal('6100', balances));
    const netIncome = Math.abs(getBal('3300', balances));
    const totalAssets = cash + ar + inventory;
    const totalLiab = ap + debt;
    const totalEquity = totalAssets - totalLiab;

    const priorCash = Math.abs(getPriorBal('1000'));
    const priorRevenue = Math.abs(getPriorBal('4000'));
    const priorNetIncome = Math.abs(getPriorBal('3300'));

    const kpis: KPIScorecard['kpis'] = [];

    const addKPI = (
      name: string, category: KPIScorecard['kpis'][0]['category'],
      value: string, unit: KPIScorecard['kpis'][0]['unit'],
      threshold: { amber: string; red: string; },
      priorValue: string | undefined,
      description: string,
    ) => {
      const val = parseFloat(value);
      const amb = parseFloat(threshold.amber);
      const red = parseFloat(threshold.red);
      const prev = priorValue ? parseFloat(priorValue) : val;
      const trend = val > prev ? 'IMPROVING' : val < prev ? 'WORSENING' : 'STABLE';
      let status: 'GREEN' | 'AMBER' | 'RED';
      if (unit === 'percent' || unit === 'ratio') {
        status = Math.abs(val) <= amb ? 'GREEN' : Math.abs(val) <= red ? 'AMBER' : 'RED';
      } else {
        status = Math.abs(val) <= amb ? 'GREEN' : Math.abs(val) <= red ? 'AMBER' : 'RED';
      }
      kpis.push({ name, category, value, unit, status, threshold, priorPeriodValue: priorValue, trend, description });
    };

    // Profitability KPIs
    const grossMargin = revenue !== 0 ? ((revenue - cogs) / revenue * 100) : 0;
    const netMargin = revenue !== 0 ? (netIncome / revenue * 100) : 0;
    addKPI('Gross Margin %', 'profitability', grossMargin.toFixed(1), 'percent', { amber: '20', red: '30' }, priorRevenue !== 0 ? ((priorRevenue - getPriorBal('5000')) / priorRevenue * 100).toFixed(1) : undefined, 'Gross profit / Revenue');
    addKPI('Net Margin %', 'profitability', netMargin.toFixed(1), 'percent', { amber: '5', red: '10' }, priorRevenue !== 0 ? (Math.abs(getPriorBal('3300')) / priorRevenue * 100).toFixed(1) : undefined, 'Net income / Revenue');

    // Liquidity KPIs
    const currentRatio = totalLiab !== 0 ? (totalAssets / totalLiab) : 0;
    const quickRatio = (cash + ar) / (totalLiab || 1);
    const dso = revenue !== 0 ? (ar / revenue * 365) : 0;
    const dpo = revenue !== 0 ? (ap / revenue * 365) : 0;
    addKPI('Current Ratio', 'liquidity', currentRatio.toFixed(2), 'ratio', { amber: '1.2', red: '1.0' }, undefined, 'Current assets / Current liabilities');
    addKPI('Quick Ratio', 'liquidity', quickRatio.toFixed(2), 'ratio', { amber: '0.8', red: '0.5' }, undefined, '(Cash + AR) / Current liabilities');
    addKPI('Days Sales Outstanding', 'liquidity', dso.toFixed(1), 'days', { amber: '45', red: '60' }, priorRevenue !== 0 ? (getPriorBal('1100') / priorRevenue * 365).toFixed(1) : undefined, 'AR / Revenue × 365');

    // Leverage KPIs
    const debtToEquity = totalEquity !== 0 ? (totalLiab / totalEquity) : 0;
    addKPI('Debt-to-Equity', 'leverage', debtToEquity.toFixed(2), 'ratio', { amber: '2.0', red: '3.0' }, undefined, 'Total liabilities / Total equity');

    // Growth KPIs
    const revenueGrowth = priorRevenue !== 0 ? ((revenue - priorRevenue) / priorRevenue * 100) : 0;
    const netIncomeGrowth = priorNetIncome !== 0 ? ((netIncome - priorNetIncome) / priorNetIncome * 100) : 0;
    addKPI('Revenue Growth %', 'growth', revenueGrowth.toFixed(1), 'percent', { amber: '5', red: '10' }, undefined, 'Period-over-period revenue change');
    addKPI('Net Income Growth %', 'growth', netIncomeGrowth.toFixed(1), 'percent', { amber: '10', red: '20' }, undefined, 'Period-over-period net income change');

    return {
      periodKey: dateKey,
      generatedAt: new Date(),
      kpis,
      summary: {
        greenCount: kpis.filter(k => k.status === 'GREEN').length,
        amberCount: kpis.filter(k => k.status === 'AMBER').length,
        redCount: kpis.filter(k => k.status === 'RED').length,
      },
    };
  }

  private getPriorPeriodDateKey(dateKey: string): string {
    const dimT = this.dimTime.getByDateKey(dateKey);
    if (!dimT) return dateKey;
    return this.dimTime.getPeriodEndDateKey(dimT.fiscalYear, dimT.fiscalPeriod - 1);
  }
}
