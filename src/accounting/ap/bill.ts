/**
 * Bill — uses Repository<T> for storage, configurable lifecycle states.
 */

import { Repository } from '../core/interfaces.js';

export enum BillStatus {
  RECEIVED = 'received', APPROVED = 'approved', MATCHED = 'matched',
  SCHEDULED = 'scheduled', PAID = 'paid', VOIDED = 'voided', OVERDUE = 'overdue',
}
export enum MatchStatus { PENDING = 'pending', NO_PO = 'no_po', MATCHED_2WAY = '2way', MATCHED_3WAY = '3way', EXCEPTION = 'exception' }

export interface BillLineItem { description: string; quantity: number; unitPrice: number; amount: number; accountCode: string; }
export interface Bill {
  id: string; vendorId: string; vendorName: string; companyId: string;
  invoiceNumber: string; invoiceDate: string; dueDate: string;
  lineItems: BillLineItem[];
  subtotal: number; taxAmount: number; totalAmount: number;
  amountPaid: number; currency: string;
  status: BillStatus; matchStatus: MatchStatus;
  paymentRunId?: string; paymentDate?: string;
  notes?: string; createdAt: Date; updatedAt: Date;
}

export interface ExtractedInvoiceData {
  vendorName: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  paymentTerms?: string; lineItems: BillLineItem[];
  subtotal: number; taxAmount: number; totalAmount: number; currency: string;
}

export class BillService {
  constructor(private repo: Repository<Bill>) {}

  async create(data: Omit<Bill, 'id' | 'createdAt' | 'updatedAt' | 'amountPaid'>): Promise<Bill> {
    const bill: Bill = {
      ...data, id: `bill_${Date.now()}_${Math.random().toString(36)[2]}`,
      amountPaid: 0, createdAt: new Date(), updatedAt: new Date(),
    };
    return this.repo.save(bill);
  }

  async getById(id: string): Promise<Bill | null> { return this.repo.findById(id); }
  async list(companyId?: string): Promise<Bill[]> {
    if (companyId) return this.repo.findAll({ companyId } as any);
    return this.repo.findAll();
  }
  async update(id: string, data: Partial<Bill>): Promise<Bill> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error(`Bill ${id} not found`);
    return this.repo.save({ ...existing, ...data, id, updatedAt: new Date() });
  }
  async recordPayment(id: string, amount: number): Promise<void> {
    const bill = await this.repo.findById(id);
    if (bill) {
      bill.amountPaid += amount;
      if (bill.amountPaid >= bill.totalAmount) bill.status = BillStatus.PAID;
      await this.repo.save(bill);
    }
  }
}
