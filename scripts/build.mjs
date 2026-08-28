// src/template.html + data/<日付>.json → index.html（単一ファイル）を生成する。
// 使い方:  node scripts/build.mjs            最新の日付のデータでビルド
//          node scripts/build.mjs 2026-08-27 日付を指定してビルド
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- 入力 ---------- */
const dates = readdirSync(join(ROOT, "data"))
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map(f => f.replace(".json", ""))
  .sort();
if (!dates.length) { console.error("data/ に <日付>.json がありません"); process.exit(1); }

const date = process.argv[2] || dates[dates.length - 1];
const dataPath = join(ROOT, "data", `${date}.json`);
if (!existsSync(dataPath)) { console.error(`データがありません: data/${date}.json`); process.exit(1); }

const d = JSON.parse(readFileSync(dataPath, "utf8"));
let out = readFileSync(join(ROOT, "src", "template.html"), "utf8");

// APIキーはリポジトリ外の secrets.json から差し込む（無ければ空 → 画面の入力欄から手入力）
let key = "";
const secretsPath = join(ROOT, "secrets.json");
if (existsSync(secretsPath)) key = JSON.parse(readFileSync(secretsPath, "utf8")).finnhubKey || "";

/* ---------- 部品 ---------- */
const j = (v) => JSON.stringify(v, null, 2).split("\n").join("\n  ");

// ニュース1件（きょうの結論の根拠・ウォッチリスト・KPI で共通の形）
const evItem = (e, i) => `
      <div class="ev-item">
        <div class="ev-no">${i + 1}</div>
        <div>
          <div class="ev-tag">${e.tag}</div>
          <h5>${e.title}</h5>
          <p>${e.body}</p>
          <div class="ev-so">→ <b>だから：</b>${e.so}</div>
          <a href="${e.url}" target="_blank" rel="noopener">${e.src}</a>
        </div>
      </div>`;

// valAttr / deltaAttr は id="v-SPY" などライブ更新用の属性。落とすと株価が更新されなくなる
const kpiCard = (k) => `
    <div class="kpi" data-kpi="${k.key}">
      <div class="name">${k.name}</div>
      <div class="val"${k.valAttr || ""}>${k.valueHtml}</div>
      <div class="delta ${k.deltaClass}"${k.deltaAttr || ""}>${k.delta}</div>
      <div class="why">${k.why}</div>
      <div class="more">▶ 関連ニュース</div>
    </div>`;

const reasonBlock = (r) => `
    <div class="reason">
      <h3><span style="color:var(--${r.dir})">${r.mark}</span>${r.title}</h3>
      <p>${r.body}</p>
      <div class="tsumari"><b>つまり：</b>${r.tsumari}</div>
      <div class="tags">${r.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>
    </div>`;

const scenarioBlock = (s) => `
    <div class="scenario ${s.type}">
      <div class="label">${s.label}</div>
      <h3>${s.title}</h3>
      <p>${s.body}</p>
      <div class="flow">${s.flow}</div>
    </div>`;

const newsGroup = (g) => `
      <div class="news-cat">${g.cat}${g.catNote ? `<small>${g.catNote}</small>` : ""}</div>` +
  g.items.map(n => `
      <div class="news-item">
        <a href="${n.url}" target="_blank" rel="noopener">${n.title}</a><span class="src">${n.src}</span>
        <p>${n.body}</p>
      </div>`).join("");

const eventBlock = (e) => `
      <div class="event">
        <div class="when">${e.when}</div>
        <div class="what">${e.what}${e.note ? `<small>${e.note}</small>` : ""}</div>
      </div>`;

/* ---------- 差し込み ---------- */
const fills = {
  DATE_LINE:    `ニューヨーク市場 ${d.dateLabel} ｜ ${d.headerNote}`,
  HL_KICKER:    d.headline.kicker,
  HL_LEAD:      d.headline.lead,
  HL_SUB:       d.headline.sub,
  HL_EVIDENCE:  d.headline.evidence.map(evItem).join("") +
                `\n      <div class="ev-sum">📝 <b>まとめ：</b>${d.headline.summary}</div>`,
  KPIS:         d.kpis.map(kpiCard).join(""),
  REASONS:      d.reasons.map(reasonBlock).join("\n"),
  SCENARIOS:    d.scenarios.map(scenarioBlock).join("\n"),
  NEWS:         d.news.map(newsGroup).join("\n"),
  EVENTS:       d.events.map(eventBlock).join(""),
  FOOTER_ASOF:  d.footerAsOf,
  WATCH:        j(d.watch),
  KPI_NEWS:     j(d.kpiNews),
  MOVERS:       j(d.movers),
  IDX:          j(d.prevIdx),
  FINNHUB_KEY:  key,
};

for (const [k, v] of Object.entries(fills)) {
  const token = `{{${k}}}`;
  if (!out.includes(token)) { console.error(`テンプレートに ${token} がありません`); process.exit(1); }
  out = out.split(token).join(v);
}

const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) { console.error("未置換のプレースホルダ: " + [...new Set(leftover)].join(", ")); process.exit(1); }

writeFileSync(join(ROOT, "index.html"), out, "utf8");
console.log(`ビルド完了: index.html  (${date} のデータ / ${out.length} 文字)`);
if (!key) console.log("※ APIキー未設定。secrets.json を置くと自動接続します（画面の入力欄でも可）");
