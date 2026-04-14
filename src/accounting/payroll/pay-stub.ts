/**
 * Pay Stub Generator — Formats payroll entries into employee pay stubs
 */

export interface PayStub {
  employeeId: string; employeeName: string;
  payPeriodStart: Date; payPeriodEnd: Date; payDate: Date;
  companyName: string;
  earnings: { description: string; hours?: number; rate?: number; amount: number; }[];
  taxes: { description: string; amount: number; }[];
  deductions: { description: string; amount: number; preTax: boolean; }[];
  grossPay: number; totalTaxes: number; totalDeductions: number; netPay: number;
}

export class PayStubGenerator {
  generate(run: any, employeeId: string): PayStub {
    const entry = run.entries.find((e: any) => e.employeeId === employeeId);
    if (!entry) throw new Error(`No payroll entry for employee ${employeeId}`);
    return {
      employeeId, employeeName: entry.employeeName,
      payPeriodStart: run.payPeriodStart, payPeriodEnd: run.payPeriodEnd, payDate: run.payDate,
      companyName: 'Company Name',
      earnings: [{ description: 'Regular Pay', amount: entry.grossPay }],
      taxes: [
        { description: 'Federal Withholding', amount: entry.federalWithholding },
        { description: 'Social Security', amount: entry.socialSecurity },
        { description: 'Medicare', amount: entry.medicare },
        { description: 'State Withholding', amount: entry.stateWithholding },
      ],
      deductions: [], grossPay: entry.grossPay,
      totalTaxes: entry.federalWithholding + entry.socialSecurity + entry.medicare + entry.stateWithholding,
      totalDeductions: entry.totalDeductions, netPay: entry.netPay,
    };
  }

  formatAsText(stub: PayStub): string {
    const lines: string[] = [];
    lines.push(`${'='.repeat(50)}`);
    lines.push(`PAY STUB — ${stub.employeeName}`.padEnd(50) + `${'='.repeat(10)}`);
    lines.push(`${'='.repeat(60)}`);
    lines.push(`Pay Period: ${stub.payPeriodStart.toLocaleDateString()} - ${stub.payPeriodEnd.toLocaleDateString()}`);
    lines.push(`Pay Date: ${stub.payDate.toLocaleDateString()}`);
    lines.push('');
    lines.push('EARNINGS');
    for (const e of stub.earnings) lines.push(`  ${e.description.padEnd(25)} $${e.amount.toFixed(2)}`);
    lines.push(`  ${'Gross Pay'.padEnd(25)} $${stub.grossPay.toFixed(2)}`);
    lines.push('');
    lines.push('TAXES');
    for (const t of stub.taxes) lines.push(`  ${t.description.padEnd(25)} -$${t.amount.toFixed(2)}`);
    lines.push(`  ${'Total Taxes'.padEnd(25)} -$${stub.totalTaxes.toFixed(2)}`);
    lines.push('');
    lines.push('DEDUCTIONS');
    for (const d of stub.deductions) lines.push(`  ${d.description.padEnd(25)} -$${d.amount.toFixed(2)}`);
    lines.push(`  ${'Total Deductions'.padEnd(25)} -$${stub.totalDeductions.toFixed(2)}`);
    lines.push('');
    lines.push(`${'='.repeat(60)}`);
    lines.push(`${'NET PAY'.padEnd(25)} $${stub.netPay.toFixed(2)}`.padEnd(40));
    lines.push(`${'='.repeat(60)}`);
    return lines.join('\n');
  }
}
