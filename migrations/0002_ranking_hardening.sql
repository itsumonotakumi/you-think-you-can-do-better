-- ランキング（#7）レビュー指摘の修正。
-- 適用: npx wrangler d1 migrations apply yattemite-ranking --local（開発）/ --remote（本番）

-- 選択率の集計は「対象区分の新しい 1000 件」を読む。区分で絞ったうえで新しい順に読めるようにする
-- （従来の plays_ranking は点数順なので、選択率の集計で並べ替えが発生していた）
CREATE INDEX IF NOT EXISTS plays_recent
  ON plays (scenario_id, role, mode, created_at DESC);

-- 1日の登録件数（無料枠の安全装置）。plays の全件を数えずに 1 行だけ読む
CREATE TABLE IF NOT EXISTS daily_writes (
  day   INTEGER PRIMARY KEY,
  count INTEGER NOT NULL
);

-- 同じ IP ハッシュが 1 日に登録できる件数（端末 ID の付け替え対策）。生の IP は保存しない
CREATE TABLE IF NOT EXISTS ip_registrations (
  ip_hash TEXT    NOT NULL,
  day     INTEGER NOT NULL,
  count   INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, day)
);

-- 古い行の掃除（投稿のたびに 2%）で使う
CREATE INDEX IF NOT EXISTS ip_registrations_day
  ON ip_registrations (day);

-- 1日の書き込み件数は daily_writes で数えるので、plays_created は使わない。
-- 索引の更新も書き込みに数えられるため、未使用の索引は落としておく。
DROP INDEX IF EXISTS plays_created;
