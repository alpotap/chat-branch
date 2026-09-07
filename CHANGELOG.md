# Changelog

All notable changes to ChatBranch are documented in this file.

## [Unreleased]

### Added

- **New conversation from the full context.** A tree right-click action that copies the selected
  message plus every ancestor - across all intermediate branches - into a new conversation
  (`POST /conversations/{id}/messages/{message_id}/duplicate-full`). The existing
  "from branch" action is unchanged.
- **Sidebar folders.** Conversations can be grouped into folders. Folders and conversations both
  have an editable name and color, folders can be collapsed, and everything can be dragged to
  reorder or to move a conversation between folders. Layout is stored server-side
  (`folders` table, `conversations.folder_id/color/position`) via `/folders`,
  `PATCH /conversations/{id}/organize` and `PUT /sidebar/order`.
- **Resizable sidebar.** Drag the right edge of the conversation panel; the width is remembered.
- **Collapsed, branch-level tree view.** The tree now renders one node per branch showing the
  branch name, its rating and an excerpt of the latest response. A `＋` button between the branch
  title and the excerpt expands that branch into its individual messages (`－` collapses again).
  Branch-to-branch links are always drawn, so the branch structure is never hidden - only the
  messages inside a single thread are collapsed.
- **Branch ratings (5 stars).** Branches can be scored 0-5. The rating is shown on top of the first
  node of each branch in the tree view and can be set by clicking the stars next to the branch name
  in the chat header or from the tree context menu. New `branches.rating` column and
  `PATCH /conversations/{id}/branches/{name}/rating`.
- **Summaries.** Summarize a single message (chat view button / right-click) or a whole branch
  (chat header button / tree right-click). The LLM result is appended as a summary message titled
  `Summary of <conversation> <branch>` and rendered with a faded yellow background.
  New `messages.is_summary` column and `POST .../messages/{id}/summarize` and
  `POST .../branches/{name}/summarize`.
- **New conversation from a branch.** Copies the branch plus everything it inherits from its parent
  branches into a fresh conversation via `POST /conversations/{id}/branches/{name}/duplicate`.
- **Editable AI responses.** Assistant messages can be edited without regenerating anything; the
  edited text is what subsequent turns in the branch send as context (useful for pruning noise).
  New `PUT /conversations/{id}/messages/{id}/content`.
- **Inline message actions.** The right-click actions (branch, regenerate, regenerate in place,
  edit, summarize, delete, copy) are now also available as a button row at the bottom of each
  message bubble.
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

- **The selected LLM model is remembered** across restarts (`localStorage`) instead of resetting to
  the demo model.
- Database schema upgrades (`is_summary`, `rating`, folder columns) are applied automatically at
  startup by `apply_schema_upgrades()` in `backend/database/init_tables.py`.
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

- **The whole page was slightly scrollable at every window size.** The app used `height: 100vh`
  while the browser's default `body { margin: 8px }` was still in place, making the layout 16px
  taller than the viewport. Added a reset for `html/body/#root` and switched the shell to
  `height: 100%`.
- **`docker compose up --build` failed on a fresh clone** with
  `env file backend/.env not found`. The env file is git-ignored, so Compose aborted before any
  service started. `backend/.env` is now created from the template and the `env_file` entry is
  marked `required: false` so a missing file no longer blocks startup. The stack does not depend
  on a locally installed PostgreSQL — the `postgres` container provides the database and Compose
  overrides `DATABASE_URL` accordingly.

### Dependencies

- Added `react-markdown` ^9.0.1 and `remark-gfm` ^4.0.0 to the frontend.
