/**
 * Matching Engine - 2-way and 3-way invoice matching
 * Validates invoice amounts and quantities against PO and receiving reports
 */

export enum MatchType {
  TWO_WAY = '2_way',
  THREE_WAY = '3_way'
}

export enum MatchResultStatus {
  MATCHED = 'matched',
  VARIANCE = 'variance',
  EXCEPTION = 'exception',
  NO_PO = 'no_po'
}

export interface TwoWayMatchResult {
  status: MatchResultStatus;
  matchType: MatchType;
  invoiceId: string;
  poId?: string;
  invoiceAmount: number;
  poAmount: number;
  varianceAmount: number;
  variancePercent: number;
  reason?: string;
}

export interface ThreeWayMatchResult extends TwoWayMatchResult {
  receivedQty: number;
  invoicedQty: number;
  quantityVariance: number;
  rrId: string;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  poNumber: string;
  lineItems: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }[];
  status: 'open' | 'closed' | 'voided';
  createdAt: Date;
}

export interface ReceivingReport {
  id: string;
  poId: string;
  receivedDate: Date;
  lineItems: {
    poLineItemId: string;
    receivedQty: number;
  }[];
}

export interface MatchException {
  invoiceId: string;
  poId?: string;
  exceptionType: 'amount_variance' | 'quantity_variance' | 'missing_po' | 'missing_rr' | 'po_closed' | 'po_voided';
  description: string;
  varianceAmount?: number;
  variancePercent?: number;
  quantityVariance?: number;
  requiresApproval: boolean;
}

export class MatchingEngine {
  private tolerancePercent = 5;
  private quantityTolerance = 0;

  /**
   * Attempt to match a bill against a PO and optionally a receiving report
   */
  async attemptMatch(
    bill: {
      id: string;
      totalAmount: number;
      lineItems: { quantity: number; unitPrice: number }[];
    },
    po?: PurchaseOrder,
    rr?: ReceivingReport
  ): Promise<TwoWayMatchResult | ThreeWayMatchResult> {
    // No PO found - return no_po status
    if (!po) {
      return {
        status: MatchResultStatus.NO_PO,
        matchType: MatchType.TWO_WAY,
        invoiceId: bill.id,
        invoiceAmount: bill.totalAmount,
        poAmount: 0,
        varianceAmount: 0,
        variancePercent: 0
      };
    }

    // Check if PO is closed or voided
    if (po.status === 'closed') {
      return {
        status: MatchResultStatus.EXCEPTION,
        matchType: MatchType.TWO_WAY,
        invoiceId: bill.id,
        poId: po.id,
        invoiceAmount: bill.totalAmount,
        poAmount: 0,
        varianceAmount: bill.totalAmount,
        variancePercent: 100,
        reason: 'PO is closed'
      };
    }

    if (po.status === 'voided') {
      return {
        status: MatchResultStatus.EXCEPTION,
        matchType: MatchType.TWO_WAY,
        invoiceId: bill.id,
        poId: po.id,
        invoiceAmount: bill.totalAmount,
        poAmount: 0,
        varianceAmount: bill.totalAmount,
        variancePercent: 100,
        reason: 'PO is voided'
      };
    }

    // Calculate PO total
    const poTotal = po.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const varianceAmount = Math.abs(bill.totalAmount - poTotal);
    const variancePercent = poTotal > 0 ? (varianceAmount / poTotal) * 100 : 0;

    // Check if variance exceeds tolerance
    if (variancePercent > this.tolerancePercent) {
      return {
        status: MatchResultStatus.EXCEPTION,
        matchType: MatchType.TWO_WAY,
        invoiceId: bill.id,
        poId: po.id,
        invoiceAmount: bill.totalAmount,
        poAmount: poTotal,
        varianceAmount,
        variancePercent,
        reason: `Amount variance of ${variancePercent.toFixed(2)}% exceeds ${this.tolerancePercent}% tolerance`
      };
    }

    // 2-way match successful - no receiving report provided
    if (!rr) {
      return {
        status: MatchResultStatus.MATCHED,
        matchType: MatchType.TWO_WAY,
        invoiceId: bill.id,
        poId: po.id,
        invoiceAmount: bill.totalAmount,
        poAmount: poTotal,
        varianceAmount,
        variancePercent
      };
    }

    // 3-way match - calculate quantity variances
    const receivedByLine: Record<string, number> = {};
    for (const item of rr.lineItems) {
      receivedByLine[item.poLineItemId] = item.receivedQty;
    }

    const invoicedQty = bill.lineItems.reduce((s, i) => s + i.quantity, 0);
    const receivedQty = Object.values(receivedByLine).reduce((s, q) => s + q, 0);
    const qtyVariance = Math.abs(receivedQty - invoicedQty);

    // Check if quantity variance exceeds tolerance
    if (qtyVariance > this.quantityTolerance) {
      return {
        status: MatchResultStatus.EXCEPTION,
        matchType: MatchType.THREE_WAY,
        invoiceId: bill.id,
        poId: po.id,
        invoiceAmount: bill.totalAmount,
        poAmount: poTotal,
        varianceAmount,
        variancePercent,
        receivedQty,
        invoicedQty,
        quantityVariance: qtyVariance,
        rrId: rr.id,
        reason: `Quantity variance of ${qtyVariance} units exceeds tolerance`
      } as ThreeWayMatchResult;
    }

    // 3-way match successful
    return {
      status: MatchResultStatus.MATCHED,
      matchType: MatchType.THREE_WAY,
      invoiceId: bill.id,
      poId: po.id,
      invoiceAmount: bill.totalAmount,
      poAmount: poTotal,
      varianceAmount,
      variancePercent,
      receivedQty,
      invoicedQty,
      quantityVariance: qtyVariance,
      rrId: rr.id
    } as ThreeWayMatchResult;
  }

  /**
   * Set the amount variance tolerance percentage
   */
  setTolerance(percent: number): void {
    this.tolerancePercent = percent;
  }

  /**
   * Get the current tolerance percentage
   */
  getTolerance(): number {
    return this.tolerancePercent;
  }

  /**
   * Set the quantity tolerance
   */
  setQuantityTolerance(quantity: number): void {
    this.quantityTolerance = quantity;
  }

  /**
   * Get the current quantity tolerance
   */
  getQuantityTolerance(): number {
    return this.quantityTolerance;
  }

  /**
   * Calculate match score (0-100) for UI display
   */
  calculateMatchScore(result: TwoWayMatchResult | ThreeWayMatchResult): number {
    if (result.status === MatchResultStatus.NO_PO) return 0;
    if (result.status === MatchResultStatus.EXCEPTION) return 0;
    if (result.status === MatchResultStatus.VARIANCE) {
      return Math.max(0, 100 - result.variancePercent);
    }
    return 100;
  }

  /**
   * Determine if a match result requires human review
   */
  requiresReview(result: TwoWayMatchResult | ThreeWayMatchResult): boolean {
    return result.status === MatchResultStatus.VARIANCE ||
           result.status === MatchResultStatus.EXCEPTION ||
           result.status === MatchResultStatus.NO_PO;
  }

  /**
   * Get match summary for a batch of bills
   */
  async summarizeMatchResults(results: (TwoWayMatchResult | ThreeWayMatchResult)[]): Promise<{
    total: number;
    matched: number;
    variance: number;
    exception: number;
    noPo: number;
    averageVariancePercent: number;
  }> {
    let matched = 0;
    let variance = 0;
    let exception = 0;
    let noPo = 0;
    let totalVariancePercent = 0;
    let varianceCount = 0;

    for (const r of results) {
      switch (r.status) {
        case MatchResultStatus.MATCHED:
          matched++;
          break;
        case MatchResultStatus.VARIANCE:
          variance++;
          totalVariancePercent += r.variancePercent;
          varianceCount++;
          break;
        case MatchResultStatus.EXCEPTION:
          exception++;
          break;
        case MatchResultStatus.NO_PO:
          noPo++;
          break;
      }
    }

    return {
      total: results.length,
      matched,
      variance,
      exception,
      noPo,
      averageVariancePercent: varianceCount > 0 ? totalVariancePercent / varianceCount : 0
    };
  }

  /**
   * Create a MatchException from a match result
   */
  createException(result: TwoWayMatchResult | ThreeWayMatchResult): MatchException {
    const base = {
      invoiceId: result.invoiceId,
      poId: result.poId,
      requiresApproval: true
    };

    switch (result.status) {
      case MatchResultStatus.NO_PO:
        return {
          ...base,
          exceptionType: 'missing_po',
          description: 'No matching purchase order found'
        };
      case MatchResultStatus.EXCEPTION:
        if (result.reason?.includes('Quantity')) {
          return {
            ...base,
            exceptionType: 'quantity_variance',
            description: result.reason || 'Quantity variance detected',
            quantityVariance: (result as ThreeWayMatchResult).quantityVariance
          };
        }
        if (result.reason?.includes('closed')) {
          return {
            ...base,
            exceptionType: 'po_closed',
            description: result.reason || 'PO is closed'
          };
        }
        if (result.reason?.includes('voided')) {
          return {
            ...base,
            exceptionType: 'po_voided',
            description: result.reason || 'PO is voided'
          };
        }
        return {
          ...base,
          exceptionType: 'amount_variance',
          description: result.reason || 'Amount variance exceeds tolerance',
          varianceAmount: result.varianceAmount,
          variancePercent: result.variancePercent
        };
      case MatchResultStatus.VARIANCE:
        return {
          ...base,
          exceptionType: 'amount_variance',
          description: result.reason || 'Minor variance detected',
          varianceAmount: result.varianceAmount,
          variancePercent: result.variancePercent
        };
      default:
        return {
          ...base,
          exceptionType: 'amount_variance',
          description: 'Unknown matching issue'
        };
    }
  }

  /**
   * Check if an invoice amount is within tolerance of PO
   */
  isWithinTolerance(invoiceAmount: number, poAmount: number): boolean {
    if (poAmount === 0) return false;
    const variancePercent = Math.abs((invoiceAmount - poAmount) / poAmount) * 100;
    return variancePercent <= this.tolerancePercent;
  }

  /**
   * Calculate suggested approval amount based on match results
   */
  suggestApprovalAmount(result: TwoWayMatchResult | ThreeWayMatchResult): number {
    if (result.status === MatchResultStatus.MATCHED) {
      return result.invoiceAmount;
    }
    if (result.poAmount > 0) {
      return result.poAmount;
    }
    return result.invoiceAmount;
  }

  /**
   * Get match type description
   */
  getMatchTypeDescription(result: TwoWayMatchResult | ThreeWayMatchResult): string {
    if (result.matchType === MatchType.TWO_WAY) {
      return '2-Way Match: Invoice compared to PO';
    }
    return '3-Way Match: Invoice compared to PO and Receiving Report';
  }

  /**
   * Calculate PO line item match details
   */
  calculateLineItemVariances(
    billLineItems: { description: string; quantity: number; unitPrice: number; amount: number }[],
    poLineItems: { id: string; description: string; quantity: number; unitPrice: number }[]
  ): {
    poLineItemId: string;
    description: string;
    poQty: number;
    poUnitPrice: number;
    poAmount: number;
    invoiceQty: number;
    invoiceUnitPrice: number;
    invoiceAmount: number;
    qtyVariance: number;
    amountVariance: number;
  }[] {
    return poLineItems.map(poItem => {
      // Find corresponding bill line item by index or description similarity
      const billItem = billLineItems.find((b, i) => i === poLineItems.indexOf(poItem)) || billLineItems[0];
      
      const qtyVariance = Math.abs(poItem.quantity - (billItem?.quantity || 0));
      const amountVariance = Math.abs(
        poItem.quantity * poItem.unitPrice - 
        (billItem?.quantity || 0) * (billItem?.unitPrice || 0)
      );

      return {
        poLineItemId: poItem.id,
        description: poItem.description,
        poQty: poItem.quantity,
        poUnitPrice: poItem.unitPrice,
        poAmount: poItem.quantity * poItem.unitPrice,
        invoiceQty: billItem?.quantity || 0,
        invoiceUnitPrice: billItem?.unitPrice || 0,
        invoiceAmount: (billItem?.quantity || 0) * (billItem?.unitPrice || 0),
        qtyVariance,
        amountVariance
      };
    });
  }
}
