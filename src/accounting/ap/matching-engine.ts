/**
 * Matching Engine — configurable tolerance per company policy.
 */

import { Repository } from '../core/interfaces.js';

export enum MatchResultStatus { PENDING = 'pending', NO_PO = 'no_po', MATCHED_2WAY = '2way', MATCHED_3WAY = '3way', EXCEPTION = 'exception' }
export interface MatchResult { status: MatchResultStatus; poId?: string; invoiceId: string; varianceAmount: number; varianceReason?: string; tolerancePercent: number; }

export interface MatchingConfig {
  twoWayTolerance: number;       // $ amount variance allowed for 2-way
  threeWayTolerance: number;      // $ amount variance allowed for 3-way
  priceTolerancePercent: number; // % variance for unit price
  quantityTolerancePercent: number;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  twoWayTolerance: 1.00, threeWayTolerance: 0.00,
  priceTolerancePercent: 0.02, quantityTolerancePercent: 0.0,
};

export class MatchingEngine {
  private configs = new Map<string, MatchingConfig>();

  registerConfig(companyId: string, config: MatchingConfig): void {
    this.configs.set(companyId, config);
  }

  private config(companyId: string): MatchingConfig {
    return this.configs.get(companyId) ?? DEFAULT_MATCHING_CONFIG;
  }

  matchInvoiceToPO(params: {
    companyId: string; invoiceId: string;
    invoiceTotal: number; invoiceLines: { quantity: number; unitPrice: number; amount: number; description: string; }[];
    poTotal?: number; poLines?: { quantity: number; unitPrice: number; amount: number; description: string; }[];
    receivingQty?: number[];
  }): MatchResult {
    const cfg = this.config(params.companyId);
    if (!params.poTotal) return { status: MatchResultStatus.NO_PO, invoiceId: params.invoiceId, varianceAmount: 0, tolerancePercent: cfg.twoWayTolerance };

    const variance = Math.abs(params.invoiceTotal - (params.poTotal || 0));
    const variancePercent = (variance / params.invoiceTotal) * 100;

    if (variance <= cfg.twoWayTolerance) return { status: MatchResultStatus.MATCHED_2WAY, invoiceId: params.invoiceId, varianceAmount: variance, tolerancePercent: cfg.twoWayTolerance };

    if (params.receivingQty && params.poLines) {
      const allReceived = params.poLines.every((pol, i) => (params.receivingQty?.[i] || 0) >= pol.quantity);
      if (allReceived && variance <= cfg.threeWayTolerance) return { status: MatchResultStatus.MATCHED_3WAY, invoiceId: params.invoiceId, varianceAmount: variance, tolerancePercent: cfg.threeWayTolerance };
    }

    return { status: MatchResultStatus.EXCEPTION, invoiceId: params.invoiceId, varianceAmount: variance, varianceReason: 'Variance exceeds tolerance', tolerancePercent: cfg.twoWayTolerance };
  }
}
