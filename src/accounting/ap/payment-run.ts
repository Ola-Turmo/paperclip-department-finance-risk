/**
 * Payment Run - Batch payment processing with early discount calculation
 * Generates and manages payment runs for approved bills
 */

import { Bill } from './bill.js';

export enum PaymentMethod {
  ACH = 'ach',
  CHECK = 'check',
  WIRE = 'wire',
  CARD = 'card'
}

export enum PaymentRunStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  RELEASED = 'released',
  PROCESSED = 'processed',
  CANCELLED = 'cancelled'
}

export interface PaymentLine {
  billId: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  dueDate: Date;
  originalAmount: number;
  amountToPay: number;
  discountTaken: number;
  paymentMethod: PaymentMethod;
  bankAccountId: string;
}

export interface PaymentRun {
  id: string;
  companyId: string;
  name: string;
  paymentDate: Date;
  status: PaymentRunStatus;
  bankAccountId: string;
  bankAccountName: string;
  totalAmount: number;
  paymentCount: number;
  lines: PaymentLine[];
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Calculate early payment discount based on invoice terms
 */
function calculateEarlyPaymentDiscount(
  invoiceDate: Date,
  paymentDate: Date,
  subtotal: number,
  paymentTermsType: string,
  discountDays?: number,
  discountPercent?: number
): number {
  if (!discountDays || !discountPercent) return 0;

  const daysToPayment = Math.floor(
    (paymentDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysToPayment <= discountDays) {
    return subtotal * (discountPercent / 100);
  }
  return 0;
}

export class PaymentRunService {
  private storage = new Map<string, PaymentRun>();
  private idCounter = 0;

  private nextId(): string {
    return `pr_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Generate a payment run from a list of bills
   */
  async generateRun(params: {
    companyId: string;
    paymentDate: Date;
    bankAccountId: string;
    bankAccountName: string;
    bills: Bill[];
  }): Promise<PaymentRun> {
    const lines: PaymentLine[] = params.bills
      .filter(b => b.status === 'approved' || b.status === 'matched')
      .map(b => {
        // Calculate early payment discount
        const discount = calculateEarlyPaymentDiscount(
          b.invoiceDate,
          params.paymentDate,
          b.subtotal,
          b.paymentTerms
        );

        return {
          billId: b.id,
          vendorId: b.vendorId,
          vendorName: b.vendorId, // Would be resolved to actual vendor name in real implementation
          invoiceNumber: b.invoiceNumber,
          dueDate: b.dueDate,
          originalAmount: b.totalAmount,
          amountToPay: b.totalAmount - discount,
          discountTaken: discount,
          paymentMethod: PaymentMethod.ACH,
          bankAccountId: params.bankAccountId,
        };
      });

    const run: PaymentRun = {
      id: this.nextId(),
      companyId: params.companyId,
      name: `Payment Run ${params.paymentDate.toISOString().slice(0, 10)}`,
      paymentDate: params.paymentDate,
      status: PaymentRunStatus.DRAFT,
      bankAccountId: params.bankAccountId,
      bankAccountName: params.bankAccountName,
      totalAmount: lines.reduce((s, l) => s + l.amountToPay, 0),
      paymentCount: lines.length,
      lines,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.storage.set(run.id, run);
    return run;
  }

  /**
   * Approve a payment run
   */
  async approve(runId: string, approverId: string): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    r.status = PaymentRunStatus.APPROVED;
    r.approvedBy = approverId;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Release an approved payment run for processing
   */
  async release(runId: string): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    if (r.status !== PaymentRunStatus.APPROVED) {
      throw new Error('Can only release approved runs');
    }
    r.status = PaymentRunStatus.RELEASED;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Cancel a payment run
   */
  async cancel(runId: string): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    r.status = PaymentRunStatus.CANCELLED;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Mark a payment run as processed
   */
  async markProcessed(runId: string): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    if (r.status !== PaymentRunStatus.RELEASED) {
      throw new Error('Can only mark released runs as processed');
    }
    r.status = PaymentRunStatus.PROCESSED;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Get a payment run by ID
   */
  async getById(id: string): Promise<PaymentRun | null> {
    return this.storage.get(id) || null;
  }

  /**
   * List payment runs with optional filtering
   */
  async list(filters?: { status?: PaymentRunStatus }): Promise<PaymentRun[]> {
    let runs = Array.from(this.storage.values());
    if (filters?.status) {
      runs = runs.filter(r => r.status === filters.status);
    }
    return runs.sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
  }

  /**
   * Generate ACH file content for a payment run
   */
  async generateAchFile(runId: string): Promise<string> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);

    // Simplified NACHA format header
    const header = `1 07640125 ${r.bankAccountId.padEnd(10)} ${new Date().toISOString().slice(0, 10).replace(/-/g, '')}0930`;

    // Generate detail records
    const lines = r.lines.map(l =>
      `6 ${l.vendorId.padEnd(10)} ${String(l.amountToPay * 100).padStart(10, '0')} ${l.invoiceNumber}`
    ).join('\n');

    // Generate batch control record
    const batchControl = `8${'9'.repeat(94)}`;

    // Generate file control record
    const fileControl = `9${'9'.repeat(94)}`;

    return `${header}\n${lines}\n${batchControl}\n${fileControl}`;
  }

  /**
   * Generate check report for a payment run
   */
  async generateCheckReport(runId: string): Promise<{
    runName: string;
    paymentDate: Date;
    totalAmount: number;
    paymentCount: number;
    checks: {
      checkNumber: number;
      vendorName: string;
      amount: number;
      invoiceNumber: string;
    }[];
  }> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);

    let checkNumber = 1001;
    const checks = r.lines.map(l => ({
      checkNumber: checkNumber++,
      vendorName: l.vendorName,
      amount: l.amountToPay,
      invoiceNumber: l.invoiceNumber
    }));

    return {
      runName: r.name,
      paymentDate: r.paymentDate,
      totalAmount: r.totalAmount,
      paymentCount: r.paymentCount,
      checks
    };
  }

  /**
   * Get total discounts captured by a payment run
   */
  async getTotalDiscounts(runId: string): Promise<number> {
    const r = this.storage.get(runId);
    if (!r) return 0;
    return r.lines.reduce((s, l) => s + l.discountTaken, 0);
  }

  /**
   * Get payment run summary statistics
   */
  async getSummary(): Promise<{
    totalRuns: number;
    byStatus: Record<PaymentRunStatus, number>;
    totalAmount: number;
    totalPayments: number;
    totalDiscounts: number;
  }> {
    const runs = Array.from(this.storage.values());

    const byStatus: Record<PaymentRunStatus, number> = {
      [PaymentRunStatus.DRAFT]: 0,
      [PaymentRunStatus.APPROVED]: 0,
      [PaymentRunStatus.RELEASED]: 0,
      [PaymentRunStatus.PROCESSED]: 0,
      [PaymentRunStatus.CANCELLED]: 0,
    };

    let totalAmount = 0;
    let totalPayments = 0;
    let totalDiscounts = 0;

    for (const run of runs) {
      byStatus[run.status]++;
      totalAmount += run.totalAmount;
      totalPayments += run.paymentCount;
      totalDiscounts += run.lines.reduce((s, l) => s + l.discountTaken, 0);
    }

    return {
      totalRuns: runs.length,
      byStatus,
      totalAmount,
      totalPayments,
      totalDiscounts
    };
  }

  /**
   * Add a payment line to an existing run
   */
  async addPaymentLine(runId: string, line: PaymentLine): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    if (r.status !== PaymentRunStatus.DRAFT) {
      throw new Error('Can only modify draft payment runs');
    }
    r.lines.push(line);
    r.totalAmount += line.amountToPay;
    r.paymentCount = r.lines.length;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Remove a payment line from a draft run
   */
  async removePaymentLine(runId: string, billId: string): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    if (r.status !== PaymentRunStatus.DRAFT) {
      throw new Error('Can only modify draft payment runs');
    }
    const lineIndex = r.lines.findIndex(l => l.billId === billId);
    if (lineIndex === -1) throw new Error(`Bill ${billId} not found in payment run`);
    const removedLine = r.lines.splice(lineIndex, 1)[0];
    r.totalAmount -= removedLine.amountToPay;
    r.paymentCount = r.lines.length;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Update payment date of a draft run
   */
  async updatePaymentDate(runId: string, newDate: Date): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    if (r.status !== PaymentRunStatus.DRAFT) {
      throw new Error('Can only modify draft payment runs');
    }
    r.paymentDate = newDate;
    r.name = `Payment Run ${newDate.toISOString().slice(0, 10)}`;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Update bank account for a draft run
   */
  async updateBankAccount(runId: string, bankAccountId: string, bankAccountName: string): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    if (r.status !== PaymentRunStatus.DRAFT) {
      throw new Error('Can only modify draft payment runs');
    }
    r.bankAccountId = bankAccountId;
    r.bankAccountName = bankAccountName;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Get payment runs by bank account
   */
  async getByBankAccount(bankAccountId: string): Promise<PaymentRun[]> {
    return Array.from(this.storage.values()).filter(r => r.bankAccountId === bankAccountId);
  }

  /**
   * Get payment runs by date range
   */
  async getByDateRange(fromDate: Date, toDate: Date): Promise<PaymentRun[]> {
    return Array.from(this.storage.values()).filter(r =>
      r.paymentDate >= fromDate && r.paymentDate <= toDate
    );
  }

  /**
   * Calculate early payment discount for a hypothetical run
   */
  async previewDiscounts(bills: Bill[], paymentDate: Date): Promise<{
    totalDiscounts: number;
    byBill: { billId: string; discount: number }[];
  }> {
    const byBill: { billId: string; discount: number }[] = [];
    let totalDiscounts = 0;

    for (const bill of bills) {
      if (bill.status === 'approved' || bill.status === 'matched') {
        const discount = calculateEarlyPaymentDiscount(
          bill.invoiceDate,
          paymentDate,
          bill.subtotal,
          bill.paymentTerms
        );
        if (discount > 0) {
          byBill.push({ billId: bill.id, discount });
          totalDiscounts += discount;
        }
      }
    }

    return { totalDiscounts, byBill };
  }

  /**
   * Void a released payment run (before processing)
   */
  async voidReleased(runId: string): Promise<PaymentRun> {
    const r = this.storage.get(runId);
    if (!r) throw new Error(`Payment run ${runId} not found`);
    if (r.status !== PaymentRunStatus.RELEASED) {
      throw new Error('Can only void released payment runs');
    }
    r.status = PaymentRunStatus.CANCELLED;
    r.updatedAt = new Date();
    return r;
  }

  /**
   * Get runs pending approval
   */
  async getPendingApproval(): Promise<PaymentRun[]> {
    return this.list({ status: PaymentRunStatus.APPROVED });
  }

  /**
   * Get runs ready for release (approved)
   */
  async getReadyForRelease(): Promise<PaymentRun[]> {
    return this.list({ status: PaymentRunStatus.APPROVED });
  }
}
