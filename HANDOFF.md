# HANDOFF

最終更新: 2026-11-08（Wave1b 完了 / Wave2 実行中）

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
- Wave2 🔄 8並列: E2E（Playwright）/ 脆弱性検査 app・build / シナリオ No.2〜No.6 の経営者ロール
- Wave3: No.7〜No.10 経営者ロール、脆弱性・E2E の指摘修正、Codex 品質検査
- Wave4〜: No.2〜No.10 の残りロール、英語本文、音声素材

## 運用メモ
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
- Codex の認証切れ（`codex login` が必要）。品質検査は未実施
