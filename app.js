// ── Backend URL ──────────────────────────────────────────────────────────────
// Ersetze diese URL mit deiner Render.com URL nach dem Deployment!
const BACKEND_URL = 'https://studyai-backend-gray.vercel.app';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  file: null,
  fileText: '',
  mode: 'flashcards',
  cardCount: 10,
  flashcards: [],
  fcQueue: [],
  fcIndex: 0,
  fcCorrect: 0,
  fcFlipped: false,
  quiz: [],
  quizIndex: 0,
  quizScore: 0,
  quizAnswered: false,
  summaryMarkdown: '',
  sourceName: '',
  backTarget: 'upload',
  pendingSaveMode: null,
  filterSubject: 'all',
  editingSetId: null,
  openedFromSetId: null,
};

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  upload:     $('screen-upload'),
  loading:    $('screen-loading'),
  flashcards: $('screen-flashcards'),
  summary:    $('screen-summary'),
  quiz:       $('screen-quiz'),
  library:    $('screen-library'),
  plan:       $('screen-plan'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
}

// ── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'success', duration = 3000) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), duration);
}

// ── File Upload ──────────────────────────────────────────────────────────────
const uploadZone = $('upload-zone');
const fileInput  = $('file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const allowed = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','image/jpeg','image/png','image/gif','image/webp'
  ];
  if (!allowed.includes(file.type) && !file.name.endsWith('.txt')) {
    toast('Nicht unterstützter Dateityp', 'error');
    return;
  }
  state.file = file;
  showFilePreview(file);
}

function showFilePreview(file) {
  const icons = {
    'application/pdf': '📄',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'text/plain': '📃',
  };
  const icon = file.type.startsWith('image/') ? '🖼️' : (icons[file.type] || '📄');
  const size = file.size < 1024*1024
    ? `${(file.size/1024).toFixed(1)} KB`
    : `${(file.size/1024/1024).toFixed(1)} MB`;

  $('file-preview').innerHTML = `
    <span class="file-icon">${icon}</span>
    <div class="file-info">
      <div class="file-name">${escHtml(file.name)}</div>
      <div class="file-size">${size}</div>
    </div>
    <button class="btn-remove" title="Entfernen">✕</button>
  `;
  $('file-preview').style.display = 'flex';
  uploadZone.style.display = 'none';
  $('file-preview').querySelector('.btn-remove').addEventListener('click', clearFile);
  updateAnalyzeBtn();
}

function clearFile() {
  state.file = null;
  $('file-preview').style.display = 'none';
  uploadZone.style.display = '';
  fileInput.value = '';
  updateAnalyzeBtn();
}

// ── Mode Selection ───────────────────────────────────────────────────────────
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.mode = card.dataset.mode;
  });
});

// ── Difficulty / Card Count ──────────────────────────────────────────────────
document.querySelectorAll('.diff-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.diff-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.cardCount = parseInt(pill.dataset.count);
  });
});

function updateAnalyzeBtn() {
  $('analyze-btn').disabled = !state.file;
}

// ── Analyze ──────────────────────────────────────────────────────────────────
$('analyze-btn').addEventListener('click', async () => {
  if (!state.file) return;
  await analyzeFile();
});

const loadingMessages = [
  'Die KI liest und verarbeitet deinen Inhalt',
  'Wichtige Konzepte werden identifiziert…',
  'Lernmaterial wird erstellt…',
  'Fast fertig…',
];
let loadingMsgInterval = null;

function startLoadingMessages() {
  let i = 0;
  $('loading-sub').textContent = loadingMessages[0];
  loadingMsgInterval = setInterval(() => {
    i = (i + 1) % loadingMessages.length;
    $('loading-sub').textContent = loadingMessages[i];
  }, 2500);
}
function stopLoadingMessages() {
  if (loadingMsgInterval) { clearInterval(loadingMsgInterval); loadingMsgInterval = null; }
}

async function analyzeFile() {
  showScreen('loading');
  startLoadingMessages();
  state.sourceName = state.file?.name || '';
  state.backTarget = 'upload';
  state.openedFromSetId = null;
  try {
    const text = await extractText(state.file);
    const prompt = buildPrompt(state.mode, text, state.cardCount);
    const result = await callBackend(prompt);
    stopLoadingMessages();
    parseAndShow(result, state.mode);
  } catch (err) {
    stopLoadingMessages();
    showScreen('upload');
    toast(err.message || 'Fehler beim Analysieren', 'error', 5000);
    console.error(err);
  }
}

// ── Text Extraction ───────────────────────────────────────────────────────────
async function extractText(file) {
  if (file.type === 'application/pdf') return await extractPdfText(file);
  if (file.type.startsWith('image/')) return '[Bild hochgeladen – bitte nur Textdokumente verwenden für beste Resultate]';
  return await fileToText(file);
}

async function extractPdfText(file) {
  try {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text.trim() || 'Kein Text im PDF gefunden.';
  } catch {
    return await fileToText(file);
  }
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

// ── Prompts ───────────────────────────────────────────────────────────────────
function buildPrompt(mode, text, count = 10) {
  const truncated = text.slice(0, 12000);

  if (mode === 'flashcards') {
    return `Hier ist ein Dokument:

${truncated}

Erstelle genau ${count} Karteikarten zum Lernen aus diesem Inhalt.
Antworte NUR mit einem gültigen JSON-Array (kein Markdown, kein Text davor/danach):
[
  {"front": "Begriff oder Frage", "back": "Erklärung oder Antwort"},
  ...
]
Die Karten sollen die wichtigsten Konzepte, Begriffe und Fakten abdecken.
Antworte auf Deutsch falls das Dokument auf Deutsch ist.`;
  }

  if (mode === 'summary') {
    return `Hier ist ein Dokument:

${truncated}

Erstelle eine strukturierte Lernzusammenfassung aus diesem Inhalt.
Verwende Markdown-Formatierung mit Überschriften (##, ###), Stichpunkten und **fett** für Schlüsselbegriffe.
Gliedere klar nach Themen. Extrahiere die wichtigsten Punkte.
Sei vollständig aber prägnant. Antworte auf Deutsch falls das Dokument auf Deutsch ist.`;
  }

  if (mode === 'quiz') {
    const mc = Math.round(count * 0.4);
    const tf = Math.round(count * 0.3);
    const tx = count - mc - tf;
    return `Hier ist ein Dokument:

${truncated}

Erstelle genau ${count} Quizfragen aus diesem Inhalt. Verwende diese Verteilung: ${mc} mc, ${tf} tf, ${tx} text.

- "mc": Multiple-Choice mit genau 4 Optionen
- "tf": Wahr/Falsch mit genau 2 Optionen ["Wahr","Falsch"]
- "text": Freitext – kurze, klare Musterantwort

Antworte NUR mit einem gültigen JSON-Array (kein Markdown, kein Text davor/danach):
[
  {"type":"mc",   "question":"Frage?",     "options":["A","B","C","D"], "correct":0, "explanation":"..."},
  {"type":"tf",   "question":"Aussage.",   "options":["Wahr","Falsch"], "correct":0, "explanation":"..."},
  {"type":"text", "question":"Erkläre X.", "answer":"Musterantwort",                 "explanation":"..."}
]
"correct" ist der Index (0-basiert) der richtigen Antwort (nur mc und tf).
Antworte auf Deutsch falls das Dokument auf Deutsch ist.`;
  }
}

// ── Backend API Call ──────────────────────────────────────────────────────────
async function callBackend(prompt) {
  const resp = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err.error || `Server Fehler ${resp.status}`;
    if (resp.status === 401) throw new Error('API Key ungültig.');
    if (resp.status === 429) throw new Error('Zu viele Anfragen. Bitte warte kurz.');
    throw new Error(msg);
  }

  const data = await resp.json();
  return data.result;
}

// ── Parse & Show Results ──────────────────────────────────────────────────────
function parseAndShow(raw, mode) {
  if (mode === 'flashcards') {
    try {
      state.flashcards = JSON.parse(extractJson(raw));
      if (!state.flashcards.length) throw new Error();
      initFlashcards();
      showScreen('flashcards');
    } catch {
      toast('Karteikarten konnten nicht gelesen werden – bitte nochmals versuchen', 'error');
      showScreen('upload');
    }
  } else if (mode === 'summary') {
    state.summaryMarkdown = raw;
    showSummary(raw);
    showScreen('summary');
  } else if (mode === 'quiz') {
    try {
      state.quiz = JSON.parse(extractJson(raw));
      if (!state.quiz.length) throw new Error();
      initQuiz();
      showScreen('quiz');
    } catch {
      toast('Quiz konnte nicht gelesen werden – bitte nochmals versuchen', 'error');
      showScreen('upload');
    }
  }
}

function extractJson(text) {
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON');
  return text.slice(start, end + 1);
}

// ── Flashcards ────────────────────────────────────────────────────────────────
function initFlashcards() {
  state.fcQueue   = [...state.flashcards.keys()];
  state.fcIndex   = 0;
  state.fcCorrect = 0;
  state.fcFlipped = false;
  renderFlashcard();
}

function renderFlashcard() {
  const container = $('fc-container');

  if (state.fcIndex >= state.fcQueue.length) {
    const pct = Math.round((state.fcCorrect / state.flashcards.length) * 100);
    container.innerHTML = `
      <div class="fc-result">
        <div class="score-ring">${pct}%</div>
        <h2>Runde abgeschlossen!</h2>
        <p>Du hast ${state.fcCorrect} von ${state.flashcards.length} Karten richtig beantwortet.</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
          <button class="btn-secondary" onclick="initFlashcards()">↺ Neu starten</button>
          <button class="btn-primary" onclick="showScreen('upload')">Neue Datei</button>
        </div>
      </div>`;
    recordStats('flashcards', { correct: state.fcCorrect, total: state.flashcards.length });
    return;
  }

  const card  = state.flashcards[state.fcQueue[state.fcIndex]];
  const total = state.flashcards.length;
  const done  = state.fcIndex;
  const pct   = total > 0 ? (done / total) * 100 : 0;
  state.fcFlipped = false;

  container.innerHTML = `
    <div class="fc-progress-row">
      <span>${done + 1} / ${total}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span>${state.fcCorrect} ✓</span>
    </div>
    <div class="flashcard-scene" id="fc-scene">
      <div class="flashcard" id="fc-card">
        <div class="flashcard-face front">
          <div class="card-label">Begriff</div>
          <div class="card-text">${escHtml(card.front)}</div>
          <div class="card-hint">Tippe zum Umdrehen</div>
        </div>
        <div class="flashcard-face back">
          <div class="card-label">Erklärung</div>
          <div class="card-text">${escHtml(card.back)}</div>
        </div>
      </div>
    </div>
    <div class="flashcard-actions" id="fc-actions" class="fc-actions" style="display:none">
      <button class="btn-wrong" onclick="fcAnswer(false)">✗ Nochmal</button>
      <button class="btn-secondary" onclick="fcFlip()">↩ Zurückdrehen</button>
      <button class="btn-correct" onclick="fcAnswer(true)">✓ Gewusst</button>
    </div>
    <div id="fc-flip-hint" class="fc-flip-hint">
      <button class="btn-primary" onclick="fcFlip()">Karte umdrehen</button>
    </div>
  `;
  $('fc-scene').addEventListener('click', fcFlip);
}

function fcFlip() {
  const card = $('fc-card');
  if (!card) return;
  state.fcFlipped = !state.fcFlipped;
  card.classList.toggle('flipped', state.fcFlipped);
  $('fc-actions').style.display = state.fcFlipped ? 'flex' : 'none';
  $('fc-flip-hint').style.display = state.fcFlipped ? 'none' : '';
}

function fcAnswer(correct) {
  if (correct) {
    state.fcCorrect++;
    state.fcIndex++;
  } else {
    const idx = state.fcQueue[state.fcIndex];
    state.fcQueue.push(idx);
    state.fcIndex++;
  }
  renderFlashcard();
}

// ── Summary ───────────────────────────────────────────────────────────────────
function showSummary(markdown) {
  $('summary-content').innerHTML = marked.parse(markdown);
}
$('summary-export').addEventListener('click', () => window.print());

// ── Quiz ──────────────────────────────────────────────────────────────────────
function initQuiz() {
  state.quizIndex    = 0;
  state.quizScore    = 0;
  state.quizAnswered = false;
  renderQuestion();
}

function renderQuestion() {
  const body = $('quiz-body');

  if (state.quizIndex >= state.quiz.length) {
    const pct = Math.round((state.quizScore / state.quiz.length) * 100);
    body.innerHTML = `
      <div class="quiz-result">
        <div class="score-display">${state.quizScore}/${state.quiz.length}</div>
        <div class="score-label">${pct}% richtig</div>
        <div class="score-bar-wrap">
          <div class="score-bar-fill" style="width:0%" id="score-bar"></div>
        </div>
        <p style="color:var(--text-2);margin-bottom:1.5rem">${scoreMsg(pct)}</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
          <button class="btn-secondary" onclick="initQuiz()">↺ Wiederholen</button>
          <button class="btn-primary" onclick="showScreen('upload')">Neue Datei</button>
        </div>
      </div>`;
    setTimeout(() => { const b = $('score-bar'); if (b) b.style.width = pct + '%'; }, 100);
    recordStats('quiz', { score: state.quizScore, total: state.quiz.length });
    return;
  }

  const q    = state.quiz[state.quizIndex];
  const type = q.type || 'mc';
  state.quizAnswered = false;

  const nav = `
    <div class="quiz-nav">
      <span style="color:var(--text-2);font-size:13px">Punkte: ${state.quizScore}</span>
    </div>`;

  if (type === 'text') {
    body.innerHTML = `
      <div class="quiz-question-card">
        <div class="quiz-q-meta"><div class="quiz-q-num">Frage ${state.quizIndex + 1} von ${state.quiz.length}
          <span class="quiz-type-badge">✍️ Freitext</span></div>
        <div class="quiz-q-text">${escHtml(q.question)}</div>
        <textarea class="quiz-text-input" id="quiz-text-input"
          placeholder="Deine Antwort…" rows="4"></textarea>
        <button class="quiz-text-submit" id="quiz-text-submit">Antworten →</button>
        <div id="quiz-feedback"></div>
      </div>${nav}`;
    $('quiz-text-submit').addEventListener('click', () => revealTextAnswer(q));
    $('quiz-text-input').addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) revealTextAnswer(q); });
  } else {
    const letters = ['A','B','C','D'];
    body.innerHTML = `
      <div class="quiz-question-card">
        <div class="quiz-q-meta"><div class="quiz-q-num">Frage ${state.quizIndex + 1} von ${state.quiz.length}
          ${type === 'tf' ? '<span class="quiz-type-badge">✅ Wahr/Falsch</span>' : ''}</div>
        <div class="quiz-q-text">${escHtml(q.question)}</div>
        <div class="quiz-options ${type === 'tf' ? 'quiz-options-tf' : ''}">
          ${q.options.map((opt, i) => `
            <button class="quiz-option${type === 'tf' ? ' quiz-option-tf' : ''}" onclick="quizAnswer(${i})" id="opt-${i}">
              ${type === 'mc' ? `<span class="option-letter">${letters[i]}</span>` : ''}
              ${escHtml(opt)}
            </button>`).join('')}
        </div>
        <div id="quiz-feedback"></div>
      </div>${nav}`;
  }
}

function revealTextAnswer(q) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;
  const inputEl  = $('quiz-text-input');
  const submitEl = $('quiz-text-submit');
  if (inputEl)  inputEl.disabled = true;
  if (submitEl) submitEl.style.display = 'none';

  $('quiz-feedback').innerHTML = `
    <div class="quiz-feedback text-reveal">
      <div class="text-answer-label">📖 Musterlösung</div>
      <div class="text-answer-content">${escHtml(q.answer || '')}</div>
      ${q.explanation ? `<div class="text-answer-hint">${escHtml(q.explanation)}</div>` : ''}
      <div class="text-self-assess">
        <p>Wie gut war deine Antwort?</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
          <button class="btn-wrong" onclick="quizAnswerSelf(false)">✗ Nicht gewusst</button>
          <button class="btn-correct" onclick="quizAnswerSelf(true)">✓ Gewusst</button>
        </div>
      </div>
    </div>`;
}

function quizAnswerSelf(correct) {
  if (correct) state.quizScore++;
  quizNext();
}

function quizAnswer(chosen) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;
  const q = state.quiz[state.quizIndex];

  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correct) btn.classList.add('correct');
    else if (i === chosen) btn.classList.add('wrong');
  });

  const fb = $('quiz-feedback');
  const nav = document.querySelector('.quiz-nav');
  const isLast = state.quizIndex === state.quiz.length - 1;

  if (chosen === q.correct) {
    state.quizScore++;
    fb.innerHTML = `<div class="quiz-feedback correct">✓ Richtig! ${escHtml(q.explanation || '')}</div>`;
  } else {
    fb.innerHTML = `<div class="quiz-feedback wrong">✗ Falsch. Richtig: <strong>${escHtml(q.options[q.correct])}</strong>. ${escHtml(q.explanation || '')}</div>`;
  }

  nav.innerHTML += `<button class="btn-primary" onclick="quizNext()">${isLast ? 'Ergebnis ansehen' : 'Nächste Frage'} →</button>`;
}

function quizNext() { state.quizIndex++; renderQuestion(); }

function scoreMsg(pct) {
  if (pct >= 90) return 'Ausgezeichnet! Du kennst das Thema sehr gut.';
  if (pct >= 70) return 'Gut gemacht! Ein paar Details noch wiederholen.';
  if (pct >= 50) return 'Nicht schlecht, aber noch Luft nach oben.';
  return 'Weitermachen! Noch mehr lernen und wiederholen.';
}

// ── Back Buttons ──────────────────────────────────────────────────────────────
function goBack() {
  const active = Object.keys(screens).find(k => screens[k].classList.contains('active'));
  if (active === 'library' || active === 'plan') { showScreen('upload'); return; }
  showScreen(state.backTarget || 'upload');
}
document.querySelectorAll('.btn-back').forEach(btn => btn.addEventListener('click', goBack));

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// Bibliothek
// ══════════════════════════════════════════════════════════════════════════════
const LIB_KEY          = 'studyai_library_v1';
const LAST_SUBJECT_KEY = 'studyai_last_subject';
const MODE_INFO = {
  flashcards: { icon: '🗂️', label: 'Karteikarten' },
  summary:    { icon: '📝', label: 'Lernzettel' },
  quiz:       { icon: '🎯', label: 'Quiz' },
};

function loadLibrary() { try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch { return []; } }
function persistLibrary(sets) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(sets)); return true; }
  catch { toast('Speicher voll oder nicht verfügbar', 'error'); return false; }
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function getSubjects() { return [...new Set(loadLibrary().map(s => s.subject).filter(Boolean))]; }

const saveBackdrop = $('save-backdrop');

function hasContent(mode) {
  if (mode === 'flashcards') return state.flashcards.length > 0;
  if (mode === 'quiz')       return state.quiz.length > 0;
  if (mode === 'summary')    return !!state.summaryMarkdown;
  return false;
}

function openSaveModal(mode) {
  if (!hasContent(mode)) { toast('Nichts zum Speichern vorhanden', 'error'); return; }
  state.pendingSaveMode = mode;
  const baseName = (state.sourceName || '').replace(/\.[^.]+$/, '').trim();
  $('save-title').value   = baseName || MODE_INFO[mode].label;
  $('save-subject').value = localStorage.getItem(LAST_SUBJECT_KEY) || '';
  $('subject-list').innerHTML = getSubjects().map(s => `<option value="${escHtml(s)}">`).join('');
  saveBackdrop.classList.add('open');
  $('save-title').focus();
  $('save-title').select();
}

function closeSaveModal() {
  saveBackdrop.classList.remove('open');
  state.pendingSaveMode = null;
  state.editingSetId    = null;
  saveBackdrop.querySelector('h3').textContent = '💾 Lernset speichern';
  saveBackdrop.querySelector('p').textContent  = 'Das Lernset wird lokal in deinem Browser gespeichert.';
  $('save-confirm').textContent = 'Speichern';
}

function confirmSave() {
  const title   = $('save-title').value.trim();
  const subject = $('save-subject').value.trim() || 'Allgemein';

  if (state.editingSetId) {
    const lib = loadLibrary().map(s => s.id === state.editingSetId ? { ...s, title: title || s.title, subject } : s);
    if (persistLibrary(lib)) { localStorage.setItem(LAST_SUBJECT_KEY, subject); closeSaveModal(); toast('Lernset aktualisiert ✓'); renderLibrary(); }
    return;
  }

  const mode = state.pendingSaveMode;
  if (!mode) return;

  const set = {
    id: genId(), title: title || MODE_INFO[mode].label, subject, mode,
    createdAt: Date.now(), sourceName: state.sourceName || '',
    flashcards: mode === 'flashcards' ? state.flashcards : null,
    quiz:       mode === 'quiz'       ? state.quiz       : null,
    summary:    mode === 'summary'    ? state.summaryMarkdown : null,
  };
  const lib = loadLibrary();
  lib.push(set);
  if (persistLibrary(lib)) { localStorage.setItem(LAST_SUBJECT_KEY, subject); closeSaveModal(); toast('In Bibliothek gespeichert ✓'); }
}

document.querySelectorAll('.btn-save').forEach(btn => btn.addEventListener('click', () => openSaveModal(btn.dataset.mode)));
$('save-cancel').addEventListener('click', closeSaveModal);
$('save-confirm').addEventListener('click', confirmSave);
saveBackdrop.addEventListener('click', e => { if (e.target === saveBackdrop) closeSaveModal(); });
$('save-title').addEventListener('keydown', e => { if (e.key === 'Enter') confirmSave(); });

// ── Bibliothek rendern ────────────────────────────────────────────────────────
function renderLibrary() {
  const allSets  = loadLibrary().sort((a,b) => b.createdAt - a.createdAt);
  const filterBar = $('library-filter-bar');
  const subjects  = [...new Set(allSets.map(s => s.subject).filter(Boolean))].sort();

  if (subjects.length > 1) {
    filterBar.innerHTML = [
      `<button class="filter-pill${state.filterSubject === 'all' ? ' active' : ''}" data-subj="all">Alle (${allSets.length})</button>`,
      ...subjects.map(sub => {
        const count  = allSets.filter(s => s.subject === sub).length;
        const active = state.filterSubject === sub ? ' active' : '';
        return `<button class="filter-pill${active}" data-subj="${escHtml(sub)}">${escHtml(sub)} (${count})</button>`;
      }),
    ].join('');
    filterBar.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => { state.filterSubject = pill.dataset.subj; renderLibrary(); });
    });
  } else {
    filterBar.innerHTML = '';
    state.filterSubject = 'all';
  }

  const sets = state.filterSubject === 'all' ? allSets : allSets.filter(s => s.subject === state.filterSubject);
  const grid = $('library-grid');

  if (!allSets.length) {
    grid.innerHTML = `
      <div class="library-empty">
        <div class="empty-icon">📚</div>
        <h3>Noch keine Lernsets gespeichert</h3>
        <p>Analysiere ein Dokument und klicke auf „💾 Speichern".</p>
        <button class="btn-primary" onclick="showScreen('upload')">⚡ Dokument analysieren</button>
      </div>`;
    return;
  }

  if (!sets.length) {
    grid.innerHTML = `
      <div class="library-empty">
        <div class="empty-icon">🔍</div>
        <h3>Keine Sets in diesem Fach</h3>
        <p>Wähle ein anderes Fach oder speichere ein neues Set.</p>
      </div>`;
    return;
  }

  grid.innerHTML = sets.map(set => {
    const info  = MODE_INFO[set.mode] || { icon: '📄', label: 'Lernset' };
    let count   = info.label;
    if (set.mode === 'flashcards')  count = `${set.flashcards?.length || 0} Karten`;
    else if (set.mode === 'quiz')   count = `${set.quiz?.length || 0} Fragen`;
    else if (set.mode === 'summary') count = 'Zusammenfassung';
    const date = new Date(set.createdAt).toLocaleDateString('de-CH', { day:'2-digit', month:'2-digit', year:'numeric' });
    return `
      <div class="library-card" data-id="${set.id}">
        <div class="lib-card-top">
          <div class="lib-card-icon">${info.icon}</div>
          <div class="lib-card-titles">
            <div class="lib-card-title">${escHtml(set.title)}</div>
            <div class="lib-card-type">${escHtml(info.label)} · ${escHtml(count)}</div>
          </div>
        </div>
        <div class="lib-card-meta">
          <span class="subject-badge">${escHtml(set.subject)}</span>
          <span class="lib-card-date">${date}</span>
          <div class="lib-card-actions">
            <button class="lib-card-action-btn edit" data-edit="${set.id}" title="Bearbeiten">✏️</button>
            <button class="lib-card-action-btn delete" data-del="${set.id}" title="Löschen">🗑️</button>
          </div>
        </div>
        ${getStatsSummary(set) ? `<div class="lib-card-stats-row">${getStatsSummary(set)}</div>` : ''}
      </div>`;
  }).join('');

  grid.querySelectorAll('.library-card').forEach(card => {
    card.addEventListener('click', e => { if (e.target.closest('.lib-card-action-btn')) return; openSet(card.dataset.id); });
  });
  grid.querySelectorAll('.lib-card-action-btn.edit').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.edit)));
  grid.querySelectorAll('.lib-card-action-btn.delete').forEach(btn => btn.addEventListener('click', () => deleteSet(btn.dataset.del)));
}

function openSet(id) {
  const set = loadLibrary().find(s => s.id === id);
  if (!set) { toast('Lernset nicht gefunden', 'error'); return; }
  state.backTarget = 'library';
  state.sourceName = set.sourceName || '';
  state.openedFromSetId = set.id;
  if (set.mode === 'flashcards') { state.flashcards = set.flashcards || []; initFlashcards(); showScreen('flashcards'); }
  else if (set.mode === 'quiz')  { state.quiz = set.quiz || []; initQuiz(); showScreen('quiz'); }
  else if (set.mode === 'summary') { state.summaryMarkdown = set.summary || ''; showSummary(state.summaryMarkdown); showScreen('summary'); }
}

function deleteSet(id) {
  const set = loadLibrary().find(s => s.id === id);
  if (!set) return;
  if (!confirm(`„${set.title}" wirklich löschen?`)) return;
  persistLibrary(loadLibrary().filter(s => s.id !== id));
  renderLibrary();
  toast('Lernset gelöscht');
}

function openEditModal(id) {
  const set = loadLibrary().find(s => s.id === id);
  if (!set) return;
  state.editingSetId    = id;
  state.pendingSaveMode = null;
  $('save-title').value   = set.title;
  $('save-subject').value = set.subject || '';
  $('subject-list').innerHTML = getSubjects().map(s => `<option value="${escHtml(s)}">`).join('');
  saveBackdrop.querySelector('h3').textContent = '✏️ Lernset bearbeiten';
  saveBackdrop.querySelector('p').textContent  = 'Titel und Fach ändern und speichern.';
  $('save-confirm').textContent = 'Aktualisieren';
  saveBackdrop.classList.add('open');
  $('save-title').focus();
  $('save-title').select();
}

$('logo-home').addEventListener('click', () => showScreen('upload'));
$('nav-library').addEventListener('click', () => { state.filterSubject = 'all'; renderLibrary(); showScreen('library'); });
$('lib-new').addEventListener('click', () => showScreen('upload'));

// ══════════════════════════════════════════════════════════════════════════════
// Statistiken
// ══════════════════════════════════════════════════════════════════════════════
function recordStats(mode, data) {
  const id = state.openedFromSetId;
  if (!id) return;
  const lib = loadLibrary().map(s => {
    if (s.id !== id) return s;
    const stats = s.stats || { flashcardRuns: [], quizRuns: [] };
    const entry = { date: new Date().toISOString(), ...data };
    if (mode === 'flashcards') stats.flashcardRuns = [...(stats.flashcardRuns || []), entry];
    if (mode === 'quiz')       stats.quizRuns      = [...(stats.quizRuns      || []), entry];
    return { ...s, stats };
  });
  persistLibrary(lib);
}

function getStatsSummary(set) {
  const stats = set.stats || {};
  if (set.mode === 'flashcards') {
    const runs = stats.flashcardRuns || [];
    if (!runs.length) return '';
    const last  = runs[runs.length - 1];
    const pct   = Math.round((last.correct / last.total) * 100);
    const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
    return `<span class="lib-card-stat" style="color:${color}">⚡ Letzte Runde: ${last.correct}/${last.total} (${pct}%)</span>`;
  }
  if (set.mode === 'quiz') {
    const runs = stats.quizRuns || [];
    if (!runs.length) return '';
    const last  = runs[runs.length - 1];
    const pct   = Math.round((last.score / last.total) * 100);
    const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
    return `<span class="lib-card-stat" style="color:${color}">⚡ Letztes Quiz: ${last.score}/${last.total} (${pct}%)</span>`;
  }
  return '';
}

// ══════════════════════════════════════════════════════════════════════════════
// Pomodoro Timer
// ══════════════════════════════════════════════════════════════════════════════
const timerPanel = $('timer-panel');
let timerInterval = null;
let timerSeconds  = 25 * 60;
let timerRunning  = false;

function timerFormat(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

function timerRender() {
  $('timer-display').textContent = timerFormat(timerSeconds);
  $('timer-toggle').textContent  = timerRunning ? '⏸ Pause' : '▶ Start';
}

function timerTick() {
  if (timerSeconds <= 0) {
    clearInterval(timerInterval); timerInterval = null; timerRunning = false;
    $('timer-display').textContent = '00:00';
    $('timer-toggle').textContent  = '▶ Start';
    toast('⏰ Zeit abgelaufen!', 'success', 5000);
    return;
  }
  timerSeconds--;
  timerRender();
}

$('timer-toggle').addEventListener('click', () => {
  if (timerRunning) { clearInterval(timerInterval); timerInterval = null; timerRunning = false; }
  else { timerRunning = true; timerInterval = setInterval(timerTick, 1000); }
  timerRender();
});
$('timer-reset').addEventListener('click', () => {
  clearInterval(timerInterval); timerInterval = null; timerRunning = false;
  const active = timerPanel.querySelector('.timer-mode-btn.active');
  timerSeconds = (active ? parseInt(active.dataset.minutes) : 25) * 60;
  timerRender();
});
$('timer-close').addEventListener('click', () => { timerPanel.style.display = 'none'; });
$('nav-timer').addEventListener('click', () => {
  timerPanel.style.display = timerPanel.style.display === 'none' ? 'block' : 'none';
});
timerPanel.querySelectorAll('.timer-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    timerPanel.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    clearInterval(timerInterval); timerInterval = null; timerRunning = false;
    timerSeconds = parseInt(btn.dataset.minutes) * 60;
    const labels = { '25':'🍅 Lernen', '5':'☕ Kurze Pause', '10':'🌿 Lange Pause' };
    $('timer-mode-label').textContent = labels[btn.dataset.minutes] || '⏱️ Timer';
    timerRender();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Lernplan
// ══════════════════════════════════════════════════════════════════════════════
const PLAN_KEY = 'studyai_plan_v1';
function loadPlan()        { try { return JSON.parse(localStorage.getItem(PLAN_KEY)) || []; } catch { return []; } }
function persistPlan(plan) { try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch { toast('Speicher voll', 'error'); } }

const planBackdrop = $('plan-backdrop');
function openPlanModal()  { $('plan-title').value = ''; $('plan-date').value = new Date().toISOString().slice(0,10); planBackdrop.classList.add('open'); $('plan-title').focus(); }
function closePlanModal() { planBackdrop.classList.remove('open'); }

$('plan-add-btn').addEventListener('click', openPlanModal);
$('plan-cancel').addEventListener('click', closePlanModal);
planBackdrop.addEventListener('click', e => { if (e.target === planBackdrop) closePlanModal(); });

$('plan-confirm').addEventListener('click', () => {
  const title = $('plan-title').value.trim();
  const date  = $('plan-date').value;
  if (!title) { toast('Bitte einen Titel eingeben', 'error'); return; }
  const plan = loadPlan();
  plan.push({ id: genId(), title, targetDate: date, completed: false, createdAt: Date.now() });
  persistPlan(plan);
  closePlanModal();
  renderPlan();
  toast('Lernziel hinzugefügt ✓');
});
$('plan-title').addEventListener('keydown', e => { if (e.key === 'Enter') $('plan-confirm').click(); });

function renderPlan() {
  const body    = $('plan-body');
  const items   = loadPlan().sort((a,b) => a.targetDate.localeCompare(b.targetDate));
  const today   = new Date().toISOString().slice(0,10);
  const weekEnd = new Date(Date.now() + 7*24*3600*1000).toISOString().slice(0,10);

  const groups = [
    { label:'🔴 Überfällig',  filter: i => !i.completed && i.targetDate < today },
    { label:'📅 Heute',       filter: i => !i.completed && i.targetDate === today },
    { label:'📆 Diese Woche', filter: i => !i.completed && i.targetDate > today && i.targetDate <= weekEnd },
    { label:'🔮 Später',      filter: i => !i.completed && i.targetDate > weekEnd },
    { label:'✅ Erledigt',     filter: i => i.completed },
  ];

  if (!items.length) {
    body.innerHTML = `
      <div class="plan-empty">
        <div class="empty-icon">📅</div>
        <h3>Noch keine Lernziele</h3>
        <p>Klicke auf „+ Ziel", um loszulegen.</p>
      </div>`;
    return;
  }

  body.innerHTML = groups.map(g => {
    const list = items.filter(g.filter);
    if (!list.length) return '';
    return `
      <div class="plan-group">
        <h3 class="plan-group-title">${g.label}</h3>
        ${list.map(item => `
          <div class="plan-item${item.completed ? ' completed' : ''}">
            <input type="checkbox" class="plan-check" data-id="${item.id}" ${item.completed ? 'checked' : ''}>
            <div class="plan-item-body">
              <div class="plan-item-title">${escHtml(item.title)}</div>
              <div class="plan-item-date">Fällig: ${formatPlanDate(item.targetDate)}</div>
            </div>
            <button class="lib-card-action-btn delete plan-delete" data-id="${item.id}" title="Löschen">🗑️</button>
          </div>`).join('')}
      </div>`;
  }).join('');

  body.querySelectorAll('.plan-check').forEach(cb => {
    cb.addEventListener('change', () => {
      persistPlan(loadPlan().map(i => i.id === cb.dataset.id ? { ...i, completed: cb.checked } : i));
      renderPlan();
    });
  });
  body.querySelectorAll('.plan-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Lernziel löschen?')) return;
      persistPlan(loadPlan().filter(i => i.id !== btn.dataset.id));
      renderPlan();
    });
  });
}

function formatPlanDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

$('nav-plan').addEventListener('click', () => { renderPlan(); showScreen('plan'); });

// ── Init ──────────────────────────────────────────────────────────────────────
showScreen('upload');
