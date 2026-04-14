/**
 * Cash Flow Statement — uses ChartOfAccountsConfig to classify accounts.
 */

import { ChartOfAccountsConfigurator, AccountType } from '../core/chart-of-accounts-config.js';

export interface CashFlowStatement {
  periodStart: string; periodEnd: string; periodLabel: string;
  operating: { netIncome: number; adjustments: { description: string; amount: number; }[]; total: number; };
  investing: { items: { description: string; amount: number; }[]; total: number; };
  financing: { items: { description: string; amount: number; }[]; total: number; };
  beginningCash: number; endingCash: number; netChange: number;
}

export class CashFlowService {
  constructor(private coaConfig: ChartOfAccountsConfigurator) {}

  async generate(params: {
    periodStart: string; periodEnd: string; periodLabel: string; chartOfAccountsId: string;
    accountBalances: { code: string; name: string; type: AccountType; amount: number; }[];
    netIncome: number; depreciation: number; amortization: number;
    beginningCash: number;
    investingItems?: { description: string; amount: number; }[];
    financingItems?: { description: string; amount: number; }[];
  }): Promise<CashFlowStatement> {
    const coa = await this.coaConfig.get(params.chartOfAccountsId);
    const getType = (code: string) => coa?.accounts.find(a => a.code === code)?.type;

    const adjustments: { description: string; amount: number; }[] = [];
    if (params.depreciation > 0) adjustments.push({ description: 'Depreciation', amount: params.depreciation });
    if (params.amortization > 0) adjustments.push({ description: 'Amortization', amount: params.amortization });

    // Indirect method: changes in working capital from balance sheet accounts
    for (const bal of params.accountBalances) {
      const type = getType(bal.code) ?? bal.type;
      if (type === AccountType.ASSET && !bal.name.toLowerCase().includes('cash')) {
        adjustments.push({ description: `Change in ${bal.name}`, amount: -bal.amount });
      } else if (type === AccountType.LIABILITY) {
        adjustments.push({ description: `Change in ${bal.name}`, amount: bal.amount });
      }
    }

    const operatingTotal = params.netIncome + adjustments.reduce((s, a) => s + a.amount, 0);
    const investingTotal = (params.investingItems || []).reduce((s, i) => s + i.amount, 0);
    const financingTotal = (params.financingItems || []).reduce((s, i) => s + i.amount, 0);
    const netChange = operatingTotal + investingTotal + financingTotal;
    const endingCash = params.beginningCash + netChange;

    return {
      periodStart: params.periodStart, periodEnd: params.periodEnd, periodLabel: params.periodLabel,
      operating: { netIncome: params.netIncome, adjustments, total: operatingTotal },
      investing: { items: params.investingItems || [], total: investingTotal },
      financing: { items: params.financingItems || [], total: financingTotal },
      beginningCash: params.beginningCash, endingCash, netChange,
    };
  }
}
