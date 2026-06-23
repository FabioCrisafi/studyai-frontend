// StudyAI v7
const BACKEND   = 'https://studyai-backend-gray.vercel.app';
const SUPA_URL  = 'https://pxskdaweaclfmhtjohxj.supabase.co';
const SUPA_ANON = 'sb_publishable_zmDuqGl6vDlfbMm5TqWXeA_oJ5Op2qj';

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser = null, userToken = null;
let allProjects = [], currentProject = null;
let allSets = [], currentSet = null, openSetId = null;
let projectFiles = []; // Dateien im aktuellen Projekt
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
const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6'];

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type='success') {
  const t=$('toast'); t.textContent=msg; t.className=`toast show ${type}`;
  setTimeout(()=>t.className='toast',3000);
}

// ── Screens ───────────────────────────────────────────────────────────────────
function showMain(name) {
  document.querySelectorAll('.screen').forEach(s=>s.style.display='none');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  $(`screen-${name}`).style.display='block';
  $(`nav-${name}`)?.classList.add('active');
  if(name==='home')     loadHome();
  if(name==='calendar') loadCalendar();
}
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s=>s.style.display='none');
  $(`screen-${name}`).style.display='block';
}
function closeModal() { $('modal-overlay').style.display='none'; }

// ── PWA ───────────────────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall=e; $('install-btn').style.display='block';
});
function installPWA() {
  if(!deferredInstall)return;
  deferredInstall.prompt();
  deferredInstall.userChoice.then(()=>{deferredInstall=null;$('install-btn').style.display='none';});
}
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));

// ── Auth ──────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  $('tab-login').classList.toggle('active',tab==='login');
  $('tab-signup').classList.toggle('active',tab==='signup');
  $('auth-login-form').style.display=tab==='login'?'block':'none';
  $('auth-signup-form').style.display=tab==='signup'?'block':'none';
  $('auth-error').style.display=$('auth-success').style.display='none';
}
function showAuthError(msg){$('auth-error').textContent=msg;$('auth-error').style.display='block';$('auth-success').style.display='none';}
function showAuthSuccess(msg){$('auth-success').textContent=msg;$('auth-success').style.display='block';$('auth-error').style.display='none';}

async function doSignup() {
  const name=$('signup-name').value.trim(),email=$('signup-email').value.trim(),password=$('signup-password').value;
  if(!name||!email||!password)return showAuthError('Bitte alle Felder ausfüllen.');
  if(password.length<6)return showAuthError('Passwort mind. 6 Zeichen.');
  $('signup-btn-text').textContent='Wird erstellt...';
  try {
    const res=await fetch(`${SUPA_URL}/auth/v1/signup`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_ANON},body:JSON.stringify({email,password,data:{name}})});
    const data=await res.json();
    if(data.error)throw new Error(data.error.message||data.msg);
    if(data.session){await initSession(data.session,name);}
    else{
      // E-Mail-Bestätigung ist deaktiviert → direkt einloggen
      const loginRes=await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_ANON},body:JSON.stringify({email,password})});
      const loginData=await loginRes.json();
      if(loginData.access_token)await initSession(loginData,name);
      else showAuthSuccess('Konto erstellt! Du kannst dich jetzt anmelden.');
    }
  }catch(e){showAuthError(e.message);}
  $('signup-btn-text').textContent='Konto erstellen';
}

async function doLogin() {
  const email=$('login-email').value.trim(),password=$('login-password').value;
  if(!email||!password)return showAuthError('Bitte E-Mail und Passwort eingeben.');
  $('login-btn-text').textContent='Anmelden...';
  try {
    const res=await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_ANON},body:JSON.stringify({email,password})});
    const data=await res.json();
    if(data.error||data.error_description)throw new Error(data.error_description||data.error);
    await initSession(data,null);
  }catch(e){showAuthError('Login fehlgeschlagen: '+e.message);}
  $('login-btn-text').textContent='Anmelden';
}

async function doLogout() {
  try{await fetch(`${SUPA_URL}/auth/v1/logout`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_ANON,'Authorization':`Bearer ${userToken}`}});}catch{}
  currentUser=null;userToken=null;localStorage.removeItem('sai_session');
  $('app').style.display='none';$('auth-screen').style.display='flex';
}

async function initSession(session,nameOverride) {
  userToken=session.access_token; currentUser=session.user;
  const name=nameOverride||currentUser.user_metadata?.name||currentUser.email.split('@')[0];
  currentUser.displayName=name;
  localStorage.setItem('sai_session',JSON.stringify({access_token:userToken,user:currentUser}));
  $('auth-screen').style.display='none'; $('app').style.display='block';
  $('user-avatar').textContent=name.charAt(0).toUpperCase();
  $('user-dropdown-name').textContent=name; $('user-dropdown-email').textContent=currentUser.email;
  await ensureUserSettings();
  checkTodayNotifications();
  showMain('home');
}

async function tryRestoreSession() {
  const saved=localStorage.getItem('sai_session');
  if(!saved)return;
  try {
    const s=JSON.parse(saved);
    const res=await fetch(`${SUPA_URL}/auth/v1/user`,{headers:{'apikey':SUPA_ANON,'Authorization':`Bearer ${s.access_token}`}});
    if(!res.ok){localStorage.removeItem('sai_session');return;}
    s.user=await res.json();
    await initSession(s,null);
  }catch{localStorage.removeItem('sai_session');}
}

// ── DB ────────────────────────────────────────────────────────────────────────
function dbH(){return{'Content-Type':'application/json','apikey':SUPA_ANON,'Authorization':`Bearer ${userToken}`};}
async function dbGet(table,params=''){const r=await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`,{headers:dbH()});return r.ok?r.json():[];}
async function dbInsert(table,body){const r=await fetch(`${SUPA_URL}/rest/v1/${table}`,{method:'POST',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify(body)});const d=await r.json();return Array.isArray(d)?d[0]:d;}
async function dbPatch(table,filter,body){return(await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`,{method:'PATCH',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify(body)})).ok;}
async function dbDelete(table,filter){return(await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`,{method:'DELETE',headers:dbH()})).ok;}

async function ensureUserSettings(){
  const rows=await dbGet('user_settings',`user_id=eq.${currentUser.id}`);
  if(!rows||!rows.length)await dbInsert('user_settings',{user_id:currentUser.id,streak:0,theme:'dark',activity_log:{}});
  updateStreakUI();
}
async function updateStreakUI(){
  const rows=await dbGet('user_settings',`user_id=eq.${currentUser.id}`);
  if(rows&&rows.length)$('streak-count').textContent=rows[0].streak||0;
}

// ── Notifications ─────────────────────────────────────────────────────────────
async function checkTodayNotifications(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default')await Notification.requestPermission();
  if(Notification.permission!=='granted')return;
  const today=new Date().toISOString().split('T')[0];
  const items=await dbGet('study_plan',`user_id=eq.${currentUser.id}&date=eq.${today}&done=eq.false`);
  if(items&&items.length>0)new Notification('📚 StudyAI – Lerntermine heute',{body:items.map(i=>i.title).join(', '),icon:'/icon-192.png'});
}

// ── Home ──────────────────────────────────────────────────────────────────────
async function loadHome(){
  const hour=new Date().getHours();
  $('home-greeting').textContent=`${hour<12?'Guten Morgen':hour<17?'Guten Tag':'Guten Abend'}, ${currentUser.displayName}! 👋`;
  $('projects-loading').style.display='block';
  allProjects=await dbGet('projects',`user_id=eq.${currentUser.id}&order=created_at.desc`)||[];
  allSets=await dbGet('learning_sets',`user_id=eq.${currentUser.id}`)||[];
  const stats=await dbGet('quiz_stats',`user_id=eq.${currentUser.id}`)||[];
  $('projects-loading').style.display='none';
  $('hs-projects').textContent=allProjects.length;
  $('hs-sets').textContent=allSets.length;
  $('hs-streak').textContent=$('streak-count').textContent;
  if(stats.length>0){const avg=Math.round(stats.reduce((a,s)=>a+(s.score/s.total*100),0)/stats.length);$('hs-score').textContent=avg+'%';}
  if(!allProjects.length){$('projects-empty').style.display='block';$('projects-grid').innerHTML='';return;}
  $('projects-empty').style.display='none';
  $('projects-grid').innerHTML=allProjects.map(p=>{
    const sets=allSets.filter(s=>s.project_id===p.id);
    return`<div class="project-card" onclick="openProject('${p.id}')" style="border-top:3px solid ${p.color||'#6366f1'}">
      <div class="proj-card-icon">${p.icon||'📁'}</div>
      <div class="proj-card-name">${p.name}</div>
      <div class="proj-card-meta">${sets.length} Lernset${sets.length!==1?'s':''}</div>
    </div>`;
  }).join('');
}

// ── Projekt Modal ─────────────────────────────────────────────────────────────
function openNewProjectModal(){
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1.25rem">Neues Projekt</h3>
    <div class="auth-field"><label>Name</label><input type="text" id="proj-name-input" placeholder="z.B. Mathematik Prüfung"/></div>
    <div class="auth-field"><label>Icon</label><div class="icon-picker">${ICONS.map(ic=>`<button class="icon-btn" onclick="selectIcon(this)">${ic}</button>`).join('')}</div></div>
    <div class="auth-field"><label>Farbe</label><div class="color-picker">${COLORS.map(c=>`<button class="color-btn" style="background:${c}" onclick="selectColor(this)"></button>`).join('')}</div></div>
    <div style="display:flex;gap:.75rem;margin-top:1.25rem">
      <button class="btn-primary" onclick="createProject()">Erstellen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  setTimeout(()=>{document.querySelector('.icon-btn')?.classList.add('selected');document.querySelector('.color-btn')?.classList.add('selected');},10);
  $('modal-overlay').style.display='flex';
}
function selectIcon(btn){document.querySelectorAll('.icon-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');}
function selectColor(btn){document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');}

async function createProject(){
  const name=$('proj-name-input').value.trim();
  if(!name)return showToast('Bitte einen Namen eingeben','error');
  const icon=document.querySelector('.icon-btn.selected')?.textContent||'📁';
  const color=document.querySelector('.color-btn.selected')?.style.background||'#6366f1';
  const proj=await dbInsert('projects',{user_id:currentUser.id,name,icon,color,set_ids:[]});
  closeModal();allProjects.unshift(proj);
  showToast(`Projekt "${name}" erstellt ✓`);
  openProject(proj.id);
}

// ── Projekt öffnen ────────────────────────────────────────────────────────────
async function openProject(id){
  currentProject=allProjects.find(p=>p.id===id)||await dbGet('projects',`id=eq.${id}`).then(r=>r[0]);
  if(!currentProject)return;
  $('proj-name').textContent=currentProject.name;
  $('proj-icon').textContent=currentProject.icon||'📁';
  showScreen('project');
  switchProjTab('files');
  await Promise.all([loadProjectFiles(),loadProjectSets(),loadProjectPlan()]);
  updateProjectProgress();
}

async function updateProjectProgress(){
  const sets=allSets.filter(s=>s.project_id===currentProject?.id);
  if(!sets.length){$('proj-progress-fill').style.width='0%';$('proj-progress-pct').textContent='0%';return;}
  const stats=await dbGet('quiz_stats',`user_id=eq.${currentUser.id}`);
  const relevant=stats.filter(s=>sets.map(x=>x.id).includes(s.set_id));
  if(!relevant.length){$('proj-progress-fill').style.width='0%';$('proj-progress-pct').textContent='0%';return;}
  const avg=Math.round(relevant.reduce((a,s)=>a+(s.score/s.total*100),0)/relevant.length);
  $('proj-progress-fill').style.width=avg+'%';$('proj-progress-pct').textContent=avg+'%';
}

async function deleteCurrentProject(){
  if(!currentProject||!confirm(`Projekt "${currentProject.name}" wirklich löschen?`))return;
  await dbDelete('projects',`id=eq.${currentProject.id}`);
  showToast('Projekt gelöscht');showMain('home');
}

function switchProjTab(tab){
  ['files','sets','plan','exam'].forEach(t=>{
    $(`proj-tab-${t}`).style.display=t===tab?'block':'none';
    $(`ptab-${t}`).classList.toggle('active',t===tab);
  });
}

// ── Datei-Hub ────────────────────────────────────────────────────────────────
async function loadProjectFiles(){
  projectFiles=await dbGet('project_files',`project_id=eq.${currentProject.id}&order=created_at.desc`)||[];
  renderHubFiles();
}

function renderHubFiles(){
  const list=$('hub-files-list');
  if(!projectFiles.length){list.innerHTML='<p class="empty-hint-small" style="margin-top:1rem">Noch keine Dateien hochgeladen.</p>';$('hub-actions').style.display='none';return;}
  $('hub-actions').style.display='flex';
  list.innerHTML=`<div class="hub-files-grid">`+projectFiles.map(f=>`
    <div class="hub-file-card">
      <div class="hub-file-icon">${fileIcon(f.file_type)}</div>
      <div class="hub-file-name">${f.name}</div>
      <button class="btn-ghost btn-sm btn-danger" onclick="deleteHubFile('${f.id}')">✕</button>
    </div>`).join('')+'</div>';
}

function fileIcon(type){
  if(type==='pdf')return'📄';
  if(type==='image')return'🖼️';
  if(type==='docx')return'📝';
  return'📃';
}

async function handleHubFiles(files){
  if(!files||!files.length)return;
  showToast(`Lade ${files.length} Datei${files.length>1?'en':''} hoch...`);
  for(const file of Array.from(files)){
    try{
      let content='',fileType='text';
      if(file.name.endsWith('.docx')){
        const res=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
        content=res.value; fileType='docx';
      }else if(file.type==='application/pdf'||file.name.endsWith('.pdf')){
        content=await pdfToText(file); fileType='pdf';
      }else{
        content=await file.text(); fileType='text';
      }
      content=content.slice(0,8000);
      if(!content.trim()){showToast(`${file.name}: kein Text gefunden`,'error');continue;}
      const saved=await dbInsert('project_files',{user_id:currentUser.id,project_id:currentProject.id,name:file.name,content,file_type:fileType});
      projectFiles.unshift(saved);
    }catch(e){showToast(`Fehler bei ${file.name}: ${e.message}`,'error');}
  }
  renderHubFiles();
  showToast('Dateien hochgeladen ✓');
  // Automatisch anbieten Lernsets zu erstellen
  setTimeout(()=>createSetsFromFiles(),600);
}

async function deleteHubFile(id){
  await dbDelete('project_files',`id=eq.${id}`);
  projectFiles=projectFiles.filter(f=>f.id!==id);
  renderHubFiles();
  showToast('Datei gelöscht');
}

// ── Lernsets aus Dateien erstellen ────────────────────────────────────────────
async function createSetsFromFiles(){
  if(!projectFiles.length)return showToast('Keine Dateien vorhanden','error');
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1rem">✨ Lernsets erstellen</h3>
    <p style="color:var(--text2);margin-bottom:1rem">Aus diesen ${projectFiles.length} Dateien wird je ein Lernset erstellt:</p>
    <div class="hub-file-select">
      ${projectFiles.map(f=>`<label class="exam-set-check"><input type="checkbox" value="${f.id}" checked/> ${fileIcon(f.file_type)} ${f.name}</label>`).join('')}
    </div>
    <div class="auth-field" style="margin-top:1rem"><label>Was erstellen?</label>
      <div class="mode-buttons" style="margin-top:.5rem">
        <button class="mode-btn active" id="hub-mode-all" onclick="setHubMode('all',this)">🎯 Alles</button>
        <button class="mode-btn" id="hub-mode-flashcards" onclick="setHubMode('flashcards',this)">🃏 Karten</button>
        <button class="mode-btn" id="hub-mode-quiz" onclick="setHubMode('quiz',this)">❓ Quiz</button>
      </div>
    </div>
    <div style="display:flex;gap:.75rem;margin-top:1.25rem">
      <button class="btn-primary" onclick="runCreateSets()">✨ Jetzt erstellen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  $('modal-overlay').style.display='flex';
  window._hubMode='all';
}

function setHubMode(mode,btn){
  window._hubMode=mode;
  document.querySelectorAll('#modal-content .mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

async function runCreateSets(){
  const checked=[...document.querySelectorAll('.hub-file-select input:checked')].map(c=>c.value);
  if(!checked.length)return showToast('Bitte mindestens eine Datei wählen','error');
  const mode=window._hubMode||'all';
  closeModal();
  const selectedFiles=projectFiles.filter(f=>checked.includes(f.id));
  showToast(`Erstelle ${selectedFiles.length} Lernset${selectedFiles.length>1?'s':''}...`);
  let created=0;
  for(const file of selectedFiles){
    try{
      $('projects-loading') && ($('projects-loading').style.display='none');
      const modes=mode==='all'?['flashcards','summary','quiz']:[mode];
      let flashcards=[],summary='',quiz=[];
      const contentForPrompt=file.content.slice(0,6000);
      for(const m of modes){
        const prompt=buildPromptFromContent(m,contentForPrompt,file.name);
        const result=await callBackend(prompt);
        if(m==='flashcards')flashcards=parseFlashcards(result);
        if(m==='summary')summary=result;
        if(m==='quiz')quiz=parseQuiz(result);
      }
      await dbInsert('learning_sets',{user_id:currentUser.id,project_id:currentProject.id,title:file.name.replace(/\.[^.]+$/,''),subject:'',flashcards,summary,quiz});
      created++;
      showToast(`${created}/${selectedFiles.length} Lernsets erstellt...`);
    }catch(e){showToast(`Fehler bei ${file.name}`,'error');}
  }
  await loadProjectSets();
  showToast(`${created} Lernset${created!==1?'s':''} erstellt ✓`);
  switchProjTab('sets');
}

function buildPromptFromContent(mode,content,filename){
  const ctx=`\n\nDokument "${filename}":\n${content}`;
  if(mode==='flashcards')return`Erstelle 15 Karteikarten aus diesem Dokument. NUR JSON:\n[{"front":"Frage","back":"Antwort"}]${ctx}`;
  if(mode==='summary')return`Strukturierte Zusammenfassung auf Deutsch mit Markdown, 300-500 Wörter.${ctx}`;
  if(mode==='quiz')return`10 Quizfragen auf Deutsch. NUR JSON:\n[{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct":0},{"type":"true_false","question":"...","correct":true},{"type":"freetext","question":"...","answer":"..."}]${ctx}`;
}

// ── KI Lernplan aus Dateien ───────────────────────────────────────────────────
function openAiPlanFromFiles(){
  if(!projectFiles.length)return showToast('Keine Dateien vorhanden','error');
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1rem">📅 KI-Lernplan aus Dateien</h3>
    <p style="color:var(--text2);margin-bottom:1rem">Die KI analysiert deine Dateien und erstellt einen optimalen Lernplan.</p>
    <div class="auth-field"><label>Prüfungsdatum</label><input type="date" id="ai-exam-date"/></div>
    <div class="auth-field"><label>Verfügbare Tage</label>
      <div class="day-picker">${['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=>`<button class="day-btn" onclick="this.classList.toggle('selected')">${d}</button>`).join('')}</div>
    </div>
    <div class="auth-field"><label>Stunden pro Tag</label>
      <input type="number" id="ai-hours" value="2" min="1" max="8" style="width:80px;padding:.5rem;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);outline:none"/>
    </div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <button class="btn-primary" onclick="generateAiPlanFromFiles()">✨ Erstellen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  $('modal-overlay').style.display='flex';
}

// Berechnet alle Daten zwischen heute und Prüfung die auf erlaubte Wochentage fallen
// dayLabels = ['Mo','Di',...] → JS: 1=Mo ... 0=So
function computeAllowedDates(examDate, dayLabels){
  const map={'Mo':1,'Di':2,'Mi':3,'Do':4,'Fr':5,'Sa':6,'So':0};
  const allowed=dayLabels.map(d=>map[d]);
  const dates=[];
  const cur=new Date(); cur.setHours(12,0,0,0);
  const end=new Date(examDate+'T12:00:00');
  while(cur<=end){
    if(allowed.includes(cur.getDay())) dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate()+1);
  }
  return dates;
}

async function generateAiPlanFromFiles(){
  const examDate=$('ai-exam-date').value,hours=$('ai-hours').value;
  const dayLabels=[...document.querySelectorAll('.day-btn.selected')].map(b=>b.textContent);
  if(!examDate)return showToast('Bitte Prüfungsdatum angeben','error');
  if(!dayLabels.length)return showToast('Bitte Tage wählen','error');
  const allowedDates=computeAllowedDates(examDate,dayLabels);
  if(!allowedDates.length)return showToast('Keine passenden Tage bis zur Prüfung','error');
  closeModal();showToast('KI analysiert Dateien und erstellt Lernplan...');
  const filesSummary=projectFiles.map(f=>`- ${f.name}: ${f.content.slice(0,500)}`).join('\n');
  const prompt=`Du bist ein Lernplaner. Erstelle einen Lernplan für die Prüfung am ${examDate}.
Lerne ${hours}h pro Lerntag.
Folgende Dokumente müssen gelernt werden:
${filesSummary}

WICHTIG: Du darfst NUR diese exakten Daten verwenden (keine anderen!):
${allowedDates.join(', ')}

Verteile den Lernstoff sinnvoll auf diese Tage. Plane Wiederholungen gegen Ende.
Antworte NUR mit JSON-Array, jedes Datum muss aus der erlaubten Liste sein:
[{"date":"YYYY-MM-DD","title":"Lernaufgabe"}]
Kein Text ausserhalb des JSON!`;
  try{
    const res=await callBackend(prompt);
    let items=JSON.parse(res.match(/\[[\s\S]*\]/)[0]);
    // Sicherheit: nur erlaubte Daten durchlassen
    items=items.filter(it=>allowedDates.includes(it.date));
    for(const item of items)await dbInsert('study_plan',{user_id:currentUser.id,title:item.title,date:item.date,done:false,project_id:currentProject.id});
    await loadProjectPlan();
    showToast(`${items.length} Lerntermine erstellt ✓`);
    switchProjTab('plan');
  }catch{showToast('Fehler beim Erstellen','error');}
}

// ── Lernsets laden ────────────────────────────────────────────────────────────
async function loadProjectSets(){
  allSets=await dbGet('learning_sets',`project_id=eq.${currentProject.id}&order=updated_at.desc`)||[];
  $('proj-sets-empty').style.display=allSets.length?'none':'block';
  $('proj-sets-grid').innerHTML=allSets.map(s=>`
    <div class="lib-card" onclick="openSet('${s.id}')">
      <div class="lib-card-title">${s.title}</div>
      <div class="lib-card-meta">
        <span class="subject-tag">${s.subject||'Allgemein'}</span>
        <span>${s.flashcards?.length||0} Karten · ${s.quiz?.length||0} Fragen</span>
      </div>
      <div class="lib-card-date">${new Date(s.updated_at).toLocaleDateString('de-CH')}</div>
    </div>`).join('');
  renderExamSetSelect(allSets);
}

// ── Upload (Einzeln) ──────────────────────────────────────────────────────────
function showUploadForProject(){
  uploadForProjectId=currentProject?.id||null;
  // Wenn bereits Dateien im Hub sind, Auswahl anbieten
  if(projectFiles.length){
    $('modal-content').innerHTML=`
      <h3 style="margin-bottom:1rem">Neues Lernset</h3>
      <p style="color:var(--text2);margin-bottom:1rem">Aus welcher Quelle?</p>
      <button class="btn-primary" style="width:100%;margin-bottom:.6rem" onclick="closeModal();createSetsFromFiles()">📂 Aus hochgeladenen Dateien (${projectFiles.length})</button>
      <button class="btn-ghost" style="width:100%" onclick="closeModal();openSingleUpload()">⬆️ Neue Datei hochladen</button>`;
    $('modal-overlay').style.display='flex';
  } else {
    openSingleUpload();
  }
}
function openSingleUpload(){showScreen('upload');resetUpload();}
function backFromUpload(){currentProject?showScreen('project'):showMain('home');}
function backFromResult(){if(currentProject){showScreen('project');loadProjectSets();}else showMain('home');}

function resetUpload(){
  uploadedFileData=null;
  $('file-preview').style.display=$('upload-options').style.display='none';
  $('upload-area').style.display='block';$('file-input').value='';
}

async function handleFile(file){
  if(!file)return;
  $('upload-area').style.display='none';
  $('file-preview').style.display=$('upload-options').style.display='block';
  $('file-preview-name').textContent=file.name;
  $('set-title-input').value=file.name.replace(/\.[^.]+$/,'');
  if(file.name.endsWith('.docx')){const res=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});uploadedFileData={type:'text',content:res.value};}
  else if(file.type==='application/pdf'||file.name.endsWith('.pdf')){uploadedFileData={type:'text',content:await pdfToText(file)};}
  else{uploadedFileData={type:'text',content:await file.text()};}
}

function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});}

// PDF-Text im Browser extrahieren
async function pdfToText(file){
  const ab=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  let text='';
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    text+=content.items.map(it=>it.str).join(' ')+'\n';
  }
  return text;
}

function setMode(m){currentMode=m;document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));$(`mode-${m}`).classList.add('active');}

async function analyzeDocument(){
  if(!uploadedFileData)return showToast('Kein Dokument geladen','error');
  const title=$('set-title-input').value.trim()||'Unbenannt';
  $('loading-overlay').style.display='flex';$('analyze-btn').disabled=true;
  try{
    const modes=currentMode==='all'?['flashcards','summary','quiz']:[currentMode];
    let flashcards=[],summary='',quiz=[];
    for(const mode of modes){
      $('loading-text').textContent=`Erstelle ${mode==='flashcards'?'Karteikarten':mode==='summary'?'Zusammenfassung':'Quiz'}...`;
      const content=uploadedFileData.content.slice(0,8000);
      const result=await callBackend(buildPromptFromContent(mode,content,title));
      if(mode==='flashcards')flashcards=parseFlashcards(result);
      if(mode==='summary')summary=result;
      if(mode==='quiz')quiz=parseQuiz(result);
    }
    currentSet={title,subject:'',flashcards,summary,quiz};
    renderResult(currentSet);showScreen('result');
  }catch(e){showToast('Fehler: '+e.message,'error');}
  $('loading-overlay').style.display='none';$('analyze-btn').disabled=false;
}

async function callBackend(prompt){
  const res=await fetch(`${BACKEND}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||'Backend-Fehler');}
  return(await res.json()).result;
}

function parseFlashcards(t){try{const m=t.match(/\[[\s\S]*\]/);return m?JSON.parse(m[0]):[];}catch{return[];}}
function parseQuiz(t){try{const m=t.match(/\[[\s\S]*\]/);return m?JSON.parse(m[0]):[];}catch{return[];}}

// ── Save Set ──────────────────────────────────────────────────────────────────
async function saveSet(){
  if(!currentSet)return;
  $('save-btn').textContent='💾 Speichern...';
  try{
    const row=await dbInsert('learning_sets',{user_id:currentUser.id,project_id:uploadForProjectId||null,title:currentSet.title,subject:currentSet.subject||'',flashcards:currentSet.flashcards,summary:currentSet.summary,quiz:currentSet.quiz});
    openSetId=row?.id;showToast('Set gespeichert ✓');
    $('save-btn').textContent='✓ Gespeichert';$('save-btn').disabled=true;
  }catch{showToast('Fehler beim Speichern','error');}
}

// ── Result / Flashcards ───────────────────────────────────────────────────────
function renderResult(set, isSaved){
  fcCards=set.flashcards||[];fcIndex=0;fcDifficulty={};
  renderFlashcard();
  $('summary-content').innerHTML=set.summary?marked.parse(set.summary):'<p>Keine Zusammenfassung</p>';
  quizData=set.quiz||[];$('quiz-start-info').textContent=`${quizData.length} Fragen`;
  $('result-title').textContent=set.title;
  // Speichern-Button nur bei neuem (ungespeichertem) Set
  if(isSaved){$('save-btn').style.display='none';}
  else{$('save-btn').style.display='';$('save-btn').textContent='💾 Speichern';$('save-btn').disabled=false;}
  const hasFc=!!fcCards.length,hasSumm=!!set.summary,hasQuiz=!!quizData.length;
  $('rtab-flash').style.display=hasFc?'':'none';
  $('rtab-summary').style.display=hasSumm?'':'none';
  $('rtab-quiz').style.display=hasQuiz?'':'none';
  if(hasFc)switchResultTab('flash');else if(hasSumm)switchResultTab('summary');else if(hasQuiz)switchResultTab('quiz');
}

function switchResultTab(tab){
  ['flash','summary','quiz'].forEach(t=>{
    $(`result-${t}`).style.display=t===tab?'block':'none';
    $(`rtab-${t}`).classList.toggle('active',t===tab);
  });
  if(tab==='quiz'){
    $('quiz-start-screen').style.display='block';
    $('quiz-play-screen').style.display='none';
    $('quiz-result-screen').style.display='none';
  }
}

function renderFlashcard(){
  if(!fcCards.length)return;
  const c=fcCards[fcIndex];
  $('fc-front-text').textContent=c.front;$('fc-back-text').textContent=c.back;
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
function startQuiz(){
  quizIndex=0;quizScore=0;quizAnswered=false;quizWrong=[];
  $('quiz-start-screen').style.display='none';
  $('quiz-play-screen').style.display='block';
  $('quiz-result-screen').style.display='none';
  renderQuestion();
}

function renderQuestion(){
  if(quizIndex>=quizData.length){showQuizResult();return;}
  const q=quizData[quizIndex];quizAnswered=false;
  $('quiz-q-num').textContent=`Frage ${quizIndex+1}/${quizData.length}`;
  $('quiz-q-type').textContent=q.type==='multiple_choice'?'Multiple Choice':q.type==='true_false'?'Wahr/Falsch':'Freitext';
  $('quiz-question-text').textContent=q.question;
  $('quiz-progress-fill').style.width=(quizIndex/quizData.length*100)+'%';
  $('quiz-feedback').style.display='none';
  $('quiz-next-btn').style.display='none';
  $('quiz-explanation').style.display='none';
  $('quiz-freetext-wrap').style.display='none';
  $('quiz-options-wrap').innerHTML='';
  if(q.type==='freetext'){
    $('quiz-freetext-wrap').style.display='block';
    $('quiz-freetext-input').value='';
    $('quiz-freetext-input').disabled=false;
  } else {
    const opts=q.type==='true_false'?['Wahr','Falsch']:q.options;
    opts.forEach((opt,i)=>{
      const b=document.createElement('button');
      b.className='quiz-option-btn';
      b.textContent=opt;
      b.onclick=()=>selectAnswer(i,q);
      $('quiz-options-wrap').appendChild(b);
    });
  }
}

function selectAnswer(i,q){
  if(quizAnswered)return;quizAnswered=true;
  const opts=document.querySelectorAll('#quiz-options-wrap .quiz-option-btn');
  let correct;
  if(q.type==='true_false'){
    correct=(i===0)===q.correct;
    opts.forEach((b,idx)=>b.classList.add(idx===(q.correct?0:1)?'correct':'wrong'));
  }else{
    correct=i===q.correct;
    opts.forEach((b,idx)=>b.classList.add(idx===q.correct?'correct':idx===i?'wrong':''));
  }
  opts.forEach(b=>b.onclick=null); // Klicks deaktivieren
  if(correct)quizScore++;else quizWrong.push(q);
  showFeedback(correct,q);
}

async function submitFreetext(){
  if(quizAnswered)return;
  const answer=$('quiz-freetext-input').value.trim();if(!answer)return;
  quizAnswered=true;$('quiz-freetext-input').disabled=true;
  const q=quizData[quizIndex];
  const res=await callBackend(`Frage: "${q.question}"\nMusterantwort: "${q.answer}"\nAntwort: "${answer}"\nKorrekt? KORREKT oder FALSCH + kurze Erklärung.`);
  const correct=res.toUpperCase().includes('KORREKT');
  if(correct)quizScore++;else quizWrong.push(q);
  showFeedback(correct,q,res);
}

function showFeedback(correct,q,expl){
  $('quiz-feedback').style.display='block';
  $('quiz-feedback-text').innerHTML=correct
    ?'<span class="feedback-correct">✓ Richtig!</span>'
    :`<span class="feedback-wrong">✗ Falsch!</span> Richtig: <strong>${q.type==='true_false'?(q.correct?'Wahr':'Falsch'):q.options?.[q.correct]||q.answer}</strong>`;
  if(expl&&!correct){$('quiz-explanation').textContent=expl;$('quiz-explanation').style.display='block';}
  $('quiz-next-btn').style.display='block';
}

async function explainAnswer(){
  const q=quizData[quizIndex];$('quiz-explain-btn').textContent='Lädt...';
  const res=await callBackend(`Erkläre kurz warum diese Antwort richtig ist:\nFrage: "${q.question}"\nAntwort: "${q.type==='true_false'?(q.correct?'Wahr':'Falsch'):q.options?.[q.correct]||q.answer}"`);
  $('quiz-explanation').textContent=res;$('quiz-explanation').style.display='block';$('quiz-explain-btn').style.display='none';
}

function nextQuestion(){quizIndex++;renderQuestion();}

async function showQuizResult(){
  $('quiz-play-screen').style.display='none';$('quiz-result-screen').style.display='block';
  const pct=Math.round(quizScore/quizData.length*100);
  $('quiz-result-score').textContent=pct+'%';$('quiz-result-text').textContent=`${quizScore} von ${quizData.length} richtig`;
  if(openSetId)await dbInsert('quiz_stats',{user_id:currentUser.id,set_id:openSetId,score:quizScore,total:quizData.length});
  await updateStreak();if(pct>=80)launchConfetti();
  if(quizWrong.length>0){
    $('quiz-weakness-wrap').style.display='block';$('quiz-weakness-text').textContent='Analysiere...';
    const res=await callBackend(`Schwächenanalyse:\n${quizWrong.map(q=>'- '+q.question).join('\n')}\n3-4 Sätze + Lerntipps.`);
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
function restartQuiz(){quizIndex=0;quizScore=0;quizWrong=[];$('quiz-start-screen').style.display='block';$('quiz-play-screen').style.display='none';$('quiz-result-screen').style.display='none';}

// ── Set öffnen ────────────────────────────────────────────────────────────────
async function openSet(id){
  const set=allSets.find(s=>s.id===id)||await dbGet('learning_sets',`id=eq.${id}`).then(r=>r[0]);
  if(!set)return;openSetId=id;currentSet=set;
  $('studyset-title').textContent=set.title;
  fcCards=set.flashcards||[];fcIndex=0;fcDifficulty={};
  $('ss-flash').innerHTML='';
  if(fcCards.length){
    $('ss-flash').innerHTML=`
      <div class="fc-progress-row"><span id="ss-fc-counter">1/${fcCards.length}</span><div class="fc-progress-bar"><div id="ss-fc-fill" class="fc-progress-fill"></div></div></div>
      <div class="flashcard-wrap"><div class="flashcard" id="ss-fc-card" onclick="ssFlipCard()"><div class="fc-face fc-front"><div class="fc-content" id="ss-fc-front"></div></div><div class="fc-face fc-back"><div class="fc-content" id="ss-fc-back"></div></div></div></div>
      <div class="fc-flip-hint">Klicken zum Umdrehen</div>
      <div class="fc-actions"><button class="fc-btn" onclick="ssFcNav(-1)">← Zurück</button><button class="fc-btn" onclick="ssFcNav(1)">Weiter →</button></div>`;
    ssFcRender();
  }
  $('ss-summary').innerHTML=set.summary?`<div class="summary-wrap">${marked.parse(set.summary)}</div>`:'<p class="empty-hint">Keine Zusammenfassung</p>';
  quizData=set.quiz||[];
  $('ss-quiz').innerHTML=quizData.length
    ?`<div class="quiz-start-card"><h3>Quiz starten</h3><p>${quizData.length} Fragen</p><button class="btn-primary" onclick="startSSQuiz()">Quiz starten →</button></div>`
    :'<p class="empty-hint">Kein Quiz</p>';
  switchSSTab('flash');showScreen('studyset');
}
function ssFcRender(){const c=fcCards[fcIndex];$('ss-fc-front').textContent=c.front;$('ss-fc-back').textContent=c.back;$('ss-fc-counter').textContent=`${fcIndex+1}/${fcCards.length}`;$('ss-fc-fill').style.width=((fcIndex+1)/fcCards.length*100)+'%';$('ss-fc-card').classList.remove('flipped');}
function ssFlipCard(){$('ss-fc-card').classList.toggle('flipped');}
function ssFcNav(dir){fcIndex=Math.max(0,Math.min(fcCards.length-1,fcIndex+dir));ssFcRender();}
function startSSQuiz(){
  // Quiz im Result-Screen starten (keine doppelten IDs erzeugen)
  renderResult(currentSet, true);
  showScreen('result');
  switchResultTab('quiz');
  startQuiz();
}
function switchSSTab(tab){['flash','summary','quiz'].forEach(t=>{$(`ss-${t}`).style.display=t===tab?'block':'none';$(`sstab-${t}`).classList.toggle('active',t===tab);});}
async function deleteCurrentSet(){if(!openSetId||!confirm('Set löschen?'))return;await dbDelete('learning_sets',`id=eq.${openSetId}`);showToast('Set gelöscht');backToProject();}
function backToProject(){if(currentProject){showScreen('project');loadProjectSets();}else{showMain('home');}}

// ── Lernplan ──────────────────────────────────────────────────────────────────
async function loadProjectPlan(){
  planItems=await dbGet('study_plan',`user_id=eq.${currentUser.id}&order=date.asc`)||[];
  renderProjectPlan();
}
function renderProjectPlan(){
  const today=new Date().toISOString().split('T')[0];
  const groups={};planItems.forEach(item=>{if(!groups[item.date])groups[item.date]=[];groups[item.date].push(item);});
  $('proj-plan-list').innerHTML=!Object.keys(groups).length?'<p class="empty-hint">Noch keine Lernziele.</p>':
    Object.entries(groups).map(([date,items])=>{
      const isPast=date<today;
      const label=new Date(date+'T12:00:00').toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long'});
      return`<div class="plan-group ${isPast?'plan-past':''}">
        <div class="plan-date-label">${label}</div>
        ${items.map(item=>`<div class="plan-item ${item.done?'plan-done':''}">
          <input type="checkbox" ${item.done?'checked':''} onchange="togglePlanItem('${item.id}',this.checked)"/>
          <span class="${item.set_id?'plan-item-link':''}" onclick="${item.set_id?`openSet('${item.set_id}')`:''}">${item.title}</span>
          <button class="btn-ghost btn-sm" onclick="editPlanItem('${item.id}','${item.title.replace(/'/g,"\\'")}','${item.date}')">✏️</button>
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
function editPlanItem(id,title,date){
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
  await dbInsert('study_plan',{user_id:currentUser.id,title,date,done:false,project_id:currentProject?.id||null});
  closeModal();await loadProjectPlan();showToast('Lernziel hinzugefügt ✓');
}
async function togglePlanItem(id,done){
  await fetch(`${SUPA_URL}/rest/v1/study_plan?id=eq.${id}`,{method:'PATCH',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify({done})});
  const item=planItems.find(p=>p.id===id);if(item)item.done=done;renderProjectPlan();
}
async function deletePlanItem(id){await dbDelete('study_plan',`id=eq.${id}`);planItems=planItems.filter(p=>p.id!==id);renderProjectPlan();}

// ── KI Lernplan (manuell) ─────────────────────────────────────────────────────
function openAiPlanModal(){
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1rem">✨ KI-Lernplan erstellen</h3>
    <div class="auth-field"><label>Prüfungsdatum</label><input type="date" id="ai-exam-date"/></div>
    <div class="auth-field"><label>Verfügbare Tage</label>
      <div class="day-picker">${['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=>`<button class="day-btn" onclick="this.classList.toggle('selected')">${d}</button>`).join('')}</div>
    </div>
    <div class="auth-field"><label>Stunden pro Tag</label>
      <input type="number" id="ai-hours" value="2" min="1" max="8" style="width:80px;padding:.5rem;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);outline:none"/>
    </div>
    <div class="auth-field"><label>Was soll gelernt werden?</label>
      <textarea id="ai-topic" placeholder="z.B. Mathematik Kapitel 1-5..." rows="3" style="width:100%;padding:.75rem;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;color:var(--text);font-family:inherit;resize:vertical;outline:none"></textarea>
    </div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <button class="btn-primary" onclick="generateAiPlan()">✨ Erstellen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  $('modal-overlay').style.display='flex';
}
async function generateAiPlan(){
  const examDate=$('ai-exam-date').value,hours=$('ai-hours').value,topic=$('ai-topic').value.trim();
  const dayLabels=[...document.querySelectorAll('.day-btn.selected')].map(b=>b.textContent);
  if(!examDate||!topic)return showToast('Bitte Datum und Thema angeben','error');
  if(!dayLabels.length)return showToast('Bitte mindestens einen Tag wählen','error');
  const allowedDates=computeAllowedDates(examDate,dayLabels);
  if(!allowedDates.length)return showToast('Keine passenden Tage bis zur Prüfung','error');
  closeModal();showToast('KI erstellt Lernplan...');
  try{
    const res=await callBackend(`Du bist ein Lernplaner für die Prüfung am ${examDate}. ${hours}h pro Lerntag.\nThema: ${topic}.\n\nWICHTIG: Verwende NUR diese exakten Daten (keine anderen!):\n${allowedDates.join(', ')}\n\nVerteile den Stoff sinnvoll, plane Wiederholungen.\nNUR JSON:\n[{"date":"YYYY-MM-DD","title":"Aufgabe"}]`);
    let items=JSON.parse(res.match(/\[[\s\S]*\]/)[0]);
    items=items.filter(it=>allowedDates.includes(it.date));
    for(const item of items)await dbInsert('study_plan',{user_id:currentUser.id,title:item.title,date:item.date,done:false,project_id:currentProject.id});
    await loadProjectPlan();showToast(`${items.length} Termine erstellt ✓`);
  }catch{showToast('Fehler beim Erstellen','error');}
}

// ── Probeprüfung ──────────────────────────────────────────────────────────────
function renderExamSetSelect(sets){
  let html='';
  if(sets.length){
    html+='<div class="exam-sets-label">Aus Lernsets:</div>'+
      sets.map(s=>`<label class="exam-set-check"><input type="checkbox" value="${s.id}" checked/> ${s.title} (${s.quiz?.length||0} Fragen)</label>`).join('');
  }
  if(projectFiles.length){
    html+=`<div class="exam-sets-label" style="margin-top:.75rem">Oder neue Fragen aus Dateien generieren:</div>
      <label class="exam-set-check"><input type="checkbox" id="exam-from-files"/> 🤖 KI generiert frische Fragen aus den ${projectFiles.length} hochgeladenen Dateien</label>`;
  }
  if(!sets.length&&!projectFiles.length){
    html='<p class="empty-hint-small">Lade erst Dateien hoch oder erstelle Lernsets.</p>';
  }
  $('exam-sets-select').innerHTML=html;
}
async function startExam(){
  const checked=[...document.querySelectorAll('.exam-set-check input:checked')].filter(c=>c.id!=='exam-from-files').map(c=>c.value);
  const fromFiles=$('exam-from-files')?.checked;
  const count=$('exam-q-count').value;
  const numQ=count==='all'?20:parseInt(count);

  let allQ=[];
  // Fragen aus Lernsets sammeln
  for(const id of checked){const set=allSets.find(s=>s.id===id);if(set?.quiz)allQ=[...allQ,...set.quiz];}

  // Fragen aus Dateien generieren
  if(fromFiles&&projectFiles.length){
    $('exam-setup').style.display='none';$('exam-play').style.display='block';
    $('exam-play').innerHTML=`<div style="text-align:center;padding:3rem"><div class="loading-spinner" style="margin:0 auto 1rem"></div><p>KI erstellt Prüfungsfragen aus deinen Dateien...</p></div>`;
    const context=projectFiles.map(f=>f.content.slice(0,2000)).join('\n\n').slice(0,7000);
    try{
      const res=await callBackend(`Erstelle ${numQ} anspruchsvolle Prüfungsfragen auf Deutsch aus diesem Lernstoff. Mix aus multiple_choice, true_false, freetext. NUR JSON:\n[{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct":0},{"type":"true_false","question":"...","correct":true},{"type":"freetext","question":"...","answer":"..."}]\n\nLernstoff:\n${context}`);
      const generated=JSON.parse(res.match(/\[[\s\S]*\]/)[0]);
      allQ=[...allQ,...generated];
    }catch{showToast('Fehler beim Generieren der Fragen','error');resetExam();return;}
  }

  if(!allQ.length)return showToast('Bitte mindestens ein Lernset oder Dateien wählen','error');
  allQ=allQ.sort(()=>Math.random()-.5);
  examQuestions=count==='all'?allQ:allQ.slice(0,numQ);
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
      <div id="exam-opts">${q.type!=='freetext'?(q.type==='true_false'?['Wahr','Falsch']:q.options).map((o,i)=>`<button class="quiz-option-btn" onclick="selectExamAnswer(${i})">${o}</button>`).join(''):''}</div>
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
  opts.forEach(b=>b.onclick=null);
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
let calPlanCache=[], calProjectMap={};
function loadCalendar(){const now=new Date();calYear=now.getFullYear();calMonth=now.getMonth();renderCalendar();}
function calNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}
async function renderCalendar(){
  const allPlan=await dbGet('study_plan',`user_id=eq.${currentUser.id}&order=date.asc`)||[];
  calPlanCache=allPlan;
  // Projekte laden für Labels
  const projects=await dbGet('projects',`user_id=eq.${currentUser.id}`)||[];
  calProjectMap={};projects.forEach(p=>calProjectMap[p.id]={name:p.name,color:p.color||'#6366f1',icon:p.icon||'📁'});
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
    html+=`<div class="cal-cell ${isToday?'cal-today':''} ${items.length?'cal-has-events':''}" onclick="openDayModal('${dateStr}')">
      <div class="cal-day-num">${d}</div>
      ${items.slice(0,2).map(it=>{
        const proj=it.project_id?calProjectMap[it.project_id]:null;
        const dot=proj?`<span class="cal-event-dot" style="background:${proj.color}"></span>`:'';
        return `<div class="cal-event ${it.done?'cal-event-done':''}" ${proj?`style="border-left:3px solid ${proj.color}"`:''}>${dot}${it.title}</div>`;
      }).join('')}
      ${items.length>2?`<div class="cal-event-more">+${items.length-2}</div>`:''}
    </div>`;
  }
  $('cal-grid').innerHTML=html;
  const upcoming=allPlan.filter(p=>p.date>=today&&!p.done).slice(0,5);
  $('cal-upcoming-list').innerHTML=!upcoming.length?'<p class="empty-hint-small">Keine kommenden Termine</p>':
    upcoming.map(p=>{
      const proj=p.project_id?calProjectMap[p.project_id]:null;
      const badge=proj?`<span class="cal-proj-badge" style="background:${proj.color}22;color:${proj.color}">${proj.icon} ${proj.name}</span>`:'';
      return `<div class="plan-item">
        <span style="flex:1">📅 ${new Date(p.date+'T12:00:00').toLocaleDateString('de-CH',{weekday:'short',day:'numeric',month:'short'})} · ${p.title}</span>
        ${badge}
        <button class="btn-primary btn-sm" onclick="openStudyMaterial('${p.id}')">📖 Lernen</button>
      </div>`;
    }).join('');
}

// Tag anklicken → Termine des Tages anzeigen + neuen erstellen
function openDayModal(dateStr){
  const items=calPlanCache.filter(p=>p.date===dateStr);
  const label=new Date(dateStr+'T12:00:00').toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:.5rem">${label}</h3>
    <div class="cal-modal-items">
      ${items.length?items.map(it=>{
        const proj=it.project_id?calProjectMap[it.project_id]:null;
        const badge=proj?`<span class="cal-proj-badge" style="background:${proj.color}22;color:${proj.color}">${proj.icon} ${proj.name}</span>`:'';
        return `
        <div class="plan-item ${it.done?'plan-done':''}">
          <input type="checkbox" ${it.done?'checked':''} onchange="togglePlanItemCal('${it.id}',this.checked)"/>
          <span style="flex:1">${it.title} ${badge}</span>
          <button class="btn-primary btn-sm" onclick="openStudyMaterial('${it.id}')">📖 Lernen</button>
          <button class="btn-ghost btn-sm" onclick="editCalItem('${it.id}','${it.title.replace(/'/g,"\\'")}','${it.date}')">✏️</button>
          <button class="btn-ghost btn-sm btn-danger" onclick="deleteCalItem('${it.id}','${dateStr}')">✕</button>
        </div>`;}).join(''):'<p class="empty-hint-small">Keine Termine an diesem Tag.</p>'}
    </div>
    <div class="auth-field" style="margin-top:1rem"><label>Neuer Termin</label><input type="text" id="cal-new-title" placeholder="z.B. Mathe lernen" onkeydown="if(event.key==='Enter')addCalItem('${dateStr}')"/></div>
    <div style="display:flex;gap:.75rem;margin-top:.75rem">
      <button class="btn-primary" onclick="addCalItem('${dateStr}')">+ Hinzufügen</button>
      <button class="btn-ghost" onclick="closeModal()">Schliessen</button>
    </div>`;
  $('modal-overlay').style.display='flex';
}

// Lernstoff für einen Termin bereitstellen
async function openStudyMaterial(planId){
  const item=calPlanCache.find(p=>p.id===planId)||planItems.find(p=>p.id===planId);
  if(!item)return;
  // Sets aus dem zugehörigen Projekt holen (oder alle Sets des Users)
  let sets=[];
  if(item.project_id) sets=await dbGet('learning_sets',`project_id=eq.${item.project_id}&order=updated_at.desc`)||[];
  else sets=await dbGet('learning_sets',`user_id=eq.${currentUser.id}&order=updated_at.desc`)||[];

  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:.35rem">📖 Lernstoff</h3>
    <p style="color:var(--text2);margin-bottom:1rem">${item.title}</p>
    ${item.set_id?`<button class="btn-primary" style="width:100%;margin-bottom:.75rem" onclick="openSetGlobal('${item.set_id}')">▶ Verknüpftes Lernset öffnen</button>`:''}
    <div class="study-mat-section">
      <div class="study-mat-label">Vorhandene Lernsets</div>
      ${sets.length?sets.map(s=>`<button class="study-mat-set" onclick="openSetGlobal('${s.id}')">📚 ${s.title} <span>${s.flashcards?.length||0} Karten · ${s.quiz?.length||0} Fragen</span></button>`).join(''):'<p class="empty-hint-small">Noch keine Lernsets vorhanden</p>'}
    </div>
    <div class="study-mat-section">
      <div class="study-mat-label">Neu erstellen</div>
      <button class="btn-ghost" style="width:100%;margin-bottom:.5rem" onclick="generateLernblatt('${planId}')">📄 Lernblatt erstellen</button>
    </div>
    <button class="btn-ghost" style="width:100%" onclick="closeModal()">Schliessen</button>`;
  $('modal-overlay').style.display='flex';
}

// Lernblatt (Zusammenfassung) für ein Thema erstellen
async function generateLernblatt(planId){
  const item=calPlanCache.find(p=>p.id===planId)||planItems.find(p=>p.id===planId);
  if(!item)return;
  $('modal-content').innerHTML=`<h3 style="margin-bottom:1rem">📄 Lernblatt wird erstellt...</h3><div style="display:flex;justify-content:center;padding:2rem"><div class="loading-spinner"></div></div>`;
  // Kontext aus Projekt-Dateien holen
  let context='';
  if(item.project_id){
    const files=await dbGet('project_files',`project_id=eq.${item.project_id}`)||[];
    context=files.map(f=>f.content.slice(0,1500)).join('\n\n').slice(0,6000);
  }
  const prompt=`Erstelle ein kompaktes Lernblatt zum Thema "${item.title}".${context?`\n\nNutze diesen Lernstoff als Grundlage:\n${context}`:''}\n\nFormat: Markdown mit Überschriften, Stichpunkten, wichtigen Begriffen fett. Kompakt aber vollständig, max 400 Wörter.`;
  try{
    const res=await callBackend(prompt);
    $('modal-content').innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3>📄 Lernblatt: ${item.title}</h3>
        <button class="btn-ghost btn-sm" onclick="closeModal()">✕</button>
      </div>
      <div class="summary-wrap" style="max-height:60vh;overflow-y:auto">${marked.parse(res)}</div>
      <button class="btn-primary" style="width:100%;margin-top:1rem" onclick="closeModal()">Fertig</button>`;
  }catch{
    $('modal-content').innerHTML=`<p>Fehler beim Erstellen des Lernblatts.</p><button class="btn-ghost" onclick="closeModal()">Schliessen</button>`;
  }
}

async function addCalItem(dateStr){
  const title=$('cal-new-title').value.trim();
  if(!title)return showToast('Bitte Titel eingeben','error');
  await dbInsert('study_plan',{user_id:currentUser.id,title,date:dateStr,done:false});
  closeModal();renderCalendar();showToast('Termin hinzugefügt ✓');
}
async function togglePlanItemCal(id,done){
  await fetch(`${SUPA_URL}/rest/v1/study_plan?id=eq.${id}`,{method:'PATCH',headers:{...dbH(),'Prefer':'return=representation'},body:JSON.stringify({done})});
  const it=calPlanCache.find(p=>p.id===id);if(it)it.done=done;
}
function editCalItem(id,title,date){
  $('modal-content').innerHTML=`
    <h3 style="margin-bottom:1rem">Termin bearbeiten</h3>
    <div class="auth-field"><label>Titel</label><input type="text" id="cal-edit-title" value="${title}"/></div>
    <div class="auth-field"><label>Datum</label><input type="date" id="cal-edit-date" value="${date}"/></div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <button class="btn-primary" onclick="saveCalEdit('${id}')">Speichern</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
}
async function saveCalEdit(id){
  const title=$('cal-edit-title').value.trim(),date=$('cal-edit-date').value;
  if(!title||!date)return showToast('Bitte Titel und Datum angeben','error');
  await dbPatch('study_plan',`id=eq.${id}`,{title,date});
  closeModal();renderCalendar();showToast('Termin aktualisiert ✓');
}
async function deleteCalItem(id,dateStr){
  await dbDelete('study_plan',`id=eq.${id}`);
  calPlanCache=calPlanCache.filter(p=>p.id!==id);
  openDayModal(dateStr);renderCalendar();showToast('Termin gelöscht');
}

// Globales Set öffnen (vom Kalender aus, ohne Projekt-Kontext)
async function openSetGlobal(id){
  const set=await dbGet('learning_sets',`id=eq.${id}`).then(r=>r[0]);
  if(!set){showToast('Lernset nicht gefunden','error');return;}
  if(set.project_id){
    currentProject=allProjects.find(p=>p.id===set.project_id)||await dbGet('projects',`id=eq.${set.project_id}`).then(r=>r[0]);
  }
  closeModal();
  await loadProjectSetsForGlobal(set.project_id);
  openSet(id);
}
async function loadProjectSetsForGlobal(projectId){
  if(projectId) allSets=await dbGet('learning_sets',`project_id=eq.${projectId}`)||[];
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

// ── Drag & Drop (Hub) ────────────────────────────────────────────────────────
window.addEventListener('load',()=>{
  const ua=$('upload-area');
  if(ua){ua.addEventListener('dragover',e=>{e.preventDefault();ua.classList.add('drag-over');});ua.addEventListener('dragleave',()=>ua.classList.remove('drag-over'));ua.addEventListener('drop',e=>{e.preventDefault();ua.classList.remove('drag-over');handleFile(e.dataTransfer.files[0]);});}
  const hub=$('file-hub-drop');
  if(hub){hub.addEventListener('dragover',e=>{e.preventDefault();hub.classList.add('drag-over');});hub.addEventListener('dragleave',()=>hub.classList.remove('drag-over'));hub.addEventListener('drop',e=>{e.preventDefault();hub.classList.remove('drag-over');handleHubFiles(e.dataTransfer.files);});}
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
