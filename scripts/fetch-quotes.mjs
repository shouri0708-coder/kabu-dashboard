// Yahoo Finance のチャートAPIから日次終値を取得し、指定日の
// 「終値・前日比・指数水準」をまとめて出力する。毎日の更新の下調べに使う。
// 使い方:  node scripts/fetch-quotes.mjs [YYYY-MM-DD]   （省略時は直近の取引日）
//
// 出力: data-quotes/<日付>.json と、画面に貼りやすい一覧表
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ウォッチリスト銘柄
const STOCKS = ["NVDA", "AVGO", "TSM", "AMD", "INTC", "MSFT", "AAPL", "GOOGL", "AMZN", "META", "TSLA"];
// 指数・為替・金利・原油
const EXTRA = { "^GSPC": "S&P500", "^DJI": "NYダウ", "^IXIC": "ナスダック", "JPY=X": "ドル円", "^TNX": "米10年金利", "CL=F": "WTI原油" };

async function chart(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
  const j = await r.json();
  const res = j.chart?.result?.[0];
  if (!res) throw new Error(`${sym}: データなし`);
  const days = [];
  const closes = res.indicators.quote[0].close;
  // 為替は前日23時UTC始まりのバーで返るため、+2時間して「その取引日」の日付に合わせる
  const shift = sym.endsWith("=X") ? 2 * 3600 : 0;
  res.timestamp.forEach((t, i) => {
    if (closes[i] != null)
      days.push({ date: new Date((t + shift) * 1000).toISOString().slice(0, 10), close: closes[i] });
  });
  return days;
}

const all = {};
for (const sym of [...STOCKS, ...Object.keys(EXTRA)]) {
  all[sym] = await chart(sym);
  await new Promise(r => setTimeout(r, 250));   // 行儀よく間隔を空ける
}

// 対象日（指定なしなら株式データに共通して存在する直近の取引日）
const target = process.argv[2] ||
  all["NVDA"].map(d => d.date).filter(d => all["^GSPC"].some(x => x.date === d)).at(-1);

const out = { date: target, quotes: {}, extra: {} };
const rows = [];
for (const sym of STOCKS) {
  const days = all[sym];
  const i = days.findIndex(d => d.date === target);
  if (i < 1) { rows.push(`${sym.padEnd(6)} ${target} のデータなし`); continue; }
  const close = days[i].close, prev = days[i - 1].close;
  const chg = (close / prev - 1) * 100;
  out.quotes[sym] = { close: +close.toFixed(2), prevClose: +prev.toFixed(2), chg: +chg.toFixed(2) };
  rows.push(`${sym.padEnd(6)} $${close.toFixed(2).padStart(8)}  ${(chg >= 0 ? "+" : "") + chg.toFixed(2)}%`);
}
for (const [sym, label] of Object.entries(EXTRA)) {
  const days = all[sym];
  const i = days.findIndex(d => d.date === target);
  if (i < 1) { rows.push(`${label} ${target} のデータなし`); continue; }
  const close = days[i].close, prev = days[i - 1].close;
  const chg = (close / prev - 1) * 100;
  out.extra[sym] = { label, close: +close.toFixed(2), prevClose: +prev.toFixed(2), chg: +chg.toFixed(2) };
  rows.push(`${label.padEnd(12)} ${close.toFixed(2).padStart(10)}  ${(chg >= 0 ? "+" : "") + chg.toFixed(2)}%  (前日 ${prev.toFixed(2)})`);
}

mkdirSync(join(ROOT, "data-quotes"), { recursive: true });
writeFileSync(join(ROOT, "data-quotes", `${target}.json`), JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`=== ${target} の終値 ===`);
rows.forEach(r => console.log("  " + r));
console.log(`\n保存: data-quotes/${target}.json`);
