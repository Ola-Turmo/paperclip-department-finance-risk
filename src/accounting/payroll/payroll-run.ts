/**
 * Payroll Run — configurable per company payroll frequency and jurisdiction.
 */

import { TaxWithholdingService } from './tax-withholding.js';
import { BenefitDeductionService, DeductionElection } from './benefit-deductions.js';
import { PayrollJournalEntryService } from './payroll-journal-entries.js';

export enum PayrollStatus { DRAFT = 'draft', APPROVED = 'approved', PROCESSED = 'processed', CANCELLED = 'cancelled' }

export interface PayrollEntry {
  employeeId: string; employeeName: string;
  hoursWorked?: number; hourlyRate?: number; salary?: number;
  grossPay: number;
  federalWithholding: number; socialSecurity: number; medicare: number;
  stateWithholding: number; localWithholding: number;
  totalWithholding: number; netPay: number;
  benefitDeductions: { planId: string; type: string; description: string; employeeDeduction: number; employerContribution: number; preTax: boolean; }[];
  employerTaxExpense: number;
}

export interface PayrollRunData {
  companyId: string; payPeriodStart: Date; payPeriodEnd: Date; payDate: Date;
  entries: PayrollEntry[];
  totalGross: number; totalNet: number; totalWithholding: number; totalEmployerTax: number;
  status: PayrollStatus;
}

export class PayrollRunService {
  constructor(
    private withholdingService: TaxWithholdingService,
    private benefitService: BenefitDeductionService,
    private journalEntryService: PayrollJournalEntryService,
  ) {}

  async calculatePayroll(params: {
    companyId: string;
    employees: {
      id: string; name: string; grossPay: number; ytdWages: number;
      federalJurisdictionId: string; filingStatus: string;
      federalAllowances: number; federalAdditionalWithholding: number;
      stateJurisdictionId?: string; stateAllowances?: number;
      benefitElections?: DeductionElection[];
    }[];
    payPeriodStart: Date; payPeriodEnd: Date; payDate: Date;
  }): Promise<PayrollRunData> {
    const entries: PayrollEntry[] = [];
    const year = params.payPeriodStart.getFullYear();

    for (const emp of params.employees) {
      const withholding = await this.withholdingService.calculateWithholding({
        grossPay: emp.grossPay, ytdWages: emp.ytdWages,
        federalJurisdictionId: emp.federalJurisdictionId,
        filingStatus: emp.filingStatus,
        federalAllowances: emp.federalAllowances,
        federalAdditionalWithholding: emp.federalAdditionalWithholding,
        stateJurisdictionId: emp.stateJurisdictionId,
        stateAllowances: emp.stateAllowances,
      });

      const deductions = emp.benefitElections
        ? await this.benefitService.calculateDeductions(emp.benefitElections, emp.grossPay, 'biweekly', year)
        : [];

      const totalDeductions = deductions.reduce((s, d) => s + d.employeeDeduction, 0);
      const taxableGross = emp.grossPay - deductions.filter(d => d.preTax).reduce((s, d) => s + d.employeeDeduction, 0);

      const netPay = Math.max(0, emp.grossPay - withholding.totalWithholding - totalDeductions);
      const employerTax = withholding.socialSecurity + withholding.medicare;

      entries.push({
        employeeId: emp.id, employeeName: emp.name,
        grossPay: emp.grossPay,
        federalWithholding: withholding.federalWithholding,
        socialSecurity: withholding.socialSecurity,
        medicare: withholding.medicare,
        stateWithholding: withholding.stateWithholding,
        localWithholding: 0,
        totalWithholding: withholding.totalWithholding,
        netPay,
        benefitDeductions: deductions,
        employerTaxExpense: employerTax,
      });
    }

    return {
      companyId: params.companyId,
      payPeriodStart: params.payPeriodStart,
      payPeriodEnd: params.payPeriodEnd,
      payDate: params.payDate,
      entries,
      totalGross: entries.reduce((s, e) => s + e.grossPay, 0),
      totalNet: entries.reduce((s, e) => s + e.netPay, 0),
      totalWithholding: entries.reduce((s, e) => s + e.totalWithholding, 0),
      totalEmployerTax: entries.reduce((s, e) => s + e.employerTaxExpense, 0),
      status: PayrollStatus.DRAFT,
    };
  }

  async generateJournalEntries(run: PayrollRunData): Promise<{ description: string; accountCode: string; debit: number; credit: number; }[]> {
    return this.journalEntryService.generateEntries({
      companyId: run.companyId, chartOfAccountsId: '',
      payPeriodStart: run.payPeriodStart,
      entries: run.entries.map(e => ({
        employeeId: e.employeeId, employeeName: e.employeeName,
        grossPay: e.grossPay,
        federalWithholding: e.federalWithholding,
        socialSecurity: e.socialSecurity, medicare: e.medicare,
        stateWithholding: e.stateWithholding, netPay: e.netPay,
      })),
    });
  }
}
