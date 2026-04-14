/**
 * Asset Disposal — Gain/loss calculation and GL entry generation
 */

import { AssetRegister } from './asset-register.js';

export interface DisposalResult {
  assetId: string; assetName: string; disposalDate: Date;
  proceeds: number; bookValue: number; gainOrLoss: number;
  glEntries: { accountCode: string; description: string; debit: number; credit: number; }[];
}

export class DisposalService {
  constructor(private assetRegister: AssetRegister) {}

  async processDisposal(assetId: string, proceeds: number, disposalDate: Date): Promise<DisposalResult> {
    const asset = await this.assetRegister.getById(assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    const bookValue = await this.assetRegister.getBookValue(assetId);
    const gainOrLoss = proceeds - bookValue;
    await this.assetRegister.dispose(assetId, proceeds, disposalDate);

    const glEntries: DisposalResult['glEntries'] = [];
    if (asset.accumulatedDepreciation > 0) {
      glEntries.push({ accountCode: '1600', description: `Remove accumulated depreciation - ${asset.name}`, debit: asset.accumulatedDepreciation, credit: 0 });
    }
    glEntries.push({ accountCode: '1000', description: `Asset disposal proceeds - ${asset.name}`, debit: proceeds, credit: 0 });
    if (gainOrLoss < 0) {
      glEntries.push({ accountCode: '6990', description: `Loss on disposal - ${asset.name}`, debit: Math.abs(gainOrLoss), credit: 0 });
    } else {
      glEntries.push({ accountCode: '8990', description: `Gain on disposal - ${asset.name}`, debit: 0, credit: gainOrLoss });
    }
    glEntries.push({ accountCode: '1500', description: `Remove asset cost - ${asset.name}`, debit: 0, credit: asset.cost });

    return { assetId, assetName: asset.name, disposalDate, proceeds, bookValue, gainOrLoss, glEntries };
  }
}
