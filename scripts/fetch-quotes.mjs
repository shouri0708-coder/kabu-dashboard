// Yahoo Finance のチャートAPIから日次終値を取得し、指定日の
// 「終値・前日比・指数水準」をまとめて出力する。毎日の更新の下調べに使う。
// 使い方:  node scripts/fetch-quotes.mjs [YYYY-MM-DD]   （省略時は直近の取引日）
//
// 出力: data-quotes/<日付>.json と、画面に貼りやすい一覧表
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 過去に取得済みのスナップショット（Yahoo側でバーが消えた日の保険。2026-08-28 で実際に発生）
const archives = {};
if (existsSync(join(ROOT, "data-quotes"))) {
  for (const f of readdirSync(join(ROOT, "data-quotes")).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
    const j = JSON.parse(readFileSync(join(ROOT, "data-quotes", f), "utf8"));
    archives[j.date] = j;
  }
}
// Yahoo の前日バーとターゲットの間に、保存済みスナップショットの取引日が挟まっていれば
// そちらの終値を「前日終値」として使う（バー欠落時に騰落率が2日分になるのを防ぐ）
function resolvePrev(sym, targetDate, yahooPrevDate, yahooPrevClose) {
  const between = Object.keys(archives).filter(d => d > yahooPrevDate && d < targetDate).sort().at(-1);
  if (!between) return { close: yahooPrevClose, note: null };
  const a = archives[between];
  const v = a.quotes?.[sym]?.close ?? a.extra?.[sym]?.close;
  if (v == null) return { close: yahooPrevClose, note: null };
  return { close: v, note: `前日=${between}（保存分。Yahoo側は${yahooPrevDate}までしか無い）` };
}

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

// NY市場が「きょう」としてまだ取引中の日付（引け前）は終値が無いので除外する
function nyNow() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
  const g = (t) => p.find(x => x.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, min: +g("hour") * 60 + +g("minute") };
}
const ny = nyNow();
const inProgress = (date) => date === ny.date && ny.min < 16 * 60;   // 16:00 ET の引け前

// 対象日（指定なしなら株式データに共通して存在する「引け済みの」直近取引日）
const target = process.argv[2] ||
  all["NVDA"].map(d => d.date)
    .filter(d => all["^GSPC"].some(x => x.date === d) && !inProgress(d)).at(-1);
if (inProgress(target)) {
  console.error(`エラー: ${target} はNY市場が取引中（引け前）で終値が確定していません。引け（日本時間 朝5〜6時）以降に実行してください。`);
  process.exit(1);
}

const out = { date: target, quotes: {}, extra: {} };
const rows = [];
const notes = new Set();
for (const sym of STOCKS) {
  const days = all[sym];
  const i = days.findIndex(d => d.date === target);
  if (i < 1) { rows.push(`${sym.padEnd(6)} ${target} のデータなし`); continue; }
  const close = days[i].close;
  const prev = resolvePrev(sym, target, days[i - 1].date, days[i - 1].close);
  if (prev.note) notes.add(prev.note);
  const chg = (close / prev.close - 1) * 100;
  out.quotes[sym] = { close: +close.toFixed(2), prevClose: +prev.close.toFixed(2), chg: +chg.toFixed(2) };
  rows.push(`${sym.padEnd(6)} $${close.toFixed(2).padStart(8)}  ${(chg >= 0 ? "+" : "") + chg.toFixed(2)}%`);
}
for (const [sym, label] of Object.entries(EXTRA)) {
  const days = all[sym];
  const i = days.findIndex(d => d.date === target);
  if (i < 1) { rows.push(`${label} ${target} のデータなし`); continue; }
  const close = days[i].close;
  const prev = resolvePrev(sym, target, days[i - 1].date, days[i - 1].close);
  if (prev.note) notes.add(prev.note);
  const chg = (close / prev.close - 1) * 100;
  out.extra[sym] = { label, close: +close.toFixed(2), prevClose: +prev.close.toFixed(2), chg: +chg.toFixed(2) };
  rows.push(`${label.padEnd(12)} ${close.toFixed(2).padStart(10)}  ${(chg >= 0 ? "+" : "") + chg.toFixed(2)}%  (前日 ${prev.close.toFixed(2)})`);
}
notes.forEach(n => rows.push(`※ ${n}`));

mkdirSync(join(ROOT, "data-quotes"), { recursive: true });
writeFileSync(join(ROOT, "data-quotes", `${target}.json`), JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`=== ${target} の終値 ===`);
rows.forEach(r => console.log("  " + r));
console.log(`\n保存: data-quotes/${target}.json`);
