/**
 * Dunning Workflow - Automated dunning rules and email/letter generation
 * Part of the AR module (Phase 3)
 */

export enum DunningLevel {
  REMINDER = 1,
  OVERDUE_NOTICE = 2,
  FINAL_NOTICE = 3,
  COLLECTIONS = 4
}

export enum DunningAction {
  EMAIL = 'email',
  LETTER = 'letter',
  PHONE = 'phone',
  ESCALATE = 'escalate',
  HOLD = 'hold'
}

export interface DunningRule {
  level: DunningLevel;
  name: string;
  daysPastDue: number;
  action: DunningAction;
  templateId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  autoSend: boolean;
}

export interface DunningActionItem {
  customerId: string;
  invoiceId: string;
  rule: DunningRule;
  generatedAt: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'acknowledged' | 'resolved';
  amount: number;
}

export const DUNNING_RULES: DunningRule[] = [
  {
    level: DunningLevel.REMINDER,
    name: 'Friendly Reminder',
    daysPastDue: 1,
    action: DunningAction.EMAIL,
    templateId: 'dunning_reminder_1',
    priority: 'low',
    autoSend: true
  },
  {
    level: DunningLevel.OVERDUE_NOTICE,
    name: 'Overdue Notice',
    daysPastDue: 15,
    action: DunningAction.LETTER,
    templateId: 'dunning_overdue_notice',
    priority: 'medium',
    autoSend: false
  },
  {
    level: DunningLevel.FINAL_NOTICE,
    name: 'Final Notice',
    daysPastDue: 30,
    action: DunningAction.LETTER,
    templateId: 'dunning_final_notice',
    priority: 'high',
    autoSend: false
  },
  {
    level: DunningLevel.COLLECTIONS,
    name: 'Collections',
    daysPastDue: 60,
    action: DunningAction.ESCALATE,
    templateId: 'dunning_collections',
    priority: 'critical',
    autoSend: false
  },
];

/**
 * Generate dunning email/letter content based on rule and parameters
 */
export function generateDunningEmail(
  rule: DunningRule,
  customerName: string,
  invoiceNumber: string,
  amountDue: number,
  daysPastDue: number
): string {
  const templates: Record<DunningLevel, string> = {
    [DunningLevel.REMINDER]: `Dear ${customerName},

This is a friendly reminder that invoice ${invoiceNumber} for $${amountDue.toFixed(2)} is now due.

Please arrange payment at your earliest convenience.

Thank you for your business.`,

    [DunningLevel.OVERDUE_NOTICE]: `Dear ${customerName},

Invoice ${invoiceNumber} for $${amountDue.toFixed(2)} is ${daysPastDue} days past due.

Please remit payment immediately to avoid further collection activity.

Thank you.`,

    [DunningLevel.FINAL_NOTICE]: `Dear ${customerName},

FINAL NOTICE: Invoice ${invoiceNumber} for $${amountDue.toFixed(2)} is ${daysPastDue} days overdue.

Unless payment is received within 10 days, this account will be escalated to our collections department.

Please contact us immediately to resolve this matter.`,

    [DunningLevel.COLLECTIONS]: `Dear ${customerName},

Your account has been escalated to collections due to ${daysPastDue} days of non-payment.

Please contact our collections department immediately to resolve invoice ${invoiceNumber} for $${amountDue.toFixed(2)}.`,
  };

  return templates[rule.level];
}

export interface DunningContext {
  customerName: string;
  customerEmail?: string;
  customerAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  amountDue: number;
  daysPastDue: number;
}

export class DunningWorkflow {
  private sentRecords: Map<string, Set<DunningLevel>> = new Map(); // customerId → levels already sent
  private actionHistory: DunningActionItem[] = [];
  private idCounter = 0;

  private nextId(): string {
    return `dunning_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Process a customer and their open invoices to generate dunning actions
   */
  async processCustomer(
    customerId: string,
    openInvoices: Array<{
      id: string;
      invoiceNumber: string;
      dueDate: Date;
      total: number;
      amountPaid: number;
      amountCredited: number;
      status: string;
    }>
  ): Promise<DunningActionItem[]> {
    const today = new Date();
    const actions: DunningActionItem[] = [];
    const sent = this.sentRecords.get(customerId) || new Set();

    for (const rule of DUNNING_RULES) {
      // Skip if already sent this level
      if (sent.has(rule.level)) {
        continue;
      }

      for (const invoice of openInvoices) {
        // Skip paid or voided invoices
        if (invoice.status === 'paid' || invoice.status === 'voided') {
          continue;
        }

        const daysPastDue = this.daysBetween(invoice.dueDate, today);

        // Check if this invoice qualifies for this dunning level
        if (daysPastDue >= rule.daysPastDue) {
          const amountDue = invoice.total - invoice.amountPaid - invoice.amountCredited;

          actions.push({
            customerId,
            invoiceId: invoice.id,
            rule,
            generatedAt: today,
            status: rule.autoSend ? 'pending' : 'pending',
            amount: amountDue,
          });

          // Mark this level as sent for this customer
          sent.add(rule.level);
          break; // Only one action per level per customer
        }
      }
    }

    // Store sent records
    this.sentRecords.set(customerId, sent);

    // Add to history
    this.actionHistory.push(...actions);

    return actions;
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(a: Date, b: Date): number {
    return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get the last dunning level sent to a customer
   */
  getLastDunningLevel(customerId: string): DunningLevel | null {
    const sent = this.sentRecords.get(customerId);
    if (!sent || sent.size === 0) {
      return null;
    }
    return Math.max(...Array.from(sent)) as DunningLevel;
  }

  /**
   * Mark a dunning action as sent
   */
  async markAsSent(customerId: string, invoiceId: string, ruleLevel: DunningLevel): Promise<void> {
    const action = this.actionHistory.find(
      a => a.customerId === customerId && a.invoiceId === invoiceId && a.rule.level === ruleLevel
    );

    if (action) {
      action.status = 'sent';
      action.sentAt = new Date();
    }
  }

  /**
   * Mark a dunning action as acknowledged
   */
  async markAsAcknowledged(customerId: string, invoiceId: string, ruleLevel: DunningLevel): Promise<void> {
    const action = this.actionHistory.find(
      a => a.customerId === customerId && a.invoiceId === invoiceId && a.rule.level === ruleLevel
    );

    if (action) {
      action.status = 'acknowledged';
    }
  }

  /**
   * Mark a dunning action as resolved (payment received)
   */
  async markAsResolved(customerId: string, invoiceId: string, ruleLevel: DunningLevel): Promise<void> {
    const action = this.actionHistory.find(
      a => a.customerId === customerId && a.invoiceId === invoiceId && a.rule.level === ruleLevel
    );

    if (action) {
      action.status = 'resolved';
    }
  }

  /**
   * Get pending dunning actions for a customer
   */
  getPendingActions(customerId: string): DunningActionItem[] {
    return this.actionHistory.filter(
      a => a.customerId === customerId && a.status === 'pending'
    );
  }

  /**
   * Get action history for a customer
   */
  getActionHistory(customerId: string): DunningActionItem[] {
    return this.actionHistory.filter(a => a.customerId === customerId);
  }

  /**
   * Get all actions that need to be sent
   */
  async getActionsToSend(): Promise<DunningActionItem[]> {
    return this.actionHistory.filter(a => a.status === 'pending' && a.rule.autoSend);
  }

  /**
   * Reset dunning records for a customer (e.g., after payment in full)
   */
  resetCustomer(customerId: string): void {
    this.sentRecords.delete(customerId);
    // Also mark all pending actions as resolved
    for (const action of this.actionHistory) {
      if (action.customerId === customerId && action.status === 'pending') {
        action.status = 'resolved';
      }
    }
  }

  /**
   * Get dunning statistics
   */
  getStatistics(): {
    totalActions: number;
    pendingActions: number;
    sentActions: number;
    acknowledgedActions: number;
    resolvedActions: number;
    customersInDunning: number;
  } {
    const stats = {
      totalActions: this.actionHistory.length,
      pendingActions: 0,
      sentActions: 0,
      acknowledgedActions: 0,
      resolvedActions: 0,
      customersInDunning: new Set<string>().size,
    };

    const customers = new Set<string>();

    for (const action of this.actionHistory) {
      customers.add(action.customerId);
      switch (action.status) {
        case 'pending':
          stats.pendingActions++;
          break;
        case 'sent':
          stats.sentActions++;
          break;
        case 'acknowledged':
          stats.acknowledgedActions++;
          break;
        case 'resolved':
          stats.resolvedActions++;
          break;
      }
    }

    stats.customersInDunning = customers.size;
    return stats;
  }

  /**
   * Generate a full dunning letter/email with all outstanding invoices for a customer
   */
  generateCustomerDunningLetter(
    customerId: string,
    customerName: string,
    invoices: Array<{
      invoiceNumber: string;
      dueDate: Date;
      total: number;
      amountPaid: number;
      amountCredited: number;
      daysPastDue: number;
    }>,
    dunningLevel: DunningLevel
  ): string {
    const rule = DUNNING_RULES.find(r => r.level === dunningLevel);
    if (!rule) {
      throw new Error(`Invalid dunning level: ${dunningLevel}`);
    }

    const totalDue = invoices.reduce((sum, inv) => {
      return sum + (inv.total - inv.amountPaid - inv.amountCredited);
    }, 0);

    const today = new Date();
    let letter = '';

    // Header
    letter += `=== DUNNING ${dunningLevel} - ${rule.name.toUpperCase()} ===\n`;
    letter += `Date: ${today.toLocaleDateString()}\n`;
    letter += `Customer: ${customerName}\n`;
    letter += `Customer ID: ${customerId}\n\n`;

    // Invoice details
    letter += 'OUTSTANDING INVOICES:\n';
    letter += '-'.repeat(80) + '\n';
    for (const inv of invoices) {
      const amountDue = inv.total - inv.amountPaid - inv.amountCredited;
      letter += `Invoice: ${inv.invoiceNumber}\n`;
      letter += `  Due Date: ${inv.dueDate.toLocaleDateString()}\n`;
      letter += `  Amount Due: $${amountDue.toFixed(2)}\n`;
      letter += `  Days Past Due: ${inv.daysPastDue}\n\n`;
    }
    letter += '-'.repeat(80) + '\n';
    letter += `TOTAL AMOUNT DUE: $${totalDue.toFixed(2)}\n\n`;

    // Message based on level
    if (dunningLevel === DunningLevel.REMINDER) {
      letter += generateDunningEmail(rule, customerName, invoices[0]?.invoiceNumber || '', totalDue, Math.max(...invoices.map(i => i.daysPastDue)));
    } else if (dunningLevel === DunningLevel.OVERDUE_NOTICE) {
      letter += generateDunningEmail(rule, customerName, invoices[0]?.invoiceNumber || '', totalDue, Math.max(...invoices.map(i => i.daysPastDue)));
    } else if (dunningLevel === DunningLevel.FINAL_NOTICE) {
      letter += generateDunningEmail(rule, customerName, invoices[0]?.invoiceNumber || '', totalDue, Math.max(...invoices.map(i => i.daysPastDue)));
    } else if (dunningLevel === DunningLevel.COLLECTIONS) {
      letter += generateDunningEmail(rule, customerName, invoices[0]?.invoiceNumber || '', totalDue, Math.max(...invoices.map(i => i.daysPastDue)));
    }

    return letter;
  }

  /**
   * Check if a customer should be escalated
   */
  shouldEscalate(customerId: string): boolean {
    const lastLevel = this.getLastDunningLevel(customerId);
    return lastLevel !== null && lastLevel >= DunningLevel.FINAL_NOTICE;
  }

  /**
   * Get customers ready for collections
   */
  getCollectionsReadyCustomers(): string[] {
    const customers = new Set<string>();
    for (const [customerId, levels] of this.sentRecords.entries()) {
      if (levels.has(DunningLevel.COLLECTIONS)) {
        customers.add(customerId);
      }
    }
    return Array.from(customers);
  }
}
