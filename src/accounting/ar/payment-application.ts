/**
 * Payment Application - Payment recording and auto-allocation to open invoices (FIFO by due date)
 * Part of the AR module (Phase 3)
 */

export enum PaymentAllocationStatus {
  APPLIED = 'applied',
  PARTIAL = 'partial',
  OVERPAYMENT = 'overpayment'
}

export interface PaymentAllocation {
  invoiceId: string;
  amountApplied: number;
  paymentId: string;
  appliedAt: Date;
}

export interface RecordedPayment {
  id: string;
  customerId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: 'ach' | 'check' | 'wire' | 'card' | 'cash';
  reference?: string;
  allocations: PaymentAllocation[];
  status: PaymentAllocationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentParams {
  customerId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: 'ach' | 'check' | 'wire' | 'card' | 'cash';
  reference?: string;
  invoiceIds?: string[]; // if provided, apply to specific invoices; otherwise auto-allocate
  notes?: string;
}

export interface PaymentApplicationResult {
  payment: RecordedPayment;
  allocations: PaymentAllocation[];
  unappliedAmount: number;
  status: PaymentAllocationStatus;
}

export class PaymentApplication {
  private payments: Map<string, RecordedPayment> = new Map();
  private idCounter = 0;

  // Reference to invoice generator (would be injected in real system)
  private invoiceGenerator: import('./invoice-generator.js').InvoiceGenerator | null = null;

  private nextId(): string {
    return `pmt_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Set the invoice generator reference (for looking up open invoices)
   */
  setInvoiceGenerator(generator: import('./invoice-generator.js').InvoiceGenerator): void {
    this.invoiceGenerator = generator;
  }

  /**
   * Apply a payment to a customer's invoices
   * Uses FIFO auto-allocation: pays oldest invoices first (by due date)
   */
  async applyPayment(params: PaymentParams): Promise<PaymentApplicationResult> {
    // Validate input
    if (!params.customerId) {
      throw new Error('Customer ID is required');
    }
    if (params.amount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    // Get open invoices for customer
    const openInvoices = await this.getOpenInvoices(params.customerId);

    // Sort by due date (oldest first - FIFO)
    openInvoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    // If specific invoice IDs are provided, prioritize those
    if (params.invoiceIds && params.invoiceIds.length > 0) {
      openInvoices.sort((a, b) => {
        const aIdx = params.invoiceIds!.indexOf(a.id);
        const bIdx = params.invoiceIds!.indexOf(b.id);
        // Put specified invoices first, in the order specified
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        // Otherwise sort by due date
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
    }

    const allocations: PaymentAllocation[] = [];
    let remaining = params.amount;

    // Allocate payment to invoices
    for (const invoice of openInvoices) {
      if (remaining <= 0) break;

      const amountDue = invoice.total - invoice.amountPaid - invoice.amountCredited;
      if (amountDue <= 0) continue; // Skip fully paid/credited invoices

      const applied = Math.min(remaining, amountDue);
      allocations.push({
        invoiceId: invoice.id,
        amountApplied: applied,
        paymentId: '', // Will be set after payment is created
        appliedAt: params.paymentDate,
      });

      remaining -= applied;
    }

    // Determine status
    let status: PaymentAllocationStatus;
    if (remaining > 0) {
      status = PaymentAllocationStatus.OVERPAYMENT;
    } else if (remaining < params.amount) {
      status = PaymentAllocationStatus.PARTIAL;
    } else {
      status = PaymentAllocationStatus.APPLIED;
    }

    // Create payment record
    const now = new Date();
    const payment: RecordedPayment = {
      id: this.nextId(),
      customerId: params.customerId,
      amount: params.amount,
      paymentDate: params.paymentDate,
      paymentMethod: params.paymentMethod,
      reference: params.reference,
      allocations: [], // Will be populated after payment is stored
      status,
      createdAt: now,
      updatedAt: now,
    };

    // Update allocation payment IDs
    for (const alloc of allocations) {
      alloc.paymentId = payment.id;
    }

    // Update payment allocations
    payment.allocations = allocations;

    // Store payment
    this.payments.set(payment.id, payment);

    // Update invoice statuses (in real system, would update invoice generator)
    for (const alloc of allocations) {
      await this.updateInvoicePayment(alloc.invoiceId, alloc.amountApplied);
    }

    return {
      payment,
      allocations,
      unappliedAmount: remaining,
      status,
    };
  }

  /**
   * Get open invoices for a customer
   * This is a placeholder that would integrate with InvoiceGenerator
   */
  private async getOpenInvoices(customerId: string): Promise<any[]> {
    if (this.invoiceGenerator) {
      return this.invoiceGenerator.getOpenInvoices(customerId);
    }
    // Return empty array if no invoice generator is set
    // In a real system, this would throw an error or use a default implementation
    return [];
  }

  /**
   * Update invoice when payment is applied
   * This would normally call the InvoiceGenerator
   */
  private async updateInvoicePayment(invoiceId: string, amount: number): Promise<void> {
    // In a real implementation, this would update the invoice
    // through the InvoiceGenerator service
    // For now, this is a placeholder
    if (this.invoiceGenerator) {
      const invoice = await this.invoiceGenerator.getById(invoiceId);
      if (invoice) {
        await this.invoiceGenerator.applyPartialPayment(invoiceId, amount);
      }
    }
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(id: string): Promise<RecordedPayment | null> {
    return this.payments.get(id) || null;
  }

  /**
   * Get all payments for a customer
   */
  async getPaymentsForCustomer(customerId: string): Promise<RecordedPayment[]> {
    return Array.from(this.payments.values())
      .filter(p => p.customerId === customerId)
      .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
  }

  /**
   * Get payments by date range
   */
  async getPaymentsByDateRange(
    fromDate: Date,
    toDate: Date,
    customerId?: string
  ): Promise<RecordedPayment[]> {
    let payments = Array.from(this.payments.values()).filter(
      p => p.paymentDate >= fromDate && p.paymentDate <= toDate
    );

    if (customerId) {
      payments = payments.filter(p => p.customerId === customerId);
    }

    return payments.sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
  }

  /**
   * Get total payments received for a customer
   */
  async getTotalPaymentsReceived(customerId: string): Promise<number> {
    const payments = await this.getPaymentsForCustomer(customerId);
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Void a payment
   * This would typically require reversing the allocations
   */
  async voidPayment(id: string): Promise<RecordedPayment> {
    const payment = this.payments.get(id);
    if (!payment) {
      throw new Error(`Payment ${id} not found`);
    }

    // In a real system, we would reverse the allocations
    // For now, just mark as voided
    payment.status = PaymentAllocationStatus.OVERPAYMENT; // Placeholder status
    payment.updatedAt = new Date();

    // Reverse the allocations (reduce invoice amounts)
    for (const alloc of payment.allocations) {
      // In real implementation, would call invoice generator to reverse
    }

    return payment;
  }

  /**
   * Get allocation details for a payment
   */
  async getAllocationDetails(paymentId: string): Promise<PaymentAllocation[]> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }
    return payment.allocations;
  }

  /**
   * Get total unapplied amount for a customer
   */
  async getUnappliedAmount(customerId: string): Promise<number> {
    const payments = await this.getPaymentsForCustomer(customerId);
    return payments
      .filter(p => p.status === PaymentAllocationStatus.OVERPAYMENT)
      .reduce((sum, p) => {
        const applied = p.allocations.reduce((a, c) => a + c.amountApplied, 0);
        return sum + (p.amount - applied);
      }, 0);
  }

  /**
   * Get payments by method
   */
  async getPaymentsByMethod(
    method: 'ach' | 'check' | 'wire' | 'card' | 'cash'
  ): Promise<RecordedPayment[]> {
    return Array.from(this.payments.values())
      .filter(p => p.paymentMethod === method)
      .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
  }

  /**
   * Calculate total payments received in a date range
   */
  async calculateTotalPaymentsInPeriod(fromDate: Date, toDate: Date): Promise<number> {
    const payments = await this.getPaymentsByDateRange(fromDate, toDate);
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Get customer payment history summary
   */
  async getPaymentHistorySummary(
    customerId: string
  ): Promise<{
    totalPayments: number;
    totalAmount: number;
    averagePayment: number;
    lastPaymentDate: Date | null;
    paymentCount: number;
  }> {
    const payments = await this.getPaymentsForCustomer(customerId);

    if (payments.length === 0) {
      return {
        totalPayments: 0,
        totalAmount: 0,
        averagePayment: 0,
        lastPaymentDate: null,
        paymentCount: 0,
      };
    }

    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    return {
      totalPayments: payments.length,
      totalAmount,
      averagePayment: totalAmount / payments.length,
      lastPaymentDate: payments[0].paymentDate,
      paymentCount: payments.length,
    };
  }
}
