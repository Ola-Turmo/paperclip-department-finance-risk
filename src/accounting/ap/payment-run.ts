/**
 * Payment Run — generates payment proposals, applies early discounts.
 */

import { Repository } from '../core/interfaces.js';

export enum PaymentMethod { ACH = 'ach', CHECK = 'check', WIRE = 'wire', CREDIT_CARD = 'credit_card' }
export enum PaymentRunStatus { DRAFT = 'draft', APPROVED = 'approved', PROCESSING = 'processing', COMPLETED = 'completed', CANCELLED = 'cancelled' }

export interface PaymentLine {
  billId: string; vendorId: string; vendorName: string;
  invoiceNumber: string; dueDate: string;
  originalAmount: number; amountToPay: number; discountTaken: number;
  paymentMethod: PaymentMethod; bankAccountId: string;
}
export interface PaymentRun {
  id: string; companyId: string; status: PaymentRunStatus;
  paymentDate: string; bankAccountId: string;
  lines: PaymentLine[];
  totalAmount: number; currency: string;
  createdAt: Date;
}

export class PaymentRunService {
  constructor(private billRepo: Repository<any>, private vendorRepo: Repository<any>) {}

  async createPaymentRun(params: {
    companyId: string; paymentDate: string | Date;
    bankAccountId: string; currency: string;
    includeOverdueOnly?: boolean;
  }): Promise<PaymentRun> {
    const bills = await this.billRepo.findAll({ companyId: params.companyId, status: 'approved' } as any);
    const overdue = (bills as any[]).filter((b: any) => {
      if (params.includeOverdueOnly && b.status !== 'approved') return false;
      return new Date(b.dueDate) <= new Date(params.paymentDate);
    });

    const lines: PaymentLine[] = overdue.map((b: any) => {
      let discountTaken = 0;
      // Early discount logic
      if (b.paymentTerms?.type === 'net' && b.paymentTerms?.discountPercent) {
        const daysUntilDue = Math.floor((new Date(b.dueDate).getTime() - new Date(params.paymentDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue > (b.paymentTerms.discountDays || 0)) {
          discountTaken = b.totalAmount * b.paymentTerms.discountPercent;
        }
      }
      return {
        billId: b.id, vendorId: b.vendorId, vendorName: b.vendorName,
        invoiceNumber: b.invoiceNumber, dueDate: b.dueDate,
        originalAmount: b.totalAmount, amountToPay: b.totalAmount - discountTaken,
        discountTaken, paymentMethod: PaymentMethod.ACH, bankAccountId: params.bankAccountId,
      };
    });

    const run: PaymentRun = {
      id: `pr_${Date.now()}`,
      companyId: params.companyId, status: PaymentRunStatus.DRAFT,
      paymentDate: params.paymentDate instanceof Date ? params.paymentDate.toISOString().split('T')[0] : params.paymentDate,
      bankAccountId: params.bankAccountId, lines,
      totalAmount: lines.reduce((s, l) => s + l.amountToPay, 0),
      currency: params.currency, createdAt: new Date(),
    };
    return run;
  }

  async approve(run: PaymentRun): Promise<PaymentRun> {
    return { ...run, status: PaymentRunStatus.APPROVED };
  }
}
