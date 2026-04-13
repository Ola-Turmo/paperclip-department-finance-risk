/**
 * ML-Powered Forecast Predictor
 * PRD: Forecasting support with explainable predictions
 * Uses statistical and ML methods for variance prediction
 */

export interface ForecastDataPoint {
  period: string;
  value: number;
  externalFactors?: Record<string, number>;
}

export interface ForecastResult {
  period: string;
  predictedValue: number;
  confidenceInterval: { lower: number; upper: number };
  confidence: number;
  methodology: string;
  factors: Array<{ factor: string; contribution: number }>;
  seasonalDecomposition?: {
    trend: number;
    seasonal: number;
    residual: number;
  };
}

export interface ForecastParams {
  periods: number;
  confidenceLevel?: number;
  includeExternalFactors?: boolean;
  seasonalityPeriods?: number[];
}

interface DecompositionResult {
  trend: number[];
  seasonal: number[];
  residual: number[];
}

/**
 * ML-powered forecasting engine with multiple methodologies
 */
export class ForecastPredictor {
  /**
   * Generate forecast using multiple methodologies
   */
  forecast(
    historicalData: ForecastDataPoint[],
    params: ForecastParams
  ): ForecastResult[] {
    if (historicalData.length < 3) {
      throw new Error("Insufficient historical data for forecasting (minimum 3 periods required)");
    }

    const confidenceLevel = params.confidenceLevel ?? 0.95;
    const results: ForecastResult[] = [];

    // Decompose the time series if seasonality periods are provided
    let decomposition: DecompositionResult | undefined;
    if (params.seasonalityPeriods && params.seasonalityPeriods.length > 0) {
      decomposition = this.seasonalDecomposition(historicalData, params.seasonalityPeriods[0]);
    }

    // Generate forecast for each future period
    for (let i = 1; i <= params.periods; i++) {
      const futurePeriod = this.getFuturePeriod(historicalData, i);
      
      // Combine multiple methodologies
      const predictions = this.combineMethodologies(historicalData, i, params, decomposition);
      
      const avgPrediction = predictions.reduce((sum, p) => sum + p.value, 0) / predictions.length;
      const stdDev = this.calculateStdDev(predictions.map(p => p.value));
      
      const zScore = this.getZScore(confidenceLevel);
      const marginOfError = zScore * stdDev;

      results.push({
        period: futurePeriod,
        predictedValue: avgPrediction,
        confidenceInterval: {
          lower: Math.max(0, avgPrediction - marginOfError),
          upper: avgPrediction + marginOfError
        },
        confidence: this.calculateForecastConfidence(historicalData.length, predictions.length, stdDev, avgPrediction),
        methodology: "ensemble",
        factors: this.identifyFactors(historicalData, predictions),
        seasonalDecomposition: decomposition ? {
          trend: decomposition.trend[decomposition.trend.length - 1] ?? avgPrediction,
          seasonal: decomposition.seasonal[(i - 1) % (decomposition.seasonal.length || 1)] ?? 0,
          residual: 0
        } : undefined
      });
    }

    return results;
  }

  /**
   * Simple moving average forecast
   */
  movingAverage(historicalData: ForecastDataPoint[], periods: number): number {
    const values = historicalData.slice(-periods).map(d => d.value);
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Exponential smoothing forecast
   */
  exponentialSmoothing(
    historicalData: ForecastDataPoint[],
    alpha: number = 0.3
  ): { forecast: number; smoothedValues: number[] } {
    const values = historicalData.map(d => d.value);
    const smoothedValues: number[] = [values[0]];

    for (let i = 1; i < values.length; i++) {
      const smoothed = alpha * values[i] + (1 - alpha) * smoothedValues[i - 1];
      smoothedValues.push(smoothed);
    }

    return {
      forecast: smoothedValues[smoothedValues.length - 1],
      smoothedValues
    };
  }

  /**
   * Linear regression forecast
   */
  linearRegression(historicalData: ForecastDataPoint[]): {
    slope: number;
    intercept: number;
    rSquared: number;
    forecast: number;
  } {
    const n = historicalData.length;
    const values = historicalData.map((_, i) => ({ x: i, y: historicalData[i].value }));

    const sumX = values.reduce((sum, v) => sum + v.x, 0);
    const sumY = values.reduce((sum, v) => sum + v.y, 0);
    const sumXY = values.reduce((sum, v) => sum + v.x * v.y, 0);
    const sumX2 = values.reduce((sum, v) => sum + v.x * v.x, 0);
    const sumY2 = values.reduce((sum, v) => sum + v.y * v.y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    const ssTotal = values.reduce((sum, v) => sum + (v.y - meanY) ** 2, 0);
    const ssResidual = values.reduce((sum, v) => {
      const predicted = intercept + slope * v.x;
      return sum + (v.y - predicted) ** 2;
    }, 0);
    const rSquared = 1 - ssResidual / ssTotal;

    // Forecast next period
    const forecast = intercept + slope * n;

    return { slope, intercept, rSquared, forecast };
  }

  /**
   * Seasonal decomposition using moving average
   */
  private seasonalDecomposition(
    historicalData: ForecastDataPoint[],
    period: number
  ): DecompositionResult {
    const values = historicalData.map(d => d.value);
    const trend: number[] = [];
    const seasonal: number[] = [];
    const residual: number[] = [];

    // Calculate trend using centered moving average
    for (let i = 0; i < values.length; i++) {
      let windowStart = i - Math.floor(period / 2);
      let windowEnd = i + Math.floor(period / 2) + 1;

      if (windowStart < 0) {
        windowStart = 0;
        windowEnd = period;
      }
      if (windowEnd > values.length) {
        windowEnd = values.length;
        windowStart = values.length - period;
      }

      const window = values.slice(windowStart, windowEnd);
      const trendValue = window.reduce((sum, v) => sum + v, 0) / window.length;
      trend.push(trendValue);
    }

    // Calculate seasonal indices
    for (let i = 0; i < values.length; i++) {
      if (trend[i]) {
        seasonal.push(values[i] / trend[i]);
        residual.push(values[i] - trend[i]);
      } else {
        seasonal.push(1);
        residual.push(0);
      }
    }

    return { trend, seasonal, residual };
  }

  /**
   * Combine multiple forecasting methodologies
   */
  private combineMethodologies(
    historicalData: ForecastDataPoint[],
    periodsAhead: number,
    params: ForecastParams,
    decomposition?: DecompositionResult
  ): Array<{ methodology: string; value: number }> {
    const predictions: Array<{ methodology: string; value: number }> = [];

    // Simple moving average
    const maPeriods = Math.min(3, historicalData.length);
    const maValue = this.movingAverage(historicalData, maPeriods);
    predictions.push({ methodology: "moving_average", value: maValue });

    // Exponential smoothing
    const esResult = this.exponentialSmoothing(historicalData, 0.3);
    predictions.push({ methodology: "exponential_smoothing", value: esResult.forecast });

    // Linear regression
    const lrResult = this.linearRegression(historicalData);
    const lrForecast = lrResult.forecast + (lrResult.slope * periodsAhead);
    predictions.push({ methodology: "linear_regression", value: lrForecast });

    // Seasonal adjustment if applicable
    if (decomposition && decomposition.seasonal.length > 0) {
      const seasonalIndex = decomposition.seasonal[periodsAhead % decomposition.seasonal.length] ?? 1;
      const baseForecast = lrForecast * seasonalIndex;
      predictions.push({ methodology: "seasonal_adjusted", value: baseForecast });
    }

    // Weighted ensemble based on historical fit
    if (lrResult.rSquared > 0.8) {
      predictions.push({ methodology: "high_confidence_lr", value: lrForecast });
    }

    return predictions;
  }

  /**
   * Calculate forecast confidence
   */
  private calculateForecastConfidence(
    dataPoints: number,
    methodologyCount: number,
    stdDev: number,
    avgPrediction: number
  ): number {
    let confidence = 0.5; // Base confidence

    // More historical data = higher confidence
    confidence += Math.min(0.2, dataPoints * 0.02);

    // Methodological agreement = higher confidence
    const agreementBonus = methodologyCount > 3 ? 0.1 : 0;
    confidence += agreementBonus;

    // Low relative variance = higher confidence
    if (avgPrediction > 0) {
      const cv = stdDev / avgPrediction;
      if (cv < 0.1) confidence += 0.15;
      else if (cv < 0.2) confidence += 0.1;
      else if (cv > 0.5) confidence -= 0.2;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Get Z-score for confidence level
   */
  private getZScore(confidenceLevel: number): number {
    const zScores: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576
    };
    return zScores[confidenceLevel] ?? 1.96;
  }

  /**
   * Calculate future period string
   */
  private getFuturePeriod(historicalData: ForecastDataPoint[], periodsAhead: number): string {
    const lastPeriod = historicalData[historicalData.length - 1]?.period ?? "Unknown";
    
    // Try to parse period and increment
    const match = lastPeriod.match(/(\d+)([A-Za-z])?$/);
    if (match) {
      const numPart = parseInt(match[1], 10);
      const suffix = match[2] ?? "";
      return `${numPart + periodsAhead}${suffix}`;
    }
    
    return `Period+${periodsAhead}`;
  }

  /**
   * Identify factors contributing to forecast
   */
  private identifyFactors(
    historicalData: ForecastDataPoint[],
    predictions: Array<{ methodology: string; value: number }>
  ): Array<{ factor: string; contribution: number }> {
    const factors: Array<{ factor: string; contribution: number }> = [];

    // Trend factor
    if (historicalData.length >= 3) {
      const recentTrend = historicalData.slice(-3);
      const trendSlope = (recentTrend[2].value - recentTrend[0].value) / 2;
      factors.push({
        factor: "trend",
        contribution: trendSlope > 0 ? 1 : -1
      });
    }

    // Volatility factor
    if (predictions.length > 1) {
      const stdDev = this.calculateStdDev(predictions.map(p => p.value));
      const avgPred = predictions.reduce((sum, p) => sum + p.value, 0) / predictions.length;
      if (avgPred > 0 && stdDev / avgPred > 0.2) {
        factors.push({
          factor: "high_volatility",
          contribution: 0.5
        });
      }
    }

    // Data quality factor
    if (historicalData.some(d => d.externalFactors && Object.keys(d.externalFactors).length > 0)) {
      factors.push({
        factor: "external_factors_present",
        contribution: 0.3
      });
    }

    return factors;
  }

  /**
   * Detect structural breaks in the time series
   */
  detectStructuralBreaks(historicalData: ForecastDataPoint[]): Array<{
    period: string;
    breakType: string;
    magnitude: number;
  }> {
    const breaks: Array<{ period: string; breakType: string; magnitude: number }> = [];
    
    if (historicalData.length < 4) return breaks;

    for (let i = 1; i < historicalData.length; i++) {
      const prevValue = historicalData[i - 1].value;
      const currentValue = historicalData[i].value;
      const change = Math.abs(currentValue - prevValue) / Math.abs(prevValue || 1);

      if (change > 0.5) {
        breaks.push({
          period: historicalData[i].period,
          breakType: currentValue > prevValue ? "upward_shift" : "downward_shift",
          magnitude: change
        });
      }
    }

    return breaks;
  }
}

export const forecastPredictor = new ForecastPredictor();
