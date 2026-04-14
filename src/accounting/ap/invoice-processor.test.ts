/**
 * AP Invoice Processor — Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VendorService, VendorStatus, TaxIdType, Vendor1099Type } from "./vendor-master.js";
import { BillService, BillStatus, MatchStatus } from "./bill.js";
import { MatchingEngine } from "./matching-engine.js";
import { InvoiceProcessor } from "./invoice-processor.js";
import { ExtractedInvoiceData } from "./bill.js";

describe("InvoiceProcessor", () => {
  let vendorService: VendorService;
  let billService: BillService;
  let matchingEngine: MatchingEngine;
  let processor: InvoiceProcessor;

  beforeEach(() => {
    vendorService = new VendorService();
    billService = new BillService();
    matchingEngine = new MatchingEngine();
    processor = new InvoiceProcessor(vendorService, billService, matchingEngine);
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

    expect(result.status).toBe("pending_review");
    expect(result.vendorId).toBeDefined();
    expect(result.billId).toBeDefined();
    expect(result.vendorName).toBe("Acme Supplies");
  });

  it("should auto-approve small bills under $5000", async () => {
    const extracted: ExtractedInvoiceData = {
      vendorName: "Small Vendor",
      invoiceNumber: "INV-SMALL",
      invoiceDate: "2024-01-15",
      dueDate: "2024-02-15",
      lineItems: [{ description: "Minor Expense", quantity: 1, unitPrice: 500, amount: 500, accountCode: "6100" }],
      subtotal: 500, taxAmount: 0, totalAmount: 500, currency: "USD",
    };

    const result = await processor.processInvoice(extracted);

    expect(result.status).toBe("approved");
  });

  it("should find existing vendor by name", async () => {
    await vendorService.create({
      name: "Existing Corp", status: VendorStatus.ACTIVE, companyId: "default",
      taxIdType: TaxIdType.EIN, taxId: "12-3456789",
      address: { street: "123 Main St", city: "NYC", state: "NY", zip: "10001", country: "US" },
      contact: { name: "John Doe", email: "john@existing.com", phone: "555-0100" },
      paymentTerms: { type: "net", days: 30 },
      1099: { type: Vendor1099Type.NONE, required: false, threshold: 0, ytdAmount: 0, w9OnFile: false },
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
    const bills = await billService.list({});
    expect(bills.length).toBe(1);
    expect(result.vendorName).toBe("Existing Corp");
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

    expect(result.status).toBe("approved"); // small bill auto-approved
    expect(result.matchResult).toBeDefined();
    expect(result.matchResult.status).toBe("no_po");
  });
});
