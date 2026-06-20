package db

import (
	"database/sql"

	_ "modernc.org/sqlite" // 纯 Go SQLite 驱动，免 CGO
)

// Open 打开 SQLite 数据库并执行迁移
func Open(path string) (*sql.DB, error) {
	// _txlock=immediate 写事务立即获锁；_busy_timeout 避免并发写报错
	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_txlock=immediate"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite 单写多读，连接池保留少量连接
	db.SetMaxOpenConns(1)

	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func migrate(db *sql.DB) error {
	schema := `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  duration REAL,
  width INTEGER,
  height INTEGER,
  codec TEXT,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  width INTEGER DEFAULT 1920,
  height INTEGER DEFAULT 1080,
  fps INTEGER DEFAULT 30,
  thumbnail_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  ord INTEGER NOT NULL,
  muted INTEGER DEFAULT 0,
  volume REAL DEFAULT 1.0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL,
  asset_id INTEGER,
  timeline_start REAL NOT NULL,
  timeline_end REAL NOT NULL,
  source_start REAL,
  source_end REAL,
  text TEXT,
  style_json TEXT,
  fade_in REAL,
  fade_out REAL,
  speed REAL DEFAULT 1.0,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS render_jobs (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  output_path TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
`
	_, err := db.Exec(schema)
	if err != nil {
		return err
	}
	return migrateAddClipSpeed(db)
}

// migrateAddClipSpeed 给已有库的 clips 表补 speed 列。
// CREATE TABLE IF NOT EXISTS 不会给已存在的老表加列，所以需手动检查并 ALTER。
func migrateAddClipSpeed(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(clips)`)
	if err != nil {
		return err
	}
	hasSpeed := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			rows.Close()
			return err
		}
		if name == "speed" {
			hasSpeed = true
		}
	}
	rows.Close()
	if hasSpeed {
		return nil
	}
	_, err = db.Exec(`ALTER TABLE clips ADD COLUMN speed REAL DEFAULT 1.0`)
	return err
}
