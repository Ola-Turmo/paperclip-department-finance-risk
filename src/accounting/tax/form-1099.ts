/**
 * Form 1099 — Year-end vendor payment tracking and form generation
 */

export enum Form1099Type { MISC = '1099_misc', NEC = '1099_nec', K = '1099_k' }
export enum Form1099Status { REQUIRES_W9 = 'requires_w9', PENDING = 'pending', GENERATED = 'generated', FILED = 'filed' }

export interface Vendor1099Summary {
  vendorId: string; vendorName: string; taxId: string;
  totalPayments: number; formType: Form1099Type;
  status: Form1099Status; w9OnFile: boolean;
}

export class Form1099Service {
  private vendorPayments = new Map<string, number>();
  private vendorInfo = new Map<string, { name: string; taxId: string; formType: Form1099Type; w9OnFile: boolean; }>();
  private readonly THRESHOLDS: Record<Form1099Type, number> = { '1099_misc': 600, '1099_nec': 600, '1099_k': 5000 };

  async recordPayment(vendorId: string, amount: number, info: { name: string; taxId: string; formType: Form1099Type; w9OnFile: boolean; }): Promise<void> {
    const current = this.vendorPayments.get(vendorId) || 0;
    this.vendorPayments.set(vendorId, current + amount);
    this.vendorInfo.set(vendorId, info);
  }

  async getYearEndSummaries(): Promise<Vendor1099Summary[]> {
    const summaries: Vendor1099Summary[] = [];
    for (const [vendorId, totalPayments] of this.vendorPayments) {
      const info = this.vendorInfo.get(vendorId);
      if (!info) continue;
      const threshold = this.THRESHOLDS[info.formType];
      if (totalPayments < threshold) continue;
      summaries.push({
        vendorId, vendorName: info.name, taxId: info.taxId,
        totalPayments, formType: info.formType,
        status: info.w9OnFile ? Form1099Status.PENDING : Form1099Status.REQUIRES_W9,
        w9OnFile: info.w9OnFile,
      });
    }
    return summaries.sort((a, b) => b.totalPayments - a.totalPayments);
  }

  async generate1099necXml(vendor: Vendor1099Summary, federalWithheld: number = 0): Promise<string> {
    return `<?xml version="1.0"?>
<Form1099NEC xmlns="https://www.irs.gov/filing/1099-nec">
  <ControlNumber>${vendor.vendorId}</ControlNumber>
  <PayerName>YOUR COMPANY NAME</PayerName>
  <RecipientName>${vendor.vendorName}</RecipientName>
  <RecipientTIN>${vendor.taxId}</RecipientTIN>
  <OrdinaryIncome>${vendor.totalPayments.toFixed(2)}</OrdinaryIncome>
  <FederalTaxWithheld>${federalWithheld.toFixed(2)}</FederalTaxWithheld>
  <TaxYear>${new Date().getFullYear()}</TaxYear>
</Form1099NEC>`;
  }

  async checkW9(vendorId: string): Promise<{ required: boolean; w9OnFile: boolean }> {
    const info = this.vendorInfo.get(vendorId);
    return { required: !!(info && !info.w9OnFile), w9OnFile: info?.w9OnFile ?? false };
  }

  async getVendorsRequiringW9(): Promise<{ vendorId: string; name: string; totalPayments: number; }[]> {
    const summaries = await this.getYearEndSummaries();
    return summaries.filter(s => s.status === Form1099Status.REQUIRES_W9).map(s => ({ vendorId: s.vendorId, name: s.vendorName, totalPayments: s.totalPayments }));
  }
}
