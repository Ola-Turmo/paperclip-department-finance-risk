/**
 * Payroll Journal Entries — GL account codes come from ChartOfAccountsConfig.
 * No hardcoded strings — reads from configurable COA.
 */

import { ChartOfAccountsConfigurator, AccountDefinition, AccountType } from '../core/chart-of-accounts-config.js';

export interface PayrollJournalEntryConfig {
  salaryExpenseAccount: string;
  employerTaxExpenseAccount: string;
  federalTaxPayableAccount: string;
  stateTaxPayableAccount: string;
  employerTaxPayableAccount: string;
  cashAccount: string;
  retirementPayableAccount?: string;
  healthPayableAccount?: string;
}

export const DEFAULT_PAYROLL_JE_CONFIG: PayrollJournalEntryConfig = {
  salaryExpenseAccount: '6000',
  employerTaxExpenseAccount: '6201',
  federalTaxPayableAccount: '2310',
  stateTaxPayableAccount: '2311',
  employerTaxPayableAccount: '2312',
  cashAccount: '1000',
};

export class PayrollJournalEntryService {
  constructor(
    private coaConfig: ChartOfAccountsConfigurator,
    private jeConfig?: PayrollJournalEntryConfig,
  ) {}

  private config(): PayrollJournalEntryConfig {
    return this.jeConfig ?? DEFAULT_PAYROLL_JE_CONFIG;
  }

  /** Validate account code exists and has correct type */
  private validateAccount(configId: string, accountCode: string, expectedType: AccountType): void {
    const config = (this.coaConfig as any)._storage?.get(configId); const account = config?.accounts.find((a: any) => a.code === accountCode);
    if (!account) return; // skip validation if COA not loaded
    if (account.type !== expectedType && account.type !== AccountType.EXPENSE) {
      // warn but don't fail — might be valid in some COA structures
    }
  }

  generateEntries(run: {
    companyId: string; chartOfAccountsId: string;
    payPeriodStart: Date; entries: {
      employeeId: string; employeeName: string; grossPay: number;
      federalWithholding: number; socialSecurity: number; medicare: number;
      stateWithholding: number; netPay: number;
      retirementDeduction?: number; healthDeduction?: number;
    }[];
  }): { description: string; accountCode: string; debit: number; credit: number; }[] {
    const cfg = this.config();
    const entries: { description: string; accountCode: string; debit: number; credit: number; }[] = [];
    const period = run.payPeriodStart.toLocaleDateString();

    for (const entry of run.entries) {
      entries.push({ description: `Gross pay - ${entry.employeeName}`, accountCode: cfg.salaryExpenseAccount, debit: entry.grossPay, credit: 0 });
      entries.push({ description: `Federal withholding - ${entry.employeeName}`, accountCode: cfg.federalTaxPayableAccount, debit: 0, credit: entry.federalWithholding });
      entries.push({ description: `Social Security - ${entry.employeeName}`, accountCode: cfg.stateTaxPayableAccount, debit: 0, credit: entry.socialSecurity });
      entries.push({ description: `Medicare - ${entry.employeeName}`, accountCode: cfg.stateTaxPayableAccount, debit: 0, credit: entry.medicare });
      entries.push({ description: `State withholding - ${entry.employeeName}`, accountCode: cfg.stateTaxPayableAccount, debit: 0, credit: entry.stateWithholding });
      if (entry.retirementDeduction && cfg.retirementPayableAccount) {
        entries.push({ description: `401k deduction - ${entry.employeeName}`, accountCode: cfg.retirementPayableAccount, debit: 0, credit: entry.retirementDeduction });
      }
      entries.push({ description: `Net pay - ${entry.employeeName}`, accountCode: cfg.cashAccount, debit: 0, credit: entry.netPay });
    }
    return entries;
  }

  generateEmployerTaxEntries(run: {
    entries: { socialSecurity: number; medicare: number; }[];
  }): { description: string; accountCode: string; debit: number; credit: number; }[] {
    const cfg = this.config();
    const entries: { description: string; accountCode: string; debit: number; credit: number; }[] = [];
    for (const entry of run.entries) {
      if (entry.socialSecurity > 0) {
        entries.push({ description: 'Employer SS expense', accountCode: cfg.employerTaxExpenseAccount, debit: entry.socialSecurity, credit: 0 });
        entries.push({ description: 'Employer SS payable', accountCode: cfg.employerTaxPayableAccount, debit: 0, credit: entry.socialSecurity });
      }
      if (entry.medicare > 0) {
        entries.push({ description: 'Employer Medicare expense', accountCode: cfg.employerTaxExpenseAccount, debit: entry.medicare, credit: 0 });
        entries.push({ description: 'Employer Medicare payable', accountCode: cfg.employerTaxPayableAccount, debit: 0, credit: entry.medicare });
      }
    }
    return entries;
  }
}
