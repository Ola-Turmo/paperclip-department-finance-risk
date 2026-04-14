/**
 * Invoice Processor — orchestrates vendor lookup, bill creation, matching, approval.
 * Uses Repository<T> for storage, configurable auto-approval threshold.
 */

import { VendorService, Vendor, VendorStatus, TaxIdType, Vendor1099Type } from './vendor-master.js';
import { BillService, Bill, BillStatus, MatchStatus, ExtractedInvoiceData } from './bill.js';
import { MatchingEngine, MatchResult, MatchResultStatus, DEFAULT_MATCHING_CONFIG } from './matching-engine.js';

export interface InvoiceProcessorConfig {
  autoApproveThreshold: number;   // bills under this amount auto-approve
  companyId: string;
}

export interface ProcessResult {
  billId: string; vendorId: string; vendorName: string;
  invoiceNumber: string; totalAmount: number; status: BillStatus;
  matchResult: MatchResult | null;
  autoApproved: boolean; notes: string[];
}

export class InvoiceProcessor {
  private config: InvoiceProcessorConfig;

  constructor(
    private vendorService: VendorService,
    private billService: BillService,
    private matchingEngine: MatchingEngine,
    config?: Partial<InvoiceProcessorConfig>,
  ) {
    this.config = { autoApproveThreshold: 5000, companyId: 'default', ...config };
    this.matchingEngine.registerConfig(this.config.companyId, DEFAULT_MATCHING_CONFIG);
  }

  async processInvoice(extracted: ExtractedInvoiceData): Promise<ProcessResult> {
    const notes: string[] = [];
    let vendorId: string;
    let vendor: Vendor | null = null;

    // 1. Find or create vendor
    const existing = await this.vendorService.findByName(this.config.companyId, extracted.vendorName);
    if (existing.length === 1) {
      vendor = existing[0];
      vendorId = vendor.id;
      notes.push(`Matched existing vendor: ${vendor.number}`);
    } else {
      vendor = await this.vendorService.create({
        name: extracted.vendorName, status: VendorStatus.ACTIVE, companyId: this.config.companyId,
        taxIdType: TaxIdType.NONE, taxId: '',
        address: { street: '', city: '', state: '', zip: '', country: '' },
        contact: { name: '', email: '', phone: '' },
        paymentTerms: { type: 'net', days: 30 },
        1099: { type: Vendor1099Type.NONE, required: false, threshold: 600, ytdAmount: 0, w9OnFile: false },
        bankAccounts: [],
      });
      vendorId = vendor.id;
      notes.push(`Created new vendor: ${vendor.number}`);
    }

    // 2. Create bill
    const bill = await this.billService.create({
      vendorId, vendorName: extracted.vendorName, companyId: this.config.companyId,
      invoiceNumber: extracted.invoiceNumber,
      invoiceDate: extracted.invoiceDate, dueDate: extracted.dueDate,
      lineItems: extracted.lineItems,
      subtotal: extracted.subtotal, taxAmount: extracted.taxAmount,
      totalAmount: extracted.totalAmount, currency: extracted.currency,
      status: BillStatus.RECEIVED, matchStatus: MatchStatus.PENDING,
    });
    notes.push(`Bill created: ${bill.id}`);

    // 3. Attempt matching
    const matchResult = this.matchingEngine.matchInvoiceToPO({
      companyId: this.config.companyId, invoiceId: bill.id,
      invoiceTotal: extracted.totalAmount, invoiceLines: extracted.lineItems,
    });

    // Update bill match status
    await this.billService.update(bill.id, { matchStatus: matchResult.status === MatchResultStatus.EXCEPTION ? MatchStatus.EXCEPTION : matchResult.status === MatchResultStatus.MATCHED_3WAY ? MatchStatus.MATCHED_3WAY : matchResult.status === MatchResultStatus.MATCHED_2WAY ? MatchStatus.MATCHED_2WAY : matchResult.status === MatchResultStatus.NO_PO ? MatchStatus.NO_PO : MatchStatus.PENDING });

    if (matchResult.status === MatchResultStatus.EXCEPTION) {
      notes.push(`Match exception: ${matchResult.varianceReason}`);
    }

    // 4. Determine approval
    let status: BillStatus;
    let autoApproved = false;

    if (extracted.totalAmount < this.config.autoApproveThreshold) {
      status = BillStatus.APPROVED;
      autoApproved = true;
      notes.push(`Auto-approved (under ${this.config.autoApproveThreshold})`);
    } else {
      status = BillStatus.RECEIVED;
      notes.push(`Pending review (over ${this.config.autoApproveThreshold})`);
    }

    await this.billService.update(bill.id, { status });

    // 5. Update 1099 tracking
    if (vendor && vendor.ytdAmount !== undefined) {
      await this.vendorService.update(vendorId, {
        ytdAmount: (vendor.ytdAmount || 0) + extracted.totalAmount,
      } as any);
    }

    return {
      billId: bill.id, vendorId, vendorName: extracted.vendorName,
      invoiceNumber: extracted.invoiceNumber, totalAmount: extracted.totalAmount,
      status, matchResult, autoApproved, notes,
    };
  }

  async processOutstandingBills(): Promise<{ processed: number; approved: number; exceptions: number }> {
    const bills = await this.billService.list(this.config.companyId);
    const outstanding = bills.filter(b => b.status === BillStatus.RECEIVED || b.status === BillStatus.APPROVED);
    let approved = 0, exceptions = 0;

    for (const bill of outstanding) {
      if (bill.status === BillStatus.APPROVED) approved++;
      else exceptions++;
    }

    return { processed: outstanding.length, approved, exceptions };
  }
}
