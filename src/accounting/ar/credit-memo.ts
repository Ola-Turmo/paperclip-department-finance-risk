/**
 * Credit Memo - Credit memos, refunds, write-offs
 * Part of the AR module (Phase 3)
 */

export enum CreditMemoStatus {
  OPEN = 'open',
  APPLIED = 'applied',
  VOIDED = 'voided'
}

export type CreditMemoReason = 'overpayment' | 'return' | 'discount' | 'dispute_resolved' | 'write_off';

export interface CreditMemo {
  id: string;
  customerId: string;
  invoiceId?: string;
  creditMemoNumber: string;
  date: Date;
  status: CreditMemoStatus;
  reason: CreditMemoReason;
  amount: number;
  amountApplied: number;
  description: string;
  appliedTo?: string[]; // invoice IDs this credit has been applied to
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCreditMemoParams {
  customerId: string;
  invoiceId?: string;
  reason: CreditMemoReason;
  amount: number;
  description: string;
}

export class CreditMemoService {
  private storage: Map<string, CreditMemo> = new Map();
  private idCounter = 0;

  private nextId(): string {
    return `cm_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Generate a unique credit memo number
   * Format: CM-YYYY-NNNNN
   */
  private generateCreditMemoNumber(): string {
    const year = new Date().getFullYear();
    const count = this.storage.size + 1;
    return `CM-${year}-${String(count).padStart(5, '0')}`;
  }

  /**
   * Create a new credit memo
   */
  async create(params: CreateCreditMemoParams): Promise<CreditMemo> {
    // Validate required fields
    if (!params.customerId) {
      throw new Error('Customer ID is required');
    }
    if (!params.reason) {
      throw new Error('Reason is required');
    }
    if (params.amount <= 0) {
      throw new Error('Credit memo amount must be positive');
    }
    if (!params.description || params.description.trim().length === 0) {
      throw new Error('Description is required');
    }

    const now = new Date();
    const memo: CreditMemo = {
      id: this.nextId(),
      customerId: params.customerId,
      invoiceId: params.invoiceId,
      creditMemoNumber: this.generateCreditMemoNumber(),
      date: now,
      status: CreditMemoStatus.OPEN,
      reason: params.reason,
      amount: params.amount,
      amountApplied: 0,
      description: params.description,
      appliedTo: [],
      createdAt: now,
      updatedAt: now,
    };

    this.storage.set(memo.id, memo);
    return memo;
  }

  /**
   * Get a credit memo by ID
   */
  async getById(id: string): Promise<CreditMemo | null> {
    return this.storage.get(id) || null;
  }

  /**
   * Get credit memo by credit memo number
   */
  async getByCreditMemoNumber(creditMemoNumber: string): Promise<CreditMemo | null> {
    for (const memo of this.storage.values()) {
      if (memo.creditMemoNumber === creditMemoNumber) {
        return memo;
      }
    }
    return null;
  }

  /**
   * Apply a credit memo to an invoice
   */
  async apply(customerId: string, creditMemoId: string, invoiceId: string, amount: number): Promise<void> {
    const memo = this.storage.get(creditMemoId);
    if (!memo) {
      throw new Error('Credit memo not found');
    }

    if (memo.customerId !== customerId) {
      throw new Error('Credit memo does not belong to this customer');
    }

    if (memo.status === CreditMemoStatus.VOIDED) {
      throw new Error('Cannot apply a voided credit memo');
    }

    if (memo.status === CreditMemoStatus.APPLIED) {
      throw new Error('Credit memo is already fully applied');
    }

    const availableAmount = memo.amount - memo.amountApplied;
    if (amount > availableAmount) {
      throw new Error(`Amount exceeds available credit memo balance. Available: ${availableAmount}`);
    }

    // Update credit memo
    memo.amountApplied += amount;
    memo.appliedTo = [...(memo.appliedTo || []), invoiceId];
    memo.updatedAt = new Date();

    // Mark as applied if fully used
    if (memo.amountApplied >= memo.amount) {
      memo.status = CreditMemoStatus.APPLIED;
    }
  }

  /**
   * Void a credit memo
   */
  async void(id: string): Promise<void> {
    const memo = this.storage.get(id);
    if (!memo) {
      throw new Error('Credit memo not found');
    }

    if (memo.status === CreditMemoStatus.VOIDED) {
      throw new Error('Credit memo is already voided');
    }

    if (memo.amountApplied > 0) {
      throw new Error('Cannot void a credit memo that has been partially or fully applied');
    }

    memo.status = CreditMemoStatus.VOIDED;
    memo.updatedAt = new Date();
  }

  /**
   * List credit memos for a customer
   */
  async listByCustomer(customerId: string): Promise<CreditMemo[]> {
    return Array.from(this.storage.values())
      .filter(m => m.customerId === customerId && m.status !== CreditMemoStatus.VOIDED)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Get all open credit memos for a customer
   */
  async getOpenCreditMemos(customerId: string): Promise<CreditMemo[]> {
    return Array.from(this.storage.values())
      .filter(m => m.customerId === customerId && m.status === CreditMemoStatus.OPEN)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Get total available credit for a customer
   */
  async getAvailableCredit(customerId: string): Promise<number> {
    const openMemos = await this.getOpenCreditMemos(customerId);
    return openMemos.reduce((sum, memo) => {
      return sum + (memo.amount - memo.amountApplied);
    }, 0);
  }

  /**
   * Issue a refund instead of applying to invoice
   */
  async issueRefund(creditMemoId: string): Promise<CreditMemo> {
    const memo = this.storage.get(creditMemoId);
    if (!memo) {
      throw new Error('Credit memo not found');
    }

    if (memo.status === CreditMemoStatus.VOIDED) {
      throw new Error('Cannot refund a voided credit memo');
    }

    if (memo.amountApplied > 0) {
      throw new Error('Cannot refund a credit memo that has been applied to invoices');
    }

    // Mark as applied (refunded)
    memo.status = CreditMemoStatus.APPLIED;
    memo.updatedAt = new Date();

    return memo;
  }

  /**
   * Get credit memos by reason
   */
  async getByReason(reason: CreditMemoReason): Promise<CreditMemo[]> {
    return Array.from(this.storage.values())
      .filter(m => m.reason === reason && m.status !== CreditMemoStatus.VOIDED)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Write off a credit memo (typically for small amounts that are not worth pursuing)
   */
  async writeOff(id: string): Promise<void> {
    const memo = this.storage.get(id);
    if (!memo) {
      throw new Error('Credit memo not found');
    }

    if (memo.status === CreditMemoStatus.VOIDED) {
      throw new Error('Credit memo is already voided');
    }

    memo.status = CreditMemoStatus.VOIDED;
    memo.reason = 'write_off';
    memo.updatedAt = new Date();
  }

  /**
   * Get credit memo balance (remaining amount available)
   */
  async getBalance(id: string): Promise<number> {
    const memo = this.storage.get(id);
    if (!memo) {
      throw new Error('Credit memo not found');
    }
    return memo.amount - memo.amountApplied;
  }

  /**
   * List all credit memos with optional filters
   */
  async list(filters?: {
    customerId?: string;
    status?: CreditMemoStatus;
    reason?: CreditMemoReason;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<CreditMemo[]> {
    let memos = Array.from(this.storage.values());

    if (filters?.customerId) {
      memos = memos.filter(m => m.customerId === filters.customerId);
    }

    if (filters?.status) {
      memos = memos.filter(m => m.status === filters.status);
    }

    if (filters?.reason) {
      memos = memos.filter(m => m.reason === filters.reason);
    }

    if (filters?.fromDate) {
      memos = memos.filter(m => m.date >= filters.fromDate!);
    }

    if (filters?.toDate) {
      memos = memos.filter(m => m.date <= filters.toDate!);
    }

    return memos.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Get total credit memos issued in a period
   */
  async getTotalIssuedInPeriod(fromDate: Date, toDate: Date): Promise<number> {
    const memos = await this.list({ fromDate, toDate });
    return memos.reduce((sum, m) => sum + m.amount, 0);
  }
}
