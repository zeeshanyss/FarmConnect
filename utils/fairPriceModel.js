
const PriceHistory = require("../models/PriceHistory");

/**
 * Fair Price Model
 *
 * Uses recent crop prices to calculate a fair price,
 * price range, volatility, confidence, and sample size.
 */
async function fairPriceModel(crop, { state, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);

  // Firestore model queries use simple equality filters.
  // Apply the date and optional state filters in JavaScript.
  let rows = await PriceHistory.find({ crop });

  rows = rows.filter((row) => {
    const date = row.date?.toDate
      ? row.date.toDate()
      : new Date(row.date);

    return !Number.isNaN(date.getTime()) && date >= since;
  });

  if (state) {
    const stateRows = rows.filter((row) => row.state === state);

    // Fall back to national crop data if local data is insufficient.
    if (stateRows.length >= 5) {
      rows = stateRows;
    }
  }

  rows.sort((a, b) => {
    const dateA = a.date?.toDate
      ? a.date.toDate()
      : new Date(a.date);

    const dateB = b.date?.toDate
      ? b.date.toDate()
      : new Date(b.date);

    return dateA - dateB;
  });

  if (rows.length === 0) {
    return {
      fair: null,
      low: null,
      high: null,
      confidence: 0,
      volatility: null,
      sampleSize: 0,
    };
  }

  const byDay = groupByDay(rows);
  const series = byDay.map((day) => day.avgModal);

  const recent = series.slice(-7);
  const avg7 = mean(recent);
  const meanAll = mean(series);
  const stdevAll = stdev(series, meanAll);
  const volatility = meanAll ? stdevAll / meanAll : 0;

  const trendDelta =
    recent.length >= 2
      ? recent[recent.length - 1] - recent[0]
      : 0;

  const fair = Math.round(avg7 + trendDelta * 0.3);
  const band = Math.round(avg7 * (0.03 + volatility));

  const confidence = Math.max(
    10,
    Math.min(
      97,
      Math.round(
        100 -
          volatility * 400 -
          Math.max(0, 15 - series.length) * 2
      )
    )
  );

  return {
    fair,
    low: fair - band,
    high: fair + band,
    confidence,
    volatility: Number(volatility.toFixed(4)),
    sampleSize: series.length,
  };
}

function groupByDay(rows) {
  const map = new Map();

  for (const row of rows) {
    const date = row.date?.toDate
      ? row.date.toDate()
      : new Date(row.date);

    if (Number.isNaN(date.getTime())) continue;

    const key = date.toISOString().slice(0, 10);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(Number(row.modalPrice));
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, prices]) => ({
      date,
      avgModal: mean(prices),
    }));
}

function mean(arr) {
  return arr.reduce((sum, value) => sum + value, 0) / (arr.length || 1);
}

function stdev(arr, average) {
  const variance =
    arr.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (arr.length || 1);

  return Math.sqrt(variance);
}

module.exports = { fairPriceModel };
