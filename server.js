const express = require('express');
const fs = require('fs');
const path = require('path');
// Authentication and DB modules removed for a simplified version
// use global fetch (Node 18+)

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const RUBRIC_PATH = path.join(__dirname, 'rubric.json');
const SAMPLE_PATH = path.join(__dirname, 'sample-transcripts.json');

let rubric = {};
let samples = [];
try {
  rubric = JSON.parse(fs.readFileSync(RUBRIC_PATH, 'utf8'));
} catch (e) {
  console.warn('Could not load rubric.json — make sure it exists in project root.');
}
try {
  samples = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
} catch (e) {
  console.warn('Could not load sample-transcripts.json — make sure it exists in project root.');
}

function buildPrompt(transcript) {
  // A concise prompt that asks Ollama to return strict JSON for the analysis
  const rubricText = JSON.stringify(rubric);
  return `You are an assistant that converts a supervisor transcript into a structured analysis for a psychology intern.
Input transcript:
"""
${transcript}
"""

Use the following rubric when suggesting a score (1-10):
${rubricText}

Output MUST be valid JSON with the exact top-level keys: evidence, score, kpi_mapping, gaps, follow_up_questions.
Format:
{
  "evidence": [{"quote": "...", "tag": "positive|negative|neutral"}],
  "score": {"value": <int 1-10>, "justification": "one paragraph citing evidence"},
  "kpi_mapping": ["KPI name 1", "KPI name 2"],
  "gaps": ["text description of missing assessment dimensions"],
  "follow_up_questions": ["question 1", "question 2"]
}

Extract 6-10 short quotes as evidence, label each quote as positive/negative/neutral. Provide 3-5 follow-up questions targeting the gaps.
Return only the JSON. Do not add any extra commentary.`;
}

app.post('/api/analyze', async (req, res) => {
  const transcript = req.body.transcript || '';
  const model = req.body.model || 'llama3.2';
  if (!transcript || transcript.trim().length < 20) {
    return res.status(400).json({ error: 'Transcript too short' });
  }

  const prompt = buildPrompt(transcript);

  try {
    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      // 30‑second timeout for Ollama response headers
      timeout: 30000
    });
    const data = await resp.json();
    let text = data.response || data; // Ollama returns .response field
    if (typeof text !== 'string') text = JSON.stringify(text);

    // Try parse JSON directly, otherwise extract first JSON object in text
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        const candidate = text.slice(first, last + 1);
        try { parsed = JSON.parse(candidate); } catch (e2) { parsed = null; }
      }
    }
    if (!parsed) {
      // As a fallback, return the raw text in a wrapper so the frontend can show it
      return res.json({ raw: text });
    }

    // If the model reported an error (e.g., model not found), return a helpful message.
    // Search parsed object for any `error` field.
    function findError(o) {
      if (!o || typeof o !== 'object') return null;
      if (typeof o.error === 'string') return o.error;
      if (typeof o.response === 'string' && o.response.toLowerCase().includes('error')) return o.response;
      for (const k of Object.keys(o)) {
        try {
          const v = o[k];
          if (typeof v === 'string' && v.toLowerCase().includes('model') && v.toLowerCase().includes('not found')) return v;
        } catch (e) {}
      }
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (v && typeof v === 'object') {
          const nested = findError(v);
          if (nested) return nested;
        }
      }
      return null;
    }

    const modelError = findError(parsed);
    if (modelError) {
      return res.status(400).json({ error: `${modelError}. Try: ollama pull ${model}` });
    }

    return res.json({ result: parsed });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to call Ollama. Is it running at http://localhost:11434?' });
  }
});

// Proxy Ollama model list so the frontend can auto-populate available models
app.get('/api/models', async (req, res) => {
  try {
    const resp = await fetch('http://localhost:11434/api/tags');
    const raw = await resp.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      console.warn('Ollama /api/tags returned non-JSON:', raw.slice(0, 120));
      return res.json({ models: [] });
    }

    const models = Array.isArray(data.models) ? data.models : [];
    return res.json({ models });
  } catch (err) {
    console.error('Failed to fetch models from Ollama', err);
    return res.status(500).json({ error: 'Could not fetch models from Ollama. Is Ollama running?' });
  }
});

// Run `ollama pull <model>` optionally. Dangerous to run arbitrary commands; this endpoint
// should only be used locally. Accepts JSON { model: 'llama3.2', run: true }
const { exec } = require('child_process');
app.post('/api/pull-model', async (req, res) => {
  const model = (req.body && req.body.model) ? req.body.model : null;
  const run = req.body && req.body.run;
  if (!model) return res.status(400).json({ error: 'Missing model name' });
  const cmd = `ollama pull ${model}`;
  if (!run) return res.json({ command: cmd });
  // run the command and stream output
  exec(cmd, { timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error('pull error', error);
      return res.status(500).json({ error: stderr || error.message });
    }
    return res.json({ output: stdout || stderr });
  });
});

// Save finalized analysis to disk for review. Accepts JSON body with analysis.
app.post('/api/save', async (req, res) => {
  const analysis = req.body;
  if (!analysis) return res.status(400).json({ error: 'Missing analysis JSON' });
  // In this simplified version we just acknowledge receipt; no DB persistence.
  console.log('Received analysis (not persisted):', analysis);
  return res.json({ message: 'Analysis received' });
});

const BASE_PORT = Number(process.env.PORT || 3000);

// Authentication routes
// Authentication route removed – no login needed in simplified version

function startServer(port, attemptsLeft = 10) {
  const server = app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} is in use, trying ${port + 1}...`);
      server.close(() => startServer(port + 1, attemptsLeft - 1));
      return;
    }
    console.error('Server failed to start:', err.message);
    process.exit(1);
  });
}

startServer(BASE_PORT);
