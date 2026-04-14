/**
 * Invoice Processor - Orchestrates the complete invoice processing workflow
 * Coordinates vendor lookup, bill creation, matching, and approval routing
 */

import { VendorService, VendorStatus, TaxIdType, Vendor1099Type } from './vendor-master.js';
import { BillService, ExtractedInvoiceData, MatchStatus } from './bill.js';
import { MatchingEngine } from './matching-engine.js';

export interface InvoiceProcessorResult {
  billId: string;
  vendorId: string;
  vendorName: string;
  status: 'created' | 'matched' | 'approved' | 'pending_review';
  matchResult?: any;
  approvalId?: string;
  errors?: string[];
}

export interface InvoiceProcessorConfig {
  autoApproveThreshold: number;
  requireMatchForApproval: boolean;
  createVendorIfNotFound: boolean;
}

export class InvoiceProcessor {
  private config: InvoiceProcessorConfig;

  constructor(
    private vendorService: VendorService,
    private billService: BillService,
    private matchingEngine: MatchingEngine,
    config?: Partial<InvoiceProcessorConfig>
  ) {
    this.config = {
      autoApproveThreshold: config?.autoApproveThreshold ?? 5000,
      requireMatchForApproval: config?.requireMatchForApproval ?? true,
      createVendorIfNotFound: config?.createVendorIfNotFound ?? true,
    };
  }

  /**
   * Process an extracted invoice through the complete workflow
   */
  async processInvoice(extracted: ExtractedInvoiceData): Promise<InvoiceProcessorResult> {
    const errors: string[] = [];

    try {
      // Step 1: Find or create vendor
      let vendor = await this.vendorService.findByName(extracted.vendorName);
      if (!vendor) {
        if (!this.config.createVendorIfNotFound) {
          errors.push(`Vendor not found: ${extracted.vendorName}`);
          return {
            billId: '',
            vendorId: '',
            vendorName: extracted.vendorName,
            status: 'created',
            errors
          };
        }
        vendor = await this.vendorService.create({
          name: extracted.vendorName,
          status: VendorStatus.ACTIVE,
          companyId: 'default',
          taxIdType: TaxIdType.EIN,
          taxId: '',
          address: {
            street: extracted.vendorAddress || '',
            city: '',
            state: '',
            zip: '',
            country: 'US'
          },
          contact: { name: '', email: '', phone: '' },
          paymentTerms: { type: 'net', days: 30 },
          1099: {
            type: Vendor1099Type.NONE,
            required: false,
            threshold: 0,
            ytdAmount: 0,
            w9OnFile: false
          },
        });
      }

      // Step 2: Create bill from extracted data
      const bill = await this.billService.createFromExtracted(extracted, vendor.id);

      // Step 3: Attempt matching
      const matchResult = await this.matchingEngine.attemptMatch(bill);

      // Update match status based on result
      if (matchResult.status === 'matched' || matchResult.status === 'no_po') {
        await this.billService.setMatchStatus(bill.id, MatchStatus.MATCHED);
      } else if (matchResult.status === 'variance') {
        await this.billService.setMatchStatus(bill.id, MatchStatus.VARIANCE);
      } else if (matchResult.status === 'exception') {
        await this.billService.setMatchStatus(bill.id, MatchStatus.EXCEPTION);
      }

      // Step 4: Determine approval status
      // Auto-approve small bills that are matched or have no PO
      const canAutoApprove = bill.totalAmount < this.config.autoApproveThreshold;
      const matchSuccessful = matchResult.status === 'matched' || matchResult.status === 'no_po';

      if (canAutoApprove && matchSuccessful) {
        await this.billService.approve(bill.id, bill.totalAmount);
        
        // Update 1099 tracking
        await this.vendorService.update1099Tracking(vendor.id, bill.totalAmount);
        
        return {
          billId: bill.id,
          vendorId: vendor.id,
          vendorName: vendor.name,
          status: 'approved',
          matchResult
        };
      }

      // Bill requires manual review
      return {
        billId: bill.id,
        vendorId: vendor.id,
        vendorName: vendor.name,
        status: 'pending_review',
        matchResult,
        errors: matchResult.status === 'exception' ? [matchResult.reason || 'Match exception'] : errors
      };

    } catch (error) {
      return {
        billId: '',
        vendorId: '',
        vendorName: extracted.vendorName,
        status: 'created',
        errors: [...errors, String(error)]
      };
    }
  }

  /**
   * Process multiple invoices in batch
   */
  async processBatch(extractedInvoices: ExtractedInvoiceData[]): Promise<InvoiceProcessorResult[]> {
    const results: InvoiceProcessorResult[] = [];
    for (const extracted of extractedInvoices) {
      const result = await this.processInvoice(extracted);
      results.push(result);
    }
    return results;
  }

  /**
   * Get processing statistics for a batch
   */
  summarizeResults(results: InvoiceProcessorResult[]): {
    total: number;
    created: number;
    matched: number;
    approved: number;
    pendingReview: number;
    errors: number;
  } {
    return {
      total: results.length,
      created: results.filter(r => r.status === 'created').length,
      matched: results.filter(r => r.status === 'matched').length,
      approved: results.filter(r => r.status === 'approved').length,
      pendingReview: results.filter(r => r.status === 'pending_review').length,
      errors: results.filter(r => r.errors && r.errors.length > 0).length
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<InvoiceProcessorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): InvoiceProcessorConfig {
    return { ...this.config };
  }

  /**
   * Check if a vendor requires W-9 before processing
   */
  async checkW9Requirement(vendorId: string): Promise<{
    required: boolean;
    w9OnFile: boolean;
    canProcess: boolean
  }> {
    const vendor = await this.vendorService.getById(vendorId);
    if (!vendor) {
      return { required: false, w9OnFile: false, canProcess: false };
    }
    
    const requiresW9 = vendor['1099'].required;
    const w9OnFile = vendor['1099'].w9OnFile;
    
    return {
      required: requiresW9,
      w9OnFile,
      canProcess: !requiresW9 || w9OnFile
    };
  }

  /**
   * Get bills that need 1099 review
   */
  async getBillsRequiring1099Review(): Promise<string[]> {
    const vendors = await this.vendorService.getVendorsRequiring1099();
    const billIds: string[] = [];
    
    for (const vendor of vendors) {
      if (!vendor['1099'].w9OnFile) {
        const thresholdMet = await this.vendorService.check1099Threshold(vendor.id);
        if (thresholdMet) {
          const bills = await this.billService.getOutstanding(vendor.id);
          billIds.push(...bills.map(b => b.id));
        }
      }
    }
    
    return billIds;
  }
}
