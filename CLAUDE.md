# kabu-dashboard — 米国マーケット なぜ動いた？

毎日更新する米国市況ダッシュボード。単一の `index.html` を配布物とし、
**中身（解説・ニュース）はデータ、ガワ（HTML/CSS/JS）はテンプレート**に分離している。

## 構成

```
index.html            ビルド成果物（直接編集しない！）
src/template.html     ガワ。CSS・株価ライブ更新ロジック・{{PLACEHOLDER}} 入り
data/<日付>.json      その日の中身。毎日の更新で作るのはこれだけ
scripts/check.mjs     整合性チェック（日付の食い違い・古いニュースの残存を検出）
scripts/build.mjs     template + json → index.html
scripts/extract.mjs   旧・単一HTML からの移行用（もう使わない）
secrets.json          { "finnhubKey": "..." } — gitignore 済み。無ければキー空でビルド
```

## 毎日の更新手順

1. `node scripts/fetch-quotes.mjs <日付>` — Yahoo Finance から全銘柄・指数・
   ドル円・10年金利・WTI の終値と騰落率を取得（`data-quotes/<日付>.json` に保存）。
   騰落率や指数水準は必ずこの実データを使う（報道の数字は intraday のことがある）
2. 最新の市況ニュースを調べ、前日の `data/*.json` を複製して新しい日付で作成
3. 全セクションを更新する（`headline` / `kpis` / `reasons` / `scenarios` /
   `news` / `events` / `watch` / `movers` / `kpiNews` / `prevIdx` /
   `dateLabel` / `footerAsOf` / `date`）。`prevIdx` は「直近取引日」の指数終値
   （ライブ更新の換算基準になる）
4. `npm run daily` — チェックが通ればそのままビルドされる
5. `git add -A && git commit`

### check.mjs の見方
- **ERROR**（ビルド中断）: ヘッダー・結論・フッター等の日付が対象日と食い違う
- **WARN**: セクションの最新の出典が 4 日以上前 — 更新漏れの疑い。
  手作業時代はウォッチリストが 15 日間放置される事故が実際に起きた。
  WARN を無視してよいのは休場明けなど理由が説明できるときだけ。

## データの形式メモ

- ニュース 1 件: `{ t: 見出し, u: URL, s: "出典・8/27", sm: 要約, pl: "→ 追い風", dir: "up|down|mix" }`
  `s` の日付は check.mjs が鮮度判定に使うので必ず入れる
- `kpis[].valAttr / deltaAttr`: `id="v-SPY"` などライブ株価更新用の属性。消すと自動更新が壊れる
- `prevIdx`: ETF→指数換算の前日終値。毎日更新が必要
- HTML 断片を含むフィールドがある（`valueHtml` など）。値はエスケープせずそのまま埋め込まれる

## してはいけないこと

- `index.html` を直接編集（次のビルドで消える）
- `secrets.json` や API キーをコミット
- `data/` の過去日付ファイルの書き換え（履歴として残す）
