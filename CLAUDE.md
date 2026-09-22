# kabu-dashboard — 米国マーケット なぜ動いた？

毎日更新する米国市況ダッシュボード。単一の `index.html` を配布物とし、
**中身（解説・ニュース）はデータ、ガワ（HTML/CSS/JS）はテンプレート**に分離している。

- 公開ページ: https://shouri0708-coder.github.io/kabu-dashboard/
- リポジトリ: https://github.com/shouri0708-coder/kabu-dashboard （origin/main）
- `git push` すると GitHub Pages が自動で再公開する（反映まで1〜2分）

## 構成

```
index.html            ビルド成果物（直接編集しない！）
src/template.html     ガワ。CSS・株価ライブ更新ロジック・{{PLACEHOLDER}} 入り
data/<終値日>.json    取引日の中身（終値版）。毎日の更新で作るのは基本これだけ
data/<終値日>_<JST日付>-<HHmm>.json
                      休場日・週末のニュース更新版（株価は終値日のまま、解説とニュースだけ新しい）
                      例: 2026-09-11_20260914-1000.json = 9/11終値 ＋ 9/14 10時JSTまでのニュース
                      文字列ソートで「終値版 < ニュース更新版 < 次の終値版」になり、build は常に最新を使う
scripts/check.mjs     整合性チェック（日付の食い違い・古いニュースの残存を検出）
scripts/build.mjs     template + json → index.html
scripts/extract.mjs   旧・単一HTML からの移行用（もう使わない）
config.json           { "finnhubKey": "..." } — コミット済み。Finnhub の無料キーは配布 HTML に
                      埋め込まれる公開情報なのでここに置く（クラウド実行でもキー付きでビルドできる）
secrets.json          同じ形式。あれば config.json を上書き（gitignore）
```

## 毎日の更新手順

> この手順はクラウドのルーティン（claude.ai/code/routines、毎日 7・12・18・22時 JST）で
> 自動実行される。PC の電源が入っていなくても動く。手動で走らせるときも同じ手順。
> 新しい終値が無い（週末・休場日・既に作成済み）場合は、終値日以降に重要なニュースが
> あるときだけ下の「ニュース更新版」を作る。
> 複数の実行が重ならないよう、push 前に必ず `git pull --rebase` する。push が拒否されたら
> pull --rebase してやり直す（force push は絶対にしない）。

### ニュース更新版（新しい終値が無いとき）
- 最新の data ファイル（ニュース更新版を含む）の出典より**新しい、重要な**ニュースがあるときだけ作る。
  重要 = FRB・政策当局の決定/要人発言、主要経済指標、地政学の大きな進展、原油・為替の急変、
  ウォッチリスト銘柄や大型株の決算・提携・規制・経営・大型案件など。焼き直しや小ネタだけなら作らない
- 最新の data ファイルを複製し `data/<終値日>_<JST日付>-<HHmm>.json` で保存。`date` は終値日のまま、
  `newsAsOf: "YYYY-MM-DD HH:mm"`（JST・ファイル名と一致）を追加
- 株価系（kpis の valueHtml/delta、watch の px/chg、movers の pct、prevIdx）は終値日の実測値のまま。
  KPI の delta に書く日付は終値日のみ。先物・ドル円などの途中経過は Yahoo チャートAPIの実測を
  why・本文に「日本時間◯時時点」と明記して書く
- dateLabel と headline.kicker には終値日と**更新日の両方**を書く（check.mjs が検査）
- headline / reasons / scenarios / news / events / kpiNews と、関係するウォッチ銘柄の note・news を更新
- check.mjs は「結論の根拠に終値日より新しい出典が無い」とエラーにする

1. `node scripts/fetch-quotes.mjs <日付>` — Yahoo Finance から全銘柄・指数・
   ドル円・10年金利・WTI・金 の終値と騰落率、金1gの円換算、オルカンの基準価額を取得
   （`data-quotes/<日付>.json` に保存）。
   騰落率や指数水準は必ずこの実データを使う（報道の数字は intraday のことがある）
2. 最新の市況ニュースを調べ、前日の `data/*.json` を複製して新しい日付で作成
3. 全セクションを更新する（`headline` / `kpis` / `reasons` / `scenarios` /
   `news` / `events` / `watch` / `movers` / `kpiNews` / `prevIdx` /
   `dateLabel` / `footerAsOf` / `date`）。`prevIdx` は「直近取引日」の指数終値
   （ライブ更新の換算基準になる）。`glossary`（用語ミニ解説）は下の運用ルールに従って
   必要なときだけ追記する
4. `npm run daily` — チェックが通ればそのままビルドされる
5. `git add -A && git commit && git push` — push で公開ページに反映される

### KPI カード（`kpis`）の構成 — 8枚
順番: `SPY`（S&P500）→ `ORUKAN`（オルカン）→ `GOLD`（金1g）→ `DIA` → `QQQ` → `JPY` → `US10Y` → `WTI`。
`kpiNews` にも同じ 8 キーを持たせる（無いと check が WARN、カードを押しても何も出ない）。
- **ORUKAN（オルカン＝eMAXIS Slim 全世界株式）**: data-quotes の `fund.orukan` から
  `nav`（基準価額・円）と `chgYen` / `chgPct`（前日比）を使う。基準価額は1日1回、日本の営業日の
  夕方に公表され、その日の日本時間朝までの海外市場を反映する（＝終値日の翌営業日の公表値が対応）。
  valueHtml は `37,161<span style="font-size:13px">円</span>` の形、delta は「▲ +103円（+0.28%）」。
  `fund.orukan` が無い（取得失敗）ときは前版の値を据え置き、why に「前回公表値」と書く。
  出典は みんかぶ（fund.orukan.sourceUrl）。TradingView チャートは ACWI（全世界株ETF）で代用
- **GOLD（金1g・円換算）**: data-quotes の `extra.GOLD_JPY_G`（`close` 円/g、`chg`、`asOf`、
  `goldUsdOz`、`usdJpy`）。国際価格（NY金先物）×ドル円÷31.1035 の換算値で、国内の店頭小売価格とは
  差がある旨を why に必ず書く。`asOf` が終値日と違う（金の休場日）ときは why に「◯/◯の金価格で換算」。
  delta には日付を書かない（check.mjs の日付検査が終値日と照合するため）
- 他の6枚は従来どおり（指数・ドル円・金利・原油は `extra` の実測値）

### 用語ミニ解説（`glossary`）の運用
- 形式: `glossary: [{ q: "〜って？", a: "2〜4文の解説" }]`。前版を複製して作るので自然に引き継がれる。
  データに無い場合、build は `src/glossary-default.json`（基本14項目）で埋める
- **追加の基準**: その日の `headline` / `reasons` / `scenarios` に、既存の用語集に無い専門用語や
  仕組みが「初めて、または中心的に」登場したとき、1〜2件だけ追加する。
  （例: ドットチャート、円キャリー、為替介入、ローテーション、受注残、SOX指数…）
  重複や言い換え（既存項目で説明できるもの）は追加しない。毎日必ず増やす必要はない
- 書き方: 投資初心者向けの敬体で2〜4文。「なぜ株価に関係するか」を必ず含め、可能なら
  その日の具体例を1つ入れる（数字は実測・報道に基づくもののみ）。見出しは質問形
- 追加は配列の**末尾**に。既存項目の本文は原則書き換えない（例示の数字が古くなった場合の
  更新は可）。削除・並べ替えはしない（ユーザーが後で整理する方針）
- **30件を超えたら追加を止め**、完了報告に「用語集が30件超・整理が必要」と書く
  （check.mjs も WARN を出す）

### check.mjs の見方
- **ERROR**（ビルド中断）: ヘッダー・結論・フッター等の日付が対象日と食い違う
- **WARN**: セクションの最新の出典が 4 日以上前 — 更新漏れの疑い。
  手作業時代はウォッチリストが 15 日間放置される事故が実際に起きた。
  WARN を無視してよいのは休場明けなど理由が説明できるときだけ。

## データの形式メモ

- ニュース 1 件: `{ t: 見出し, u: URL, s: "出典・8/27", sm: 要約, pl: "→ 追い風", dir: "up|down|mix" }`
  `s` の日付は check.mjs が鮮度判定に使うので必ず入れる
- `kpis[].valAttr / deltaAttr`: `id="v-SPY"` などライブ株価更新用の属性。消すと自動更新が壊れる
- `prevIdx`: ETF→指数換算の基準（直近取引日の指数終値）。毎日更新が必要
- HTML 断片を含むフィールドがある（`valueHtml` など）。値はエスケープせずそのまま埋め込まれる
- 騰落率・終値は報道の数字より fetch-quotes の実測を優先する（報道は intraday のことがある。
  8/27版では CRWD「+9%」実際+20.5%、HP「−7.1%」実際−2.9% という食い違いが実在した）

## テンプレート側の注意（Cowork からの引き継ぎ）

- 10年金利チャートは TradingView 埋め込みで `FRED:DGS10` を使用。
  `TVC:US10Y` は埋め込み非対応なので戻さないこと
- リアルタイム株価は Finnhub（WebSocket＋RESTポーリング、時間外セッション判定付き）。
  キーは公開ページの HTML にも埋め込まれている（無料枠・本人の意図した公開）
- ウォッチリストの追加銘柄は localStorage キー `kabu-dashboard-watchlist` に保存。
  日本語銘柄名の辞書はテンプレート内の `JP_STOCKS`

## してはいけないこと

- `index.html` を直接編集（次のビルドで消える）
- `secrets.json` をコミット（config.json の Finnhub 無料キーは公開前提なので例外）
- `git push --force`（複数の実行が同じリポジトリに書くため、履歴を消すと他方の作業が消える）
- `data/` の過去日付ファイルの書き換え（履歴として残す。ニュース更新も既存ファイルを直さず新ファイルで積む）
