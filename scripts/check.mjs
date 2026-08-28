// データの整合性チェック。ビルド前に走らせて「更新漏れ」を検出する。
// 使い方:  node scripts/check.mjs [日付]
//
// 検出するもの:
//   [ERROR] 本文の日付が対象日と食い違っている（ヘッダー・結論・KPI・フッター）
//   [WARN ] セクションの出典が古いまま残っている（前回更新分の残存）
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STALE_DAYS = 4;   // セクションの最新の出典がこれ以上古いと警告

const dates = readdirSync(join(ROOT, "data"))
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.replace(".json", "")).sort();
const date = process.argv[2] || dates[dates.length - 1];
const path = join(ROOT, "data", `${date}.json`);
if (!existsSync(path)) { console.error(`データがありません: data/${date}.json`); process.exit(1); }
const d = JSON.parse(readFileSync(path, "utf8"));

const target = new Date(date + "T00:00:00Z");
const errors = [], warns = [];
const fmt = (dt) => dt.toISOString().slice(0, 10);
const daysOld = (dt) => Math.round((target - dt) / 864e5);

/* 文字列から日付を拾う。"8/27" "8月27日" "2026年8月27日" "aug-27-2026" に対応 */
function datesIn(text) {
  const out = [];
  const push = (y, m, dd) => {
    if (m < 1 || m > 12 || dd < 1 || dd > 31) return;          // 「24/7 Wall St.」等の誤検出を弾く
    let dt = new Date(Date.UTC(y, m - 1, dd));
    if (isNaN(dt)) return;
    if (dt - target > 180 * 864e5) dt = new Date(Date.UTC(y - 1, m - 1, dd));  // 年跨ぎの補正
    out.push(dt);
  };
  const y0 = target.getUTCFullYear();
  for (const m of text.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)) push(+m[1], +m[2], +m[3]);
  for (const m of text.matchAll(/(?<!\d年)(?<!\d)(\d{1,2})月(\d{1,2})日/g)) push(y0, +m[1], +m[2]);
  for (const m of text.matchAll(/(?<![\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])/g)) push(y0, +m[1], +m[2]);
  const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  for (const m of text.matchAll(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*-(\d{1,2})-(\d{4})/gi))
    push(+m[3], MON[m[1].toLowerCase()], +m[2]);
  return out;
}

/* --- 1. 本文の日付が対象日と一致しているか（必須） --- */
const mustMatch = [
  ["ヘッダーの日付",        d.dateLabel],
  ["きょうの結論の kicker",  d.headline.kicker],
  ["フッターのデータ時点",   d.footerAsOf],
  ...(d.kpis || []).map(k => [`KPI「${k.key}」の変動率表記`, k.delta]),
];
for (const [label, text] of mustMatch) {
  const found = datesIn(String(text));
  if (!found.length) continue;                       // 日付を書いていない項目は対象外
  const wrong = found.filter(dt => fmt(dt) !== date);
  if (wrong.length)
    errors.push(`${label}が ${date} と食い違う → ${[...new Set(wrong.map(fmt))].join(", ")}  「${text}」`);
}

/* --- 2. セクションの鮮度：出典の日付フィールドだけを見る --- */
// 記事「本文」に出てくる日付（決算予定日など）は publication date ではないので拾わない
const srcDates = (items, key) => (items || []).flatMap(x => datesIn(String(x[key] ?? "")));
const sections = {
  "きょうの結論の根拠":  srcDates(d.headline?.evidence, "src"),
  "関連ニュース":        (d.news || []).flatMap(g => srcDates(g.items, "src")),
  "ウォッチリスト":      (d.watch || []).flatMap(w => srcDates(w.news, "s")),
  "きょう目立った銘柄":  (d.movers || []).flatMap(m => srcDates(m.news, "s")),
  "KPI関連ニュース":     Object.values(d.kpiNews || {}).flatMap(v => srcDates(v.items, "s")),
};
for (const [name, all] of Object.entries(sections)) {
  const found = all.filter(dt => dt <= target);
  if (!found.length) { warns.push(`「${name}」から出典の日付が読み取れない`); continue; }
  const newest = new Date(Math.max(...found));
  const old = daysOld(newest);
  if (old >= STALE_DAYS)
    warns.push(`「${name}」の最新の出典が ${fmt(newest)}（${old}日前）— 更新漏れの可能性`);
}

/* --- 3. データが揃っているか --- */
if (!d.watch?.length)  errors.push("ウォッチリストが空");
if (!d.movers?.length) errors.push("きょう目立った銘柄が空");
for (const k of d.kpis || [])
  if (!d.kpiNews?.[k.key]) warns.push(`KPI「${k.key}」に関連ニュースが無い`);
for (const s of ["SPY", "DIA", "QQQ"])
  if (!(s in (d.prevIdx || {}))) errors.push(`prevIdx に ${s} が無い`);

/* --- 出力 --- */
console.log(`チェック対象: data/${date}.json\n`);
errors.forEach(m => console.log("  [ERROR] " + m));
warns.forEach(m  => console.log("  [WARN ] " + m));
if (!errors.length && !warns.length) console.log("  問題なし");
console.log(`\n${errors.length} 件のエラー / ${warns.length} 件の警告`);
process.exit(errors.length ? 1 : 0);
