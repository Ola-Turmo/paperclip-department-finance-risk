/**
 * Cash Flow Statement — Operating, Investing, Financing activities (indirect method)
 */

export interface CashFlowSection { title: string; lines: { description: string; amount: number; }[]; total: number; }
export interface CashFlowStatement {
  periodStart: Date; periodEnd: Date; periodLabel: string;
  operating: CashFlowSection; investing: CashFlowSection; financing: CashFlowSection;
  netCashChange: number; beginningCash: number; endingCash: number;
}

export class CashFlowStatementService {
  async generate(params: {
    periodStart: Date; periodEnd: Date; periodLabel: string;
    // Operating (indirect method): starts with net income, adjusts for non-cash + working capital
    netIncome: number;
    depreciation: number; amortization: number; stockCompensation: number; otherNonCash: number;
    accountsReceivableChange: number; inventoryChange: number; accountsPayableChange: number;
    accruedExpensesChange: number; prepaidChange: number; otherWorkingCapitalChanges: number;
    // Investing
    capex: number; acquisitions: number; assetDisposals: number; otherInvesting: number;
    // Financing
    proceedsFromDebt: number; debtRepayments: number; stockRepurchases: number;
    dividendsPaid: number; otherFinancing: number;
    beginningCash: number;
  }): Promise<CashFlowStatement> {
    const makeSection = (title: string, items: { description: string; amount: number }[], total: number) => ({ title, lines: items, total });

    const operatingItems = [
      { description: 'Net Income', amount: params.netIncome },
      { description: 'Depreciation & Amortization', amount: params.depreciation + params.amortization },
      { description: 'Stock-Based Compensation', amount: params.stockCompensation },
      { description: 'Other Non-Cash Items', amount: params.otherNonCash },
      { description: 'Accounts Receivable Change', amount: params.accountsReceivableChange },
      { description: 'Inventory Change', amount: params.inventoryChange },
      { description: 'Accounts Payable Change', amount: params.accountsPayableChange },
      { description: 'Accrued Expenses Change', amount: params.accruedExpensesChange },
      { description: 'Prepaid Expenses Change', amount: params.prepaidChange },
      { description: 'Other Working Capital Changes', amount: params.otherWorkingCapitalChanges },
    ];
    const operatingTotal = operatingItems.reduce((s, i) => s + i.amount, 0);

    const investingItems = [
      { description: 'Capital Expenditures (CapEx)', amount: params.capex },
      { description: 'Acquisitions', amount: params.acquisitions },
      { description: 'Asset Disposal Proceeds', amount: params.assetDisposals },
      { description: 'Other Investing Activities', amount: params.otherInvesting },
    ];
    const investingTotal = investingItems.reduce((s, i) => s + i.amount, 0);

    const financingItems = [
      { description: 'Proceeds from Debt', amount: params.proceedsFromDebt },
      { description: 'Debt Repayments', amount: params.debtRepayments },
      { description: 'Stock Repurchases', amount: params.stockRepurchases },
      { description: 'Dividends Paid', amount: params.dividendsPaid },
      { description: 'Other Financing Activities', amount: params.otherFinancing },
    ];
    const financingTotal = financingItems.reduce((s, i) => s + i.amount, 0);

    const netCashChange = operatingTotal + investingTotal + financingTotal;
    const endingCash = params.beginningCash + netCashChange;

    return {
      periodStart: params.periodStart, periodEnd: params.periodEnd, periodLabel: params.periodLabel,
      operating: makeSection('Cash Flows from Operating Activities', operatingItems, operatingTotal),
      investing: makeSection('Cash Flows from Investing Activities', investingItems, investingTotal),
      financing: makeSection('Cash Flows from Financing Activities', financingItems, financingTotal),
      netCashChange, beginningCash: params.beginningCash, endingCash,
    };
  }

  formatAsText(cfs: CashFlowStatement): string {
    const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const line = (desc: string, amount: number, indent = 0) => `${'  '.repeat(indent)}${desc.padEnd(45)}${money(amount)}`;
    const lines: string[] = [];
    lines.push(`${'='.repeat(65)}`);
    lines.push(`CASH FLOW STATEMENT — ${cfs.periodLabel}`.padEnd(50));
    lines.push(`${'='.repeat(65)}`);
    for (const section of [cfs.operating, cfs.investing, cfs.financing]) {
      lines.push(''); lines.push(`--- ${section.title} ---`);
      for (const l of section.lines) lines.push(line(l.description, l.amount, 1));
      lines.push(`${'─'.repeat(65)}`); lines.push(line('Net', section.total));
    }
    lines.push('');
    lines.push(`${'='.repeat(65)}`);
    lines.push(line('Net Cash Change', cfs.netCashChange));
    lines.push(line('Beginning Cash', cfs.beginningCash));
    lines.push(`${'─'.repeat(65)}`);
    lines.push(line('ENDING CASH', cfs.endingCash));
    lines.push(`${'='.repeat(65)}`);
    return lines.join('\n');
  }
}
