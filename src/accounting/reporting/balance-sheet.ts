/**
 * Balance Sheet — account codes resolved from ChartOfAccountsConfig.
 * Flexible: any country, any account code scheme.
 */

import { ChartOfAccountsConfigurator, AccountDefinition, AccountType, AccountNormalBalance } from '../core/chart-of-accounts-config.js';

export interface BalanceSheetLine { accountCode: string; accountName: string; amount: number; }
export interface BalanceSheetSection { title: string; total: number; lines: BalanceSheetLine[]; }
export interface BalanceSheet {
  asOfDate: string; periodLabel: string; chartOfAccountsId: string;
  assets: BalanceSheetSection; liabilities: BalanceSheetSection; equity: BalanceSheetSection;
  totalAssets: number; totalLiabilities: number; totalEquity: number;
  liabilitiesAndEquity: number; isBalanced: boolean;
}

export class BalanceSheetService {
  constructor(private coaConfig: ChartOfAccountsConfigurator) {}

  async generate(params: {
    asOfDate: string; periodLabel: string; chartOfAccountsId: string;
    accountBalances: { code: string; amount: number }[];
    retainedEarnings: number; netIncomeYTD: number;
    ownerEquity?: number;
  }): Promise<BalanceSheet> {
    const coa = await this.coaConfig.get(params.chartOfAccountsId);
    const accounts = params.accountBalances;

    const getName = (code: string) => {
      const def = coa?.accounts.find(a => a.code === code);
      return def?.name ?? code;
    };

    const assetAccounts = accounts.filter(a => {
      const def = coa?.accounts.find(x => x.code === a.code);
      return def?.type === AccountType.ASSET;
    });
    const liabilityAccounts = accounts.filter(a => {
      const def = coa?.accounts.find(x => x.code === a.code);
      return def?.type === AccountType.LIABILITY;
    });
    const equityAccounts = accounts.filter(a => {
      const def = coa?.accounts.find(x => x.code === a.code);
      return def?.type === AccountType.EQUITY;
    });

    const totalAssets = assetAccounts.reduce((s, a) => s + a.amount, 0);
    const totalLiabilities = liabilityAccounts.reduce((s, a) => s + a.amount, 0);
    const equityTotal = equityAccounts.reduce((s, a) => s + a.amount, 0)
      + params.retainedEarnings + params.netIncomeYTD + (params.ownerEquity || 0);
    const liabilitiesAndEquity = totalLiabilities + equityTotal;
    const isBalanced = Math.abs(totalAssets - liabilitiesAndEquity) < 0.01;

    const makeSection = (title: string, accts: typeof accounts, total: number): BalanceSheetSection => ({
      title, total,
      lines: accts.map(a => ({ accountCode: a.code, accountName: getName(a.code), amount: a.amount })),
    });

    return {
      asOfDate: params.asOfDate, periodLabel: params.periodLabel, chartOfAccountsId: params.chartOfAccountsId,
      assets: makeSection('ASSETS', assetAccounts, totalAssets),
      liabilities: makeSection('LIABILITIES', liabilityAccounts, totalLiabilities),
      equity: makeSection('EQUITY', equityAccounts, equityTotal),
      totalAssets, totalLiabilities, totalEquity: equityTotal, liabilitiesAndEquity, isBalanced,
    };
  }
}
