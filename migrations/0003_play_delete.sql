-- ランキング（#7）: 端末から送られた削除用の鍵のハッシュ。
-- 鍵そのものは保存しない。DELETE /api/plays で client_id とハッシュが一致した行だけを消す。
-- 適用: npx wrangler d1 migrations apply yattemite-ranking --local（開発）/ --remote（本番）

ALTER TABLE plays ADD COLUMN delete_key_hash TEXT NOT NULL DEFAULT '';

-- 既存の記録はハッシュが空なので、この仕組みでは削除できない（README に明記）。
-- 削除は client_id + ハッシュで絞る。client_id は plays_first の先頭列なので索引は足さない。
