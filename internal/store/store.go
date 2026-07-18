// Package store is Paldeck's SQLite state: the servers it manages, their
// assigned ports, and their Palworld settings. Pure-Go driver
// (modernc.org/sqlite) — no C compiler needed.
package store

import (
	"database/sql"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Server struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	ContainerID string `json:"containerId"`
	GamePort    int    `json:"gamePort"`
	QueryPort   int    `json:"queryPort"`
	RconPort    int    `json:"rconPort"`
	AdminPass   string `json:"-"` // never serialized to the client

	// Palworld settings, collected at create time.
	Description    string `json:"description"`
	MaxPlayers     int    `json:"maxPlayers"`
	ServerPassword string `json:"-"` // join password: write-only, not echoed
	Difficulty     string `json:"difficulty"`
	PvP            bool   `json:"pvp"`

	CreatedAt time.Time `json:"createdAt"`
	// Status is filled from Docker at read time, not stored.
	Status string `json:"status"`
}

type Store struct{ db *sql.DB }

const schema = `
CREATE TABLE IF NOT EXISTS servers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  container_id    TEXT NOT NULL DEFAULT '',
  game_port       INTEGER NOT NULL,
  query_port      INTEGER NOT NULL,
  rcon_port       INTEGER NOT NULL,
  admin_pass      TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  max_players     INTEGER NOT NULL DEFAULT 16,
  server_password TEXT NOT NULL DEFAULT '',
  difficulty      TEXT NOT NULL DEFAULT 'None',
  pvp             INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL
);`

// migrations upgrade an older servers table to the current schema. Each is
// idempotent: on a fresh DB the columns already exist (from schema above) so
// the ALTER fails with "duplicate column name", which we ignore. On an old DB
// (created before settings existed) it adds the missing columns.
var migrations = []string{
	`ALTER TABLE servers ADD COLUMN description TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE servers ADD COLUMN max_players INTEGER NOT NULL DEFAULT 16`,
	`ALTER TABLE servers ADD COLUMN server_password TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE servers ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'None'`,
	`ALTER TABLE servers ADD COLUMN pvp INTEGER NOT NULL DEFAULT 0`,
}

func Open(path string) (*Store, error) {
	// WAL: readers don't block the writer. busy_timeout: wait for a lock
	// instead of failing with SQLITE_BUSY.
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	// One connection, one writer: for a single-operator app this removes
	// "database is locked" entirely (found by the 002 concurrency stress test).
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			return nil, err
		}
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// cols is the column list shared by List and Get, kept in one place so the
// SELECT order always matches scanServer.
const cols = `id, name, container_id, game_port, query_port, rcon_port, admin_pass,
description, max_players, server_password, difficulty, pvp, created_at`

// scanner is satisfied by both *sql.Row (Get) and *sql.Rows (List).
type scanner interface{ Scan(dest ...any) error }

func scanServer(sc scanner) (Server, error) {
	var v Server
	var pvp int // SQLite stores the bool as 0/1
	err := sc.Scan(&v.ID, &v.Name, &v.ContainerID, &v.GamePort, &v.QueryPort, &v.RconPort,
		&v.AdminPass, &v.Description, &v.MaxPlayers, &v.ServerPassword, &v.Difficulty, &pvp, &v.CreatedAt)
	v.PvP = pvp != 0
	return v, err
}

func (s *Store) List() ([]Server, error) {
	rows, err := s.db.Query(`SELECT ` + cols + ` FROM servers ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Server
	for rows.Next() {
		v, err := scanServer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Store) Get(id string) (Server, error) {
	return scanServer(s.db.QueryRow(`SELECT `+cols+` FROM servers WHERE id = ?`, id))
}

// CreateReserving allocates a free port triple and inserts the record in ONE
// transaction, then writes the chosen ports back into v. The old flow (read
// used ports → … → insert later) let two concurrent creates claim the same
// ports; the stress test proved it (two servers on 8217). Atomic = no window.
func (s *Store) CreateReserving(v *Server) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.Query(`SELECT game_port FROM servers`)
	if err != nil {
		return err
	}
	used := map[int]bool{}
	for rows.Next() {
		var p int
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			return err
		}
		used[p] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	game := 8211
	for used[game] {
		game++
	}
	offset := game - 8211
	v.GamePort, v.QueryPort, v.RconPort = game, 27015+offset, 25575+offset

	pvp := 0
	if v.PvP {
		pvp = 1
	}
	if _, err := tx.Exec(
		`INSERT INTO servers (id, name, container_id, game_port, query_port, rcon_port, admin_pass,
		 description, max_players, server_password, difficulty, pvp, created_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		v.ID, v.Name, v.ContainerID, v.GamePort, v.QueryPort, v.RconPort, v.AdminPass,
		v.Description, v.MaxPlayers, v.ServerPassword, v.Difficulty, pvp, v.CreatedAt); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) SetContainer(id, containerID string) error {
	_, err := s.db.Exec(`UPDATE servers SET container_id = ? WHERE id = ?`, containerID, id)
	return err
}

func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM servers WHERE id = ?`, id)
	return err
}

