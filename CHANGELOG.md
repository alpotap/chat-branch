# Changelog

All notable changes to ChatBranch are documented in this file.

## [Unreleased]

### Added

- **Ollama support for host-installed models.** The backend can now talk to an Ollama instance
  running on the Docker host. Models are selected as `ollama/<name>` and bypass the
  `USE_DUMMY_RESPONSES` switch since they need no API key.
  - `LLMService.list_ollama_models()` queries `GET /api/tags` on the Ollama server.
  - `LLMService._call_ollama()` sends chat completions to `POST /api/chat` (non-streaming).
  - New endpoint `GET /models/ollama` returns the installed models, the configured base URL,
    and reachability status.
  - Configurable via `OLLAMA_BASE_URL` (default `http://host.docker.internal:11434`) and
    `OLLAMA_TIMEOUT` (default 300 seconds).
- **Ollama models in the UI.** The model dropdown shows an "Ollama (local)" group populated from
  the backend, and the Manage Models dialog lists them with a "Refresh Ollama Models" button.
- **Collapsible conversations sidebar.** A toggle in the sidebar header collapses the panel to a
  thin strip; the state is persisted in `localStorage`.
- **Markdown rendering for assistant responses.** LLM output is rendered with `react-markdown`
  plus `remark-gfm` (headings, lists, tables, code blocks, blockquotes) instead of plain text.
  User prompts keep their literal formatting.
- **Copy to clipboard.** Every message bubble (prompts and responses) has a copy button that
  appears on hover/selection and confirms with a "Copied" state.
- **Fast navigation to the newest message.** The chat view now jumps straight to the bottom when a
  conversation, branch, or tree node is opened, and a floating scroll-to-bottom button appears
  whenever you scroll more than 200px away from the latest message.
- `backend/.env.example` now documents the Ollama settings.

### Changed

- **Much denser UI.** Header, sidebar, chat bubbles, inputs, modals, context menus and branch
  controls were rebuilt with minimal padding, smaller fonts and tighter gaps to reclaim screen
  space:
  - Header padding reduced from `1rem 2rem` to `0.25rem 0.6rem`, title from `1.8rem` to `1rem`,
    undo/redo buttons from 32px to 22px.
  - Sidebar width 250px → 210px, item padding `0.75rem` → `0.35rem 0.5rem`.
  - Message bubbles padding `1rem` → `0.45rem 0.6rem`, spacing `1rem` → `0.35rem`,
    max width 70% → 78%.
  - Input area, modals, pagination and context menus scaled down accordingly.
  - Removed the hover "lift" transforms that caused layout jitter on dense lists.
- `docker-compose.yml`: the backend now receives `OLLAMA_BASE_URL` and an
  `extra_hosts: host.docker.internal:host-gateway` mapping so the container can reach the host.
- `DOCKER_README.md`: documented the env-file bootstrap step, the Ollama host setup
  (`OLLAMA_HOST=0.0.0.0:11434`), and the port 5432 conflict workaround.

### Fixed

- **`docker compose up --build` failed on a fresh clone** with
  `env file backend/.env not found`. The env file is git-ignored, so Compose aborted before any
  service started. `backend/.env` is now created from the template and the `env_file` entry is
  marked `required: false` so a missing file no longer blocks startup. The stack does not depend
  on a locally installed PostgreSQL — the `postgres` container provides the database and Compose
  overrides `DATABASE_URL` accordingly.

### Dependencies

- Added `react-markdown` ^9.0.1 and `remark-gfm` ^4.0.0 to the frontend.
