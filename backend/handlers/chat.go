package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/camillebizeul/test3/backend/db"
	"github.com/camillebizeul/test3/backend/llm"
	mcpclient "github.com/camillebizeul/test3/backend/mcp"
	"github.com/camillebizeul/test3/backend/models"
	"github.com/google/uuid"
)

type ChatHandler struct {
	DB *db.DB
}

// toolUseLabel generates a concise, readable description of a tool call
// from the tool name and its arguments, without calling the LLM.
func toolUseLabel(toolName string, args map[string]interface{}) string {
	// Collect args as key=value pairs, prioritising human-readable keys first.
	priority := []string{"query", "q", "search", "text", "prompt", "message",
		"partition", "file_id", "path", "url", "id", "name"}

	seen := map[string]bool{}
	var parts []string

	// First pass: priority keys
	for _, k := range priority {
		if v, ok := args[k]; ok {
			parts = append(parts, fmt.Sprintf("%s=%q", k, fmt.Sprintf("%v", v)))
			seen[k] = true
		}
	}

	// Second pass: remaining keys in sorted order (deterministic output)
	remaining := make([]string, 0, len(args))
	for k := range args {
		if !seen[k] {
			remaining = append(remaining, k)
		}
	}
	sort.Strings(remaining)
	for _, k := range remaining {
		v := args[k]
		if v == nil {
			continue // skip null optional params
		}
		parts = append(parts, fmt.Sprintf("%s=%q", k, fmt.Sprintf("%v", v)))
	}

	// Format as "tool_name(key="val", ...)" with a friendly tool name
	friendly := strings.ReplaceAll(toolName, "_", " ")
	if len(parts) == 0 {
		return friendly
	}
	return fmt.Sprintf("%s(%s)", friendly, strings.Join(parts, ", "))
}

// buildLLMHistory converts DB messages into the ChatMessage slice for the LLM,
// filtering out display-only tool_use messages.
func buildLLMHistory(messages []models.Message) []llm.ChatMessage {
	var out []llm.ChatMessage
	for _, m := range messages {
		if m.Role == "tool_use" {
			continue
		}
		content := m.Content
		cm := llm.ChatMessage{
			Role:    m.Role,
			Content: &content,
		}
		if m.ToolCalls != "" {
			cm.ToolCalls = json.RawMessage(m.ToolCalls)
			if m.Role == "assistant" && m.Content == "" {
				cm.Content = nil
			}
		}
		if m.ToolCallID != "" {
			cm.ToolCallID = m.ToolCallID
		}
		if m.Name != "" {
			cm.Name = m.Name
		}
		out = append(out, cm)
	}
	return out
}

// connectMCPs connects to all MCP servers configured on the conversation.
// Returns a slice of connected clients and the merged list of all tools.
// Servers that fail to connect are silently skipped.
func connectMCPs(database *db.DB, conv *models.ConversationWithMessages) ([]*mcpclient.Client, []models.MCPTool) {
	ids := conv.MCPServerIDs
	// Fallback: if the new field is empty but the legacy field is set, use it.
	if len(ids) == 0 && conv.MCPServerID != "" {
		ids = []string{conv.MCPServerID}
	}
	if len(ids) == 0 {
		return nil, nil
	}

	var clients []*mcpclient.Client
	var allTools []models.MCPTool
	for _, id := range ids {
		srv, err := database.GetMCPServer(id)
		if err != nil || srv == nil {
			continue
		}
		cli := mcpNewClient(srv.URL, srv.APIKey, srv.Transport)
		if err := cli.Connect(); err != nil {
			log.Printf("MCP connect error (server %s): %v", id, err)
			continue
		}
		clients = append(clients, cli)
		allTools = append(allTools, cli.Tools()...)
	}
	return clients, allTools
}

func (h *ChatHandler) Send(w http.ResponseWriter, r *http.Request) {
	var req models.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.ConversationID == "" || req.Content == "" {
		writeError(w, http.StatusBadRequest, "conversation_id and content are required")
		return
	}

	conv, err := h.DB.GetConversation(req.ConversationID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if conv == nil {
		writeError(w, http.StatusNotFound, "conversation not found")
		return
	}

	modelCfg, err := h.DB.GetModel(conv.ModelID)
	if err != nil || modelCfg == nil {
		writeError(w, http.StatusBadRequest, "model configuration not found")
		return
	}

	// Save user message
	userMsg := models.Message{
		ID:             uuid.New().String(),
		ConversationID: req.ConversationID,
		Role:           "user",
		Content:        req.Content,
		CreatedAt:      time.Now().UTC(),
	}
	if err := h.DB.AddMessage(userMsg); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Build LLM history (history from DB + new user message)
	chatMessages := buildLLMHistory(conv.Messages)
	userContent := req.Content
	chatMessages = append(chatMessages, llm.ChatMessage{Role: "user", Content: &userContent})

	mcpClients, mcpTools := connectMCPs(h.DB, conv)

	flusher := setupSSE(w)
	if flusher == nil {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	streamCb, toolUseCb, toolResultCb, usageCb, assistantToolCallsCb := sseCallbacks(w, flusher, h.DB, req.ConversationID)

	llmClient := llm.NewClient(*modelCfg)
	fullResponse, _, err := llmClient.SendMessage(r.Context(), chatMessages, mcpTools, mcpClients, streamCb, toolUseCb, toolResultCb, usageCb, assistantToolCallsCb)
	if err != nil {
		// If the request was cancelled (user stopped generation), save whatever
		// partial content was already streamed and close cleanly without an error event.
		if r.Context().Err() != nil {
			if fullResponse != "" {
				assistantMsg := models.Message{
					ID:             uuid.New().String(),
					ConversationID: req.ConversationID,
					Role:           "assistant",
					Content:        fullResponse,
					CreatedAt:      time.Now().UTC(),
				}
				h.DB.AddMessage(assistantMsg)
			}
			return
		}
		errData, _ := json.Marshal(map[string]string{"type": "error", "content": err.Error()})
		fmt.Fprintf(w, "data: %s\n\n", errData)
		flusher.Flush()
		return
	}

	// Save assistant message
	assistantMsg := models.Message{
		ID:             uuid.New().String(),
		ConversationID: req.ConversationID,
		Role:           "assistant",
		Content:        fullResponse,
		CreatedAt:      time.Now().UTC(),
	}
	if err := h.DB.AddMessage(assistantMsg); err != nil {
		log.Printf("Error saving assistant message: %v", err)
	}

	// Update conversation title on first message
	if len(conv.Messages) == 0 {
		title := req.Content
		if len(title) > 50 {
			title = title[:50] + "..."
		}
		h.DB.UpdateConversation(req.ConversationID, models.UpdateConversationRequest{Title: &title})
	}

	h.DB.TouchConversation(req.ConversationID)

	doneData, _ := json.Marshal(map[string]string{"type": "done", "content": fullResponse})
	fmt.Fprintf(w, "data: %s\n\n", doneData)
	flusher.Flush()
}

func (h *ChatHandler) Edit(w http.ResponseWriter, r *http.Request) {
	var req models.EditMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.ConversationID == "" || req.MessageID == "" || req.NewContent == "" {
		writeError(w, http.StatusBadRequest, "conversation_id, message_id and new_content are required")
		return
	}

	conv, err := h.DB.GetConversation(req.ConversationID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if conv == nil {
		writeError(w, http.StatusNotFound, "conversation not found")
		return
	}

	modelCfg, err := h.DB.GetModel(conv.ModelID)
	if err != nil || modelCfg == nil {
		writeError(w, http.StatusBadRequest, "model configuration not found")
		return
	}

	// Delete the target message and everything after it
	if err := h.DB.DeleteMessagesFromID(req.ConversationID, req.MessageID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Reload truncated history
	conv, err = h.DB.GetConversation(req.ConversationID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Save new user message (reuse same ID so the frontend can correlate)
	userMsg := models.Message{
		ID:             req.MessageID,
		ConversationID: req.ConversationID,
		Role:           "user",
		Content:        req.NewContent,
		CreatedAt:      time.Now().UTC(),
	}
	if err := h.DB.AddMessage(userMsg); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Build LLM history (truncated history + edited user message)
	chatMessages := buildLLMHistory(conv.Messages)
	newContent := req.NewContent
	chatMessages = append(chatMessages, llm.ChatMessage{Role: "user", Content: &newContent})

	mcpClients, mcpTools := connectMCPs(h.DB, conv)

	flusher := setupSSE(w)
	if flusher == nil {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	streamCb, toolUseCb, toolResultCb, usageCb, assistantToolCallsCb := sseCallbacks(w, flusher, h.DB, req.ConversationID)

	llmClient := llm.NewClient(*modelCfg)
	fullResponse, _, err := llmClient.SendMessage(r.Context(), chatMessages, mcpTools, mcpClients, streamCb, toolUseCb, toolResultCb, usageCb, assistantToolCallsCb)
	if err != nil {
		// If the request was cancelled (user stopped generation), save partial content.
		if r.Context().Err() != nil {
			if fullResponse != "" {
				assistantMsg := models.Message{
					ID:             uuid.New().String(),
					ConversationID: req.ConversationID,
					Role:           "assistant",
					Content:        fullResponse,
					CreatedAt:      time.Now().UTC(),
				}
				h.DB.AddMessage(assistantMsg)
			}
			return
		}
		errData, _ := json.Marshal(map[string]string{"type": "error", "content": err.Error()})
		fmt.Fprintf(w, "data: %s\n\n", errData)
		flusher.Flush()
		return
	}

	// Save assistant message
	assistantMsg := models.Message{
		ID:             uuid.New().String(),
		ConversationID: req.ConversationID,
		Role:           "assistant",
		Content:        fullResponse,
		CreatedAt:      time.Now().UTC(),
	}
	if err := h.DB.AddMessage(assistantMsg); err != nil {
		log.Printf("Error saving assistant message: %v", err)
	}

	h.DB.TouchConversation(req.ConversationID)

	doneData, _ := json.Marshal(map[string]string{"type": "done", "content": fullResponse})
	fmt.Fprintf(w, "data: %s\n\n", doneData)
	flusher.Flush()
}
