/**
 * Payroll Run — Full payroll processing from hours to net pay
 */

import { EmployeeMasterService } from './employee-master.js';
import { TaxWithholdingService } from './tax-withholding.js';
import { BenefitDeductionService, DeductionElection } from './benefit-deductions.js';

export enum PayrollRunStatus { DRAFT = 'draft', APPROVED = 'approved', PROCESSED = 'processed', PAID = 'paid' }

export interface PayrollEntry {
  employeeId: string; employeeName: string;
  hoursWorked?: number; grossPay: number;
  federalWithholding: number; socialSecurity: number; medicare: number;
  stateWithholding: number; localWithholding: number;
  totalDeductions: number; netPay: number;
  payPeriodStart: Date; payPeriodEnd: Date;
}
export interface PayrollRun {
  id: string; companyId: string; payPeriodStart: Date; payPeriodEnd: Date;
  payDate: Date; status: PayrollRunStatus;
  entries: PayrollEntry[]; totalGross: number; totalNet: number; totalDeductions: number;
  approvedBy?: string; approvedAt?: Date;
  createdAt: Date; updatedAt: Date;
}

export class PayrollRunService {
  constructor(
    private employees: EmployeeMasterService,
    private withholding: TaxWithholdingService,
    private benefits: BenefitDeductionService,
  ) {}
  private runs = new Map<string, PayrollRun>();
  private idCounter = 0;
  private nextId(): string { return `prr_${Date.now()}_${++this.idCounter}`; }

  async calculateGross(employee: any, hoursWorked?: number): Promise<number> {
    if (employee.payType === 'salary') return employee.payRate / 26; // biweekly
    if (employee.payType === 'hourly' && hoursWorked) return employee.payRate * hoursWorked;
    return 0;
  }

  async createPayrollRun(params: {
    companyId: string; payPeriodStart: Date; payPeriodEnd: Date; payDate: Date;
    employeeEntries: { employeeId: string; hoursWorked?: number; deductions: DeductionElection[]; ytdWages: number; }[];
  }): Promise<PayrollRun> {
    const entries: PayrollEntry[] = [];
    let totalGross = 0, totalNet = 0, totalDeductions = 0;

    for (const entryParams of params.employeeEntries) {
      const emp = await this.employees.getById(entryParams.employeeId);
      if (!emp || emp.status !== 'active') continue;

      const grossPay = await this.calculateGross(emp, entryParams.hoursWorked);
      const withholding = this.withholding.calculateWithholding({
        grossPay, ytdWages: entryParams.ytdWages,
        filingStatus: emp.taxElection.federalFilingStatus,
        federalAllowances: emp.taxElection.federalAllowances,
        federalAdditionalWithholding: emp.taxElection.federalAdditionalWithholding,
        state: emp.address.state, stateAllowances: emp.taxElection.stateAllowances,
        stateFilingStatus: emp.taxElection.stateFilingStatus,
      });
      const deductions = await this.benefits.calculateDeductions(entryParams.deductions, grossPay, emp.payFrequency);
      const totalDed = withholding.totalWithholding + deductions.reduce((s, d) => s + d.employeeDeduction, 0);
      const netPay = grossPay - totalDed;

      entries.push({
        employeeId: emp.id, employeeName: `${emp.firstName} ${emp.lastName}`,
        hoursWorked: entryParams.hoursWorked, grossPay,
        federalWithholding: withholding.federalWithholding,
        socialSecurity: withholding.socialSecurity,
        medicare: withholding.medicare,
        stateWithholding: withholding.stateWithholding,
        localWithholding: 0, totalDeductions: totalDed, netPay,
        payPeriodStart: params.payPeriodStart, payPeriodEnd: params.payPeriodEnd,
      });
      totalGross += grossPay; totalNet += netPay; totalDeductions += totalDed;
    }

    const run: PayrollRun = {
      id: this.nextId(), companyId: params.companyId,
      payPeriodStart: params.payPeriodStart, payPeriodEnd: params.payPeriodEnd,
      payDate: params.payDate,      status: PayrollRunStatus.DRAFT as PayrollRunStatus,
      entries, totalGross, totalNet, totalDeductions,
      createdAt: new Date(), updatedAt: new Date(),
    };
    this.runs.set(run.id, run);
    return run;
  }

  async approve(runId: string, approverId: string): Promise<PayrollRun> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Payroll run ${runId} not found`);
    r.status = PayrollRunStatus.APPROVED as PayrollRunStatus; r.approvedBy = approverId; r.approvedAt = new Date(); r.updatedAt = new Date();
    return r;
  }

  async process(runId: string): Promise<PayrollRun> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Payroll run ${runId} not found`);
    r.status = PayrollRunStatus.PROCESSED as PayrollRunStatus; r.updatedAt = new Date();
    return r;
  }

  async getById(id: string): Promise<PayrollRun | null> { return this.runs.get(id) || null; }
  async list(filters?: { status?: PayrollRunStatus; }): Promise<PayrollRun[]> {
    let runs = Array.from(this.runs.values());
    if (filters?.status) runs = runs.filter(r => r.status === filters.status);
    return runs.sort((a, b) => b.payDate.getTime() - a.payDate.getTime());
  }
}
