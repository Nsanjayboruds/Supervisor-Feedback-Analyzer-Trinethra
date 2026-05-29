async function analyze(transcript, model = 'llama3.2') {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, model })
  });
  return res.json();
}

function el(id) {
  return document.getElementById(id);
}

function makeCard(title, subtitle) {
  const card = document.createElement('section');
  card.className = 'result-card';

  const header = document.createElement('div');
  header.className = 'result-title';

  const left = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = title;
  left.appendChild(h3);
  if (subtitle) {
    const p = document.createElement('p');
    p.className = 'panel-subtitle';
    p.style.margin = '6px 0 0';
    p.textContent = subtitle;
    left.appendChild(p);
  }

  header.appendChild(left);
  card.appendChild(header);
  return card;
}

const state = {
  lastRequest: null,
  lastRendered: null
};

const modelSelect = el('model');
const modelInput = el('modelInput');
const statusEl = el('status');
const outputEl = el('output');

function setStatus(msg) {
  statusEl.textContent = msg || '';
}

function currentModel() {
  const value = (modelInput && modelInput.value ? modelInput.value : '').trim();
  return value || 'llama3.2';
}

function syncModelInputFromSelect() {
  const selected = modelSelect.value;
  if (selected === 'custom') {
    modelInput.focus();
    return;
  }
  modelInput.value = selected;
}

function renderEmptyState() {
  outputEl.innerHTML = '';
  const card = document.createElement('section');
  card.className = 'empty-state';
  card.innerHTML = '<h2>No analysis yet</h2><p>Run a transcript through Ollama to see evidence, score, KPI mapping, gaps, and follow-up questions.</p>';
  outputEl.appendChild(card);
}

function escapeForText(value) {
  return value == null ? '' : String(value);
}

function modelNameForItem(item) {
  return typeof item === 'string' ? item : (item && (item.name || item.id)) ? (item.name || item.id) : String(item);
}

function normalizeModelChoice(preferred, models) {
  const available = Array.isArray(models) ? models.map(modelNameForItem) : [];
  if (!preferred) return available[0] || 'llama3.2';
  if (available.includes(preferred)) return preferred;

  const base = preferred.split(':')[0];
  const exactBase = available.find((model) => model.split(':')[0] === base);
  if (exactBase) return exactBase;

  const prefixMatch = available.find((model) => model.startsWith(`${base}:`));
  if (prefixMatch) return prefixMatch;

  return available[0] || preferred;
}

async function loadModels() {
  try {
    const resp = await fetch('/api/models');
    const js = await resp.json();
    if (js.error) throw new Error(js.error);

    const list = Array.isArray(js.models) ? js.models : [];
    const modelNames = list.map(modelNameForItem);
    const stored = localStorage.getItem('trinethra_last_model') || currentModel();
    const existingModel = modelSelect.value;
    const resolvedStored = normalizeModelChoice(stored, modelNames);

    modelSelect.innerHTML = '';

    modelNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      modelSelect.appendChild(option);
    });

    if (stored && !Array.from(modelSelect.options).some((option) => option.value === stored)) {
      const option = document.createElement('option');
      option.value = stored;
      option.textContent = `${stored} (last used)`;
      modelSelect.appendChild(option);
    }

    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom...';
    modelSelect.appendChild(customOption);

    const nextValue = Array.from(modelSelect.options).some((option) => option.value === resolvedStored)
      ? resolvedStored
      : (Array.from(modelSelect.options).some((option) => option.value === existingModel) ? existingModel : stored);

    modelSelect.value = nextValue;
    modelInput.value = nextValue !== 'custom' ? nextValue : modelInput.value;
  } catch (error) {
    console.warn('Could not load models from backend', error);
  }
}

function renderPullSuggestion(cmd) {
  const card = makeCard('Model missing', 'Pull the requested Ollama model locally and retry the analysis.');
  const pre = document.createElement('pre');
  pre.textContent = cmd;
  card.appendChild(pre);
  outputEl.prepend(card);
}

function renderRaw(raw) {
  outputEl.innerHTML = '';
  const card = makeCard('Raw model output', 'The model response could not be parsed into structured JSON.');
  const pre = document.createElement('pre');
  pre.textContent = raw;
  card.appendChild(pre);
  outputEl.appendChild(card);
}

function renderResult(data) {
  state.lastRendered = data;
  outputEl.innerHTML = '';

  if (!data || data.raw) {
    renderRaw(data && data.raw ? data.raw : JSON.stringify(data || {}, null, 2));
    return;
  }

  const exportBar = document.createElement('section');
  exportBar.className = 'result-card';
  const bar = document.createElement('div');
  bar.className = 'export-bar';

  const left = document.createElement('div');
  const title = document.createElement('h3');
  title.style.margin = '0';
  title.textContent = 'Final review workspace';
  const subtitle = document.createElement('div');
  subtitle.className = 'panel-subtitle';
  subtitle.style.marginTop = '6px';
  subtitle.textContent = 'Edit findings directly, then export or save the reviewed analysis.';
  left.appendChild(title);
  left.appendChild(subtitle);

  const actions = document.createElement('div');
  actions.className = 'export-actions';

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Download Final JSON';
  exportBtn.addEventListener('click', () => {
    const final = collectEditedResult(data);
    const blob = new Blob([JSON.stringify(final, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.textContent = 'Save Final Analysis';
  saveBtn.addEventListener('click', () => el('saveFinal').click());

  actions.appendChild(exportBtn);
  actions.appendChild(saveBtn);
  bar.appendChild(left);
  bar.appendChild(actions);
  exportBar.appendChild(bar);
  outputEl.appendChild(exportBar);

  const scoreValue = data.score && data.score.value != null ? data.score.value : '';
  const scoreJustification = data.score && data.score.justification ? data.score.justification : '';
  const evidenceCount = Array.isArray(data.evidence) ? data.evidence.length : 0;
  const kpiCount = Array.isArray(data.kpi_mapping) ? data.kpi_mapping.length : 0;
  const gapCount = Array.isArray(data.gaps) ? data.gaps.length : 0;
  const followUpCount = Array.isArray(data.follow_up_questions) ? data.follow_up_questions.length : 0;

  const metrics = document.createElement('section');
  metrics.className = 'result-card';
  const metricsGrid = document.createElement('div');
  metricsGrid.className = 'metrics';
  [
    ['Evidence', evidenceCount],
    ['Score', scoreValue || '—'],
    ['KPI links', kpiCount],
    ['Follow-ups', followUpCount || gapCount]
  ].forEach(([label, value]) => {
    const metric = document.createElement('div');
    metric.className = 'metric';
    const small = document.createElement('span');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    metric.appendChild(small);
    metric.appendChild(strong);
    metricsGrid.appendChild(metric);
  });
  metrics.appendChild(metricsGrid);
  outputEl.appendChild(metrics);

  const evidenceCard = makeCard('Extracted Evidence', 'Edit quotes, tag each finding, and mark items accepted by the intern.');
  const evidenceList = document.createElement('div');
  evidenceList.className = 'cards';

  (data.evidence || []).forEach((evidence, index) => {
    const item = document.createElement('div');
    item.className = 'evidence-item';
    item.dataset.idx = String(index);

    const head = document.createElement('div');
    head.className = 'evidence-head';

    const left = document.createElement('div');
    const indexLabel = document.createElement('div');
    indexLabel.className = 'evidence-index';
    indexLabel.textContent = `Evidence ${index + 1}`;
    const quote = document.createElement('div');
    quote.className = 'panel-subtitle';
    quote.style.marginTop = '6px';
    quote.textContent = 'Quote';
    left.appendChild(indexLabel);
    left.appendChild(quote);

    const tagChip = document.createElement('span');
    tagChip.className = 'tag-chip';
    tagChip.textContent = evidence.tag || 'neutral';
    head.appendChild(left);
    head.appendChild(tagChip);

    const textarea = document.createElement('textarea');
    textarea.value = escapeForText(evidence.quote);
    textarea.dataset.idx = String(index);

    const inline = document.createElement('div');
    inline.className = 'inline-row';

    const select = document.createElement('select');
    select.dataset.idx = String(index);
    ['positive', 'negative', 'neutral'].forEach((optionValue) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue;
      if (optionValue === evidence.tag) option.selected = true;
      select.appendChild(option);
    });

    const toggle = document.createElement('label');
    toggle.className = 'toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = evidence.accepted !== false;
    checkbox.dataset.idx = String(index);
    const toggleText = document.createTextNode('Accepted');
    toggle.appendChild(checkbox);
    toggle.appendChild(toggleText);

    inline.appendChild(select);
    inline.appendChild(toggle);

    item.appendChild(head);
    item.appendChild(textarea);
    item.appendChild(inline);
    evidenceList.appendChild(item);
  });

  evidenceCard.appendChild(evidenceList);
  outputEl.appendChild(evidenceCard);

  const scoreCard = makeCard('Rubric Score', 'Adjust the score and justification before saving the final review.');
  const scoreGrid = document.createElement('div');
  scoreGrid.className = 'subgrid';

  const scoreField = document.createElement('div');
  const scoreLabel = document.createElement('label');
  scoreLabel.className = 'field-label';
  scoreLabel.textContent = 'Score';
  const scoreInput = document.createElement('input');
  scoreInput.type = 'number';
  scoreInput.min = '1';
  scoreInput.max = '10';
  scoreInput.value = scoreValue;
  scoreInput.id = 'scoreValue';
  scoreField.appendChild(scoreLabel);
  scoreField.appendChild(scoreInput);

  const justField = document.createElement('div');
  const justLabel = document.createElement('label');
  justLabel.className = 'field-label';
  justLabel.textContent = 'Justification';
  const justInput = document.createElement('textarea');
  justInput.id = 'scoreJust';
  justInput.value = scoreJustification;
  justInput.style.minHeight = '140px';
  justField.appendChild(justLabel);
  justField.appendChild(justInput);

  scoreGrid.appendChild(scoreField);
  scoreGrid.appendChild(justField);
  scoreCard.appendChild(scoreGrid);
  outputEl.appendChild(scoreCard);

  const infoGrid = document.createElement('section');
  infoGrid.className = 'subgrid';

  const kpiCard = makeCard('KPI Mapping', 'Mapped KPIs are listed as editable references for the intern.');
  const kpiContent = document.createElement('div');
  if ((data.kpi_mapping || []).length) {
    const list = document.createElement('ul');
    list.className = 'list';
    (data.kpi_mapping || []).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    kpiContent.appendChild(list);
  } else {
    kpiContent.textContent = 'No KPI mapping returned.';
    kpiContent.className = 'panel-subtitle';
  }
  kpiCard.appendChild(kpiContent);

  const gapCard = makeCard('Gap Analysis', 'Areas for improvement extracted from the transcript.');
  const gapContent = document.createElement('div');
  if ((data.gaps || []).length) {
    const list = document.createElement('ul');
    list.className = 'list';
    (data.gaps || []).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    gapContent.appendChild(list);
  } else {
    gapContent.textContent = 'No gaps were returned.';
    gapContent.className = 'panel-subtitle';
  }
  gapCard.appendChild(gapContent);

  infoGrid.appendChild(kpiCard);
  infoGrid.appendChild(gapCard);
  outputEl.appendChild(infoGrid);

  const followCard = makeCard('Suggested Follow-up Questions', 'Use these questions for the next coaching conversation.');
  const followContent = document.createElement('div');
  if ((data.follow_up_questions || []).length) {
    const list = document.createElement('ol');
    list.className = 'list';
    (data.follow_up_questions || []).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    followContent.appendChild(list);
  } else {
    followContent.textContent = 'No follow-up questions were returned.';
    followContent.className = 'panel-subtitle';
  }
  followCard.appendChild(followContent);
  outputEl.appendChild(followCard);
}

function collectEditedResult(original) {
  const result = { ...original };
  const rows = Array.from(outputEl.querySelectorAll('.evidence-item'));

  result.evidence = rows.map((row) => {
    const textarea = row.querySelector('textarea');
    const select = row.querySelector('select');
    const checkbox = row.querySelector('input[type="checkbox"]');
    return {
      quote: textarea ? textarea.value : '',
      tag: select ? select.value : 'neutral',
      accepted: checkbox ? !!checkbox.checked : true
    };
  });

  const scoreValue = el('scoreValue');
  const scoreJust = el('scoreJust');
  result.score = {
    value: scoreValue ? Number(scoreValue.value) : null,
    justification: scoreJust ? scoreJust.value : ''
  };

  return result;
}

el('run').addEventListener('click', async () => {
  const transcript = el('transcript').value.trim();
  if (!transcript) return alert('Paste a transcript first');

  setStatus('Analyzing transcript...');
  outputEl.innerHTML = '';

  try {
    const model = currentModel();
    localStorage.setItem('trinethra_last_model', model);
    state.lastRequest = { transcript, model };
    const response = await analyze(transcript, model);
    setStatus('');

    if (response.error) {
      setStatus(`Error: ${response.error}`);
      if (String(response.error).toLowerCase().includes('try: ollama pull')) {
        const pullCmd = String(response.error).split('Try:').pop().trim();
        renderPullSuggestion(pullCmd);
      }
      return;
    }

    const data = response.result || (response.raw ? { raw: response.raw } : response);
    renderResult(data);
  } catch (error) {
    setStatus('Request failed');
    console.error(error);
  }
});

el('loadSample').addEventListener('click', async () => {
  try {
    const resp = await fetch('/sample-transcripts.json');
    const js = await resp.json();
    const list = Array.isArray(js) ? js : (js.transcripts || []);
    if (list.length) {
      el('transcript').value = list[0].transcript || JSON.stringify(list[0], null, 2);
    } else {
      el('transcript').value = JSON.stringify(js, null, 2);
    }
    setStatus('Loaded sample transcript.');
  } catch (error) {
    alert('Could not load sample transcripts from sample-transcripts.json');
  }
});

el('retry').addEventListener('click', async () => {
  if (!state.lastRequest) return alert('No request to retry');

  setStatus('Retrying last request...');
  try {
    const response = await analyze(state.lastRequest.transcript, state.lastRequest.model);
    setStatus('');
    if (response.error) {
      setStatus(`Error: ${response.error}`);
      return;
    }
    const data = response.result || (response.raw ? { raw: response.raw } : response);
    renderResult(data);
  } catch (error) {
    setStatus('Retry failed');
    console.error(error);
  }
});

el('showPull').addEventListener('click', async () => {
  const model = currentModel();
  const cmd = `ollama pull ${model}`;
  try {
    await navigator.clipboard.writeText(cmd);
    setStatus(`Copied ${cmd}`);
  } catch (error) {
    prompt('Run this command in your terminal to pull the model:', cmd);
  }
});

el('autoPull').addEventListener('click', async () => {
  const model = currentModel();
  setStatus(`Pulling model ${model}...`);
  try {
    const resp = await fetch('/api/pull-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, run: true })
    });
    const js = await resp.json();
    if (js.error) {
      setStatus(`Pull failed: ${js.error}`);
      return;
    }
    setStatus(`Pull finished for ${model}`);
    const card = makeCard('Model pull', 'Recent pull output from Ollama.');
    const pre = document.createElement('pre');
    pre.textContent = js.output || JSON.stringify(js, null, 2);
    card.appendChild(pre);
    outputEl.prepend(card);
    loadModels();
  } catch (error) {
    setStatus('Pull request failed');
    console.error(error);
  }
});

el('saveFinal').addEventListener('click', async () => {
  try {
    const original = state.lastRendered || {};
    const final = collectEditedResult(original);
    final.transcript = state.lastRequest ? state.lastRequest.transcript : (final.transcript || '');
    final.model = state.lastRequest ? state.lastRequest.model : (final.model || '');

    const resp = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(final)
    });
    const js = await resp.json();
    if (js.error) {
      setStatus(`Save failed: ${js.error}`);
      return;
    }
    setStatus(`Saved: ${js.path}`);
    const card = makeCard('Saved', 'Your final analysis has been written to disk.');
    const link = document.createElement('div');
    link.className = 'panel-subtitle';
    link.style.marginTop = '8px';
    link.textContent = js.path;
    card.appendChild(link);
    outputEl.prepend(card);
  } catch (error) {
    setStatus('Save failed');
    console.error(error);
  }
});

modelSelect.addEventListener('change', syncModelInputFromSelect);
modelInput.addEventListener('input', () => {
  if (modelSelect.value !== 'custom') {
    modelSelect.value = 'custom';
  }
});

const storedModel = localStorage.getItem('trinethra_last_model') || 'llama3.2';
modelInput.value = storedModel;

loadModels();
renderEmptyState();
setStatus('Ready.');
