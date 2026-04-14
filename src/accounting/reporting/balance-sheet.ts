/**
 * Balance Sheet — Assets, Liabilities, Equity at a point in time
 */

export interface BalanceSheetLine { accountCode: string; accountName: string; amount: number; }
export interface BalanceSheetSection { title: string; lines: BalanceSheetLine[]; total: number; }
export interface BalanceSheet {
  asOfDate: Date; periodLabel: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  totalAssets: number; totalLiabilities: number; totalEquity: number;
  liabilitiesAndEquity: number; isBalanced: boolean;
}

export class BalanceSheetService {
  async generate(params: {
    asOfDate: Date; periodLabel: string;
    // Assets
    cash: number; accountsReceivable: number; inventory: number; prepaidExpenses: number;
    totalCurrentAssets: number; fixedAssetsNet: number; otherAssets: number;
    // Liabilities
    accountsPayable: number; accruedExpenses: number; currentTaxPayable: number;
    currentPortionLongTermDebt: number; totalCurrentLiabilities: number;
    longTermDebt: number; deferredTaxLiabilities: number; otherNonCurrentLiabilities: number;
    // Equity
    commonStock: number; additionalPaidInCapital: number; retainedEarnings: number;
    netIncomeYTD: number; ownerEquity: number; treasuryStock: number;
    // Chart of accounts (for detail lines)
    assetAccounts: { code: string; name: string; amount: number; }[];
    liabilityAccounts: { code: string; name: string; amount: number; }[];
    equityAccounts: { code: string; name: string; amount: number; }[];
  }): Promise<BalanceSheet> {
    const totalAssets = params.totalCurrentAssets + params.fixedAssetsNet + params.otherAssets;
    const totalLiabilities = params.totalCurrentLiabilities + params.longTermDebt + params.deferredTaxLiabilities + params.otherNonCurrentLiabilities;
    const totalEquity = params.commonStock + params.additionalPaidInCapital + params.retainedEarnings + params.netIncomeYTD + params.ownerEquity + params.treasuryStock;
    const liabilitiesAndEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - liabilitiesAndEquity) < 0.01;

    const makeSection = (title: string, lines: BalanceSheetLine[], total: number): BalanceSheetSection => ({ title, total, lines });
    const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    const defaultAssetLines: BalanceSheetLine[] = [
      { accountCode: '1000', accountName: 'Cash', amount: params.cash },
      { accountCode: '1100', accountName: 'Accounts Receivable', amount: params.accountsReceivable },
      { accountCode: '1200', accountName: 'Inventory', amount: params.inventory },
      { accountCode: '1300', accountName: 'Prepaid Expenses', amount: params.prepaidExpenses },
      { accountCode: '1500', accountName: 'Fixed Assets (Net)', amount: params.fixedAssetsNet },
      { accountCode: '1900', accountName: 'Other Assets', amount: params.otherAssets },
    ];
    const defaultLiabilityLines: BalanceSheetLine[] = [
      { accountCode: '2000', accountName: 'Accounts Payable', amount: params.accountsPayable },
      { accountCode: '2100', accountName: 'Accrued Expenses', amount: params.accruedExpenses },
      { accountCode: '2200', accountName: 'Current Tax Payable', amount: params.currentTaxPayable },
      { accountCode: '2500', accountName: 'Long-Term Debt', amount: params.longTermDebt },
      { accountCode: '2900', accountName: 'Deferred Tax Liabilities', amount: params.deferredTaxLiabilities },
    ];
    const defaultEquityLines: BalanceSheetLine[] = [
      { accountCode: '3000', accountName: 'Common Stock', amount: params.commonStock },
      { accountCode: '3100', accountName: 'Additional Paid-In Capital', amount: params.additionalPaidInCapital },
      { accountCode: '3200', accountName: 'Retained Earnings', amount: params.retainedEarnings },
      { accountCode: '3300', accountName: 'Net Income YTD', amount: params.netIncomeYTD },
      { accountCode: '3400', accountName: 'Owner Equity', amount: params.ownerEquity },
    ];

    return {
      asOfDate: params.asOfDate, periodLabel: params.periodLabel,
      assets: makeSection('ASSETS', params.assetAccounts.length ? params.assetAccounts.map(a => ({ accountCode: a.code, accountName: a.name, amount: a.amount })) : defaultAssetLines, totalAssets),
      liabilities: makeSection('LIABILITIES', params.liabilityAccounts.length ? params.liabilityAccounts.map(a => ({ accountCode: a.code, accountName: a.name, amount: a.amount })) : defaultLiabilityLines, totalLiabilities),
      equity: makeSection('EQUITY', params.equityAccounts.length ? params.equityAccounts.map(a => ({ accountCode: a.code, accountName: a.name, amount: a.amount })) : defaultEquityLines, totalEquity),
      totalAssets, totalLiabilities, totalEquity, liabilitiesAndEquity, isBalanced,
    };
  }

  formatAsText(bs: BalanceSheet): string {
    const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const line = (label: string, amount: number, indent = 0) => `${'  '.repeat(indent)}${label.padEnd(40)}${money(amount)}`;
    const sub = (amount: number) => money(amount);
    const sections = [
      { name: 'ASSETS', section: bs.assets },
      { name: 'LIABILITIES', section: bs.liabilities },
      { name: 'EQUITY', section: bs.equity },
    ];
    const lines: string[] = [];
    lines.push(`${'='.repeat(65)}`);
    lines.push(`BALANCE SHEET — As of ${bs.asOfDate.toLocaleDateString()}`.padEnd(50));
    lines.push(`${'='.repeat(65)}`);
    for (const s of sections) {
      lines.push('');
      lines.push(`--- ${s.name} ---`);
      for (const l of s.section.lines) lines.push(line(l.accountName, l.amount, 1));
      lines.push(line(s.section.title.replace('S', ' Total ').replace('E', ' Total '), s.section.total));
      lines.push('');
    }
    lines.push(`${'─'.repeat(65)}`);
    lines.push(line('TOTAL LIABILITIES + EQUITY', bs.liabilitiesAndEquity));
    lines.push(`${'─'.repeat(65)}`);
    const status = bs.isBalanced ? '✅ BALANCED' : '❌ OUT OF BALANCE';
    lines.push(`${status} | Assets: ${money(bs.totalAssets)} | L+E: ${money(bs.liabilitiesAndEquity)}`);
    return lines.join('\n');
  }
}
