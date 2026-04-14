/**
 * Invoice Processor — Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VendorService, VendorStatus, TaxIdType, Vendor1099Type } from "./vendor-master.js";
import { BillService, BillStatus, MatchStatus } from "./bill.js";
import { MatchingEngine } from "./matching-engine.js";
import { InvoiceProcessor } from "./invoice-processor.js";
import { ExtractedInvoiceData } from "./bill.js";
import { InMemoryRepository } from "../core/interfaces.js";
import { CompanyConfigService } from "../core/company-config.js";

describe("InvoiceProcessor", () => {
  let vendorService: VendorService;
  let billService: BillService;
  let matchingEngine: MatchingEngine;
  let processor: InvoiceProcessor;
  let companyConfig: CompanyConfigService;

  beforeEach(async () => {
    const vendorRepo = new InMemoryRepository<any>();
    const billRepo = new InMemoryRepository<any>();
    companyConfig = new CompanyConfigService();
    await companyConfig.register({
      id: 'test-co', name: 'Test Co', country: { countryCode: 'US', countryName: 'United States', currencyCode: 'USD', currencyDecimals: 2, dateFormat: 'MM/DD/YYYY', fiscalYearStart: 1, taxAuthority: 'IRS' },
      jurisdictions: [{ id: 'US-FEDERAL', countryCode: 'US', level: 'federal', name: 'US Federal', taxRates: [{ type: 'corporate_income', rate: 0.21, description: 'Fed rate' }], filingFrequencies: [{ taxType: 'corporate_income', frequency: 'annually' }], effectiveFrom: new Date('2024-01-01') }],
      accountingPolicy: { id: 'test-policy', companyId: 'test-co', functionalCurrency: 'USD', presentationCurrency: 'USD', fiscalYearStartMonth: 1, useFiscalYear: true, amountDecimalPlaces: 2, defaultTaxRate: 0.08, salesTaxInclusive: false, vendorNumberPrefix: 'VEN-', customerNumberPrefix: 'CUS-', invoiceNumberFormat: 'INV-{YYYY}-{NNN}', journalNumberFormat: 'JE-{YYYY}-{NNN}', assetNumberPrefix: 'FA-', payrollFrequency: 'biweekly', payrollWeekStart: 1, chartOfAccountsId: 'test-coa' },
      intercompanyEnabled: false, consolidationRequired: false,
    });
    vendorService = new VendorService(vendorRepo as any, companyConfig);
    billService = new BillService(billRepo as any);
    matchingEngine = new MatchingEngine();
    processor = new InvoiceProcessor(vendorService, billService, matchingEngine, { companyId: 'test-co', autoApproveThreshold: 5000 });
  });

  it("should create a vendor and bill from extracted invoice data", async () => {
    const extracted: ExtractedInvoiceData = {
      vendorName: "Acme Supplies",
      invoiceNumber: "INV-2024-001",
      invoiceDate: "2024-01-15",
      dueDate: "2024-02-15",
      lineItems: [{ description: "Office Supplies", quantity: 10, unitPrice: 50, amount: 500, accountCode: "6100" }],
      subtotal: 500, taxAmount: 50, totalAmount: 550, currency: "USD",
    };

    const result = await processor.processInvoice(extracted);

    expect(result.status).toBe(BillStatus.RECEIVED);
    expect(result.vendorId).toBeDefined();
    expect(result.billId).toBeDefined();
    expect(result.vendorName).toBe("Acme Supplies");
  });

  it("should auto-approve small bills under threshold", async () => {
    const extracted: ExtractedInvoiceData = {
      vendorName: "Small Vendor",
      invoiceNumber: "INV-SMALL",
      invoiceDate: "2024-01-15",
      dueDate: "2024-02-15",
      lineItems: [{ description: "Minor Expense", quantity: 1, unitPrice: 500, amount: 500, accountCode: "6100" }],
      subtotal: 500, taxAmount: 0, totalAmount: 500, currency: "USD",
    };

    const result = await processor.processInvoice(extracted);

    expect(result.status).toBe(BillStatus.APPROVED);
    expect(result.autoApproved).toBe(true);
  });

  it("should find existing vendor by name", async () => {
    await vendorService.create({
      name: "Existing Corp", status: VendorStatus.ACTIVE, companyId: "test-co",
      taxIdType: TaxIdType.EIN, taxId: "12-3456789",
      address: { street: "123 Main St", city: "NYC", state: "NY", zip: "10001", country: "US" },
      contact: { name: "John Doe", email: "john@existing.com", phone: "555-0100" },
      paymentTerms: { type: "net", days: 30 },
      1099: { type: Vendor1099Type.NONE, required: false, threshold: 0, ytdAmount: 0, w9OnFile: false },
      bankAccounts: [],
    });

    const extracted: ExtractedInvoiceData = {
      vendorName: "Existing Corp",
      invoiceNumber: "INV-EXISTING",
      invoiceDate: "2024-01-15",
      dueDate: "2024-02-15",
      lineItems: [],
      subtotal: 1000, taxAmount: 100, totalAmount: 1100, currency: "USD",
    };

    const result = await processor.processInvoice(extracted);
    expect(result.vendorName).toBe("Existing Corp");
    expect(result.notes.some((n: string) => n.includes('Matched existing vendor'))).toBe(true);
  });

  it("should match bills without PO as no_po status", async () => {
    const extracted: ExtractedInvoiceData = {
      vendorName: "NoPO Vendor",
      invoiceNumber: "INV-NOPO",
      invoiceDate: "2024-01-15",
      dueDate: "2024-02-15",
      lineItems: [{ description: "Service", quantity: 1, unitPrice: 300, amount: 300, accountCode: "6200" }],
      subtotal: 300, taxAmount: 0, totalAmount: 300, currency: "USD",
    };

    const result = await processor.processInvoice(extracted);

    expect(result.status).toBe(BillStatus.APPROVED); // small bill auto-approved
    expect(result.matchResult).toBeDefined();
    expect(result.matchResult!.status).toBe(MatchStatus.NO_PO);
  });
});
