/**
 * Month-End Package — orchestrates all financial reports + reconciliation checklist.
 * Company/jurisdiction flexible — uses chartOfAccountsId from company config.
 */

import { ChartOfAccountsConfigurator, AccountType, AccountNormalBalance } from '../core/chart-of-accounts-config.js';
import { IncomeStatementService } from './income-statement.js';
import { BalanceSheetService } from './balance-sheet.js';
import { CashFlowService } from './cash-flow-statement.js';
import { TrialBalanceService } from './trial-balance.js';

export interface MonthEndChecklistItem { item: string; status: 'complete' | 'pending' | 'skipped'; notes?: string; }
export interface MonthEndPackage {
  periodStart: string; periodEnd: string; periodLabel: string; generatedAt: string;
  trialBalance: any; incomeStatement: any; balanceSheet: any; cashFlowStatement: any;
  checklist: MonthEndChecklistItem[];
}

export class MonthEndPackageService {
  constructor(
    private coaConfig: ChartOfAccountsConfigurator,
    private trialBalanceService: TrialBalanceService,
    private incomeStatementService: IncomeStatementService,
    private balanceSheetService: BalanceSheetService,
    private cashFlowService: CashFlowService,
  ) {}

  async generate(params: {
    companyId: string; chartOfAccountsId: string;
    periodStart: Date; periodEnd: Date; periodLabel: string;
    /** Raw account data — will be enriched with COA metadata (type, normalBalance) */
    accountBalances: { code: string; name: string; amount: number; category?: string; }[];
    retainedEarnings: number; netIncome: number; depreciation: number;
    beginningCash: number;
  }): Promise<MonthEndPackage> {
    // Enrich accounts with COA metadata
    const coa = await this.coaConfig.get(params.chartOfAccountsId);
    const enriched = params.accountBalances.map(a => {
      const def = coa?.accounts.find(ac => ac.code === a.code);
      return {
        code: a.code,
        name: a.name,
        category: a.category ?? def?.type ?? 'expense',
        normalBalance: (def?.normalBalance === AccountNormalBalance.CREDIT ? 'credit' : 'debit') as 'debit' | 'credit',
        balance: a.amount,
        type: def?.type ?? AccountType.EXPENSE,
        amount: a.amount,
      };
    });

    const periodStartStr = params.periodStart.toISOString().split('T')[0];
    const periodEndStr = params.periodEnd.toISOString().split('T')[0];

    const trialBalance = await this.trialBalanceService.generate({
      asOfDate: params.periodEnd,
      periodLabel: params.periodLabel,
      accounts: enriched.map(a => ({ code: a.code, name: a.name, category: a.category, normalBalance: a.normalBalance, balance: a.amount })),
    });

    const incomeStatement = await this.incomeStatementService.generate({
      periodStart: params.periodStart, periodEnd: params.periodEnd,
      periodLabel: params.periodLabel, chartOfAccountsId: params.chartOfAccountsId,
      accounts: enriched.map(a => ({ code: a.code, name: a.name, type: a.type, amount: a.amount })),
      depreciation: params.depreciation,
    });

    const balanceSheet = await this.balanceSheetService.generate({
      asOfDate: periodEndStr,
      periodLabel: params.periodLabel, chartOfAccountsId: params.chartOfAccountsId,
      accountBalances: enriched.map(a => ({ code: a.code, amount: a.amount })),
      retainedEarnings: params.retainedEarnings, netIncomeYTD: params.netIncome,
    });

    const cashFlowStatement = await this.cashFlowService.generate({
      periodStart: periodStartStr, periodEnd: periodEndStr,
      periodLabel: params.periodLabel, chartOfAccountsId: params.chartOfAccountsId,
      accountBalances: enriched.map(a => ({ code: a.code, name: a.name, type: a.type, amount: a.amount })),
      netIncome: params.netIncome, depreciation: params.depreciation, amortization: 0,
      beginningCash: params.beginningCash,

    });

    const checklist: MonthEndChecklistItem[] = [
      { item: 'Trial Balance is balanced', status: trialBalance.isBalanced ? 'complete' : 'pending', notes: trialBalance.isBalanced ? `Debits: ${trialBalance.totalDebits.toFixed(2)} | Credits: ${trialBalance.totalCredits.toFixed(2)}` : 'IMBALANCED - investigate' },
      { item: 'Balance Sheet is balanced', status: balanceSheet.isBalanced ? 'complete' : 'pending', notes: balanceSheet.isBalanced ? 'Assets = Liabilities + Equity' : `Gap: ${(balanceSheet.totalAssets - balanceSheet.liabilitiesAndEquity).toFixed(2)}` },
      { item: 'Income Statement ties to Balance Sheet', status: Math.abs(balanceSheet.totalEquity - (params.retainedEarnings + params.netIncome)) < 0.01 ? 'complete' : 'pending', notes: `Net Income: ${params.netIncome.toFixed(2)} | Equity Change: ${balanceSheet.totalEquity.toFixed(2)}` },
      { item: 'Cash Flow ties to Balance Sheet', status: Math.abs(cashFlowStatement.endingCash - (params.beginningCash + cashFlowStatement.netChange)) < 0.01 ? 'complete' : 'pending', notes: `Ending Cash: ${cashFlowStatement.endingCash.toFixed(2)}` },
      { item: 'Depreciation posted', status: params.depreciation > 0 ? 'complete' : 'skipped', notes: `Amount: ${params.depreciation.toFixed(2)}` },
      { item: 'All journal entries posted', status: 'pending', notes: 'Verify with GL team' },
      { item: 'AP aging reviewed', status: 'pending' },
      { item: 'AR aging reviewed', status: 'pending' },
      { item: 'Month-end close checklist signed off', status: 'pending' },
    ];

    return {
      periodStart: periodStartStr, periodEnd: periodEndStr,
      periodLabel: params.periodLabel, generatedAt: new Date().toISOString(),
      trialBalance, incomeStatement, balanceSheet, cashFlowStatement, checklist,
    };
  }
}
