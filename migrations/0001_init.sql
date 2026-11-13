-- ランキング（#7）の D1 スキーマ。
-- 適用: npx wrangler d1 migrations apply yattemite-ranking --local（開発）/ --remote（本番）

CREATE TABLE IF NOT EXISTS plays (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 端末ごとの乱数 ID（個人情報ではない）。初回のみ登録の判定に使う
  client_id    TEXT    NOT NULL,
  scenario_id  TEXT    NOT NULL,
  role         TEXT    NOT NULL,
  mode         TEXT    NOT NULL,
  nickname     TEXT    NOT NULL,
  -- 点数はクライアントから受け取らず、サーバーでエンジンを再生して決める
  score        INTEGER NOT NULL,
  rank         TEXT    NOT NULL,
  -- PlaySubmission['choices'] を JSON で持つ（判断ごとの選択率の集計に使う）
  choices_json TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);

-- 初回の 1 件だけを登録する
CREATE UNIQUE INDEX IF NOT EXISTS plays_first
  ON plays (client_id, scenario_id, role, mode);

-- ランキングの並び替え（同点は先着）
CREATE INDEX IF NOT EXISTS plays_ranking
  ON plays (scenario_id, role, mode, score DESC, created_at ASC);

-- 無料枠の安全装置（1日の書き込み件数）で使う
CREATE INDEX IF NOT EXISTS plays_created
  ON plays (created_at);

-- レート制限。生の IP は保存せず、ハッシュと 1 分単位の窓だけを持つ
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash      TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window
  ON rate_limits (window_start);
