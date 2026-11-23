import {ROOM_PREFIXES,normalizeRoomCode,isRoomCode,roomPeerIds} from './rooms.js?v=20261123-pace1';
import {cleanText,makeGame,submitQuestions,canStart,startWriting,startNewCycle,startGame,castVote,finishIfReady,publicView,MAX_PLAYERS} from './core.js?v=20261123-pace1';
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const identity = (()=>{try{let id=sessionStorage.getItem('mw-id');if(!id){id=crypto.randomUUID();sessionStorage.setItem('mw-id',id);}return id;}catch{return crypto.randomUUID();}})();
let peer, conn, game, view, code='', isHost=false, demo=false, connections=new Map(), screen='home', currentName='', networkError='', receivedAt=0, lastRenderKey='', drafts=[''], submitted=false, pending=false, lastHeartbeat=0, busy=false;
let sound=false, audio, demoTimers=[], joinTimer, toastTimer;
let draftOwners=[],draftChoices=[['','','','']];
let aliasPeers=[],joinConnections=[],joinMissing=0,joinCode='',joinChosen=false;
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode(){return [...crypto.getRandomValues(new Uint8Array(6))].map(n=>alphabet[n%alphabet.length]).join('');}
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
function playTone(win=false){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume();[win?523:440,win?659:523,win?784:659].forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=hz;g.gain.setValueAtTime(.045,audio.currentTime+i*.09);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.09+.15);o.start(audio.currentTime+i*.09);o.stop(audio.currentTime+i*.09+.16);});}catch{}}
$('#sound').onclick=()=>{sound=!sound;$('#sound').setAttribute('aria-label',sound?'השתקת צלילים':'הפעלת צלילים');$('#sound').textContent=sound?'♫':'♪';notify(sound?'הצלילים מופעלים':'הצלילים כבויים');playTone();};
$('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>notify('אפשר להמשיך לשחק גם בלי מסך מלא'));};
const num = n => Number(n||0).toLocaleString('he-IL');
function link(){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('room',code);return u.href;}
function toolbar(){return `<div class="toolbar"><span>${demo?'מצב התנסות':`<span class="connected"></span>חדר <b dir="ltr">${esc(code)}</b>`}</span><button class="btn small outline" data-action="leave">יציאה מהחדר</button></div>`;}
function home(){
  screen='home'; document.body.dataset.screen='home'; const incoming=joinCode||new URLSearchParams(location.search).get('room')||'';
  app.innerHTML=`<section class="hero"><div class="badge">✦ המשחק חינם. הפדיחות עליכם.</div><div class="hero-art" aria-hidden="true"><span class="bubble one">״אני מגיע בעוד חמש דקות״ <small>👀</small></span><span class="bubble two">נו באמת, מי כתב את זה? 😂</span></div><h1>מי כתב <em>את זה?</em></h1><p>כל אחד כותב משהו בסתר. כולם מנחשים מי כתב.<br>חושבים שאתם מכירים את החברים שלכם?</p></section>
  <div class="grid"><section class="card"><div class="card-top"><h2>פותחים משחק</h2><span class="sticker" aria-hidden="true">✦</span></div><p class="muted">מזמינים את החבר׳ה, מקבלים קוד ומתחילים.</p><form id="create-form"><label class="field"><span>איך קוראים לך?</span><input name="name" placeholder="השם שכולם מכירים" maxlength="20" required autocomplete="nickname" value="${esc(currentName)}"></label><button class="btn wide" type="submit">פותחים חדר חדש 🎉</button></form></section>
  <section class="card"><div class="card-top"><h2>יש לכם קוד?</h2><span class="sticker" style="background:var(--mint)" aria-hidden="true">#</span></div><p class="muted">מישהו כבר פתח משחק? נכנסים לחדר שלו.</p><form id="join-form"><label class="field"><span>השם שלך</span><input name="name" placeholder="ככה תופיעו במשחק" maxlength="20" required autocomplete="nickname" value="${esc(currentName)}"></label><label class="field"><span>קוד החדר</span><input class="code-input" name="code" placeholder="ABC234" maxlength="32" minlength="6" required autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(incoming)}"></label><button class="btn purple wide" type="submit">מצטרפים למשחק</button></form></section></div>
  <p class="home-note">✓ בלי צ׳אט מוואטסאפ &nbsp; ✓ מכל טלפון &nbsp; ✓ בלי הרשמה</p><div class="steps"><div class="step"><b>1</b>נכנסים עם קוד</div><div class="step"><b>2</b>כותבים בסתר</div><div class="step"><b>3</b>מנחשים וצוחקים</div></div><button class="demo" data-action="demo">רוצים לראות איך זה עובד? נסו משחק לדוגמה</button>`;
  $('#create-form').onsubmit=e=>{e.preventDefault();const name=cleanText(new FormData(e.target).get('name'),20);if(name)createRoom(name);};
  $('#join-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),name=cleanText(f.get('name'),20),c=normalizeRoomCode(f.get('code'));if(name&&isRoomCode(c))joinRoom(name,c);else notify('הקוד צריך לכלול 6 אותיות או ספרות באנגלית');};
}
function loading(text){screen='loading';app.innerHTML=`<div class="waiting"><div class="spinner"></div><h2>${esc(text)}</h2><p>עוד רגע החבר׳ה נפגשים…</p><button class="btn outline section-gap" style="color:white;border-color:white;margin-inline:auto" data-action="cancel">ביטול</button></div>`;}
function fail(text){networkError=text;busy=false;clearTimeout(joinTimer);if(screen==='loading'){cleanup();home();const error=document.createElement('div');error.className='error-box';error.setAttribute('role','alert');error.textContent=text;$('#join-form').prepend(error);notify(text);}else{render(true);notify(text);}}
async function requirePeer(){if(!window.Peer){await new Promise(r=>setTimeout(r,800));}if(!window.Peer)throw new Error('ספריית החיבור לא נטענה. בדקו את האינטרנט ורעננו את העמוד.');}
function attachPeerErrors(p){p.on('error',err=>{if(p!==peer)return;if(err.type==='peer-unavailable'){if(!isHost&&screen==='loading'&&!joinChosen){joinMissing++;if(joinMissing>=ROOM_PREFIXES.length)fail('החדר לא נמצא בשירות החדרים. בקשו מהמארח לרענן ולפתוח חדר חדש, והשאירו את העמוד שלו פתוח.');}return;}else if(err.type==='unavailable-id')fail('הקוד תפוס כרגע. נסו לפתוח חדר חדש.');else if(err.type!=='disconnected')fail('לא הצלחנו להתחבר. נסו שוב, או נסו רשת Wi-Fi אחרת.');});p.on('disconnected',()=>{if(p===peer&&!p.destroyed){networkError='החיבור לשירות החדרים נותק. מנסים להתחבר מחדש…';render(true);try{p.reconnect();}catch{}}});p.on('open',()=>{networkError='';});}
async function createRoom(name){if(busy)return;cleanup();busy=true;currentName=name;isHost=true;code=roomCode();drafts=[''];draftOwners=[];draftChoices=[['','','','']];submitted=false;loading('פותחים את החדר שלכם');try{await requirePeer();game=makeGame({id:identity,name,token:identity});peer=new Peer(roomPeerIds(code)[0],{debug:0});attachPeerErrors(peer);peer.on('open',()=>{if(!isHost)return;busy=false;clearTimeout(joinTimer);networkError='';if(!aliasPeers.length)for(const id of roomPeerIds(code).slice(1)){const alias=new Peer(id,{debug:0});aliasPeers.push(alias);alias.on('connection',acceptConnection);alias.on('error',err=>{if(err.type==='unavailable-id')fail('הקוד כבר בשימוש. צאו ופתחו חדר חדש.');});alias.on('disconnected',()=>{if(!alias.destroyed){try{alias.reconnect();}catch{}}});}update();});peer.on('connection',acceptConnection);joinTimer=setTimeout(()=>fail('פתיחת החדר התעכבה. בדקו את החיבור ונסו שוב.'),18000);}catch(e){fail(e.message);}}
async function joinRoom(name,c){
  if(busy)return;cleanup();busy=true;currentName=name;isHost=false;code=normalizeRoomCode(c);joinCode=code;drafts=[''];draftOwners=[];draftChoices=[['','','','']];submitted=false;loading('נכנסים לחדר');
  try{
    await requirePeer();const p=new Peer(undefined,{debug:0});peer=p;attachPeerErrors(p);
    p.on('open',()=>{
      if(peer!==p||joinChosen)return;
      for(const target of roomPeerIds(code)){
        const candidate=p.connect(target,{reliable:true,serialization:'json'});joinConnections.push(candidate);
        candidate.on('open',()=>{
          if(peer!==p||joinChosen){candidate.close();return;}
          joinChosen=true;conn=candidate;
          for(const other of joinConnections)if(other!==candidate)other.close();
          candidate.send({type:'join',name,token:identity,protocol:4});
        });
        candidate.on('data',msg=>{if(conn===candidate)guestMessage(msg);});
        candidate.on('close',()=>{if(conn===candidate&&screen!=='home'&&screen!=='loading'){networkError='החיבור למארח נותק. לחצו כדי להתחבר מחדש.';render(true);}});
        candidate.on('error',()=>{if(conn===candidate)fail('החיבור לחדר נותק. אפשר לנסות שוב באותו קוד.');});
      }
    });
    joinTimer=setTimeout(()=>fail('הקוד נקלט, אך החיבור למארח לא הושלם. השאירו את עמוד המארח פתוח ונסו שוב. אם אתם ברשת סלולרית, נסו Wi-Fi.'),25000);
  }catch(e){fail(e.message);}
}
function acceptConnection(c){let id=null,joined=false;const expiry=setTimeout(()=>{if(!joined)c.close();},10000);c.on('data',msg=>{if(!msg||typeof msg!=='object'||Array.isArray(msg))return;
  if(!joined){if(msg.type!=='join')return;if(msg.protocol!==4){c.send({type:'error',text:'העמוד שלך מגרסה קודמת. רעננו את האתר אצל כולם ופתחו חדר חדש.'});return;}const token=cleanText(msg.token,80),name=cleanText(msg.name,20);if(!name||!/^[-a-zA-Z0-9]{20,80}$/.test(token))return;
    let p=game.players.find(p=>p.token===token);if(p?.id===identity){c.send({type:'error',text:'השם הזה שייך למארח. פתחו את הקישור במכשיר אחר.'});return;}
    if(!p){if(game.phase!=='lobby'){c.send({type:'error',text:'המשחק כבר התחיל. תוכלו להצטרף במשחק הבא.'});return;}if(game.players.length>=MAX_PLAYERS){c.send({type:'error',text:'החדר מלא (עד 20 שחקנים).'});return;}if(game.players.some(p=>p.name===name)){c.send({type:'error',text:'השם כבר בשימוש בחדר. בחרו שם אחר.'});return;}
      id=crypto.randomUUID();p={id,name,token,active:true,ready:false,score:0,questions:[]};game.players.push(p);
    }else{id=p.id;const old=connections.get(id);if(old&&old!==c)old.close();p.active=true;}
    id=p.id;joined=true;clearTimeout(expiry);connections.set(id,c);c._lastSeen=Date.now();c.send({type:'welcome',id,host:identity,code,protocol:4});update();return;
  }
  if(connections.get(id)!==c)return;
  c._lastSeen=Date.now();const livePlayer=game.players.find(p=>p.id===id);if(livePlayer&&!livePlayer.active){livePlayer.active=true;update();}if(msg.type==='ping'){c.send({type:'pong'});return;}
  if(msg.type==='edit'&&game.phase==='writing'){const p=game.players.find(p=>p.id===id);if(p)p.ready=false;update();return;}
  if(msg.type==='submit'){if(submitQuestions(game,id,msg.texts)){c.send({type:'saved'});update();}else c.send({type:'error',text:'צריך משפט אחד, ארבעה שמות שונים ותשובה נכונה מסומנת.'});return;}
  if(msg.type==='vote'){if(castVote(game,id,msg.target,msg.questionIndex))update();}
});c.on('close',()=>{clearTimeout(expiry);if(!game||connections.get(id)!==c)return;connections.delete(id);const p=game.players.find(p=>p.id===id);if(p)p.active=false;finishIfReady(game);update();});c.on('error',()=>{});}
let myId=identity;
function guestMessage(msg){if(!msg||typeof msg!=='object')return;lastHeartbeat=Date.now();if(msg.type==='welcome'){if(msg.protocol!==4){fail('המארח משתמש בגרסה קודמת. רעננו את האתר אצל כולם ופתחו חדר חדש.');return;}myId=msg.id;busy=false;clearTimeout(joinTimer);}else if(msg.type==='state'){const previous=view?.phase,previousCycle=view?.cycle;view=msg.view;receivedAt=performance.now();networkError='';pending=false;if((previous!=='lobby'&&view.phase==='lobby')||(previousCycle!==undefined&&previousCycle!==view.cycle)){drafts=[''];draftOwners=[];draftChoices=[['','','','']];submitted=false;}submitted=Boolean(view.players.find(p=>p.id===myId)?.ready);render();}else if(msg.type==='saved'){submitted=true;notify('נשמר! אף אחד אחר לא רואה מה כתבתם.');}else if(msg.type==='closed'){cleanup();home();notify('המארח סגר את החדר.');}else if(msg.type==='kicked'){cleanup();home();notify('המארח הוציא אותך מהחדר.');}else if(msg.type==='error'){fail(msg.text);}}
function update(){if(!game||!isHost)return;view=publicView(game,identity);myId=identity;receivedAt=performance.now();for(const [id,c] of connections){if(c.open)c.send({type:'state',view:publicView(game,id)});}render();}
function listPlayers(){return view.players.map(p=>`<div class="player"><span class="avatar">${esc(p.name.charAt(0))}</span><span class="player-name">${esc(p.name)}${p.id===myId?' <small>(אני)</small>':''}${p.id===identity&&isHost?' <small>👑</small>':''}</span><span class="status ${p.ready?'ready':''}">${!p.active?'מנותק':view.phase==='lobby'?'✓ הצטרף/ה':p.ready?'✓ מוכן/ה':'כותב/ת…'}</span>${isHost&&p.id!==identity?`<button class="kick" data-kick="${esc(p.id)}" aria-label="הוצאת ${esc(p.name)}">×</button>`:''}</div>`).join('');}
function render(force=false){if(!view)return;const key=JSON.stringify([view.phase,view.cycle,view.questionIndex,view.round,view.players,view.vote,view.voted,view.owner,view.awarded,networkError,submitted,view.duration,view.roundLimit]);if(!force&&key===lastRenderKey)return;lastRenderKey=key;const old=screen;screen=view.phase;document.body.dataset.screen=view.phase;
  if(view.phase==='lobby')renderWaitingRoom();else if(view.phase==='writing')renderLobby();else if(view.phase==='results')renderResults();else if(view.phase==='waiting')renderWaiting();else renderRound();
  if(networkError){const n=document.createElement('div');n.className='error-box';n.textContent=networkError;if(!isHost){const b=document.createElement('button');b.className='btn small section-gap';b.textContent='להתחבר מחדש';b.onclick=()=>joinRoom(currentName,code);n.append(b);}app.prepend(n);}
  if(old!==screen){window.scrollTo({top:0,behavior:'instant'});if(screen==='results')confetti();}
}
function renderWaitingRoom(){
  const active=view.players.filter(p=>p.active).length;
  app.innerHTML=toolbar()+`<section class="screen-head"><h2>הלובי של החבר׳ה 🎉</h2><p>קודם כולם מצטרפים. כשהמארח מתחיל, עוברים יחד לכתיבה בסתר.</p></section><div class="room-grid"><aside class="card invite"><p class="muted">${demo?'חדר לדוגמה • שחקנים מדומים':'זה הקוד שלכם. שלחו לחבר׳ה.'}</p><div class="room-code">${esc(code)}</div><p class="muted">נכנסים לאתר ומקלידים את הקוד</p>${!demo?'<button class="btn mint wide" data-action="copy">העתקת קישור להזמנה</button><button class="btn outline wide small" data-action="share">שיתוף עם החבר׳ה</button><div class="qr" id="qr" role="img" aria-label="קוד QR להצטרפות"></div>':''}<div class="note">מי שפתח את החדר משאיר את העמוד פתוח ואת המכשיר ער לאורך המשחק.</div></aside><section class="card"><div class="card-top"><h2>מי כבר כאן?</h2><span class="sticker" style="background:var(--mint)">☺</span></div><p class="muted">${active} משתתפים בחדר • מומלץ 3 ומעלה</p><div class="player-list">${listPlayers()}</div><div class="note"><b>מה קורה כשמתחילים?</b><br>כל אחד כותב משפט או שאלה בסתר. אחרי שכולם מסיימים, מנחשים מי כתב מה וצוברים נקודות.</div>${isHost?`<button class="btn wide section-gap" data-action="begin-writing" ${active<2?'disabled':''}>${active<2?'מחכים לפחות לעוד שחקן':'כולם כאן? מתחילים משחק! 🎉'}</button>`:'<div class="success section-gap"><b>אתם בפנים 🙌</b><p>מחכים שהמארח יתחיל את המשחק.</p></div>'}</section></div>`;
  if(!demo&&window.QRCode){try{const q=$('#qr');new QRCode(q,{text:link(),width:150,height:150,correctLevel:QRCode.CorrectLevel.M});q.classList.add('visible');}catch{}}
}
function renderLobby(){
  const me=view.players.find(p=>p.id===myId),ready=view.players.filter(p=>p.active&&p.ready).length,active=view.players.filter(p=>p.active).length;
  app.innerHTML=toolbar()+`<div class="writing-wrap"><section class="card writing-card"><div class="writing-heading"><span class="sticker" style="background:var(--pink)" aria-hidden="true">✎</span><h2>מה המשפט?</h2></div><p class="muted">סיבוב ${view.cycle}: כל אחד כותב משפט אחד וארבעה שמות לבחירה. השמות יכולים להיות של כל אדם — גם מי שלא במשחק.</p>
  ${me?.ready&&submitted?`<div class="success section-gap"><h3>המשפט וארבע האפשרויות נשמרו! 🤫</h3><p>מחכים ששאר המשתתפים יסיימו לכתוב.</p><button class="btn small outline section-gap" style="margin-inline:auto" data-action="edit">לערוך את המשפט שלי</button></div>`:`<form id="questions-form">${questionField(drafts[0]||'',0)}<button class="btn wide section-gap" type="submit" ${pending?'disabled':''}>${pending?'שומרים…':'שמרתי, אני מוכן/ה! 🤫'}</button></form>`}
  <div class="writing-progress" role="status">${ready} מתוך ${active} מוכנים לניחושים</div>
  ${isHost?`<button class="btn purple wide section-gap" data-action="start" ${canStart(game)?'':'disabled'}>${active<2?'מחכים לפחות לעוד שחקן':ready<active?'מחכים שכולם יסיימו לכתוב':'כולם מוכנים? מתחילים לנחש! 🎉'}</button>`:'<p class="muted writing-wait">כשהחבר׳ה מוכנים, המארח מתחיל את הניחושים.</p>'}</section></div>`;
  if(!me?.ready||!submitted){
    $('#questions-form').onsubmit=e=>{
      e.preventDefault();captureDrafts();
      const options=(draftChoices[0]||[]).map(name=>cleanText(name,40));
      const correctIndex=draftOwners[0]===undefined?-1:Number(draftOwners[0]);
      const texts=[{text:cleanText(drafts[0]),options,correctIndex}];
      if(texts[0].text.length<3){notify('המשפט צריך להכיל לפחות 3 תווים');return;}
      if(options.length!==4||options.some(name=>!name)){notify('כתבו ארבעה שמות לבחירה');return;}
      if(new Set(options.map(name=>name.toLocaleLowerCase())).size!==4){notify('בחרו ארבעה שמות שונים');return;}
      if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>3){notify('סמנו את התשובה הנכונה');return;}
      if(isHost){if(!submitQuestions(game,identity,texts)){notify('בדקו את המשפט, ארבעת השמות והתשובה הנכונה');return;}submitted=true;update();playTone();}
      else if(conn?.open){pending=true;conn.send({type:'submit',texts});render(true);setTimeout(()=>{if(pending){pending=false;render(true);notify('טרם התקבל אישור שמירה. נסו שוב.');}},8000);}
      else notify('החיבור למארח נותק. התחברו מחדש.');
    };
    document.querySelectorAll('[data-draft]').forEach(el=>el.addEventListener('input',()=>{drafts[0]=el.value;}));
    document.querySelectorAll('[data-choice-index]').forEach(el=>el.addEventListener('input',()=>{draftChoices[0][Number(el.dataset.choiceIndex)]=el.value;}));
    document.querySelectorAll('[data-owner-index]').forEach(el=>el.addEventListener('change',()=>{draftOwners[0]=el.value;}));
  }

}
function questionField(t,i){
  const placeholders=['שמעון','סדעון','פוסח','שם נוסף'];
  return `<section class="question-editor"><div class="field question-row"><label for="draft-0">המשפט שלכם</label><textarea id="draft-0" data-draft="0" maxlength="220" minlength="3" required placeholder="למשל: אם כן אנחנו נכשלנו בו" aria-label="המשפט שלכם">${esc(t)}</textarea></div><fieldset class="author-picker"><legend>מי כתב את המשפט?</legend><p class="muted choice-help">כתבו ארבעה שמות וסמנו את השם הנכון. אפשר לכתוב כל שם, בלי קשר למשתתפים בחדר.</p><div class="free-options">${[0,1,2,3].map(n=>`<div class="free-option"><label class="free-name"><span>שם ${n+1}</span><input data-choice-index="${n}" aria-label="שם באפשרות ${n+1}" maxlength="40" required autocomplete="off" placeholder="${placeholders[n]}" value="${esc(draftChoices[0]?.[n]||'')}"></label><label class="correct-option"><input type="radio" name="correct-answer" data-owner-index="0" value="${n}" ${String(draftOwners[0])===String(n)?'checked':''} required><span>זאת התשובה הנכונה</span></label></div>`).join('')}</div></fieldset></section>`;
}
function captureDrafts(){const text=document.querySelector('[data-draft]');if(text)drafts=[text.value];document.querySelectorAll('[data-choice-index]').forEach(el=>{draftChoices[0][Number(el.dataset.choiceIndex)]=el.value;});const correct=document.querySelector('[data-owner-index]:checked');if(correct)draftOwners=[correct.value];}

function scores(){return [...view.players].sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="score-row"><span class="rank">${i===0&&view.phase==='results'?'🥇':i+1}</span><span class="avatar">${esc(p.name.charAt(0))}</span><span class="score-name">${esc(p.name)}${p.id===myId?' (אני)':''}</span><span class="delta">${p.correct||0} תשובות נכונות</span><span class="points">${num(p.score)}</span></div>`).join('');}
function renderRound(){
  app.innerHTML=`<div class="round-wrap play-board"><div class="progress game-timer"><div style="width:${view.total?Math.round(view.round/view.total*100):0}%"></div></div><div class="round-meta"><strong>מי כתב את זה?</strong><span class="round-counter">משפט ${view.round+1} מתוך ${view.total}</span></div><section class="card quote-card"><div class="quote-mystery" aria-hidden="true">???</div><h2 class="quote-text">${esc(view.text)}</h2></section><div class="answers" aria-label="מי כתב את המשפט?">${view.options.map((p,i)=>`<button class="answer ${view.vote===p.id?'selected':''}" data-vote="${esc(p.id)}" ${view.vote?'disabled':''} aria-pressed="${view.vote===p.id?'true':'false'}" title="מקש ${i+1}"><span class="answer-avatar" aria-hidden="true">${esc(p.name.charAt(0))}</span><span class="answer-name">${esc(p.name)}</span></button>`).join('')}</div><p class="vote-status">${view.vote?'שומרים את הבחירה…':'בוחרים שם וממשיכים למשפט הבא, בקצב שלכם.'}<br><span>הניקוד יופיע בסוף, כשכולם יסיימו.</span></p><div class="play-bottom">${toolbar()}</div></div>`;
}
function renderWaiting(){
  app.innerHTML=toolbar()+`<div class="writing-wrap"><section class="card finished-card"><div class="finished-icon" aria-hidden="true">✓</div><h2>סיימתם לבחור!</h2><p class="muted">מחכים ששאר החבר׳ה יסיימו.<br>התוצאות ייפתחו כאן אצל כולם, בלי לחשוף תשובות בדרך.</p><div class="finish-list">${view.players.map(p=>`<div class="finish-person"><span class="avatar">${esc(p.name.charAt(0))}</span><b>${esc(p.name)}${p.id===myId?' (אני)':''}</b><span>${!p.active?'מנותק/ת':p.finished?'✓ סיים/ה':`${p.answered} / ${p.total}`}</span></div>`).join('')}</div></section></div>`;
}

function renderResults(){const sorted=[...view.players].sort((a,b)=>b.score-a.score),winners=sorted.filter(p=>p.score===sorted[0]?.score);app.innerHTML=`<div class="round-wrap">${toolbar()}<section class="results-hero"><div class="trophy">🏆</div><h1>${winners.length===1?`${esc(winners[0].name)} <em>מוביל/ה!</em>`:'<em>יש לנו תיקו!</em>'}</h1><p>סיבוב ${view.cycle} הסתיים. הניקוד נשמר לסיבוב הבא.</p></section><section class="card end-card"><h2>לוח התהילה</h2><div class="score-table">${scores()}</div>${isHost?'<button class="btn wide section-gap" data-action="restart">סיבוב חדש — משפט חדש לכל אחד 🎉</button>':'<div class="note">עוד משחק? המארח יכול לפתוח סיבוב חדש באותו חדר.</div>'}<button class="btn outline wide section-gap" data-action="result-share">לשתף את התוצאה</button></section></div>`;playTone(true);}
function start(){if(!canStart(game)){notify('צריך לפחות שני שחקנים ושכולם יסיימו לכתוב');return;}if(startGame(game)){update();scheduleBots();playTone();}}
function scheduleBots(){if(!demo||game.phase!=='question')return;for(const p of game.players.filter(p=>p.bot)){const answerNext=()=>{if(!game||!demo||game.phase!=='question')return;const state=publicView(game,p.id);if(state.phase!=='question')return;const q=game.questions[state.questionIndex];castVote(game,p.id,Math.random()<.65?q.owner:q.options[Math.floor(Math.random()*4)].id,state.questionIndex);update();if(game.phase==='question')demoTimers.push(setTimeout(answerNext,1200+Math.random()*1800));};demoTimers.push(setTimeout(answerNext,1800+Math.random()*2200));}}
function demoGame(){cleanup();demo=true;isHost=true;code='DEMO';currentName='אני';drafts=['אני רק בא לחמש דקות, נשבע'];draftOwners=['1'];draftChoices=[['שמעון','סדעון','פוסח','דניאל']];submitted=false;game=makeGame({id:identity,name:'אני',token:identity});for(const [i,name,text] of [[1,'נועה','מישהו ראה את המטען שלי? הוא היה פה לפני שנייה'],[2,'איתי','אני לא מאחר, אתם פשוט באים מוקדם מדי'],[3,'מאיה','מי אכל את הפיצה שהשארתי במקרר?!']])game.players.push({id:'bot'+i,name,active:true,ready:true,score:0,questions:[{text,options:['שמעון','סדעון','פוסח','דניאל'],correctIndex:i%4}],bot:true});update();}
async function copy(text){try{await navigator.clipboard.writeText(text);notify('הקישור הועתק! שולחים לחבר׳ה.');}catch{const a=document.createElement('textarea');a.value=text;document.body.append(a);a.select();const ok=document.execCommand('copy');a.remove();notify(ok?'הקישור הועתק':'לא ניתן להעתיק. הקוד לחדר הוא '+code);}}
async function share(text,url){if(navigator.share){try{await navigator.share({title:'מי כתב את זה?',text,url});return;}catch(e){if(e.name==='AbortError')return;}}copy(text+'\n'+url);}
function cleanup(){clearTimeout(joinTimer);for(const p of aliasPeers)p.destroy();aliasPeers=[];for(const c of joinConnections)c.close();joinConnections=[];joinMissing=0;joinChosen=false;demoTimers.forEach(clearTimeout);demoTimers=[];for(const c of connections.values())c.close();connections.clear();conn?.close();peer?.destroy();conn=null;peer=null;game=null;view=null;isHost=false;demo=false;busy=false;pending=false;networkError='';lastRenderKey='';myId=identity;}
function leave(){if(isHost&&!demo&&connections.size){for(const c of connections.values())if(c.open)c.send({type:'closed'});}cleanup();const u=new URL(location.href);u.search='';history.replaceState(null,'',u.pathname);joinCode='';home();}
app.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.vote){if(isHost){if(castVote(game,identity,b.dataset.vote,view.questionIndex)){playTone();update();}}else if(conn?.open){conn.send({type:'vote',questionIndex:view.questionIndex,target:b.dataset.vote});view.vote=b.dataset.vote;render(true);playTone();}else notify('החיבור למארח נותק. נסו להתחבר מחדש.');return;}
  if(b.dataset.kick&&isHost){const id=b.dataset.kick,c=connections.get(id);if(c?.open)c.send({type:'kicked'});connections.delete(id);c?.close();game.players=game.players.filter(p=>p.id!==id);update();return;}
  switch(b.dataset.action){case'demo':demoGame();break;case'leave':case'cancel':leave();break;case'copy':copy(link());break;case'share':share('מי כתב את זה? בואו לשחק! קוד החדר: '+code,link());break;case'edit':drafts=[view.myQuestions[0]?.text||''];draftChoices=[[...(view.myQuestions[0]?.options||['','','',''])]];draftOwners=view.myQuestions.length?[String(view.myQuestions[0].correctIndex)]:[];submitted=false;if(isHost){game.players.find(p=>p.id===identity).ready=false;update();}else{if(conn?.open)conn.send({type:'edit'});render(true);}break;case'begin-writing':if(isHost&&startWriting(game)){update();playTone();}break;case'start':start();break;case'restart':if(isHost&&startNewCycle(game)){drafts=[''];draftOwners=[];draftChoices=[['','','','']];submitted=false;if(demo){for(const p of game.players.filter(p=>p.bot))submitQuestions(game,p.id,[{text:'משפט חדש של '+p.name,options:['שמעון','סדעון','פוסח','דניאל'],correctIndex:1}]);}update();}break;case'result-share':share('שיחקנו ״מי כתב את זה?״ 🏆\n'+[...view.players].sort((a,b)=>b.score-a.score).map(p=>p.name+': '+num(p.score)+' נקודות').join('\n'),new URL('./',location.href).href);break;}
});
function confetti(){const d=document.createElement('div');d.className='confetti';d.setAttribute('aria-hidden','true');for(let i=0;i<32;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.animationDelay=Math.random()+'s';p.style.transform=`rotate(${Math.random()*180}deg)`;d.append(p);}document.body.append(d);setTimeout(()=>d.remove(),5000);}
setInterval(()=>{if(!view)return;
  if(!isHost&&conn?.open&&Date.now()-lastHeartbeat>5000)conn.send({type:'ping'});
  if(isHost&&!demo){let changed=false;for(const [id,c] of connections){if(Date.now()-(c._lastSeen||0)>20000){const p=game.players.find(p=>p.id===id);if(p?.active){p.active=false;changed=true;}}}if(changed){finishIfReady(game);update();}}
},250);
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key.toLowerCase()==='m')$('#sound').click();if(e.key.toLowerCase()==='f')$('#fullscreen').click();if(/^[1-9]$/.test(e.key)){const b=document.querySelectorAll('[data-vote]')[Number(e.key)-1];if(b&&!b.disabled)b.click();}});
window.addEventListener('beforeunload',e=>{if(isHost&&!demo&&game&&game.players.length>1){e.preventDefault();e.returnValue='';}});
home();
