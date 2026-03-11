package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/camillebizeul/test3/backend/db"
	"github.com/camillebizeul/test3/backend/models"
	"github.com/go-chi/chi/v5"
)

type ModelHandler struct {
	DB *db.DB
}

func (h *ModelHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.DB.ListModels()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.ModelConfig{}
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *ModelHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateModelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.Name == "" || req.BaseURL == "" || req.ModelID == "" {
		writeError(w, http.StatusBadRequest, "name, base_url, and model_id are required")
		return
	}
	m, err := h.DB.CreateModel(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (h *ModelHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateModelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	m, err := h.DB.UpdateModel(id, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if m == nil {
		writeError(w, http.StatusNotFound, "model not found")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (h *ModelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.DB.DeleteModel(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Discover proxies GET {base_url}/models to the upstream provider and returns
// the list of available model IDs sorted alphabetically.
func (h *ModelHandler) Discover(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BaseURL string `json:"base_url"`
		APIKey  string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.BaseURL == "" {
		writeError(w, http.StatusBadRequest, "base_url is required")
		return
	}

	baseURL := strings.TrimRight(req.BaseURL, "/")
	url := fmt.Sprintf("%s/models", baseURL)

	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid base_url")
		return
	}
	apiKey := req.APIKey
	if apiKey == "" {
		apiKey = "not-needed"
	}
	upstream.Header.Set("Authorization", "Bearer "+apiKey)
	upstream.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(upstream)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("could not reach endpoint: %v", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("upstream returned %d", resp.StatusCode))
		return
	}

	// OpenAI-compatible list response: {"object":"list","data":[{"id":"..."},...]}
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadGateway, "could not parse upstream response")
		return
	}

	ids := make([]string, 0, len(body.Data))
	for _, m := range body.Data {
		if m.ID != "" {
			ids = append(ids, m.ID)
		}
	}
	sort.Strings(ids)

	writeJSON(w, http.StatusOK, ids)
}
