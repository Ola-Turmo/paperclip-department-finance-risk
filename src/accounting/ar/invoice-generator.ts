/**
 * Invoice Generator - AR Invoice generation from billing triggers
 * Part of the AR module (Phase 3)
 */

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  PARTIAL = 'partial',
  OVERDUE = 'overdue',
  VOIDED = 'voided'
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  discountRate?: number;
  serviceDate?: Date;
  revenueAccountCode: string;
}

export interface Invoice {
  id: string;
  companyId: string;
  customerId: string;
  invoiceNumber: string;
  orderNumber?: string;
  date: Date;
  dueDate: Date;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  amountPaid: number;
  amountCredited: number;
  currencyCode: string;
  terms: string;
  notes?: string;
  // Journal entry IDs - would link to GL module
  arJournalEntryId?: string;
  revenueJournalEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingTrigger {
  customerId: string;
  description: string;
  lineItems: Omit<InvoiceLineItem, 'id' | 'amount'>[];
  terms?: string;
  notes?: string;
  orderNumber?: string;
}

export interface InvoiceCalculationResult {
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  computedLineItems: InvoiceLineItem[];
}

export class InvoiceGenerator {
  private invoices: Map<string, Invoice> = new Map();
  private customerBalances: Map<string, number> = new Map();
  private idCounter = 0;

  private nextId(): string {
    return `inv_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Generate a unique invoice number
   * Format: INV-YYYY-NNNNN
   */
  generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const count = this.invoices.size + 1;
    return `INV-${year}-${String(count).padStart(5, '0')}`;
  }

  /**
   * Calculate totals for line items
   * Handles quantity * unitPrice, discounts, and tax calculations
   */
  calculateTotals(
    lineItems: Omit<InvoiceLineItem, 'id' | 'amount'>[]
  ): InvoiceCalculationResult {
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    if (!lineItems || lineItems.length === 0) {
      return {
        subtotal: 0,
        taxTotal: 0,
        discountTotal: 0,
        total: 0,
        computedLineItems: [],
      };
    }

    const computedLineItems: InvoiceLineItem[] = lineItems.map((item, index) => {
      // Validate line item
      if (item.quantity <= 0) {
        throw new Error(`Line item ${index}: quantity must be positive`);
      }
      if (item.unitPrice < 0) {
        throw new Error(`Line item ${index}: unit price cannot be negative`);
      }
      if (item.taxRate < 0 || item.taxRate > 1) {
        throw new Error(`Line item ${index}: tax rate must be between 0 and 1`);
      }
      if (item.discountRate !== undefined && (item.discountRate < 0 || item.discountRate > 1)) {
        throw new Error(`Line item ${index}: discount rate must be between 0 and 1`);
      }

      // Calculate amounts
      const grossAmount = item.quantity * item.unitPrice;
      const discount =
        item.discountRate !== undefined ? grossAmount * item.discountRate : 0;
      const netAmount = grossAmount - discount;
      const tax = netAmount * (item.taxRate || 0);
      const amount = netAmount + tax;

      // Accumulate totals
      subtotal += netAmount;
      taxTotal += tax;
      discountTotal += discount;

      return {
        ...item,
        id: `li_${this.nextId()}_${index}`,
        amount,
      };
    });

    return {
      subtotal,
      taxTotal,
      discountTotal,
      total: subtotal + taxTotal,
      computedLineItems,
    };
  }

  /**
   * Create a new invoice from a billing trigger
   */
  async createInvoice(trigger: BillingTrigger): Promise<Invoice> {
    // Validate trigger
    if (!trigger.customerId) {
      throw new Error('Customer ID is required');
    }
    if (!trigger.lineItems || trigger.lineItems.length === 0) {
      throw new Error('At least one line item is required');
    }

    // Calculate totals
    const totals = this.calculateTotals(trigger.lineItems);

    // Calculate due date based on terms
    const dueDate = new Date();
    const termsDays = this.parseTermsToDays(trigger.terms || 'Net 30');
    dueDate.setDate(dueDate.getDate() + termsDays);

    const now = new Date();
    const invoice: Invoice = {
      id: this.nextId(),
      companyId: 'default',
      customerId: trigger.customerId,
      invoiceNumber: this.generateInvoiceNumber(),
      orderNumber: trigger.orderNumber,
      date: now,
      dueDate,
      status: InvoiceStatus.DRAFT,
      lineItems: totals.computedLineItems,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      amountPaid: 0,
      amountCredited: 0,
      currencyCode: 'USD',
      terms: trigger.terms || 'Net 30',
      notes: trigger.notes,
      createdAt: now,
      updatedAt: now,
    };

    this.invoices.set(invoice.id, invoice);

    // Update customer balance
    const currentBalance = this.customerBalances.get(trigger.customerId) || 0;
    this.customerBalances.set(trigger.customerId, currentBalance + totals.total);

    return invoice;
  }

  /**
   * Parse payment terms string to days
   */
  private parseTermsToDays(terms: string): number {
    const termsLower = terms.toLowerCase().trim();

    // Common payment terms
    const termPatterns: Record<string, number> = {
      'due on receipt': 0,
      'net 0': 0,
      'cash': 0,
      'net 10': 10,
      'net 15': 15,
      'net 30': 30,
      'net 45': 45,
      'net 60': 60,
      'net 90': 90,
      '2/10 net 30': 30, // Early payment discount, but we use net days
      '1/10 net 30': 30,
    };

    if (termPatterns[termsLower] !== undefined) {
      return termPatterns[termsLower];
    }

    // Try to extract number from terms like "Net 30" or "30 days"
    const match = termsLower.match(/net\s*(\d+)|(\d+)\s*days?/i);
    if (match) {
      return parseInt(match[1] || match[2], 10);
    }

    // Default to Net-30
    return 30;
  }

  /**
   * Get invoice by ID
   */
  async getById(id: string): Promise<Invoice | null> {
    return this.invoices.get(id) || null;
  }

  /**
   * Get invoice by invoice number
   */
  async getByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null> {
    for (const invoice of this.invoices.values()) {
      if (invoice.invoiceNumber === invoiceNumber) {
        return invoice;
      }
    }
    return null;
  }

  /**
   * List invoices with optional filtering
   */
  async list(
    filters?: { customerId?: string; status?: InvoiceStatus; fromDate?: Date; toDate?: Date }
  ): Promise<Invoice[]> {
    let invoices = Array.from(this.invoices.values());

    if (filters?.customerId) {
      invoices = invoices.filter(i => i.customerId === filters.customerId);
    }

    if (filters?.status) {
      invoices = invoices.filter(i => i.status === filters.status);
    }

    if (filters?.fromDate) {
      invoices = invoices.filter(i => i.date >= filters.fromDate!);
    }

    if (filters?.toDate) {
      invoices = invoices.filter(i => i.date <= filters.toDate!);
    }

    // Sort by date descending (newest first)
    return invoices.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Send an invoice (change status from draft to sent)
   */
  async send(id: string): Promise<Invoice> {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new Error(`Cannot send invoice in ${invoice.status} status`);
    }

    invoice.status = InvoiceStatus.SENT;
    invoice.updatedAt = new Date();
    return invoice;
  }

  /**
   * Mark invoice as paid (full payment)
   */
  async markPaid(id: string): Promise<Invoice> {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    if (invoice.status === InvoiceStatus.VOIDED) {
      throw new Error('Cannot mark voided invoice as paid');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error('Invoice is already fully paid');
    }

    const amountDue = invoice.total - invoice.amountPaid;
    invoice.amountPaid = invoice.total;
    invoice.status = InvoiceStatus.PAID;
    invoice.updatedAt = new Date();

    // Update customer balance (reduce by the amount paid)
    const currentBalance = this.customerBalances.get(invoice.customerId) || 0;
    this.customerBalances.set(invoice.customerId, Math.max(0, currentBalance - amountDue));

    return invoice;
  }

  /**
   * Apply partial payment to invoice
   */
  async applyPartialPayment(id: string, amount: number): Promise<Invoice> {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    if (invoice.status === InvoiceStatus.VOIDED) {
      throw new Error('Cannot apply payment to voided invoice');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error('Invoice is already fully paid');
    }

    const amountDue = invoice.total - invoice.amountPaid;
    if (amount > amountDue) {
      throw new Error(`Payment amount ${amount} exceeds amount due ${amountDue}`);
    }

    invoice.amountPaid += amount;
    invoice.status = InvoiceStatus.PARTIAL;
    invoice.updatedAt = new Date();

    // If paid in full
    if (invoice.amountPaid >= invoice.total) {
      invoice.status = InvoiceStatus.PAID;
    }

    // Update customer balance
    const currentBalance = this.customerBalances.get(invoice.customerId) || 0;
    this.customerBalances.set(invoice.customerId, Math.max(0, currentBalance - amount));

    return invoice;
  }

  /**
   * Void an invoice
   * Cannot void a paid invoice - must use credit memo instead
   */
  async void(id: string): Promise<Invoice> {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error('Cannot void a paid invoice. Use credit memo instead.');
    }

    if (invoice.status === InvoiceStatus.VOIDED) {
      throw new Error('Invoice is already voided');
    }

    // Reverse the customer balance change
    const currentBalance = this.customerBalances.get(invoice.customerId) || 0;
    const balanceToReverse = invoice.total - invoice.amountPaid - invoice.amountCredited;
    this.customerBalances.set(
      invoice.customerId,
      Math.max(0, currentBalance - balanceToReverse)
    );

    invoice.status = InvoiceStatus.VOIDED;
    invoice.updatedAt = new Date();

    return invoice;
  }

  /**
   * Apply credit to invoice
   */
  async applyCredit(id: string, creditAmount: number): Promise<Invoice> {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`);
    }

    if (invoice.status === InvoiceStatus.VOIDED) {
      throw new Error('Cannot apply credit to voided invoice');
    }

    const amountDue = invoice.total - invoice.amountPaid - invoice.amountCredited;
    if (creditAmount > amountDue) {
      throw new Error(`Credit amount ${creditAmount} exceeds amount due ${amountDue}`);
    }

    invoice.amountCredited += creditAmount;
    invoice.updatedAt = new Date();

    // Check if fully paid/credited
    if (invoice.amountPaid + invoice.amountCredited >= invoice.total) {
      invoice.status = InvoiceStatus.PAID;
    } else {
      invoice.status = InvoiceStatus.PARTIAL;
    }

    // Reduce customer balance
    const currentBalance = this.customerBalances.get(invoice.customerId) || 0;
    this.customerBalances.set(invoice.customerId, Math.max(0, currentBalance - creditAmount));

    return invoice;
  }

  /**
   * Get overdue invoices
   */
  async getOverdueInvoices(customerId?: string): Promise<Invoice[]> {
    const today = new Date();
    let invoices = Array.from(this.invoices.values()).filter(
      i => i.status !== InvoiceStatus.PAID && i.status !== InvoiceStatus.VOIDED && i.dueDate < today
    );

    if (customerId) {
      invoices = invoices.filter(i => i.customerId === customerId);
    }

    return invoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  /**
   * Get open invoices for a customer
   */
  async getOpenInvoices(customerId: string): Promise<Invoice[]> {
    return Array.from(this.invoices.values())
      .filter(
        i =>
          i.customerId === customerId &&
          i.status !== InvoiceStatus.PAID &&
          i.status !== InvoiceStatus.VOIDED
      )
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  /**
   * Get customer balance (from invoice perspective)
   */
  getCustomerBalance(customerId: string): number {
    return this.customerBalances.get(customerId) || 0;
  }

  /**
   * Update invoice status based on current state
   * (Useful for batch jobs to update overdue status)
   */
  async updateOverdueStatus(): Promise<number> {
    const today = new Date();
    let updateCount = 0;

    for (const invoice of this.invoices.values()) {
      if (
        invoice.status === InvoiceStatus.SENT ||
        invoice.status === InvoiceStatus.PARTIAL
      ) {
        if (invoice.dueDate < today) {
          invoice.status = InvoiceStatus.OVERDUE;
          invoice.updatedAt = new Date();
          updateCount++;
        }
      }
    }

    return updateCount;
  }

  /**
   * Get total outstanding for a customer
   */
  async getTotalOutstanding(customerId: string): Promise<number> {
    const invoices = await this.getOpenInvoices(customerId);
    return invoices.reduce((sum, inv) => {
      return sum + (inv.total - inv.amountPaid - inv.amountCredited);
    }, 0);
  }
}
