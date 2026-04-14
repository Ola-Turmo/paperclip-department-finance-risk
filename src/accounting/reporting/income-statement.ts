/**
 * Income Statement — account types/revenue classification come from ChartOfAccountsConfig.
 */

import { ChartOfAccountsConfigurator, AccountType } from '../core/chart-of-accounts-config.js';

export interface IncomeStatementSection { title: string; lines: { accountCode: string; accountName: string; amount: number; percentageOfRevenue?: number; }[]; total: number; }
export interface IncomeStatement {
  periodStart: Date; periodEnd: Date; periodLabel: string; chartOfAccountsId: string;
  sections: {
    revenue: IncomeStatementSection; cogs: IncomeStatementSection;
    grossProfit: IncomeStatementSection; operatingExpenses: IncomeStatementSection;
    operatingIncome: IncomeStatementSection; otherIncome: IncomeStatementSection;
    otherExpenses: IncomeStatementSection; netIncome: IncomeStatementSection;
  };
  revenue: number; cogs: number; grossProfit: number; operatingExpenses: number;
  operatingIncome: number; otherIncome: number; otherExpenses: number; netIncome: number; ebitda: number;
}

export class IncomeStatementService {
  constructor(private coaConfig: ChartOfAccountsConfigurator) {}

  async generate(params: {
    periodStart: Date; periodEnd: Date; periodLabel: string; chartOfAccountsId: string;
    accounts: { code: string; name: string; type: AccountType; amount: number; }[];
    depreciation?: number; amortization?: number;
  }): Promise<IncomeStatement> {
    const revenue = params.accounts.filter(a => a.type === AccountType.REVENUE).reduce((s, a) => s + a.amount, 0);
    const cogs = params.accounts.filter(a => a.type === AccountType.EXPENSE && a.name.toLowerCase().includes('cost of goods')).reduce((s, a) => s + a.amount, 0);
    const grossProfit = revenue - cogs;
    const opex = params.accounts.filter(a => a.type === AccountType.EXPENSE && !a.name.toLowerCase().includes('cost of goods') && !a.name.toLowerCase().includes('income tax')).reduce((s, a) => s + a.amount, 0);
    const operatingIncome = grossProfit - opex;
    const otherIncome = params.accounts.filter(a => a.type === AccountType.OTHER_INCOME).reduce((s, a) => s + a.amount, 0);
    const otherExpenses = params.accounts.filter(a => a.type === AccountType.OTHER_EXPENSE).reduce((s, a) => s + a.amount, 0);
    const netIncome = operatingIncome + otherIncome - otherExpenses;
    const dep = params.depreciation || 0;
    const ebitda = operatingIncome + dep;

    const pct = (amount: number, base: number) => base !== 0 ? Math.round((amount / base) * 10000) / 100 : 0;
    const makeSection = (title: string, lines: typeof params.accounts, total: number) => ({
      title, total,
      lines: lines.map(l => ({ accountCode: l.code, accountName: l.name, amount: l.amount, percentageOfRevenue: pct(l.amount, revenue) })),
    });

    return {
      periodStart: params.periodStart, periodEnd: params.periodEnd, periodLabel: params.periodLabel, chartOfAccountsId: params.chartOfAccountsId,
      sections: {
        revenue: makeSection('Revenue', params.accounts.filter(a => a.type === AccountType.REVENUE), revenue),
        cogs: makeSection('Cost of Goods Sold', params.accounts.filter(a => a.type === AccountType.EXPENSE && a.name.toLowerCase().includes('cost of goods')), cogs),
        grossProfit: { title: 'Gross Profit', lines: [], total: grossProfit },
        operatingExpenses: makeSection('Operating Expenses', params.accounts.filter(a => a.type === AccountType.EXPENSE && !a.name.toLowerCase().includes('cost of goods') && !a.name.toLowerCase().includes('income tax')), opex),
        operatingIncome: { title: 'Operating Income', lines: [], total: operatingIncome },
        otherIncome: makeSection('Other Income', params.accounts.filter(a => a.type === AccountType.OTHER_INCOME), otherIncome),
        otherExpenses: makeSection('Other Expenses', params.accounts.filter(a => a.type === AccountType.OTHER_EXPENSE), otherExpenses),
        netIncome: { title: 'Net Income', lines: [], total: netIncome },
      },
      revenue, cogs, grossProfit, operatingExpenses: opex, operatingIncome, otherIncome, otherExpenses, netIncome, ebitda,
    };
  }
}
