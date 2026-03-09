package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/camillebizeul/test3/backend/db"
	"github.com/camillebizeul/test3/backend/llm"
	mcpclient "github.com/camillebizeul/test3/backend/mcp"
	"github.com/camillebizeul/test3/backend/models"
	"github.com/google/uuid"
)

// mcpNewClient is a package-level helper so it can be used from multiple handler files.
var mcpNewClient = func(serverURL, apiKey, transport string) *mcpclient.Client {
	return mcpclient.NewClient(serverURL, apiKey, transport)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// setupSSE writes the SSE headers and returns the http.Flusher.
// Returns nil if the ResponseWriter does not support flushing.
func setupSSE(w http.ResponseWriter) http.Flusher {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	f, ok := w.(http.Flusher)
	if !ok {
		return nil
	}
	return f
}

// sseCallbacks builds the three LLM callbacks (stream, tool_use, tool_result)
// that write SSE events to w and persist messages to the DB.
// writeFailed is set to true the first time a write to the client fails (i.e. client disconnected).
func sseCallbacks(
	w http.ResponseWriter,
	flusher http.Flusher,
	database *db.DB,
	conversationID string,
) (llm.StreamCallback, llm.ToolUseCallback, llm.ToolResultCallback) {

	streamCb := func(text string) {
		data, _ := json.Marshal(map[string]string{"type": "chunk", "content": text})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	toolUseCb := func(toolCallID string, toolName string, args map[string]interface{}) {
		label := toolUseLabel(toolName, args)
		argsJSON, _ := json.Marshal(args)

		type toolUsePayload struct {
			Tool       string          `json:"tool"`
			Label      string          `json:"label"`
			Args       json.RawMessage `json:"args"`
			ToolCallID string          `json:"tool_call_id"`
		}
		payload := toolUsePayload{
			Tool:       toolName,
			Label:      label,
			Args:       json.RawMessage(argsJSON),
			ToolCallID: toolCallID,
		}
		contentJSON, _ := json.Marshal(payload)

		msg := models.Message{
			ID:             uuid.New().String(),
			ConversationID: conversationID,
			Role:           "tool_use",
			Content:        string(contentJSON),
			CreatedAt:      time.Now().UTC(),
		}
		if err := database.AddMessage(msg); err != nil {
			log.Printf("Error saving tool_use message: %v", err)
		}

		data, _ := json.Marshal(map[string]interface{}{
			"type":         "tool_use",
			"tool":         toolName,
			"label":        label,
			"args":         args,
			"msg_id":       msg.ID,
			"tool_call_id": toolCallID,
		})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	toolResultCb := func(toolCallID string, toolName string, result string) {
		msg := models.Message{
			ID:             uuid.New().String(),
			ConversationID: conversationID,
			Role:           "tool",
			Content:        result,
			ToolCallID:     toolCallID,
			Name:           toolName,
			CreatedAt:      time.Now().UTC(),
		}
		if err := database.AddMessage(msg); err != nil {
			log.Printf("Error saving tool result message: %v", err)
		}
		data, _ := json.Marshal(map[string]interface{}{
			"type":         "tool_result",
			"tool":         toolName,
			"tool_call_id": toolCallID,
			"msg_id":       msg.ID,
		})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	return streamCb, toolUseCb, toolResultCb
}
