/**
 * Form 1099 — Configurable thresholds per jurisdiction/company.
 * 1099 is US-specific but thresholds and form types are configurable.
 */

export enum Form1099Status { REQUIRES_W9 = 'requires_w9', PENDING = 'pending', GENERATED = 'generated', FILED = 'filed' }

export interface Form1099Config {
  /** Per-form type: minimum payment threshold to require filing */
  thresholds: Record<string, number>;
  /** Per-form type: which form to use */
  formTypes: Record<string, string>;
}

export interface Vendor1099Summary {
  vendorId: string; vendorName: string; taxId: string;
  totalPayments: number;
  formType: string; status: Form1099Status; w9OnFile: boolean;
  jurisdictionId: string;
}

export class Form1099Service {
  // Default US thresholds (can be overridden via config)
  private thresholds: Record<string, number> = {
    '1099_misc': 600, '1099_nec': 600, '1099_k': 5000,
    // UK/contractor equivalent thresholds
    'ct600': 0,   // all contractors over £0 trigger CT600
    'p11d': 250, // UK benefits in kind over £250
  };

  private vendorPayments = new Map<string, number>();
  private vendorInfo = new Map<string, { name: string; taxId: string; formType: string; w9OnFile: boolean; jurisdictionId: string; }>();

  configure(config: Form1099Config): void {
    this.thresholds = { ...this.thresholds, ...config.thresholds };
  }

  getThreshold(formType: string): number {
    return this.thresholds[formType] ?? 600; // default fallback
  }

  async recordPayment(vendorId: string, amount: number,
    info: { name: string; taxId: string; formType: string; w9OnFile: boolean; jurisdictionId: string; }
  ): Promise<void> {
    const current = this.vendorPayments.get(vendorId) || 0;
    this.vendorPayments.set(vendorId, current + amount);
    this.vendorInfo.set(vendorId, info);
  }

  async getYearEndSummaries(companyId?: string): Promise<Vendor1099Summary[]> {
    const summaries: Vendor1099Summary[] = [];
    for (const [vendorId, totalPayments] of this.vendorPayments) {
      const info = this.vendorInfo.get(vendorId);
      if (!info) continue;
      if (companyId && info.jurisdictionId !== companyId) continue;
      const threshold = this.getThreshold(info.formType);
      if (totalPayments < threshold) continue;
      summaries.push({
        vendorId, vendorName: info.name, taxId: info.taxId,
        totalPayments, formType: info.formType,
        status: info.w9OnFile ? Form1099Status.PENDING : Form1099Status.REQUIRES_W9,
        w9OnFile: info.w9OnFile, jurisdictionId: info.jurisdictionId,
      });
    }
    return summaries.sort((a, b) => b.totalPayments - a.totalPayments);
  }

  async generateFormXml(vendor: Vendor1099Summary): Promise<string> {
    const formType = vendor.formType.toUpperCase().replace('_', '-');
    return `<?xml version="1.0"?>
<Form${formType} xmlns="https://www.irs.gov/filing/${vendor.formType}">
  <ControlNumber>${vendor.vendorId}</ControlNumber>
  <PayerName>YOUR COMPANY NAME</PayerName>
  <RecipientName>${vendor.vendorName}</RecipientName>
  <RecipientTIN>${vendor.taxId}</RecipientTIN>
  <TotalPayments>${vendor.totalPayments.toFixed(2)}</TotalPayments>
  <TaxYear>${new Date().getFullYear()}</TaxYear>
</Form${formType}>`;
  }

  async checkW9(vendorId: string): Promise<{ required: boolean; w9OnFile: boolean }> {
    const info = this.vendorInfo.get(vendorId);
    return { required: !!(info && !info.w9OnFile), w9OnFile: info?.w9OnFile ?? false };
  }
}
