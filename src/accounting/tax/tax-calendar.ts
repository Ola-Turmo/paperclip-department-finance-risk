/**
 * Tax Calendar — Generates filing deadlines from CompanyConfig jurisdictions.
 * No hardcoded IRS/US — reads from company jurisdiction configuration.
 */

import { CompanyConfigService } from '../core/company-config.js';
import { CompanyStructure, JurisdictionConfig } from '../core/company-config.js';

export type TaxFilingType = string;   // flexible: 'corporate_income', 'vat', 'sales_tax', 'payroll', etc.
export type FilingFrequency = 'monthly' | 'quarterly' | 'annually' | 'semi_annually';
export type FilingStatus = 'upcoming' | 'due_soon' | 'overdue' | 'filed' | 'extended';

export interface TaxDeadline {
  id: string; companyId: string;
  taxFilingType: TaxFilingType;
  jurisdictionId: string; jurisdictionName: string;
  periodDescription: string;
  dueDate: Date; filingStatus: FilingStatus;
  filingFrequency: FilingFrequency;
  amountDue?: number; taxPaid?: number; filingForm?: string;
  notes?: string;
}

export class TaxCalendarService {
  private deadlines: TaxDeadline[] = [];
  private companyConfig: CompanyConfigService;
  private idCounter = 0;
  private nextId(): string { return `tdl_${Date.now()}_${++this.idCounter}`; }

  constructor(companyConfig: CompanyConfigService) {
    this.companyConfig = companyConfig;
  }

  private getStatus(dueDate: Date): FilingStatus {
    const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0) return 'overdue';
    if (daysUntilDue <= 7) return 'due_soon';
    return 'upcoming';
  }

  /** Generate calendar for a company for a given year — reads from CompanyConfig */
  async generateAnnualCalendar(companyId: string, year: number): Promise<TaxDeadline[]> {
    const company = await this.companyConfig.get(companyId);
    if (!company) throw new Error(`Company ${companyId} not found`);

    const calendar: TaxDeadline[] = [];
    const fyStart = company.accountingPolicy.fiscalYearStartMonth;

    for (const j of company.jurisdictions) {
      if (j.effectiveTo && j.effectiveTo < new Date(year, 0, 1)) continue;

      for (const filing of j.filingFrequencies) {
        const deadlines = this.generateDeadlines(companyId, j, filing, year, fyStart);
        calendar.push(...deadlines);
      }
    }

    this.deadlines = this.deadlines.filter(d => {
      const dYear = d.dueDate.getFullYear();
      return !(dYear === year && d.companyId === companyId);
    });
    this.deadlines.push(...calendar);
    return calendar;
  }

  private generateDeadlines(
    companyId: string, j: JurisdictionConfig,
    filing: { taxType: string; frequency: FilingFrequency },
    year: number, fyStart: number
  ): TaxDeadline[] {
    const deadlines: TaxDeadline[] = [];
    const add = (periodDesc: string, dueDate: Date, form?: string) => {
      deadlines.push({
        id: this.nextId(), companyId, taxFilingType: filing.taxType,
        jurisdictionId: j.id, jurisdictionName: j.name,
        periodDescription: periodDesc, dueDate,
        filingStatus: this.getStatus(dueDate),
        filingFrequency: filing.frequency, filingForm: form,
      });
    };

    const freq = filing.frequency;
    if (freq === 'monthly') {
      for (let m = 0; m < 12; m++) {
        const dt = new Date(year, m, 1);
        add(`${dt.toLocaleString('default', { month: 'long' })} ${year}`, new Date(year, m + 1, 20));
      }
    } else if (freq === 'quarterly') {
      // Standard quarterly: Q1=Apr 15, Q2=Jun 15, Q3=Sep 15, Q4=Jan 15
      const quarters: [number, string][] = [[3, 'Q1'], [5, 'Q2'], [8, 'Q3'], [0, 'Q4']];
      for (const [month, label] of quarters) {
        add(`${label} ${year}`, new Date(month === 0 ? year + 1 : year, month, 15));
      }
    } else if (freq === 'annually') {
      // Annual filing — typically 3 months after fiscal year end
      const fiscalEndMonth = fyStart === 1 ? 11 : fyStart - 2;
      add(`Tax Year ${year}`, new Date(year, fiscalEndMonth + 3, 15));
    }

    return deadlines;
  }

  async addDeadline(deadline: Omit<TaxDeadline, 'id' | 'filingStatus'>): Promise<TaxDeadline> {
    const d: TaxDeadline = { ...deadline, id: this.nextId(), filingStatus: this.getStatus(deadline.dueDate) };
    this.deadlines.push(d);
    return d;
  }

  async getUpcoming(companyId: string, days: number = 30): Promise<TaxDeadline[]> {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.deadlines
      .filter(d => d.companyId === companyId && d.dueDate <= cutoff && d.filingStatus !== 'filed')
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  async markFiled(deadlineId: string, amountPaid: number): Promise<void> {
    const d = this.deadlines.find(dl => dl.id === deadlineId);
    if (d) { d.taxPaid = amountPaid; d.filingStatus = 'filed'; }
  }

  async getOverdue(companyId: string): Promise<TaxDeadline[]> {
    return this.deadlines.filter(d => d.companyId === companyId && d.filingStatus === 'overdue');
  }
}
