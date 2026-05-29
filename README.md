# Trinethra — Supervisor Feedback Analyzer

Local web app that sends a supervisor transcript to a local Ollama model and returns a structured analysis (evidence, rubric score, KPI mapping, gaps, follow-up questions).

Quick start

1. Install Node.js (18+ recommended).
2. Install dependencies:

```bash
npm install
```

3. Install and run Ollama, and pull a model (example using `llama3.2`):

```bash
# install from https://ollama.com and follow platform instructions
ollama pull llama3.2
# Ollama runs as a background service after install
```

4. Start the app:

```bash
npm start
# open http://localhost:3000 in your browser
```

Notes

- Ollama model used: `llama3.2` (3B) — chosen because it runs on most laptops and produces reliable structured outputs for our prompt. Use a different model if you prefer.
- Backend: `server.js` (Node + Express) — serves the static frontend and exposes `POST /api/analyze` which forwards a carefully formatted prompt to Ollama's local API at `http://localhost:11434/api/generate`.
- Frontend: `public/index.html` + `public/app.js` — simple UI for pasting transcripts, loading sample transcripts, and reviewing AI output.
 - The frontend includes a model selector so you can pick which Ollama model to use. If the chosen model isn't installed Ollama will return an error and the backend suggests the command `ollama pull <model>`.
 - The frontend auto-populates the model dropdown from your local Ollama (`GET /api/models`) and lets you type a custom model. The UI persists the last-used model in `localStorage`.
 - Evidence items are editable in the UI; click "Download Final JSON" to export the corrected analysis for review.
 - You can auto-pull a model from the UI using the "Auto Pull Model" button (it calls `ollama pull <model>` on the host). This runs the shell command locally — only use it on your machine.
 - After editing findings, click "Save Final Analysis" to persist the JSON to `analyses/` in the project root. Files are saved with the fellow's name and timestamp.

Design decisions and challenges tackled

- One prompt vs many: I used a single, structured prompt that asks the model to return strict JSON with fixed keys. This keeps latency low and the flow simple for an intern.
- Structured output reliability: The backend attempts to parse JSON strictly; if parsing fails it extracts the first JSON object from the model output as a fallback and returns `raw` if parsing still fails so the user can see model output.

What to improve with more time

- Add a multi-step pipeline (extract quotes -> score -> gaps) to improve robustness and allow validation at each step.
- Add UI controls to accept/reject and edit findings before saving.
- Add retries and a lightweight schema validator for stricter guarantees.

Recording the required videos

- App demo: start Ollama, run `npm start`, paste a sample transcript, click "Run Analysis" and narrate the sections.
- Code walkthrough: show `server.js` prompt design, how parsing is handled, and the frontend flow.# Supervisor Feedback Analyzer (Trinethra)

## Overview
This repository contains a **local web application** that assists DeepThought interns in analysing supervisor transcripts. It:
- Accepts a raw transcript via a clean UI.
- Sends the transcript to a locally‑running Ollama LLM.
- Returns a structured analysis (evidence, rubric score, KPI mapping, gaps, follow‑up questions).
- Lets the intern review, edit and export the draft.

The solution is split into a **React‑Vite frontend** and a **Node/Express backend**. All communication happens locally – no cloud APIs.

## Tech Stack
- **Frontend**: React + Vite, vanilla CSS with glass‑morphism styling, Google Font *Inter*.
- **Backend**: Node.js, Express, `node-fetch` for HTTP calls to Ollama.
- **LLM**: Ollama (any model, e.g., `llama3.2`).

## Setup Instructions
1. **Prerequisites**
   - Node.js (v20+) installed.
   - **Ollama** installed and running (`ollama serve`).
   - Pull an LLM model, e.g.:
     ```bash
     ollama pull llama3.2
     ```
2. **Clone the repo** (or use the existing folder).
3. **Install dependencies**
   ```bash
   # Frontend
   cd frontend && npm install
   # Backend
   cd ../backend && npm install
   ```
4. **Start the backend**
   ```bash
   cd backend && npm run dev
   ```
   The server will listen on `http://localhost:4000`.
5. **Start the frontend**
   ```bash
   cd frontend && npm run dev
   ```
   Open the displayed URL (usually `http://localhost:5173`).
6. **Use the app**
   - Paste a supervisor transcript into the textarea.
   - Click **Run Analysis**.
   - Review the generated sections, edit if needed, and copy/export the result.

## Architecture Overview
```
User (browser) ↔ Frontend (React) ↔ Backend (Express) ↔ Ollama (local LLM)
```
- The frontend sends the transcript via `POST /analyze`.
- The backend builds a prompt (including rubric, KPI definitions) and calls Ollama's `/api/generate` endpoint.
- The LLM returns a JSON‑structured analysis which the backend validates and forwards to the UI.

## Design Challenges Tackled
- **Prompt engineering** – single‑prompt approach with explicit JSON schema to improve structured output.
- **Robust JSON parsing** – fallback to regex extraction and retry on malformed responses.
- **Evidence linking** – each evidence quote is displayed with a clickable highlight that scrolls to the corresponding transcript excerpt.

## Future Improvements
- Implement **multiple‑prompt** strategy for higher precision (evidence extraction → scoring → gap analysis).
- Add **offline caching** of recent analyses.
- Provide **export to PDF** for easy sharing with supervisors.

---
**License**: MIT
