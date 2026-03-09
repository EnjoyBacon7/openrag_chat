package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/camillebizeul/test3/backend/models"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

// parseTime tries multiple timestamp formats that SQLite may produce.
func parseTime(s string) time.Time {
	formats := []string{
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05.999999999Z07:00",
		time.RFC3339,
		time.RFC3339Nano,
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

func New(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate database: %w", err)
	}
	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS models (
		id                TEXT PRIMARY KEY,
		name              TEXT NOT NULL,
		base_url          TEXT NOT NULL,
		api_key           TEXT NOT NULL DEFAULT '',
		model_id          TEXT NOT NULL,
		system_prompt     TEXT NOT NULL DEFAULT '',
		temperature       REAL,
		top_p             REAL,
		max_tokens        INTEGER,
		presence_penalty  REAL,
		frequency_penalty REAL,
		created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS mcp_servers (
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL,
		url        TEXT NOT NULL,
		api_key    TEXT NOT NULL DEFAULT '',
		transport  TEXT NOT NULL DEFAULT 'streamable-http',
		created_at DATETIME NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS conversations (
		id            TEXT PRIMARY KEY,
		title         TEXT NOT NULL DEFAULT 'New Chat',
		model_id      TEXT NOT NULL DEFAULT '',
		mcp_server_id TEXT NOT NULL DEFAULT '',
		created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
		updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS messages (
		id              TEXT PRIMARY KEY,
		conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
		role            TEXT NOT NULL,
		content         TEXT NOT NULL DEFAULT '',
		tool_calls      TEXT NOT NULL DEFAULT '',
		tool_call_id    TEXT NOT NULL DEFAULT '',
		name            TEXT NOT NULL DEFAULT '',
		created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
	);

	CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
	`
	_, err := db.conn.Exec(schema)
	if err != nil {
		return err
	}

	// Additive migrations for existing DBs (safe to run repeatedly; fails silently if column already exists)
	db.conn.Exec("ALTER TABLE mcp_servers ADD COLUMN transport TEXT NOT NULL DEFAULT 'streamable-http'")
	db.conn.Exec("ALTER TABLE messages ADD COLUMN name TEXT NOT NULL DEFAULT ''")
	db.conn.Exec("ALTER TABLE models ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''")
	db.conn.Exec("ALTER TABLE models ADD COLUMN temperature REAL")
	db.conn.Exec("ALTER TABLE models ADD COLUMN top_p REAL")
	db.conn.Exec("ALTER TABLE models ADD COLUMN max_tokens INTEGER")
	db.conn.Exec("ALTER TABLE models ADD COLUMN presence_penalty REAL")
	db.conn.Exec("ALTER TABLE models ADD COLUMN frequency_penalty REAL")

	return nil
}

// ──────────────────────────────────────────────
// Model configs
// ──────────────────────────────────────────────

func (db *DB) ListModels() ([]models.ModelConfig, error) {
	rows, err := db.conn.Query(`SELECT id, name, base_url, api_key, model_id,
		system_prompt, temperature, top_p, max_tokens, presence_penalty, frequency_penalty,
		created_at FROM models ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.ModelConfig
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (db *DB) GetModel(id string) (*models.ModelConfig, error) {
	rows, err := db.conn.Query(`SELECT id, name, base_url, api_key, model_id,
		system_prompt, temperature, top_p, max_tokens, presence_penalty, frequency_penalty,
		created_at FROM models WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, nil
	}
	m, err := scanModel(rows)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// scanModel scans a models SELECT row into a ModelConfig.
// Columns must be: id, name, base_url, api_key, model_id,
// system_prompt, temperature, top_p, max_tokens, presence_penalty, frequency_penalty, created_at
func scanModel(rows *sql.Rows) (models.ModelConfig, error) {
	var m models.ModelConfig
	var ts, systemPrompt string
	var temperature, topP, presencePenalty, frequencyPenalty sql.NullFloat64
	var maxTokens sql.NullInt64

	err := rows.Scan(
		&m.ID, &m.Name, &m.BaseURL, &m.APIKey, &m.ModelID,
		&systemPrompt,
		&temperature, &topP, &maxTokens, &presencePenalty, &frequencyPenalty,
		&ts,
	)
	if err != nil {
		return m, err
	}
	m.CreatedAt = parseTime(ts)
	m.SystemPrompt = systemPrompt
	if temperature.Valid {
		v := temperature.Float64
		m.Temperature = &v
	}
	if topP.Valid {
		v := topP.Float64
		m.TopP = &v
	}
	if maxTokens.Valid {
		v := int(maxTokens.Int64)
		m.MaxTokens = &v
	}
	if presencePenalty.Valid {
		v := presencePenalty.Float64
		m.PresencePenalty = &v
	}
	if frequencyPenalty.Valid {
		v := frequencyPenalty.Float64
		m.FrequencyPenalty = &v
	}
	return m, nil
}

func (db *DB) CreateModel(req models.CreateModelRequest) (*models.ModelConfig, error) {
	m := models.ModelConfig{
		ID:               uuid.New().String(),
		Name:             req.Name,
		BaseURL:          req.BaseURL,
		APIKey:           req.APIKey,
		ModelID:          req.ModelID,
		SystemPrompt:     req.SystemPrompt,
		Temperature:      req.Temperature,
		TopP:             req.TopP,
		MaxTokens:        req.MaxTokens,
		PresencePenalty:  req.PresencePenalty,
		FrequencyPenalty: req.FrequencyPenalty,
		CreatedAt:        time.Now().UTC(),
	}

	_, err := db.conn.Exec(`INSERT INTO models
		(id, name, base_url, api_key, model_id, system_prompt,
		 temperature, top_p, max_tokens, presence_penalty, frequency_penalty, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.Name, m.BaseURL, m.APIKey, m.ModelID, m.SystemPrompt,
		nullFloat(m.Temperature), nullFloat(m.TopP), nullInt(m.MaxTokens),
		nullFloat(m.PresencePenalty), nullFloat(m.FrequencyPenalty),
		m.CreatedAt.Format("2006-01-02 15:04:05"),
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (db *DB) UpdateModel(id string, req models.UpdateModelRequest) (*models.ModelConfig, error) {
	m, err := db.GetModel(id)
	if err != nil || m == nil {
		return nil, err
	}
	if req.Name != nil {
		m.Name = *req.Name
	}
	if req.BaseURL != nil {
		m.BaseURL = *req.BaseURL
	}
	if req.APIKey != nil {
		m.APIKey = *req.APIKey
	}
	if req.ModelID != nil {
		m.ModelID = *req.ModelID
	}
	if req.SystemPrompt != nil {
		m.SystemPrompt = *req.SystemPrompt
	}
	if req.ClearTemperature {
		m.Temperature = nil
	} else if req.Temperature != nil {
		m.Temperature = req.Temperature
	}
	if req.ClearTopP {
		m.TopP = nil
	} else if req.TopP != nil {
		m.TopP = req.TopP
	}
	if req.ClearMaxTokens {
		m.MaxTokens = nil
	} else if req.MaxTokens != nil {
		m.MaxTokens = req.MaxTokens
	}
	if req.ClearPresencePenalty {
		m.PresencePenalty = nil
	} else if req.PresencePenalty != nil {
		m.PresencePenalty = req.PresencePenalty
	}
	if req.ClearFrequencyPenalty {
		m.FrequencyPenalty = nil
	} else if req.FrequencyPenalty != nil {
		m.FrequencyPenalty = req.FrequencyPenalty
	}

	_, err = db.conn.Exec(`UPDATE models SET
		name=?, base_url=?, api_key=?, model_id=?, system_prompt=?,
		temperature=?, top_p=?, max_tokens=?, presence_penalty=?, frequency_penalty=?
		WHERE id=?`,
		m.Name, m.BaseURL, m.APIKey, m.ModelID, m.SystemPrompt,
		nullFloat(m.Temperature), nullFloat(m.TopP), nullInt(m.MaxTokens),
		nullFloat(m.PresencePenalty), nullFloat(m.FrequencyPenalty),
		id,
	)
	return m, err
}

func (db *DB) DeleteModel(id string) error {
	_, err := db.conn.Exec("DELETE FROM models WHERE id = ?", id)
	return err
}

// nullFloat converts a *float64 to a sql.NullFloat64.
func nullFloat(p *float64) sql.NullFloat64 {
	if p == nil {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: *p, Valid: true}
}

// nullInt converts a *int to a sql.NullInt64.
func nullInt(p *int) sql.NullInt64 {
	if p == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(*p), Valid: true}
}

// ──────────────────────────────────────────────
// MCP Servers
// ──────────────────────────────────────────────

func (db *DB) ListMCPServers() ([]models.MCPServer, error) {
	rows, err := db.conn.Query("SELECT id, name, url, api_key, transport, created_at FROM mcp_servers ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.MCPServer
	for rows.Next() {
		var s models.MCPServer
		var ts string
		if err := rows.Scan(&s.ID, &s.Name, &s.URL, &s.APIKey, &s.Transport, &ts); err != nil {
			return nil, err
		}
		s.CreatedAt = parseTime(ts)
		out = append(out, s)
	}
	return out, rows.Err()
}

func (db *DB) GetMCPServer(id string) (*models.MCPServer, error) {
	var s models.MCPServer
	var ts string
	err := db.conn.QueryRow("SELECT id, name, url, api_key, transport, created_at FROM mcp_servers WHERE id = ?", id).
		Scan(&s.ID, &s.Name, &s.URL, &s.APIKey, &s.Transport, &ts)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	s.CreatedAt = parseTime(ts)
	return &s, nil
}

func (db *DB) CreateMCPServer(req models.CreateMCPServerRequest) (*models.MCPServer, error) {
	transport := req.Transport
	if transport == "" {
		transport = "streamable-http"
	}
	s := models.MCPServer{
		ID:        uuid.New().String(),
		Name:      req.Name,
		URL:       req.URL,
		APIKey:    req.APIKey,
		Transport: transport,
		CreatedAt: time.Now().UTC(),
	}
	_, err := db.conn.Exec("INSERT INTO mcp_servers (id, name, url, api_key, transport, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		s.ID, s.Name, s.URL, s.APIKey, s.Transport, s.CreatedAt.Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (db *DB) UpdateMCPServer(id string, req models.UpdateMCPServerRequest) (*models.MCPServer, error) {
	s, err := db.GetMCPServer(id)
	if err != nil || s == nil {
		return nil, err
	}
	if req.Name != nil {
		s.Name = *req.Name
	}
	if req.URL != nil {
		s.URL = *req.URL
	}
	if req.APIKey != nil {
		s.APIKey = *req.APIKey
	}
	if req.Transport != nil {
		s.Transport = *req.Transport
	}
	_, err = db.conn.Exec("UPDATE mcp_servers SET name=?, url=?, api_key=?, transport=? WHERE id=?",
		s.Name, s.URL, s.APIKey, s.Transport, id)
	return s, err
}

func (db *DB) DeleteMCPServer(id string) error {
	_, err := db.conn.Exec("DELETE FROM mcp_servers WHERE id = ?", id)
	return err
}

// ──────────────────────────────────────────────
// Conversations
// ──────────────────────────────────────────────

func (db *DB) ListConversations() ([]models.Conversation, error) {
	rows, err := db.conn.Query("SELECT id, title, model_id, mcp_server_id, created_at, updated_at FROM conversations ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.Conversation
	for rows.Next() {
		var c models.Conversation
		var createdTS, updatedTS string
		if err := rows.Scan(&c.ID, &c.Title, &c.ModelID, &c.MCPServerID, &createdTS, &updatedTS); err != nil {
			return nil, err
		}
		c.CreatedAt = parseTime(createdTS)
		c.UpdatedAt = parseTime(updatedTS)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (db *DB) GetConversation(id string) (*models.ConversationWithMessages, error) {
	var c models.ConversationWithMessages
	var createdTS, updatedTS string
	err := db.conn.QueryRow("SELECT id, title, model_id, mcp_server_id, created_at, updated_at FROM conversations WHERE id = ?", id).
		Scan(&c.ID, &c.Title, &c.ModelID, &c.MCPServerID, &createdTS, &updatedTS)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.CreatedAt = parseTime(createdTS)
	c.UpdatedAt = parseTime(updatedTS)

	rows, err := db.conn.Query("SELECT id, conversation_id, role, content, tool_calls, tool_call_id, name, created_at FROM messages WHERE conversation_id = ? ORDER BY rowid ASC", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	c.Messages = []models.Message{}
	for rows.Next() {
		var m models.Message
		var ts string
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.ToolCalls, &m.ToolCallID, &m.Name, &ts); err != nil {
			return nil, err
		}
		m.CreatedAt = parseTime(ts)
		c.Messages = append(c.Messages, m)
	}
	return &c, rows.Err()
}

func (db *DB) CreateConversation(req models.CreateConversationRequest) (*models.Conversation, error) {
	title := req.Title
	if title == "" {
		title = "New Chat"
	}
	c := models.Conversation{
		ID:          uuid.New().String(),
		Title:       title,
		ModelID:     req.ModelID,
		MCPServerID: req.MCPServerID,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	_, err := db.conn.Exec("INSERT INTO conversations (id, title, model_id, mcp_server_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		c.ID, c.Title, c.ModelID, c.MCPServerID,
		c.CreatedAt.Format("2006-01-02 15:04:05"),
		c.UpdatedAt.Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (db *DB) UpdateConversation(id string, req models.UpdateConversationRequest) error {
	if req.Title != nil {
		_, err := db.conn.Exec("UPDATE conversations SET title=?, updated_at=datetime('now') WHERE id=?", *req.Title, id)
		return err
	}
	return nil
}

func (db *DB) DeleteConversation(id string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM messages WHERE conversation_id = ?", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM conversations WHERE id = ?", id); err != nil {
		return err
	}
	return tx.Commit()
}

func (db *DB) TouchConversation(id string) error {
	_, err := db.conn.Exec("UPDATE conversations SET updated_at=datetime('now') WHERE id=?", id)
	return err
}

// ──────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────

// DeleteMessagesFromID deletes the target message and all subsequent messages
// in the given conversation, using rowid ordering (insertion order) for precision.
func (db *DB) DeleteMessagesFromID(conversationID, messageID string) error {
	// Get the rowid of the target message
	var rowid int64
	err := db.conn.QueryRow(
		"SELECT rowid FROM messages WHERE id = ? AND conversation_id = ?",
		messageID, conversationID,
	).Scan(&rowid)
	if err != nil {
		return fmt.Errorf("message not found: %w", err)
	}

	// Delete all messages at or after this rowid in the conversation
	_, err = db.conn.Exec(
		"DELETE FROM messages WHERE conversation_id = ? AND rowid >= ?",
		conversationID, rowid,
	)
	return err
}

func (db *DB) AddMessage(msg models.Message) error {
	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	ts := msg.CreatedAt
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	_, err := db.conn.Exec("INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		msg.ID, msg.ConversationID, msg.Role, msg.Content, msg.ToolCalls, msg.ToolCallID, msg.Name,
		ts.Format("2006-01-02 15:04:05"))
	return err
}
