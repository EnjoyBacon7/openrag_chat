package handlers

import (
	"encoding/json"
	"net/http"

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
