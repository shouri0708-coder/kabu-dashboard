// 現行 index.html から「毎日変わるデータ」を JSON に切り出し、
// 残りを src/template.html（プレースホルダ入り）として書き出す。
// 一度だけ実行する移行用スクリプト。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(join(ROOT, "index.html"), "utf8");

const data = {};
const fail = (msg) => { throw new Error("抽出失敗: " + msg); };

// 指定の開始/終了マーカーに挟まれた領域を取り出し、プレースホルダに置換する
function carve(startMark, endMark, placeholder, label) {
  const s = html.indexOf(startMark);
  if (s < 0) fail(`${label} の開始マーカーが見つからない: ${startMark}`);
  const e = html.indexOf(endMark, s + startMark.length);
  if (e < 0) fail(`${label} の終了マーカーが見つからない: ${endMark}`);
  const inner = html.slice(s + startMark.length, e);
  html = html.slice(0, s + startMark.length) + placeholder + html.slice(e);
  return inner;
}

// JS のオブジェクト/配列リテラルをそのまま評価して JSON 化する
function evalLiteral(src, label) {
  try { return new Function("return (" + src + ")")(); }
  catch (err) { fail(`${label} の評価に失敗: ${err.message}`); }
}

/* ---------- 1. ヘッダーの日付行 ---------- */
{
  const inner = carve('<div class="date">', "</div>", "{{DATE_LINE}}", "日付行");
  const m = inner.match(/^ニューヨーク市場\s*(.+?)\s*｜\s*(.*)$/);
  if (!m) fail("日付行の形式が想定と違う: " + inner);
  data.dateLabel = m[1];
  data.headerNote = m[2];
}

/* ---------- 2. きょうの結論 ---------- */
{
  const kicker = carve('<div class="kicker">', "</div>", "{{HL_KICKER}}", "kicker");
  const lead   = carve('<div class="lead">', "</div>", "{{HL_LEAD}}", "lead");
  const sub    = carve('<div class="sub">', "</div>", "{{HL_SUB}}", "sub");
  const panel  = carve('<div class="ev-panel">', '\n    </div>\n  </div>\n\n  <div class="kpis">', "{{HL_EVIDENCE}}", "根拠パネル");

  const evidence = [...panel.matchAll(
    /<div class="ev-tag">([\s\S]*?)<\/div>\s*<h5>([\s\S]*?)<\/h5>\s*<p>([\s\S]*?)<\/p>\s*<div class="ev-so">→ <b>だから：<\/b>([\s\S]*?)<\/div>\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  )].map(m => ({ tag: m[1], title: m[2], body: m[3], so: m[4], url: m[5], src: m[6] }));
  if (evidence.length !== 4) fail(`根拠が4件のはずが ${evidence.length} 件`);

  const sum = panel.match(/<div class="ev-sum">📝 <b>まとめ：<\/b>([\s\S]*?)<\/div>/);
  if (!sum) fail("まとめが見つからない");

  data.headline = { kicker, lead, sub, evidence, summary: sum[1] };
}

/* ---------- 3. KPIカード ---------- */
{
  const inner = carve('<div class="kpis">', '\n  </div>\n  <div class="kpi-news"', "{{KPIS}}", "KPIカード");
  // val / delta には株価ライブ更新用の id が付くものがある（id="v-SPY" など）。
  // 落とすと更新が効かなくなるので属性ごと保持する。
  const kpis = [...inner.matchAll(
    /<div class="kpi" data-kpi="([^"]+)">\s*<div class="name">([\s\S]*?)<\/div>\s*<div class="val"([^>]*)>([\s\S]*?)<\/div>\s*<div class="delta ([^"]*)"([^>]*)>([\s\S]*?)<\/div>\s*<div class="why">([\s\S]*?)<\/div>/g
  )].map(m => ({
    key: m[1], name: m[2],
    valAttr: m[3], valueHtml: m[4].trim(),
    deltaClass: m[5], deltaAttr: m[6], delta: m[7],
    why: m[8],
  }));
  if (kpis.length !== 6) fail(`KPIが6件のはずが ${kpis.length} 件`);
  data.kpis = kpis;
}

/* ---------- 4. なぜ動いたのか ---------- */
{
  const inner = carve('<h2>なぜ動いたのか — 3つの理由</h2>\n', "\n  </section>", "{{REASONS}}", "理由");
  const reasons = [...inner.matchAll(
    /<div class="reason">\s*<h3><span style="color:var\(--(up|down)\)">(.)<\/span>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<div class="tsumari"><b>つまり：<\/b>([\s\S]*?)<\/div>\s*<div class="tags">([\s\S]*?)<\/div>/g
  )].map(m => ({
    dir: m[1], mark: m[2], title: m[3], body: m[4], tsumari: m[5],
    tags: [...m[6].matchAll(/<span class="tag">([\s\S]*?)<\/span>/g)].map(t => t[1]),
  }));
  if (reasons.length !== 3) fail(`理由が3件のはずが ${reasons.length} 件`);
  data.reasons = reasons;
}

/* ---------- 5. シナリオ ---------- */
{
  const inner = carve('<h2>今後どうなる？ — ニュースから読む3つのシナリオ</h2>\n', '\n    <div class="disclaimer">', "{{SCENARIOS}}", "シナリオ");
  const scenarios = [...inner.matchAll(
    /<div class="scenario (\w+)">\s*<div class="label">([\s\S]*?)<\/div>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<div class="flow">([\s\S]*?)<\/div>/g
  )].map(m => ({ type: m[1], label: m[2], title: m[3], body: m[4], flow: m[5] }));
  if (scenarios.length !== 3) fail(`シナリオが3件のはずが ${scenarios.length} 件`);
  data.scenarios = scenarios;
}

/* ---------- 6. 関連ニュース ---------- */
{
  const inner = carve('<div class="news">\n', "\n    </div>\n  </section>", "{{NEWS}}", "関連ニュース");
  const groups = [];
  const catRe = /<div class="news-cat">([\s\S]*?)<\/div>/g;
  const cats = [...inner.matchAll(catRe)];
  if (!cats.length) fail("ニュースのカテゴリが見つからない");
  cats.forEach((c, i) => {
    const body = inner.slice(c.index + c[0].length, i + 1 < cats.length ? cats[i + 1].index : inner.length);
    const label = c[1].match(/^([\s\S]*?)(?:<small>([\s\S]*?)<\/small>)?$/);
    groups.push({
      cat: label[1],
      catNote: label[2] || null,
      items: [...body.matchAll(
        /<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a><span class="src">([\s\S]*?)<\/span>\s*<p>([\s\S]*?)<\/p>/g
      )].map(m => ({ url: m[1], title: m[2], src: m[3], body: m[4] })),
    });
  });
  const n = groups.reduce((a, g) => a + g.items.length, 0);
  if (n < 1) fail("ニュース記事が1件も取れていない");
  if (groups.some(g => g.items.length === 0)) fail("記事が0件のカテゴリがある");
  data.news = groups;
}

/* ---------- 7. 注目イベント ---------- */
{
  const inner = carve('<div class="events">\n', "\n    </div>\n  </section>", "{{EVENTS}}", "イベント");
  const events = [...inner.matchAll(
    /<div class="when">([\s\S]*?)<\/div>\s*<div class="what">([\s\S]*?)(?:<small>([\s\S]*?)<\/small>)?<\/div>/g
  )].map(m => ({ when: m[1], what: m[2], note: m[3] || null }));
  if (events.length !== 4) fail(`イベントが4件のはずが ${events.length} 件`);
  data.events = events;
}

/* ---------- 8. フッターのデータ時点 ---------- */
{
  const inner = carve("    データ時点：", "<br>", "{{FOOTER_ASOF}}", "フッター");
  data.footerAsOf = inner.trim();
}

/* ---------- 9. JS のデータ配列 ---------- */
data.watch    = evalLiteral("[" + carve("const watch = [", "\n  ];", "{{WATCH}}", "watch") + "\n]", "watch");
data.kpiNews  = evalLiteral("{" + carve("const KPI_NEWS = {", "\n  };", "{{KPI_NEWS}}", "KPI_NEWS") + "\n}", "KPI_NEWS");
data.movers   = evalLiteral("[" + carve("const movers = [", "\n  ];", "{{MOVERS}}", "movers") + "\n]", "movers");
data.prevIdx  = evalLiteral("{" + carve("const IDX = {", "\n  };", "{{IDX}}", "IDX") + "\n}", "IDX");

if (data.watch.length !== 11) fail(`watch が11件のはずが ${data.watch.length} 件`);
if (data.movers.length !== 6) fail(`movers が6件のはずが ${data.movers.length} 件`);

/* ---------- 10. テンプレートの整形（何度実行しても同じ結果になるように） ---------- */
{
  const swap = (from, to) => {
    if (!html.includes(from)) fail("テンプレート整形の対象が見つからない: " + from.slice(0, 40));
    html = html.replace(from, to);
  };
  // JS のデータは配列/オブジェクトごと差し替える形にする
  swap("const watch = [{{WATCH}}\n  ];", "const watch = {{WATCH}};");
  swap("const KPI_NEWS = {{{KPI_NEWS}}\n  };", "const KPI_NEWS = {{KPI_NEWS}};");
  swap("const movers = [{{MOVERS}}\n  ];", "const movers = {{MOVERS}};");
  swap("const IDX = {{{IDX}}\n  };", "const IDX = {{IDX}};");
  // 日付を含むコメントはデータ側に基準日があるので固定文言にする
  swap('// t: "live"=8/12取引中, "prev"=8/11終値（preは寄り前気配%）',
       '// t: "live"=取引中 / "prev"=前日終値（preは寄り前気配%）。基準日は data/<日付>.json の date');
  // APIキーはリポジトリに置かず、ビルド時に secrets.json から差し込む
  swap('const FINNHUB_KEY = "";   // Finnhub APIキー',
       'const FINNHUB_KEY = "{{FINNHUB_KEY}}";   // ビルド時に secrets.json から差し込む（リポジトリには入れない）');
}

/* ---------- 書き出し ---------- */
mkdirSync(join(ROOT, "src"), { recursive: true });
mkdirSync(join(ROOT, "data"), { recursive: true });

const date = "2026-08-27";
data.date = date;
writeFileSync(join(ROOT, "src", "template.html"), html, "utf8");
writeFileSync(join(ROOT, "data", `${date}.json`), JSON.stringify(data, null, 2) + "\n", "utf8");

console.log("src/template.html      ", html.length, "文字");
console.log(`data/${date}.json      `, JSON.stringify(data, null, 2).length, "文字");
console.log("\n抽出件数:");
console.log("  根拠      ", data.headline.evidence.length);
console.log("  KPI       ", data.kpis.length);
console.log("  理由      ", data.reasons.length);
console.log("  シナリオ  ", data.scenarios.length);
console.log("  ニュース  ", data.news.reduce((a, g) => a + g.items.length, 0), `(${data.news.length}カテゴリ)`);
console.log("  イベント  ", data.events.length);
console.log("  watch     ", data.watch.length);
console.log("  movers    ", data.movers.length);
console.log("  KPI_NEWS  ", Object.keys(data.kpiNews).length);
