// ── Backend URL ──────────────────────────────────────────────────────────────
const BACKEND_URL = 'https://studyai-backend-gray.vercel.app';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  file: null, fileText: '',
  mode: 'flashcards', cardCount: 10, lang: 'auto',
  flashcards: [], fcQueue: [], fcIndex: 0, fcCorrect: 0, fcFlipped: false,
  fcDifficulty: {}, // cardIndex → 'easy'|'medium'|'hard'
  quiz: [], quizIndex: 0, quizScore: 0, quizAnswered: false,
  quizWrong: [], // store wrong answers for weakness summary
  summaryMarkdown: '', sourceName: '',
  backTarget: 'upload', pendingSaveMode: null,
  filterSubject: 'all', editingSetId: null, openedFromSetId: null,
  touchStartX: 0, touchStartY: 0,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  upload: $('screen-upload'), loading: $('screen-loading'),
  flashcards: $('screen-flashcards'), summary: $('screen-summary'),
  quiz: $('screen-quiz'), library: $('screen-library'),
  plan: $('screen-plan'), dashboard: $('screen-dashboard'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
  $('kb-hint').style.display = name === 'flashcards' ? 'flex' : 'none';
  if (name === 'upload') updateHeroStats();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success', dur = 3000) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), dur);
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────
let isLight = localStorage.getItem('studyai_theme') === 'light';
function applyTheme() {
  document.body.classList.toggle('light', isLight);
  localStorage.setItem('studyai_theme', isLight ? 'light' : 'dark');
}
applyTheme();
$('nav-theme').addEventListener('click', () => { isLight = !isLight; applyTheme(); toast(isLight ? '☀️ Helles Theme' : '🌙 Dunkles Theme'); });

// ── Streak & Stats ────────────────────────────────────────────────────────────
const STREAK_KEY = 'studyai_streak_v1';

function getStreak() {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastDate: null }; } catch { return { count: 0, lastDate: null }; }
}

function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const s = getStreak();
  if (s.lastDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s.lastDate === yesterday) { s.count++; } else if (s.lastDate !== today) { s.count = 1; }
  s.lastDate = today;
  localStorage.setItem(STREAK_KEY, JSON.stringify(s));
  updateStreakUI();
}

function updateStreakUI() {
  const s = getStreak();
  $('streak-num').textContent = s.count;
  $('stat-streak').textContent = s.count;
}

function updateHeroStats() {
  const lib = loadLibrary();
  $('stat-total-sets').textContent = lib.length;
  const sessions = lib.reduce((acc, s) => acc + (s.stats?.flashcardRuns?.length || 0) + (s.stats?.quizRuns?.length || 0), 0);
  $('stat-total-sessions').textContent = sessions;
  updateStreakUI();
}

// ── File Upload ───────────────────────────────────────────────────────────────
const uploadZone = $('upload-zone');
const fileInput = $('file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

function handleFile(file) {
  const allowed = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png','image/gif','image/webp'];
  if (!allowed.includes(file.type) && !file.name.endsWith('.txt')) { toast('Nicht unterstützter Dateityp', 'error'); return; }
  state.file = file; showFilePreview(file);
}

function showFilePreview(file) {
  const icons = { 'application/pdf':'📄','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'📝','text/plain':'📃' };
  const icon = file.type.startsWith('image/') ? '🖼️' : (icons[file.type] || '📄');
  const size = file.size < 1048576 ? `${(file.size/1024).toFixed(1)} KB` : `${(file.size/1048576).toFixed(1)} MB`;
  $('file-preview').innerHTML = `
    <span class="file-icon">${icon}</span>
    <div class="file-info"><div class="file-name">${escHtml(file.name)}</div><div class="file-size">${size}</div></div>
    <button class="btn-remove" title="Entfernen">✕</button>`;
  $('file-preview').style.display = 'flex';
  uploadZone.style.display = 'none';
  $('file-preview').querySelector('.btn-remove').addEventListener('click', clearFile);
  updateAnalyzeBtn();
}

function clearFile() {
  state.file = null; $('file-preview').style.display = 'none';
  uploadZone.style.display = ''; fileInput.value = ''; updateAnalyzeBtn();
}

// ── Mode & Options ────────────────────────────────────────────────────────────
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected'); state.mode = card.dataset.mode;
  });
});
document.querySelectorAll('.opt-pill[data-count]').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.opt-pill[data-count]').forEach(p => p.classList.remove('active'));
    pill.classList.add('active'); state.cardCount = parseInt(pill.dataset.count);
  });
});
document.querySelectorAll('.opt-pill[data-lang]').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.opt-pill[data-lang]').forEach(p => p.classList.remove('active'));
    pill.classList.add('active'); state.lang = pill.dataset.lang;
  });
});

function updateAnalyzeBtn() { $('analyze-btn').disabled = !state.file; }

// ── Analyze ───────────────────────────────────────────────────────────────────
$('analyze-btn').addEventListener('click', async () => { if (state.file) await analyzeFile(); });

const loadingMsgs = ['Die KI liest deinen Inhalt…','Wichtige Konzepte werden erkannt…','Lernmaterial wird erstellt…','Fast fertig…'];
let loadingInterval = null;

async function analyzeFile() {
  showScreen('loading');
  let i = 0; $('loading-sub').textContent = loadingMsgs[0];
  loadingInterval = setInterval(() => { i = (i+1) % loadingMsgs.length; $('loading-sub').textContent = loadingMsgs[i]; }, 2500);
  state.sourceName = state.file?.name || ''; state.backTarget = 'upload'; state.openedFromSetId = null;
  try {
    const text = await extractText(state.file);
    const prompt = buildPrompt(state.mode, text, state.cardCount, state.lang);
    const result = await callBackend(prompt);
    clearInterval(loadingInterval);
    updateStreak();
    parseAndShow(result, state.mode);
  } catch (err) {
    clearInterval(loadingInterval);
    showScreen('upload'); toast(err.message || 'Fehler beim Analysieren', 'error', 5000);
  }
}

// ── Text Extraction ───────────────────────────────────────────────────────────
async function extractText(file) {
  if (file.type === 'application/pdf') return await extractPdfText(file);
  if (file.type.startsWith('image/')) return '[Bild hochgeladen – bitte Textdokumente für beste Resultate verwenden]';
  return await fileToText(file);
}
async function extractPdfText(file) {
  try {
    if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text.trim() || 'Kein Text gefunden.';
  } catch { return await fileToText(file); }
}
function fileToText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsText(file, 'utf-8');
  });
}

// ── Prompts ───────────────────────────────────────────────────────────────────
function buildPrompt(mode, text, count = 10, lang = 'auto') {
  const truncated = text.slice(0, 12000);
  const langInstr = lang === 'auto' ? 'Antworte in der gleichen Sprache wie das Dokument.' : lang === 'de' ? 'Antworte auf Deutsch.' : 'Answer in English.';

  if (mode === 'flashcards') return `Hier ist ein Dokument:\n\n${truncated}\n\nErstelle genau ${count} Karteikarten. ${langInstr}\nAntworte NUR mit gültigem JSON-Array:\n[{"front":"Begriff/Frage","back":"Erklärung/Antwort"},...]`;

  if (mode === 'summary') return `Hier ist ein Dokument:\n\n${truncated}\n\nErstelle eine strukturierte Lernzusammenfassung mit Markdown (##, ###, **fett**, Stichpunkte). ${langInstr}`;

  if (mode === 'quiz') {
    const mc = Math.round(count*0.4), tf = Math.round(count*0.3), tx = count-mc-tf;
    return `Hier ist ein Dokument:\n\n${truncated}\n\nErstelle genau ${count} Quizfragen (${mc} mc, ${tf} tf, ${tx} text). ${langInstr}\nAntworte NUR mit gültigem JSON-Array:\n[{"type":"mc","question":"?","options":["A","B","C","D"],"correct":0,"explanation":"..."},{"type":"tf","question":"Aussage.","options":["Wahr","Falsch"],"correct":0,"explanation":"..."},{"type":"text","question":"Erkläre X.","answer":"Musterantwort","explanation":"..."}]`;
  }
}

// ── Backend Call ──────────────────────────────────────────────────────────────
async function callBackend(prompt) {
  const resp = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err.error || `Server Fehler ${resp.status}`;
    if (resp.status === 429) throw new Error('Zu viele Anfragen. Bitte warte kurz.');
    throw new Error(msg);
  }
  return (await resp.json()).result;
}

// ── Parse & Show ──────────────────────────────────────────────────────────────
function parseAndShow(raw, mode) {
  if (mode === 'flashcards') {
    try {
      state.flashcards = JSON.parse(extractJson(raw));
      if (!state.flashcards.length) throw new Error();
      state.fcDifficulty = {};
      initFlashcards(); showScreen('flashcards');
    } catch { toast('Karteikarten konnten nicht gelesen werden', 'error'); showScreen('upload'); }
  } else if (mode === 'summary') {
    state.summaryMarkdown = raw; showSummary(raw); showScreen('summary');
  } else if (mode === 'quiz') {
    try {
      state.quiz = JSON.parse(extractJson(raw));
      if (!state.quiz.length) throw new Error();
      state.quizWrong = [];
      initQuiz(); showScreen('quiz');
    } catch { toast('Quiz konnte nicht gelesen werden', 'error'); showScreen('upload'); }
  }
}
function extractJson(text) {
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('No JSON');
  return text.slice(s, e+1);
}

// ── Flashcards ────────────────────────────────────────────────────────────────
function initFlashcards() {
  state.fcQueue = [...state.flashcards.keys()];
  state.fcIndex = 0; state.fcCorrect = 0; state.fcFlipped = false;
  renderFlashcard();
}

function renderFlashcard() {
  const container = $('fc-container');
  if (state.fcIndex >= state.fcQueue.length) {
    const pct = Math.round((state.fcCorrect / state.flashcards.length) * 100);
    if (pct >= 80) launchKonfetti();
    container.innerHTML = `
      <div class="fc-result">
        <div class="score-ring">${pct}%</div>
        <h2>Runde abgeschlossen! ${pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</h2>
        <p>Du hast ${state.fcCorrect} von ${state.flashcards.length} Karten richtig beantwortet.</p>
        ${getDifficultyBreakdown()}
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem">
          <button class="btn-secondary" onclick="initFlashcards()">↺ Neu starten</button>
          <button class="btn-secondary" onclick="reviewHardCards()">🔴 Schwierige wiederholen</button>
          <button class="btn-primary" onclick="showScreen('upload')">Neue Datei</button>
        </div>
      </div>`;
    recordStats('flashcards', { correct: state.fcCorrect, total: state.flashcards.length });
    return;
  }
  const card = state.flashcards[state.fcQueue[state.fcIndex]];
  const total = state.flashcards.length;
  const done = state.fcIndex;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const diff = state.fcDifficulty[state.fcQueue[state.fcIndex]] || null;
  state.fcFlipped = false;

  container.innerHTML = `
    <div class="fc-progress-row">
      <span>${done+1} / ${total}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span>${state.fcCorrect} ✓</span>
    </div>
    <div class="swipe-indicators">
      <span class="swipe-ind left">← Nochmal</span>
      <span class="swipe-ind right">Gewusst →</span>
    </div>
    <div class="flashcard-scene" id="fc-scene">
      <div class="flashcard" id="fc-card">
        <div class="flashcard-face front">
          <div class="card-label">Begriff</div>
          <div class="card-text">${escHtml(card.front)}</div>
          <div class="card-hint">↕ Tippe zum Umdrehen</div>
        </div>
        <div class="flashcard-face back">
          <div class="card-label">Erklärung</div>
          <div class="card-text">${escHtml(card.back)}</div>
          <div style="margin-top:1rem;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
            <button class="diff-badge easy" onclick="setDifficulty('easy',event)">😊 Einfach</button>
            <button class="diff-badge medium" onclick="setDifficulty('medium',event)">🤔 Mittel</button>
            <button class="diff-badge hard" onclick="setDifficulty('hard',event)">😰 Schwer</button>
          </div>
        </div>
      </div>
    </div>
    <div class="fc-actions" id="fc-actions" style="display:none">
      <button class="btn-wrong" onclick="fcAnswer(false)">✗ Nochmal</button>
      <button class="btn-secondary" onclick="fcFlip()">↩ Zurück</button>
      <button class="btn-correct" onclick="fcAnswer(true)">✓ Gewusst</button>
    </div>
    <div class="fc-flip-hint" id="fc-flip-hint">
      <button class="btn-primary" onclick="fcFlip()">Karte umdrehen</button>
    </div>`;

  const scene = $('fc-scene');
  scene.addEventListener('click', fcFlip);

  // Touch/Swipe support
  scene.addEventListener('touchstart', e => {
    state.touchStartX = e.touches[0].clientX;
    state.touchStartY = e.touches[0].clientY;
  }, { passive: true });
  scene.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - state.touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - state.touchStartY);
    if (Math.abs(dx) > 60 && dy < 50) {
      if (!state.fcFlipped) { fcFlip(); return; }
      if (dx < 0) fcAnswer(false); else fcAnswer(true);
    }
  });
}

function setDifficulty(level, e) {
  e.stopPropagation();
  state.fcDifficulty[state.fcQueue[state.fcIndex]] = level;
  const btns = document.querySelectorAll('.diff-badge');
  btns.forEach(b => b.style.opacity = '0.4');
  e.target.style.opacity = '1';
  e.target.style.transform = 'scale(1.1)';
}

function getDifficultyBreakdown() {
  const counts = { easy: 0, medium: 0, hard: 0 };
  Object.values(state.fcDifficulty).forEach(d => { if (counts[d] !== undefined) counts[d]++; });
  if (!Object.values(counts).some(v => v > 0)) return '';
  return `<div style="display:flex;gap:8px;justify-content:center;margin-top:1rem;flex-wrap:wrap">
    <span class="diff-badge easy">😊 ${counts.easy} Einfach</span>
    <span class="diff-badge medium">🤔 ${counts.medium} Mittel</span>
    <span class="diff-badge hard">😰 ${counts.hard} Schwer</span>
  </div>`;
}

function reviewHardCards() {
  const hardIndices = Object.entries(state.fcDifficulty)
    .filter(([,v]) => v === 'hard' || v === 'medium')
    .map(([k]) => parseInt(k));
  if (!hardIndices.length) { toast('Keine schwierigen Karten markiert!', 'error'); return; }
  state.fcQueue = hardIndices;
  state.fcIndex = 0; state.fcCorrect = 0; state.fcFlipped = false;
  toast(`${hardIndices.length} Karte(n) zur Wiederholung`, 'success');
  renderFlashcard();
}

function fcFlip() {
  const card = $('fc-card'); if (!card) return;
  state.fcFlipped = !state.fcFlipped;
  card.classList.toggle('flipped', state.fcFlipped);
  $('fc-actions').style.display = state.fcFlipped ? 'flex' : 'none';
  $('fc-flip-hint').style.display = state.fcFlipped ? 'none' : '';
}

function fcAnswer(correct) {
  if (correct) { state.fcCorrect++; state.fcIndex++; }
  else { state.fcQueue.push(state.fcQueue[state.fcIndex]); state.fcIndex++; }
  renderFlashcard();
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const active = Object.keys(screens).find(k => screens[k].classList.contains('active'));
  if (active === 'flashcards') {
    if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); fcFlip(); }
    if (e.key === 'ArrowLeft' && state.fcFlipped) fcAnswer(false);
    if (e.key === 'ArrowRight' && state.fcFlipped) fcAnswer(true);
  }
  if (e.key === 'Escape') goBack();
});

// ── Summary ───────────────────────────────────────────────────────────────────
function showSummary(md) { $('summary-content').innerHTML = marked.parse(md); }
$('summary-export').addEventListener('click', () => window.print());

// ── Quiz ──────────────────────────────────────────────────────────────────────
function initQuiz() {
  state.quizIndex = 0; state.quizScore = 0; state.quizAnswered = false; state.quizWrong = [];
  renderQuestion();
}

function renderQuestion() {
  const body = $('quiz-body');
  if (state.quizIndex >= state.quiz.length) {
    const pct = Math.round((state.quizScore / state.quiz.length) * 100);
    if (pct >= 80) launchKonfetti();
    body.innerHTML = `
      <div class="quiz-result">
        <div class="score-display">${state.quizScore}/${state.quiz.length}</div>
        <div class="score-label">${pct}% richtig ${pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
        <div class="score-bar-wrap"><div class="score-bar-fill" style="width:0%" id="score-bar"></div></div>
        <p style="color:var(--text2);margin-bottom:1rem">${scoreMsg(pct)}</p>
        ${state.quizWrong.length > 0 ? `<button class="btn-explain" onclick="showWeaknessSummary()" style="margin:0 auto 1rem;">🤖 KI-Schwächenanalyse anzeigen</button>` : ''}
        <div id="weakness-area"></div>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;margin-top:1rem">
          <button class="btn-secondary" onclick="initQuiz()">↺ Wiederholen</button>
          <button class="btn-primary" onclick="showScreen('upload')">Neue Datei</button>
        </div>
      </div>`;
    setTimeout(() => { const b = $('score-bar'); if (b) b.style.width = pct + '%'; }, 100);
    recordStats('quiz', { score: state.quizScore, total: state.quiz.length });
    return;
  }

  const q = state.quiz[state.quizIndex];
  const type = q.type || 'mc';
  state.quizAnswered = false;

  const nav = `<div class="quiz-nav"><span style="color:var(--text2);font-size:13px;font-family:var(--font-mono)">Punkte: ${state.quizScore}</span></div>`;

  if (type === 'text') {
    body.innerHTML = `
      <div class="quiz-question-card">
        <div class="quiz-q-meta">
          <span class="quiz-q-num">Frage ${state.quizIndex+1} / ${state.quiz.length}</span>
          <span class="quiz-type-badge">✍️ Freitext</span>
        </div>
        <div class="quiz-q-text">${escHtml(q.question)}</div>
        <textarea class="quiz-text-input" id="quiz-text-input" placeholder="Deine Antwort…" rows="4"></textarea>
        <button class="quiz-text-submit" id="quiz-text-submit">Antworten →</button>
        <div id="quiz-feedback"></div>
      </div>${nav}`;
    $('quiz-text-submit').addEventListener('click', () => revealTextAnswer(q));
    $('quiz-text-input').addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) revealTextAnswer(q); });
  } else {
    const letters = ['A','B','C','D'];
    body.innerHTML = `
      <div class="quiz-question-card">
        <div class="quiz-q-meta">
          <span class="quiz-q-num">Frage ${state.quizIndex+1} / ${state.quiz.length}</span>
          ${type === 'tf' ? '<span class="quiz-type-badge">✅ Wahr/Falsch</span>' : ''}
        </div>
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
  const inputEl = $('quiz-text-input');
  const submitEl = $('quiz-text-submit');
  if (inputEl) inputEl.disabled = true;
  if (submitEl) submitEl.style.display = 'none';
  $('quiz-feedback').innerHTML = `
    <div class="quiz-feedback text-reveal">
      <div class="text-answer-label">📖 Musterlösung</div>
      <div class="text-answer-content">${escHtml(q.answer || '')}</div>
      ${q.explanation ? `<div class="text-answer-hint">${escHtml(q.explanation)}</div>` : ''}
      <div class="text-self-assess">
        <p>Wie gut war deine Antwort?</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-wrong" onclick="quizAnswerSelf(false)">✗ Nicht gewusst</button>
          <button class="btn-correct" onclick="quizAnswerSelf(true)">✓ Gewusst</button>
          <button class="btn-explain" onclick="showExplanation('${escHtml(q.question)}','${escHtml(q.answer||'')}')">🤖 KI erklären</button>
        </div>
      </div>
    </div>`;
}

function quizAnswerSelf(correct) { if (correct) state.quizScore++; quizNext(); }

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
    fb.innerHTML = `<div class="quiz-feedback correct">✓ Richtig! ${escHtml(q.explanation||'')}</div>`;
  } else {
    state.quizWrong.push(q);
    fb.innerHTML = `
      <div class="quiz-feedback wrong">
        ✗ Falsch. Richtig: <strong>${escHtml(q.options[q.correct])}</strong>. ${escHtml(q.explanation||'')}
        <br/><button class="btn-explain" onclick="showExplanation('${escHtml(q.question)}','${escHtml(q.options[q.correct])}')">🤖 KI erklären lassen</button>
      </div>`;
  }
  nav.innerHTML += `<button class="btn-primary" onclick="quizNext()">${isLast ? 'Ergebnis' : 'Weiter'} →</button>`;
}

function quizNext() { state.quizIndex++; renderQuestion(); }

function scoreMsg(pct) {
  if (pct >= 90) return 'Ausgezeichnet! Du beherrschst das Thema.';
  if (pct >= 70) return 'Sehr gut! Noch ein paar Details wiederholen.';
  if (pct >= 50) return 'Nicht schlecht – weiter üben!';
  return 'Noch mehr lernen und wiederholen.';
}

// ── KI Explain ────────────────────────────────────────────────────────────────
async function showExplanation(question, answer) {
  $('explain-backdrop').classList.add('open');
  $('explain-loading').style.display = 'block';
  $('explain-content').style.display = 'none';
  try {
    const prompt = `Eine Lernende hat diese Frage falsch beantwortet:\n\nFrage: "${question}"\nRichtige Antwort: "${answer}"\n\nErkläre die richtige Antwort klar und verständlich in 3-5 Sätzen. Gib auch ein konkretes Beispiel falls hilfreich. Antworte auf Deutsch.`;
    const result = await callBackend(prompt);
    $('explain-loading').style.display = 'none';
    $('explain-content').style.display = 'block';
    $('explain-content').innerHTML = marked.parse(result);
  } catch {
    $('explain-loading').style.display = 'none';
    $('explain-content').style.display = 'block';
    $('explain-content').textContent = 'Erklärung konnte nicht geladen werden.';
  }
}
$('explain-close').addEventListener('click', () => $('explain-backdrop').classList.remove('open'));
$('explain-backdrop').addEventListener('click', e => { if (e.target === $('explain-backdrop')) $('explain-backdrop').classList.remove('open'); });

// ── Weakness Summary ──────────────────────────────────────────────────────────
async function showWeaknessSummary() {
  const area = $('weakness-area');
  if (!area) return;
  area.innerHTML = `<div class="weakness-card"><div class="weakness-title">🤖 KI analysiert Schwächen…</div><div class="loading-dots"><span></span><span></span><span></span></div></div>`;
  try {
    const wrongList = state.quizWrong.map(q => `- Frage: "${q.question}" | Richtig: "${q.options?.[q.correct] || q.answer}"`).join('\n');
    const prompt = `Eine Lernende hat folgende Quizfragen falsch beantwortet:\n${wrongList}\n\nAnalysiere die Schwächen und gib 3 konkrete Lerntipps auf Deutsch. Sei kurz und präzise.`;
    const result = await callBackend(prompt);
    area.innerHTML = `<div class="weakness-card"><div class="weakness-title">🤖 KI-Schwächenanalyse</div><div class="weakness-text">${marked.parse(result)}</div></div>`;
  } catch {
    area.innerHTML = '';
  }
}

// ── Konfetti ──────────────────────────────────────────────────────────────────
function launchKonfetti() {
  const canvas = $('konfetti-canvas');
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
    w: Math.random() * 10 + 5, h: Math.random() * 6 + 3,
    color: ['#a78bfa','#38bdf8','#34d399','#fbbf24','#f87171'][Math.floor(Math.random()*5)],
    speed: Math.random() * 3 + 2, angle: Math.random() * 360,
    spin: (Math.random() - 0.5) * 5, drift: (Math.random() - 0.5) * 2,
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
      p.y += p.speed; p.x += p.drift; p.angle += p.spin;
    });
    frame++;
    if (frame < 150) requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; }
  }
  draw();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const lib = loadLibrary();
  const streak = getStreak();
  const allRuns = lib.flatMap(s => [
    ...(s.stats?.flashcardRuns||[]).map(r => ({ ...r, mode:'flashcards', title: s.title, pct: Math.round((r.correct/r.total)*100) })),
    ...(s.stats?.quizRuns||[]).map(r => ({ ...r, mode:'quiz', title: s.title, pct: Math.round((r.score/r.total)*100) })),
  ]).sort((a,b) => new Date(b.date) - new Date(a.date));

  const avgScore = allRuns.length ? Math.round(allRuns.reduce((a,r) => a+r.pct, 0) / allRuns.length) : 0;

  $('dashboard-body').innerHTML = `
    <div class="dashboard-grid">
      <div class="dash-stat-card purple">
        <div class="dash-stat-icon">📚</div>
        <div class="dash-stat-value">${lib.length}</div>
        <div class="dash-stat-label">Lernsets</div>
      </div>
      <div class="dash-stat-card sky">
        <div class="dash-stat-icon">⚡</div>
        <div class="dash-stat-value">${allRuns.length}</div>
        <div class="dash-stat-label">Sessions</div>
      </div>
      <div class="dash-stat-card green">
        <div class="dash-stat-icon">🎯</div>
        <div class="dash-stat-value">${avgScore}%</div>
        <div class="dash-stat-label">Ø Score</div>
      </div>
      <div class="dash-stat-card amber">
        <div class="dash-stat-icon">🔥</div>
        <div class="dash-stat-value">${streak.count}</div>
        <div class="dash-stat-label">Tage Streak</div>
      </div>
    </div>

    <p class="dash-section-title">Lernaktivität (letzte 12 Wochen)</p>
    <div class="heatmap-wrap">${buildHeatmap(allRuns)}</div>

    <p class="dash-section-title">Letzte Aktivitäten</p>
    <div class="activity-list">
      ${allRuns.slice(0,8).map(r => `
        <div class="activity-item">
          <div class="activity-icon">${r.mode === 'flashcards' ? '🗂️' : '🎯'}</div>
          <div class="activity-body">
            <div class="activity-title">${escHtml(r.title)}</div>
            <div class="activity-meta">${r.mode === 'flashcards' ? 'Karteikarten' : 'Quiz'} · ${formatDate(r.date)}</div>
          </div>
          <span class="activity-score" style="color:${r.pct>=70?'var(--green)':r.pct>=40?'var(--amber)':'var(--red)'}">${r.pct}%</span>
        </div>`).join('') || '<p style="color:var(--text2);padding:1rem">Noch keine Aktivitäten.</p>'}
    </div>`;
}

function buildHeatmap(runs) {
  const dateMap = {};
  runs.forEach(r => {
    const d = r.date?.slice(0,10);
    if (d) dateMap[d] = (dateMap[d]||0) + 1;
  });
  const today = new Date();
  const weeks = [];
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (12*7) + 1);
  let current = new Date(startDate);
  let week = [];
  while (current <= today) {
    const key = current.toISOString().slice(0,10);
    const count = dateMap[key] || 0;
    const level = count === 0 ? 0 : count <= 1 ? 1 : count <= 2 ? 2 : count <= 3 ? 3 : 4;
    week.push(`<div class="heatmap-cell level-${level}" title="${key}: ${count} Session(s)"></div>`);
    if (current.getDay() === 6) { weeks.push(week.join('')); week = []; }
    current.setDate(current.getDate() + 1);
  }
  if (week.length) weeks.push(week.join(''));
  return `<div class="heatmap-grid">${weeks.map(w => `<div class="heatmap-week">${w}</div>`).join('')}</div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-CH', { day:'2-digit', month:'2-digit', year:'numeric' });
}

$('nav-dashboard').addEventListener('click', () => { renderDashboard(); showScreen('dashboard'); });

// ── Back ──────────────────────────────────────────────────────────────────────
function goBack() {
  const active = Object.keys(screens).find(k => screens[k].classList.contains('active'));
  if (['library','plan','dashboard'].includes(active)) { showScreen('upload'); return; }
  showScreen(state.backTarget || 'upload');
}
document.querySelectorAll('.btn-back').forEach(btn => btn.addEventListener('click', goBack));

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// Bibliothek
// ══════════════════════════════════════════════════════════════════════════════
const LIB_KEY = 'studyai_library_v1';
const MODE_INFO = { flashcards:{icon:'🗂️',label:'Karteikarten'}, summary:{icon:'📝',label:'Lernzettel'}, quiz:{icon:'🎯',label:'Quiz'} };

function loadLibrary() { try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch { return []; } }
function persistLibrary(sets) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(sets)); return true; }
  catch { toast('Speicher voll', 'error'); return false; }
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function getSubjects() { return [...new Set(loadLibrary().map(s=>s.subject).filter(Boolean))]; }

const saveBackdrop = $('save-backdrop');

function hasContent(mode) {
  if (mode === 'flashcards') return state.flashcards.length > 0;
  if (mode === 'quiz') return state.quiz.length > 0;
  if (mode === 'summary') return !!state.summaryMarkdown;
  return false;
}

function openSaveModal(mode) {
  if (!hasContent(mode)) { toast('Nichts zum Speichern', 'error'); return; }
  state.pendingSaveMode = mode;
  $('save-title').value = (state.sourceName||'').replace(/\.[^.]+$/,'').trim() || MODE_INFO[mode].label;
  $('save-subject').value = localStorage.getItem('studyai_last_subject') || '';
  $('subject-list').innerHTML = getSubjects().map(s=>`<option value="${escHtml(s)}">`).join('');
  saveBackdrop.classList.add('open'); $('save-title').focus(); $('save-title').select();
}

function closeSaveModal() {
  saveBackdrop.classList.remove('open'); state.pendingSaveMode = null; state.editingSetId = null;
  $('modal-save-title').textContent = 'Lernset speichern';
  $('modal-save-desc').textContent = 'Wird lokal in deinem Browser gespeichert.';
  $('save-confirm').textContent = 'Speichern';
}

function confirmSave() {
  const title = $('save-title').value.trim();
  const subject = $('save-subject').value.trim() || 'Allgemein';
  if (state.editingSetId) {
    const lib = loadLibrary().map(s => s.id === state.editingSetId ? {...s, title: title||s.title, subject} : s);
    if (persistLibrary(lib)) { localStorage.setItem('studyai_last_subject', subject); closeSaveModal(); toast('Aktualisiert ✓'); renderLibrary(); }
    return;
  }
  const mode = state.pendingSaveMode; if (!mode) return;
  const set = {
    id: genId(), title: title || MODE_INFO[mode].label, subject, mode,
    createdAt: Date.now(), sourceName: state.sourceName || '',
    flashcards: mode === 'flashcards' ? state.flashcards : null,
    quiz: mode === 'quiz' ? state.quiz : null,
    summary: mode === 'summary' ? state.summaryMarkdown : null,
  };
  const lib = loadLibrary(); lib.push(set);
  if (persistLibrary(lib)) { localStorage.setItem('studyai_last_subject', subject); closeSaveModal(); toast('Gespeichert ✓'); }
}

document.querySelectorAll('.btn-save').forEach(btn => btn.addEventListener('click', () => openSaveModal(btn.dataset.mode)));
$('save-cancel').addEventListener('click', closeSaveModal);
$('save-confirm').addEventListener('click', confirmSave);
saveBackdrop.addEventListener('click', e => { if (e.target === saveBackdrop) closeSaveModal(); });
$('save-title').addEventListener('keydown', e => { if (e.key === 'Enter') confirmSave(); });

function renderLibrary() {
  const allSets = loadLibrary().sort((a,b) => b.createdAt - a.createdAt);
  const filterBar = $('library-filter-bar');
  const subjects = [...new Set(allSets.map(s=>s.subject).filter(Boolean))].sort();

  if (subjects.length > 1) {
    filterBar.innerHTML = [
      `<button class="filter-pill${state.filterSubject==='all'?' active':''}" data-subj="all">Alle (${allSets.length})</button>`,
      ...subjects.map(sub => {
        const count = allSets.filter(s=>s.subject===sub).length;
        return `<button class="filter-pill${state.filterSubject===sub?' active':''}" data-subj="${escHtml(sub)}">${escHtml(sub)} (${count})</button>`;
      }),
    ].join('');
    filterBar.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => { state.filterSubject = pill.dataset.subj; renderLibrary(); });
    });
  } else { filterBar.innerHTML = ''; state.filterSubject = 'all'; }

  const sets = state.filterSubject === 'all' ? allSets : allSets.filter(s=>s.subject===state.filterSubject);
  const grid = $('library-grid');

  if (!allSets.length) {
    grid.innerHTML = `<div class="library-empty"><div class="empty-icon">📚</div><h3>Noch keine Lernsets</h3><p>Analysiere ein Dokument und speichere es hier.</p><button class="btn-primary" onclick="showScreen('upload')">⚡ Dokument analysieren</button></div>`;
    return;
  }
  if (!sets.length) {
    grid.innerHTML = `<div class="library-empty"><div class="empty-icon">🔍</div><h3>Keine Sets in diesem Fach</h3><p>Wähle ein anderes Fach.</p></div>`;
    return;
  }

  grid.innerHTML = sets.map(set => {
    const info = MODE_INFO[set.mode] || {icon:'📄',label:'Lernset'};
    let count = set.mode==='flashcards' ? `${set.flashcards?.length||0} Karten` : set.mode==='quiz' ? `${set.quiz?.length||0} Fragen` : 'Zusammenfassung';
    const date = new Date(set.createdAt).toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'});
    return `
      <div class="library-card" data-id="${set.id}">
        <div class="lib-card-top">
          <div class="lib-card-icon">${info.icon}</div>
          <div class="lib-card-titles">
            <div class="lib-card-title">${escHtml(set.title)}</div>
            <div class="lib-card-type">${info.label} · ${count}</div>
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
  const set = loadLibrary().find(s=>s.id===id);
  if (!set) { toast('Nicht gefunden', 'error'); return; }
  state.backTarget = 'library'; state.sourceName = set.sourceName || ''; state.openedFromSetId = set.id;
  if (set.mode==='flashcards') { state.flashcards=set.flashcards||[]; state.fcDifficulty={}; initFlashcards(); showScreen('flashcards'); }
  else if (set.mode==='quiz') { state.quiz=set.quiz||[]; state.quizWrong=[]; initQuiz(); showScreen('quiz'); }
  else if (set.mode==='summary') { state.summaryMarkdown=set.summary||''; showSummary(state.summaryMarkdown); showScreen('summary'); }
}

function deleteSet(id) {
  const set = loadLibrary().find(s=>s.id===id);
  if (!set || !confirm(`„${set.title}" löschen?`)) return;
  persistLibrary(loadLibrary().filter(s=>s.id!==id)); renderLibrary(); toast('Gelöscht');
}

function openEditModal(id) {
  const set = loadLibrary().find(s=>s.id===id); if (!set) return;
  state.editingSetId = id; state.pendingSaveMode = null;
  $('save-title').value = set.title; $('save-subject').value = set.subject||'';
  $('subject-list').innerHTML = getSubjects().map(s=>`<option value="${escHtml(s)}">`).join('');
  $('modal-save-title').textContent = '✏️ Lernset bearbeiten';
  $('modal-save-desc').textContent = 'Titel und Fach ändern.';
  $('save-confirm').textContent = 'Aktualisieren';
  saveBackdrop.classList.add('open'); $('save-title').focus(); $('save-title').select();
}

$('logo-home').addEventListener('click', () => showScreen('upload'));
$('nav-library').addEventListener('click', () => { state.filterSubject='all'; renderLibrary(); showScreen('library'); });
$('lib-new').addEventListener('click', () => showScreen('upload'));

// ── Stats ─────────────────────────────────────────────────────────────────────
function recordStats(mode, data) {
  const id = state.openedFromSetId; if (!id) return;
  const lib = loadLibrary().map(s => {
    if (s.id !== id) return s;
    const stats = s.stats || { flashcardRuns:[], quizRuns:[] };
    const entry = { date: new Date().toISOString(), ...data };
    if (mode==='flashcards') stats.flashcardRuns = [...(stats.flashcardRuns||[]), entry];
    if (mode==='quiz') stats.quizRuns = [...(stats.quizRuns||[]), entry];
    return {...s, stats};
  });
  persistLibrary(lib);
}

function getStatsSummary(set) {
  const stats = set.stats || {};
  if (set.mode==='flashcards') {
    const runs = stats.flashcardRuns||[]; if (!runs.length) return '';
    const last = runs[runs.length-1]; const pct = Math.round((last.correct/last.total)*100);
    const color = pct>=70?'var(--green)':pct>=40?'var(--amber)':'var(--red)';
    return `<span class="lib-card-stat" style="color:${color}">⚡ ${last.correct}/${last.total} (${pct}%)</span>`;
  }
  if (set.mode==='quiz') {
    const runs = stats.quizRuns||[]; if (!runs.length) return '';
    const last = runs[runs.length-1]; const pct = Math.round((last.score/last.total)*100);
    const color = pct>=70?'var(--green)':pct>=40?'var(--amber)':'var(--red)';
    return `<span class="lib-card-stat" style="color:${color}">⚡ ${last.score}/${last.total} (${pct}%)</span>`;
  }
  return '';
}

// ══════════════════════════════════════════════════════════════════════════════
// Lernplan
// ══════════════════════════════════════════════════════════════════════════════
const PLAN_KEY = 'studyai_plan_v1';
function loadPlan() { try { return JSON.parse(localStorage.getItem(PLAN_KEY)) || []; } catch { return []; } }
function persistPlan(p) { try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch { toast('Speicher voll','error'); } }

const planBackdrop = $('plan-backdrop');
function openPlanModal() { $('plan-title').value=''; $('plan-date').value=new Date().toISOString().slice(0,10); planBackdrop.classList.add('open'); $('plan-title').focus(); }
function closePlanModal() { planBackdrop.classList.remove('open'); }

$('plan-add-btn').addEventListener('click', openPlanModal);
$('plan-cancel').addEventListener('click', closePlanModal);
planBackdrop.addEventListener('click', e => { if (e.target===planBackdrop) closePlanModal(); });
$('plan-confirm').addEventListener('click', () => {
  const title = $('plan-title').value.trim(); const date = $('plan-date').value;
  if (!title) { toast('Bitte Titel eingeben','error'); return; }
  const plan = loadPlan(); plan.push({ id:genId(), title, targetDate:date, completed:false, createdAt:Date.now() });
  persistPlan(plan); closePlanModal(); renderPlan(); toast('Lernziel hinzugefügt ✓');
});
$('plan-title').addEventListener('keydown', e => { if (e.key==='Enter') $('plan-confirm').click(); });

function renderPlan() {
  const body = $('plan-body');
  const items = loadPlan().sort((a,b) => a.targetDate.localeCompare(b.targetDate));
  const today = new Date().toISOString().slice(0,10);
  const weekEnd = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const groups = [
    { label:'🔴 Überfällig',  filter: i => !i.completed && i.targetDate < today },
    { label:'📅 Heute',       filter: i => !i.completed && i.targetDate === today },
    { label:'📆 Diese Woche', filter: i => !i.completed && i.targetDate > today && i.targetDate <= weekEnd },
    { label:'🔮 Später',      filter: i => !i.completed && i.targetDate > weekEnd },
    { label:'✅ Erledigt',    filter: i => i.completed },
  ];
  if (!items.length) {
    body.innerHTML = `<div class="plan-empty"><div class="empty-icon">📅</div><h3>Noch keine Lernziele</h3><p>Klicke auf „+ Ziel" um loszulegen.</p></div>`;
    return;
  }
  body.innerHTML = groups.map(g => {
    const list = items.filter(g.filter); if (!list.length) return '';
    return `<div class="plan-group"><h3 class="plan-group-title">${g.label}</h3>${list.map(item => `
      <div class="plan-item${item.completed?' completed':''}">
        <input type="checkbox" class="plan-check" data-id="${item.id}" ${item.completed?'checked':''}>
        <div class="plan-item-body">
          <div class="plan-item-title">${escHtml(item.title)}</div>
          <div class="plan-item-date">Fällig: ${formatPlanDate(item.targetDate)}</div>
        </div>
        <button class="lib-card-action-btn delete plan-delete" data-id="${item.id}">🗑️</button>
      </div>`).join('')}</div>`;
  }).join('');
  body.querySelectorAll('.plan-check').forEach(cb => {
    cb.addEventListener('change', () => { persistPlan(loadPlan().map(i=>i.id===cb.dataset.id?{...i,completed:cb.checked}:i)); renderPlan(); });
  });
  body.querySelectorAll('.plan-delete').forEach(btn => {
    btn.addEventListener('click', () => { if (!confirm('Lernziel löschen?')) return; persistPlan(loadPlan().filter(i=>i.id!==btn.dataset.id)); renderPlan(); });
  });
}

function formatPlanDate(iso) { if (!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; }
$('nav-plan').addEventListener('click', () => { renderPlan(); showScreen('plan'); });

// ══════════════════════════════════════════════════════════════════════════════
// Pomodoro Timer
// ══════════════════════════════════════════════════════════════════════════════
const timerPanel = $('timer-panel');
let timerInterval = null, timerSeconds = 25*60, timerRunning = false, timerTotal = 25*60;

function timerFmt(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

function timerRender() {
  $('timer-display').textContent = timerFmt(timerSeconds);
  $('timer-toggle').textContent = timerRunning ? '⏸ Pause' : '▶ Start';
  const circle = $('timer-ring-circle');
  if (circle) {
    const total = 339.3;
    const progress = timerSeconds / timerTotal;
    circle.style.strokeDashoffset = total * (1 - progress);
  }
}

function timerTick() {
  if (timerSeconds <= 0) {
    clearInterval(timerInterval); timerInterval = null; timerRunning = false;
    timerRender(); toast('⏰ Zeit abgelaufen!', 'success', 5000);
    updateStreak(); return;
  }
  timerSeconds--; timerRender();
}

$('timer-toggle').addEventListener('click', () => {
  if (timerRunning) { clearInterval(timerInterval); timerInterval = null; timerRunning = false; }
  else { timerRunning = true; timerInterval = setInterval(timerTick, 1000); }
  timerRender();
});
$('timer-reset').addEventListener('click', () => {
  clearInterval(timerInterval); timerInterval = null; timerRunning = false;
  const active = timerPanel.querySelector('.timer-mode-btn.active');
  timerTotal = timerSeconds = (active ? parseInt(active.dataset.minutes) : 25) * 60;
  timerRender();
});
$('timer-close').addEventListener('click', () => { timerPanel.style.display = 'none'; });
$('nav-timer').addEventListener('click', () => { timerPanel.style.display = timerPanel.style.display === 'none' ? 'block' : 'none'; });
timerPanel.querySelectorAll('.timer-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    timerPanel.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    clearInterval(timerInterval); timerInterval = null; timerRunning = false;
    timerTotal = timerSeconds = parseInt(btn.dataset.minutes) * 60;
    const labels = {'25':'🍅 Pomodoro','5':'☕ Kurze Pause','10':'🌿 Lange Pause'};
    $('timer-mode-label').textContent = labels[btn.dataset.minutes] || '⏱️ Timer';
    timerRender();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
updateStreakUI();
updateHeroStats();
showScreen('upload');
