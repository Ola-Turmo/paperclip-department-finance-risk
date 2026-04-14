/**
 * Payroll Journal Entries — GL entries generated from payroll runs
 */

export interface PayrollJournalEntry { description: string; accountCode: string; debit: number; credit: number; }

export class PayrollJournalEntryService {
  /**
   * Generate GL journal entries from a payroll run.
   * For each employee:
   *   Dr Salary/Wages Expense         grossPay
   *   Cr Federal Tax Payable          federalWithholding
   *   Cr Social Security Payable      socialSecurity
   *   Cr Medicare Payable             medicare
   *   Cr State Tax Payable            stateWithholding
   *   Cr Employee 401k Contribution   employee401k
   *   Cr Health Insurance Payable     employeeHealth
   *   Cr Cash/Bank                    netPay
   */
  generateEntries(run: any): PayrollJournalEntry[] {
    const entries: PayrollJournalEntry[] = [];
    for (const entry of run.entries) {
      // Salary expense
      entries.push({ description: `Payroll ${run.payPeriodStart.toLocaleDateString()} - ${entry.employeeName} gross pay`, accountCode: '6200', debit: entry.grossPay, credit: 0 });
      // Federal withholding
      entries.push({ description: `Federal tax withholding - ${entry.employeeName}`, accountCode: '2310', debit: 0, credit: entry.federalWithholding });
      // Social Security
      entries.push({ description: `Social Security withholding - ${entry.employeeName}`, accountCode: '2311', debit: 0, credit: entry.socialSecurity });
      // Medicare
      entries.push({ description: `Medicare withholding - ${entry.employeeName}`, accountCode: '2312', debit: 0, credit: entry.medicare });
      // State withholding
      entries.push({ description: `State tax withholding - ${entry.employeeName}`, accountCode: '2313', debit: 0, credit: entry.stateWithholding });
      // Net pay (cash/bank)
      entries.push({ description: `Net payroll - ${entry.employeeName}`, accountCode: '1000', debit: 0, credit: entry.netPay });
    }
    return entries;
  }

  generateEmployerTaxEntries(run: any): PayrollJournalEntry[] {
    const entries: PayrollJournalEntry[] = [];
    for (const entry of run.entries) {
      entries.push({ description: `Employer SS contribution - ${entry.employeeName}`, accountCode: '6201', debit: entry.socialSecurity, credit: 0 });
      entries.push({ description: `Employer Medicare contribution - ${entry.employeeName}`, accountCode: '6202', debit: entry.medicare, credit: 0 });
      entries.push({ description: `SS Payable - Employer portion`, accountCode: '2314', debit: 0, credit: entry.socialSecurity });
      entries.push({ description: `Medicare Payable - Employer portion`, accountCode: '2315', debit: 0, credit: entry.medicare });
    }
    return entries;
  }
}
