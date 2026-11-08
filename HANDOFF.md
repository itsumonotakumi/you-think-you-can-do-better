# HANDOFF

最終更新: 2026-11-08（Wave0 完了 / Wave1 起動）

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
- Wave1 🔄 8並列: engine-core / engine-read / validate / storage-i18n / audio-fx / screens-a / screens-b / scenario-no1
- Wave1b: S07〜S09 画面、結合
- Wave2: 結合テスト・E2E スモーク、脆弱性検査（OpenCode）、品質検査（Codex）
- Wave3〜: No.1 残りロール、残り9シナリオ、C11〜C13

## 既知の問題
- `npm audit`: deepmerge（@sveltejs/vite-plugin-svelte 経由、low、修正版なし、ビルド時のみ）

## 未決事項（ユーザー判断）
- 音声素材の選定と置き場所（設計書 18章）
- references.yaml の原典確認（公開前に人手）
- origin への push（現在はローカル main のみ）
