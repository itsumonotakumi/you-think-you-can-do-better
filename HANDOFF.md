# HANDOFF

最終更新: 2026-11-08（シナリオレビュー反映・音声素材の配信準備）

## 体制
- オーケストレーター: Claude Opus 5.5（計画・契約・マージ判断）
- アドバイザー: Fable 5.1
- 実装・テスト / 脆弱性検査: OpenCode `opencode-go/deepseek-v4.1-flash`（最大8並列、`tools/dev/run-agent.sh` で git worktree ごとに実行）
- 品質検査: Codex `gpt-6.1-sol`（最大2）
- Git 作業: Claude Haiku
- 優先度: 開発コスト ＞ セキュリティ ＞ 品質 ＞ 開発速度

## 決定事項（設計書からの補足・簡略化）
- 共有契約は `src/engine/types.ts`。冒頭コメントに設計書の穴を埋める決め事（進行・フェーズ・遅延・期限・時計）を記載
- シナリオ YAML は `scenarios/<id>/scenario.yaml` + `scenarios/<id>/roles/<role>.yaml` に分割（並列執筆のため）
- UI 文言は `locales/<lang>/ui/*.yaml`（画面担当ごとに分割）+ `locales/<lang>/notices.yaml`
- v1 のシナリオ本文は日本語のみ（`languages: [ja]`）。UI は日英
- 初版から外す: popular 表示、挿絵ファイル（スロットのみ）、印刷レイアウト、シナリオ版移行（「はじめから」のみ）、環境音レイヤーと高音カット
- C11〜C13（経路探索）は後回し。厳密探索ではなく上下限見積もりで実装予定
- GitHub Pages 配信（`.github/workflows/pages.yml`）はリリースまで手動起動のみ
- 音声素材は未選定（規約確認が人手のため）。素材なしでも無音で動く

## Wave 計画
- Wave0 ✅ 雛形、契約、no-op スタブ、フィクスチャ `tests/fixtures/scenario.ts`、ゴールデンテスト `tests/unit/golden/`
- Wave1 ✅ 8並列: engine-core / engine-read / validate / storage-i18n / audio-fx / screens-a / screens-b / scenario-no1（結合時修正: validator のゲージ検査、UI キーの平坦化、相対 import、YAML 引用符）
- Wave1b ✅ 5並列: screens-c（S07〜S09）/ No.1 の officer・lead・analyst / C11〜C13（実エンジンでの決定的シミュレーション方式）
  - 結合後: validate OK、単体テスト 372件合格、svelte-check 0、vite build 成功
- Wave2 ✅ 8並列: E2E（Playwright）/ 脆弱性検査 app・build / シナリオ No.2〜No.6 の経営者ロール
  - E2E で発見: i18n 未初期化（main.ts で初期化して修正）、続きからで $state プロキシを渡していた（$state.snapshot で修正）
  - 結合後: シナリオ6本、単体 423件、E2E 12件（PC・スマホ幅）すべて合格
  - 脆弱性検査の指摘（中）: 保存データの要素検証不足、build-data の id 未検証・検査迂回、denylist の fail-open、Actions の SHA 未固定
- Wave3 ✅ OpenCode 6並列: No.7〜No.10 経営者ロール / fix-app（保存データ検証・例外境界）/ fix-build（検査ツールと CI の強化）
  - 結合後: シナリオ10本（経営者ロール）、単体 552件、E2E 12件すべて合格
  - Actions を SHA 固定、Dependabot 追加（オーケストレーター）
  - Codex 品質検査: エンジン・検査12件（高6）、画面10件（高2）→ `.worktrees/_prompts/codex-q1.md` / `codex-q2.md`
- Wave4 ✅ fix-engine / fix-validate（経路検査をシード付き乱数で2000本に拡張、全ランク到達を警告で確認）/ fix-ui-resume / fix-ui-main / No.2 3ロール / No.3 officer
- Wave5 ✅ ランク到達の調整（4ロール）/ No.3〜No.5 のロール7本。CI に E2E（main 反映時）を追加
- Wave6 ✅ No.5〜No.8 のロール8本 / Wave7 ✅ No.8〜No.10 のロール8本
  - 結合後: 10シナリオ×4ロール=40ロール、validate 警告0、単体 916件、E2E 12件、dist 2.9MB
- 最終検査 ✅ 脆弱性の再検査2本（OpenCode）、修正の再確認・シナリオ内容（Codex）→ 修正8本（検査ツールと CI、アプリ、字幕の共通化、シナリオ内容5本）
  - シナリオ内容の主な修正: 不正目的の事件の確報期限を60日に統一、ロール間の時刻・人数・曜日の矛盾、報告対象の説明
  - build:data では経路検査（C11〜C13）を省略（1.5秒）。経路検査は npm run validate（約2分半）で実施
  - 最終状態: validate 警告0、単体 1037件、E2E 12件、svelte-check 0、npm audit --omit=dev 0件

## リリース前に残っていること（人の判断・作業）
1. 音声素材: 効果音は配置済み。BGM は取得中
2. references.yaml の原典確認（条文番号・版・日付）
3. 内容レビュー: Fable のレビューと修正は実施。最終の通読は人が行う
4. プレイテスト（9章）。配点の手触り、所要時間
5. ✅ origin への push は完了（2026-11-08）。残りは Pages の手動配信（Settings → Pages で GitHub Actions を選択後、Deploy to GitHub Pages を手動実行）
6. 任意: 英語本文（v1 は日本語のみ、UI は日英）、挿絵、クリックジャッキング対策（Pages ではヘッダを付けられない）
- 簡略化: シナリオの版が変わった時は「はじめから」のみ（旧版の続きは作らない）
-、英語本文、音声素材

## シナリオレビュー（Fable）と音声素材（2026-11-08 夜）
- Fable 5本で全10シナリオをレビュー → `docs/reviews/<id>.md`（テスト計画書 7〜8章の記録）
  - 共通の重大指摘: 記者会見で嘘の回答が高得点（身代金を払ったのに「支払っていません」）→ `PressAnswer.when` を契約に追加して対応
  - 権利: 年・業種・特徴の組み合わせで元事件が特定できる（No.4, No.5, No.9 ほか）→ 時期の明記を外し組み合わせを崩した
  - 法令: 確報の期限（不正目的あり=60日、過失=30日）、委託先の報告義務の扱い（No.2）、適時開示の根拠（No.2）
- 修正: No.1〜No.6・No.9・No.10 はマージ済み（単体 1150件合格）。No.7・No.8 は作業中
- 音声素材: 公開リポジトリには置かない。非公開リポジトリ `itsumonotakumi/ytcdb-audio` に置き、Pages 配信時だけ `AUDIO_REPO_TOKEN`（Contents 読み取りのみ）で取得して `dist/audio/` に入れる
  - 効果音15件: 効果音ラボ（ユーザーが手動ダウンロード）。BGM 13曲: Playwright で取得中
  - 通常の CI は `YTCDB_AUDIO=optional` で音声ファイルの欠けを許す
- GitHub Pages: Source=GitHub Actions、github-pages 環境は main のみ配信可（設定済み）
- 設計書は `docs/plan/` に移動。README から「現在の状況」「ドキュメント」を削除

## ランキング API の本番設定（#7 レビュー対応）

Turnstile 必須・無料枠保護・投稿とレート制限の原子化を行った。優先順位は開発コスト（無料枠）＞セキュリティ＞品質で、有料機能は使っていない（Cache API・D1・Turnstile の無料範囲のみ）。

### 秘密鍵（`npx wrangler secret put <名前>`）

| 名前 | 必須 | 用途 |
| --- | --- | --- |
| `TURNSTILE_SECRET` | 必須 | Turnstile の siteverify。未設定なら書き込みは 503（`turnstile_not_configured`） |
| `IP_HASH_SECRET` | 必須 | IP の HMAC-SHA256 用の鍵。未設定なら書き込みは 503（`ip_hash_not_configured`）。変えるとレート制限の履歴がリセットされる |

### 環境変数（`wrangler.toml` の `[vars]`）

| 名前 | 既定 | 用途 |
| --- | --- | --- |
| `REQUIRE_TURNSTILE` | `true` | Turnstile を必須にする |
| `ALLOWED_HOSTS` | `yattemite.pages.dev,localhost` | siteverify が返す hostname の許可リスト（カンマ区切り。先頭 `.` はサブドメイン一致）。**本番ドメインを変えたら必ず更新する** |
| `DAILY_WRITE_LIMIT` | `20000` | 1 日の登録件数上限（無料枠の安全装置）。超えたら 503 |
| `MAX_REGISTRATIONS_PER_IP` | `20` | 同じ IP ハッシュが 1 日に登録できる件数 |

`ALLOW_NO_TURNSTILE` は**ローカル開発専用**。`.dev.vars` にだけ書き、`wrangler.toml` には書かない（書くと本番で検証を省略してしまう）。

### デプロイ手順

1. `npx wrangler d1 create yattemite-ranking` → 出力の `database_id` を `wrangler.toml` に入れる（現在は `TO_BE_FILLED`）
2. `npx wrangler d1 migrations apply yattemite-ranking --remote`（`0001_init.sql` → `0002_ranking_hardening.sql`）
3. 上の 2 つの秘密鍵を設定する
4. フロントのビルドに `VITE_API_BASE` と `VITE_TURNSTILE_SITEKEY` を渡す
5. Turnstile のウィジェットは action `submit-play` を送る（`src/app/ranking/turnstile.ts`）。siteverify の `hostname` と `action` が合わないトークンは拒否する
6. ローカル確認: `.dev.vars` に `ALLOW_NO_TURNSTILE="true"` を置けば Turnstile 無しで動く（`IP_HASH_SECRET` は必要）

### 設計上の割り切り（既知の限界）

- `clientId` は端末が作る値なので付け替えを完全には防げない。初回限定は目安で、IP あたり 1 日 20 件の上限で悪用を減らす（README に明記）
- 各判断の所要時間は送っていないので、制限時間モード（hard）の時間改ざんは検証できない。再生時には `mode` を渡すが、保証はしない（`functions/_lib/replay.ts` のコメントと README に明記）
- 日次上限の判定は `daily_writes` の 1 行を条件にした条件付き INSERT。同時実行では数件だけ上限を超えうる（安全装置としての余裕を見て 20,000 件に設定）
- レート制限の古い行の掃除は投稿のたびに 2%（50 分に 1 回）だけ行う。48 時間より古い行を消す
- 読み取りは Cache API で 60 秒キャッシュ。stats は新しい 1000 件だけを集計する

## 運用メモ
- 注意: エージェントが worktree の外（main の作業ツリー）に書いたことが1回あった（r05-officer）。共通指示に禁止を追記済み。マージ前に main で `git status` を確認する
- エージェントの指示書: `.worktrees/_prompts/*.md`（共通部分 `_common.md`）、ログ: `.worktrees/_logs/`
- 実行: `tools/dev/run-agent.sh <name> <prompt>` → `agent/<name>` ブランチに自動コミット → Haiku が main に --no-ff マージ
- 指示書は bash で生成する（zsh は変数の単語分割をしない）
- 結合後の確認: `npm run validate && npm run build:data && npx vitest run && npx svelte-check && npx vite build`

## 既知の問題
- `npm audit`: deepmerge（@sveltejs/vite-plugin-svelte 経由、low、修正版なし、ビルド時のみ）

## 未決事項（ユーザー判断）
- 音声素材の選定と置き場所（設計書 18章）
- references.yaml の原典確認（公開前に人手）
- origin への push（現在はローカル main のみ）
- Codex: `~/.codex/config.toml` の書き間違い（reqiores_openai_auth）を修正済み（バックアップ: config.toml.bak-20261108）
