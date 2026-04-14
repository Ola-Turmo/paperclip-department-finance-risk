/**
 * Month-End Package — Orchestrates all reports for period close
 */

import { TrialBalanceService } from './trial-balance.js';
import { IncomeStatementService } from './income-statement.js';
import { BalanceSheetService } from './balance-sheet.js';
import { CashFlowStatementService } from './cash-flow-statement.js';

export interface MonthEndPackageInput {
  periodStart: Date; periodEnd: Date; periodLabel: string; year: number;
  // Income Statement
  revenue: { code: string; name: string; amount: number; }[];
  cogs: { code: string; name: string; amount: number; }[];
  operatingExpenses: { code: string; name: string; amount: number; }[];
  otherIncome: { code: string; name: string; amount: number; }[];
  otherExpenses: { code: string; name: string; amount: number; }[];
  depreciation: number; amortization: number;
  // Balance Sheet
  cash: number; accountsReceivable: number; inventory: number; prepaidExpenses: number;
  totalCurrentAssets: number; fixedAssetsNet: number; otherAssets: number;
  accountsPayable: number; accruedExpenses: number; currentTaxPayable: number;
  currentPortionLongTermDebt: number; totalCurrentLiabilities: number;
  longTermDebt: number; deferredTaxLiabilities: number; otherNonCurrentLiabilities: number;
  commonStock: number; additionalPaidInCapital: number; retainedEarnings: number;
  ownerEquity: number; treasuryStock: number;
  // Cash Flow
  accountsReceivableChange: number; inventoryChange: number; accountsPayableChange: number;
  accruedExpensesChange: number; prepaidChange: number; otherWorkingCapitalChanges: number;
  capex: number; assetDisposals: number; proceedsFromDebt: number; debtRepayments: number;
  dividendsPaid: number; beginningCash: number;
  // GL accounts for trial balance
  glAccounts: { code: string; name: string; category: string; normalBalance: 'debit' | 'credit'; balance: number; }[];
}

export interface MonthEndPackage {
  generatedAt: Date; periodLabel: string;
  trialBalance: any; incomeStatement: any; balanceSheet: any; cashFlowStatement: any;
  checklist: { item: string; status: 'complete' | 'pending' | 'skipped'; notes?: string; }[];
  managementNarrative?: string;
}

export class MonthEndPackageService {
  constructor(
    private trialBalanceService: TrialBalanceService,
    private incomeStatementService: IncomeStatementService,
    private balanceSheetService: BalanceSheetService,
    private cashFlowStatementService: CashFlowStatementService,
  ) {}

  async generate(input: MonthEndPackageInput): Promise<MonthEndPackage> {
    const netIncome = (input.revenue.reduce((s, r) => s + r.amount, 0)
      - input.cogs.reduce((s, c) => s + c.amount, 0)
      - input.operatingExpenses.reduce((s, e) => s + e.amount, 0)
      + input.otherIncome.reduce((s, i) => s + i.amount, 0)
      - input.otherExpenses.reduce((s, e) => s + e.amount, 0));

    const [trialBalance, incomeStatement, balanceSheet, cashFlowStatement] = await Promise.all([
      this.trialBalanceService.generate({ asOfDate: input.periodEnd, periodLabel: input.periodLabel, accounts: input.glAccounts }),
      this.incomeStatementService.generate({
        periodStart: input.periodStart, periodEnd: input.periodEnd, periodLabel: input.periodLabel,
        revenue: input.revenue, cogs: input.cogs, operatingExpenses: input.operatingExpenses,
        otherIncome: input.otherIncome, otherExpenses: input.otherExpenses,
        depreciation: input.depreciation, amortization: input.amortization,
      }),
      this.balanceSheetService.generate({
        asOfDate: input.periodEnd, periodLabel: input.periodLabel,
        cash: input.cash, accountsReceivable: input.accountsReceivable, inventory: input.inventory,
        prepaidExpenses: input.prepaidExpenses, totalCurrentAssets: input.totalCurrentAssets,
        fixedAssetsNet: input.fixedAssetsNet, otherAssets: input.otherAssets,
        accountsPayable: input.accountsPayable, accruedExpenses: input.accruedExpenses,
        currentTaxPayable: input.currentTaxPayable, currentPortionLongTermDebt: input.currentPortionLongTermDebt,
        totalCurrentLiabilities: input.totalCurrentLiabilities, longTermDebt: input.longTermDebt,
        deferredTaxLiabilities: input.deferredTaxLiabilities, otherNonCurrentLiabilities: input.otherNonCurrentLiabilities,
        commonStock: input.commonStock, additionalPaidInCapital: input.additionalPaidInCapital,
        retainedEarnings: input.retainedEarnings, netIncomeYTD: netIncome, ownerEquity: input.ownerEquity,
        treasuryStock: input.treasuryStock, assetAccounts: [], liabilityAccounts: [], equityAccounts: [],
      }),
      this.cashFlowStatementService.generate({
        periodStart: input.periodStart, periodEnd: input.periodEnd, periodLabel: input.periodLabel,
        netIncome,
        depreciation: input.depreciation, amortization: input.amortization, stockCompensation: 0, otherNonCash: 0,
        accountsReceivableChange: input.accountsReceivableChange, inventoryChange: input.inventoryChange,
        accountsPayableChange: input.accountsPayableChange, accruedExpensesChange: input.accruedExpensesChange,
        prepaidChange: input.prepaidChange, otherWorkingCapitalChanges: input.otherWorkingCapitalChanges,
        capex: input.capex, acquisitions: 0, assetDisposals: input.assetDisposals, otherInvesting: 0,
        proceedsFromDebt: input.proceedsFromDebt, debtRepayments: input.debtRepayments,
        stockRepurchases: 0, dividendsPaid: input.dividendsPaid, otherFinancing: 0,
        beginningCash: input.beginningCash,
      }),
    ]);

    const checklist: { item: string; status: 'complete' | 'pending' | 'skipped'; notes?: string; }[] = [
      { item: 'Trial Balance is balanced', status: trialBalance.isBalanced ? 'complete' : 'pending', notes: trialBalance.isBalanced ? `Debits: ${trialBalance.totalDebits.toFixed(2)} | Credits: ${trialBalance.totalCredits.toFixed(2)}` : 'IMBALANCED - investigate' },
      { item: 'Balance Sheet is balanced', status: balanceSheet.isBalanced ? 'complete' : 'pending', notes: balanceSheet.isBalanced ? 'Assets = Liabilities + Equity' : `Gap: ${(balanceSheet.totalAssets - balanceSheet.liabilitiesAndEquity).toFixed(2)}` },
      { item: 'Income Statement ties to Balance Sheet', status: Math.abs(balanceSheet.equity.total - (input.retainedEarnings + netIncome)) < 0.01 ? 'complete' : 'pending', notes: `Net Income: ${netIncome.toFixed(2)} | Equity Change: ${balanceSheet.equity.total.toFixed(2)}` },
      { item: 'Cash Flow ties to Balance Sheet', status: Math.abs(cashFlowStatement.endingCash - input.cash) < 0.01 ? 'complete' : 'pending', notes: `Ending Cash: ${cashFlowStatement.endingCash.toFixed(2)} | BS Cash: ${input.cash.toFixed(2)}` },
      { item: 'Depreciation posted', status: input.depreciation > 0 ? 'complete' : 'skipped', notes: `Amount: ${input.depreciation.toFixed(2)}` },
      { item: 'All journal entries posted', status: 'pending', notes: 'Verify with GL team' },
      { item: 'AP aging reviewed', status: 'pending' },
      { item: 'AR aging reviewed', status: 'pending' },
      { item: 'Month-end close checklist signed off', status: 'pending' },
    ];

    return {
      generatedAt: new Date(), periodLabel: input.periodLabel,
      trialBalance, incomeStatement, balanceSheet, cashFlowStatement,
      checklist,
    };
  }
}
