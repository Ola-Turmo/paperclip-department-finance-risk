/**
 * Income Statement (P&L) — Revenue, COGS, Gross Margin, Operating Expenses, Net Income
 */

export interface IncomeStatementLine { accountCode: string; accountName: string; amount: number; percentageOfRevenue?: number; }
export interface IncomeStatementSection { title: string; lines: IncomeStatementLine[]; total: number; }
export interface IncomeStatement {
  periodStart: Date; periodEnd: Date; periodLabel: string; comparativePeriodLabel?: string;
  sections: {
    revenue: IncomeStatementSection;
    cogs: IncomeStatementSection;
    grossProfit: IncomeStatementSection;
    operatingExpenses: IncomeStatementSection;
    operatingIncome: IncomeStatementSection;
    otherIncome: IncomeStatementSection;
    otherExpenses: IncomeStatementSection;
    netIncome: IncomeStatementSection;
  };
  revenue: number; cogs: number; grossProfit: number;
  operatingExpenses: number; operatingIncome: number;
  otherIncome: number; otherExpenses: number;
  netIncome: number; ebitda: number;
}

export class IncomeStatementService {
  async generate(params: {
    periodStart: Date; periodEnd: Date; periodLabel: string; comparativePeriodLabel?: string;
    revenue: { code: string; name: string; amount: number; }[];
    cogs: { code: string; name: string; amount: number; }[];
    operatingExpenses: { code: string; name: string; amount: number; }[];
    otherIncome: { code: string; name: string; amount: number; }[];
    otherExpenses: { code: string; name: string; amount: number; }[];
    depreciation?: number; amortization?: number;
  }): Promise<IncomeStatement> {
    const sumLines = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);
    const revenue = sumLines(params.revenue);
    const cogs = sumLines(params.cogs);
    const grossProfit = revenue - cogs;
    const opex = sumLines(params.operatingExpenses);
    const operatingIncome = grossProfit - opex;
    const otherIncome = sumLines(params.otherIncome);
    const otherExpenses = sumLines(params.otherExpenses);
    const netIncome = operatingIncome + otherIncome - otherExpenses;
    const depreciation = params.depreciation || 0;
    const ebitda = operatingIncome + depreciation;

    const pct = (amount: number, base: number) => base !== 0 ? Math.round((amount / base) * 10000) / 100 : 0;

    const makeSection = (title: string, lines: { code: string; name: string; amount: number }[], total: number) => ({
      title, total,
      lines: lines.map(l => ({ accountCode: l.code, accountName: l.name, amount: l.amount, percentageOfRevenue: pct(l.amount, revenue) })),
    });

    return {
      periodStart: params.periodStart, periodEnd: params.periodEnd, periodLabel: params.periodLabel,
      comparativePeriodLabel: params.comparativePeriodLabel,
      sections: {
        revenue: makeSection('Revenue', params.revenue, revenue),
        cogs: makeSection('Cost of Goods Sold', params.cogs, cogs),
        grossProfit: { title: 'Gross Profit', lines: [], total: grossProfit },
        operatingExpenses: makeSection('Operating Expenses', params.operatingExpenses, opex),
        operatingIncome: { title: 'Operating Income', lines: [], total: operatingIncome },
        otherIncome: makeSection('Other Income', params.otherIncome, otherIncome),
        otherExpenses: makeSection('Other Expenses', params.otherExpenses, otherExpenses),
        netIncome: { title: 'Net Income', lines: [], total: netIncome },
      },
      revenue, cogs, grossProfit, operatingExpenses: opex, operatingIncome, otherIncome, otherExpenses, netIncome, ebitda,
    };
  }

  formatAsText(stmt: IncomeStatement): string {
    const lines: string[] = [];
    const pad = (s: string, w: number) => s.padEnd(w);
    const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const line = (label: string, amount: number, indent = 0) => `${'  '.repeat(indent)}${pad(label, 40)}${money(amount)}`;
    const pct = (n: number) => `(${n.toFixed(1)}%)`;

    lines.push(`${'='.repeat(65)}`);
    lines.push(`INCOME STATEMENT — ${stmt.periodLabel}`.padEnd(50));
    lines.push(`${'='.repeat(65)}`);
    lines.push('');
    lines.push(line('Revenue', stmt.revenue));
    for (const l of stmt.sections.revenue.lines) lines.push(line(`  ${l.accountName}`, l.amount, 1));
    lines.push(`${'─'.repeat(65)}`);
    lines.push(line('Cost of Goods Sold', -stmt.cogs));
    for (const l of stmt.sections.cogs.lines) lines.push(line(`  ${l.accountName}`, -l.amount, 1));
    lines.push(`${'─'.repeat(65)}`);
    lines.push(line('GROSS PROFIT', stmt.grossProfit));
    lines.push(`  Gross Margin: ${stmt.revenue > 0 ? ((stmt.grossProfit / stmt.revenue) * 100).toFixed(1) : 0}%`);
    lines.push('');
    lines.push(line('Operating Expenses', -stmt.operatingExpenses));
    for (const l of stmt.sections.operatingExpenses.lines) lines.push(line(`  ${l.accountName}`, -l.amount, 1));
    lines.push(`${'─'.repeat(65)}`);
    lines.push(line('OPERATING INCOME', stmt.operatingIncome));
    lines.push('');
    if (stmt.otherIncome > 0) { lines.push(line('Other Income', stmt.otherIncome)); }
    if (stmt.otherExpenses > 0) { lines.push(line('Other Expenses', -stmt.otherExpenses)); }
    lines.push(`${'='.repeat(65)}`);
    lines.push(line('NET INCOME', stmt.netIncome));
    lines.push(`  Net Margin: ${stmt.revenue > 0 ? ((stmt.netIncome / stmt.revenue) * 100).toFixed(1) : 0}%`);
    lines.push(`  EBITDA: ${money(stmt.ebitda)}`);
    lines.push(`${'='.repeat(65)}`);
    return lines.join('\n');
  }
}
