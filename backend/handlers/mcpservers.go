package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/camillebizeul/test3/backend/db"
	"github.com/camillebizeul/test3/backend/models"
	"github.com/go-chi/chi/v5"
)

type MCPServerHandler struct {
	DB *db.DB
}

func (h *MCPServerHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.DB.ListMCPServers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.MCPServer{}
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *MCPServerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateMCPServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.Name == "" || req.URL == "" {
		writeError(w, http.StatusBadRequest, "name and url are required")
		return
	}
	s, err := h.DB.CreateMCPServer(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, s)
}

func (h *MCPServerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateMCPServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	s, err := h.DB.UpdateMCPServer(id, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		writeError(w, http.StatusNotFound, "MCP server not found")
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (h *MCPServerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.DB.DeleteMCPServer(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MCPServerHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	srv, err := h.DB.GetMCPServer(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if srv == nil {
		writeError(w, http.StatusNotFound, "MCP server not found")
		return
	}

	mcpClient := mcpNewClient(srv.URL, srv.APIKey, srv.Transport)
	if err := mcpClient.Connect(); err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"tools":   0,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"tools":   len(mcpClient.Tools()),
		"tool_list": mcpClient.Tools(),
	})
}
