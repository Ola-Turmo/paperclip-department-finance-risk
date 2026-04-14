/**
 * Aging Analysis - AR aging analysis with DSO calculation
 * Part of the AR module (Phase 3)
 */

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export interface AgingBucketResult {
  bucket: AgingBucket;
  amount: number;
  percentage: number;
  invoiceCount: number;
}

export interface AgingResult {
  customerId: string;
  customerName: string;
  totalOutstanding: number;
  buckets: AgingBucketResult[];
  dso: number; // Days Sales Outstanding
}

export interface AgingAnalysisService {
  generateAging(customerId?: string): Promise<AgingResult[]>;
  getDSO(customerId: string): Promise<number>; // Days Sales Outstanding
}

export interface AgingBucketInfo {
  bucket: AgingBucket;
  minDays: number;
  maxDays: number;
  label: string;
}

export const AGING_BUCKETS: AgingBucketInfo[] = [
  { bucket: 'current', minDays: -Infinity, maxDays: 0, label: 'Current' },
  { bucket: '1-30', minDays: 1, maxDays: 30, label: '1-30 Days' },
  { bucket: '31-60', minDays: 31, maxDays: 60, label: '31-60 Days' },
  { bucket: '61-90', minDays: 61, maxDays: 90, label: '61-90 Days' },
  { bucket: '90+', minDays: 91, maxDays: Infinity, label: '90+ Days' },
];

/**
 * Determine which aging bucket a days-past-due value falls into
 */
export function getBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '1-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  return '90+';
}

/**
 * Calculate days between two dates
 */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export interface AgingInvoiceData {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  date: Date;
  dueDate: Date;
  total: number;
  amountPaid: number;
  amountCredited: number;
  status: string;
}

export class AgingAnalysis implements AgingAnalysisService {
  // Reference to invoice generator (would be injected)
  private invoiceGenerator: import('./invoice-generator.js').InvoiceGenerator | null = null;
  // Reference to customer master
  private customerMaster: import('./customer-master.js').CustomerMaster | null = null;

  setInvoiceGenerator(generator: import('./invoice-generator.js').InvoiceGenerator): void {
    this.invoiceGenerator = generator;
  }

  setCustomerMaster(master: import('./customer-master.js').CustomerMaster): void {
    this.customerMaster = master;
  }

  /**
   * Generate aging analysis for all customers or a specific customer
   */
  async generateAging(customerId?: string): Promise<AgingResult[]> {
    const today = new Date();
    const results: AgingResult[] = [];

    // Get customers to process
    let customers: import('./customer-master.js').Customer[] = [];
    if (customerId) {
      const customer = await this.customerMaster?.getById(customerId);
      if (customer) {
        customers = [customer];
      }
    } else if (this.customerMaster) {
      customers = await this.customerMaster.list({});
    }

    // Process each customer
    for (const customer of customers) {
      // Get open invoices for this customer
      const invoices = await this.getOpenInvoicesForCustomer(customer.id);

      // Calculate buckets
      const buckets = this.calculateBuckets(invoices, today);

      // Calculate total outstanding
      const totalOutstanding = buckets.reduce((sum, b) => sum + b.amount, 0);

      // Calculate DSO
      const dso = await this.calculateDSO(customer.id, today);

      results.push({
        customerId: customer.id,
        customerName: customer.name,
        totalOutstanding,
        buckets,
        dso,
      });
    }

    // Sort by total outstanding descending
    return results.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }

  /**
   * Get open invoices for a customer
   */
  private async getOpenInvoicesForCustomer(customerId: string): Promise<AgingInvoiceData[]> {
    if (!this.invoiceGenerator) {
      return [];
    }

    const invoices = await this.invoiceGenerator.getOpenInvoices(customerId);
    return invoices.map(inv => ({
      id: inv.id,
      customerId: inv.customerId,
      customerName: '', // Would be filled from customer master
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      dueDate: inv.dueDate,
      total: inv.total,
      amountPaid: inv.amountPaid,
      amountCredited: inv.amountCredited,
      status: inv.status,
    }));
  }

  /**
   * Calculate aging buckets for a list of invoices
   */
  private calculateBuckets(invoices: AgingInvoiceData[], asOfDate: Date): AgingBucketResult[] {
    const bucketAmounts: Record<AgingBucket, { amount: number; count: number }> = {
      current: { amount: 0, count: 0 },
      '1-30': { amount: 0, count: 0 },
      '31-60': { amount: 0, count: 0 },
      '61-90': { amount: 0, count: 0 },
      '90+': { amount: 0, count: 0 },
    };

    for (const invoice of invoices) {
      // Skip paid or voided
      if (invoice.status === 'paid' || invoice.status === 'voided') {
        continue;
      }

      const amountOutstanding = invoice.total - invoice.amountPaid - invoice.amountCredited;
      if (amountOutstanding <= 0) {
        continue;
      }

      const daysPastDue = daysBetween(invoice.dueDate, asOfDate);
      const bucket = getBucket(daysPastDue);

      bucketAmounts[bucket].amount += amountOutstanding;
      bucketAmounts[bucket].count += 1;
    }

    const totalAmount = Object.values(bucketAmounts).reduce((sum, b) => sum + b.amount, 0);

    return Object.entries(bucketAmounts).map(([bucket, data]) => ({
      bucket: bucket as AgingBucket,
      amount: data.amount,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      invoiceCount: data.count,
    }));
  }

  /**
   * Calculate Days Sales Outstanding for a customer
   * DSO = (Accounts Receivable / Total Credit Sales) * Number of Days
   */
  async getDSO(customerId: string): Promise<number> {
    const today = new Date();
    return this.calculateDSO(customerId, today);
  }

  /**
   * Calculate DSO
   * Uses average of invoices over the past 90 days
   */
  private async calculateDSO(customerId: string, asOfDate: Date): Promise<number> {
    if (!this.invoiceGenerator) {
      return 0;
    }

    // Get all invoices for the customer
    const allInvoices = await this.invoiceGenerator.list({ customerId });

    // Calculate 90 days ago
    const ninetyDaysAgo = new Date(asOfDate);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Filter to invoices from the past 90 days
    const recentInvoices = allInvoices.filter(inv => inv.date >= ninetyDaysAgo && inv.date <= asOfDate);

    if (recentInvoices.length === 0) {
      return 0;
    }

    // Calculate total sales in the period
    const totalSales = recentInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);

    if (totalSales === 0) {
      return 0;
    }

    // Calculate average daily sales
    const daysInPeriod = Math.min(90, daysBetween(ninetyDaysAgo, asOfDate));
    const averageDailySales = totalSales / daysInPeriod;

    // Get current AR balance
    const openInvoices = await this.invoiceGenerator.getOpenInvoices(customerId);
    const currentAR = openInvoices.reduce((sum, inv) => {
      return sum + (inv.total - inv.amountPaid - inv.amountCredited);
    }, 0);

    // DSO = Current AR / Average Daily Sales
    const dso = currentAR / averageDailySales;

    return Math.round(dso * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Get summary aging totals across all customers
   */
  async getAgingSummary(): Promise<{
    totalOutstanding: number;
    totalCurrent: number;
    total1To30: number;
    total31To60: number;
    total61To90: number;
    total90Plus: number;
    averageDSO: number;
    customerCount: number;
  }> {
    const agingResults = await this.generateAging();

    const summary = {
      totalOutstanding: 0,
      totalCurrent: 0,
      total1To30: 0,
      total31To60: 0,
      total61To90: 0,
      total90Plus: 0,
      averageDSO: 0,
      customerCount: agingResults.length,
    };

    let totalDSO = 0;
    for (const result of agingResults) {
      summary.totalOutstanding += result.totalOutstanding;
      totalDSO += result.dso;

      for (const bucket of result.buckets) {
        switch (bucket.bucket) {
          case 'current':
            summary.totalCurrent += bucket.amount;
            break;
          case '1-30':
            summary.total1To30 += bucket.amount;
            break;
          case '31-60':
            summary.total31To60 += bucket.amount;
            break;
          case '61-90':
            summary.total61To90 += bucket.amount;
            break;
          case '90+':
            summary.total90Plus += bucket.amount;
            break;
        }
      }
    }

    if (agingResults.length > 0) {
      summary.averageDSO = totalDSO / agingResults.length;
    }

    return summary;
  }

  /**
   * Get high-risk accounts (90+ days past due)
   */
  async getHighRiskAccounts(): Promise<AgingResult[]> {
    const allAging = await this.generateAging();
    return allAging.filter(result => {
      const bucket90Plus = result.buckets.find(b => b.bucket === '90+');
      return bucket90Plus && bucket90Plus.amount > 0;
    });
  }
}
