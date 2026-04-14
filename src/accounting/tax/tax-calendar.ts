/**
 * Tax Calendar — Filing deadlines and reminders
 */

export enum TaxFilingType { FEDERAL_INCOME = 'federal_income', STATE_INCOME = 'state_income', SALES_TAX = 'sales_tax', PAYROLL_TAX = 'payroll_tax', PROPERTY_TAX = 'property_tax', ESTIMATED_TAX = 'estimated_tax' }
export enum FilingFrequency { MONTHLY = 'monthly', QUARTERLY = 'quarterly', ANNUALLY = 'annually' }
export enum FilingStatus { UPCOMING = 'upcoming', DUE_SOON = 'due_soon', OVERDUE = 'overdue', FILED = 'filed' }

export interface TaxDeadline {
  id: string; type: TaxFilingType; jurisdiction: string;
  periodDescription: string; dueDate: Date; filingStatus: FilingStatus;
  filingFrequency: FilingFrequency; amountDue?: number; taxPaid?: number; notes?: string;
}

export class TaxCalendarService {
  private deadlines: TaxDeadline[] = [];
  private idCounter = 0;
  private nextId(): string { return `tdl_${Date.now()}_${++this.idCounter}`; }

  private getStatus(dueDate: Date): FilingStatus {
    const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0) return 'overdue' as FilingStatus;
    if (daysUntilDue <= 7) return 'due_soon' as FilingStatus;
    return 'upcoming' as FilingStatus;
  }

  async addDeadline(params: Omit<TaxDeadline, 'id' | 'filingStatus'>): Promise<TaxDeadline> {
    const deadline: TaxDeadline = { ...params, id: this.nextId(), filingStatus: this.getStatus(params.dueDate) };
    this.deadlines.push(deadline);
    return deadline;
  }

  async generateAnnualCalendar(year: number): Promise<TaxDeadline[]> {
    const calendar: TaxDeadline[] = [];
    const add = (type: string, jurisdiction: string, periodDesc: string, dueDate: Date, freq: string) => {
      calendar.push({ id: this.nextId(), type: type as TaxFilingType, jurisdiction, periodDescription: periodDesc, dueDate, filingStatus: this.getStatus(dueDate), filingFrequency: freq as FilingFrequency });
    };
    // Federal estimated taxes: Apr 15, Jun 15, Sep 15, Jan 15
    for (const item of [[4,'Q1'],[6,'Q2'],[9,'Q3'],[1,'Q4']] as [number, string][]) {
      const m = item[0];
      const p = item[1];
      const mo: number = m === 1 ? 12 : m;
      const yr: number = m === 1 ? year - 1 : year;
      add('estimated_tax', 'IRS', `${p} ${yr}`, new Date(yr, mo - 1, 15), 'quarterly');
    }
    // Monthly sales tax — CA example
    for (let m = 0; m < 12; m++) {
      const dt = new Date(year, m + 1, 1);
      add('sales_tax', 'CA', `${dt.toLocaleString('default', {month:'long'})} ${year} Sales Tax`, new Date(year, m + 1, 30), 'monthly');
    }
    // Annual federal income tax
    add('federal_income', 'IRS', `Tax Year ${year}`, new Date(year + 1, 3, 15), 'annually');
    // Remove old deadlines for this year and add new ones
    this.deadlines = this.deadlines.filter(d => d.dueDate.getFullYear() !== year);
    this.deadlines.push(...calendar);
    return calendar;
  }

  async getUpcoming(days: number = 30): Promise<TaxDeadline[]> {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.deadlines.filter(d => d.dueDate <= cutoff && d.filingStatus !== 'filed').sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  async markFiled(deadlineId: string, amountPaid: number): Promise<void> {
    const d = this.deadlines.find(dl => dl.id === deadlineId);
    if (d) { d.taxPaid = amountPaid; d.filingStatus = 'filed' as FilingStatus; }
  }

  async getOverdue(): Promise<TaxDeadline[]> {
    return this.deadlines.filter(d => d.filingStatus === 'overdue');
  }
}
