-- onm-personal 初始表结构
-- files：每个图片 / 文本一行。图片内容在 R2（r2_key），文本内容在 text_versions。
CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,               -- 8 位随机 base62，也是公开链接里的 id
  kind            TEXT NOT NULL CHECK (kind IN ('image', 'text')),
  name            TEXT NOT NULL,                  -- 显示名（含扩展名）
  ext             TEXT NOT NULL,                  -- 小写扩展名，不含点
  mime            TEXT NOT NULL,
  size            INTEGER NOT NULL,               -- 字节；文本为当前版本大小
  r2_key          TEXT,                           -- 图片：R2 对象 key；文本：NULL
  current_version INTEGER,                        -- 文本：当前版本号；图片：NULL
  created_at      INTEGER NOT NULL,               -- 毫秒时间戳
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_updated ON files (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_kind_updated ON files (kind, updated_at DESC);

-- text_versions：文本的每一次保存都是一个新版本（只增不改），按时间戳记录。
-- 回滚 = 把旧版本内容另存为一个新版本，历史永远不丢。
CREATE TABLE IF NOT EXISTS text_versions (
  file_id    TEXT NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,                    -- 从 1 开始递增
  content    TEXT NOT NULL,
  size       INTEGER NOT NULL,                    -- UTF-8 字节数
  note       TEXT,                                -- 例如「上传」「回滚自 v3」
  created_at INTEGER NOT NULL,                    -- 毫秒时间戳
  PRIMARY KEY (file_id, version)
);
