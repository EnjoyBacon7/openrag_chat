package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/camillebizeul/test3/backend/db"
	"github.com/camillebizeul/test3/backend/handlers"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	// Database
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "chatui.db"
	}

	database, err := db.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	// Handlers
	modelH := &handlers.ModelHandler{DB: database}
	mcpH := &handlers.MCPServerHandler{DB: database}
	convH := &handlers.ConversationHandler{DB: database}
	chatH := &handlers.ChatHandler{DB: database}

	// Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:8080"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Health check
		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"ok":true}`)) //nolint:errcheck
		})

		// Models
		r.Get("/models", modelH.List)
		r.Post("/models", modelH.Create)
		r.Put("/models/{id}", modelH.Update)
		r.Delete("/models/{id}", modelH.Delete)

		// MCP Servers
		r.Get("/mcp-servers", mcpH.List)
		r.Post("/mcp-servers", mcpH.Create)
		r.Put("/mcp-servers/{id}", mcpH.Update)
		r.Delete("/mcp-servers/{id}", mcpH.Delete)
		r.Post("/mcp-servers/{id}/test", mcpH.TestConnection)

		// Conversations
		r.Get("/conversations", convH.List)
		r.Post("/conversations", convH.Create)
		r.Get("/conversations/{id}", convH.Get)
		r.Patch("/conversations/{id}", convH.Update)
		r.Delete("/conversations/{id}", convH.Delete)

		// Chat
		r.Post("/chat/send", chatH.Send)
		r.Post("/chat/edit", chatH.Edit)
	})

	// Serve static frontend files (production build)
	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "../frontend/dist"
	}

	// Check if static dir exists
	if info, err := os.Stat(staticDir); err == nil && info.IsDir() {
		fileServer(r, "/", http.Dir(staticDir))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// fileServer serves static files and falls back to index.html for SPA routing.
func fileServer(r chi.Router, path string, root http.FileSystem) {
	if path != "/" && path[len(path)-1] != '/' {
		r.Get(path, http.RedirectHandler(path+"/", http.StatusMovedPermanently).ServeHTTP)
		path += "/"
	}

	r.Get(path+"*", func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.RouteContext(r.Context())
		pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
		fs := http.StripPrefix(pathPrefix, http.FileServer(root))

		// Try to serve the file directly
		requestedPath := strings.TrimPrefix(r.URL.Path, pathPrefix)
		if requestedPath == "" || requestedPath == "/" {
			requestedPath = "/index.html"
		}

		// Check if file exists
		absPath := filepath.Join(string(root.(http.Dir)), filepath.FromSlash(requestedPath))
		if _, err := os.Stat(absPath); os.IsNotExist(err) {
			// SPA fallback - serve index.html
			http.ServeFile(w, r, filepath.Join(string(root.(http.Dir)), "index.html"))
			return
		}

		fs.ServeHTTP(w, r)
	})
}
