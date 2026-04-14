/**
 * Bill - Vendor invoice lifecycle management
 * Tracks invoices from receipt through matching, approval, payment, and voiding
 */

export enum BillStatus {
  RECEIVED = 'received',
  MATCHED = 'matched',
  APPROVED = 'approved',
  PARTIAL = 'partial',
  PAID = 'paid',
  VOIDED = 'voided'
}

export enum MatchStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  VARIANCE = 'variance',
  EXCEPTION = 'exception'
}

export interface BillLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  accountCode: string;
  taxRate: number;
  poLineItemId?: string;
}

export interface Bill {
  id: string;
  companyId: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  receivedDate: Date;
  status: BillStatus;
  matchStatus: MatchStatus;
  lineItems: BillLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountApproved: number;
  currencyCode: string;
  paymentTerms: string;
  poId?: string;
  approvalId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractedInvoiceData {
  vendorName: string;
  vendorAddress?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  paymentTerms?: string;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    accountCode?: string;
  }[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
}

export class BillService {
  private storage = new Map<string, Bill>();
  private idCounter = 0;

  private nextId(): string {
    return `bill_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Create a bill from extracted invoice data
   */
  async createFromExtracted(data: ExtractedInvoiceData, vendorId: string): Promise<Bill> {
    const lineItems: BillLineItem[] = data.lineItems.map((item, i) => ({
      id: `li_${i}`,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.quantity * item.unitPrice, // always compute from qty * price
      accountCode: item.accountCode || 'EXPENSE',
      taxRate: 0,
      poLineItemId: undefined,
    }));

    const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
    const totalAmount = data.taxAmount ? subtotal + data.taxAmount : data.totalAmount;

    const bill: Bill = {
      id: this.nextId(),
      companyId: 'default',
      vendorId,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: new Date(data.invoiceDate),
      dueDate: new Date(data.dueDate),
      receivedDate: new Date(),
      status: BillStatus.RECEIVED,
      matchStatus: MatchStatus.PENDING,
      lineItems,
      subtotal,
      taxAmount: data.taxAmount,
      totalAmount,
      amountPaid: 0,
      amountApproved: 0,
      currencyCode: data.currency,
      paymentTerms: data.paymentTerms || 'Net 30',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.storage.set(bill.id, bill);
    return bill;
  }

  /**
   * Get a bill by ID
   */
  async getById(id: string): Promise<Bill | null> {
    return this.storage.get(id) || null;
  }

  /**
   * List bills with optional filtering
   */
  async list(filters?: {
    vendorId?: string;
    status?: BillStatus;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<Bill[]> {
    let bills = Array.from(this.storage.values());

    if (filters?.vendorId) {
      bills = bills.filter(b => b.vendorId === filters.vendorId);
    }
    if (filters?.status) {
      bills = bills.filter(b => b.status === filters.status);
    }
    if (filters?.fromDate) {
      bills = bills.filter(b => b.invoiceDate >= filters.fromDate!);
    }
    if (filters?.toDate) {
      bills = bills.filter(b => b.invoiceDate <= filters.toDate!);
    }

    return bills.sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime());
  }

  /**
   * Update bill status
   */
  async updateStatus(id: string, status: BillStatus): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.status = status;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Set the match status of a bill
   */
  async setMatchStatus(id: string, matchStatus: MatchStatus): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.matchStatus = matchStatus;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Approve a bill for payment
   */
  async approve(id: string, approvedAmount: number): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.status = BillStatus.APPROVED;
    b.amountApproved = approvedAmount;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Record a payment against a bill
   */
  async recordPayment(id: string, amount: number, paymentDate: Date): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.amountPaid += amount;
    b.status = b.amountPaid >= b.totalAmount ? BillStatus.PAID : BillStatus.PARTIAL;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Void a bill
   */
  async void(id: string): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.status = BillStatus.VOIDED;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Get outstanding (unpaid) bills
   */
  async getOutstanding(vendorId?: string): Promise<Bill[]> {
    return this.list(vendorId ? { vendorId } : {}).then(bills =>
      bills.filter(b => b.status !== BillStatus.PAID && b.status !== BillStatus.VOIDED)
    );
  }

  /**
   * Get bills by approval status
   */
  async getPendingApproval(): Promise<Bill[]> {
    return this.list({}).then(bills =>
      bills.filter(b => b.status === BillStatus.RECEIVED || b.status === BillStatus.MATCHED)
    );
  }

  /**
   * Get bills by match status
   */
  async getByMatchStatus(matchStatus: MatchStatus): Promise<Bill[]> {
    return this.list({}).then(bills =>
      bills.filter(b => b.matchStatus === matchStatus)
    );
  }

  /**
   * Link a bill to a purchase order
   */
  async linkToPo(id: string, poId: string): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.poId = poId;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Update bill line items
   */
  async updateLineItems(id: string, lineItems: BillLineItem[]): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.lineItems = lineItems;
    b.subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
    b.totalAmount = b.subtotal + b.taxAmount;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Add a line item to a bill
   */
  async addLineItem(id: string, lineItem: Omit<BillLineItem, 'id'>): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    const newItem: BillLineItem = { ...lineItem, id: `li_${b.lineItems.length}` };
    b.lineItems.push(newItem);
    b.subtotal = b.lineItems.reduce((s, i) => s + i.amount, 0);
    b.totalAmount = b.subtotal + b.taxAmount;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Remove a line item from a bill
   */
  async removeLineItem(id: string, lineItemId: string): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.lineItems = b.lineItems.filter(li => li.id !== lineItemId);
    b.subtotal = b.lineItems.reduce((s, i) => s + i.amount, 0);
    b.totalAmount = b.subtotal + b.taxAmount;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Update tax amount and recalculate total
   */
  async updateTax(id: string, taxAmount: number): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.taxAmount = taxAmount;
    b.totalAmount = b.subtotal + taxAmount;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Get overdue bills
   */
  async getOverdue(vendorId?: string): Promise<Bill[]> {
    const now = new Date();
    return this.getOutstanding(vendorId).then(bills =>
      bills.filter(b => b.dueDate < now)
    );
  }

  /**
   * Get bills due within a number of days
   */
  async getDueWithinDays(days: number, vendorId?: string): Promise<Bill[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const now = new Date();

    return this.getOutstanding(vendorId).then(bills =>
      bills.filter(b => b.dueDate >= now && b.dueDate <= futureDate)
    );
  }

  /**
   * Calculate total outstanding amount
   */
  async getTotalOutstanding(vendorId?: string): Promise<number> {
    const bills = await this.getOutstanding(vendorId);
    return bills.reduce((sum, b) => sum + (b.totalAmount - b.amountPaid), 0);
  }

  /**
   * Get bill statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<BillStatus, number>;
    totalOutstanding: number;
    totalOverdue: number;
  }> {
    const bills = Array.from(this.storage.values());
    const now = new Date();

    const byStatus: Record<BillStatus, number> = {
      [BillStatus.RECEIVED]: 0,
      [BillStatus.MATCHED]: 0,
      [BillStatus.APPROVED]: 0,
      [BillStatus.PARTIAL]: 0,
      [BillStatus.PAID]: 0,
      [BillStatus.VOIDED]: 0,
    };

    for (const b of bills) {
      byStatus[b.status]++;
    }

    const outstanding = await this.getOutstanding();
    const overdue = outstanding.filter(b => b.dueDate < now);

    return {
      total: bills.length,
      byStatus,
      totalOutstanding: outstanding.reduce((s, b) => s + (b.totalAmount - b.amountPaid), 0),
      totalOverdue: overdue.reduce((s, b) => s + (b.totalAmount - b.amountPaid), 0),
    };
  }

  /**
   * Add notes to a bill
   */
  async addNotes(id: string, notes: string): Promise<Bill> {
    const b = this.storage.get(id);
    if (!b) throw new Error(`Bill ${id} not found`);
    b.notes = b.notes ? `${b.notes}\n${notes}` : notes;
    b.updatedAt = new Date();
    return b;
  }

  /**
   * Get bills by PO ID
   */
  async getByPoId(poId: string): Promise<Bill[]> {
    return this.list({}).then(bills => bills.filter(b => b.poId === poId));
  }

  /**
   * Calculate days until due
   */
  async getDaysUntilDue(id: string): Promise<number | null> {
    const b = this.storage.get(id);
    if (!b) return null;
    const now = new Date();
    const diff = b.dueDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Bulk approve bills
   */
  async bulkApprove(billIds: string[]): Promise<Bill[]> {
    const results: Bill[] = [];
    for (const id of billIds) {
      const b = this.storage.get(id);
      if (b) {
        b.status = BillStatus.APPROVED;
        b.amountApproved = b.totalAmount;
        b.updatedAt = new Date();
        results.push(b);
      }
    }
    return results;
  }

  /**
   * Bulk void bills
   */
  async bulkVoid(billIds: string[]): Promise<Bill[]> {
    const results: Bill[] = [];
    for (const id of billIds) {
      try {
        const voided = await this.void(id);
        results.push(voided);
      } catch {
        // Skip bills that don't exist
      }
    }
    return results;
  }

  /**
   * Check if bill is fully paid
   */
  async isPaid(id: string): Promise<boolean> {
    const b = this.storage.get(id);
    return b ? b.status === BillStatus.PAID : false;
  }

  /**
   * Check if bill is overdue
   */
  async isOverdue(id: string): Promise<boolean> {
    const b = this.storage.get(id);
    if (!b) return false;
    const now = new Date();
    return b.status !== BillStatus.PAID && b.status !== BillStatus.VOIDED && b.dueDate < now;
  }

  /**
   * Get amount remaining to be paid
   */
  async getAmountRemaining(id: string): Promise<number> {
    const b = this.storage.get(id);
    if (!b) return 0;
    return b.totalAmount - b.amountPaid;
  }
}
