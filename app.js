// StudyAI v6 – Alle Stufen
const BACKEND   = 'https://studyai-backend-gray.vercel.app';
const SUPA_URL  = 'https://pxskdaweaclfmhtjohxj.supabase.co';
const SUPA_ANON = 'sb_publishable_zmDuqGl6vDlfbMm5TqWXeA_oJ5Op2qj';

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser = null, userToken = null;
let allProjects = [], currentProject = null;
let allSets = [], currentSet = null, openSetId = null;
let planItems = [];
let currentMode = 'all', uploadForProjectId = null;
let fcCards = [], fcIndex = 0, fcDifficulty = {};
let quizData = [], quizIndex = 0, quizScore = 0, quizAnswered = false, quizWrong = [];
let examQuestions = [], examIndex = 0, examScore = 0, examAnswered = false;
let timerInterval = null, timerSeconds = 25*60, timerTotal = 25*60, timerRunning = false;
let calYear, calMonth;
let isDark = true, deferredInstall = null;
let uploadedFileData = null;

const $ = id => document.getElementById(id);
const ICONS  = ['📚','🔬','🧮','🌍','🎨','💡','🏆','⚗️','📖','🎯','🖥️','🎵','🏃','✏️'];
const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#84cc16'];

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type='success') {
  const t = $('toast'); t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 3000);
}

// ── Screens ───────────────────────────────────────────────────────────────────
function showMain(name) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`screen-${name}`).style.display = 'block';
  if (name === 'home')     { loadHome(); document.querySelectorAll('.nav-btn')[0].classList.add('active'); }
  if (name === 'calendar') { loadCalendar(); document.querySelectorAll('.nav-btn')[1].classList.add('active'); }
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  $(`screen-${name}`).style.display = 'block';
}

function closeModal() { $('modal-overlay').style.display = 'none'; }

// ── PWA Install ───────────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  $('install-btn').style.display = 'block';
});
function installPWA() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  deferredInstall.userChoice.then(() => { deferredInstall = null; $('install-btn').style.display = 'none'; });
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  $('tab-login').classList.toggle('active', tab==='login');
  $('tab-signup').classList.toggle('active', tab==='signup');
  $('auth-login-form').style.display  = tab==='login'  ? 'block' : 'none';
  $('auth-signup-form').style.display = tab==='signup' ? 'block' : 'none';
  $('auth-error').style.display = $('auth-success').style.display = 'none';
}
function showAuthError(msg)   { $('auth-error').textContent=msg;   $('auth-error').style.display='block';   $('auth-success').style.display='none'; }
function showAuthSuccess(msg) { $('auth-success').textContent=msg; $('auth-success').style.display='block'; $('auth-error').style.display='none'; }

async function doSignup() {
  const name=$('signup-name').value.trim(), email=$('signup-email').value.trim(), password=$('signup-password').value;
  if (!name||!email||!password) return showAuthError('Bitte alle Felder ausfüllen.');
  if (password.length<6) return showAuthError('Passwort mind. 6 Zeichen.');
  $('signup-btn-text').textContent='Wird erstellt...';
  try {
    const res  = await fetch(`${SUPA_URL}/auth/v1/signup`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_ANON},body:JSON.stringify({email,password,data:{name}})});
    const data = await res.json();
    if (data.error) throw new Error(data.error.message||data.msg);
    if (data.session) await initSession(data.session, name);
    else showAuthSuccess('Konto erstellt! Bitte E-Mail bestätigen.');
  } catch(e) { showAuthError(e.message); }
  $('signup-btn-text').textContent='Konto erstellen';
}

async function doLogin() {
  const email=$('login-email').value.trim(), password=$('login-password').value;
  if (!email||!password) return showAuthError('Bitte E-Mail und Passwort eingeben.');
  $('login-btn-text').textContent='Anmelden...';
  try {
    const res  = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_ANON},body:JSON.stringify({email,password})});
    const data = await res.json();
    if (data.error||data.error_description) throw new Error(data.error_description||data.error);
    await initSession(data, null);
  } catch(e) { showAuthError('Login fehlgeschlagen: '+e.message); }
  $('login-btn-text').textContent='Anmelden';
}

async function doLogout() {
  try { await fetch(`${SUPA_URL}/auth/v1/logout`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_ANON,'Authorization':`Bearer ${userToken}`}}); } catch{}
  currentUser=null; userToken=null; localStorage.removeItem('sai_session');
  $('app').style.display='none'; $('auth-screen').style.display='flex';
}

async function initSession(session, nameOverride) {
  userToken   = session.access_token;
  currentUser = session.user;
  const name  = nameOverride||currentUser.user_metadata?.name||currentUser.email.split('@')[0];
  currentUser.displayName = name;
  localStorage.setItem('sai_session', JSON.stringify({access_token:userToken,user:currentUser}));
  $('auth-screen').style.display='none'; $('app').style.display='block';
  $('user-avatar').textContent = name.charAt(0).toUpperCase();
  $('user-dropdown-name').textContent  = name;
  $('user-dropdown-email').textContent = currentUser.email;
  await ensureUserSettings();
  checkTodayNotifications();
  showMain('home');
}

async function tryRestoreSession() {
  const saved = localStorage.getItem('sai_session');
  if (!saved) return;
  try {
    const s   = JSON.parse(saved);
    const res = await fetch(`${SUPA_URL}/auth/v1/user`,{headers:{'apikey':SUPA_ANON,'Authorization':`Bearer ${s.access_token}`}});
    if (!res.ok) { localStorage.removeItem('sai_session'); return; }
    s.user = await res.json();
    await initSession(s, null);
  } catch { localStorage.removeItem('sai_session'); }
}

// ── DB ────────────────────────────────────────────────────────────────────────
function dbH() { return {'Content-Type':'application/json','apikey':SUPA_ANON,'Authorization':`Bearer ${userToken}`}; }
async function dbGet(table, params='') { const r=await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`,{headers:dbH()}); return r.ok?r.json():[]; }
async function dbInsert(table, body) {
  const r=await fetch(`${SUPA_URL}/rest/v1/${table}`,{method:'POST',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify(body)});
  const d=await r.json(); return Array.isArray(d)?d[0]:d;
}
async function dbPatch(table, filter, body) {
  const r=await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`,{method:'PATCH',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify(body)});
  return r.ok;
}
async function dbDelete(table, filter) { return (await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`,{method:'DELETE',headers:dbH()})).ok; }

async function ensureUserSettings() {
  const rows = await dbGet('user_settings',`user_id=eq.${currentUser.id}`);
  if (!rows||!rows.length) await dbInsert('user_settings',{user_id:currentUser.id,streak:0,theme:'dark',activity_log:{}});
  updateStreakUI();
}
async function updateStreakUI() {
  const rows = await dbGet('user_settings',`user_id=eq.${currentUser.id}`);
  if (rows&&rows.length) $('streak-count').textContent = rows[0].streak||0;
}

// ── Browser Notifications ─────────────────────────────────────────────────────
async function checkTodayNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;
  const today = new Date().toISOString().split('T')[0];
  const items = await dbGet('study_plan',`user_id=eq.${currentUser.id}&date=eq.${today}&done=eq.false`);
  if (items&&items.length>0) {
    new Notification('📚 StudyAI – Lerntermine heute', {
      body: items.map(i=>i.title).join(', '),
      icon: '/icon-192.png'
    });
  }
}

// ── HOME ──────────────────────────────────────────────────────────────────────
async function loadHome() {
  const hour = new Date().getHours();
  $('home-greeting').textContent = `${hour<12?'Guten Morgen':hour<17?'Guten Tag':'Guten Abend'}, ${currentUser.displayName}! 👋`;
  $('projects-loading').style.display = 'block';
  allProjects = await dbGet('projects',`user_id=eq.${currentUser.id}&order=created_at.desc`)||[];
  allSets     = await dbGet('learning_sets',`user_id=eq.${currentUser.id}`)||[];
  const stats = await dbGet('quiz_stats',`user_id=eq.${currentUser.id}`)||[];
  $('projects-loading').style.display = 'none';
  $('hs-projects').textContent = allProjects.length;
  $('hs-sets').textContent     = allSets.length;
  $('hs-streak').textContent   = $('streak-count').textContent;
  if (stats.length>0) {
    const avg = Math.round(stats.reduce((a,s)=>a+(s.score/s.total*100),0)/stats.length);
    $('hs-score').textContent = avg+'%';
  }
  if (!allProjects.length) { $('projects-empty').style.display='block'; $('projects-grid').innerHTML=''; return; }
  $('projects-empty').style.display = 'none';
  renderProjectCards();
}

function renderProjectCards() {
  $('projects-grid').innerHTML = allProjects.map(p => {
    const sets  = allSets.filter(s=>s.project_id===p.id);
    return `<div class="project-card" onclick="openProject('${p.id}')" style="border-top:3px solid ${p.color||'#6366f1'}"
      onmouseenter="showProjectPreview(event,'${p.id}')" onmouseleave="hideProjectPreview()">
      <div class="proj-card-icon">${p.icon||'📁'}</div>
      <div class="proj-card-name">${p.name}</div>
      <div class="proj-card-meta">${sets.length} Lernset${sets.length!==1?'s':''}</div>
    </div>`;
  }).join('');
}

// ── Set Preview ───────────────────────────────────────────────────────────────
let previewTimeout;
function showProjectPreview(e, projId) {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => {
    const sets = allSets.filter(s=>s.project_id===projId);
    if (!sets.length) return;
    const el = $('set-preview');
    $('sp-title').textContent = `${sets.length} Lernset${sets.length!==1?'s':''}`;
    $('sp-cards').innerHTML = sets.slice(0,4).map(s=>`
      <div class="sp-set-item"><span class="sp-set-name">${s.title}</span><span class="sp-set-meta">${s.flashcards?.length||0} Karten</span></div>`).join('');
    $('sp-footer').textContent = sets.length>4?`+${sets.length-4} weitere`:'';
    el.style.display = 'block';
    el.style.left = Math.min(e.clientX+12, window.innerWidth-220)+'px';
    el.style.top  = Math.min(e.clientY+12, window.innerHeight-200)+'px';
  }, 400);
}
function hideProjectPreview() { clearTimeout(previewTimeout); $('set-preview').style.display='none'; }

// ── Projekt Modal ─────────────────────────────────────────────────────────────
function openNewProjectModal() {
  $('modal-content').innerHTML = `
    <h3 style="margin-bottom:1.25rem">Neues Projekt</h3>
    <div class="auth-field"><label>Name</label><input type="text" id="proj-name-input" placeholder="z.B. Mathematik Prüfung"/></div>
    <div class="auth-field"><label>Icon</label><div class="icon-picker">${ICONS.map(ic=>`<button class="icon-btn" onclick="selectIcon(this)">${ic}</button>`).join('')}</div></div>
    <div class="auth-field"><label>Farbe</label><div class="color-picker">${COLORS.map(c=>`<button class="color-btn" style="background:${c}" onclick="selectColor(this)"></button>`).join('')}</div></div>
    <div style="display:flex;gap:.75rem;margin-top:1.25rem">
      <button class="btn-primary" onclick="createProject()">Erstellen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  setTimeout(()=>{ document.querySelector('.icon-btn')?.classList.add('selected'); document.querySelector('.color-btn')?.classList.add('selected'); },10);
  $('modal-overlay').style.display='flex';
}
function selectIcon(btn)  { document.querySelectorAll('.icon-btn').forEach(b=>b.classList.remove('selected'));  btn.classList.add('selected'); }
function selectColor(btn) { document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); }

async function createProject() {
  const name  = $('proj-name-input').value.trim();
  if (!name) return showToast('Bitte einen Namen eingeben','error');
  const icon  = document.querySelector('.icon-btn.selected')?.textContent||'📁';
  const color = document.querySelector('.color-btn.selected')?.style.background||'#6366f1';
  const proj  = await dbInsert('projects',{user_id:currentUser.id,name,icon,color,set_ids:[]});
  closeModal(); allProjects.unshift(proj);
  showToast(`Projekt "${name}" erstellt ✓`);
  openProject(proj.id);
}

// ── Projekt öffnen ────────────────────────────────────────────────────────────
async function openProject(id) {
  currentProject = allProjects.find(p=>p.id===id)||await dbGet('projects',`id=eq.${id}`).then(r=>r[0]);
  if (!currentProject) return;
  $('proj-name').textContent = currentProject.name;
  $('proj-icon').textContent = currentProject.icon||'📁';
  switchProjTab('sets');
  showScreen('project');
  await loadProjectSets();
  await loadProjectPlan();
  await updateProjectProgress();
}

async function updateProjectProgress() {
  if (!currentProject) return;
  const sets  = allSets.filter(s=>s.project_id===currentProject.id);
  if (!sets.length) { $('proj-progress-fill').style.width='0%'; $('proj-progress-pct').textContent='0%'; return; }
  const stats = await dbGet('quiz_stats',`user_id=eq.${currentUser.id}`);
  const setIds = sets.map(s=>s.id);
  const relevant = stats.filter(s=>setIds.includes(s.set_id));
  if (!relevant.length) { $('proj-progress-fill').style.width='0%'; $('proj-progress-pct').textContent='0%'; return; }
  const avg = Math.round(relevant.reduce((a,s)=>a+(s.score/s.total*100),0)/relevant.length);
  $('proj-progress-fill').style.width = avg+'%';
  $('proj-progress-pct').textContent  = avg+'%';
}

async function loadProjectSets() {
  const sets = await dbGet('learning_sets',`project_id=eq.${currentProject.id}&order=updated_at.desc`)||[];
  allSets = sets;
  $('proj-sets-empty').style.display = sets.length?'none':'block';
  $('proj-sets-grid').innerHTML = sets.map(s=>`
    <div class="lib-card" onclick="openSet('${s.id}')"
      onmouseenter="showSetPreview(event,'${s.id}')" onmouseleave="hideProjectPreview()">
      <div class="lib-card-title">${s.title}</div>
      <div class="lib-card-meta"><span class="subject-tag">${s.subject||'Allgemein'}</span><span>${s.flashcards?.length||0} Karten · ${s.quiz?.length||0} Fragen</span></div>
      <div class="lib-card-date">${new Date(s.updated_at).toLocaleDateString('de-CH')}</div>
    </div>`).join('');
  renderExamSetSelect(sets);
}

function showSetPreview(e, setId) {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => {
    const set = allSets.find(s=>s.id===setId);
    if (!set) return;
    const el = $('set-preview');
    $('sp-title').textContent = set.title;
    $('sp-cards').innerHTML = (set.flashcards||[]).slice(0,3).map(c=>`
      <div class="sp-set-item"><span class="sp-set-name">${c.front}</span></div>`).join('') || '<div class="sp-set-item">Keine Karteikarten</div>';
    $('sp-footer').textContent = `${set.flashcards?.length||0} Karten · ${set.quiz?.length||0} Quizfragen`;
    el.style.display='block';
    el.style.left = Math.min(e.clientX+12, window.innerWidth-220)+'px';
    el.style.top  = Math.min(e.clientY+12, window.innerHeight-200)+'px';
  }, 350);
}

function switchProjTab(tab) {
  ['sets','plan','exam'].forEach(t=>{
    $(`proj-tab-${t}`).style.display = t===tab?'block':'none';
    $(`ptab-${t}`).classList.toggle('active',t===tab);
  });
}

async function deleteCurrentProject() {
  if (!currentProject||!confirm(`Projekt "${currentProject.name}" wirklich löschen?`)) return;
  await dbDelete('projects',`id=eq.${currentProject.id}`);
  showToast('Projekt gelöscht'); showMain('home');
}

// ── Upload ────────────────────────────────────────────────────────────────────
function showUploadForProject() { uploadForProjectId=currentProject?.id||null; showScreen('upload'); resetUpload(); }
function backFromUpload()       { currentProject?showScreen('project'):showMain('home'); }
function backFromResult()       { if(currentProject){showScreen('project');loadProjectSets();}else{showMain('home');} }

function resetUpload() {
  uploadedFileData=null;
  $('file-preview').style.display=$('upload-options').style.display='none';
  $('upload-area').style.display='block'; $('file-input').value='';
}

async function handleFile(file) {
  if (!file) return;
  $('upload-area').style.display='none';
  $('file-preview').style.display=$('upload-options').style.display='block';
  $('file-preview-name').textContent=file.name;
  $('set-title-input').value=file.name.replace(/\.[^.]+$/,'');
  if (file.name.endsWith('.docx')) {
    const res = await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    uploadedFileData={type:'text',content:res.value};
  } else if (file.type==='application/pdf'||file.type.startsWith('image/')) {
    uploadedFileData={type:file.type.startsWith('image/')?'image':'pdf',content:await fileToBase64(file),mimeType:file.type};
  } else {
    uploadedFileData={type:'text',content:await file.text()};
  }
}

function fileToBase64(file) {
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});
}

function setMode(m) {
  currentMode=m;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  $(`mode-${m}`).classList.add('active');
}

async function analyzeDocument() {
  if (!uploadedFileData) return showToast('Kein Dokument geladen','error');
  const title=$('set-title-input').value.trim()||'Unbenannt';
  $('loading-overlay').style.display='flex'; $('analyze-btn').disabled=true;
  try {
    const modes=currentMode==='all'?['flashcards','summary','quiz']:[currentMode];
    let flashcards=[],summary='',quiz=[];
    for (const mode of modes) {
      $('loading-text').textContent=`Erstelle ${mode==='flashcards'?'Karteikarten':mode==='summary'?'Zusammenfassung':'Quiz'}...`;
      const result=await callBackend(buildPrompt(mode,uploadedFileData));
      if(mode==='flashcards')flashcards=parseFlashcards(result);
      if(mode==='summary')summary=result;
      if(mode==='quiz')quiz=parseQuiz(result);
    }
    currentSet={title,subject:'',flashcards,summary,quiz};
    renderResult(currentSet); showScreen('result');
  } catch(e) { showToast('Fehler: '+e.message,'error'); }
  $('loading-overlay').style.display='none'; $('analyze-btn').disabled=false;
}

function buildPrompt(mode,fileData) {
  const content=fileData.type==='text'?`\n\nDokumentinhalt:\n${fileData.content.slice(0,8000)}`:'';
  if(mode==='flashcards')return`Erstelle 15 Karteikarten. NUR JSON:\n[{"front":"Frage","back":"Antwort"}]${content}`;
  if(mode==='summary')return`Strukturierte Zusammenfassung auf Deutsch mit Markdown, 300-500 Wörter.${content}`;
  if(mode==='quiz')return`10 Quizfragen auf Deutsch, Mix aus multiple_choice/true_false/freetext. NUR JSON:\n[{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct":0},{"type":"true_false","question":"...","correct":true},{"type":"freetext","question":"...","answer":"..."}]${content}`;
}

async function callBackend(prompt) {
  const res=await fetch(`${BACKEND}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||'Backend-Fehler');}
  return(await res.json()).result;
}

function parseFlashcards(t){try{const m=t.match(/\[[\s\S]*\]/);return m?JSON.parse(m[0]):[];}catch{return[];}}
function parseQuiz(t)      {try{const m=t.match(/\[[\s\S]*\]/);return m?JSON.parse(m[0]):[];}catch{return[];}}

// ── Save Set ──────────────────────────────────────────────────────────────────
async function saveSet() {
  if (!currentSet) return;
  $('save-btn').textContent='💾 Speichern...';
  try {
    const row=await dbInsert('learning_sets',{user_id:currentUser.id,project_id:uploadForProjectId||null,title:currentSet.title,subject:currentSet.subject||'',flashcards:currentSet.flashcards,summary:currentSet.summary,quiz:currentSet.quiz});
    openSetId=row?.id; showToast('Set gespeichert ✓');
    $('save-btn').textContent='✓ Gespeichert'; $('save-btn').disabled=true;
  } catch { showToast('Fehler beim Speichern','error'); }
}

// ── Result / Flashcards ───────────────────────────────────────────────────────
function renderResult(set) {
  fcCards=set.flashcards||[]; fcIndex=0; fcDifficulty={};
  renderFlashcard();
  $('summary-content').innerHTML=set.summary?marked.parse(set.summary):'<p>Keine Zusammenfassung</p>';
  quizData=set.quiz||[]; $('quiz-start-info').textContent=`${quizData.length} Fragen`;
  $('result-title').textContent=set.title;
  const hasFc=!!fcCards.length,hasSumm=!!set.summary,hasQuiz=!!quizData.length;
  $('rtab-flash').style.display=hasFc?'':'none';
  $('rtab-summary').style.display=hasSumm?'':'none';
  $('rtab-quiz').style.display=hasQuiz?'':'none';
  if(hasFc)switchResultTab('flash');else if(hasSumm)switchResultTab('summary');else if(hasQuiz)switchResultTab('quiz');
}

function switchResultTab(tab) {
  ['flash','summary','quiz'].forEach(t=>{$(`result-${t}`).style.display=t===tab?'block':'none';$(`rtab-${t}`).classList.toggle('active',t===tab);});
  if(tab==='quiz'){$('quiz-start-screen').style.display='flex';$('quiz-play-screen').style.display='none';$('quiz-result-screen').style.display='none';}
}

function renderFlashcard() {
  if(!fcCards.length)return;
  const c=fcCards[fcIndex];
  $('fc-front-text').textContent=c.front; $('fc-back-text').textContent=c.back;
  $('fc-counter').textContent=`${fcIndex+1} / ${fcCards.length}`;
  $('fc-progress-fill').style.width=((fcIndex+1)/fcCards.length*100)+'%';
  $('fc-card').classList.remove('flipped');
  const diff=fcDifficulty[fcIndex];
  $('fc-diff-badge').textContent=diff==='easy'?'😊 Leicht':diff==='medium'?'🤔 Mittel':diff==='hard'?'😰 Schwer':'';
  $('fc-diff-badge').className=`diff-badge${diff?' diff-badge-'+diff:''}`;
}
function flipCard(){$('fc-card').classList.toggle('flipped');}
function fcNav(dir){fcIndex=Math.max(0,Math.min(fcCards.length-1,fcIndex+dir));renderFlashcard();}
function setDifficulty(d){fcDifficulty[fcIndex]=d;renderFlashcard();}
function repeatHard(){const h=fcCards.filter((_,i)=>fcDifficulty[i]==='hard');if(!h.length){showToast('Keine schwierigen Karten!');return;}fcCards=h;fcIndex=0;fcDifficulty={};renderFlashcard();showToast(`${h.length} schwierige Karten`);}

// ── Quiz ──────────────────────────────────────────────────────────────────────
function startQuiz(){quizIndex=0;quizScore=0;quizAnswered=false;quizWrong=[];$('quiz-start-screen').style.display='none';$('quiz-play-screen').style.display='block';$('quiz-result-screen').style.display='none';renderQuestion();}
function renderQuestion(){
  if(quizIndex>=quizData.length){showQuizResult();return;}
  const q=quizData[quizIndex];quizAnswered=false;
  $('quiz-q-num').textContent=`Frage ${quizIndex+1}/${quizData.length}`;
  $('quiz-q-type').textContent=q.type==='multiple_choice'?'Multiple Choice':q.type==='true_false'?'Wahr/Falsch':'Freitext';
  $('quiz-question-text').textContent=q.question;
  $('quiz-progress-fill').style.width=(quizIndex/quizData.length*100)+'%';
  $('quiz-feedback').style.display=$('quiz-next-btn').style.display=$('quiz-explanation').style.display='none';
  $('quiz-freetext-wrap').style.display='none';$('quiz-options-wrap').innerHTML='';
  if(q.type==='freetext'){$('quiz-freetext-wrap').style.display='block';$('quiz-freetext-input').value='';}
  else{(q.type==='true_false'?['Wahr','Falsch']:q.options).forEach((opt,i)=>{const b=document.createElement('button');b.className='quiz-option-btn';b.textContent=opt;b.onclick=()=>selectAnswer(i,q);$('quiz-options-wrap').appendChild(b);});}
}
function selectAnswer(i,q){
  if(quizAnswered)return;quizAnswered=true;
  const opts=document.querySelectorAll('.quiz-option-btn');let correct;
  if(q.type==='true_false'){correct=(i===0)===q.correct;opts.forEach((b,idx)=>b.classList.add(idx===(q.correct?0:1)?'correct':'wrong'));}
  else{correct=i===q.correct;opts.forEach((b,idx)=>b.classList.add(idx===q.correct?'correct':idx===i?'wrong':''));}
  if(correct)quizScore++;else quizWrong.push(q);
  showFeedback(correct,q);
}
async function submitFreetext(){
  if(quizAnswered)return;const answer=$('quiz-freetext-input').value.trim();if(!answer)return;
  quizAnswered=true;$('quiz-freetext-input').disabled=true;
  const q=quizData[quizIndex];
  const res=await callBackend(`Frage: "${q.question}"\nMusterantwort: "${q.answer}"\nAntwort: "${answer}"\nKorrekt? KORREKT oder FALSCH + kurze Erklärung.`);
  const correct=res.toUpperCase().includes('KORREKT');
  if(correct)quizScore++;else quizWrong.push(q);
  showFeedback(correct,q,res);
}
function showFeedback(correct,q,expl){
  $('quiz-feedback').style.display='block';
  $('quiz-feedback-text').innerHTML=correct?'<span class="feedback-correct">✓ Richtig!</span>':`<span class="feedback-wrong">✗ Falsch!</span> Richtig: <strong>${q.type==='true_false'?(q.correct?'Wahr':'Falsch'):q.options?.[q.correct]||q.answer}</strong>`;
  if(expl&&!correct){$('quiz-explanation').textContent=expl;$('quiz-explanation').style.display='block';}
  $('quiz-next-btn').style.display='block';
}
async function explainAnswer(){
  const q=quizData[quizIndex];$('quiz-explain-btn').textContent='Lädt...';
  const res=await callBackend(`Erkläre kurz warum diese Antwort richtig ist:\nFrage: "${q.question}"\nAntwort: "${q.type==='true_false'?(q.correct?'Wahr':'Falsch'):q.options?.[q.correct]||q.answer}"`);
  $('quiz-explanation').textContent=res;$('quiz-explanation').style.display='block';$('quiz-explain-btn').style.display='none';
}
function nextQuestion(){quizIndex++;$('quiz-freetext-input').disabled=false;renderQuestion();}
async function showQuizResult(){
  $('quiz-play-screen').style.display='none';$('quiz-result-screen').style.display='flex';
  const pct=Math.round(quizScore/quizData.length*100);
  $('quiz-result-score').textContent=pct+'%';$('quiz-result-text').textContent=`${quizScore} von ${quizData.length} richtig`;
  if(openSetId)await dbInsert('quiz_stats',{user_id:currentUser.id,set_id:openSetId,score:quizScore,total:quizData.length});
  await updateStreak();if(pct>=80)launchConfetti();
  if(quizWrong.length>0){
    $('quiz-weakness-wrap').style.display='block';$('quiz-weakness-text').textContent='Analysiere...';
    const res=await callBackend(`Schwächenanalyse – falsch:\n${quizWrong.map(q=>'- '+q.question).join('\n')}\n3-4 Sätze Analyse + Lerntipps.`);
    $('quiz-weakness-text').textContent=res;
  }
}
async function updateStreak(){
  const rows=await dbGet('user_settings',`user_id=eq.${currentUser.id}`);if(!rows||!rows.length)return;
  const s=rows[0],today=new Date().toISOString().split('T')[0];if(s.last_active===today)return;
  const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
  const streak=s.last_active===yesterday.toISOString().split('T')[0]?(s.streak||0)+1:1;
  await fetch(`${SUPA_URL}/rest/v1/user_settings?user_id=eq.${currentUser.id}`,{method:'PATCH',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify({streak,last_active:today})});
  $('streak-count').textContent=streak;
}
function restartQuiz(){quizIndex=0;quizScore=0;quizWrong=[];$('quiz-start-screen').style.display='flex';$('quiz-play-screen').style.display='none';$('quiz-result-screen').style.display='none';}

// ── Set öffnen ────────────────────────────────────────────────────────────────
async function openSet(id){
  const set=allSets.find(s=>s.id===id)||await dbGet('learning_sets',`id=eq.${id}`).then(r=>r[0]);
  if(!set)return;openSetId=id;currentSet=set;
  $('studyset-title').textContent=set.title;
  fcCards=set.flashcards||[];fcIndex=0;fcDifficulty={};
  $('ss-flash').innerHTML='';
  if(fcCards.length){
    $('ss-flash').innerHTML=`<div class="fc-progress-row"><span id="ss-fc-counter">1/${fcCards.length}</span><div class="fc-progress-bar"><div id="ss-fc-fill" class="fc-progress-fill"></div></div></div><div class="flashcard-wrap"><div class="flashcard" id="ss-fc-card" onclick="ssFlipCard()"><div class="fc-face fc-front"><div class="fc-content" id="ss-fc-front"></div></div><div class="fc-face fc-back"><div class="fc-content" id="ss-fc-back"></div></div></div></div><div class="fc-flip-hint">Klicken zum Umdrehen</div><div class="fc-actions"><button class="fc-btn" onclick="ssFcNav(-1)">← Zurück</button><button class="fc-btn" onclick="ssFcNav(1)">Weiter →</button></div>`;
    ssFcRender();
  }
  $('ss-summary').innerHTML=set.summary?`<div class="summary-wrap">${marked.parse(set.summary)}</div>`:'<p class="empty-hint">Keine Zusammenfassung</p>';
  quizData=set.quiz||[];
  $('ss-quiz').innerHTML=quizData.length?`<div class="quiz-start-card"><h3>Quiz starten</h3><p>${quizData.length} Fragen</p><button class="btn-primary" onclick="startSSQuiz()">Quiz starten →</button></div>`:'<p class="empty-hint">Kein Quiz</p>';
  switchSSTab('flash');showScreen('studyset');
}
function ssFcRender(){const c=fcCards[fcIndex];$('ss-fc-front').textContent=c.front;$('ss-fc-back').textContent=c.back;$('ss-fc-counter').textContent=`${fcIndex+1}/${fcCards.length}`;$('ss-fc-fill').style.width=((fcIndex+1)/fcCards.length*100)+'%';$('ss-fc-card').classList.remove('flipped');}
function ssFlipCard(){$('ss-fc-card').classList.toggle('flipped');}
function ssFcNav(dir){fcIndex=Math.max(0,Math.min(fcCards.length-1,fcIndex+dir));ssFcRender();}
function startSSQuiz(){$('ss-quiz').innerHTML=`<div id="quiz-start-screen" style="display:none"></div><div id="quiz-play-screen"></div><div id="quiz-result-screen" style="display:none"></div>`;startQuiz();}
function switchSSTab(tab){['flash','summary','quiz'].forEach(t=>{$(`ss-${t}`).style.display=t===tab?'block':'none';$(`sstab-${t}`).classList.toggle('active',t===tab);});}
async function deleteCurrentSet(){if(!openSetId||!confirm('Set löschen?'))return;await dbDelete('learning_sets',`id=eq.${openSetId}`);showToast('Set gelöscht');backToProject();}
function backToProject(){currentProject?showScreen('project')&&loadProjectSets():showMain('home');}

// ── Lernplan ──────────────────────────────────────────────────────────────────
async function loadProjectPlan(){
  planItems=await dbGet('study_plan',`user_id=eq.${currentUser.id}&order=date.asc`)||[];
  renderProjectPlan();
}
function renderProjectPlan(){
  const today=new Date().toISOString().split('T')[0];
  const groups={};
  planItems.forEach(item=>{if(!groups[item.date])groups[item.date]=[];groups[item.date].push(item);});
  $('proj-plan-list').innerHTML=!Object.keys(groups).length?'<p class="empty-hint">Noch keine Lernziele.</p>':
    Object.entries(groups).map(([date,items])=>{
      const isPast=date<today;
      const label=new Date(date+'T12:00:00').toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long'});
      return `<div class="plan-group ${isPast?'plan-past':''}">
        <div class="plan-date-label">${label}</div>
        ${items.map(item=>`<div class="plan-item ${item.done?'plan-done':''}">
          <input type="checkbox" ${item.done?'checked':''} onchange="togglePlanItem('${item.id}',this.checked)"/>
          <span class="${item.set_id?'plan-item-link':''}" onclick="${item.set_id?`openSet('${item.set_id}')`:''}">${item.title}</span>
          <button class="btn-ghost btn-sm plan-edit-btn" onclick="editPlanItem('${item.id}','${item.title.replace(/'/g,"\\'")}','${item.date}')">✏️</button>
          <button class="btn-ghost btn-sm btn-danger" onclick="deletePlanItem('${item.id}')">✕</button>
        </div>`).join('')}
      </div>`;
    }).join('');
}

function openAddPlanModal(){
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1rem">Lernziel hinzufügen</h3>
    <div class="auth-field"><label>Titel</label><input type="text" id="plan-title-input" placeholder="z.B. Kapitel 3 repetieren"/></div>
    <div class="auth-field"><label>Datum</label><input type="date" id="plan-date-input" value="${new Date().toISOString().split('T')[0]}"/></div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <button class="btn-primary" onclick="addPlanItem()">Hinzufügen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  $('modal-overlay').style.display='flex';
}

function editPlanItem(id, title, date){
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1rem">Termin bearbeiten</h3>
    <div class="auth-field"><label>Titel</label><input type="text" id="plan-title-input" value="${title}"/></div>
    <div class="auth-field"><label>Datum</label><input type="date" id="plan-date-input" value="${date}"/></div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <button class="btn-primary" onclick="savePlanEdit('${id}')">Speichern</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  $('modal-overlay').style.display='flex';
}

async function savePlanEdit(id){
  const title=$('plan-title-input').value.trim(),date=$('plan-date-input').value;
  if(!title||!date)return showToast('Bitte Titel und Datum angeben','error');
  await dbPatch('study_plan',`id=eq.${id}`,{title,date});
  closeModal();await loadProjectPlan();showToast('Termin aktualisiert ✓');
}

async function addPlanItem(){
  const title=$('plan-title-input').value.trim(),date=$('plan-date-input').value;
  if(!title||!date)return showToast('Bitte Titel und Datum angeben','error');
  await dbInsert('study_plan',{user_id:currentUser.id,title,date,done:false});
  closeModal();await loadProjectPlan();showToast('Lernziel hinzugefügt ✓');
}
async function togglePlanItem(id,done){await fetch(`${SUPA_URL}/rest/v1/study_plan?id=eq.${id}`,{method:'PATCH',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify({done})});const item=planItems.find(p=>p.id===id);if(item)item.done=done;renderProjectPlan();}
async function deletePlanItem(id){await dbDelete('study_plan',`id=eq.${id}`);planItems=planItems.filter(p=>p.id!==id);renderProjectPlan();}

// ── KI Lernplan ───────────────────────────────────────────────────────────────
function openAiPlanModal(){
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1rem">✨ KI-Lernplan erstellen</h3>
    <div class="auth-field"><label>Prüfungsdatum</label><input type="date" id="ai-exam-date"/></div>
    <div class="auth-field"><label>Verfügbare Tage</label>
      <div class="day-picker">${['Mo','Di','Mi','Do','Fr','Sa','So'].map((d,i)=>`<button class="day-btn" onclick="this.classList.toggle('selected')">${d}</button>`).join('')}</div>
    </div>
    <div class="auth-field"><label>Lernstunden pro Tag</label><input type="number" id="ai-hours" value="2" min="1" max="8" style="width:80px;padding:.5rem;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);outline:none"/></div>
    <div class="auth-field"><label>Was soll gelernt werden?</label><textarea id="ai-topic" placeholder="z.B. Mathematik Kapitel 1-5..." rows="3" style="width:100%;padding:.75rem;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;color:var(--text);font-family:inherit;resize:vertical;outline:none"></textarea></div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <button class="btn-primary" onclick="generateAiPlan()">✨ Erstellen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  $('modal-overlay').style.display='flex';
}

async function generateAiPlan(){
  const examDate=$('ai-exam-date').value,hours=$('ai-hours').value,topic=$('ai-topic').value.trim();
  const days=[...document.querySelectorAll('.day-btn.selected')].map(b=>b.textContent).join(', ');
  if(!examDate||!topic)return showToast('Bitte Datum und Thema angeben','error');
  if(!days)return showToast('Bitte mindestens einen Tag wählen','error');
  closeModal();showToast('KI erstellt Lernplan...');
  const today=new Date().toISOString().split('T')[0];
  const res=await callBackend(`Erstelle Lernplan von heute (${today}) bis Prüfung (${examDate}).\nVerfügbare Tage: ${days}. ${hours}h/Tag.\nThema: ${topic}.\nNUR JSON:\n[{"date":"YYYY-MM-DD","title":"Aufgabe"}]\nVerteile sinnvoll, plane Wiederholungen.`);
  try{
    const items=JSON.parse(res.match(/\[[\s\S]*\]/)[0]);
    for(const item of items)await dbInsert('study_plan',{user_id:currentUser.id,title:item.title,date:item.date,done:false});
    await loadProjectPlan();showToast(`${items.length} Termine erstellt ✓`);
  }catch{showToast('Fehler beim Erstellen','error');}
}

// ── Probeprüfung ──────────────────────────────────────────────────────────────
function renderExamSetSelect(sets){
  $('exam-sets-select').innerHTML=!sets.length?'<p class="empty-hint-small">Erst Lernsets hinzufügen</p>':
    '<div class="exam-sets-label">Lernsets auswählen:</div>'+
    sets.map(s=>`<label class="exam-set-check"><input type="checkbox" value="${s.id}" checked/> ${s.title} (${s.quiz?.length||0} Fragen)</label>`).join('');
}

async function startExam(){
  const checked=[...document.querySelectorAll('.exam-set-check input:checked')].map(c=>c.value);
  if(!checked.length)return showToast('Bitte mindestens ein Lernset wählen','error');
  const count=$('exam-q-count').value;
  let allQ=[];
  for(const id of checked){const set=allSets.find(s=>s.id===id);if(set?.quiz)allQ=[...allQ,...set.quiz];}
  if(!allQ.length)return showToast('Keine Fragen in den gewählten Sets','error');
  allQ=allQ.sort(()=>Math.random()-.5);
  examQuestions=count==='all'?allQ:allQ.slice(0,parseInt(count));
  examIndex=0;examScore=0;examAnswered=false;
  $('exam-setup').style.display='none';$('exam-play').style.display='block';
  renderExamQuestion();
}

function renderExamQuestion(){
  if(examIndex>=examQuestions.length){showExamResult();return;}
  const q=examQuestions[examIndex];examAnswered=false;
  $('exam-play').innerHTML=`
    <div class="quiz-q-meta"><div class="quiz-q-num">Frage ${examIndex+1}/${examQuestions.length}</div><div class="quiz-q-type-badge">${q.type==='multiple_choice'?'Multiple Choice':q.type==='true_false'?'Wahr/Falsch':'Freitext'}</div></div>
    <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${(examIndex/examQuestions.length*100)}%"></div></div>
    <div class="quiz-question-card">
      <p class="quiz-question-text">${q.question}</p>
      <div id="exam-opts">${q.type!=='freetext'?(q.type==='true_false'?['Wahr','Falsch']:q.options).map((o,i)=>`<button class="quiz-option-btn" onclick="selectExamAnswer(${i})">${o}</button>`).join(''):''}
      </div>
      ${q.type==='freetext'?`<textarea id="exam-ft" placeholder="Deine Antwort..." rows="3" style="width:100%;padding:.75rem;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;color:var(--text);font-family:inherit;resize:vertical;outline:none;margin-bottom:.75rem"></textarea><button class="btn-primary" onclick="submitExamFreetext()">Prüfen</button>`:''}
      <div id="exam-feedback" style="display:none;margin-top:1rem;padding:1rem;background:var(--bg3);border-radius:10px"></div>
    </div>
    <button class="btn-primary quiz-next-btn" id="exam-next" style="display:none;margin-top:1rem;width:100%" onclick="nextExamQ()">Weiter →</button>`;
}

function selectExamAnswer(i){
  if(examAnswered)return;examAnswered=true;
  const q=examQuestions[examIndex];const opts=document.querySelectorAll('#exam-opts .quiz-option-btn');let correct;
  if(q.type==='true_false'){correct=(i===0)===q.correct;opts.forEach((b,idx)=>b.classList.add(idx===(q.correct?0:1)?'correct':'wrong'));}
  else{correct=i===q.correct;opts.forEach((b,idx)=>b.classList.add(idx===q.correct?'correct':idx===i?'wrong':''));}
  if(correct)examScore++;
  $('exam-feedback').style.display='block';
  $('exam-feedback').innerHTML=correct?'<span class="feedback-correct">✓ Richtig!</span>':`<span class="feedback-wrong">✗ Falsch!</span> Richtig: <strong>${q.type==='true_false'?(q.correct?'Wahr':'Falsch'):q.options?.[q.correct]}</strong>`;
  $('exam-next').style.display='block';
}

async function submitExamFreetext(){
  if(examAnswered)return;examAnswered=true;
  const answer=document.getElementById('exam-ft').value.trim();if(!answer)return;
  const q=examQuestions[examIndex];
  const res=await callBackend(`Frage: "${q.question}"\nMusterantwort: "${q.answer}"\nAntwort: "${answer}"\nKorrekt? KORREKT oder FALSCH + kurze Erklärung.`);
  const correct=res.toUpperCase().includes('KORREKT');if(correct)examScore++;
  $('exam-feedback').style.display='block';
  $('exam-feedback').innerHTML=(correct?'<span class="feedback-correct">✓ Richtig!</span>':'<span class="feedback-wrong">✗ Falsch!</span>')+`<br><small style="color:var(--text2)">${res}</small>`;
  $('exam-next').style.display='block';
}

function nextExamQ(){examIndex++;renderExamQuestion();}
function showExamResult(){
  const pct=Math.round(examScore/examQuestions.length*100);
  $('exam-play').style.display='none';$('exam-result').style.display='block';
  $('exam-result').innerHTML=`<div class="quiz-result-card"><div class="quiz-result-score">${pct}%</div><p>${examScore} von ${examQuestions.length} Fragen richtig</p><div class="quiz-result-actions"><button class="btn-primary" onclick="resetExam()">↺ Neue Prüfung</button></div></div>`;
  if(pct>=80)launchConfetti();
}
function resetExam(){$('exam-play').style.display=$('exam-result').style.display='none';$('exam-setup').style.display='block';}

// ── Kalender ──────────────────────────────────────────────────────────────────
function loadCalendar(){const now=new Date();calYear=now.getFullYear();calMonth=now.getMonth();renderCalendar();}
function calNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}

async function renderCalendar(){
  const allPlan=await dbGet('study_plan',`user_id=eq.${currentUser.id}&order=date.asc`)||[];
  const byDate={};allPlan.forEach(item=>{if(!byDate[item.date])byDate[item.date]=[];byDate[item.date].push(item);});
  const months=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  $('cal-month-label').textContent=`${months[calMonth]} ${calYear}`;
  const first=new Date(calYear,calMonth,1),days=new Date(calYear,calMonth+1,0).getDate();
  let startDay=first.getDay();if(startDay===0)startDay=7;
  const today=new Date().toISOString().split('T')[0];
  let html='';
  for(let i=1;i<startDay;i++)html+='<div class="cal-cell cal-empty"></div>';
  for(let d=1;d<=days;d++){
    const dateStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const items=byDate[dateStr]||[];const isToday=dateStr===today;
    html+=`<div class="cal-cell ${isToday?'cal-today':''} ${items.length?'cal-has-events':''}">
      <div class="cal-day-num">${d}</div>
      ${items.slice(0,2).map(it=>`<div class="cal-event ${it.done?'cal-event-done':''}">${it.title}</div>`).join('')}
      ${items.length>2?`<div class="cal-event-more">+${items.length-2}</div>`:''}
    </div>`;
  }
  $('cal-grid').innerHTML=html;
  const upcoming=allPlan.filter(p=>p.date>=today&&!p.done).slice(0,5);
  $('cal-upcoming-list').innerHTML=!upcoming.length?'<p class="empty-hint-small">Keine kommenden Termine</p>':
    upcoming.map(p=>`<div class="plan-item"><span>📅 ${new Date(p.date+'T12:00:00').toLocaleDateString('de-CH',{weekday:'short',day:'numeric',month:'short'})}</span><span>${p.title}</span></div>`).join('');
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function toggleTimer(){const p=$('timer-panel');p.style.display=p.style.display==='none'?'block':'none';}
function timerRender(){const m=Math.floor(timerSeconds/60).toString().padStart(2,'0'),s=(timerSeconds%60).toString().padStart(2,'0');$('timer-display').textContent=`${m}:${s}`;const c=2*Math.PI*54;$('timer-ring-fill').style.strokeDashoffset=c*(1-timerSeconds/timerTotal);$('timer-ring-fill').style.strokeDasharray=c;}
function toggleTimerRun(){if(timerRunning){clearInterval(timerInterval);timerRunning=false;$('timer-start-btn').textContent='▶ Start';}else{timerRunning=true;$('timer-start-btn').textContent='⏸ Pause';timerInterval=setInterval(()=>{if(timerSeconds<=0){clearInterval(timerInterval);timerRunning=false;$('timer-start-btn').textContent='▶ Start';showToast('⏰ Zeit ist um!');return;}timerSeconds--;timerRender();},1000);}}
function resetTimer(){clearInterval(timerInterval);timerRunning=false;timerSeconds=timerTotal;$('timer-start-btn').textContent='▶ Start';timerRender();}
document.querySelectorAll('.timer-mode-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.timer-mode-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');clearInterval(timerInterval);timerRunning=false;timerTotal=timerSeconds=parseInt(btn.dataset.minutes)*60;$('timer-mode-label').textContent={'25':'🍅 Pomodoro','5':'☕ Kurze Pause','10':'🌿 Lange Pause'}[btn.dataset.minutes];$('timer-start-btn').textContent='▶ Start';timerRender();});});

// ── Theme & User ──────────────────────────────────────────────────────────────
function toggleTheme(){isDark=!isDark;document.body.classList.toggle('light-mode',!isDark);}
function toggleUserMenu(){const d=$('user-dropdown');d.style.display=d.style.display==='none'?'block':'none';}
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu'))$('user-dropdown').style.display='none';});

// ── Confetti ──────────────────────────────────────────────────────────────────
function launchConfetti(){const canvas=$('confetti-canvas'),ctx=canvas.getContext('2d');canvas.width=window.innerWidth;canvas.height=window.innerHeight;const p=Array.from({length:120},()=>({x:Math.random()*canvas.width,y:-10,vx:(Math.random()-.5)*4,vy:Math.random()*3+2,color:`hsl(${Math.random()*360},80%,60%)`,size:Math.random()*8+4,rot:Math.random()*360,rotV:(Math.random()-.5)*5}));let f;const draw=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);p.forEach(q=>{ctx.save();ctx.translate(q.x,q.y);ctx.rotate(q.rot*Math.PI/180);ctx.fillStyle=q.color;ctx.fillRect(-q.size/2,-q.size/2,q.size,q.size);ctx.restore();q.x+=q.vx;q.y+=q.vy;q.rot+=q.rotV;});if(p.some(q=>q.y<canvas.height))f=requestAnimationFrame(draw);else ctx.clearRect(0,0,canvas.width,canvas.height);};draw();setTimeout(()=>{cancelAnimationFrame(f);ctx.clearRect(0,0,canvas.width,canvas.height);},5000);}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
window.addEventListener('load',()=>{
  const ua=$('upload-area');
  if(ua){ua.addEventListener('dragover',e=>{e.preventDefault();ua.classList.add('drag-over');});ua.addEventListener('dragleave',()=>ua.classList.remove('drag-over'));ua.addEventListener('drop',e=>{e.preventDefault();ua.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)handleFile(f);});}
});

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(!currentUser)return;
  if($('screen-result')?.style.display!=='none'&&$('result-flash')?.style.display!=='none'){
    if(e.key===' '){e.preventDefault();flipCard();}
    if(e.key==='ArrowRight')fcNav(1);if(e.key==='ArrowLeft')fcNav(-1);
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
timerRender();
tryRestoreSession();
