var D={mem:[],ren:[],sm:{},teams:[],msgs:[],reps:[],health:{},lineIssues:[],lineIssueOpen:0};
var G={mem:[],sm:{},tasks:[],nm:[],dec:[]};
var S={role:'',token:null,sr:''};
var mzf='all',ftf='all',rff='all',gzf='all',tsf='all';
var gwModeFilter='all'; // 'all' | 'active' | 'growth_watch'
var memCache=[];
var dc=null,bc=null,jc=null,mdc=null;
var bulkSel={};          // name → {name,mentor} for bulk actions
var _gsResults=[];       // global search results
var arTimer=null,arCount=300,arActive=true;  // auto-refresh
var _m360={name:'',mentor:'',repRow:0,repTeam:''};  // current modal member

function normalizeGrowthMember(m){
  m=m||{};
  var name=String(m.name||'').trim();
  var nick=String(m.nick||'').trim();
  var mentor=String(m.mentor||'').trim();
  return Object.assign({},m,{
    name:name||nick||'ไม่ระบุชื่อ',
    nick:nick,
    mentor:mentor,
    score:Number(m.score)||0,
    tl:String(m.tl||'none'),
    zone:String(m.zone||'insufficient'),
    given:Number(m.given)||0,
    recv:Number(m.recv)||0,
    tyfcb:Number(m.tyfcb)||0,
    absent:Number(m.absent)||0,
    attend:Number(m.attend)||0,
    rg:Number(m.rg)||0,
    rr:Number(m.rr)||0,
    rgCount:Number(m.rgCount)||0,
    rrCount:Number(m.rrCount)||0,
    giveRatio:Number(m.giveRatio)||0,
    visitors:Number(m.visitors)||0,
    r121:Number(m.r121)||0,
    oToOne:Number(m.oToOne)||0,
    ceu:Number(m.ceu)||0,
    bniDays:Number(m.bniDays)||0,
    tyfcbPerDay:Number(m.tyfcbPerDay)||0,
    hist:Array.isArray(m.hist)?m.hist:[],
  });
}

var SUPABASE_API='https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/api';
var SUPABASE_ANON='sb_publishable_vTX2pRpd9axDyAuMHTVhDQ_zfS1VE-j';
var SUPABASE_URL_AUTH='https://itwyjhlfemxsfbimshby.supabase.co';
var API_HEADERS={'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON};
var APP_STATIC_VERSION='2026.08.23-one-to-one-manual-pair.1';
try{
  var _svKey='bni_dashboard_static_version';
  var _prevSv=localStorage.getItem(_svKey)||'';
  if(_prevSv&&_prevSv!==APP_STATIC_VERSION)console.info('[BNI Dashboard] static version updated',_prevSv,'→',APP_STATIC_VERSION);
  localStorage.setItem(_svKey,APP_STATIC_VERSION);
}catch(e){}
var DESKTOP_ROLE_TARGET=(function(){
  try{
    var r=(new URLSearchParams(window.location.search).get('role')||'').toLowerCase();
    return (r==='mc'||r==='growth')?r:'';
  }catch(e){return '';}
})();
var _sbAuth=null;
var _supabaseSdkPromise=null;
var _html2canvasPromise=null;
var DSH_SESSION_KEY='bni_dash_session';
var _desktopAuthCheckStarted=false;
function getSbAuth(){if(!_sbAuth&&window.supabase){_sbAuth=window.supabase.createClient(SUPABASE_URL_AUTH,SUPABASE_ANON,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});}return _sbAuth;}
function loadExternalScript(src,test){
  if(test())return Promise.resolve();
  return new Promise(function(resolve,reject){
    var script=document.createElement('script');script.src=src;script.async=true;
    script.onload=function(){resolve();};script.onerror=function(){reject(new Error('โหลดส่วนเสริมไม่สำเร็จ'));};
    document.head.appendChild(script);
  });
}
function loadSupabaseSdk(){
  if(window.supabase)return Promise.resolve(window.supabase);
  if(!_supabaseSdkPromise)_supabaseSdkPromise=loadExternalScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',function(){return !!window.supabase;}).then(function(){return window.supabase;}).catch(function(e){_supabaseSdkPromise=null;throw e;});
  return _supabaseSdkPromise;
}
function loadHtml2Canvas(){
  if(window.html2canvas)return Promise.resolve(window.html2canvas);
  if(!_html2canvasPromise)_html2canvasPromise=loadExternalScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',function(){return !!window.html2canvas;}).then(function(){return window.html2canvas;}).catch(function(e){_html2canvasPromise=null;throw e;});
  return _html2canvasPromise;
}
function getDashSession(){try{return JSON.parse(sessionStorage.getItem(DSH_SESSION_KEY)||'null');}catch{return null;}}
function storeDashSession(s){try{sessionStorage.setItem(DSH_SESSION_KEY,JSON.stringify(s));}catch{}}
function clearDashSession(){try{sessionStorage.removeItem(DSH_SESSION_KEY);}catch{}}
function oauthRedirectUrl(){return window.location.origin+window.location.pathname+(DESKTOP_ROLE_TARGET?'?role='+encodeURIComponent(DESKTOP_ROLE_TARGET):'');}
function showDesktopLoginError(message){var el=document.getElementById('lerr');if(el)el.textContent=message||'';document.getElementById('login').style.display='flex';}
function desktopTimeout(promise,ms,message){return Promise.race([promise,new Promise(function(_,reject){setTimeout(function(){reject(new Error(message||'หมดเวลารอการตอบกลับ'));},ms);})]);}
function requestDesktopRole(token){var controller=typeof AbortController!=='undefined'?new AbortController():null,timer=controller?setTimeout(function(){controller.abort();},12000):null;return fetch(SUPABASE_API,{method:'POST',headers:API_HEADERS,body:JSON.stringify({action:'getMyRole',token:token}),signal:controller?controller.signal:undefined}).then(function(res){if(!res.ok)throw new Error('ระบบยืนยันสิทธิ์ตอบกลับ '+res.status);return res.json();}).finally(function(){if(timer)clearTimeout(timer);});}
function checkDesktopGoogleSession(){
  if(_desktopAuthCheckStarted)return;
  _desktopAuthCheckStarted=true;
  var sb=getSbAuth();
  if(!sb){_desktopAuthCheckStarted=false;ld(false);showDesktopLoginError('ไม่สามารถโหลดระบบ Google Login ได้ กรุณารีเฟรชหน้า');return;}
  desktopTimeout(sb.auth.getSession(),10000,'หมดเวลาตรวจสอบ Google session').then(function(res){
    var session=res&&res.data&&res.data.session;
    if(!session||!session.access_token){_desktopAuthCheckStarted=false;ld(false);showDesktopLoginError('');return;}
    S.token=session.access_token;ld(true);
    requestDesktopRole(S.token).then(function(r){
      _desktopAuthCheckStarted=false;
      ld(false);
      if(r&&r.ok){showDesktopLoginError('');enterApp(r);return;}
      S.token=null;
      showDesktopLoginError((r&&r.error)||'ไม่สามารถตรวจสอบสิทธิ์อีเมลได้ กรุณาลองใหม่');
      sb.auth.signOut().catch(function(){});
    }).catch(function(e){
      _desktopAuthCheckStarted=false;S.token=null;ld(false);
      showDesktopLoginError(e&&e.name==='AbortError'?'ระบบยืนยันสิทธิ์ใช้เวลานานเกินไป กรุณากด Login อีกครั้ง':'ตรวจสอบสิทธิ์อีเมลไม่สำเร็จ: '+(e&&e.message?e.message:'กรุณาลองใหม่'));
    });
  }).catch(function(e){_desktopAuthCheckStarted=false;ld(false);showDesktopLoginError('ตรวจสอบ Google session ไม่สำเร็จ: '+(e&&e.message?e.message:'กรุณาลองใหม่'));});
}

function dPinSubmit(){
  var role=document.getElementById('d-role-sel').value;
  var pin=(document.getElementById('d-pin-in').value||'').trim();
  var errEl=document.getElementById('lerr');
  var btn=document.getElementById('d-pin-btn');
  errEl.textContent='';
  if(!pin){errEl.textContent='กรุณาใส่ PIN';return;}
  btn.disabled=true;btn.textContent='กำลังตรวจสอบ...';
  fetch(SUPABASE_API,{method:'POST',headers:API_HEADERS,body:JSON.stringify({action:'login',role:role,pin:pin})})
    .then(function(r){return r.json();})
    .then(function(r){
      btn.disabled=false;btn.textContent='เข้าสู่ระบบ';
      if(r.ok){
        S.pin=pin;
        storeDashSession({role:r.role,pin:pin,displayName:r.displayName,isMC:r.isMC,teamName:r.teamName});
        document.getElementById('login').style.display='none';
        enterApp(r);
      }else{
        errEl.textContent=r.error||'PIN ไม่ถูกต้อง';
        document.getElementById('d-pin-in').value='';document.getElementById('d-pin-in').focus();
      }
    })
    .catch(function(){btn.disabled=false;btn.textContent='เข้าสู่ระบบ';errEl.textContent='เกิดข้อผิดพลาด กรุณาลองใหม่';});
}
function checkSession(){
  var sess=getDashSession();
  if(sess&&sess.role&&sess.pin){
    S.pin=sess.pin;
    ld(true);
    fetch(SUPABASE_API,{method:'POST',headers:API_HEADERS,body:JSON.stringify({action:'login',role:sess.role,pin:sess.pin})})
      .then(function(r){return r.json();})
      .then(function(r){if(r.ok){ld(false);enterApp(r);}else{clearDashSession();prepareDesktopGoogleSession();}})
      .catch(function(){clearDashSession();prepareDesktopGoogleSession();});
    return;
  }
  prepareDesktopGoogleSession();
}
function prepareDesktopGoogleSession(){
  // Mobile and Desktop share the same Supabase session on this origin. Check
  // the persisted session instead of relying on page-specific login markers.
  loadSupabaseSdk().then(checkDesktopGoogleSession).catch(function(e){ld(false);showDesktopLoginError(e.message||'โหลดระบบ Google Login ไม่สำเร็จ');});
}
function gsr(a,p,cb){
  var payload=Object.assign({action:a},p||{});
  if(S&&S.token)payload.token=S.token;
  if(S&&S.pin)payload.pin=S.pin;
  if(S&&S.role&&!payload.role)payload.role=S.role;
  fetch(SUPABASE_API,{method:'POST',headers:API_HEADERS,body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(r){cb(r);}).catch(function(e){cb({ok:false,error:e.message});});
}
function call(a,p,cb){gsr(a,p,cb||function(){});}
function ld(v){document.getElementById('ov').style.display=v?'flex':'none';}
function setDesktopTabs(role){
  var activeGroup=role==='growth'?'gr':'mc';
  ['mc','gr'].forEach(function(group){
    var wrap=document.getElementById(group+'-tabs-wrap');
    var tabs=document.getElementById(group+'-tabs');
    var active=group===activeGroup;
    if(wrap)wrap.style.display=active?'block':'none';
    if(tabs)tabs.style.display=active?'flex':'none';
  });
}

// ── Login: now handled by Google OAuth ────────────────────────
function enterApp(r){
  S.actualRole=r.role;S.isAdmin=!!r.isAdmin||r.role==='admin';S.role=r.role==='admin'?'mc':r.role;S.isMC=r.isMC;S.teamName=r.teamName;S.displayName=r.displayName;
  S.canRoleSwitch=S.canRoleSwitch||S.isMC||S.role==='toomtam';
  if(DESKTOP_ROLE_TARGET&&DESKTOP_ROLE_TARGET!==S.role&&(S.isMC||S.role==='toomtam')){
    var target=DESKTOP_ROLE_TARGET;
    DESKTOP_ROLE_TARGET='';
    switchDesktopRole(target);
    return;
  }
  DESKTOP_ROLE_TARGET='';
  gsr('logUsage',{role:S.role,team:r.teamName||S.role,platform:'desktop',logAction:'login',detail:r.displayName||S.role},function(){});
  var nm={mc:'👑 Mentor Co',growth:'📈 Growth Committee',admin:'🛡 Chapter Admin'},shownRole=S.isAdmin?'admin':S.role;
  document.getElementById('hrole').textContent=nm[shownRole]||shownRole;
  var mini=document.getElementById('cc-role-mini');if(mini)mini.textContent=nm[shownRole]||shownRole;
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='grid';
  setDesktopTabs(S.role);
  restoreTabFold(S.role==='mc'?'mc':'gr');
  var meetingBtn=document.getElementById('btn-meeting');if(meetingBtn)meetingBtn.style.display=S.role==='mc'?'':'none';
  document.getElementById('btn-monthly-sync').style.display=S.isAdmin?'':'none';
  document.getElementById('btn-admin-settings').style.display=S.isAdmin?'':'none';
  document.querySelectorAll('[data-admin-only="1"]').forEach(function(el){el.style.display=S.isAdmin?'':'none';});
  document.getElementById('btn-role-growth').style.display=(S.canRoleSwitch&&S.role==='mc')?'':'none';
  document.getElementById('btn-role-mc').style.display=(S.canRoleSwitch&&S.role==='growth')?'':'none';
  document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('on');});
  document.querySelectorAll('#mc-tabs .tb,#gr-tabs .tb').forEach(function(b){b.classList.remove('on');});
  var defSec=S.role==='mc'?'mc-ov':'gr-ov';
  document.getElementById(defSec).classList.add('on');
  var firstTab=document.querySelector('#'+(S.role==='mc'?'mc':'gr')+'-tabs .tb');
  if(firstTab)firstTab.classList.add('on');
  loadFilters();
  startAR();
  reload();
}
function switchDesktopRole(target){
  target=String(target||'').toLowerCase();
  if(!target||target===S.role)return;
  ld(true);
  var switchPayload=S.token
    ?{action:'viewAsRole',targetRole:target,token:S.token}
    :{action:'login',role:target,pin:S.pin};
  fetch(SUPABASE_API,{method:'POST',headers:API_HEADERS,body:JSON.stringify(switchPayload)})
    .then(function(res){return res.json();})
    .then(function(r){
      ld(false);
      if(!r||!r.ok){alert('สลับ Role ไม่สำเร็จ: '+((r&&r.error)||'ไม่ทราบสาเหตุ'));return;}
      if(arTimer){clearInterval(arTimer);arTimer=null;}
      D={mem:[],ren:[],sm:{},teams:[],msgs:[],reps:[],health:{},lineIssues:[],lineIssueOpen:0};
      G={mem:[],sm:{},tasks:[],nm:[],dec:[]};
      bulkSel={};cmpState=[];
      if(dc){dc.destroy();dc=null;} if(bc){bc.destroy();bc=null;} if(jc){jc.destroy();jc=null;} if(mdc){mdc.destroy();mdc=null;} if(tdc){tdc.destroy();tdc=null;} if(tdc2){tdc2.destroy();tdc2=null;}
      enterApp(r);
    })
    .catch(function(){ld(false);alert('สลับ Role ไม่สำเร็จ');});
}
function signInWithGoogle(){
  showDesktopLoginError('กำลังเปิด Google Login...');
  try{localStorage.setItem('bni_desktop_google_auth_used','1');}catch(e){}
  loadSupabaseSdk().then(function(){var sb=getSbAuth();if(!sb)throw new Error('ไม่สามารถเริ่ม Google Login ได้');return sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:oauthRedirectUrl()}});}).then(function(res){
    if(res&&res.error)showDesktopLoginError('เปิด Google Login ไม่สำเร็จ: '+res.error.message);
  }).catch(function(e){showDesktopLoginError('เปิด Google Login ไม่สำเร็จ: '+(e&&e.message?e.message:'กรุณาลองใหม่'));});
}
function logout(){
  clearDashSession();
  var sb=getSbAuth();if(sb)sb.auth.signOut();
  try{localStorage.removeItem('bni_desktop_google_auth_used');}catch(e){}
  clearInterval(arTimer);arTimer=null;
  S={role:'',token:null,pin:null,sr:'',canRoleSwitch:false};
  D={mem:[],ren:[],sm:{},teams:[],msgs:[],reps:[],health:{},lineIssues:[],lineIssueOpen:0};
  G={mem:[],sm:{},tasks:[],nm:[],dec:[]};
  bulkSel={};updateBulkBar();
  if(dc){dc.destroy();dc=null;} if(bc){bc.destroy();bc=null;} if(jc){jc.destroy();jc=null;} if(mdc){mdc.destroy();mdc=null;} if(tdc){tdc.destroy();tdc=null;} if(tdc2){tdc2.destroy();tdc2=null;}
  cmpState=[];updateCmpBar();
  ['mc','gr'].forEach(function(group){
    var wrap=document.getElementById(group+'-tabs-wrap');
    var tabs=document.getElementById(group+'-tabs');
    if(wrap)wrap.style.display='none';
    if(tabs)tabs.style.display='none';
  });
  document.getElementById('login').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('lerr').textContent='';
}

// ── Load ─────────────────────────────────────────
function reload(){
  _scLoaded=false;
  if(S.role==='mc') loadMC();
  else loadGrowth();
}
function manualReload(){
  // Force refresh = ล้าง server cache แล้วโหลดใหม่
  if(S.role==='mc'){loadMC(true);}else{loadGrowth();}
  if(arActive)startAR();
}

// ── Monthly Sync ──────────────────────────────────────────────
function openSyncModal(){
  // Reset state
  for(var i=1;i<=9;i++){
    var el=document.getElementById('sync-s'+i);
    if(el){el.className='sync-step';el.textContent=el.textContent.replace(/^./,'⬜');}
  }
  document.getElementById('sync-progress').style.display='none';
  var btn=document.getElementById('sync-run-btn');
  btn.textContent='🚀 Sync ทั้งหมดเลย';btn.disabled=false;
  document.getElementById('sync-mtl-file').value='';
  document.getElementById('sync-tl-file').value='';
  document.getElementById('sync-r2y-file').value='';
  document.getElementById('sync-modal').classList.add('open');
}
function closeSyncModal(){document.getElementById('sync-modal').classList.remove('open');}
function _setSyncStep(n,state){
  var el=document.getElementById('sync-s'+n);
  if(!el)return;
  var ic={active:'⏳',done:'✅',error:'❌',skip:'⏭️'};
  el.className='sync-step s-'+state;
  el.textContent=el.textContent.replace(/^./,ic[state]||'⬜');
}
function startMonthlySync(){
  var mtlFile=document.getElementById('sync-mtl-file').files[0];
  var tlFile=document.getElementById('sync-tl-file').files[0];
  if(!mtlFile&&!tlFile){toast('⚠️ กรุณาเลือกไฟล์ Member Traffic Light หรือ Traffic Lights ก่อน');return;}
  var btn=document.getElementById('sync-run-btn');
  btn.disabled=true;btn.textContent='⏳ กำลังอ่านไฟล์...';
  document.getElementById('sync-progress').style.display='block';
  _setSyncStep(1,'active');
  function readFile(file,cb){if(!file){cb(null);return;}var r=new FileReader();r.onload=function(e){cb(e.target.result);};r.readAsText(file,'UTF-8');}
  readFile(tlFile,function(tlCsv){
    _setSyncStep(1,tlCsv?'done':'skip');_setSyncStep(2,'active');
    btn.textContent='⏳ กำลัง Sync...';
    var r2yFile=document.getElementById('sync-r2y-file').files[0];
    readFile(r2yFile,function(r2yCsv){
      readFile(mtlFile,function(mtlCsv){
        gsr('monthlySync',{role:S.role,tlCsv:tlCsv||null,r2yCsv:r2yCsv||null,memberTLCsv:mtlCsv||null},function(r){
          if(!r||!r.ok){
            _setSyncStep(2,'error');
            btn.textContent='❌ '+(r&&r.error||'Sync ไม่สำเร็จ');
            btn.disabled=false;
            return;
          }
          var hasTL=!!tlCsv,hasR2y=!!r2yCsv,hasMTL=!!mtlCsv;
          _setSyncStep(2,r.ok?((hasTL||hasMTL)?'done':'skip'):'error');
          _setSyncStep(3,r.nonMentorOk?'done':'error');
          _setSyncStep(4,r.counterOk?'done':'error');
          _setSyncStep(5,r.r2yOk?(hasR2y?'done':'skip'):'error');
          _setSyncStep(6,r.r2ySyncOk?'done':'error');
          _setSyncStep(7,r.renewalOk?'done':'error');
          _setSyncStep(8,r.grOk?(hasMTL?'done':'skip'):'error');
          _setSyncStep(9,r.mtlOk?(hasMTL?'done':'skip'):'error');
          var coreOk=r.nonMentorOk&&r.counterOk&&r.grOk&&r.r2ySyncOk&&r.renewalOk&&r.mtlOk;
          var period=(r.scoreYear&&r.scoreMonth)?(' · คะแนนล่าสุด '+r.scoreMonth+'/'+r.scoreYear):'';
          var enrolled=r.autoEnrolled>0?' · เพิ่ม New Member อัตโนมัติ '+r.autoEnrolled+' คน':'';
          var errTxt=(r.errors&&r.errors.length)?(' · '+r.errors.join(' | ')):'';
          var unmatchedTxt='';
          if(r.trafficLightUnmatched&&r.trafficLightUnmatched.length){
            unmatchedTxt+=' · ⚠️ ชื่อใน Traffic Light Evolution ไม่ match ในระบบ ('+r.trafficLightUnmatched.length+' คน): '+r.trafficLightUnmatched.join(', ');
          }
          if(r.r2yUnmatched&&r.r2yUnmatched.length){
            unmatchedTxt+=' · ⚠️ ชื่อใน R2Y ไม่ match ในระบบ ('+r.r2yUnmatched.length+' คน): '+r.r2yUnmatched.join(', ');
          }
          btn.textContent=coreOk?'✅ Sync สำเร็จ!'+period+enrolled+unmatchedTxt+' (คลิกปิดแล้วรีเฟรช)':'⚠️ บางขั้นตอนมีข้อผิดพลาด'+errTxt+unmatchedTxt;
          btn.disabled=false;
          if(coreOk){setTimeout(function(){manualReload();},800);}
        });
      });
    });
  });
}

function loadMC(forceRefresh){
  ld(true);
  loadDeskLineMembers();
  var done=0;
  var guard=setTimeout(function(){
    if(done<3){
      console.warn('[dashboard] loadMC timeout guard released overlay',done);
      ld(false);
      toast('โหลดข้อมูลช้ากว่าปกติ แต่เมนูยังใช้งานได้ครับ','err');
    }
  },12000);
  function chk(){done++;if(done===3){clearTimeout(guard);ld(false);updateBadges();}}
  gsr('getDesktopDashboard',{role:S.role,forceRefresh:!!forceRefresh},function(r){
    try{
      if(r.ok){D.mem=r.members||[];D.ren=r.renewal||[];D.sm=r.summary||{};D.teams=r.teams||[];D.health=r.health||{};
        if(r.nmList&&r.nmList.length){G.nm=r.nmList;}
        var upLabel='อัพเดท: '+(r.updatedAt||'—')+(r.fromCache?' ⚡ cached':'');
        document.getElementById('hup').textContent=upLabel;
        buildMCFilters();renderMCAll();_populateLinkMemberSelect();}
      else{toast('โหลด MC Dashboard ไม่สำเร็จ: '+(r&&r.error||'unknown'),'err');}
    }catch(e){
      console.error('[dashboard] loadMC render failed',e);
      toast('โหลดบางส่วนไม่สำเร็จ แต่ยังใช้งานเมนูได้: '+(e&&e.message||e),'err');
    }finally{chk();}
  });
  gsr('getMessages',{role:'mc'},function(r){
    try{
      if(r.ok){D.msgs=r.messages||[];}
      gsr('getMemberList',{role:'mc'},function(r2){try{if(r2.ok){memCache=r2.members||[];refreshMsgTeams();if(document.getElementById('msgTeam')&&document.getElementById('msgTeam').value)loadMsgMem();}}catch(e){console.error('[dashboard] member list render failed',e);}});
      gsr('getReadMsgKeys',{role:'mc'},function(rk){
        try{
          if(rk&&rk.ok&&rk.keys){rk.keys.forEach(function(k){_readMsgs[k]=1;});try{localStorage.setItem('bni_readmsgs',JSON.stringify(_readMsgs));}catch(e){}}
          renderMsgs();updateBadges();
        }catch(e){console.error('[dashboard] messages render failed',e);}
      });
    }catch(e){
      console.error('[dashboard] loadMC messages failed',e);
    }finally{chk();}
  });
  gsr('getReports',{role:'mc'},function(r){
    try{
      if(r.ok){D.reps=r.reports||[];renderRep();}
    }catch(e){
      console.error('[dashboard] reports render failed',e);
    }finally{chk();}
  });
  loadLineIssueBadge(true);
}

function loadGrowth(){
  ld(true);
  var done=0;
  var guard=setTimeout(function(){
    if(done<3){
      console.warn('[dashboard] loadGrowth timeout guard released overlay',done);
      ld(false);
      toast('โหลดข้อมูลช้ากว่าปกติ แต่เมนูยังใช้งานได้ครับ','err');
    }
  },12000);
  function chk(){done++;if(done===3){clearTimeout(guard);ld(false);updateBadges();}}
  gsr('getGrowthData',{},function(r){
    try{
      if(r.ok){G.mem=(r.members||[]).map(normalizeGrowthMember);G.sm=r.summary||{};
        document.getElementById('hup').textContent='อัพเดท: '+new Date().toLocaleTimeString('th');
        buildGrowthFilters();renderGrowthAll();}
    }catch(e){
      console.error('[dashboard] loadGrowth render failed',e);
      toast('โหลด Growth บางส่วนไม่สำเร็จ แต่ยังใช้งานเมนูได้: '+(e&&e.message||e),'err');
    }finally{chk();}
  });
  gsr('getGrowthTasks',{statusFilter:'all'},function(r){
    try{if(r.ok){G.tasks=r.tasks||[];renderTasks();}}
    catch(e){console.error('[dashboard] growth tasks render failed',e);}
    finally{chk();}
  });
  gsr('getNewMembers',{},function(r){
    try{
      if(r.ok){G.nm=r.members||[];renderNM();renderChapterPulse();}
      gsr('getRiskMembers',{},function(r2){
        try{if(r2.ok){G.dec=r2.risks||[];renderDec();}}
        catch(e){console.error('[dashboard] growth risk render failed',e);}
      });
    }catch(e){
      console.error('[dashboard] new member render failed',e);
    }finally{chk();}
  });
  loadGrowthRenewals();
}

// ─── MC: Build Filters ────────────────────────────
function buildMCFilters(){
  var teams=D.teams.map(function(t){return t.team;});
  ['mtf','ftt'].forEach(function(id){
    var s=document.getElementById(id);
    s.innerHTML='<option value="">ทุกทีม</option>';
    teams.forEach(function(t){s.innerHTML+='<option value="'+esc(t)+'">'+esc(t)+'</option>';});
  });
  buildCoachFilters();
  initThreshUI();
}

// ─── MC: Render All ──────────────────────────────
function renderKpiHero(){
  var el=document.getElementById('mc-kpi-hero');if(!el)return;
  var mem=D.mem||[],ren=D.ren||[],teams=D.teams||[];
  var sc=mem.filter(function(m){return m.bniTl!=='none';});
  var avg=sc.length?Math.round(sc.reduce(function(a,m){return a+m.bniScore;},0)/sc.length):0;
  var avgC=avg>=70?'var(--gr)':avg>=50?'var(--ye)':avg>=30?'var(--re)':'var(--sub)';
  var avgLabel=avg>=70?'Green':'Yellow';
  var atRisk=mem.filter(function(m){return m.bniTl!=='none'&&m.bniScore<50;}).length;
  var ren45=ren.filter(function(r){return r.diffDays<=45;}).length;

  var html='<div class="kpi-hero-grid">'
    +'<div class="kpi-hero-main">'
    +'<div class="kpi-hero-eyebrow">Chapter Score เฉลี่ย</div>'
    +'<div class="kpi-hero-number" style="color:'+avgC+'">'+avg+'</div>'
    +'<div class="kpi-hero-bar"><div class="kpi-hero-bar-fill" style="width:'+Math.min(100,avg)+'%;background:'+avgC+'"></div></div>'
    +'<div style="font-size:12px;color:var(--sub);margin-top:6px">'+sc.length+' คนมีข้อมูล · '+avgLabel+' Zone</div>'
    +'</div>'
    +'<div class="kpi-side-card" onclick="sw(\'mc-risk\',null,\'mc\')">'
    +'<div class="kpi-hero-eyebrow">At Risk</div>'
    +'<div class="kpi-side-num" style="color:var(--re)">'+atRisk+'</div>'
    +'<div style="font-size:11px;color:var(--sub);margin-top:auto;padding-top:12px">Score &lt; 50 pts</div>'
    +'</div>'
    +'<div class="kpi-side-card" onclick="sw(\'mc-ren\',null,\'mc\')">'
    +'<div class="kpi-hero-eyebrow">Renewal ≤45 วัน</div>'
    +'<div class="kpi-side-num" style="color:var(--ye)">'+ren45+'</div>'
    +'<div style="font-size:11px;color:var(--sub);margin-top:auto;padding-top:12px">ต้องต่ออายุเร็วๆ นี้</div>'
    +'</div>'
    +'</div>';

  if(teams.length){
    html+='<div class="kpi-team-grid">';
    teams.forEach(function(t){
      var tc=t.avg>=70?'var(--gr)':t.avg>=50?'var(--ye)':t.avg>=30?'var(--re)':'var(--sub)';
      html+='<div class="kpi-team-card" onclick="sw(\'mc-team\',null,\'mc\');loadDesktopScorecard()">'
        +'<div class="kpi-team-name">'+(t.team||'—')+'</div>'
        +'<div class="kpi-team-score" style="color:'+tc+'">'+(t.avg||'—')+'</div>'
        +'<div class="kpi-team-count">'+(t.count||0)+' คน</div>'
        +'</div>';
    });
    html+='</div>';
  }
  el.innerHTML=html;
}

function renderMCAll(){
  renderKpiHero();renderChapterPulse();renderFocusBar();
  renderDonut();renderBar();renderIntelGrid();
  renderChapterHealth();renderSeatMap();renderPassportCal();
  renderMem();renderFT();renderMTTeams();renderRen();renderRisk();renderCoach();renderPriority();
  renderKPI();renderSmartAlerts();renderAlertDigest();
  renderGWBadge();
  loadNotifications();
  loadLineQuota();
  if(typeof loadUnifiedFollowUpInbox==='function')loadUnifiedFollowUpInbox();
  if(S.isAdmin)loadChapterOpsOverview();
}

var _chapterOpsLoaded=false;
function loadChapterOpsOverview(force){
  var root=document.getElementById('chapter-ops-overview'),metrics=document.getElementById('chapter-ops-metrics'),next=document.getElementById('chapter-ops-next');
  if(!root||!S.isAdmin)return;if(_chapterOpsLoaded&&!force)return;root.style.display='block';metrics.innerHTML='<div class="signal-queue-state">กำลังรวบรวมสถานะระบบ…</div>';next.innerHTML='';
  var result={},pending=4,done=function(){pending--;if(pending>0)return;_chapterOpsLoaded=true;var signals=(result.signals&&result.signals.signals)||[],overdue=signals.filter(function(x){return x.sla_due_at&&new Date(x.sla_due_at)<new Date();}).length,unassigned=signals.filter(function(x){return!x.assigned_member_id&&!x.assigned_role;}).length,lt=result.lt||{},term=(lt.terms||[]).find(function(x){return x.status==='active';}),roles=lt.roles||[],assignments=(lt.assignments||[]).filter(function(x){return x.is_active&&(!term||x.term_id===term.id);}),missingRoles=roles.filter(function(r){return!assignments.some(function(a){return a.lt_role===r.role&&a.assigned_member_id;});}).length,oto=result.oto||{},profile=result.profile||{},stats=oto.stats||{},profileStats=profile.stats||{};var items=[['งานเปิด',signals.length,signals.length?'warn':'ok'],['เกิน SLA',overdue,overdue?'danger':'ok'],['ยังไม่มอบหมาย',unassigned,unassigned?'warn':'ok'],['LT ยังว่าง',missingRoles,missingRoles?'warn':'ok'],['1-2-1 กำลังทำ',Number(stats.active||0),''],['Profile ไม่ครบ',Number(profileStats.incomplete||0)+Number(profileStats.notStarted||0),profileStats.incomplete||profileStats.notStarted?'warn':'ok']];metrics.innerHTML=items.map(function(x){return'<div class="ops-metric '+x[2]+'"><b>'+Number(x[1]||0)+'</b><span>'+esc(x[0])+'</span></div>';}).join('');var actions=[];if(overdue)actions.push(['ดูงานเกิน SLA',"sw('mc-lt-team',null,'mc');loadLtTeam(true)"]);if(missingRoles)actions.push(['กำหนดตำแหน่ง LT',"sw('mc-lt-team',null,'mc');loadLtTeam(true)"]);if(Number(profileStats.incomplete||0)+Number(profileStats.notStarted||0))actions.push(['ติดตาม Business Profile',"sw('mc-w121',null,'mc');w121View('profiles',document.querySelector('[data-w121-view=profiles]'))"]);actions.push(['เปิด 1-2-1 Operations',"sw('mc-w121',null,'mc');w121OpenSystem()"]);next.innerHTML=actions.map(function(a){return'<button class="ops-next-btn" onclick="'+a[1]+'">'+esc(a[0])+' →</button>';}).join('');};
  gsr('getMemberSignals',{role:S.role||'admin'},function(r){result.signals=r&&r.ok?r:{};done();});
  gsr('getLtTeam',{role:S.role||'admin'},function(r){result.lt=r&&r.ok?r:{};done();});
  gsr('getOneToOneOverview',{},function(r){result.oto=r&&r.ok?r:{};done();});
  gsr('getOneToOneProfileDashboard',{},function(r){result.profile=r&&r.ok?r:{};done();});
}

var _lqLoaded=false;
function loadLineQuota(force){
  if(_lqLoaded&&!force)return;
  var usedEl=document.getElementById('lq-used');
  var remEl=document.getElementById('lq-rem');
  var fill=document.getElementById('lq-fill');
  if(usedEl)usedEl.textContent='...';
  gsr('getLineQuota',{role:'mc'},function(r){
    _lqLoaded=true;
    if(!r||!r.ok){
      if(usedEl)usedEl.textContent='err';
      if(remEl)remEl.textContent='—';
      return;
    }
    var unlimited=!!r.unlimited||r.type==='unlimited';
    if(usedEl)usedEl.textContent=unlimited?(r.used+'/∞'):(r.used+'/'+r.limit);
    if(remEl){
      remEl.textContent=unlimited?'ไม่จำกัด':(r.remaining+' ข้อ');
      remEl.style.color=unlimited?'var(--gr)':(r.remaining<50?'var(--re)':r.remaining<100?'var(--ye)':'var(--gr)');
    }
    if(fill){
      fill.style.width=unlimited?'100%':(Math.min(100,r.pct)+'%');
      fill.style.background=unlimited?'var(--gr)':(r.pct>=80?'var(--re)':r.pct>=60?'var(--ye)':'var(--gr)');
    }
  });
}

// ══ CHAPTER HEALTH PANEL ══════════════════════════════════════
function renderChapterHealth(){
  var el=document.getElementById('mc-chapter-health');if(!el)return;
  var h=D.health||{};
  if(!Object.keys(h).length){el.innerHTML='';return;}
  var vis=h.visitors||{};
  var cards=[
    {ico:'👥',lbl:'สมาชิกทั้งหมด',val:h.total||0,sub:'คน',c:'var(--ac)'},
    {ico:'🔄',lbl:'Retention Rate (12 เดือน)',val:(h.retention||0)+'%',sub:h.left12mo>0?'ออก '+h.left12mo+' คน':'คงอยู่ดี',c:h.retention>=80?'var(--gr)':h.retention>=60?'var(--ye)':'var(--re)'},
    {ico:'🟢',lbl:'Green Members',val:(h.greenPct||0)+'%',sub:'ของ Chapter',c:h.greenPct>=50?'var(--gr)':h.greenPct>=30?'var(--ye)':'var(--re)'},
    {ico:'💰',lbl:'Average ROI',val:(h.avgROI||0)+'%',sub:'ต่อสมาชิก (ฐาน 28,000)',c:h.avgROI>=300?'var(--gr)':h.avgROI>=100?'var(--ye)':'var(--re)'},
    {ico:'📊',lbl:'Avg BNI Score',val:h.avgBNI||0,sub:'คะแนนเฉลี่ย',c:h.avgBNI>=70?'var(--gr)':h.avgBNI>=50?'var(--ye)':'var(--re)'},
    {ico:'🌱',lbl:'New Members (6 เดือน)',val:h.added6mo||0,sub:'คนใหม่',c:'var(--ac)'},
    {ico:'🎯',lbl:'Visitors เดือนนี้',val:vis.visitedThisMonth||0,sub:'คน',c:'var(--ac)'},
    {ico:'✅',lbl:'Visitor → Member',val:(vis.convRate||0)+'%',sub:(vis.joined||0)+'/'+( vis.total||0)+' คน',c:vis.convRate>=30?'var(--gr)':vis.convRate>0?'var(--ye)':'var(--sub)'}
  ];
  el.innerHTML='<div class="sh" style="margin-bottom:10px"><h2 style="font-size:13px">📈 Chapter Health Dashboard</h2></div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">'
    +cards.map(function(c){
      return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:12px 14px">'
        +'<div style="font-size:10px;color:var(--sub);margin-bottom:4px">'+c.ico+' '+c.lbl+'</div>'
        +'<div style="font-size:22px;font-weight:800;color:'+c.c+'">'+c.val+'</div>'
        +'<div style="font-size:10px;color:var(--sub);margin-top:2px">'+c.sub+'</div>'
        +'</div>';
    }).join('')+'</div>';
}

// ══ SEAT MAP (Profession / Contact Sphere) ════════════════════
var _seatMapLoaded=false;
function renderSeatMap(){
  var el=document.getElementById('mc-seat-map');if(!el)return;
  if(_seatMapLoaded)return;
  _seatMapLoaded=true;
  el.innerHTML='<div class="sh"><h2 style="font-size:13px">💺 Seat Map — Profession & Contact Sphere</h2></div>'
    +'<div style="font-size:11px;color:var(--sub);margin-bottom:10px">กำลังโหลด...</div>';
  gsr('getSeatMap',{role:'mc'},function(r){
    if(!r.ok||!r.members.length){
      el.innerHTML='<div class="sh"><h2 style="font-size:13px">💺 Seat Map</h2></div>'
        +'<div style="font-size:12px;color:var(--sub);padding:16px">ไม่มีข้อมูล — ต้องมี Sheet "⚡ POWER TEAMS" (Col A=Team, D=Nick, E=Profession)</div>';
      return;
    }
    var byTeam={};
    r.members.forEach(function(m){
      var t=m.team||'อื่นๆ';
      if(!byTeam[t])byTeam[t]=[];
      byTeam[t].push(m);
    });
    var tlC={G:'var(--gr)',Y:'var(--ye)',R:'var(--re)',B:'var(--sub)','':"var(--sub)"};
    var html='<div class="sh" style="margin-bottom:10px"><h2 style="font-size:13px">💺 Seat Map — '+r.members.length+' ที่นั่ง</h2></div>';
    Object.keys(byTeam).forEach(function(team){
      html+='<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:700;color:var(--ac);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">'+esc(team)+'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:8px">';
      byTeam[team].forEach(function(m){
        var tl=String(m.tl||'').toUpperCase();
        var tc=tlC[tl]||'var(--sub)';
        html+='<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;min-width:120px">'
          +'<div style="font-size:12px;font-weight:700;color:'+tc+'">'+esc(m.nick)+'</div>'
          +(m.profession?'<div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc(m.profession)+'</div>':'')
          +'</div>';
      });
      html+='</div></div>';
    });
    el.innerHTML=html;
  });
}

// ══ PASSPORT CALENDAR ═════════════════════════════════════════
var _passCalCache=null;
function renderPassportCal(){
  var el=document.getElementById('mc-passport-cal');if(!el)return;
  if(_passCalCache){_buildPassCalHTML(el,_passCalCache);return;}
  el.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:10px">กำลังโหลด Passport Calendar...</div>';
  gsr('getPassportCalendar',{role:'mc'},function(r){
    if(!r||!r.ok){el.innerHTML='<div class="kc" style="margin-top:0"><div style="font-size:13px;font-weight:600;margin-bottom:6px">📅 Passport Calendar</div><div style="color:var(--re);font-size:12px">'+(r&&r.error?r.error:'ไม่สามารถโหลดได้')+'</div></div>';return;}
    _passCalCache=r.sessions||[];
    _buildPassCalHTML(el,_passCalCache);
  });
}
function _buildPassCalHTML(el,sessions){
  if(!sessions.length){
    el.innerHTML='<div class="kc" style="margin-top:0">'
      +'<div style="font-size:13px;font-weight:600;margin-bottom:6px">📅 Passport Calendar</div>'
      +'<div style="color:var(--sub);font-size:12px;text-align:center;padding:10px 0">ไม่มี Session ใน 4 สัปดาห์หน้า</div>'
      +'</div>';
    return;
  }
  var statusDot={scheduled:'🔵',notified:'🟡',completed:'🟢',missed:'⚫'};
  var rows=sessions.map(function(s){
    var d=new Date(s.date+'T00:00:00');
    var dStr=d.toLocaleDateString('th-TH',{weekday:'short',month:'short',day:'numeric'});
    return '<tr>'
      +'<td style="padding:6px 10px;font-size:11px;white-space:nowrap;color:var(--sub)">'+dStr+'</td>'
      +'<td style="padding:6px 10px;font-size:12px;font-weight:600">'+esc(s.memberNick||s.memberName)+'</td>'
      +'<td style="padding:6px 10px;font-size:11px;color:var(--sub);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(s.title||s.ltRole)+'</td>'
      +'<td style="padding:6px 10px;font-size:12px">'+esc(s.ltName||'—')+'</td>'
      +'<td style="padding:6px 4px;text-align:center;font-size:13px">'+(statusDot[s.status]||'⚪')+'</td>'
      +'</tr>';
  }).join('');
  el.innerHTML='<div class="kc" style="margin-top:0">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    +'<span style="font-size:13px;font-weight:600">📅 Passport Calendar — New Member Meetings</span>'
    +'<button class="bsm" onclick="_passCalCache=null;renderPassportCal()" style="font-size:10px;margin-left:auto">↺</button>'
    +'</div>'
    +'<div class="tw"><table style="width:100%;border-collapse:collapse">'
    +'<thead><tr style="font-size:11px;color:var(--sub);border-bottom:1px solid var(--bd)">'
    +'<th style="padding:4px 10px;text-align:left;font-weight:500">วันที่</th>'
    +'<th style="padding:4px 10px;text-align:left;font-weight:500">New Member</th>'
    +'<th style="padding:4px 10px;text-align:left;font-weight:500">Session</th>'
    +'<th style="padding:4px 10px;text-align:left;font-weight:500">LT ที่รับผิดชอบ</th>'
    +'<th style="padding:4px 4px;text-align:center;font-weight:500"></th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'</table></div>'
    +'<div style="font-size:11px;color:var(--sub);margin-top:8px;display:flex;align-items:center;gap:8px">'
    +'<span>🔵 scheduled · 🟡 notified · 🟢 completed</span>'
    +'<button class="bsm" onclick="sw(\'mc-passport\',null,\'mc\');loadPassportBoard()" style="font-size:10px;margin-left:auto">จัดการ Passport ▸</button>'
    +'</div>'
    +'</div>';
}

// ══ VISITOR LOG ═══════════════════════════════════════════════
var _visLoaded=false;var _visData=[];
function loadVisitorLog(force){
  if(_visLoaded&&!force)return;
  _visLoaded=true;
  gsr('getVisitorLog',{role:'mc'},function(r){
    if(!r.ok){toast('❌ '+(r.error||'โหลดไม่ได้'),'err');return;}
    _visData=r.visitors||[];
    renderVisitorFunnel();renderVisitorTable();
  });
}
function renderVisitorFunnel(){
  var el=document.getElementById('vis-funnel');if(!el)return;
  var total=_visData.length;
  var applied=_visData.filter(function(v){return v.status==='สมัครแล้ว'||v.status==='เป็นสมาชิก';}).length;
  var joined=_visData.filter(function(v){return v.status==='เป็นสมาชิก';}).length;
  var steps=[
    {ico:'👀',lbl:'เยี่ยมชม',val:total,c:'var(--ac)'},
    {ico:'📝',lbl:'สมัคร',val:applied,c:'var(--ye)'},
    {ico:'✅',lbl:'เป็นสมาชิก',val:joined,c:'var(--gr)'},
    {ico:'📊',lbl:'Conversion',val:total>0?Math.round(joined/total*100)+'%':'—',c:joined/total>=0.3?'var(--gr)':'var(--re)'}
  ];
  el.innerHTML=steps.map(function(s){
    return '<div style="flex:1;min-width:100px;background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:14px;text-align:center">'
      +'<div style="font-size:11px;color:var(--sub);margin-bottom:4px">'+s.ico+' '+s.lbl+'</div>'
      +'<div style="font-size:28px;font-weight:800;color:'+s.c+'">'+s.val+'</div>'
      +'</div>';
  }).join('<div style="display:flex;align-items:center;color:var(--sub);font-size:18px;padding:0 4px">›</div>');
}
function renderVisitorTable(){
  var el=document.getElementById('vis-table');if(!el)return;
  var stClr={เยี่ยมชม:'var(--ac)',สมัครแล้ว:'var(--ye)',เป็นสมาชิก:'var(--gr)',ไม่สนใจ:'var(--sub)'};
  if(!_visData.length){el.innerHTML='<div style="text-align:center;padding:30px;color:var(--sub);font-size:13px">🗂️ ยังไม่มีข้อมูล Visitor — กด ➕ เพิ่ม Visitor</div>';return;}
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px">'
    +'<thead><tr style="background:var(--sf2)">'
    +'<th style="padding:8px 10px;text-align:left;color:var(--sub)">วันที่</th>'
    +'<th style="padding:8px 10px;text-align:left;color:var(--sub)">ชื่อ</th>'
    +'<th style="padding:8px 10px;text-align:left;color:var(--sub)">อาชีพ</th>'
    +'<th style="padding:8px 10px;text-align:left;color:var(--sub)">เชิญโดย</th>'
    +'<th style="padding:8px 10px;text-align:center;color:var(--sub)">สถานะ</th>'
    +'<th style="padding:8px 10px;text-align:left;color:var(--sub)">หมายเหตุ</th>'
    +'<th style="padding:8px 4px;text-align:center;color:var(--sub)">จัดการ</th>'
    +'</tr></thead><tbody>'
    +_visData.map(function(v){
      var sc=stClr[v.status]||'var(--sub)';
      return '<tr style="border-bottom:1px solid var(--bd)">'
        +'<td style="padding:8px 10px;color:var(--sub)">'+esc(v.date)+'</td>'
        +'<td style="padding:8px 10px;font-weight:600">'+esc(v.name)+'</td>'
        +'<td style="padding:8px 10px;color:var(--sub);font-size:11px">'+esc(v.profession||'—')+'</td>'
        +'<td style="padding:8px 10px;color:var(--sub)">'+esc(v.invitedBy||'—')+'</td>'
        +'<td style="padding:8px 10px;text-align:center"><select onchange="visUpdateStatus('+v.row+',this.value)" style="background:transparent;border:1px solid '+sc+';color:'+sc+';border-radius:6px;padding:2px 6px;font-size:11px;outline:none">'
        +['เยี่ยมชม','สมัครแล้ว','เป็นสมาชิก','ไม่สนใจ'].map(function(s){return '<option value="'+s+'"'+(v.status===s?' selected':'')+'>'+s+'</option>';}).join('')
        +'</select></td>'
        +'<td style="padding:8px 10px;color:var(--sub);font-size:11px">'+esc(v.notes||'—')+'</td>'
        +'<td style="padding:8px 4px;text-align:center"><button onclick="visDelete('+v.row+')" style="background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.25);color:var(--re);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer">🗑️</button></td>'
        +'</tr>';
    }).join('')+'</tbody></table>';
}
function visOpenAdd(){
  closeAllModals();
  var today=new Date();var mm=String(today.getMonth()+1).padStart(2,'0');var dd=String(today.getDate()).padStart(2,'0');
  document.getElementById('vis-in-date').value=today.getFullYear()+'-'+mm+'-'+dd;
  document.getElementById('vis-in-name').value='';
  document.getElementById('vis-in-prof').value='';
  document.getElementById('vis-in-invby').value='';
  document.getElementById('vis-in-status').value='เยี่ยมชม';
  document.getElementById('vis-in-notes').value='';
  document.getElementById('vis-add-modal').style.display='flex';
}
function visSave(){
  var name=document.getElementById('vis-in-name').value.trim();
  if(!name){toast('❌ ต้องระบุชื่อ Visitor','err');return;}
  var d=document.getElementById('vis-in-date').value;
  var parts=d.split('-');var thDate=parts[2]+'/'+parts[1]+'/'+parts[0];
  document.getElementById('vis-add-modal').style.display='none';
  gsr('addVisitor',{role:'mc',visitDate:thDate,visitorName:name,
    profession:document.getElementById('vis-in-prof').value.trim(),
    invitedByName:document.getElementById('vis-in-invby').value.trim(),
    status:document.getElementById('vis-in-status').value,
    notes:document.getElementById('vis-in-notes').value.trim()
  },function(r){
    if(!r.ok){toast('❌ '+(r.error||'บันทึกไม่สำเร็จ'),'err');return;}
    toast('✅ เพิ่ม Visitor แล้ว','ok');
    _visLoaded=false;loadVisitorLog(true);
  });
}
function visUpdateStatus(row,val){
  gsr('updateVisitor',{role:'mc',row:row,field:'status',value:val},function(r){
    if(!r.ok){toast('❌ อัปเดตไม่สำเร็จ','err');return;}
    var v=_visData.find(function(x){return x.row===row;});
    if(v)v.status=val;
    renderVisitorFunnel();renderVisitorTable();
    renderChapterHealth();
  });
}
function visDelete(row){
  gsr('updateVisitor',{role:'mc',row:row,field:'delete'},function(r){
    if(!r.ok){toast('❌ ลบไม่สำเร็จ','err');return;}
    toast('✅ ลบแล้ว','ok');
    _visLoaded=false;loadVisitorLog(true);
  });
}

// ══ ZONE A: Chapter Pulse ══════════════════════════════════
function renderChapterPulse(){
  var el=document.getElementById('mc-pulse');if(!el)return;
  var mem=D.mem,sm=D.sm,total=sm.total||0;
  var greenPct=total?Math.round((sm.green||0)*100/total):0;
  var benchOk=greenPct>=50;
  var totalTYFCB=mem.reduce(function(a,m){return a+((m.actual&&m.actual.tyfcb)||0);},0);
  var totalRG=mem.reduce(function(a,m){return a+((m.actual&&m.actual.rg)||0);},0);
  var totalVis=mem.reduce(function(a,m){return a+((m.actual&&m.actual.visitor)||0);},0);
  var sc2=mem.filter(function(m){return m.bniTl!=='none';});
  var avg=sc2.length?Math.round(sc2.reduce(function(a,m){return a+m.bniScore;},0)/sc2.length):0;
  var avgC=avg>=70?'var(--gr)':avg>=50?'var(--ye)':avg>=30?'var(--re)':'var(--bl)';
  function fB(v){return v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'K':String(Math.round(v));}
  var cards=[
    {ico:'🟢',val:greenPct+'%',lbl:'Green Zone',sub:(sm.green||0)+' จาก '+total+' คน',
     badge:benchOk?'<span class="pulse-badge pulse-ok">✅ BNI Benchmark ≥50%</span>':'<span class="pulse-badge pulse-warn">⚠️ ต่ำกว่า Benchmark</span>',
     c:'var(--gr)',fn:"sw('mc-mem',null,\'mc\')"},
    {ico:'💰',val:'฿'+fB(totalTYFCB),lbl:'TYFCB Chapter รวม',sub:'ธุรกิจที่ปิดได้จาก BNI ทั้งหมด',
     badge:totalTYFCB>0?'<span class="pulse-badge pulse-ok">มีข้อมูล</span>':'<span class="pulse-badge pulse-warn">รอข้อมูล</span>',
     c:'var(--ye)',fn:null},
    {ico:'💡',val:totalRG,lbl:'Referral ให้รวม',sub:(totalRG/Math.max(1,total)).toFixed(1)+' ใบ/คน เฉลี่ย',
     badge:'',c:'var(--ac2)',fn:null},
    {ico:'👥',val:totalVis,lbl:'Visitor Chapter รวม',sub:'คนที่พามาเยี่ยมทั้งหมด',
     badge:totalVis>=total?'<span class="pulse-badge pulse-ok">ดีมาก</span>':totalVis>0?'<span class="pulse-badge pulse-warn">'+totalVis+' คน</span>':'',
     c:'var(--bl)',fn:null},
    {ico:'📊',val:avg,lbl:'BNI Score เฉลี่ย',sub:sc2.length+' คนมีข้อมูล BNI',
     badge:avg>=70?'<span class="pulse-badge pulse-ok">🟢 Green Avg</span>':avg>=50?'<span class="pulse-badge pulse-warn">🟡 Yellow Avg</span>':'<span class="pulse-badge pulse-crit">🔴 ต้องพัฒนา</span>',
     c:avgC,fn:null},
  ];
  el.innerHTML='<div class="pulse-grid">'+cards.map(function(c){
    return '<div class="pulse-card" style="--pulse-c:'+c.c+'"'+(c.fn?' onclick="'+c.fn+'"':'')+'>'+
      '<span class="pulse-ico">'+c.ico+'</span>'+
      '<div class="pulse-val">'+c.val+'</div>'+
      '<div class="pulse-lbl">'+c.lbl+'</div>'+
      '<div class="pulse-sub">'+c.sub+'</div>'+
      c.badge+
    '</div>';
  }).join('')+'</div>';
  // Benchmark bar in chart section
  var bEl=document.getElementById('mc-bench-bar');
  if(bEl){
    var bc2C=benchOk?'var(--gr)':'var(--ye)';
    bEl.innerHTML='<div style="display:flex;align-items:center;gap:8px;font-size:11px;">'
      +'<span style="color:var(--sub)">Green%</span>'
      +'<div style="flex:1;background:var(--bd);border-radius:4px;height:7px;overflow:hidden;">'
      +'<div style="width:'+Math.min(100,greenPct)+'%;height:100%;background:'+bc2C+';border-radius:4px;transition:width .6s;"></div></div>'
      +'<span style="font-weight:700;color:'+bc2C+'">'+greenPct+'%</span>'
      +'<span style="color:var(--sub)">(Benchmark: 50%)</span>'
      +'</div>';
  }
}

function tlThai(z){
  return z==='green'?'เขียว':z==='yellow'?'เหลือง':z==='red'?'แดง':z==='black'?'ดำ':'ไม่มีข้อมูล';
}
function tlEmoji(z){
  return z==='green'?'🟢':z==='yellow'?'🟡':z==='red'?'🔴':z==='black'?'⚫':'○';
}
function tlAccent(z){
  return z==='green'?'var(--gr)':z==='yellow'?'var(--ye)':z==='red'?'var(--re)':'var(--bl)';
}
function fmtDelta(n){
  n=Number(n)||0;
  return (n>0?'+':'')+n;
}
function closeTrafficMonthlySummary(){
  var el=document.getElementById('tl-monthly-modal');
  if(el)el.remove();
}
function openTrafficLightMonthlySummary(){
  ld(true);
  gsr('getTrafficLightMonthlySummary',{role:S.role},function(r){
    ld(false);
    if(!r||!r.ok){toast('❌ '+((r&&r.error)||'โหลดสรุปสีไม่ได้'),'err');return;}
    renderTrafficLightMonthlySummary(r);
  });
}
function renderTrafficLightMonthlySummary(r){
  closeTrafficMonthlySummary();
  var cur=r.current,prev=r.previous,mv=r.movement||{};
  if(!cur){
    toast('ยังไม่มีข้อมูล Traffic Light Evolution ให้สรุปครับ','warn');
    return;
  }
  var zones=['green','yellow','red','black'];
  var cards=zones.map(function(z){
    var count=(cur.counts&&cur.counts[z])||0;
    var last=(prev&&prev.counts&&prev.counts[z])||0;
    var d=(r.deltas&&r.deltas[z])||0;
    var dColor=d>0?(z==='green'?'var(--gr)':'var(--ye)'):d<0?(z==='green'?'var(--re)':'var(--gr)'):'var(--sub)';
    return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:18px;padding:16px;box-shadow:var(--sh-card);position:relative;overflow:hidden">'
      +'<div style="position:absolute;inset:auto 0 0 0;height:3px;background:'+tlAccent(z)+'"></div>'
      +'<div style="font-size:28px;line-height:1">'+tlEmoji(z)+'</div>'
      +'<div style="font-size:28px;font-weight:900;color:var(--tx);margin-top:8px">'+count+'</div>'
      +'<div style="font-size:12px;color:var(--sub);font-weight:700">สี'+tlThai(z)+'</div>'
      +'<div style="font-size:11px;margin-top:8px;color:'+dColor+'">เดือนก่อน '+last+' · '+fmtDelta(d)+' คน</div>'
      +'</div>';
  }).join('');
  function memberLine(m){
    var diff=m.diff===null||m.diff===undefined?'':(' <span style="color:'+(m.diff>=0?'var(--gr)':'var(--re)')+'">'+(m.diff>0?'+':'')+m.diff+'</span>');
    var team=m.team?'<span style="color:var(--sub)"> · '+esc(m.team)+'</span>':'';
    var from=m.fromZone?tlEmoji(m.fromZone)+' '+tlThai(m.fromZone):'ไม่มี';
    var to=m.toZone?tlEmoji(m.toZone)+' '+tlThai(m.toZone):'ไม่มี';
    return '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--bd)">'
      +'<div style="min-width:70px;color:var(--sub);font-size:12px">'+from+' → '+to+'</div>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:800;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(m.nick||m.name||'-')+team+'</div>'
      +'<div style="font-size:12px;color:var(--sub)">คะแนน '+(m.fromScore===null?'—':m.fromScore)+' → '+(m.toScore===null?'—':m.toScore)+diff+'</div></div>'
      +'</div>';
  }
  function section(title,items,empty,limit){
    items=items||[];
    var shown=limit?items.slice(0,limit):items;
    return '<div style="background:var(--sf);border:1px solid var(--bd);border-radius:18px;padding:16px;min-height:120px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">'
      +'<div style="font-weight:900;color:var(--tx)">'+title+'</div>'
      +'<span style="font-size:11px;color:var(--sub);border:1px solid var(--bd);border-radius:999px;padding:3px 8px">'+items.length+' คน</span></div>'
      +(shown.length?shown.map(memberLine).join(''):'<div style="color:var(--sub);font-size:13px;padding:14px 0">'+empty+'</div>')
      +(limit&&items.length>limit?'<div style="font-size:11px;color:var(--sub);padding-top:8px">และอีก '+(items.length-limit)+' คน</div>':'')
      +'</div>';
  }
  var summaryText='สรุป '+cur.label+(prev?' เทียบ '+prev.label:'')+' · '
    +'เขียว '+(cur.counts.green||0)+' ('+fmtDelta((r.deltas||{}).green)+'), '
    +'เหลือง '+(cur.counts.yellow||0)+' ('+fmtDelta((r.deltas||{}).yellow)+'), '
    +'แดง '+(cur.counts.red||0)+' ('+fmtDelta((r.deltas||{}).red)+'), '
    +'ดำ '+(cur.counts.black||0)+' ('+fmtDelta((r.deltas||{}).black)+')'
    +' · ขึ้นสี '+((mv.up||[]).length)+' · ลงสี '+((mv.down||[]).length);
  var html='<div id="tl-monthly-modal" onclick="if(event.target===this)closeTrafficMonthlySummary()" style="position:fixed;inset:0;background:rgba(0,0,0,.54);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px">'
    +'<div style="width:min(1120px,96vw);max-height:90vh;overflow:auto;background:var(--bg);border:1px solid var(--bd);border-radius:26px;box-shadow:0 30px 90px rgba(0,0,0,.45)">'
    +'<div style="position:sticky;top:0;background:linear-gradient(135deg,var(--sf),var(--bg));border-bottom:1px solid var(--bd);padding:22px 24px;z-index:1;display:flex;align-items:flex-start;gap:16px">'
    +'<div style="width:44px;height:44px;border-radius:16px;background:rgba(192,168,117,.18);display:flex;align-items:center;justify-content:center;font-size:22px">📊</div>'
    +'<div style="flex:1"><div style="font-size:20px;font-weight:950;color:var(--tx)">Traffic Light Monthly Summary</div>'
    +'<div style="font-size:13px;color:var(--sub);margin-top:4px">เดือนล่าสุด '+esc(cur.label)+(prev?' · เทียบกับ '+esc(prev.label):' · ยังไม่มีเดือนก่อนให้เทียบ')+'</div>'
    +'<div id="tl-summary-copy" style="display:none">'+esc(summaryText)+'</div></div>'
    +'<button class="bsm" onclick="copyTrafficMonthlySummary()" style="white-space:nowrap">Copy Summary</button>'
    +'<button class="mcls" onclick="closeTrafficMonthlySummary()">✕ ปิด</button>'
    +'</div>'
    +'<div style="padding:24px">'
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">'+cards+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">'
    +section('⬆️ สมาชิกที่ขึ้นสี',mv.up,'เดือนนี้ยังไม่มีคนขยับขึ้นสี',80)
    +section('⬇️ สมาชิกที่ลงสี',mv.down,'เดือนนี้ยังไม่มีคนขยับลงสี',80)
    +section('➖ สีเดิม แต่คะแนนเปลี่ยน',mv.same,'ยังไม่มีข้อมูลเทียบเดือนก่อน',40)
    +section('🆕 มีข้อมูลเดือนนี้ แต่ไม่มีเดือนก่อน',mv.new,'ไม่มีสมาชิกใหม่ในชุดข้อมูลนี้',40)
    +(mv.missing&&mv.missing.length?section('⚠️ เดือนนี้ไม่มีข้อมูล แต่เดือนก่อนมี',mv.missing,'',40):'')
    +'</div>'
    +'</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
function copyTrafficMonthlySummary(){
  var el=document.getElementById('tl-summary-copy');
  var txt=el?el.textContent:'';
  if(!txt)return;
  if(navigator.clipboard){
    navigator.clipboard.writeText(txt).then(function(){toast('Copy Summary แล้วครับ','ok');});
  }else{
    var t=document.createElement('textarea');t.value=txt;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);toast('Copy Summary แล้วครับ','ok');
  }
}

// ══ ZONE B: Today's Focus ══════════════════════════════════
function renderFocusBar(){
  var el=document.getElementById('mc-focus');if(!el)return;
  var mem=D.mem,rt=riskThresh.absent||4,rs=riskThresh.score||30;
  var risk=mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);});
  var pend=D.reps.filter(function(r){return repIsOpen(r);});
  var ren30=D.ren.filter(function(r){return r.diffDays<=30;});
  var noMsg=mem.filter(function(m){return m.bniTl==='red'&&!D.msgs.some(function(ms){return ms.name===m.name;});});
  var miss121=mem.filter(function(m){return m.bniTl!=='none'&&(m.cats||{}).one21<5;});
  var missCEU=mem.filter(function(m){return m.bniTl!=='none'&&(m.cats||{}).training<5;});
  var lowRef=mem.filter(function(m){return m.bniTl!=='none'&&(m.cats||{}).ref<3;});
  var dropH=mem.filter(function(m){return _dropRisk(m)==='high';});
  var noContact=mem.filter(function(m){return m.noMentorContact;});
  var nm=mem.filter(function(m){return m.actual&&m.actual.bniDays>0&&m.actual.bniDays<=56;});
  var lineIssueOpen=D.lineIssueOpen||0;
  function cls(v,hi,lo){return v>=hi?'alert':v>=lo?'warn':'ok';}
  var items=[
    {ico:'⚠️',val:lineIssueOpen,lbl:'LINE Issues รอตอบ',c:cls(lineIssueOpen,3,1),fn:"openLineIssueCenter()"},
    {ico:'⚠️',val:risk.length,lbl:'Risk Members',c:cls(risk.length,4,1),fn:"sw('mc-risk',null,\'mc\')"},
    {ico:'📋',val:pend.length,lbl:'Open Reports',c:cls(pend.length,3,1),fn:"sw('mc-rep',null,\'mc\')"},
    {ico:'📅',val:ren30.length,lbl:'Renewal ≤30 วัน',c:cls(ren30.length,2,1),fn:"sw('mc-ren',null,\'mc\')"},
    {ico:'🔇',val:noMsg.length,lbl:'Red ไม่มีข้อความ',c:cls(noMsg.length,2,1),fn:"openActionCenter('coach')"},
    {ico:'🆘',val:dropH.length,lbl:'Drop Risk สูง',c:cls(dropH.length,2,1),fn:null},
    {ico:'🤝',val:miss121.length,lbl:'Missing 1-2-1',c:cls(miss121.length,6,1),fn:"sw('mc-mem',null,\'mc\')"},
    {ico:'📚',val:missCEU.length,lbl:'Missing CEU',c:cls(missCEU.length,6,1),fn:"sw('mc-mem',null,\'mc\')"},
    {ico:'💡',val:lowRef.length,lbl:'Low Referral',c:cls(lowRef.length,6,1),fn:"sw('mc-mem',null,\'mc\')"},
    {ico:'📆',val:noContact.length,lbl:'Mentor ไม่ได้ติดตาม >2wk',c:cls(noContact.length,3,1),fn:"openActionCenter('pq')"},
    {ico:'🌱',val:nm.length,lbl:'New Members / Passport',c:'info',fn:"sw('mc-passport',null,\'mc\');loadPassportBoard()"},
  ];
  var urgent=items.filter(function(it){return it.c==='alert'||it.c==='warn';}).length;
  el.innerHTML='<div class="focus-bar">'
    +'<div class="focus-hdr"><span style="font-size:16px">🎯</span><h3 class="focus-hdr-title">Today\'s Focus — สิ่งที่ต้องดูแล</h3>'
    +(urgent>0?'<span class="focus-hdr-badge">'+urgent+' เรื่องด่วน</span>':'<span style="font-size:11px;color:var(--gr);font-weight:700">✅ ทุกอย่างปกติดี</span>')
    +'</div>'
    +'<div class="focus-items">'+items.map(function(it){
      return '<div class="fi '+it.c+(it.fn?'':' nc')+'"'+(it.fn?' onclick="'+it.fn+'"':'')+' title="'+it.lbl+'">'
        +'<span class="fi-ico">'+it.ico+'</span>'
        +'<div><div class="fi-val">'+it.val+'</div><div class="fi-lbl">'+it.lbl+'</div></div>'
        +'</div>';
    }).join('')+'</div></div>';
  renderCommandRail(risk.length,pend.length,ren30.length,lineIssueOpen);
}

function renderCommandRail(riskCount,reportCount,renewalCount,lineIssueCount){
  var el=document.getElementById('cc-priority-signals');if(!el)return;
  function tone(v,hi){return v>=hi?'var(--re)':v>0?'var(--ye)':'var(--gr)';}
  lineIssueCount=lineIssueCount||0;
  el.innerHTML=''
    +'<div class="rail-signal" style="cursor:pointer" onclick="openLineIssueCenter()"><span>LINE Issues รอตอบ</span><span class="rail-num" style="color:'+tone(lineIssueCount,3)+'">'+lineIssueCount+'</span></div>'
    +'<div class="rail-signal"><span>Risk Members</span><span class="rail-num" style="color:'+tone(riskCount,4)+'">'+riskCount+'</span></div>'
    +'<div class="rail-signal"><span>Open Reports</span><span class="rail-num" style="color:'+tone(reportCount,3)+'">'+reportCount+'</span></div>'
    +'<div class="rail-signal"><span>Renewal ≤30 วัน</span><span class="rail-num" style="color:'+tone(renewalCount,2)+'">'+renewalCount+'</span></div>';
}

function openLineIssueCenter(){
  var tab=null;
  document.querySelectorAll('#mc-tabs .tb').forEach(function(t){if(t.textContent.indexOf('Activity')>=0)tab=t;});
  if(tab)sw('mc-usage',tab,'mc');
  var lineTab=document.getElementById('act-tab-line');
  if(lineTab)actSw('line',lineTab);
  loadLineIssues(true);
  loadLineActivityTimeline(true);
}

// ══ ZONE D: Intelligence Grid ══════════════════════════════
function renderIntelGrid(){
  var el=document.getElementById('mc-intel');if(!el)return;
  var mem=D.mem;
  var tlC=function(t){return t==='green'?'var(--gr)':t==='yellow'?'var(--ye)':t==='red'?'var(--re)':'var(--bl)';};

  // Drop Risk
  var drops=mem.map(function(m){var r=_dropRisk(m);return r?{m:m,r:r}:null;}).filter(Boolean)
    .sort(function(a,b){return({high:0,medium:1,low:2}[a.r]||3)-({high:0,medium:1,low:2}[b.r]||3);}).slice(0,6);
  var dropH='<div class="intel-card">'
    +'<div class="intel-hdr"><span style="font-size:16px">🆘</span><span class="intel-title">Drop Risk — เฝ้าระวัง</span><span class="intel-ct">'+drops.length+' คน</span></div>';
  if(!drops.length){
    dropH+='<div style="text-align:center;padding:24px 0;color:var(--sub);font-size:12px">✅ ไม่มีสมาชิก Drop Risk ในขณะนี้</div>';
  }else{
    var RTAG={high:'<span class="dr-tag dr-h">🔴 High</span>',medium:'<span class="dr-tag dr-m">⚠️ Med</span>',low:'<span class="dr-tag dr-l">👁 Watch</span>'};
    dropH+=drops.map(function(dr){
      var m=dr.m,r=dr.r;
      var reasons=[];
      if(m.absent>=(riskThresh.absent||4))reasons.push('ขาด '+m.absent+'ครั้ง');
      if(m.bniScore<(riskThresh.score||30)&&m.bniTl!=='none')reasons.push('Score '+m.bniScore);
      if(D.ren.some(function(rv){return rv.name===m.name&&rv.diffDays<=45;}))reasons.push('Renewal ใกล้');
      var avBg=m.bniTl==='green'?'rgba(52,211,153,.15)':m.bniTl==='yellow'?'rgba(255,193,77,.15)':m.bniTl==='red'?'rgba(248,113,113,.15)':'rgba(96,165,250,.15)';
      return '<div class="dr-row" onclick="openModal(\''+esc(m.name.replace(/'/g,"\\'"))+'\')">'
        +'<div class="dr-av" style="background:'+avBg+';color:'+tlC(m.bniTl)+'">'+(m.nick||m.name).slice(0,2)+'</div>'
        +'<div class="dr-info"><div class="dr-name">'+esc(m.name+(m.nick?' ('+m.nick+')':''))+'</div>'
        +'<div class="dr-sub">'+esc(m.mentor||'—')+(reasons.length?' · '+reasons.join(' · '):'')+'</div></div>'
        +RTAG[r]+'</div>';
    }).join('');
  }
  dropH+='</div>';

  // New Members Mentoring Progress
  // รวม: สมาชิกที่มี bniDays <= 56 (8 สัปดาห์) + ทุกคนใน G.nm (NEW MEMBERS sheet)
  var memByName={};
  mem.forEach(function(m){ memByName[m.name]=m; });
  var nmMap={};
  // 1. จาก G.nm (NEW MEMBERS sheet) — ครอบคลุมทุกคนที่เพิ่มในระบบ
  (G.nm||[]).forEach(function(nm){
    if(!nmMap[nm.name]) nmMap[nm.name]={ nm:nm, mem:memByName[nm.name]||null };
  });
  // 2. จาก D.mem ที่ bniDays <= 56 (ยังไม่อยู่ใน nm)
  mem.forEach(function(m){
    if(!nmMap[m.name]&&m.actual&&m.actual.bniDays>0&&m.actual.bniDays<=56){
      nmMap[m.name]={ nm:null, mem:m };
    }
  });
  var nmsAll=Object.values(nmMap).sort(function(a,b){
    var dA=(a.mem&&a.mem.actual&&a.mem.actual.bniDays)||0;
    var dB=(b.mem&&b.mem.actual&&b.mem.actual.bniDays)||0;
    return dA-dB;
  });
  var nmH='<div class="intel-card">'
    +'<div class="intel-hdr"><span style="font-size:16px">🌱</span><span class="intel-title">New Members — Mentoring Progress</span><span class="intel-ct">'+nmsAll.length+' คน</span></div>';
  if(!nmsAll.length){
    nmH+='<div style="text-align:center;padding:24px 0;color:var(--sub);font-size:12px">ไม่มีสมาชิกใหม่</div>';
  } else {
    nmH+=nmsAll.map(function(entry){
      var m=entry.mem, nm=entry.nm;
      var name=m?m.name:(nm?nm.name:'');
      var nick=m?(m.nick||name.split(' ').slice(0,2).join(' ')):(nm?(nm.nick||nm.name):'');
      var mentor=m?(m.mentor||'—'):(nm?(nm.mentor||'—'):'—');
      var days=(m&&m.actual&&m.actual.bniDays)||0;
      var weeks=Math.floor(days/7);
      var bniScore=m?m.bniScore:0;
      var bniTl=m?m.bniTl:'none';
      var tlC2={green:'var(--gr)',yellow:'var(--ye)',red:'var(--re)',black:'var(--sub)',blue:'var(--bl)',none:'var(--sub)'};
      var wC=weeks>=8?'var(--gr)':weeks>=4?'var(--ye)':days>0?'var(--bl)':'var(--sub)';
      var wLabel=days>0?'W'+weeks:'ใหม่';
      var sC=tlC2[bniTl]||'var(--sub)';
      // checklist progress จาก nm
      var prog=nm?(nm.progress||0):0;
      var startDate=nm?nm.startDate:'';
      var safeName=name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return '<div class="nm-row" style="cursor:pointer" onclick="openIMD(\''+safeName+'\')">'
        +'<div class="nm-wk" style="background:'+wC+'22;color:'+wC+'">'+wLabel+'</div>'
        +'<div class="nm-inf">'
        +'<div class="nm-n" style="color:var(--ac)">'+esc(nick)
          +(nick!==name.split(' ').slice(0,2).join(' ')&&nick?'<span style="color:var(--sub);font-weight:400;font-size:10px"> · '+esc(name.split(' ').slice(0,2).join(' '))+'</span>':'')
          +'</div>'
        +'<div class="nm-m">'+esc(mentor)
          +(startDate?' · เริ่ม '+esc(startDate):'')
          +(days>0?' · '+days+'วัน':'')
          +'</div>'
        // Double progress bar: BNI Weeks + Checklist
        +'<div style="display:flex;gap:6px;align-items:center;margin-top:4px">'
        +(days>0?'<div style="flex:1;height:3px;background:var(--bd);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+Math.min(100,Math.round(weeks/12*100))+'%;background:'+wC+'"></div></div>':'')
        +(prog>0?'<div style="flex:1;height:3px;background:var(--bd);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+prog+'%;background:var(--ac)"></div></div>':'')
        +(prog>0?'<span style="font-size:9px;color:var(--sub)">'+prog+'%</span>':'')
        +'</div>'
        +'</div>'
        +(bniScore>0?'<div class="nm-s" style="color:'+sC+'">'+bniScore+'</div>'
                    :'<div class="nm-s" style="color:var(--sub);font-size:10px">N/A</div>')
        +'</div>';
    }).join('');
  }
  nmH+='</div>';

  el.innerHTML=dropH+nmH;
}

// ══ KPI (legacy — kept for backward compat) ══════════════
function renderKPI(){
  var sm=D.sm,total=sm.total||0;
  var sc=D.mem.filter(function(m){return m.bniTl!=='none';});
  var avg=sc.length?Math.round(sc.reduce(function(a,m){return a+m.bniScore;},0)/sc.length):0;
  var rt=riskThresh.absent||4,rs=riskThresh.score||30;
  var risk=D.mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);}).length;
  var soon=D.ren.filter(function(r){return r.diffDays<=90;}).length;
  document.getElementById('mc-kpi').innerHTML=[
    {l:'สมาชิกทั้งหมด',v:total,s:sc.length+' มีข้อมูล BNI',c:'pu',i:'👥'},
    {l:'Green Zone',v:sm.green||0,s:pct(sm.green,total)+'%',c:'gr',i:'🟢'},
    {l:'Yellow Zone',v:sm.yellow||0,s:pct(sm.yellow,total)+'%',c:'ye',i:'🟡'},
    {l:'Red Zone',v:sm.red||0,s:pct(sm.red,total)+'%',c:'re',i:'🔴'},
    {l:'Black Zone',v:sm.black||0,s:pct(sm.black,total)+'%',c:'bl',i:'⚫'},
    {l:'BNI Avg Score',v:avg,s:'คะแนนเฉลี่ย',c:'te',i:'📊'},
    {l:'Risk Members',v:risk,s:'ขาด≥'+rt+' หรือ BNI<'+rs,c:'re',i:'⚠️'},
    {l:'Renewal ≤90 วัน',v:soon,s:'รายการ',c:'ye',i:'📅'},
  ].map(function(c){return '<div class="kc '+c.c+'"><div class="kl">'+c.l+'</div><div class="kv">'+c.v+'</div><div class="ks">'+c.s+'</div><div class="ki">'+c.i+'</div></div>';}).join('');
  document.getElementById('dtotal').textContent=total;
}
function pct(v,t){return t?Math.round((v||0)*100/t):0;}

function chartColors(){var dark=document.body.classList.contains('dark');return{grid:dark?'rgba(218,198,158,.08)':'rgba(0,0,0,.07)',tick:dark?'#AAA291':'#78716C',border:dark?'#1E231E':document.documentElement.style.getPropertyValue('--sf')||'#EAE7DC'};}
function renderDonut(){
  var sm=D.sm,data=[sm.green||0,sm.yellow||0,sm.red||0,sm.black||0,sm.none||0];
  var colors=['var(--gr)','var(--ye)','var(--re)','#8b92b8','#4b5563'],labels=['🟢 Green','🟡 Yellow','🔴 Red','⚫ Black','⚪ N/A'];
  if(dc)dc.destroy();
  dc=new Chart(document.getElementById('donut').getContext('2d'),{type:'doughnut',
    data:{labels:labels,datasets:[{data:data,backgroundColor:colors,borderWidth:2,borderColor:chartColors().border}]},
    options:{cutout:'66%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return' '+c.label+': '+c.raw+' คน';}}}},animation:{duration:400}}});
  document.getElementById('dleg').innerHTML=labels.map(function(l,i){
    return '<div class="dli"><span class="dd" style="background:'+colors[i]+'"></span><span style="color:var(--sub)">'+l+'</span><span style="font-weight:600;margin-left:auto">'+data[i]+'</span></div>';
  }).join('');
}

function renderBar(){
  if(!D.teams.length)return;
  if(bc)bc.destroy();
  bc=new Chart(document.getElementById('bar').getContext('2d'),{type:'bar',
    data:{labels:D.teams.map(function(t){return t.team;}),
      datasets:[{label:'BNI Avg',data:D.teams.map(function(t){return t.avg;}),
        backgroundColor:D.teams.map(function(t){return t.avg>=70?'rgba(52,211,153,.75)':t.avg>=50?'rgba(255,193,77,.75)':t.avg>=30?'rgba(248,113,113,.75)':'rgba(96,165,250,.75)';}),
        borderRadius:5,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick}},
        y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick},min:0,max:100,
          afterBuildTicks:function(ax){ax.ticks=[0,30,50,70,100].map(function(v){return{value:v};});}}}
    }});
}

function szf(z,el,ns){mzf=z;document.querySelectorAll('#mc-mem .zp').forEach(function(b){b.classList.remove('on');});el.classList.add('on');renderMem();}
function renderMem(){
  var se=document.getElementById('ms').value.trim().toLowerCase();
  var tm=document.getElementById('mtf').value;
  var so=document.getElementById('mso').value;
  var smin=parseInt(document.getElementById('af-smin').value)||0;
  var smax=parseInt(document.getElementById('af-smax').value)||100;
  var amin=parseInt(document.getElementById('af-amin').value)||0;
  var amax=parseInt(document.getElementById('af-amax').value)||99;
  var afActive=(document.getElementById('af-smin').value||document.getElementById('af-smax').value||document.getElementById('af-amin').value||document.getElementById('af-amax').value);
  var list=D.mem.filter(function(m){
    if(se&&(m.name||'').toLowerCase().indexOf(se)===-1&&(m.nick||'').toLowerCase().indexOf(se)===-1)return false;
    if(tm&&m.mentor!==tm)return false;
    if(mzf!=='all'&&m.bniTl!==mzf)return false;
    if(gwModeFilter==='active'&&m.mentoringMode==='growth_watch')return false;
    if(gwModeFilter==='growth_watch'&&m.mentoringMode!=='growth_watch')return false;
    if(afActive){
      var sc=m.bniScore||0;
      if(document.getElementById('af-smin').value&&sc<smin)return false;
      if(document.getElementById('af-smax').value&&sc>smax)return false;
      if(document.getElementById('af-amin').value&&m.absent<amin)return false;
      if(document.getElementById('af-amax').value&&m.absent>amax)return false;
    }
    return true;
  });
  var _d=colSortState.col?colSortState.dir:1;
  list.sort(function(a,b){
    if(colSortState.col){
      var ac=a.cats||{},bc=b.cats||{};
      if(colSortState.col==='bni')return(a.bniScore-b.bniScore)*_d;
      if(colSortState.col==='name')return((a.name||'').localeCompare(b.name||''))*_d;
      if(colSortState.col==='absent')return(a.absent-b.absent)*_d;
      if(colSortState.col==='palms')return((a.palmsScore||0)-(b.palmsScore||0))*_d;
      if(colSortState.col==='roi')return((a.roi||0)-(b.roi||0))*_d;
      if(colSortState.col==='ref')return((ac.ref||0)-(bc.ref||0))*_d;
      if(colSortState.col==='tyfcb')return((ac.tyfcb||0)-(bc.tyfcb||0))*_d;
      if(colSortState.col==='visitor')return((ac.visitor||0)-(bc.visitor||0))*_d;
      if(colSortState.col==='one21')return((ac.one21||0)-(bc.one21||0))*_d;
      if(colSortState.col==='training')return((ac.training||0)-(bc.training||0))*_d;
    }
    return so==='sa'?a.bniScore-b.bniScore:so==='na'?(a.name||'').localeCompare(b.name||''):so==='ad'?b.absent-a.absent:b.bniScore-a.bniScore;
  });
  document.getElementById('mtb').innerHTML=list.length?list.map(function(m,i){
    var c=m.cats||{},ft=m.fastTrack&&m.fastTrack.length?m.fastTrack[0]:null;
    var ftTop2=(m.fastTrack||[]).slice(0,2);
    var ftGain2=ftTop2.reduce(function(a,f){return a+f.gain;},0);
    var ftTargetLabel=m.bniTl==='red'?'🟡':m.bniTl==='yellow'?'🟢':'';
    var ftProjected=m.bniScore+ftGain2;
    var chkd=bulkSel[m.name]?'checked':'';
    var isCmp=cmpState.indexOf(m.name)>=0;
    var safeName=m.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var hint=gwHint(m);
    var isGW=m.mentoringMode==='growth_watch';
    var gwEligible=(m.bniScore||0)>=GROWTH_WATCH_MIN_SCORE;
    // GW button — icon-only, no disabled state for ineligible (just hide)
    var gwButton='';
    if(S.role==='mc'&&(isGW||gwEligible)){
      gwButton='<button class="bx" onclick="toggleGWMode(\''+safeName+'\',\''+esc(m.mentoringMode||'active')+'\')" title="'+(isGW?'Growth Watch → คลิกเพื่อ Active':'ตั้ง Growth Watch')+'" style="font-size:12px;padding:3px 6px;margin-right:2px;'+(isGW?'background:rgba(96,165,250,.15);border-color:rgba(96,165,250,.4);color:#60a5fa':'opacity:.45')+'">🔵</button>';
    }
    return '<tr style="cursor:pointer;'+(isGW?'background:rgba(96,165,250,.04)':'')+'" onclick="openIMD(\''+safeName+'\')">'
      +'<td onclick="event.stopPropagation()"><input type="checkbox" class="cb-chk" '+chkd+' onclick="toggleBulk(\''+esc(m.name)+'\',\''+esc(m.mentor||'')+'\',this)"></td>'+
      '<td style="color:var(--sub);font-size:10px">'+(i+1)+'</td>'+
      '<td><div style="font-weight:600">'+esc(m.name)+(isGW?'<span style="font-size:9px;background:rgba(96,165,250,.2);color:#60a5fa;border-radius:5px;padding:1px 5px;margin-left:5px;font-weight:700">🔵 GW</span>':'')+'</div><div style="font-size:11px;color:var(--sub)">'+esc(m.nick||'')+'</div>'+(hint?'<div style="font-size:9px;margin-top:1px;color:'+(hint.charAt(0)==='⚠'?'var(--re)':hint.charAt(0)==='💡'?'var(--gr)':'var(--sub)')+'">'+hint+'</div>':'')+'</td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(m.mentor||'—')+'</td>'+
      '<td><span class="badge b-'+tlK(m.bniTl)+'">'+tlL(m.bniTl)+'</span></td>'+
      (function(){
        var sh=(m.scoreHistory||[]).filter(function(s){return s&&s.score>0;}).slice().sort(function(a,b){return(a.year*100+a.month)-(b.year*100+b.month);});
        var arrow='';
        if(sh.length>=2){var diff=sh[sh.length-1].score-sh[sh.length-2].score;arrow=diff>3?'<span style="color:#16A34A;font-size:9px;vertical-align:super;margin-left:1px">↑</span>':diff<-3?'<span style="color:#DC2626;font-size:9px;vertical-align:super;margin-left:1px">↓</span>':'<span style="color:var(--sub);font-size:9px;vertical-align:super;margin-left:1px">→</span>';}
        return'<td style="font-size:14px;font-weight:700;color:'+tlC(m.bniTl)+'">'+(m.bniTl!=='none'?m.bniScore+arrow:'—')+'</td>';
      })()+
      '<td>'+sparkline(m.hist)+'</td>'+
      '<td>'+(m.roi>0?'<span style="font-size:11px;font-weight:700;color:'+(m.roi>=300?'var(--gr)':m.roi>=100?'var(--ye)':'var(--re)')+'">'+m.roi+'%</span>':'<span style="color:var(--sub);font-size:11px">—</span>')+'</td>'+
      '<td style="font-weight:600">'+(m.palmsScore||'—')+'</td>'+
      '<td style="'+(m.absent>=(riskThresh.absent||4)?'color:var(--re);font-weight:700':'')+'">'+m.absent+'</td>'+
      '<td>'+cb(c.ref,15,'var(--gr)')+'</td><td>'+cb(c.tyfcb,15,'var(--ye)')+'</td>'+
      '<td>'+cb(c.visitor,20,'#f472b6')+'</td><td>'+cb(c.one21,15,'#60a5fa')+'</td>'+
      '<td>'+cb(c.training,20,'#a78bfa')+'</td>'+
      '<td style="min-width:110px">'+(ftTop2.length&&m.bniTl!=='green'?
        '<div style="font-size:9px;color:var(--sub);margin-bottom:1px">🎯→'+ftTargetLabel+' +'+ftGain2+'pt</div>'+
        '<div style="font-size:10px;color:var(--tx);white-space:nowrap">'+esc(ftTop2.map(function(f){return f.cat;}).join(' + '))+'</div>'+
        '<div style="font-size:10px;color:'+(ftProjected>=(m.bniTl==='red'?50:70)?'var(--gr)':'var(--ye)')+';font-weight:700">→ '+ftProjected+'pt</div>'
        :'<span style="color:var(--sub);font-size:11px">'+(m.bniTl==='green'?'✅ Green':'—')+'</span>')+'</td>'+
      '<td onclick="event.stopPropagation()"><button class="cmp-tog'+(isCmp?' on':'')+'" title="เปรียบเทียบ" onclick="toggleCmp(\''+esc(m.name)+'\')">🔍</button></td>'+
      // Action column: icon-only buttons; row click already opens Dashboard
      '<td style="white-space:nowrap;padding:4px 6px" onclick="event.stopPropagation()">'
      +(D.lineMembers&&D.lineMembers[m.name]?'<button class="bx" onclick="openDeskLineCompose(\''+safeName+'\',\''+esc(m.nick||m.name.split(' ')[0])+'\')" title="ส่ง LINE" style="font-size:12px;padding:3px 6px;background:rgba(6,199,85,.12);border-color:rgba(6,199,85,.3);color:#06C755;margin-right:2px">📲</button>':'')
      +'<button class="bx" onclick="openModal(\''+safeName+'\')" title="Member Card" style="font-size:12px;padding:3px 6px;background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.3);color:#818cf8;margin-right:2px">👤</button>'
      +(S.role==='mc'?'<button class="bx" onclick="moveMemberTeamDlg(\''+safeName+'\',\''+esc(m.mentor||'')+'\',\''+esc(m.id||'')+'\')" title="ย้ายทีม" style="font-size:12px;padding:3px 6px;background:rgba(96,165,250,.1);border-color:rgba(96,165,250,.3);color:#60a5fa;margin-right:2px">⇄</button>':'')
      +gwButton
      +(S.role==='mc'?'<button class="bx" onclick="editMemberDlg(\''+safeName+'\',\''+esc(m.nick||'')+'\',\''+esc(m.membershipStartDate||m.joinedDate||'')+'\',\''+esc(m.id||'')+'\')" title="แก้ข้อมูล" style="font-size:12px;padding:3px 6px;background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.3);color:#fbbf24;margin-right:2px">✏️</button>':'')
      +(S.role==='mc'?'<button class="bx" onclick="archiveMemberDlg(\''+safeName+'\')" title="Archive" style="font-size:12px;padding:3px 6px;background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.3);color:var(--re)">🗑️</button>':'')
      +'</td></tr>';
  }).join(''):'<tr><td colspan="16" class="es">ไม่พบข้อมูล</td></tr>';
  document.getElementById('mcnt').textContent='แสดง '+list.length+' / '+D.mem.length+' คน';
}
function moveMemberTeamDlg(name,currentTeam,memberId){
  var opts=MENTOR_TEAMS.join(' / ');
  var target=prompt('ย้าย "'+name+'" ไปทีมไหน?\n\nทีมที่ใช้ได้: '+opts+'\nเว้นว่าง = ถอนออกจากทีม',currentTeam||'');
  if(target===null)return;
  target=target.trim();
  var normalized='';
  if(target){
    normalized=MENTOR_TEAMS.find(function(t){return t.toLowerCase()===target.toLowerCase();})||'';
    if(!normalized){alert('ชื่อทีมไม่ถูกต้อง กรุณาใช้: '+opts);return;}
  }
  if((currentTeam||'')===normalized){toast('ยังอยู่ทีมเดิม ไม่มีอะไรต้องย้าย','ok');return;}
  var note='Moved from '+(currentTeam||'unassigned')+' to '+(normalized||'unassigned')+' via Desktop MC';
  gsr('moveMemberToTeam',{role:'mc',memberId:memberId,memberName:name,targetTeam:normalized,note:note},function(r){
    if(!r||!r.ok){toast('❌ '+((r&&r.error)||'ย้ายทีมไม่สำเร็จ'),'err');return;}
    var moved=r.moved||{};
    var movedCount=Object.keys(moved).reduce(function(a,k){return a+(parseInt(moved[k],10)||0);},0);
    toast('✅ ย้ายทีมแล้ว: '+name+' → '+(r.to_team||'ไม่มีทีม')+(movedCount?' · sync '+movedCount+' รายการ':''),'ok');
    gsr('getDesktopDashboard',{role:'mc'},function(r2){
      if(r2.ok){D.mem=r2.members||[];D.sm=r2.summary||{};D.teams=r2.teams||[];D.ren=r2.renewal||[];buildMCFilters();}
      renderMem();renderKPI();renderDonut();renderMTTeams();renderCoach();renderRisk();
    });
    if(MTM&&MTM.loaded){MTM.selected={};MTM.loaded=false;loadMentorTeamManager(true);}
  });
}
function cb(pts,max,color){var f=Math.min(100,Math.round((pts||0)/max*100));return'<div style="display:flex;align-items:center;gap:3px"><span style="font-size:10px;font-weight:600;width:16px;text-align:right">'+(pts||0)+'</span><div class="cb"><div class="cf" style="width:'+f+'%;background:'+color+'"></div></div></div>';}

function sff(z,el){ftf=z;document.querySelectorAll('#ac-ft .zp').forEach(function(b){b.classList.remove('on');});el.classList.add('on');renderFT();}
function renderFT(){
  var tm=document.getElementById('ftt').value;
  var sq=(document.getElementById('ft-search').value||'').trim().toLowerCase();
  var list=D.mem.filter(function(m){return m.fastTrack&&m.fastTrack.length&&(ftf==='all'||m.bniTl===ftf)&&(!tm||m.mentor===tm)&&(!sq||(m.name||'').toLowerCase().indexOf(sq)>=0||(m.nick||'').toLowerCase().indexOf(sq)>=0);}).sort(function(a,b){return a.bniScore-b.bniScore;});
  document.getElementById('ftg').innerHTML=list.length?list.map(function(m){
    var target=m.bniTl==='red'?50:m.bniTl==='yellow'?70:50;
    var needed=Math.max(0,target-m.bniScore);
    var acts=(m.fastTrack||[]).map(function(ft){
      return'<div class="fa" style="margin-bottom:4px">'+
        '<span class="fac">'+(ft.icon||'')+''+esc(ft.cat)+'</span>'+
        '<div style="flex:1">'+
          '<div class="fad">'+esc(ft.action)+'</div>'+
          (ft.curVal?'<div style="font-size:10px;color:var(--sub);margin-top:2px">ปัจจุบัน: '+esc(ft.curVal)+' → เป้า: '+esc(ft.tgtVal||'')+'</div>':'')+
        '</div>'+
        '<span class="fag" style="font-size:13px;font-weight:800;color:var(--gr)">+'+ft.gain+'pt</span>'+
      '</div>';
    }).join('');
    return'<div class="fc">'+
      '<div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:8px">'+
        '<div style="flex:1">'+
          '<div style="font-weight:700;font-size:14px">'+esc(m.name)+'<span class="badge b-'+tlK(m.bniTl)+'" style="margin-left:6px;font-size:9px">'+tlL(m.bniTl)+'</span></div>'+
          '<div style="font-size:11px;color:var(--sub)">'+esc(m.mentor||'—')+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-size:22px;font-weight:800;color:'+tlC(m.bniTl)+'">'+m.bniScore+'</div>'+
          '<div style="font-size:10px;color:var(--sub)">ต้องการ +'+needed+'pt → '+target+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="pm" style="margin-bottom:10px">'+
        '<div class="pmf" style="width:'+Math.min(100,m.bniScore)+'%"></div>'+
        '<div style="position:absolute;left:'+Math.min(99,target)+'%;top:0;bottom:0;width:2px;background:var(--sub)"></div>'+
      '</div>'+
      (acts||'<div style="font-size:11px;color:var(--sub)">ไม่มีข้อมูล Fast Track</div>')+
      '<div style="margin-top:8px"><button class="bx" onclick="openIMD(\''+esc(m.name)+'\')">📊 ดู Dashboard</button> <button class="bx" onclick="openModal(\''+esc(m.name)+'\')">⚡ Actions</button></div>'+
    '</div>';
  }).join(''):'<div class="es">ไม่มีสมาชิกที่ต้อง Fast Track 🎉</div>';
}

function renderMTTeams(){
  var sorted=[].concat(D.teams).sort(function(a,b){return(b.avg||0)-(a.avg||0);});
  var RANK_BG=['','rgba(255,193,77,.2)','rgba(192,192,192,.2)','rgba(176,141,87,.15)'];
  var RANK_C=['','var(--ye)','#9ca3af','#b08d57'];
  var container=document.getElementById('mt-cards-container');
  if(!container)return;
  if(!sorted.length){container.innerHTML='<div class="es">🗂️ ไม่มีข้อมูลทีม</div>';return;}
  function fmtM3(v){return v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'K':String(Math.round(v||0));}

  container.innerHTML=sorted.map(function(t,i){
    var rank=i+1;
    var avgC=t.avg>=70?'var(--gr)':t.avg>=50?'var(--ye)':t.avg>=30?'var(--re)':'var(--bl)';
    var tot=t.count||1;
    var gPct=Math.round((t.green||0)/tot*100);
    var openIssues=D.reps.filter(function(r){return r.team===t.team&&repIsOpen(r);}).length;
    var tn=esc(t.team);
    var cardId='mt-card-'+t.team.replace(/[^a-zA-Z0-9]/g,'_');

    // Team members
    var members=D.mem.filter(function(m){return m.mentor===t.team;}).sort(function(a,b){return(b.bniScore||0)-(a.bniScore||0);});

    var noContactCount=members.filter(function(m){return m.noMentorContact;}).length;
    var memberRows=members.map(function(m){
      var mC=tlC(m.bniTl);
      var noC=m.noMentorContact;
      var cTxt=noC?(m.mentorContactDays===null?'<span style="color:var(--ye);font-size:10px;font-weight:700">ยังไม่มี</span>':'<span style="color:var(--ye);font-size:10px;font-weight:700">'+m.mentorContactDays+'วัน</span>'):'<span style="color:var(--gr);font-size:10px">'+m.mentorContactDays+'วัน</span>';
      return '<tr onclick="openModal(\''+esc(m.name.replace(/'/g,"\\'"))+'\')" style="'+(noC?'background:rgba(251,191,36,.04)':'')+'">'
        +'<td><div style="font-weight:600;font-size:12px">'+esc(m.name.split(' ').slice(0,2).join(' '))+(m.nick?'<span style="color:var(--sub);font-weight:400"> ('+esc(m.nick)+')</span>':'')+'</div></td>'
        +'<td><span class="badge b-'+tlK(m.bniTl)+'" style="font-size:9px">'+tlL(m.bniTl)+'</span></td>'
        +'<td style="font-weight:700;color:'+mC+'">'+(m.bniTl!=='none'?m.bniScore:'—')+'</td>'
        +'<td style="color:'+(m.absent>4?'var(--re)':'var(--sub)')+'">'+(m.absent||0)+'</td>'
        +'<td style="color:var(--ye)">฿'+fmtM3((m.actual&&m.actual.tyfcb)||0)+'</td>'
        +'<td style="color:var(--ac2)">'+(m.actual&&m.actual.rg||0)+'ใบ</td>'
        +'<td>'+cTxt+'</td>'
        +'<td>'+(m.phone?'<a href="tel:'+esc(m.phone)+'" target="_top" style="color:var(--sub);font-size:11px">📞</a>':'')
        +(m.email?'<a href="mailto:'+esc(m.email)+'" target="_top" style="color:var(--sub);font-size:11px;margin-left:4px">✉️</a>':'')+'</td>'
        +'</tr>';
    }).join('');

    return '<div class="mt-card" id="'+cardId+'">'
      // Header (clickable to expand)
      +'<div class="mt-card-hdr" onclick="toggleMTCard(\''+cardId+'\')">'
        +'<div class="mt-card-rank" style="background:'+(RANK_BG[rank]||'var(--sf)')+';color:'+(RANK_C[rank]||'var(--sub)')+'">'+(rank<=3?['🥇','🥈','🥉'][rank-1]:rank)+'</div>'
        +'<div class="mt-card-info">'
          +'<div class="mt-card-name">'+tn+'</div>'
          +'<div class="mt-card-sub">'
            +'<span>'+t.count+' คน</span>'
            +(t.nmCount?'<span style="color:var(--bl)">🌱 '+t.nmCount+' ใหม่</span>':'')
            +(openIssues?'<span style="color:var(--re)">📋 '+openIssues+' issue</span>':'')
            +(t.absentTotal>=5?'<span style="color:var(--re)">❌ ขาด '+t.absentTotal+'</span>':'')
          +'</div>'
        +'</div>'
        // KPIs
        +'<div class="mt-kpi-row">'
          +'<div class="mt-kpi"><div class="mt-kpi-val" style="color:'+avgC+'">'+t.avg+'</div><div class="mt-kpi-lbl">Avg</div></div>'
          +'<div class="mt-kpi"><div class="mt-kpi-val" style="color:var(--gr)">'+gPct+'%</div><div class="mt-kpi-lbl">Green</div></div>'
          +'<div class="mt-kpi"><div class="mt-kpi-val" style="color:var(--ye)">฿'+fmtM3(t.tyfcbTotal||0)+'</div><div class="mt-kpi-lbl">TYFCB</div></div>'
        +'</div>'
        // Zone badges
        +'<div style="display:flex;flex-direction:column;gap:2px;align-items:flex-end;margin-right:4px">'
          +(t.green?'<span class="badge b-gr" style="font-size:9px">🟢'+t.green+'</span>':'')
          +(t.yellow?'<span class="badge b-ye" style="font-size:9px">🟡'+t.yellow+'</span>':'')
          +(t.red?'<span class="badge b-re" style="font-size:9px">🔴'+t.red+'</span>':'')
        +'</div>'
        +'<div class="mt-toggle" id="'+cardId+'-arr">▾</div>'
      +'</div>'
      // Progress bar
      +'<div class="mt-prog-bar"><div class="mt-prog-fill" style="width:'+gPct+'%;background:var(--gr)"></div></div>'
      // Expandable body
      +'<div class="mt-card-body" id="'+cardId+'-body">'
        // Action tags
        +'<div class="mt-tag-row">'
          +'<button class="mt-tag" style="cursor:pointer;color:var(--ac)" onclick="openTeamDash(\''+tn+'\');event.stopPropagation()">📊 Team Dashboard</button>'
          +'<button class="mt-tag" style="cursor:pointer;color:#06C755;border-color:rgba(6,199,85,.3)" onclick="openDeskLineBroadcast(\''+esc(t.team)+'\');event.stopPropagation()">📢 LINE ทีม</button>'
          +(openIssues?'<span class="mt-tag" style="color:var(--re)">📋 '+openIssues+' Core Issue ค้าง</span>':'<span class="mt-tag" style="color:var(--gr)">✅ ไม่มี Issue ค้าง</span>')
          +(noContactCount?'<span class="mt-tag" style="color:var(--ye);border-color:rgba(251,191,36,.3)">📆 '+noContactCount+' คน ยังไม่ได้ติดตาม >14 วัน</span>':'<span class="mt-tag" style="color:var(--gr)">📆 Mentor ติดตามครบ</span>')
          +(t.nmCount?'<span class="mt-tag" style="color:var(--bl)">🌱 '+t.nmCount+' คนในโปรแกรม 8W</span>':'')
          +'<span class="mt-tag">💡 Ref ให้ '+fmtM3(t.givenTotal||0)+' · รับ '+fmtM3(t.recvTotal||0)+'</span>'
        +'</div>'
        // Member table
        +'<table class="mt-member-table"><thead><tr>'
          +'<th>ชื่อ</th><th>Zone</th><th>Score</th><th>ขาด</th><th>TYFCB</th><th>Ref</th><th>📆 ติดต่อล่าสุด</th><th></th>'
        +'</tr></thead><tbody>'
          +memberRows
        +'</tbody></table>'
      +'</div>'
    +'</div>';
  }).join('');
}

// ── App Activity Log ────────────────────────────────────────────
var _usageData=null,_usageLoaded=false;
var MENTOR_TEAMS=['TOOMTAM','Aof','Draft','PHAI','AMP'];

// ── Mentor Team Manager ───────────────────────────────────────
// members.mentor_team remains the source of truth. This view never deletes a
// member; "ถอนออก" only clears the team assignment and preserves all history.
var MTM={loaded:false,loading:false,teams:{},teamLabels:{},history:[],selected:{}};
function mtmAllMembers(){
  var keys=MENTOR_TEAMS.concat(['unassigned']),seen={};
  return keys.reduce(function(out,key){
    return out.concat((MTM.teams[key]||[]).filter(function(m){
      var id=String(m.id||'');if(!id||seen[id])return false;seen[id]=true;
      m._team=key==='unassigned'?'':key;return true;
    }));
  },[]);
}
function loadMentorTeamManager(force){
  var board=document.getElementById('team-manager-board');
  if(!board)return;
  if(MTM.loading)return;
  if(MTM.loaded&&!force){renderMentorTeamManager();return;}
  MTM.loading=true;
  board.innerHTML='<div class="team-manager-loading">กำลังโหลดสมาชิก…</div>';
  gsr('getMembersByTeam',{role:'mc'},function(r){
    MTM.loading=false;
    if(!r||!r.ok){board.innerHTML='<div class="team-manager-loading" style="color:var(--re)">โหลดรายชื่อไม่สำเร็จ · '+esc(r&&r.error||'กรุณาลองใหม่')+'</div>';return;}
    MTM.teams=r.teams||{};MTM.teamLabels=r.teamLabels||{};MTM.loaded=true;
    var filter=document.getElementById('team-manager-filter'),target=document.getElementById('team-manager-target');
    if(filter)Array.prototype.forEach.call(filter.options,function(o){if(MTM.teamLabels[o.value])o.textContent=MTM.teamLabels[o.value];});
    if(target)Array.prototype.forEach.call(target.options,function(o){if(MTM.teamLabels[o.value])o.textContent='ย้ายไป '+MTM.teamLabels[o.value];});
    renderMentorTeamManager();
  });
  gsr('getTeamMoveHistory',{role:'mc'},function(r){
    if(r&&r.ok){MTM.history=r.history||[];renderMentorTeamHistory();}
  });
}
function mtmTeamLabel(team){return team?(MTM.teamLabels[team]||team):'ยังไม่มีทีม';}
function mtmMoveOptions(current){
  var html='<option value="">ย้าย…</option>';
  MENTOR_TEAMS.forEach(function(team){if(team!==current)html+='<option value="'+team+'">'+esc(MTM.teamLabels[team]||team)+'</option>';});
  if(current)html+='<option value="__NONE__">ถอนออกจากทีม</option>';
  return html;
}
function renderMentorTeamManager(){
  var board=document.getElementById('team-manager-board');if(!board||!MTM.loaded)return;
  var query=((document.getElementById('team-manager-search')||{}).value||'').trim().toLowerCase();
  var filter=((document.getElementById('team-manager-filter')||{}).value||'all');
  var all=mtmAllMembers(),unassigned=all.filter(function(m){return !m._team;}).length;
  var stats=document.getElementById('team-manager-stats');
  if(stats)stats.innerHTML='<div><b>'+all.length+'</b><span>สมาชิกทั้งหมด</span></div><div><b>'+MENTOR_TEAMS.length+'</b><span>ทีมที่ใช้งาน</span></div><div class="'+(unassigned?'warn':'')+'"><b>'+unassigned+'</b><span>ยังไม่มีทีม</span></div><div><b>'+Object.keys(MTM.selected).length+'</b><span>เลือกไว้</span></div>';
  var keys=filter==='all'?MENTOR_TEAMS.concat(['unassigned']):[filter];
  board.innerHTML=keys.map(function(key){
    var team=key==='unassigned'?'':key;
    var list=(MTM.teams[key]||[]).filter(function(m){
      var hay=((m.name||'')+' '+(m.nickname||m.nick||'')).toLowerCase();return !query||hay.indexOf(query)>=0;
    }).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''),'th');});
    var rows=list.length?list.map(function(m){
      var id=String(m.id||''),checked=MTM.selected[id]?' checked':'';
      return '<div class="team-manager-member">'+
        '<label><input type="checkbox"'+checked+' onchange="toggleMentorTeamMember(\''+id+'\',this.checked)"><span><strong>'+esc(m.nickname||m.nick||m.name||'ไม่ระบุชื่อ')+'</strong><small>'+esc(m.name||'')+(m.latest_score!=null?' · '+esc(m.latest_score)+' คะแนน':'')+'</small></span></label>'+
        '<select aria-label="ย้าย '+esc(m.nickname||m.name||'สมาชิก')+'" onchange="quickMoveMentorTeam(\''+id+'\',this.value);this.value=\'\'">'+mtmMoveOptions(team)+'</select>'+
      '</div>';
    }).join(''):'<div class="team-manager-empty">'+(query?'ไม่พบสมาชิกที่ค้นหา':'ยังไม่มีสมาชิก')+'</div>';
    return '<section class="team-manager-column"><header><div><b>'+esc(mtmTeamLabel(team))+'</b><span>'+list.length+' คน</span></div>'+(list.length?'<button type="button" onclick="selectMentorTeamColumn(\''+key+'\')">เลือกทั้งหมด</button>':'')+'</header>'+rows+'</section>';
  }).join('');
  updateMentorTeamSelection();
}
function toggleMentorTeamMember(id,checked){
  if(checked)MTM.selected[id]=true;else delete MTM.selected[id];updateMentorTeamSelection();
}
function selectMentorTeamColumn(key){
  (MTM.teams[key]||[]).forEach(function(m){if(m.id)MTM.selected[String(m.id)]=true;});renderMentorTeamManager();
}
function updateMentorTeamSelection(){
  var n=Object.keys(MTM.selected).length,count=document.getElementById('team-manager-selected'),btn=document.getElementById('team-manager-move');
  if(count)count.textContent=n;if(btn)btn.disabled=!n;
}
function mtmMember(id){return mtmAllMembers().find(function(m){return String(m.id)===String(id);});}
function quickMoveMentorTeam(id,value){
  if(!value)return;var member=mtmMember(id),target=value==='__NONE__'?'':value;
  var name=member&&(member.nickname||member.name)||'สมาชิก';
  if(!confirm((target?'ย้าย ':'ถอน ')+name+(target?' ไป'+mtmTeamLabel(target)+'?':' ออกจากทีม?')+'\n\nคะแนน ประวัติ และข้อมูลเดิมจะไม่ถูกลบ'))return;
  gsr('moveMemberToTeam',{role:'mc',memberId:id,memberName:member&&member.name||'',targetTeam:target,note:'Mentor Team Manager · single move'},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'เปลี่ยนทีมไม่สำเร็จ'),'err');return;}
    toast('✅ อัปเดตทีมของ '+name+' แล้ว','ok');delete MTM.selected[id];refreshMentorTeamManager();
  });
}
function bulkMoveMentorTeam(){
  var ids=Object.keys(MTM.selected);if(!ids.length)return;
  var target=(document.getElementById('team-manager-target')||{}).value||'';
  var action=target?'ย้ายไป'+mtmTeamLabel(target):'ถอนออกจากทีม';
  if(!confirm(action+' จำนวน '+ids.length+' คน?\n\nระบบจะเก็บประวัติเดิมทั้งหมด และข้ามคนที่อยู่ทีมปลายทางแล้ว'))return;
  var btn=document.getElementById('team-manager-move');if(btn)btn.disabled=true;
  gsr('bulkMoveMembersToTeam',{role:'mc',memberIds:ids,targetTeam:target,note:'Mentor Team Manager · bulk move'},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'ย้ายทีมไม่สำเร็จ'),'err');updateMentorTeamSelection();return;}
    toast('✅ อัปเดตทีมแล้ว '+(r.moved_count||0)+' คน'+(r.unchanged_count?' · อยู่ทีมเดิม '+r.unchanged_count+' คน':''),'ok');
    MTM.selected={};refreshMentorTeamManager();
  });
}
function refreshMentorTeamManager(){
  MTM.loaded=false;loadMentorTeamManager(true);
  gsr('getDesktopDashboard',{role:'mc'},function(r){
    if(!r||!r.ok)return;D.mem=r.members||[];D.sm=r.summary||{};D.teams=r.teams||[];D.ren=r.renewal||[];
    buildMCFilters();renderMem();renderKPI();renderDonut();renderMTTeams();renderCoach();renderRisk();
  });
}
function renderMentorTeamHistory(){
  var el=document.getElementById('team-manager-history');if(!el)return;
  el.innerHTML=MTM.history.length?MTM.history.slice(0,30).map(function(h){
    var member=h.members||{},when=h.moved_at?new Date(h.moved_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'';
    return '<div class="team-manager-history-row"><div><b>'+esc(member.nickname||member.name||'สมาชิก')+'</b><span>'+esc(h.from_team||'ไม่มีทีม')+' → '+esc(h.to_team||'ไม่มีทีม')+'</span></div><small>'+esc(when)+' · '+esc(h.moved_by_role||'ผู้ดูแล')+'</small></div>';
  }).join(''):'<div class="team-manager-empty">ยังไม่มีประวัติการย้ายทีม</div>';
}

function nmTestLog(){
  gsr('logUsage',{role:S.role,team:S.role,platform:'desktop-test',logAction:'test',detail:'Manual test from Activity tab'},function(r){
    if(r&&r.ok)toast('✅ Log ทดสอบสำเร็จ — กด รีเฟรช เพื่อดู','ok');
    else toast('❌ Log ล้มเหลว: '+(r&&r.error||'?'),'err');
    loadUsageLog(true);
  });
}
function actSw(tab,btn){
  document.getElementById('act-line').style.display=tab==='line'?'':'none';
  document.getElementById('act-mentor').style.display=tab==='mentor'?'':'none';
  document.getElementById('act-tab-line').style.background=tab==='line'?'rgba(6,199,85,.2)':'transparent';
  document.getElementById('act-tab-line').style.color=tab==='line'?'#06C755':'var(--sub)';
  document.getElementById('act-tab-mentor').style.background=tab==='mentor'?'rgba(99,102,241,.2)':'transparent';
  document.getElementById('act-tab-mentor').style.color=tab==='mentor'?'#818cf8':'var(--sub)';
  if(tab==='mentor'&&!_usageLoaded) loadUsageLog(false);
}
function loadUsageLog(force){
  if(_usageLoaded&&!force)return;
  document.getElementById('usage-log-wrap').innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:30px">⏳ กำลังโหลด...</div>';
  gsr('getUsageLog',{role:'mc'},function(r){
    _usageLoaded=true;
    if(!r.ok){document.getElementById('usage-log-wrap').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _usageData=r;
    renderUsageLog();
  });
  loadLineMembersActivity(force);
  loadLineActivityTimeline(force);
  loadOnboardingStatus(force);
  loadAbsenceLog(force);
  loadLineIssues(force);
  load121Tracker(force);
}

// ════════ DESKTOP CHECK-IN ════════
var DCI={parsed:[],date:'',week:''};
function deskCiFileSelected(e){var file=e.target.files[0];if(file)deskCiReadFile(file);e.target.value='';}
function deskCiReadFile(file){
  var name=file.name.toLowerCase();
  var fnEl=document.getElementById('dci-filename');
  if(!name.endsWith('.csv')){toast('❌ รองรับเฉพาะไฟล์ .csv');return;}
  if(fnEl)fnEl.textContent='⏳ กำลังอ่าน '+file.name+'...';
  var reader2=new FileReader();
  reader2.onload=function(ev2){
    var text=ev2.target.result;
    if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
    var result=deskCiParseCSVText(text);
    if(!result.ok){toast('❌ '+result.error);if(fnEl)fnEl.textContent='';return;}
    DCI.parsed=result.members;DCI.date=result.date;DCI.week=result.week;
    deskCiRenderResult(result);if(fnEl)fnEl.innerHTML='✅ <strong>'+esc(file.name)+'</strong>';
  };
  reader2.readAsText(file,'UTF-8');
}
function deskCiParsePDFText(text){
  var lines=text.split(/\n/).map(function(l){return l.trim();}).filter(Boolean);
  var members=[],date='',week='';
  for(var i=0;i<Math.min(8,lines.length);i++){var dm=lines[i].match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);if(dm){date=dm[1];break;}}
  if(date){var parts=date.replace(/-/g,'/').split('/');try{if(parts.length===3){if(parts[2].length===2)parts[2]='20'+parts[2];var d=new Date(+parts[2],+parts[0]-1,+parts[1]);if(isNaN(d.getTime()))d=new Date(+parts[2],+parts[1]-1,+parts[0]);if(!isNaN(d.getTime())){var soy=new Date(d.getFullYear(),0,1);var wn=Math.ceil((((d-soy)/86400000)+soy.getDay()+1)/7);week=('0'+wn).slice(-2)+'/'+d.getFullYear();}}}catch(e){}}
  if(!week){var now=new Date();var soy2=new Date(now.getFullYear(),0,1);var wn2=Math.ceil((((now-soy2)/86400000)+soy2.getDay()+1)/7);week=('0'+wn2).slice(-2)+'/'+now.getFullYear();}
  var i2=0;
  while(i2<lines.length){
    var line=lines[i2];var nm=line.match(/^(\d*)\s*[:\-]\s*(.+?)\s*\((สมาชิก|ตัวแทน)\)/);
    if(!nm)nm=line.match(/^(.+?)\s*\((สมาชิก|ตัวแทน)\)$/);
    if(nm){
      var name2=nm.length===4?nm[2].trim():nm[1].trim();var status=nm[nm.length-1];var subFor=null,lfParts=[];i2++;
      while(i2<lines.length){
        var nxt=lines[i2];
        if(nxt.match(/^มาประชุมแทน\s*[:\-]/)){subFor=nxt.replace(/^มาประชุมแทน\s*[:\-]\s*/,'').trim();i2++;}
        else if(nxt.match(/^Looking for\s*[:\-]/i)){var lf=nxt.replace(/^Looking for\s*[:\-]\s*/i,'').trim();if(lf)lfParts.push(lf);i2++;while(i2<lines.length&&!lines[i2].match(/^เช็คอิน\s*[:\-]/)&&!lines[i2].match(/^(\d*\s*[:\-]\s*.+?|.+?)\s*\((สมาชิก|ตัวแทน)\)/)){lfParts.push(lines[i2]);i2++;}}
        else if(nxt.match(/^เช็คอิน\s*[:\-]/)){i2++;break;}
        else{i2++;break;}
      }
      members.push({no:String(members.length+1),name:name2,status:status,sub_for:subFor,looking_for:lfParts.join(' ').trim()});
    } else {i2++;}
  }
  if(!members.length)return{ok:false,error:'อ่าน PDF ไม่พบข้อมูลสมาชิก — ตรวจสอบรูปแบบ PDF'};
  return{ok:true,members:members,date:date,week:week};
}
function deskCiParseCSVText(text){
  var lines=text.split(/\r?\n/).filter(Boolean);
  if(!lines.length)return{ok:false,error:'ไฟล์ว่างเปล่า'};
  var members=[],date='',week='';
  var firstFields=deskCiParseLine(lines[0]).map(function(h){return h.trim().toLowerCase();});
  // Detect if first row is a header (contains 'name','ชื่อ', etc.)
  var hasHeader=firstFields.some(function(h){return h==='name'||h==='ชื่อ'||h==='member name'||h==='member'||h==='status'||h==='สถานะ';});
  var nameIdx,statusIdx,subIdx,lfIdx,dateIdx,weekIdx;
  var dataStart;
  if(hasHeader){
    var headers=firstFields;
    nameIdx=_ciCol(headers,['name','ชื่อ','member name','member']);
    statusIdx=_ciCol(headers,['status','สถานะ','state']);
    subIdx=_ciCol(headers,['sub_for','sub for','แทน']);
    lfIdx=_ciCol(headers,['looking_for','looking for','ต้องการ']);
    dateIdx=_ciCol(headers,['date','วันที่']);
    weekIdx=_ciCol(headers,['week','สัปดาห์']);
    dataStart=1;
  } else {
    // Headerless: col 0=name, 1=status, 2=sub_for, 3=looking_for (GAS format)
    nameIdx=0;statusIdx=1;subIdx=2;lfIdx=3;dateIdx=-1;weekIdx=-1;dataStart=0;
  }
  if(nameIdx<0)return{ok:false,error:'ไม่พบคอลัมน์ชื่อสมาชิกใน CSV'};
  for(var i=dataStart;i<lines.length;i++){
    var f=deskCiParseLine(lines[i]);
    var name=f[nameIdx]?f[nameIdx].trim():'';if(!name)continue;
    var status=statusIdx>=0&&f[statusIdx]?f[statusIdx].trim():'สมาชิก';
    // Accept both Thai and English status values
    if(status!=='สมาชิก'&&status!=='ตัวแทน'){
      var sl=status.toLowerCase();
      status=(sl==='sub'||sl==='substitute'||sl==='ตัวแทน')?'ตัวแทน':'สมาชิก';
    }
    var sub=subIdx>=0&&f[subIdx]?f[subIdx].trim():'';
    var lf=lfIdx>=0&&f[lfIdx]?f[lfIdx].trim():'';
    if(!date&&dateIdx>=0&&f[dateIdx])date=f[dateIdx].trim();
    if(!week&&weekIdx>=0&&f[weekIdx])week=f[weekIdx].trim();
    members.push({no:String(members.length+1),name:name,status:status,sub_for:sub||null,looking_for:lf});
  }
  if(!week){var now=new Date();var soy=new Date(now.getFullYear(),0,1);var wn=Math.ceil((((now-soy)/86400000)+soy.getDay()+1)/7);week=('0'+wn).slice(-2)+'/'+now.getFullYear();}
  if(!members.length)return{ok:false,error:'ไม่พบข้อมูลสมาชิกใน CSV'};
  return{ok:true,members:members,date:date,week:week};
}
function _ciCol(headers,candidates){
  for(var i=0;i<candidates.length;i++){var idx=headers.indexOf(candidates[i]);if(idx>=0)return idx;}
  return -1;
}
function deskCiParseLine(line){
  var fields=[],cur='',inQ=false;
  for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){if(inQ&&i+1<line.length&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(ch===','&&!inQ){fields.push(cur);cur='';}else cur+=ch;}
  fields.push(cur);return fields;
}
function deskCiReset(){
  DCI.parsed=[];DCI.date='';DCI.week='';
  document.getElementById('dci-result').style.display='none';
  var fnEl=document.getElementById('dci-filename');if(fnEl)fnEl.textContent='';
  document.getElementById('dci-file-input').value='';
}
function deskCiRenderResult(r){
  var real=r.members.filter(function(m){return m.status==='สมาชิก';}).length;
  var sub=r.members.filter(function(m){return m.status==='ตัวแทน';}).length;
  document.getElementById('dci-summary').innerHTML='📅 <strong>'+esc(r.date||'—')+'</strong> &nbsp;สัปดาห์ <strong>'+esc(r.week)+'</strong><br>✅ สมาชิก: <strong>'+real+'</strong> คน &nbsp;|&nbsp; 🔄 ส่งแทน: <strong>'+sub+'</strong> คน';
  document.getElementById('dci-list').innerHTML=r.members.map(function(m){
    var isSub=m.status==='ตัวแทน';
    return '<div style="background:var(--sf);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:flex-start;gap:10px">'
      +'<div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(m.name)+(isSub?'&nbsp;<span style="font-size:10px;color:#fbbf24">→ แทน '+esc(m.sub_for||'?')+'</span>':'')+'</div>'
      +(m.looking_for?'<div style="font-size:11px;color:var(--sub);margin-top:2px">🔍 '+esc(m.looking_for)+'</div>':'')
      +'</div><span style="font-size:10px;padding:2px 7px;border-radius:4px;background:'+(isSub?'rgba(251,191,36,.15)':'rgba(52,211,153,.15)')+';color:'+(isSub?'#fbbf24':'var(--gr)')+'">'+(isSub?'Sub':'สมาชิก')+'</span></div>';
  }).join('');
  document.getElementById('dci-result').style.display='block';
}
function deskCiSave(){
  if(!DCI.parsed.length){toast('❌ ยังไม่มีข้อมูล');return;}
  var btn=document.getElementById('dci-save-btn');
  btn.textContent='⏳ กำลังบันทึก...';btn.disabled=true;
  gsr('saveCheckin',{role:S.role,members:DCI.parsed,date:DCI.date,week:DCI.week},function(r){
    btn.textContent='💾 บันทึกลง Sheet';btn.disabled=false;
    if(r&&r.ok){toast('✅ บันทึก '+r.saved+' คน สัปดาห์ '+r.week);deskCiReset();_dciHistLoaded=false;deskCiLoadHistory();}
    else toast('❌ '+(r&&r.error||'error'));
  });
}
var _dciHistLoaded=false;
function deskCiLoadHistory(){
  if(_dciHistLoaded)return;
  _dciHistLoaded=true;
  gsr('getCheckinLog',{role:S.role},function(r){
    if(!r||!r.ok||!r.weeks||!r.weeks.length)return;
    var sel=document.getElementById('dci-week-sel');
    sel.innerHTML=r.weeks.slice().reverse().map(function(w){return '<option value="'+esc(w.week)+'"'+(w.week===r.currentWeek?' selected':'')+'>สัปดาห์ '+esc(w.week)+' ('+w.count+' คน)</option>';}).join('');
    document.getElementById('dci-history').style.display='block';
    deskCiLoadWeek(r.currentWeek);
  });
}
function deskCiLoadWeek(week){
  if(!week)return;
  document.getElementById('dci-week-list').innerHTML='<div style="color:var(--sub);font-size:12px;padding:12px">⏳ กำลังโหลด...</div>';
  gsr('getCheckinLog',{role:S.role,week:week},function(r){
    if(!r||!r.ok){document.getElementById('dci-week-list').innerHTML='';return;}
    var real=r.members.filter(function(m){return m.status==='สมาชิก';}).length;
    var sub=r.members.filter(function(m){return m.status==='ตัวแทน';}).length;
    var html='<div style="font-size:12px;color:var(--sub);margin-bottom:10px">✅ สมาชิก: <strong style="color:var(--tx)">'+real+'</strong> คน &nbsp;|&nbsp; 🔄 ส่งแทน: <strong style="color:var(--tx)">'+sub+'</strong> คน</div>';
    html+=r.members.map(function(m){
      var isSub=m.status==='ตัวแทน';
      return '<div style="background:var(--sf);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:flex-start;gap:10px">'
        +'<div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(m.name)+(isSub?'&nbsp;<span style="font-size:10px;color:#fbbf24">→ แทน '+esc(m.sub_for||'?')+'</span>':'')+'</div>'
        +(m.looking_for?'<div style="font-size:11px;color:var(--sub);margin-top:2px">🔍 '+esc(m.looking_for)+'</div>':'')
        +'</div><span style="font-size:10px;padding:2px 7px;border-radius:4px;background:'+(isSub?'rgba(251,191,36,.15)':'rgba(52,211,153,.15)')+';color:'+(isSub?'#fbbf24':'var(--gr)')+'">'+(isSub?'Sub':'สมาชิก')+'</span></div>';
    }).join('');
    document.getElementById('dci-week-list').innerHTML=html;
  });
}

var _lineMembersLoaded=false;
var _onboardLoaded=false;
var _lineActivityLoaded=false;

function fmtLineActivityTime(iso){
  if(!iso)return'—';
  var d=new Date(iso);
  if(isNaN(d.getTime()))return String(iso).slice(0,16).replace('T',' ');
  return d.toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}
function lineActivitySummaryChip(label,value,color){
  return '<span style="display:inline-flex;align-items:center;gap:7px;background:'+color+'16;border:1px solid '+color+'44;color:'+color+';border-radius:14px;padding:7px 10px;font-size:11px;font-weight:800;box-shadow:0 8px 18px rgba(0,0,0,.08)">'
    +'<span>'+esc(label)+'</span><strong style="font-size:14px;line-height:1;color:var(--tx)">'+esc(value)+'</strong></span>';
}
function lineActivityMeta(it){
  var type=String(it&&it.type||'');
  var m={
    command_received:{icon:'💬',label:'Member พิมพ์',tone:'#38bdf8',hint:'คำสั่ง/ข้อความจากสมาชิก'},
    command_replied:{icon:'🤖',label:'Bot ตอบ',tone:'#06C755',hint:'คำตอบอัตโนมัติ'},
    unrecognized:{icon:'🤖',label:'Bot ไม่เข้าใจ',tone:'#fb923c',hint:'ไม่ได้ส่งต่อให้ Mentor'},
    liff:{icon:'📱',label:'LIFF',tone:'#06C755',hint:'กิจกรรมใน mini app'},
    absence:{icon:'🙋',label:'แจ้งลา',tone:'var(--ye)',hint:'ต้องดูแผนการเข้าแทน'},
    substitute:{icon:'👥',label:'ส่ง Sub',tone:'var(--ye)',hint:'มีคนมาแทนการประชุม'},
    issue:{icon:'🆘',label:'ขอความช่วยเหลือ',tone:'#f87171',hint:'ควร follow-up'},
    goal:{icon:'🎯',label:'เป้าหมาย',tone:'#a78bfa',hint:'สมาชิกตั้ง/ดูเป้า'},
    one_to_one:{icon:'🤝',label:'1-2-1',tone:'#34d399',hint:'กิจกรรมสัมพันธ์'},
    delivery:{icon:'📤',label:'ส่งข้อความ',tone:'#94a3b8',hint:'ระบบส่งออกไปแล้ว'}
  };
  var meta=m[type]||{};
  return {
    icon:it.icon||meta.icon||'•',
    label:it.label||meta.label||type||'Activity',
    tone:it.tone||meta.tone||'#94a3b8',
    hint:meta.hint||'LINE activity'
  };
}
function lineActivityStatusPill(status,color){
  if(!status)return'';
  var s=String(status);
  var low=s.toLowerCase();
  var tone=low.indexOf('open')>=0||low.indexOf('pending')>=0||s.indexOf('รอ')>=0?'var(--ye)'
    :low.indexOf('resolved')>=0||low.indexOf('sent')>=0||s.indexOf('สำเร็จ')>=0?'#34d399'
    :color||'#94a3b8';
  return '<span style="display:inline-flex;align-items:center;gap:5px;background:'+tone+'16;border:1px solid '+tone+'44;color:'+tone+';border-radius:999px;padding:4px 9px;font-size:10px;font-weight:800;white-space:nowrap">'+esc(s)+'</span>';
}
function lineActivityCard(it){
  var meta=lineActivityMeta(it);
  var name=it.memberNick||it.memberName||'ไม่ทราบสมาชิก';
  var team=it.memberTeam?'<span style="font-size:10px;background:var(--sf2);border:1px solid var(--bd);border-radius:999px;padding:3px 7px;color:var(--sub);font-weight:800">'+esc(it.memberTeam)+'</span>':'';
  var title=it.title||meta.hint;
  var detail=String(it.detail||'').trim();
  var raw=String(it.rawText||'').trim();
  var shortDetail=detail?esc(detail.slice(0,260)):'';
  var rawLine=raw&&raw!==detail?'<div style="font-size:10px;color:var(--sub);margin-top:8px;line-height:1.5">พิมพ์จริง: <code style="background:var(--sf2);border:1px solid var(--bd);border-radius:6px;padding:2px 5px;color:var(--tx)">'+esc(raw.slice(0,120))+'</code></div>':'';
  var status=lineActivityStatusPill(it.status,meta.tone);
  var action=it.action==='followup'?'<button class="bsm" onclick="openActionCenter(\'inbox\')" style="margin-top:10px;color:#fbbf24;border-color:rgba(251,191,36,.4)">เปิด Follow-up Inbox →</button>':'';
  return '<article style="position:relative;background:var(--sf);border:1px solid var(--bd);border-left:4px solid '+meta.tone+';border-radius:14px;padding:13px 14px;box-shadow:0 10px 26px rgba(0,0,0,.10);overflow:hidden">'
    +'<div style="position:absolute;right:-18px;top:-22px;width:74px;height:74px;border-radius:999px;background:'+meta.tone+'12"></div>'
    +'<div style="position:relative;display:flex;align-items:flex-start;gap:11px">'
      +'<div style="width:38px;height:38px;border-radius:13px;background:'+meta.tone+'18;border:1px solid '+meta.tone+'44;display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto">'+esc(meta.icon)+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:4px">'
          +'<span style="font-size:11px;font-weight:900;color:'+meta.tone+';letter-spacing:.2px;text-transform:uppercase">'+esc(meta.label)+'</span>'
          +team
          +'<span style="font-size:10px;color:var(--sub);margin-left:auto;white-space:nowrap">'+esc(fmtLineActivityTime(it.occurredAt))+'</span>'
        +'</div>'
        +'<div style="font-size:14px;font-weight:900;color:var(--tx);line-height:1.35;word-break:break-word">'+esc(name)+'</div>'
        +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-top:3px">'+esc(title)+'</div>'
        +(shortDetail?'<div style="margin-top:10px;background:var(--sf2);border:1px solid var(--bd);border-radius:11px;padding:9px 10px;font-size:12px;color:var(--tx);line-height:1.6;white-space:pre-wrap;word-break:break-word">'+shortDetail+'</div>':'')
        +rawLine+action
      +'</div>'
      +(status?'<div style="flex:0 0 auto;position:relative">'+status+'</div>':'')
    +'</div>'
  +'</article>';
}
function loadLineActivityTimeline(force){
  if(_lineActivityLoaded&&!force)return;
  var wrap=document.getElementById('line-activity-wrap');
  var cnt=document.getElementById('line-activity-count');
  var sumEl=document.getElementById('line-activity-summary');
  if(!wrap)return;
  wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">⏳ กำลังโหลด Timeline...</div>';
  var type=(document.getElementById('line-activity-type')||{}).value||'';
  var team=(document.getElementById('line-activity-team')||{}).value||'';
  var view=(document.getElementById('line-activity-view')||{}).value||'actionable';
  gsr('getLineActivityTimeline',{role:S.role,type:type,team:team,view:view,limit:90},function(r){
    _lineActivityLoaded=true;
    if(!r||!r.ok){
      wrap.innerHTML='<div style="margin:14px 16px;background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.28);border-radius:14px;color:var(--re);padding:16px;font-size:12px">❌ '+esc(r&&r.error||'โหลด Timeline ไม่ได้')+'</div>';
      if(cnt)cnt.textContent='—';
      return;
    }
    var items=r.items||[];
    if(cnt)cnt.textContent=items.length+' รายการ';
    var summary=r.summary||{};
    if(sumEl){
      var labels=[
        ['command_received','💬 พิมพ์','#38bdf8'],
        ['command_replied','🤖 Bot','#06C755'],
        ['unrecognized','🤖 ไม่เข้าใจ','#fb923c'],
        ['absence','🙋 ลา','var(--ye)'],
        ['substitute','👥 Sub','var(--ye)'],
        ['issue','⚠️ Help','#f87171'],
        ['goal','🎯 Goal','#a78bfa'],
        ['one_to_one','🤝 1-2-1','#34d399'],
        ['delivery','📤 Sent','#94a3b8']
      ];
      sumEl.innerHTML=labels.filter(function(x){return summary[x[0]];}).map(function(x){return lineActivitySummaryChip(x[1],summary[x[0]],x[2]);}).join('');
      sumEl.style.display=sumEl.innerHTML?'flex':'none';
    }
    if(!items.length){
      wrap.innerHTML='<div style="margin:14px 16px;background:var(--sf);border:1px dashed var(--bd);border-radius:14px;color:var(--sub);font-size:12px;text-align:center;padding:24px;line-height:1.7">ยังไม่มี LINE activity ในช่วงนี้<br><span style="font-size:10px">ลองเปลี่ยน filter ประเภทหรือทีมด้านบนครับ</span></div>';
      return;
    }
    wrap.innerHTML='<div style="padding:14px 16px 16px">'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:12px">'
      +items.map(lineActivityCard).join('')
      +'</div>'
    +'</div>';
  });
}

function loadOnboardingStatus(force){
  if(_onboardLoaded&&!force)return;
  document.getElementById('onboard-wrap').innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">⏳ กำลังโหลด...</div>';
  gsr('getOnboardingStatus',{role:S.role},function(r){
    _onboardLoaded=true;
    var wrap=document.getElementById('onboard-wrap');
    var cntEl=document.getElementById('onboard-count');
    if(!r||!r.ok){wrap.innerHTML='<div style="color:var(--re);padding:16px;font-size:12px">❌ '+(r&&r.error||'error')+'</div>';return;}
    var list=(r.members||[]).filter(function(m){return !m.completed;});
    var done=(r.members||[]).filter(function(m){return m.completed;}).length;
    cntEl.textContent='กำลังดำเนินการ '+list.length+' คน | จบแล้ว '+done+' คน';
    if(!r.members||!r.members.length){wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มีสมาชิกใน Onboarding Program</div>';return;}
    var rows=(r.members||[]).map(function(m){
      var bar='';
      for(var i=1;i<=8;i++){var done2=i<=m.weekSent;bar+='<span style="display:inline-block;width:14px;height:14px;border-radius:3px;font-size:9px;line-height:14px;text-align:center;background:'+(done2?'#06C755':'var(--bd)');bar+=';color:'+(done2?'#fff':'var(--sub)')+'">'+i+'</span>';}
      var statusTag=m.completed?'<span style="font-size:10px;background:#06C75522;color:#06C755;border:1px solid #06C75544;border-radius:4px;padding:1px 5px">✅ จบแล้ว</span>':'<span style="font-size:10px;background:var(--ye)22;color:var(--ye);border:1px solid var(--ye)44;border-radius:4px;padding:1px 5px">W'+m.weekSent+'/8</span>';
      var nm=m.name.replace(/'/g,"\\'");
      var enrollBtn='<button style="font-size:10px;padding:2px 6px;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:5px;color:#818cf8;cursor:pointer;margin-right:3px" onclick="deskEnrollOnboard(\''+esc(nm)+'\')" title="Re-enroll / Restart">↺</button>';
      var sendBtn=!m.completed?'<button style="font-size:10px;padding:2px 6px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);border-radius:5px;color:#fbbf24;cursor:pointer;margin-right:3px" onclick="deskSendOnboardWeek(\''+esc(nm)+'\','+m.weekSent+')" title="ส่ง Week ตอนนี้">📤</button>':'';
      var removeBtn='<button style="font-size:10px;padding:2px 6px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.3);border-radius:5px;color:#f87171;cursor:pointer" onclick="deskRemoveOnboard(\''+esc(nm)+'\')" title="เอาออกจาก Program">🗑️</button>';
      return '<tr>'
        +'<td style="font-weight:600;font-size:12px">'+esc(m.name)+'</td>'
        +'<td>'+bar+'</td>'
        +'<td>'+statusTag+'</td>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(m.startDate)+'</td>'
        +'<td onclick="event.stopPropagation()" style="white-space:nowrap">'+enrollBtn+sendBtn+removeBtn+'</td>'
        +'</tr>';
    }).join('');
    wrap.innerHTML='<table class="usage-log-tbl"><thead><tr>'
      +'<th>ชื่อ</th><th>Progress</th><th>สถานะ</th><th>เริ่มวันที่</th><th></th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table>';
  });
}
// ════════ ONBOARDING MESSAGE EDITOR ════════
var OE={week:1,msgs:{},defaults:{},loaded:false,dirty:false};
function loadOnboardEditor(){
  if(OE.loaded)return;
  OE.loaded=true;
  document.getElementById('oe-editor').value='⏳ กำลังโหลด...';
  gsr('getOnboardingMessages',{role:S.role},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'error'));return;}
    OE.msgs=r.messages||{};
    OE.defaults=r.defaults||{};
    oeSelectWeek(1,document.querySelector('.oe-wtab'));
  });
}
function oeSelectWeek(w,btn){
  OE.week=w;
  document.querySelectorAll('.oe-wtab').forEach(function(b){
    b.style.background='var(--sf2)';b.style.color='var(--sub)';b.style.borderColor='var(--bd)';
  });
  if(btn){btn.style.background='rgba(99,102,241,.2)';btn.style.color='#818cf8';btn.style.borderColor='rgba(99,102,241,.5)';}
  var msg=OE.msgs[w]||OE.defaults[w]||'';
  document.getElementById('oe-editor').value=msg;
  document.getElementById('oe-modified-badge').style.display=OE.msgs[w]?'inline-flex':'none';
  OE.dirty=false;
  oeUpdatePreview();
}
function oeUpdatePreview(){
  var nick=document.getElementById('oe-nick-preview').value||'Pete';
  var text=document.getElementById('oe-editor').value||'';
  document.getElementById('oe-preview').textContent=text.replace(/\{nick\}/g,nick);
}
function oeMarkModified(){
  OE.dirty=true;
}
function oeSave(){
  var text=document.getElementById('oe-editor').value.trim();
  if(!text){toast('❌ ข้อความว่างเปล่า');return;}
  var btn=document.getElementById('oe-save-btn');
  btn.textContent='⏳ กำลังบันทึก...';btn.disabled=true;
  gsr('saveOnboardingMessage',{role:S.role,week:OE.week,message:text},function(r){
    btn.textContent='💾 บันทึก Week นี้';btn.disabled=false;
    if(r&&r.ok){
      OE.msgs[OE.week]=text;
      document.getElementById('oe-modified-badge').style.display='inline-flex';
      OE.dirty=false;
      toast('✅ บันทึก Week '+OE.week+' แล้ว');
    } else toast('❌ '+(r&&r.error||'error'));
  });
}
function oeResetWeek(){
  var def=OE.defaults[OE.week]||'';
  if(!confirm('รีเซ็ต Week '+OE.week+' กลับเป็นข้อความเริ่มต้น?'))return;
  var btn=document.getElementById('oe-save-btn');
  btn.textContent='⏳ กำลังรีเซ็ต...';btn.disabled=true;
  gsr('saveOnboardingMessage',{role:S.role,week:OE.week,message:'__DEFAULT__'},function(r){
    btn.textContent='💾 บันทึก Week นี้';btn.disabled=false;
    if(r&&r.ok){
      delete OE.msgs[OE.week];
      document.getElementById('oe-editor').value=def;
      document.getElementById('oe-modified-badge').style.display='none';
      oeUpdatePreview();
      toast('✅ รีเซ็ต Week '+OE.week+' แล้ว');
    } else toast('❌ '+(r&&r.error||'error'));
  });
}

function deskOnboardPreview(){
  var nick=prompt('ใส่ชื่อเล่นตัวอย่าง (เช่น Pete):','Pete');
  if(nick===null)return;
  if(!nick.trim())nick='ชื่อ';
  gsr('getOnboardingPreview',{role:S.role,nick:nick.trim()},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'error'));return;}
    var weeks=r.weeks||{};
    var modal=document.createElement('div');
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:20px;overflow-y:auto';
    var cur=1;
    function buildInner(){
      var msg=weeks[cur]||'';
      return '<div style="background:#1e2235;border-radius:14px;padding:20px;width:420px;max-width:100%;position:relative">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">'
        +'<span style="font-size:13px;font-weight:700;flex:1">📋 ตัวอย่างข้อความ Week '+cur+'/8</span>'
        +'<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;color:var(--sub);font-size:18px;cursor:pointer;line-height:1">✕</button>'
        +'</div>'
        +'<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">'
        +[1,2,3,4,5,6,7,8].map(function(w){return '<button onclick="(function(){document.getElementById(\'_prev_content\').textContent=document.getElementById(\'_prev_modal\').dataset[\'w\'+w];document.getElementById(\'_prev_wk\').textContent=\'ตัวอย่างข้อความ Week \'+'+w+'+\'/8\';[...document.querySelectorAll(\'._pw\')].forEach(function(b){b.style.background=\'rgba(0,0,0,.3)\';b.style.color=\'var(--sub)\'});this.style.background=\'rgba(99,102,241,.3)\';this.style.color=\'#818cf8\';})()" class="_pw" style="font-size:11px;padding:3px 9px;border:1px solid var(--bd);border-radius:6px;cursor:pointer;background:'+(w===cur?'rgba(99,102,241,.3)':'rgba(0,0,0,.3)')+';color:'+(w===cur?'#818cf8':'var(--sub)')+'">W'+w+'</button>';}).join('')
        +'</div>'
        +'<div id="_prev_wk" style="display:none">ตัวอย่างข้อความ Week '+cur+'/8</div>'
        +'<pre id="_prev_content" style="white-space:pre-wrap;font-family:Sarabun,sans-serif;font-size:12.5px;line-height:1.7;color:var(--tx);background:rgba(0,0,0,.3);border-radius:10px;padding:14px;margin:0;max-height:55vh;overflow-y:auto">'+esc(msg)+'</pre>'
        +'<div style="margin-top:12px;font-size:11px;color:var(--sub);text-align:center">นี่คือข้อความที่สมาชิกได้รับทาง LINE Bot</div>'
        +'</div>';
    }
    modal.innerHTML=buildInner();
    // store all weeks as data attrs for tab switching
    var inner=modal.querySelector('div[style*="border-radius:14px"]');
    Object.keys(weeks).forEach(function(w){ modal.dataset['w'+w]=weeks[w]; });
    // wire up week buttons to use stored data
    modal.querySelectorAll('._pw').forEach(function(btn,idx){
      var w=idx+1;
      btn.onclick=function(){
        modal.querySelector('#_prev_content').textContent=weeks[w]||'';
        modal.querySelector('#_prev_wk').textContent='ตัวอย่างข้อความ Week '+w+'/8';
        modal.querySelectorAll('._pw').forEach(function(b){b.style.background='rgba(0,0,0,.3)';b.style.color='var(--sub)';});
        btn.style.background='rgba(99,102,241,.3)';btn.style.color='#818cf8';
      };
    });
    modal.addEventListener('click',function(e){if(e.target===modal)modal.remove();});
    document.body.appendChild(modal);
  });
}
function deskEnrollOnboard(name,skipConfirm){
  if(!skipConfirm&&!confirm('Re-enroll "'+name+'" ใหม่?\n(จะรีเซ็ตและส่ง Week 1 ทันที)'))return;
  gsr('enrollOnboarding',{role:S.role,memberName:name},function(r){
    if(r&&r.ok){
      toast('✅ '+(r.message||'Enrolled แล้ว'));
      loadOnboardingStatus(true);
    } else {
      var errMsg=r&&r.error?r.error:'ไม่ได้รับผล — ลองอีกครั้ง';
      toast(errMsg,'err',5000);
      // Also force-load list to show current state
      loadOnboardingStatus(true);
    }
  });
}
function deskRemoveOnboard(name){
  if(!confirm('เอา "'+name+'" ออกจาก 8-week program?\n(จะหยุดส่งข้อความทันที)'))return;
  gsr('removeOnboarding',{role:S.role,memberName:name},function(r){
    if(r&&r.ok){toast('✅ เอาออกแล้ว — หยุดส่งข้อความทันที');loadOnboardingStatus(true);}
    else toast('❌ '+(r&&r.error||'error'));
  });
}
function deskSendOnboardWeek(name, currentWeek){
  var nextWeek = Math.min(8, (currentWeek||0) + 1);
  var opts = '';
  for(var i=1;i<=8;i++) opts+='<option value="'+i+'"'+(i===nextWeek?' selected':'')+'>Week '+i+'</option>';
  var modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML='<div style="background:#1e2235;border-radius:14px;padding:20px;width:300px;max-width:90vw">'
    +'<div style="font-size:14px;font-weight:700;margin-bottom:4px">📤 ส่ง Week ตอนนี้</div>'
    +'<div style="font-size:12px;color:var(--sub);margin-bottom:12px">'+esc(name)+'</div>'
    +'<select id="_ob_week_sel" style="width:100%;padding:8px;background:#1a1a2e;color:#e2e8f0;border:1px solid var(--bd);border-radius:8px;font-size:13px;margin-bottom:12px">'+opts+'</select>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end">'
    +'<button class="bsm" onclick="this.closest(\'div[style*=fixed]\').remove()">ยกเลิก</button>'
    +'<button class="bsm" style="background:rgba(251,191,36,.2);border-color:rgba(251,191,36,.4);color:#fbbf24" onclick="(function(){var w=parseInt(document.getElementById(\'_ob_week_sel\').value);document.querySelector(\'div[style*=fixed][style*=9999]\').remove();gsr(\'sendOnboardingWeek\',{role:S.role,memberName:\''+esc(name.replace(/'/g,"\\'"))+'\',week:w},function(r){if(r&&r.ok){toast(\'✅ \'+r.message);loadOnboardingStatus(true);}else toast(\'❌ \'+(r&&r.error||\'error\'));});})()">📤 ส่งเลย</button>'
    +'</div></div>';
  document.body.appendChild(modal);
}
function deskEnrollNewOnboard(){
  var names=(D.mem||[]).map(function(m){return m.name;}).sort();
  if(!names.length){toast('❌ ยังไม่มีข้อมูลสมาชิก');return;}
  var sel=document.createElement('select');
  sel.style.cssText='width:100%;padding:8px;background:#1a1a2e;color:#e2e8f0;border:1px solid var(--bd);border-radius:8px;font-size:13px;margin-bottom:12px';
  sel.innerHTML='<option value="">-- เลือกสมาชิก --</option>'+names.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join('');
  var modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML='<div style="background:#1e2235;border-radius:14px;padding:20px;width:320px;max-width:90vw">'
    +'<div style="font-size:14px;font-weight:700;margin-bottom:12px">📋 Enroll เข้า 8-Week Program</div></div>';
  var inner=modal.querySelector('div>div');
  inner.appendChild(sel);
  var row=document.createElement('div');
  row.style.cssText='display:flex;gap:8px;justify-content:flex-end';
  var ok=document.createElement('button');ok.className='bsm';ok.textContent='✅ Enroll';ok.style.cssText='background:rgba(99,102,241,.2);border-color:rgba(99,102,241,.4);color:#818cf8';
  var cancel=document.createElement('button');cancel.className='bsm';cancel.textContent='ยกเลิก';
  ok.onclick=function(){
    var name=sel.value;if(!name)return;
    document.body.removeChild(modal);
    deskEnrollOnboard(name,true);
  };
  cancel.onclick=function(){document.body.removeChild(modal);};
  row.appendChild(cancel);row.appendChild(ok);
  inner.appendChild(row);
  document.body.appendChild(modal);
}
function loadLineMembersActivity(force){
  if(_lineMembersLoaded&&!force)return;
  document.getElementById('line-members-wrap').innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">⏳ กำลังโหลด...</div>';
  gsr('getLineMembersDetail',{role:S.role},function(r){
    _lineMembersLoaded=true;
    if(r&&r.ok&&r.list) {
      var m={}; r.list.forEach(function(i){m[i.name]=i.userId;}); D.lineMembers=m;
      _populateLineMemberSelects();
    }
    var wrap=document.getElementById('line-members-wrap');
    var cntEl=document.getElementById('line-members-count');
    if(!r||!r.ok){wrap.innerHTML='<div style="color:var(--re);padding:16px;font-size:12px">❌ '+(r&&r.error||'error')+'</div>';return;}
    var list=r.list||[];
    cntEl.textContent=list.length+' คน';
    if(!list.length){wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มีสมาชิกลงทะเบียน LINE Bot</div>';return;}
    var TEAM_C={TOOMTAM:'#3b82f6',Aof:'var(--gr)',Draft:'var(--ye)',PHAI:'#f97316',AMP:'#a855f7'};
    var rows=list.map(function(m,i){
      var tc=TEAM_C[m.team]||'var(--sub)';
      var shortId=m.userId.slice(0,8)+'…';
      var safeName=m.name.replace(/'/g,"\\'");
      var safeId=esc(m.memberId||'');
      var nickDisplay=m.nick?'<span style="font-size:10px;color:var(--sub)">('+esc(m.nick)+')</span>':'';
      var scoreDisp = m.lastScore ? '<span style="font-size:10px;font-weight:700;color:var(--sub)">'+m.lastScore+'</span>' : '<span style="font-size:10px;color:var(--bd)">—</span>';
      return '<tr>'
        +'<td style="color:var(--sub);font-size:11px;text-align:center;min-width:28px">'+(i+1)+'</td>'
        +'<td style="font-weight:600;font-size:12px">'+esc(m.name)+' '+nickDisplay+'</td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+tc+'">'+esc(m.team)+'</span></td>'
        +'<td style="text-align:center">'+scoreDisp+'</td>'
        +'<td style="font-family:monospace;font-size:10px;color:var(--sub)" title="'+esc(m.userId)+'">'+esc(shortId)+'</td>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(m.registeredAt)+'</td>'
        +'<td onclick="event.stopPropagation()" style="white-space:nowrap">'
        +(D.lineMembers&&D.lineMembers[m.name]?'<button style="font-size:10px;padding:2px 8px;background:rgba(6,199,85,.12);border:1px solid rgba(6,199,85,.3);border-radius:5px;color:#06C755;cursor:pointer;margin-right:4px" onclick="openDeskLineCompose(\''+safeName+'\',\''+(m.nick||m.name.split(' ')[0])+'\')" >📲 ส่ง</button>':'')
        +'<button style="font-size:10px;padding:2px 8px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:5px;color:var(--re);cursor:pointer" onclick="unlinkLineMemberConfirm(\''+safeId+'\',\''+safeName+'\')" title="ยกเลิกการเชื่อม LINE">🔗✕ ยกเลิก</button>'
        +'</td>'
        +'</tr>';
    }).join('');
    wrap.innerHTML='<table class="usage-log-tbl"><thead><tr>'
      +'<th style="text-align:center">#</th><th>ชื่อสมาชิก</th><th>ทีม</th><th style="text-align:center">คะแนนล่าสุด</th><th>LINE User ID</th><th>วันที่ลงทะเบียน</th><th></th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table>';
    // After loading, also refresh the link-member dropdown
    _populateLinkMemberSelect();
  });
}

function unlinkLineMemberConfirm(memberId,memberName){
  if(!confirm('ยืนยันการยกเลิกการเชื่อม LINE ของ "'+memberName+'" ?\n\nสมาชิกจะต้องเชื่อมใหม่ผ่านรหัส เชื่อม XXXX'))return;
  gsr('unlinkLineMember',{role:'mc',memberId:memberId},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'ยกเลิกไม่สำเร็จ'),'err');return;}
    toast('✅ ยกเลิกการเชื่อม LINE ของ "'+memberName+'" แล้ว','ok');
    _lineMembersLoaded=false;
    loadLineMembersActivity(true);
  });
}

// ── LINE Link Token generation ───────────────────────────────
var _linkTokenLast={memberId:'',memberName:'',token:''};
function _populateLinkMemberSelect(){
  var sel=document.getElementById('link-member-sel');
  if(!sel)return;
  var all=(D.mem||[]).filter(function(m){return!m.isArchived;}).sort(function(a,b){return(a.name||'').localeCompare(b.name||'');});
  var linked=D.lineMembers||{};
  sel.innerHTML='<option value="">— เลือกสมาชิกที่ต้องการเชื่อม LINE —</option>'
    +all.map(function(m){
      var isLinked=!!linked[m.name];
      return'<option value="'+esc(m.id||'')+'" data-name="'+esc(m.name||'')+'" '+(isLinked?'disabled style="color:var(--sub)"':'')+'>'+esc(m.name)+(m.nick?' ('+m.nick+')':'')+(isLinked?' ✅':'')+' </option>';
    }).join('');
  // Update unlinked-new-member banner (only after LINE data is loaded — D.lineMembers===undefined until then)
  var banner=document.getElementById('line-unlinked-new');
  if(banner&&D.lineMembers!==undefined){
    var unlinkedNew=all.filter(function(m){return !linked[m.name];});
    if(unlinkedNew.length){
      banner.innerHTML='<div style="background:rgba(251,191,36,0.1);border:1px solid var(--ye);border-radius:8px;padding:10px 14px;margin-bottom:12px">'
        +'<div style="font-weight:700;color:var(--ye);font-size:12px;margin-bottom:6px">⚠️ สมาชิก '+unlinkedNew.length+' คนยังไม่ได้เชื่อม LINE</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
        +unlinkedNew.slice(0,10).map(function(m){
          return'<span onclick="document.getElementById(\'link-member-sel\').value=\''+esc(m.id||'')+'\'" '
            +'style="cursor:pointer;background:var(--sf2);border:1px solid var(--bd);border-radius:4px;padding:2px 8px;font-size:11px" '
            +'title="คลิกเพื่อเลือก">'+esc(m.name||'')+'</span>';
        }).join('')
        +(unlinkedNew.length>10?'<span style="font-size:11px;color:var(--sub)">+อีก '+(unlinkedNew.length-10)+' คน</span>':'')
        +'</div></div>';
      banner.style.display='';
    }else{
      banner.innerHTML='<div style="color:var(--gr);font-size:12px;margin-bottom:8px">✅ สมาชิกทุกคนเชื่อม LINE แล้ว</div>';
      banner.style.display='';
    }
  }
}
function genLineLink(){
  var sel=document.getElementById('link-member-sel');
  var memberId=sel?sel.value:'';
  var memberName=sel?sel.options[sel.selectedIndex]?.dataset?.name||'':'';
  if(!memberId){toast('กรุณาเลือกสมาชิกก่อนครับ','err');return;}
  document.getElementById('link-token-result').style.display='none';
  document.getElementById('link-token-err').style.display='none';
  gsr('createLineLinkToken',{role:'mc',memberId:memberId,expiresInMinutes:60},function(r){
    if(!r||!r.ok){
      var errEl=document.getElementById('link-token-err');
      errEl.textContent='❌ '+(r&&r.error||'สร้างรหัสไม่สำเร็จ');
      errEl.style.display='block';
      return;
    }
    _linkTokenLast={memberId:memberId,memberName:memberName,token:r.token};
    document.getElementById('link-token-cmd').textContent=r.command||('เชื่อม '+r.token);
    var exp=r.expiresAt?new Date(r.expiresAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'';
    document.getElementById('link-token-expiry').textContent=exp?'หมดอายุ '+exp+' น. (60 นาที)':'';
    var dmBtn=document.getElementById('link-dm-btn');
    if(dmBtn)dmBtn.style.display=(D.lineMembers&&D.lineMembers[memberName])?'':'none';
    document.getElementById('link-token-result').style.display='block';
    document.getElementById('link-token-err').style.display='none';
  });
}
function copyLinkToken(){
  var cmd=document.getElementById('link-token-cmd');
  if(!cmd)return;
  if(navigator.clipboard){navigator.clipboard.writeText(cmd.textContent).then(function(){toast('Copy แล้ว!','ok');});}
  else{
    var t=document.createElement('textarea');t.value=cmd.textContent;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);toast('Copy แล้ว!','ok');
  }
}
function sendLinkViaDM(){
  var n=_linkTokenLast.memberName;
  var cmd=document.getElementById('link-token-cmd')?.textContent||'';
  if(!n||!cmd)return;
  openDeskLineCompose(n.replace(/'/g,"\\'"),n.split(' ')[0],cmd);
}

function renderUsageLog(){
  if(!_usageData)return;
  var filterTeam=(document.getElementById('usage-filter-team').value||'').toLowerCase();
  var filterDays=parseInt(document.getElementById('usage-filter-days').value)||30;
  var logs=(_usageData.logs||[]).filter(function(l){
    if(filterTeam&&l.team.toLowerCase()!==filterTeam)return false;
    if(l.daysAgo>filterDays)return false;
    return true;
  });

  // Team summary cards
  var statsEl=document.getElementById('usage-teams');
  var ts=_usageData.teamStats||{};
  var teamCards=MENTOR_TEAMS.map(function(team){
    var s=ts[team]||{count7:0,count30:0,lastDate:'ยังไม่มีข้อมูล',daysAgoLast:999,lastPlatform:''};
    var dago=s.daysAgoLast;
    var clr=dago<=7?'var(--gr)':dago<=14?'var(--ye)':'var(--re)';
    var badge=dago<=7?'🟢 ใช้งานสัปดาห์นี้':dago<=14?'🟡 >1 สัปดาห์':'🔴 >2 สัปดาห์';
    if(dago===999){clr='var(--gy)';badge='⚪ ยังไม่เคย login';}
    var platIco=s.lastPlatform==='desktop'?'🖥️':'📱';
    return '<div class="usage-team-card" style="--usage-c:'+clr+'">'+
      '<div class="utc-team">'+esc(team)+'</div>'+
      '<div class="utc-last">'+platIco+' ล่าสุด: '+esc(s.lastDate||'—')+'</div>'+
      '<div class="utc-stats">'+
        '<div class="utc-stat"><div class="utc-stat-v" style="color:var(--ac)">'+s.count7+'</div><div class="utc-stat-l">7 วัน</div></div>'+
        '<div class="utc-stat"><div class="utc-stat-v" style="color:var(--sub)">'+s.count30+'</div><div class="utc-stat-l">30 วัน</div></div>'+
      '</div>'+
      '<span class="utc-badge" style="background:'+clr+'22;color:'+clr+';border:1px solid '+clr+'44">'+badge+'</span>'+
    '</div>';
  }).join('');
  // MC + Growth summary
  ['mc','growth'].forEach(function(r){
    var s=ts[r]||{count7:0,count30:0,lastDate:'—',daysAgoLast:999,lastPlatform:''};
    var label={mc:'MC (ตูมตาม)',growth:'Growth Coordinator'}[r]||r;
    var clr=s.daysAgoLast<=7?'var(--gr)':s.daysAgoLast<=14?'var(--ye)':'var(--gy)';
    var platIco=s.lastPlatform==='desktop'?'🖥️':'📱';
    teamCards+='<div class="usage-team-card" style="--usage-c:'+clr+';opacity:.85">'+
      '<div class="utc-team">'+esc(label)+'</div>'+
      '<div class="utc-last">'+platIco+' ล่าสุด: '+esc(s.lastDate||'—')+'</div>'+
      '<div class="utc-stats">'+
        '<div class="utc-stat"><div class="utc-stat-v" style="color:var(--ac)">'+s.count7+'</div><div class="utc-stat-l">7 วัน</div></div>'+
        '<div class="utc-stat"><div class="utc-stat-v" style="color:var(--sub)">'+s.count30+'</div><div class="utc-stat-l">30 วัน</div></div>'+
      '</div></div>';
  });
  statsEl.innerHTML='<div class="usage-team-grid">'+teamCards+'</div>';

  // Log table
  document.getElementById('usage-count').textContent=logs.length+' รายการ';
  if(!logs.length){
    document.getElementById('usage-log-wrap').innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:24px">🗂️ ไม่มีข้อมูลในช่วงที่เลือก</div>';
    return;
  }
  var PLAT_ICON={desktop:'🖥️',mobile:'📱'};
  var ROLE_COLOR={mc:'var(--ac)',toomtam:'var(--gr)',aof:'var(--gr)',draft:'var(--gr)',phai:'var(--gr)',amp:'var(--gr)',growth:'#8B6A2E'};
  var rows=logs.map(function(l){
    var platIco=PLAT_ICON[l.platform]||'📱';
    var rc=ROLE_COLOR[l.role]||'var(--sub)';
    var dAgo=l.daysAgo===0?'วันนี้':l.daysAgo===1?'เมื่อวาน':l.daysAgo+'วันที่แล้ว';
    return '<tr>'
      +'<td style="color:var(--sub);font-size:10px;white-space:nowrap">'+esc(l.date)+' <span style="color:var(--ac)">'+esc(l.day)+'</span></td>'
      +'<td style="font-weight:600;white-space:nowrap">'+esc(l.time)+'</td>'
      +'<td><span style="font-weight:700;color:'+rc+'">'+esc(l.team||l.role)+'</span></td>'
      +'<td><span class="usage-plat">'+platIco+' '+esc(l.platform||'—')+'</span></td>'
      +'<td style="font-size:11px;color:var(--sub)">'+esc(l.action)+'</td>'
      +'<td style="font-size:11px;color:var(--sub)">'+esc(dAgo)+'</td>'
      +'</tr>';
  }).join('');
  document.getElementById('usage-log-wrap').innerHTML=
    '<table class="usage-log-tbl"><thead><tr>'+
    '<th>วันที่</th><th>เวลา</th><th>ทีม / Role</th><th>Platform</th><th>Action</th><th>นานแค่ไหน</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table>';
}

// ── Add New Member ─────────────────────────────────────────────
// ป้องกัน modal หลายตัว open พร้อมกัน
function closeAllModals(){
  ['rd-modal','ml-modal','nm-modal','gsh-modal','bk-modal','sync-modal','w8-del-modal','vis-add-modal'].forEach(function(id){
    var el=document.getElementById(id);
    if(!el) return;
    el.classList.remove('open');
    if(el.style.display==='flex') el.style.display='none';
  });
}
function nmOpen(){
  closeAllModals();
  var el=document.getElementById('nm-modal');if(!el)return;
  var today=new Date();
  var y=today.getFullYear(),m=String(today.getMonth()+1).padStart(2,'0'),d=String(today.getDate()).padStart(2,'0');
  document.getElementById('nm-d-date').value=y+'-'+m+'-'+d;
  ['nm-d-name','nm-d-nick','nm-d-biz','nm-d-email','nm-d-phone'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('nm-d-mentor').value='';
  var res=document.getElementById('nm-result');res.style.display='none';res.innerHTML='';
  var btn=document.getElementById('nm-d-save');btn.disabled=false;btn.textContent='✅ สร้างและเพิ่มสมาชิก';
  el.classList.add('open');
}
function nmClose(){document.getElementById('nm-modal').classList.remove('open');}
function nmSave(){
  var name=document.getElementById('nm-d-name').value.trim();
  var nick=document.getElementById('nm-d-nick').value.trim();
  var biz =document.getElementById('nm-d-biz').value.trim();
  var mentor=document.getElementById('nm-d-mentor').value;
  var date=document.getElementById('nm-d-date').value;
  var email=document.getElementById('nm-d-email').value.trim();
  var phone=document.getElementById('nm-d-phone').value.trim();
  if(!name||!nick||!mentor||!date){toast('❌ กรุณากรอกข้อมูลที่มี * ให้ครบ','err');return;}
  var btn=document.getElementById('nm-d-save');
  if(btn.disabled)return;
  btn.disabled=true;btn.textContent='⏳ กำลังเพิ่มสมาชิก...';
  var res=document.getElementById('nm-result');res.style.display='none';
  gsr('addNewMember',{role:'mc',name:name,nick:nick,business:biz,mentorTeam:mentor,joinDate:date,email:email,phone:phone},function(r){
    btn.disabled=false;btn.textContent='✅ สร้างและเพิ่มสมาชิก';
    if(!r||!r.ok){
      res.style.display='block';res.style.color='var(--re)';
      res.innerHTML='❌ '+(r&&r.error||'เกิดข้อผิดพลาด — ตรวจสอบ NM_TEMPLATE_ID ใน Script');
      return;
    }
    // แสดงผลสำเร็จ
    res.style.display='block';res.style.color='var(--gr)';
    res.innerHTML='✅ เพิ่ม <strong>'+esc(r.name)+'</strong> เข้าระบบแล้ว!'
      +'<div style="font-size:11px;margin-top:6px;display:flex;flex-direction:column;gap:3px;color:var(--sub)">'
      +(r.joinedDate?'<span>🗓️ วันเข้า BNI: '+esc(r.joinedDate)+'</span>':'')
      +(r.w8Date?'<span>⏰ ครบ 8W: '+esc(r.w8Date)+'</span>':'')
      +(r.expiryDate?'<span>💳 Renewal: '+esc(r.expiryDate)+'</span>':'')
      +'<span>📋 8W Checklist: พร้อมใช้งาน (0/41 ข้อ)</span>'
      +'</div>'
      +(r.warnings&&r.warnings.length?'<br><span style="color:var(--ye)">⚠️ '+r.warnings.join(' | ')+'</span>':'');
    // Reload dashboard data
    toast('✅ เพิ่ม '+r.name+' แล้ว — กำลังโหลดข้อมูลใหม่...','ok');
    setTimeout(function(){
      nmClose();
      // Trigger full reload
      gsr('getDesktopDashboard',{role:'mc'},function(r2){
        if(r2.ok){D.mem=r2.members;D.sm=r2.summary;D.teams=r2.teams;D.ren=r2.renewal||[];}
        renderMCAll();_populateLinkMemberSelect();
        _8wLoaded=false;load8WProgress();
      });
    },2000);
  });
}

function toggleMTCard(id){
  var body=document.getElementById(id+'-body');
  var arr=document.getElementById(id+'-arr');
  if(!body)return;
  var open=body.classList.toggle('open');
  if(arr)arr.classList.toggle('open',open);
}

function calcRenRisk(r){
  var mem=(D.mem||[]).find(function(m){return m.name===r.name;});
  if(!mem||mem.bniTl==='none')return{level:'unknown',label:'ไม่มีข้อมูล',color:'var(--sub)',icon:'⚪'};
  var sc=mem.bniScore||0;
  var sh=(mem.scoreHistory||[]).filter(function(s){return s&&s.score>0;}).slice().sort(function(a,b){return(a.year*100+a.month)-(b.year*100+b.month);});
  var trend=0;
  if(sh.length>=2){var diff=sh[sh.length-1].score-sh[sh.length-2].score;trend=diff>3?1:diff<-3?-1:0;}
  var days=r.diffDays;
  if(sc<50&&trend<=0&&days<=45)return{level:'high',label:'🔴 HIGH RISK',color:'var(--re)',icon:'🔴',score:sc,trend:trend};
  if(sc<70||(trend<0&&days<=60))return{level:'med',label:'🟡 MEDIUM',color:'var(--ye)',icon:'🟡',score:sc,trend:trend};
  return{level:'low',label:'🟢 LOW RISK',color:'var(--gr)',icon:'🟢',score:sc,trend:trend};
}

function renderRen(){
  document.getElementById('renn').textContent=D.ren.length;
  document.getElementById('reng').innerHTML=D.ren.length?D.ren.map(function(r){
    var icon=r.diffDays<0?'🚨':r.diffDays<=30?'🔴':r.diffDays<=60?'🟠':'📅';
    var txt=r.diffDays<0?'เกิน '+Math.abs(r.diffDays)+' วัน':r.diffDays===0?'วันนี้!':'อีก '+r.diffDays+' วัน';
    var wf=renewalStatusMeta(r.workflowStatus);
    var safeName=encodeURIComponent(String(r.name||'')).replace(/'/g,'%27');
    var risk=calcRenRisk(r);
    var trendStr=risk.trend===1?' ↑':risk.trend===-1?' ↓':'';
    var riskBadge='<span style="font-size:10px;background:rgba(0,0,0,.25);border-radius:5px;padding:2px 7px;color:'+risk.color+';font-weight:700;white-space:nowrap">'+risk.label+(risk.score!=null?' · '+risk.score+'pt'+trendStr:'')+'</span>';
    return'<div class="ac2 '+r.status+'"><div style="font-size:19px">'+icon+'</div>'+
      '<div class="ai"><div class="an">'+esc(r.name)+'</div><div class="at">'+esc(r.team)+'</div>'+
      '<div style="font-size:10px;color:var(--gy)">หมดอายุ: '+esc(r.expStr)+'</div>'+
      '<div style="font-size:10px;color:'+wf.color+';margin-top:2px">'+wf.label+(r.declineReason?' · '+esc(r.declineReason):'')+'</div>'+
      '<div style="margin-top:4px">'+riskBadge+'</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">'+
      '<div class="ad '+(r.diffDays<0?'dl-':r.diffDays<=30?'ds-':'dn-')+'">'+txt+'</div>'+
      '<button class="bx" onclick="openRenewalFlow(\''+safeName+'\',\''+esc(r.workflowStatus||'pending_contact')+'\',\'mc\')" style="font-size:11px">'+wf.action+'</button>'+
      '</div></div>';
  }).join(''):'<div class="es">ไม่มีรายการ ✅</div>';
}

function renewalStatusMeta(status){
  var map={
    pending_contact:{label:'ยังไม่ได้แจ้งสมาชิก',action:'แจ้งแล้ว?',color:'#fbbf24'},
    contacted:{label:'แจ้งสมาชิกแล้ว · รอคำตอบ',action:'บันทึกคำตอบ',color:'#60a5fa'},
    confirmed_renew:{label:'ยืนยันต่ออายุ · รอชำระ',action:'ชำระแล้ว?',color:'#34d399'},
    paid:{label:'ชำระแล้ว · รอดำเนินการ',action:'ต่อเรียบร้อย?',color:'var(--gr)'},
    completed:{label:'ต่ออายุเรียบร้อย',action:'เสร็จแล้ว',color:'var(--gr)'},
    declined:{label:'แจ้งไม่ต่ออายุ',action:'ดู/แก้สถานะ',color:'var(--re)'}
  };
  return map[status]||map.pending_contact;
}

function openRenewalFlow(encodedName,status,source){
  var name=decodeURIComponent(encodedName);
  var meta=renewalStatusMeta(status);
  var modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
  var buttons='';
  if(status==='pending_contact')buttons='<button class="bsend" data-st="contacted">✓ แจ้งสมาชิกแล้ว</button>';
  else if(status==='contacted')buttons='<button class="bsend" data-st="confirmed_renew">✓ สมาชิกยืนยันต่อ</button><button class="bsm" data-st="declined" style="color:var(--re);border-color:rgba(248,113,113,.4)">✕ ไม่ต่ออายุ</button>';
  else if(status==='confirmed_renew')buttons='<button class="bsend" data-st="paid">✓ ชำระเงินแล้ว</button>';
  else if(status==='paid')buttons='<button class="bsend" data-st="completed">✓ ต่ออายุเรียบร้อย</button>';
  else if(status==='declined')buttons='<button class="bsm" data-st="pending_contact">↺ เปิดติดตามใหม่</button>';
  modal.innerHTML='<div style="width:100%;max-width:440px;background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:20px">'+
    '<div style="font-size:15px;font-weight:800;margin-bottom:4px">Renewal · '+esc(name)+'</div>'+
    '<div style="font-size:12px;color:'+meta.color+';margin-bottom:16px">'+meta.label+'</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+buttons+'<button class="bsm" data-close>ปิด</button></div></div>';
  modal.onclick=function(e){if(e.target===modal||e.target.hasAttribute('data-close'))modal.remove();};
  modal.querySelectorAll('[data-st]').forEach(function(btn){
    btn.onclick=function(){
      var next=btn.getAttribute('data-st');
      var reason='';
      if(next==='declined'){
        reason=prompt('กรุณาระบุเหตุผลที่สมาชิกไม่ต่ออายุ');
        if(!reason||!reason.trim())return;
      }
      btn.disabled=true;btn.textContent='กำลังบันทึก...';
      gsr('updateRenewalStatus',{role:S.role,memberName:name,status:next,reason:reason},function(r){
        if(!r||!r.ok){btn.disabled=false;btn.textContent='ลองใหม่';toast('❌ '+(r&&r.error||'บันทึกไม่สำเร็จ'));return;}
        modal.remove();toast('✓ อัปเดต Renewal แล้ว');
        if(source==='growth')loadGrowthRenewals(); else loadMC(true);
        if(next==='contacted'||next==='confirmed_renew'||next==='paid'){
          setTimeout(function(){openRenewalFlow(encodeURIComponent(name),next,source);},250);
        }
      });
    };
  });
  document.body.appendChild(modal);
}

function loadGrowthRenewals(){
  var el=document.getElementById('gr-ren-list');if(!el)return;
  el.innerHTML='<div class="es">กำลังโหลด...</div>';
  gsr('getRenewal',{},function(r){
    var items=r&&r.ok?(r.items||[]):[];
    var declined=items.filter(function(x){return x.workflowStatus==='declined';});
    var active=items.filter(function(x){return x.workflowStatus!=='declined';});
    document.getElementById('gr-ren-count').textContent=items.length;
    badge('badge-gr-ren',declined.length);
    function row(x){
      var wf=renewalStatusMeta(x.workflowStatus);
      return '<div class="ac2 '+(x.workflowStatus==='declined'?'risk':x.status)+'">'+
        '<div style="font-size:19px">'+(x.workflowStatus==='declined'?'⛔':'📅')+'</div>'+
        '<div class="ai"><div class="an">'+esc(x.name)+'</div><div class="at">'+esc(x.team||'ไม่มีทีม')+' · '+esc(x.expStr||'')+'</div>'+
        '<div style="font-size:10px;color:'+wf.color+';margin-top:3px">'+wf.label+(x.declineReason?' · เหตุผล: '+esc(x.declineReason):'')+'</div></div>'+
        '<span class="bx" style="font-size:11px;cursor:default;opacity:.75">View only</span></div>';
    }
    var html='';
    if(declined.length)html+='<div class="sh" style="color:var(--re);margin-top:0"><h2>⛔ ไม่ต่ออายุ</h2><span class="ctag">'+declined.length+'</span></div>'+declined.map(row).join('');
    if(active.length)html+='<div class="sh" style="margin-top:16px"><h2>📅 กำลังติดตาม</h2><span class="ctag">'+active.length+'</span></div>'+active.map(row).join('');
    el.innerHTML=html||'<div class="es">ไม่มีรายการ Renewal</div>';
  });
}

function renderRisk(){
  var rt=riskThresh.absent||4,rs=riskThresh.score||30;
  var list=D.mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);}).sort(function(a,b){return a.bniScore-b.bniScore;});
  document.getElementById('riskn').textContent=list.length;
  document.getElementById('mc-risk-ov-n').textContent=list.length;
  var html=list.length?list.map(function(m){
    var tags=[];
    if(m.absent>=rt)tags.push('ขาด '+m.absent+'ครั้ง');
    if(m.bniTl!=='none'&&m.bniScore<rs)tags.push('BNI '+m.bniScore+' pt');
    return'<div class="ac2 risk"><div style="font-size:19px">⚠️</div>'+
      '<div class="ai"><div class="an">'+esc(m.name)+'<span class="badge b-'+tlK(m.bniTl)+'" style="margin-left:5px;font-size:9px">'+tlL(m.bniTl)+'</span></div>'+
      '<div class="at">'+esc(m.mentor||'ไม่มีทีม')+'</div>'+
      '<div>'+tags.map(function(t){return'<span class="rtag">'+t+'</span>';}).join('')+'</div></div></div>';
  }).join(''):'<div class="es">ไม่มีสมาชิกในกลุ่ม Risk ✅</div>';
  document.getElementById('riskg').innerHTML=html;
  document.getElementById('mc-risk-ov').innerHTML=html;
}

// ── Messages ──────────────────────────────────────
function msgTeamKey(v){return String(v||'').trim().toLowerCase();}
function msgMemberPool(){
  var byName={};
  (D.mem||[]).forEach(function(m){
    var name=String(m.name||'').trim(); if(!name)return;
    byName[name]={name:name,display:(m.nick||m.nickname?((m.nick||m.nickname)+' — '+name):name),mentor:m.mentor||m.team||m.mentorTeam||m.mentor_team||'',row:m.row||0};
  });
  (memCache||[]).forEach(function(m){
    var name=String(m.name||'').trim(); if(!name)return;
    var nick=String(m.nickname||m.nick||'').trim();
    byName[name]=Object.assign(byName[name]||{},{
      name:name,
      display:m.display||(nick?(nick+' — '+name):name),
      mentor:m.mentor||m.team||m.mentorTeam||m.mentor_team||((byName[name]||{}).mentor||''),
      row:m.row||((byName[name]||{}).row||0)
    });
  });
  return Object.keys(byName).map(function(k){return byName[k];}).sort(function(a,b){return String(a.display||a.name).localeCompare(String(b.display||b.name),'th');});
}
function refreshMsgTeams(){
  var sel=document.getElementById('msgTeam'); if(!sel)return;
  var current=sel.value;
  var teams=['TOOMTAM','Aof','Draft','PHAI','AMP'];
  msgMemberPool().forEach(function(m){var t=String(m.mentor||'').trim();if(t&&!teams.some(function(x){return msgTeamKey(x)===msgTeamKey(t);})){teams.push(t);}});
  sel.innerHTML='<option value="">เลือกทีม</option>'+teams.map(function(t){return'<option>'+esc(t)+'</option>';}).join('');
  if(current)sel.value=current;
}
function loadMsgMem(){
  refreshMsgTeams();
  var tm=document.getElementById('msgTeam').value;
  var sel=document.getElementById('msgMem');
  sel.innerHTML='<option value="">เลือกสมาชิก</option>';
  var list=msgMemberPool().filter(function(m){return!tm||msgTeamKey(m.mentor)===msgTeamKey(tm);});
  list.forEach(function(m){
    sel.innerHTML+='<option value="'+esc(m.name)+'" data-team="'+esc(m.mentor)+'" data-row="'+esc(m.row||'')+'">'+esc(m.display||m.name)+'</option>';
  });
  if(tm&&!list.length){sel.innerHTML+='<option value="" disabled>ไม่พบสมาชิกในทีมนี้ — ลอง Refresh หรือ Sync ข้อมูล</option>';}
}
function sendMsg(){
  var tm=document.getElementById('msgTeam').value;
  var mn=document.getElementById('msgMem').value;
  var msg=document.getElementById('msgTxt').value.trim();
  var res=document.getElementById('msgRes');
  if(!tm||!mn||!msg){res.style.color='var(--re)';res.textContent='กรุณาเลือกทีม สมาชิก และใส่ข้อความ';return;}
  document.getElementById('bsnd').disabled=true;
  res.style.color='var(--sub)';res.textContent='กำลังส่ง...';
  var selected=document.getElementById('msgMem').selectedOptions[0];
  var cachedRow=selected?parseInt(selected.getAttribute('data-row')||'0',10):0;
  if(cachedRow){
    gsr('saveMCMessage',{role:'mc',teamName:tm,row:cachedRow,message:msg},function(r2){
      document.getElementById('bsnd').disabled=false;
      if(r2.ok){res.style.color='var(--gr)';res.textContent='✓ ส่งแล้ว';document.getElementById('msgTxt').value='';
        gsr('getMessages',{role:'mc'},function(r3){if(r3.ok){D.msgs=r3.messages||[];renderMsgs();}});
      }else{res.style.color='var(--re)';res.textContent='ผิดพลาด: '+(r2.error||'');}
    });
    return;
  }
  gsr('getMyTeam',{role:S.role,teamName:tm},function(r){
    var row=0;
    if(r.ok&&r.members)r.members.forEach(function(m,i){if(m.name===mn)row=i+4;});
    if(!row){document.getElementById('bsnd').disabled=false;res.style.color='var(--re)';res.textContent='ไม่พบ row ของสมาชิก';return;}
    gsr('saveMCMessage',{role:'mc',teamName:tm,row:row,message:msg},function(r2){
      document.getElementById('bsnd').disabled=false;
      if(r2.ok){res.style.color='var(--gr)';res.textContent='✓ ส่งแล้ว';document.getElementById('msgTxt').value='';
        gsr('getMessages',{role:'mc'},function(r3){if(r3.ok){D.msgs=r3.messages||[];renderMsgs();}});
      }else{res.style.color='var(--re)';res.textContent='ผิดพลาด: '+(r2.error||'');}
    });
  });
}
var _readMsgs=(function(){try{return JSON.parse(localStorage.getItem('bni_readmsgs')||'{}');}catch(e){return{};}})();
var _showReadMsgs=false;
function _msgKey(m){return m.id||m.key||m.team+'|'+m.name;}
function markMsgRead(i){var m=D.msgs[i];if(!m)return;var k=_msgKey(m);_readMsgs[k]=1;try{localStorage.setItem('bni_readmsgs',JSON.stringify(_readMsgs));}catch(e){}gsr('setMsgRead',{role:'mc',key:k},function(){});renderMsgs();updateBadges();}
function toggleShowRead(){_showReadMsgs=!_showReadMsgs;renderMsgs();}
function renderMsgs(){
  var msgs=D.msgs;
  var unread=msgs.filter(function(m){return!_readMsgs[_msgKey(m)];});
  var shown=_showReadMsgs?msgs:unread;
  document.getElementById('msgn').textContent=unread.length+(unread.length<msgs.length?' (+'+(msgs.length-unread.length)+' อ่านแล้ว)':'');
  var toggleBtn='<button class="bsm" onclick="toggleShowRead()" style="font-size:11px;margin-bottom:10px">'+(
    _showReadMsgs?'🙈 ซ่อนที่อ่านแล้ว':'👁️ แสดงที่อ่านแล้ว ('+( msgs.length-unread.length)+')'
  )+'</button>';
  document.getElementById('msgl').innerHTML=(msgs.length>unread.length?toggleBtn:'')+
  (shown.length?shown.map(function(m,i){
    var isRead=!!_readMsgs[_msgKey(m)];
    var realIdx=D.msgs.indexOf(m);
    return'<div class="mc3" style="'+(isRead?'opacity:.5;':'')+'">'+
      '<div class="mh">'+
        (isRead?'<span style="font-size:10px;color:var(--gr)">✓ อ่านแล้ว</span> ':'')+
        '<span style="font-weight:600">'+esc(m.name)+'</span>'+(m.nick?'<span style="font-size:11px;color:var(--sub)">('+esc(m.nick)+')</span>':'')+
        '<span class="badge b-pu" style="font-size:10px">'+esc(m.team)+'</span>'+
      '</div>'+
      '<div class="mb2">'+esc(m.msg)+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap">'+
        (!isRead?'<button class="bx pr" onclick="markMsgRead('+realIdx+')">✓ อ่านแล้ว</button>':'')+
        '<button class="bx" onclick="toggleEdit('+realIdx+')">✏️ แก้ไข</button>'+
        '<button class="bx da" onclick="delMsg('+realIdx+',\''+esc(m.id||'')+'\')">🗑️ ลบ</button>'+
      '</div>'+
      '<div class="mea" id="mea'+realIdx+'">'+
        '<textarea id="meatxt'+realIdx+'" rows="2">'+esc(m.msg)+'</textarea>'+
        '<div style="display:flex;gap:5px;margin-top:5px">'+
          '<button class="bx pr" onclick="saveEdit('+realIdx+',\''+esc(m.id||'')+'\')">บันทึก</button>'+
          '<button class="bx" onclick="toggleEdit('+realIdx+')">ยกเลิก</button>'+
        '</div></div></div>';
  }).join(''):'<div class="es">ไม่มีข้อความ'+(! _showReadMsgs&&msgs.length>0?' — <span onclick="toggleShowRead()" style="cursor:pointer;text-decoration:underline;color:var(--ac)">แสดงที่อ่านแล้ว</span>':'')+'</div>');
}
function toggleEdit(i){var el=document.getElementById('mea'+i);el.style.display=el.style.display==='block'?'none':'block';}
function saveEdit(i,id){var v=document.getElementById('meatxt'+i).value.trim();if(!v)return;gsr('updateMCMessage',{role:'mc',id:id,message:v},function(r){if(r.ok){gsr('getMessages',{role:'mc'},function(r2){if(r2.ok){D.msgs=r2.messages||[];renderMsgs();}});}else alert('ผิดพลาด: '+(r.error||''));});}
function delMsg(i,id){if(!confirm('ลบข้อความนี้?'))return;gsr('deleteMCMessage',{role:'mc',id:id},function(r){if(r.ok){gsr('getMessages',{role:'mc'},function(r2){if(r2.ok){D.msgs=r2.messages||[];renderMsgs();}});}else alert('ผิดพลาด: '+(r.error||''));});}

// ── Reports ──────────────────────────────────────
function repIsOpen(r){var s=(r&&r.status)||'';return !s||s==='open'||s==='reopened';}
function srf(s,el){rff=s;document.querySelectorAll('.sp2').forEach(function(b){b.classList.remove('on');});el.classList.add('on');renderRep();}
function bulkCloseRep(){
  var pending=D.reps.filter(function(r){return repIsOpen(r);});
  if(!pending.length){toast('ไม่มี Report ที่รอดำเนินการ','ok');return;}
  if(!confirm('ปิดเคส '+pending.length+' รายการ?'))return;
  var done2=0;
  pending.forEach(function(r){
    gsr('setReportStatus',{role:'mc',teamName:r.team,row:r.row,status:'done'},function(){
      done2++;
      if(done2===pending.length){gsr('getReports',{role:'mc'},function(r2){if(r2.ok){D.reps=r2.reports||[];renderRep();updateBadges();}});}
    });
  });
}
function renderRep(){
  var tf=document.getElementById('rtf').value;
  var sq=(document.getElementById('rts').value||'').trim().toLowerCase();
  var list=D.reps.filter(function(r){
    if(tf&&r.team!==tf)return false;
    if(sq&&(r.memberName||'').toLowerCase().indexOf(sq)<0&&(r.nick||'').toLowerCase().indexOf(sq)<0)return false;
    var st=r.status||'';
    if(rff==='all')return true;
    if(rff==='pending')return repIsOpen(r);
    return st===rff;
  });
  document.getElementById('repn').textContent=list.length;
  document.getElementById('repl').innerHTML=list.length?list.map(function(r,i){
    var st=r.status||'';var stl=st==='done'?'✅ ปิด':st==='reopened'?'🔄 Reopen':'🔴 รอ';
    var stc=st==='done'?'b-gr':st==='reopened'?'b-ye':'b-re';
    return'<div class="rc '+(st||'pending')+'">'+
      '<div class="rt"><span class="rn">'+esc(r.memberName)+'</span>'+(r.nick?'<span style="font-size:11px;color:var(--sub)">('+esc(r.nick)+')</span>':'')+
        '<span class="badge b-pu">'+esc(r.team)+'</span><span class="badge '+stc+'">'+stl+'</span>'+
        '<span style="font-size:10px;color:var(--gy);margin-left:auto">'+esc(r.savedAt||'')+'</span></div>'+
      '<div class="rf">'+
        '<div><label>Core Issue</label><p>'+esc(r.coreIssue||'—')+'</p></div>'+
        '<div><label>Action Taken</label><p>'+esc(r.actionTaken||'—')+'</p></div>'+
        '<div><label>Plan</label><p>'+esc(r.plan||'—')+'</p></div>'+
      '</div>'+
      (r.reply?'<div class="rre"><div style="font-size:9px;color:var(--ac2);font-weight:600;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">💬 MC Reply</div>'+esc(r.reply)+'</div>':'')+
      '<div class="ra">'+
        (st!=='done'?'<button class="bx pr" onclick="repDone(\''+esc(r.team)+'\',\''+esc(r.row)+'\','+i+')">✅ ปิดเคส</button>':'')+
        (st==='done'?'<button class="bx" onclick="repReopen(\''+esc(r.team)+'\',\''+esc(r.row)+'\','+i+')">🔄 Reopen</button>':'')+
        '<button class="bx" onclick="togRepR('+i+')">💬 ตอบกลับ</button>'+
      '</div>'+
      '<div class="rrf" id="rrf'+i+'">'+
        '<textarea id="rrftxt'+i+'" placeholder="พิมพ์ข้อความตอบกลับ..."></textarea>'+
        '<div style="display:flex;gap:6px">'+
          '<button class="bx pr" onclick="sendRepR(\''+esc(r.team)+'\',\''+esc(r.row)+'\','+i+',\''+esc(r.memberName)+'\')">ส่ง</button>'+
          '<button class="bx" onclick="togRepR('+i+')">ยกเลิก</button>'+
        '</div></div></div>';
  }).join(''):'<div class="es">ไม่มี Report ในกลุ่มนี้</div>';
}
function repDone(tm,row,i){gsr('setReportStatus',{role:'mc',teamName:tm,row:row,status:'done'},function(r){if(r.ok){gsr('getReports',{role:'mc'},function(r2){if(r2.ok){D.reps=r2.reports||[];renderRep();updateBadges();}});}else alert('ผิดพลาด: '+(r.error||''));});}
function repReopen(tm,row,i){gsr('setReportStatus',{role:'mc',teamName:tm,row:row,status:'reopened'},function(r){if(r.ok){gsr('getReports',{role:'mc'},function(r2){if(r2.ok){D.reps=r2.reports||[];renderRep();updateBadges();}});}else alert('ผิดพลาด: '+(r.error||''));});}
function togRepR(i){var el=document.getElementById('rrf'+i);el.style.display=el.style.display==='block'?'none':'block';if(el.style.display==='block')document.getElementById('rrftxt'+i).focus();}
function sendRepR(tm,row,i,mn){var txt=document.getElementById('rrftxt'+i).value.trim();if(!txt)return;gsr('saveReply',{role:'mc',teamName:tm,row:row,memberName:mn,reply:txt},function(r){if(r.ok){togRepR(i);gsr('getReports',{role:'mc'},function(r2){if(r2.ok){D.reps=r2.reports||[];renderRep();updateBadges();}});}else alert('ผิดพลาด: '+(r.error||''));});}

// ════ SCORECARD ═══════════════════════════════════
var _scLoaded=false;
var _scData=null;
function loadDesktopScorecard(){
  if(_scLoaded)return;
  _scLoaded=true;
  var el=document.getElementById('mc-sc-body');
  el.innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:30px">⏳ กำลังโหลด...</div>';
  gsr('getScorecard',{role:'mc'},function(r){
    if(!r.ok){el.innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';_scLoaded=false;return;}
    _scData=r;
    var sumBtn=document.getElementById('btn-lt-summary');
    if(sumBtn)sumBtn.style.display='';
    var exportBtn=document.getElementById('btn-sc-export');
    if(exportBtn)exportBtn.style.display='';
    var mv=r.movement,html='';
    function gcol2(g){
      if(g==='A+'||g==='A')return{bg:'rgba(52,211,153,.12)',c:'var(--gr)'};
      if(g==='B+')return{bg:'rgba(96,165,250,.12)',c:'#60a5fa'};
      if(g==='B')return{bg:'rgba(255,193,77,.12)',c:'var(--ye)'};
      return{bg:'rgba(248,113,113,.12)',c:'var(--re)'};
    }
    // [1] Movement bar
    html+='<div class="mc3" style="margin-bottom:10px">'
      +'<div style="font-size:12px;font-weight:700;color:var(--sub);margin-bottom:10px">📊 '+r.prevMonth+' → '+r.thisMonth+' · Movement ('+mv.total+' คน)</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<div class="kcard" style="flex:1;min-width:80px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--gr)">'+mv.up+'</div><div style="font-size:10px;color:var(--sub)">↑ ขึ้น</div></div>'
      +'<div class="kcard" style="flex:1;min-width:80px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--sub)">'+mv.same+'</div><div style="font-size:10px;color:var(--sub)">→ คงที่</div></div>'
      +'<div class="kcard" style="flex:1;min-width:80px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--re)">'+mv.down+'</div><div style="font-size:10px;color:var(--sub)">↓ ลด</div></div>'
      +'<div class="kcard" style="flex:1;min-width:80px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--ac)">'+(mv.zoneUp.length+mv.zoneDn.length)+'</div><div style="font-size:10px;color:var(--sub)">⚡ เปลี่ยนโซน</div></div>'
      +'</div></div>';
    // [2] Zone changes
    if(mv.zoneUp.length||mv.zoneDn.length){
      html+='<div class="mc3" style="margin-bottom:10px"><div style="font-size:12px;font-weight:700;margin-bottom:10px">⚡ เปลี่ยน Zone เดือนนี้</div>'
        +'<div style="display:flex;gap:12px;flex-wrap:wrap">';
      if(mv.zoneUp.length){
        html+='<div style="flex:1;min-width:160px"><div style="font-size:10px;font-weight:700;color:var(--gr);margin-bottom:6px">🏆 เลื่อนขึ้น</div>';
        mv.zoneUp.forEach(function(m){
          html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:rgba(52,211,153,.08);border-radius:6px;margin-bottom:4px">'
            +'<span style="font-weight:600">'+esc(m.nick)+'</span><span style="font-size:11px;color:var(--sub)">'+esc(m.from)+'→'+esc(m.to)+'</span>'
            +'<span style="color:var(--gr);font-weight:700">+'+m.diff+'</span></div>';
        });
        html+='</div>';
      }
      if(mv.zoneDn.length){
        html+='<div style="flex:1;min-width:160px"><div style="font-size:10px;font-weight:700;color:var(--re);margin-bottom:6px">🚨 ตกลง</div>';
        mv.zoneDn.forEach(function(m){
          html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:rgba(248,113,113,.08);border-radius:6px;margin-bottom:4px">'
            +'<span style="font-weight:600">'+esc(m.nick)+'</span><span style="font-size:11px;color:var(--sub)">'+esc(m.from)+'→'+esc(m.to)+'</span>'
            +'<span style="color:var(--re);font-weight:700">'+m.diff+'</span></div>';
        });
        html+='</div>';
      }
      html+='</div></div>';
    }
    // [3] Top improved / declined
    if(r.topImproved.length||r.topDeclined.length){
      html+='<div class="mc3" style="margin-bottom:10px"><div style="display:flex;gap:14px;flex-wrap:wrap">';
      if(r.topImproved.length){
        html+='<div style="flex:1;min-width:160px"><div style="font-size:10px;font-weight:700;color:var(--gr);margin-bottom:8px">🏅 ขึ้นมากสุด</div>';
        r.topImproved.forEach(function(m,i){
          html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd)">'
            +'<span style="font-size:11px;color:var(--sub);width:14px">'+(i+1)+'</span>'
            +'<div style="flex:1"><div style="font-weight:600;font-size:13px">'+esc(m.nick)+'</div><div style="font-size:10px;color:var(--sub)">'+esc(m.team)+' · '+esc(m.from)+'→'+esc(m.to)+'</div></div>'
            +'<span style="color:var(--gr);font-weight:700;font-size:13px">+'+m.diff+'</span></div>';
        });
        html+='</div>';
      }
      if(r.topDeclined.length){
        html+='<div style="flex:1;min-width:160px"><div style="font-size:10px;font-weight:700;color:var(--re);margin-bottom:8px">📉 ลดมากสุด</div>';
        r.topDeclined.forEach(function(m,i){
          html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd)">'
            +'<span style="font-size:11px;color:var(--sub);width:14px">'+(i+1)+'</span>'
            +'<div style="flex:1"><div style="font-weight:600;font-size:13px">'+esc(m.nick)+'</div><div style="font-size:10px;color:var(--sub)">'+esc(m.team)+' · '+esc(m.from)+'→'+esc(m.to)+'</div></div>'
            +'<span style="color:var(--re);font-weight:700;font-size:13px">'+m.diff+'</span></div>';
        });
        html+='</div>';
      }
      html+='</div></div>';
    }
    // [4] Team cards
    html+='<div style="font-size:12px;font-weight:700;color:var(--sub);margin-bottom:8px">📈 Team Scorecard · '+r.prevMonth+' → '+r.thisMonth+'</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">';
    r.teams.forEach(function(t){
      var gc=gcol2(t.grade);
      var dc=t.diff>0?'var(--gr)':t.diff<0?'var(--re)':'var(--sub)';
      var da=(t.diff>0?'▲ +':t.diff<0?'▼ ':'→ ')+Math.abs(t.diff);
      html+='<div class="kcard" style="flex:1;min-width:140px">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        +'<span style="background:'+gc.bg+';color:'+gc.c+';border-radius:6px;padding:3px 8px;font-weight:800;font-size:13px">'+esc(t.grade)+'</span>'
        +'<span style="font-weight:700;font-size:13px">'+esc(t.name)+'</span>'
        +'</div>'
        +'<div style="font-size:24px;font-weight:800;color:'+tlC(t.thisAvg>=70?'green':t.thisAvg>=50?'yellow':t.thisAvg>=30?'red':'none')+'">'+t.thisAvg+'</div>'
        +'<div style="font-size:12px;font-weight:600;color:'+dc+'">'+da+' <span style="color:var(--sub);font-weight:400">vs '+esc(r.prevMonth)+'</span></div>'
        +'<div style="font-size:11px;color:var(--sub);margin-top:4px">'+t.count+' คน · แดง/ดำ '+t.redBlk+' · ดิ่ง '+t.diving+'</div>'
        +'</div>';
    });
    html+='</div>';
    // [5] Per-team narrative detail
    var zOrd={'black':0,'red':1,'yellow':2,'green':3,'none':-1};
    html+='<div style="margin-top:14px"><div style="font-size:12px;font-weight:700;color:var(--sub);margin-bottom:8px">📋 รายละเอียดแต่ละทีม · '+r.thisMonth+'</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">';
    r.teams.forEach(function(t){
      var mems=t.members||[];
      var improved=mems.filter(function(m){return m.diff!=null&&m.diff>0;}).sort(function(a,b){return b.diff-a.diff;});
      var declined=mems.filter(function(m){return m.diff!=null&&m.diff<0;}).sort(function(a,b){return a.diff-b.diff;});
      var zUp=mems.filter(function(m){return m.prevZone&&m.prevZone!=='none'&&(zOrd[m.thisZone]||0)>(zOrd[m.prevZone]||0);});
      var zDn=mems.filter(function(m){return m.prevZone&&m.prevZone!=='none'&&(zOrd[m.thisZone]||0)<(zOrd[m.prevZone]||0);});
      var redBlk=mems.filter(function(m){return m.thisZone==='red'||m.thisZone==='black';});
      var gc=gcol2(t.grade);
      var dc=t.diff>0?'var(--gr)':t.diff<0?'var(--re)':'var(--sub)';
      html+='<div class="mc3" style="flex:1;min-width:160px">'
        +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
        +'<span style="background:'+gc.bg+';color:'+gc.c+';border-radius:5px;padding:2px 7px;font-weight:800;font-size:11px">'+esc(t.grade)+'</span>'
        +'<span style="font-weight:700;font-size:12px">'+esc(t.name)+'</span>'
        +'<span style="color:'+dc+';font-size:11px;font-weight:600;margin-left:2px">'+(t.diff>0?'▲+':t.diff<0?'▼':'')+Math.abs(t.diff)+'</span>'
        +'</div>';
      if(zUp.length)html+='<div style="font-size:11px;margin-bottom:3px"><span style="color:var(--gr);font-weight:600">🏆 </span>'+zUp.map(function(m){return'<b style="color:var(--gr)">'+esc(m.nick)+'</b>';}).join(' ')+'</div>';
      if(zDn.length)html+='<div style="font-size:11px;margin-bottom:3px"><span style="color:var(--re);font-weight:600">⚠️ </span>'+zDn.map(function(m){return'<b style="color:var(--re)">'+esc(m.nick)+'</b>';}).join(' ')+'</div>';
      if(improved.length)html+='<div style="font-size:11px;margin-bottom:3px;color:var(--sub)">📈 '+improved.slice(0,2).map(function(m){return esc(m.nick)+' <span style="color:var(--gr)">+'+m.diff+'</span>';}).join(' · ')+'</div>';
      if(declined.length)html+='<div style="font-size:11px;margin-bottom:3px;color:var(--sub)">📉 '+declined.slice(0,2).map(function(m){return esc(m.nick)+' <span style="color:var(--re)">'+m.diff+'</span>';}).join(' · ')+'</div>';
      html+=(redBlk.length
        ?'<div style="font-size:11px"><span style="color:var(--re);font-weight:600">🚨 ต้องดูแล ('+redBlk.length+'): </span>'+redBlk.map(function(m){return'<span style="color:var(--re)">'+esc(m.nick)+' ('+m.thisScore+')</span>';}).join(', ')+'</div>'
        :'<div style="font-size:11px;color:var(--gr)">✅ ไม่มี Red/Black</div>');
      html+='</div>';
    });
    html+='</div></div>';
    el.innerHTML=html;
  });
}

// ── LT Team: six-month Chapter leadership terms ───────────────
var _ltTeamLoaded=false,_ltTeamData=null;
function loadLtTeam(force){
  if(_ltTeamLoaded&&!force){renderLtTeam();return;}
  var roles=document.getElementById('lt-team-roles');if(roles)roles.innerHTML='<div style="color:var(--sub);padding:24px">⏳ กำลังโหลด LT Team...</div>';
  gsr('getLtTeam',{role:'mc'},function(r){
    if(!r||!r.ok){if(roles)roles.innerHTML='<div style="color:var(--re);padding:18px">❌ '+esc(r&&r.error||'โหลด LT Team ไม่สำเร็จ')+'</div>';return;}
    _ltTeamLoaded=true;_ltTeamData=r;renderLtTeam();loadMemberSignals();
  });
}
function ltMemberOption(m){return esc(m.nickname||m.name||'—')+(m.nickname&&m.name?' · '+esc(m.name):'')+(m.lineLinked?' · LINE ✓':' · ยังไม่เชื่อม LINE');}
function ltMentorAccess(role){return({'Mentor Co.':{role:'mc',team:'Mentor Co.'},'Mentor Team · TOOMTAM':{role:'toomtam',team:'TOOMTAM'},'Mentor Team · Aof':{role:'aof',team:'Aof'},'Mentor Team · Draft':{role:'draft',team:'Draft'},'Mentor Team · PHAI':{role:'phai',team:'PHAI'},'Mentor Team · AMP':{role:'amp',team:'AMP'},'Mentor Support 1':{role:'mentor_support',team:'Mentor Support'},'Mentor Support 2':{role:'mentor_support',team:'Mentor Support'}})[role]||null;}
function ltIsMentorRole(role){return role==='Mentor Co.'||role.indexOf('Mentor Support')===0||role.indexOf('Mentor Team · ')===0;}
function ltMentorTeamName(item,assignment,members,mentorTeams){
  if(item.role.indexOf('Mentor Team · ')!==0)return'';
  var code=item.role.replace('Mentor Team · ',''),member=members.find(function(m){return assignment&&m.id===assignment.assigned_member_id;}),saved=(mentorTeams.find(function(t){return t.name===code;})||{}).leader_name;
  var owner=member&&(member.nickname||member.name)||saved||'';
  return owner?'ทีม '+owner:'เมื่อเลือก Mentor ระบบจะตั้งชื่อทีมตามชื่อบุคคล';
}
function ltRoleCard(item,i,byRole,members,linked,opts,mentorTeams){
  var a=byRole[item.role]||{},main=a.assigned_member_id||'',mainReady=main&&linked[main];
  var scopes=(item.scopes||[]).map(function(s){return({absence:'แจ้งลา',visitor:'Visitor',renewal:'Renewal',training:'การอบรม',goal:'เป้าหมาย',member_help:'ขอ Mentor',new_member:'สมาชิกใหม่'})[s]||s;});
  var isMentor=ltIsMentorRole(item.role),teamName=ltMentorTeamName(item,a,members,mentorTeams),duty=item.role==='Mentor Co.'?'ดูแลภาพรวม Mentor และสมาชิกใหม่':item.role.indexOf('Mentor Support')===0?'ช่วยตอบคำถามภายในทุกทีม · ไม่ติดต่อสมาชิกโดยตรง':teamName;
  return '<div style="border:1px solid var(--bd);border-radius:13px;padding:12px;background:var(--sf2)"><div style="display:flex;justify-content:space-between;gap:8px"><div><div style="font-size:12px;font-weight:900">'+esc(item.label||item.role)+'</div><div style="font-size:9px;color:var(--sub);margin-top:3px">'+esc(isMentor?duty:(scopes.length?'รับ: '+scopes.join(' · '):'ตำแหน่งบริหาร'))+'</div></div><span style="font-size:9px;font-weight:800;color:'+(mainReady?'var(--gr)':'var(--ye)')+'">'+(mainReady?'LINE พร้อม':'ต้องตรวจ LINE')+'</span></div><label style="font-size:9px;margin-top:9px">ผู้รับตำแหน่ง</label><select id="lt-main-'+i+'" '+(S.isAdmin?'':'disabled')+' style="font-size:11px;padding:7px">'+opts+'</select>'+(!isMentor?'<label style="font-size:9px;margin-top:7px">ผู้สำรอง</label><select id="lt-fallback-'+i+'" '+(S.isAdmin?'':'disabled')+' style="font-size:11px;padding:7px">'+opts+'</select>':'')+(S.isAdmin?'<button class="bsm" onclick="saveLtRole('+i+')" style="width:100%;margin-top:9px;background:var(--ac-dim);color:var(--ac);border-color:var(--bd-hover);font-weight:800">บันทึกตำแหน่ง</button>':'<div style="font-size:9px;color:var(--sub);margin-top:9px">Mentor Co. เปิดดูได้ · Chapter Admin เป็นผู้แก้ไข</div>')+'</div>';
}
function renderLtTeam(){
  var d=_ltTeamData||{},terms=d.terms||[],assignments=d.assignments||[],members=d.members||[],roles=d.roles||[],mentorTeams=d.mentorTeams||[];
  var term=terms.find(function(t){return t.status==='active';})||null;
  var active=assignments.filter(function(a){return a.is_active&&(!term||!a.term_id||a.term_id===term.id);});
  var byRole={};active.forEach(function(a){byRole[a.lt_role]=a;});
  var linked={};members.forEach(function(m){linked[m.id]=!!m.lineLinked;});
  var filled=roles.filter(function(r){return byRole[r.role]&&byRole[r.role].assigned_member_id;}).length;
  var ready=roles.filter(function(r){var a=byRole[r.role];return a&&a.assigned_member_id&&linked[a.assigned_member_id];}).length;
  var routed=roles.filter(function(r){return (r.scopes||[]).length;}).length;
  badge('badge-lt-team',Math.max(0,roles.length-filled));
  var termEl=document.getElementById('lt-team-term');
  if(termEl)termEl.innerHTML=term?'<div class="card" style="background:linear-gradient(135deg,var(--sf2),var(--sf));border-color:var(--bd-hover)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><div style="font-size:10px;color:var(--gr);font-weight:900">● วาระที่กำลังใช้งาน</div><div style="font-size:17px;font-weight:900;margin-top:3px">'+esc(term.name)+'</div><div style="font-size:11px;color:var(--sub);margin-top:3px">'+passportFmtDate(term.starts_on)+' – '+passportFmtDate(term.ends_on)+'</div></div><div style="font-size:11px;color:var(--sub)">การแจ้งเตือนจะอ้างอิงทีมชุดนี้</div></div></div>':'<div class="card" style="border-color:var(--re);color:var(--re)">ยังไม่มีวาระ LT ที่กำลังใช้งาน · กรุณาสร้างวาระ</div>';
  var sum=document.getElementById('lt-team-summary');if(sum)sum.innerHTML=[['ตำแหน่งทั้งหมด',roles.length,'var(--ac)'],['กำหนดคนแล้ว',filled,'var(--gr)'],['LINE พร้อมรับ',ready,'#60a5fa'],['มีงานอัตโนมัติ',routed,'var(--ye)']].map(function(x){return'<div class="kcard"><div style="font-size:22px;font-weight:900;color:'+x[2]+'">'+x[1]+'</div><div style="font-size:10px;color:var(--sub);font-weight:800">'+x[0]+'</div></div>';}).join('');
  var opts='<option value="">— ยังไม่เลือก —</option>'+members.map(function(m){return'<option value="'+esc(m.id)+'">'+ltMemberOption(m)+'</option>';}).join('');
  var indexedRoles=roles.map(function(item,i){return{item:item,index:i};});
  var roleEl=document.getElementById('lt-team-roles');if(roleEl)roleEl.innerHTML=indexedRoles.filter(function(x){return !ltIsMentorRole(x.item.role);}).map(function(x){return ltRoleCard(x.item,x.index,byRole,members,linked,opts,mentorTeams);}).join('');
  var mentorEl=document.getElementById('lt-mentor-roles');if(mentorEl)mentorEl.innerHTML=indexedRoles.filter(function(x){return ltIsMentorRole(x.item.role);}).map(function(x){return ltRoleCard(x.item,x.index,byRole,members,linked,opts,mentorTeams);}).join('');
  setTimeout(function(){roles.forEach(function(item,i){var a=byRole[item.role]||{},m=document.getElementById('lt-main-'+i),f=document.getElementById('lt-fallback-'+i);if(m)m.value=a.assigned_member_id||'';if(f)f.value=a.fallback_member_id||'';if(S.isAdmin&&m&&ltMentorAccess(item.role)){var btn=document.createElement('button');btn.className='bsm';btn.style.cssText='width:100%;margin-top:6px;border-color:#d2b779;color:#d2b779;font-weight:800';btn.textContent='🔐 จัดการ Mentor Mobile';btn.onclick=function(){if(window.openMentorMobileAccess)window.openMentorMobileAccess(i);else inviteLtMentor(i);};m.parentElement.appendChild(btn);}});},0);
  var routeEl=document.getElementById('lt-team-routing');if(routeEl)routeEl.innerHTML=[['🎯 ตั้งเป้าหมาย','Growth Coordinator','goal'],['👋 มี Visitor มา','Visitor Host · Event Coordinator','visitor'],['🔄 สนใจต่ออายุ','Membership Committee · Secretary/Treasurer','renewal'],['🎓 สนใจอบรม','Secretary/Treasurer · NEC','training'],['🆘 ขอความช่วยเหลือ','Mentor Co. · Mentor member ของทีมนั้น','member_help']].map(function(x){var configured=roles.filter(function(r){return(r.scopes||[]).indexOf(x[2])>=0;}).some(function(r){var a=byRole[r.role];return a&&a.assigned_member_id&&linked[a.assigned_member_id];});return'<div style="border:1px solid var(--bd);border-radius:12px;padding:12px;background:var(--sf2)"><div style="font-size:12px;font-weight:900">'+x[0]+'</div><div style="font-size:10px;color:var(--sub);margin:4px 0 8px">ส่งหา '+x[1]+'</div><span style="font-size:9px;font-weight:900;color:'+(configured?'var(--gr)':'var(--ye)')+'">'+(configured?'● พร้อมรับงาน':'● รอกำหนดผู้รับ')+'</span></div>';}).join('');
}

function signalSlaMeta(s){var due=s.sla_due_at?new Date(s.sla_due_at):null,now=new Date();if(!due||isNaN(due.getTime()))return{label:'ยังไม่กำหนด SLA',tone:'neutral'};var hours=Math.ceil((due-now)/36e5);if(hours<0)return{label:'เกิน SLA '+Math.abs(hours)+' ชม.',tone:'overdue'};if(hours<=12)return{label:'เหลือ '+hours+' ชม.',tone:'urgent'};return{label:'ภายใน '+due.toLocaleDateString('th-TH',{day:'numeric',month:'short'}),tone:'ok'};}
function signalStatusLabel(status){return({new:'งานใหม่',acknowledged:'รับทราบแล้ว',in_progress:'กำลังดูแล',resolved:'เสร็จแล้ว',cancelled:'ยกเลิก'})[status]||status;}
var _signalAssignees=[];
function loadMemberSignals(){var el=document.getElementById('lt-signal-inbox'),sum=document.getElementById('lt-signal-summary');if(!el)return;el.innerHTML='<div class="signal-queue-state">กำลังโหลดงานจากสมาชิก…</div>';if(sum)sum.innerHTML='';gsr('getMemberSignals',{role:S.role||'mc'},function(r){if(!r||!r.ok){el.innerHTML='<div class="signal-queue-state error">'+esc(r&&r.error||'โหลดงานไม่สำเร็จ')+'<button class="bsm" onclick="loadMemberSignals()">ลองใหม่</button></div>';return;}_signalAssignees=r.assignees||[];var labels={goal:'เป้าหมาย',visitor:'แขกพิเศษ',renewal:'ต่ออายุ',training:'การอบรม',member_help:'คุยกับ Mentor'},icons={goal:'🎯',visitor:'👋',renewal:'🔄',training:'🎓',member_help:'💬'},rows=r.signals||[],overdue=rows.filter(function(s){return s.sla_due_at&&new Date(s.sla_due_at)<new Date();}).length,inProgress=rows.filter(function(s){return s.status==='in_progress';}).length;if(sum)sum.innerHTML='<div><b>'+rows.length+'</b><span>งานที่เปิดอยู่</span></div><div class="'+(overdue?'warn':'')+'"><b>'+overdue+'</b><span>เกิน SLA</span></div><div><b>'+inProgress+'</b><span>กำลังดูแล</span></div>';el.innerHTML=rows.length?rows.map(function(s){var m=s.members||{},name=m.nickname||m.name||'สมาชิก',sla=signalSlaMeta(s),owner=s.assigned_role||((s.target_roles||[]).join(' · '))||'รอรับงาน',canAct=S.isAdmin||S.isMC,tools=canAct?'<div class="signal-card-tools">'+(S.isAdmin?'<button onclick="assignMemberSignal(\''+esc(s.id)+'\',\''+esc(s.status)+'\','+Number(s.version||1)+')">มอบหมาย</button>':'')+'<button onclick="signalInternalNote(\''+esc(s.id)+'\')">บันทึกภายใน</button><select class="signal-card-action" aria-label="เปลี่ยนสถานะงานของ '+esc(name)+'" onchange="updateMemberSignal(\''+esc(s.id)+'\',this.value,'+Number(s.version||1)+')"><option value="">สถานะ…</option><option value="acknowledged">รับทราบ</option><option value="in_progress">รับดูแล</option><option value="resolved">เสร็จแล้ว</option><option value="cancelled">ยกเลิก</option></select></div>':'';return'<article class="signal-card priority-'+esc(s.priority||'normal')+'"><div class="signal-card-icon" aria-hidden="true">'+(icons[s.signal_type]||'📌')+'</div><div class="signal-card-body"><div class="signal-card-meta"><span>'+esc(labels[s.signal_type]||s.signal_type)+'</span><span>คุณ '+esc(name)+'</span><span class="signal-sla '+sla.tone+'">'+esc(sla.label)+'</span></div><h4>'+esc(s.title)+'</h4>'+(s.detail?'<p>'+esc(s.detail)+'</p>':'')+'<div class="signal-card-owner">ผู้รับผิดชอบ: '+esc(owner)+' · '+esc(signalStatusLabel(s.status))+'</div></div>'+tools+'</article>';}).join(''):'<div class="signal-queue-state success"><b>ไม่มีงานค้าง 🎉</b><span>ทุกเรื่องได้รับการดูแลเรียบร้อยแล้ว</span></div>';});}
function updateMemberSignal(id,status,version){if(!status)return;var note='';if(status==='resolved')note=prompt('สรุปผลสั้น ๆ เพื่อให้ทีมถัดไปเข้าใจ (ข้ามได้)')||'';gsr('updateMemberSignal',{role:S.role||'admin',id:id,status:status,expectedVersion:version,resolutionNote:note},function(r){if(!r||!r.ok){toast('❌ '+(r&&r.error||'อัปเดตไม่ได้'),'err');loadMemberSignals();return;}toast('✅ อัปเดตสถานะแล้ว','ok');loadMemberSignals();});}
function signalInternalNote(id){var note=prompt('บันทึกภายในสำหรับทีมงาน\nข้อมูลนี้ไม่แสดงให้สมาชิกเห็น');if(!note)return;gsr('addMemberSignalNote',{id:id,note:note},function(r){toast(r&&r.ok?'✅ บันทึกภายในแล้ว':'❌ '+(r&&r.error||'บันทึกไม่ได้'),r&&r.ok?'ok':'err');});}
function assignMemberSignal(id,status,version){if(!_signalAssignees.length){toast('ยังไม่มีบัญชีทีมงานที่เชื่อมกับสมาชิก','warn');return;}var menu=_signalAssignees.map(function(x,i){return(i+1)+'. '+(x.display_name||x.role)+' · '+(x.team_name||x.role);}).join('\n'),choice=Number(prompt('เลือกผู้รับผิดชอบ\n\n'+menu+'\n\nใส่หมายเลข'));if(!choice||!_signalAssignees[choice-1])return;var x=_signalAssignees[choice-1];gsr('updateMemberSignal',{id:id,status:status,expectedVersion:version,assignedMemberId:x.member_id,assignedRole:x.role},function(r){if(!r||!r.ok){toast('❌ '+(r&&r.error||'มอบหมายไม่ได้'),'err');loadMemberSignals();return;}toast('✅ มอบหมายให้ '+(x.display_name||x.role)+' แล้ว','ok');loadMemberSignals();});}
function saveLtRole(index){
  var d=_ltTeamData||{},item=(d.roles||[])[index];if(!item)return;
  var main=(document.getElementById('lt-main-'+index)||{}).value||'',fallback=(document.getElementById('lt-fallback-'+index)||{}).value||'';
  if(main&&main===fallback){toast('❌ ผู้รับผิดชอบหลักและผู้สำรองต้องเป็นคนละคน','err');return;}
  ld(true);gsr('saveLtTeamAssignment',{role:'mc',ltRole:item.role,assignedMemberId:main,fallbackMemberId:fallback},function(r){ld(false);if(!r||!r.ok){toast('❌ '+(r&&r.error||'บันทึกไม่ได้'),'err');return;}toast('✅ บันทึก '+item.label+' แล้ว','ok');_ltTeamLoaded=false;_passportLoaded=false;loadLtTeam(true);});
}
function inviteLtMentor(index){
  var d=_ltTeamData||{},item=(d.roles||[])[index],access=item&&ltMentorAccess(item.role),memberId=(document.getElementById('lt-main-'+index)||{}).value||'';
  if(!access||!memberId){toast('❌ กรุณาเลือกและบันทึกผู้รับผิดชอบหลักก่อน','err');return;}
  var member=(d.members||[]).find(function(m){return m.id===memberId;})||{};
  if(!member.lineLinked){toast('❌ สมาชิกคนนี้ยังไม่ได้เชื่อม LINE','err');return;}
  if(!confirm('สร้างคำเชิญ Mentor Mobile ให้ '+(member.nickname||member.name)+'\nตำแหน่ง '+item.label+' ?'))return;
  ld(true);adminCall({action:'createMobileAccessInvite',memberId:memberId,approvedRole:access.role,teamName:access.team},function(r){
    ld(false);if(!r||!r.ok){toast('❌ '+(r&&r.error||'สร้างคำเชิญไม่ได้'),'err');return;}
    if(!confirm('ตรวจสอบก่อนส่ง\n\nผู้รับ: '+(member.nickname||member.name)+'\nตำแหน่ง: '+item.label+'\nหมดอายุ: '+new Date(r.expiresAt).toLocaleString('th-TH')+'\n\nกด OK เพื่อส่งผ่าน LINE'))return;
    ld(true);adminCall({action:'sendMobileAccessInvite',inviteId:r.inviteId,inviteToken:r.inviteToken},function(sent){ld(false);toast(sent&&sent.ok?'✅ ส่งคำเชิญ Mentor Mobile แล้ว':'❌ '+(sent&&sent.error||'ส่งไม่ได้'),sent&&sent.ok?'ok':'err');});
  });
}
function createLtTerm(){
  if(window.openLtTermWizard)window.openLtTermWizard(_ltTeamData);else toast('กำลังเตรียมตัวช่วยสร้างวาระ กรุณาลองใหม่','err');
}

// ── Passport to Success Scheduler ─────────────────────────────
var _passportLoaded=false,_passportData=null;
function passportMemberLabel(m){
  var mem=m&&m.members||{};
  return esc(mem.nickname||mem.name||m.member_name||'—')+(mem.nickname&&mem.name?'<span style="color:var(--sub);font-weight:400"> · '+esc(mem.name)+'</span>':'');
}
function passportStatusBadge(st){
  var map={scheduled:['รอนัด','#94a3b8'],notified:['แจ้งแล้ว','#60a5fa'],confirmed:['ยืนยัน','var(--gr)'],declined:['ปฏิเสธ','var(--re)'],rescheduled:['เลื่อนนัด','var(--ye)'],completed:['เสร็จแล้ว','var(--gr)'],missed:['พลาดนัด','var(--re)']};
  var m=map[st]||[st||'—','var(--sub)'];
  return '<span style="display:inline-flex;align-items:center;border:1px solid '+m[1]+'55;background:'+m[1]+'18;color:'+m[1]+';border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800">'+esc(m[0])+'</span>';
}
function passportFmtDate(d){
  if(!d)return'—';
  try{return new Date(String(d)+'T12:00:00').toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric'});}catch(e){return d;}
}
function loadPassportBoard(force){
  if(_passportLoaded&&!force){renderPassportBoard();return;}
  ['passport-weekly','passport-members','passport-assignments'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:26px">⏳ กำลังโหลด...</div>';});
  gsr('getPassportBoard',{role:'mc'},function(r){
    if(!r||!r.ok){
      var msg='<div style="color:var(--re);font-size:12px;padding:18px">❌ '+esc(r&&r.error||'โหลด Passport ไม่สำเร็จ')+'</div>';
      ['passport-weekly','passport-members','passport-assignments'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML=msg;});
      return;
    }
    _passportLoaded=true;_passportData=r;renderPassportBoard();
  });
}
function syncPassportBoard(){
  ld(true);
  gsr('syncPassportEnrollments',{role:'mc'},function(r){
    ld(false);
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'Sync ไม่สำเร็จ'),'err');return;}
    var s=r.sync||{};
    toast('✅ Sync แล้ว · enroll '+(s.enrolled||0)+' · sessions '+(s.sessionsCreated||0),'ok');
    _passportLoaded=false;loadPassportBoard(true);
  });
}
function renderPassportBoard(){
  if(!D.mem||!D.mem.length){
    gsr('getDesktopDashboard',{role:'mc'},function(r2){
      if(r2&&r2.ok){D.mem=r2.members||[];D.sm=r2.summary||{};D.teams=r2.teams||[];D.ren=r2.renewal||[];}
      renderPassportBoard();
    });
    return;
  }
  var d=_passportData||{}, members=d.members||[], sessions=d.sessions||[], assignments=d.assignments||[], templates=d.templates||[];
  badge('badge-passport',sessions.filter(function(s){return ['scheduled','notified','declined','rescheduled','missed'].indexOf(s.status)>=0;}).length);
  var active=members.filter(function(m){return m.status==='active';}).length;
  var done=sessions.filter(function(s){return s.status==='completed';}).length;
  var pending=sessions.filter(function(s){return ['scheduled','notified','rescheduled'].indexOf(s.status)>=0;}).length;
  var declined=sessions.filter(function(s){return s.status==='declined'||s.status==='missed';}).length;
  var sum=document.getElementById('passport-summary');
  if(sum)sum.innerHTML=[
    ['Active Members',active,'var(--ac)'],['Pending Sessions',pending,'var(--ye)'],['Completed',done,'var(--gr)'],['Need Follow-up',declined,'var(--re)']
  ].map(function(x){return '<div class="kcard" style="flex:1;min-width:130px"><div style="font-size:20px;font-weight:900;color:'+x[2]+'">'+x[1]+'</div><div style="font-size:10px;color:var(--sub);font-weight:700">'+x[0]+'</div></div>';}).join('');

  var memById={};members.forEach(function(m){memById[m.member_id]=m;});
  var filter=(document.getElementById('passport-status-filter')||{}).value||'';
  var weekFilter=(document.getElementById('passport-week-filter')||{}).value||'';
  var upcoming=sessions.slice().filter(function(s){return (!filter||s.status===filter)&&(!weekFilter||String(s.week_no)===weekFilter);}).sort(function(a,b){return String(a.scheduled_date).localeCompare(String(b.scheduled_date))||((a.week_no||0)-(b.week_no||0))||String(a.title||'').localeCompare(String(b.title||''));});
  var sessionMemberOpts='<option value="">— เลือกคน —</option>'+(D.mem||[]).slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));}).map(function(m){return '<option value="'+esc(m.id||'')+'">'+esc(m.nick||m.nickname||m.name||'')+(m.name&&(m.nick||m.nickname)?' · '+esc(m.name):'')+'</option>';}).join('');
  var wEl=document.getElementById('passport-weekly');
  if(wEl){
    if(!upcoming.length)wEl.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:22px">ยังไม่มีรายการตามเงื่อนไขนี้</div>';
    else {
      var lastDate='', rowsHtml='';
      upcoming.forEach(function(s){
        var m=memById[s.member_id]||{};
        var sid=String(s.id||'').replace(/[^a-zA-Z0-9_-]/g,'_');
        if(String(s.scheduled_date)!==lastDate){
          lastDate=String(s.scheduled_date||'');
          var dayCount=upcoming.filter(function(x){return String(x.scheduled_date||'')===lastDate;}).length;
          rowsHtml+='<tr><td colspan="6" style="padding:9px 8px;background:var(--sf2);border-top:1px solid var(--bd);border-bottom:1px solid var(--bd)">'
            +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
            +'<span style="font-size:12px;font-weight:900;color:var(--ac)">📅 '+passportFmtDate(lastDate)+'</span>'
            +'<span style="font-size:10px;color:var(--sub);font-weight:700">'+dayCount+' sessions</span></div></td></tr>';
        }
        rowsHtml+='<tr style="border-bottom:1px solid var(--bd)">'
          +'<td style="padding:9px 8px;font-weight:800;white-space:nowrap;color:var(--sub)">W'+(s.week_no||'—')+'</td>'
          +'<td style="padding:9px 8px;font-weight:800">'+passportMemberLabel(m)+'</td>'
          +'<td style="padding:9px 8px;min-width:260px"><div style="font-weight:800">'+esc(s.title||'')+'</div>'
          +(s.description?'<div style="font-size:10px;color:var(--sub);line-height:1.45;margin-top:3px;max-width:420px">'+esc(s.description).slice(0,180)+(String(s.description).length>180?'…':'')+'</div>':'')+'</td>'
          +'<td style="padding:9px 8px;min-width:230px"><div style="font-weight:700">'+esc(s.assigned_lt_name||'ยังไม่กำหนด')+'</div><div style="font-size:10px;color:var(--sub);margin-bottom:5px">'+esc(s.lt_role||'—')+'</div>'
          +'<div style="display:flex;gap:5px;align-items:center"><select id="pass-session-lt-'+sid+'" style="max-width:155px;background:var(--sf);border:1px solid var(--bd);color:var(--tx);border-radius:7px;padding:4px 6px;font-size:10px">'+sessionMemberOpts+'</select>'
          +'<button class="bsm" onclick="passportAssignSession(\''+s.id+'\',\''+sid+'\')" style="font-size:10px">กำหนด</button></div></td>'
          +'<td style="padding:9px 8px">'+passportStatusBadge(s.status)+'</td>'
          +'<td style="padding:9px 8px;text-align:right;white-space:nowrap">'
          +'<button class="bsm" onclick="passportSessionStatus(\''+s.id+'\',\'confirmed\')" style="font-size:10px">ยืนยัน</button> '
          +'<button class="bsm" onclick="passportSessionStatus(\''+s.id+'\',\'completed\')" style="font-size:10px">เสร็จ</button> '
          +'<button class="bsm" onclick="passportReschedule(\''+s.id+'\')" style="font-size:10px">เลื่อน</button> '
          +'<button class="bsm" onclick="passportSessionStatus(\''+s.id+'\',\'missed\')" style="font-size:10px;color:var(--re)">พลาด</button>'
          +'</td></tr>';
      });
      wEl.innerHTML='<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:980px"><thead><tr style="border-bottom:1px solid var(--bd)">'
        +'<th style="text-align:left;padding:8px;color:var(--sub);font-size:10px;width:56px">Week</th><th style="text-align:left;padding:8px;color:var(--sub);font-size:10px">Member</th><th style="text-align:left;padding:8px;color:var(--sub);font-size:10px">Passport Topic</th><th style="text-align:left;padding:8px;color:var(--sub);font-size:10px">คนที่ต้องพบ / เซ็น</th><th style="text-align:left;padding:8px;color:var(--sub);font-size:10px">สถานะ</th><th style="text-align:right;padding:8px;color:var(--sub);font-size:10px">Action</th></tr></thead><tbody>'+rowsHtml+'</tbody></table></div>';
      setTimeout(function(){upcoming.forEach(function(s){var sid=String(s.id||'').replace(/[^a-zA-Z0-9_-]/g,'_'),el=document.getElementById('pass-session-lt-'+sid);if(el&&s.assigned_lt_member_id)el.value=s.assigned_lt_member_id;});},0);
    }
  }

  var roleOrder=(templates||[]).map(function(t){return t.lt_role;}).filter(function(v,i,a){return v&&a.indexOf(v)===i;});
  (assignments||[]).forEach(function(a){if(roleOrder.indexOf(a.lt_role)<0)roleOrder.push(a.lt_role);});
  var aByRole={};assignments.forEach(function(a){aByRole[a.lt_role]=a;});
  var aEl=document.getElementById('passport-assignments');
  if(aEl)aEl.innerHTML=(roleOrder.length?roleOrder:['Mentor Coordinator','President','Vice President','Secretary/Treasurer','Visitor Host','Network Education Coordinator','Growth Coordinator','Membership Committee']).map(function(role){
    var a=aByRole[role]||{};
    return '<div style="border:1px solid var(--bd);border-radius:10px;padding:9px;margin-bottom:8px;background:var(--sf2)">'
      +'<div style="font-size:11px;font-weight:800;margin-bottom:6px">'+esc(role)+'</div>'
      +'<div style="font-size:11px;color:'+(a.assigned_name?'var(--tx)':'var(--ye)')+'">'+(a.assigned_name?esc(a.assigned_name):'ยังไม่กำหนดใน LT TEAM')+'</div></div>';
  }).join('');

  var mEl=document.getElementById('passport-members');
  if(mEl){
    if(!members.length)mEl.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:22px">ยังไม่มีสมาชิกใหม่ที่มี joined_date สำหรับ Passport</div>';
    else mEl.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">'+members.map(function(m){
      var ns=m.nextSession||{}, pct=m.total?Math.round((m.done||0)/(m.total||8)*100):0;
      return '<div style="border:1px solid var(--bd);border-radius:13px;background:var(--sf2);padding:13px">'
        +'<div style="display:flex;justify-content:space-between;gap:10px"><div style="font-size:13px;font-weight:900">'+passportMemberLabel(m)+'</div><div style="font-size:18px;font-weight:900;color:var(--ac)">'+pct+'%</div></div>'
        +'<div style="font-size:10px;color:var(--sub);margin-top:4px">เข้า: '+passportFmtDate(m.joined_date)+' · เริ่มศุกร์: '+passportFmtDate(m.start_friday)+' · ตอนนี้ W'+(m.currentWeek||0)+'</div>'
        +'<div style="height:7px;background:var(--bd);border-radius:99px;overflow:hidden;margin:10px 0"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--ac),var(--gr))"></div></div>'
        +'<div style="font-size:11px;color:var(--sub)">Next: <b style="color:var(--tx)">W'+(ns.week_no||'—')+' '+esc(ns.title||'')+'</b></div>'
        +'<div style="font-size:11px;color:var(--sub);margin-top:3px">LT: <b style="color:var(--tx)">'+esc(ns.assigned_lt_name||ns.lt_role||'ยังไม่กำหนด')+'</b> · '+passportFmtDate(ns.scheduled_date)+'</div>'
        +'<div style="margin-top:8px">'+passportStatusBadge(ns.status)+'</div></div>';
    }).join('')+'</div>';
  }
}
function passportSessionStatus(id,status){
  gsr('updatePassportSession',{role:'mc',sessionId:id,status:status},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'อัปเดตไม่ได้'),'err');return;}
    toast('✅ อัปเดต Passport แล้ว','ok');_passportLoaded=false;loadPassportBoard(true);
  });
}
function passportReschedule(id){
  var d=prompt('ใส่วันที่ใหม่ YYYY-MM-DD (แนะนำเป็นวันศุกร์)');
  if(!d)return;
  gsr('updatePassportSession',{role:'mc',sessionId:id,scheduledDate:d,status:'rescheduled'},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'เลื่อนนัดไม่ได้'),'err');return;}
    toast('✅ เลื่อนนัดแล้ว','ok');_passportLoaded=false;loadPassportBoard(true);
  });
}
function passportAssignSession(id,safeId){
  var sel=document.getElementById('pass-session-lt-'+safeId);
  var memberId=sel?sel.value:'';
  var txt=sel&&sel.selectedOptions[0]?sel.selectedOptions[0].textContent.trim():'';
  if(!memberId){txt=prompt('ใส่ชื่อคนที่จะพบ/เซ็น สำหรับ session นี้ เช่น Gold Club Member หรือชื่อสมาชิกจริง')||'';}
  if(!memberId&&!txt)return;
  gsr('updatePassportSession',{role:'mc',sessionId:id,assignedLtMemberId:memberId,assignedLtName:memberId?txt:txt},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'กำหนดคนไม่ได้'),'err');return;}
    toast('✅ กำหนดคนสำหรับ Passport session แล้ว','ok');_passportLoaded=false;loadPassportBoard(true);
  });
}
function passportSaveLt(role){
  var id='pass-lt-'+esc(role).replace(/[^a-zA-Z0-9]/g,'_');
  var sel=document.getElementById(id), memberId=sel?sel.value:'', txt=sel&&sel.selectedOptions[0]?sel.selectedOptions[0].textContent:'';
  gsr('savePassportLtAssignment',{role:'mc',ltRole:role,assignedMemberId:memberId,assignedName:memberId?txt:''},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'บันทึก LT ไม่ได้'),'err');return;}
    toast('✅ บันทึก LT role แล้ว','ok');_passportLoaded=false;loadPassportBoard(true);
  });
}

// ── 8-Week Progress ───────────────────────────────────────────
var _8wLoaded=false;
function load8WProgress(force){
  if(_8wLoaded&&!force)return;
  var el=document.getElementById('mc-8w-list');
  el.innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:30px">⏳ กำลังโหลด...</div>';
  gsr('getNewMembers',{role:'mc'},function(r){
    if(!r.ok){el.innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    function finish(){_8wLoaded=true;render8WProgress(r.members||[]);}
    if(S.role==='mc'){
      gsr('getPassportBoard',{role:'mc'},function(pr){
        if(pr&&pr.ok){_passportLoaded=true;_passportData=pr;}
        finish();
      });
    }else finish();
  });
}
// ══ GROWTH WATCH ══════════════════════════════════════════════════
var GROWTH_WATCH_MIN_SCORE=65;
function gwHint(m){
  var h=m.hist||[];
  var isGW=m.mentoringMode==='growth_watch';
  var score=m.bniScore||0;
  if(isGW&&score<GROWTH_WATCH_MIN_SCORE)return'⚠️ คะแนนต่ำกว่า '+GROWTH_WATCH_MIN_SCORE+' — ควรดึงกลับ Active';
  if(!isGW&&score>=GROWTH_WATCH_MIN_SCORE)return'💡 พร้อมย้าย Growth Watch ('+score+' คะแนน)';
  if(h.length<2)return'';
  // Check decline: last 2 months
  var last=h[h.length-1]||0,prev=h[h.length-2]||0,prev2=h.length>=3?(h[h.length-3]||0):null;
  var declining2=(last<prev-1)&&(prev2!==null&&prev<prev2-1);
  var declining1=last<prev-3;
  if(isGW){
    if(declining2)return'📉 คะแนนลดลงต่อเนื่อง — จับตาดู';
    return'✅ ผ่านเกณฑ์ Growth Watch';
  }
  if(declining2)return'📉 คะแนนลดลงต่อเนื่อง';
  return'';
}

function setGWFilter(mode,el){
  gwModeFilter=mode;
  document.querySelectorAll('#mc-mem .zp[id^="mf-gw"]').forEach(function(b){b.style.fontWeight='';b.style.borderWidth='';});
  el.style.fontWeight='700';el.style.borderWidth='2px';
  renderMem();
}

function toggleGWMode(name,currentMode){
  var newMode=currentMode==='growth_watch'?'active':'growth_watch';
  var label=newMode==='growth_watch'?'ย้ายไป Growth Watch':'ดึงกลับ Active Mentoring';
  if(newMode==='growth_watch'){
    var member=(D.mem||[]).find(function(m){return m.name===name;});
    var score=member?(Number(member.bniScore)||0):0;
    if(score<GROWTH_WATCH_MIN_SCORE){
      toast('❌ Growth Watch ต้องมีคะแนน '+GROWTH_WATCH_MIN_SCORE+'+ · '+name+' มี '+score+' คะแนน','err');
      return;
    }
  }
  if(!confirm(label+': "'+name+'"?'))return;
  ld(true);
  gsr('setMentoringMode',{role:S.role,memberName:name,mode:newMode},function(r){
    if(!r||!r.ok){
      ld(false);
      toast('❌ '+(r&&r.error||'เกิดข้อผิดพลาด'),'err');
      return;
    }
    toast('✅ '+label+' เรียบร้อย: '+name,'ok');
    gsr('getDesktopDashboard',{role:S.role,forceRefresh:true},function(r2){
      ld(false);
      if(r2.ok){D.mem=r2.members||[];D.sm=r2.summary||{};D.teams=r2.teams||[];D.ren=r2.renewal||[];}
      renderMem();renderKPI();renderGWBadge();
      if(document.getElementById('mc-gw')&&document.getElementById('mc-gw').classList.contains('on'))renderGrowthWatch();
    });
  });
}

function renderGWBadge(){
  var gwCount=(D.mem||[]).filter(function(m){return m.mentoringMode==='growth_watch';}).length;
  var atRisk=(D.mem||[]).filter(function(m){return m.mentoringMode==='growth_watch'&&(m.bniScore||0)<GROWTH_WATCH_MIN_SCORE;}).length;
  var badge=document.getElementById('badge-gw');
  if(badge){badge.textContent=gwCount?gwCount:'';badge.style.display=gwCount?'':'none';}
  var kEl=document.getElementById('mc-kpi');
  if(kEl&&atRisk){toast('⚠️ '+atRisk+' คนใน Growth Watch คะแนนน่าเป็นห่วง','warn');}
}

// ── Access Management ────────────────────────────────────────────
var ADMIN_API='https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/admin-api';
function adminCall(payload,cb){
  var tok=S&&S.token||'';
  if(!tok){cb({ok:false,error:'No token'});return;}
  payload.token=tok;
  fetch(ADMIN_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON},body:JSON.stringify(payload)})
    .then(function(r){return r.json();}).then(cb).catch(function(e){cb({ok:false,error:e.message});});
}
var _accData={assignments:[],requests:[]};
function loadAccessMgmt(){
  adminCall({action:'getRoleAssignments'},function(r){
    if(!r.ok){
      var el=document.getElementById('acc-list');
      if(el)el.innerHTML='<div style="color:var(--re);font-size:12px;text-align:center;padding:20px">⚠️ '+(r.error||r.message||'โหลดไม่ได้')+'</div>';
      return;
    }
    _accData.assignments=r.assignments||[];
    renderAccList();
  });
  adminCall({action:'getAccessRequests'},function(r){
    if(!r.ok)return;
    _accData.requests=r.requests||[];
    renderAccRequests();
  });
  loadLineTeamMappings();
  loadLineHealth();
  loadSystemHealth();
}
var ACC_SECTION_LABELS={dashboard:'Dashboard',members:'Members',issues:'Issues',checkin:'Check-in',revenue:'Revenue',broadcast:'Broadcast',settings:'Settings'};
function renderAccList(){
  var list=_accData.assignments;
  var el=document.getElementById('acc-list');
  var cnt=document.getElementById('acc-total-count');
  if(!el)return;
  if(cnt)cnt.textContent=list.length+' อีเมล';
  if(!list.length){el.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มีอีเมลในระบบ</div>';return;}
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px">'
    +'<thead><tr style="border-bottom:1px solid var(--bd)">'
    +'<th style="padding:8px 14px;text-align:left;color:var(--sub);font-size:10px;font-weight:700;white-space:nowrap">Email</th>'
    +'<th style="padding:8px 14px;text-align:left;color:var(--sub);font-size:10px;font-weight:700">ชื่อ</th>'
    +'<th style="padding:8px 14px;text-align:left;color:var(--sub);font-size:10px;font-weight:700">Role</th>'
    +'<th style="padding:8px 14px;text-align:left;color:var(--sub);font-size:10px;font-weight:700">Admin Sections</th>'
    +'<th style="padding:8px 14px;text-align:center;color:var(--sub);font-size:10px;font-weight:700">แก้ไขได้</th>'
    +'<th style="padding:8px 14px;text-align:left;color:var(--sub);font-size:10px;font-weight:700"></th>'
    +'</tr></thead><tbody>'
    +list.map(function(a){
      var secs=(a.admin_sections||[]).map(function(s){return '<span style="background:rgba(61,214,245,.15);color:var(--ac);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:2px">'+escH(ACC_SECTION_LABELS[s]||s)+'</span>';}).join('');
      var badge=a.is_mc?'<span style="background:rgba(200,169,106,.2);color:#d7fefa;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700">MC</span>':a.is_mentor?'<span style="background:rgba(61,214,245,.15);color:var(--ac);padding:1px 7px;border-radius:4px;font-size:10px">Mentor</span>':'<span style="background:rgba(100,116,139,.2);color:var(--sub);padding:1px 7px;border-radius:4px;font-size:10px">'+escH(a.role)+'</span>';
      return '<tr style="border-bottom:1px solid var(--bd)" onmouseenter="this.style.background=\'var(--sf2)\'" onmouseleave="this.style.background=\'\'">'
        +'<td style="padding:8px 14px;font-size:11px;color:var(--sub)">'+escH(a.email)+'</td>'
        +'<td style="padding:8px 14px;font-weight:600">'+escH(a.display_name||'—')+'</td>'
        +'<td style="padding:8px 14px">'+badge+'</td>'
        +'<td style="padding:8px 14px">'+(secs||'<span style="color:var(--sub);font-size:10px">—</span>')+'</td>'
        +'<td style="padding:8px 14px;text-align:center">'+(a.admin_edit_access?'✏️':'👁')+'</td>'
        +'<td style="padding:8px 14px;white-space:nowrap">'
        +'<button onclick="accEdit(\''+escH(a.email)+'\')" style="background:transparent;border:1px solid var(--bd);color:var(--sub);padding:3px 8px;border-radius:5px;cursor:pointer;font-size:10px;font-family:Sarabun,sans-serif;margin-right:4px">✏️</button>'
        +(a.is_mc?'':('<button onclick="accDel(\''+escH(a.email)+'\')" style="background:transparent;border:1px solid rgba(248,113,113,.4);color:var(--re);padding:3px 8px;border-radius:5px;cursor:pointer;font-size:10px;font-family:Sarabun,sans-serif">ลบ</button>'))
        +'</td></tr>';
    }).join('')+'</tbody></table>';
}
function renderAccRequests(){
  var pending=_accData.requests.filter(function(r){return r.status==='pending';});
  var wrap=document.getElementById('acc-req-wrap');
  var list=document.getElementById('acc-req-list');
  var cnt=document.getElementById('acc-req-count');
  if(!wrap||!list)return;
  if(!pending.length){wrap.style.display='none';return;}
  wrap.style.display='';
  if(cnt)cnt.textContent=pending.length;
  list.innerHTML=pending.map(function(req){
    var secs=(req.requested_sections||[]).join(', ')||'—';
    return '<div style="background:rgba(0,0,0,.2);border-radius:8px;padding:12px;margin-bottom:8px">'
      +'<div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700;color:#ffd166">'+escH(req.email)+'</div>'
      +'<div style="font-size:11px;color:var(--sub);margin-top:2px">'+escH(req.name||'—')+' · ขอเข้า: '+escH(secs)+(req.edit_access?' (แก้ไข)':' (ดู)')+'</div>'
      +(req.reason?'<div style="font-size:11px;color:var(--tx);margin-top:4px">"'+escH(req.reason)+'"</div>':'')
      +'</div>'
      +'<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">'
      +'<select id="req-role-'+req.id+'" style="background:var(--sf);border:1px solid var(--bd);color:var(--tx);padding:4px 7px;border-radius:5px;font-size:11px">'
      +'<option value="growth">growth</option><option value="toomtam">toomtam</option><option value="aof">aof</option><option value="draft">draft</option><option value="phai">phai</option><option value="amp">amp</option>'
      +'</select>'
      +'<button onclick="accApprove(\''+req.id+'\')" style="background:var(--gr);color:#000;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:700;font-family:Sarabun,sans-serif">✅ อนุมัติ</button>'
      +'<button onclick="accReject(\''+req.id+'\')" style="background:transparent;border:1px solid var(--re);color:var(--re);padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-family:Sarabun,sans-serif">❌</button>'
      +'</div></div></div>';
  }).join('');
}
function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function accSave(){
  var email=document.getElementById('acc-email').value.toLowerCase().trim();
  var role=document.getElementById('acc-role').value;
  var displayName=document.getElementById('acc-name').value.trim()||role;
  var teamName=document.getElementById('acc-team').value.trim()||null;
  var isMC=document.getElementById('acc-is-mc').checked;
  var isMentor=document.getElementById('acc-is-mentor').checked;
  var editAccess=document.getElementById('acc-edit-access').checked;
  var sections=Array.from(document.querySelectorAll('.acc-sec-cb:checked')).map(function(cb){return cb.value;});
  var msg=document.getElementById('acc-form-msg');
  if(!email){msg.textContent='❌ กรุณาใส่ email';msg.style.color='var(--re)';return;}
  msg.textContent='กำลังบันทึก...';msg.style.color='var(--sub)';
  adminCall({action:'addRoleAssignment',email,role,displayName,teamName,isMC,isMentor,adminSections:sections,adminEditAccess:editAccess},function(r){
    if(!r||!r.ok){msg.textContent='❌ '+(r&&r.error||'error');msg.style.color='var(--re)';return;}
    msg.textContent='✅ บันทึกแล้ว';msg.style.color='var(--gr)';
    accClear();
    loadAccessMgmt();
    setTimeout(function(){var m=document.getElementById('acc-form-msg');if(m)m.textContent='';},3000);
  });
}
function accClear(){
  ['acc-email','acc-name','acc-team'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  ['acc-is-mc','acc-is-mentor','acc-edit-access'].forEach(function(id){var el=document.getElementById(id);if(el)el.checked=false;});
  document.querySelectorAll('.acc-sec-cb').forEach(function(cb){cb.checked=false;});
  document.getElementById('acc-role').value='growth';
}
function accEdit(email){
  var a=(_accData.assignments||[]).find(function(x){return x.email===email;});
  if(!a)return;
  document.getElementById('acc-email').value=a.email;
  document.getElementById('acc-name').value=a.display_name||'';
  document.getElementById('acc-role').value=a.role||'growth';
  document.getElementById('acc-team').value=a.team_name||'';
  document.getElementById('acc-is-mc').checked=!!a.is_mc;
  document.getElementById('acc-is-mentor').checked=!!a.is_mentor;
  document.getElementById('acc-edit-access').checked=!!a.admin_edit_access;
  document.querySelectorAll('.acc-sec-cb').forEach(function(cb){cb.checked=(a.admin_sections||[]).includes(cb.value);});
  document.getElementById('acc-email').scrollIntoView({behavior:'smooth',block:'center'});
  document.getElementById('acc-form-msg').textContent='กำลังแก้ไข: '+email;
  document.getElementById('acc-form-msg').style.color='var(--ac)';
}
function accRoleSync(role){
  document.getElementById('acc-is-mc').checked=['mc'].includes(role);
  document.getElementById('acc-is-mentor').checked=['toomtam','aof','draft','phai','amp'].includes(role);
}
function accDel(email){
  if(!confirm('ลบ '+email+' ออกจากระบบ?'))return;
  adminCall({action:'removeRoleAssignment',email},function(r){
    if(!r||!r.ok){alert('เกิดข้อผิดพลาด: '+(r&&r.error||'error'));return;}
    loadAccessMgmt();
  });
}
function accApprove(id){
  var role=(document.getElementById('req-role-'+id)||{}).value||'growth';
  var isMentor=['toomtam','aof','draft','phai','amp'].includes(role);
  adminCall({action:'approveAccessRequest',id,role,isMentor},function(r){
    if(!r||!r.ok){alert('เกิดข้อผิดพลาด: '+(r&&r.error||'error'));return;}
    _accData.requests=(_accData.requests||[]).map(function(req){return req.id===id?Object.assign({},req,{status:'approved'}):req;});
    renderAccRequests();
    loadAccessMgmt();
  });
}
function accReject(id){
  if(!confirm('ปฏิเสธคำขอนี้?'))return;
  adminCall({action:'rejectAccessRequest',id},function(r){
    if(!r||!r.ok){alert('เกิดข้อผิดพลาด');return;}
    _accData.requests=(_accData.requests||[]).map(function(req){return req.id===id?Object.assign({},req,{status:'rejected'}):req;});
    renderAccRequests();
  });
}
// ── System Version / Route Health ────────────────────────────────
var _systemHealth=null;
function systemHealthCard(label,value,color,sub){
  return '<div style="background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:10px">'
    +'<div style="font-size:10px;color:var(--sub);margin-bottom:3px">'+escH(label)+'</div>'
    +'<div style="font-size:16px;font-weight:800;color:'+(color||'var(--tx)')+'">'+escH(value)+'</div>'
    +(sub?'<div style="font-size:10px;color:var(--sub);margin-top:4px;line-height:1.4">'+escH(sub)+'</div>':'')
    +'</div>';
}
function loadSystemHealth(){
  var btn=document.getElementById('btn-system-health');
  var body=document.getElementById('system-health-body');
  var summary=document.getElementById('system-health-summary');
  var smoke=document.getElementById('system-smoke-body');
  if(!body)return;
  if(btn){btn.disabled=true;btn.textContent='⏳ กำลังตรวจ…';}
  body.innerHTML='<span style="color:var(--sub)">กำลังตรวจ API route table และ version…</span>';
  if(smoke){smoke.style.display='none';smoke.innerHTML='';}
  gsr('getSystemHealth',{role:S.role,staticVersion:APP_STATIC_VERSION},function(r){
    if(btn){btn.disabled=false;btn.textContent='↺ ตรวจระบบ';}
    if(!r||!r.ok){
      body.innerHTML='<span style="color:var(--re)">❌ '+escH(r&&r.error||'ตรวจระบบไม่ได้')+'</span>';
      return;
    }
    _systemHealth=r;
    var missing=(r.missingHandlers||[]).length;
    var smokeBad=(r.smokeChecks||[]).filter(function(x){return !x.routeOk||!x.handlerOk;}).length;
    if(summary)summary.innerHTML=[
      systemHealthCard('API Version',r.appVersion||'—','var(--ac)','จาก settings.APP_VERSION'),
      systemHealthCard('Static File',APP_STATIC_VERSION,'var(--tx)','ไฟล์ dashboard ที่ browser โหลดอยู่'),
      systemHealthCard('Routes',String(r.routeCount||0),missing?'var(--re)':'var(--gr)',missing?missing+' route ไม่มี handler':'handler ครบ'),
      systemHealthCard('Smoke Routes',((r.smokeChecks||[]).length-smokeBad)+'/'+(r.smokeChecks||[]).length,smokeBad?'var(--ye)':'var(--gr)','ตรวจ route ของ flow สำคัญ')
    ].join('');
    var dep=r.deployment||{};
    var commit=dep.vercelCommit?String(dep.vercelCommit).slice(0,8):'—';
    var rows=(r.smokeChecks||[]).map(function(x){
      var ok=x.routeOk&&x.handlerOk;
      return '<tr style="border-bottom:1px solid var(--bd)">'
        +'<td style="padding:7px 9px;font-weight:700">'+(ok?'✅':'❌')+' '+escH(x.label||x.action)+'</td>'
        +'<td style="padding:7px 9px;color:var(--sub);font-family:monospace;font-size:10px">'+escH(x.action)+'</td>'
        +'<td style="padding:7px 9px;color:var(--sub)">'+escH(x.domain||'—')+'</td>'
        +'<td style="padding:7px 9px;color:'+(ok?'var(--gr)':'var(--re)')+'">'+(ok?'พร้อม':'route/handler หาย')+'</td>'
        +'</tr>';
    }).join('');
    var missingRows=(r.missingHandlers||[]).map(function(x){return escH(x.action)+' → '+escH(x.domain);}).join(', ');
    body.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:11px;color:var(--sub)">'
      +'<span>Generated: '+escH(r.generatedAt||'—')+'</span>'
      +'<span>Commit: '+escH(commit)+'</span>'
      +(dep.denoDeploymentId?'<span>Deno: '+escH(String(dep.denoDeploymentId).slice(0,12))+'…</span>':'')
      +'</div>'
      +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:640px">'
      +'<thead><tr style="border-bottom:1px solid var(--bd)"><th style="padding:6px 9px;text-align:left;color:var(--sub)">Check</th><th style="padding:6px 9px;text-align:left;color:var(--sub)">Action</th><th style="padding:6px 9px;text-align:left;color:var(--sub)">Domain</th><th style="padding:6px 9px;text-align:left;color:var(--sub)">Status</th></tr></thead>'
      +'<tbody>'+rows+'</tbody></table></div>'
      +(missingRows?'<div style="color:var(--re);font-size:11px;margin-top:10px">Missing handler: '+missingRows+'</div>':'<div style="color:var(--gr);font-size:11px;margin-top:10px">✅ API route table และ handler map ดูสมบูรณ์</div>');
  });
}
function systemSmokeRow(label,status,msg){
  var color=status==='ok'?'var(--gr)':status==='run'?'var(--ye)':'var(--re)';
  var icon=status==='ok'?'✅':status==='run'?'⏳':'❌';
  return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border-top:1px solid var(--bd);padding:8px 0;font-size:11px">'
    +'<div style="font-weight:800">'+icon+' '+escH(label)+'</div>'
    +'<div style="color:'+color+';text-align:right;max-width:60%;line-height:1.45">'+escH(msg||'')+'</div>'
    +'</div>';
}
function runSystemSmokeTest(){
  var btn=document.getElementById('btn-system-smoke');
  var box=document.getElementById('system-smoke-body');
  if(!box)return;
  var tests=[
    {label:'Dashboard data',action:'getDesktopDashboard',payload:{}},
    {label:'Unified Follow-up Inbox',action:'getUnifiedFollowUpInbox',payload:{}},
    {label:'MSB Bundle',action:'getMSBDashboardBundle',payload:{blueprintYear:new Date().getFullYear()}},
    {label:'LINE Activity Timeline',action:'getLineActivityTimeline',payload:{limit:12}},
    {label:'Traffic Light Summary',action:'getTrafficLightMonthlySummary',payload:{}},
    {label:'Unread Counters',action:'getUnreadCounts',payload:{}}
  ];
  var results={};
  function draw(){
    box.style.display='block';
    box.innerHTML='<div style="background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:12px">'
      +'<div style="font-size:12px;font-weight:900;margin-bottom:4px">🧪 Read-only Smoke Test</div>'
      +'<div style="font-size:10px;color:var(--sub);margin-bottom:8px">ทดสอบเฉพาะการอ่านข้อมูล ไม่ส่ง LINE และไม่แก้ฐานข้อมูล</div>'
      +tests.map(function(t){var r=results[t.action]||{status:'run',msg:'รอคิว'};return systemSmokeRow(t.label,r.status,r.msg);}).join('')
      +'</div>';
  }
  if(btn){btn.disabled=true;btn.textContent='⏳ Testing…';}
  tests.forEach(function(t){results[t.action]={status:'run',msg:'รอคิว'};});
  draw();
  var i=0;
  function next(){
    if(i>=tests.length){
      if(btn){btn.disabled=false;btn.textContent='🧪 Smoke Test';}
      try{loadSystemHealth();}catch(e){}
      return;
    }
    var t=tests[i++];
    results[t.action]={status:'run',msg:'กำลังตรวจ'};
    draw();
    gsr(t.action,Object.assign({role:S.role},t.payload||{}),function(r){
      if(r&&r.ok)results[t.action]={status:'ok',msg:'ผ่าน'};
      else results[t.action]={status:'err',msg:(r&&r.error)||'ไม่ผ่าน'};
      draw();
      next();
    });
  }
  next();
}
// ── LINE Team Mapping ─────────────────────────────────────────────
var _lineMembers=[];
function loadLineTeamMappings(){
  var box=document.getElementById('line-team-body');
  if(box)box.innerHTML='<span style="color:var(--sub);font-size:12px">⏳ กำลังโหลด...</span>';
  adminCall({action:'getLineTeamMappings'},function(r){
    if(!r||!r.ok){
      if(box)box.innerHTML='<span style="color:var(--re);font-size:12px">⚠️ '+(r&&(r.error||r.message)||'โหลดไม่ได้')+'</span>';
      return;
    }
    _lineMembers=r.availableMembers||[];
    var opts=_lineMembers.map(function(m){
      return '<option value="'+escH(m.lineUserId)+'">'+escH(m.nickname||m.name)+' ('+escH(m.lineUserId.slice(0,8))+'…)</option>';
    }).join('');
    var rows=(r.teams||[]).map(function(t){
      var linked=t.linkedMember?'✅ '+(t.linkedMember.nickname||t.linkedMember.name||''):
                 t.currentLineId?'⚠️ '+t.currentLineId.slice(0,10)+'…':'—';
      return '<tr>'
        +'<td style="padding:7px 10px;font-weight:700;white-space:nowrap">'+escH(t.name)+'</td>'
        +'<td style="padding:7px 10px;font-size:12px;color:var(--sub)">'+escH(t.leader_name||'—')+'</td>'
        +'<td style="padding:7px 10px;font-size:12px">'+linked+'</td>'
        +'<td style="padding:7px 10px"><select id="ltsel-'+escH(t.name)+'" style="background:var(--sf);border:1px solid var(--bd);color:var(--tx);border-radius:6px;padding:5px 8px;font-size:12px;max-width:160px">'
        +'<option value="">— เลือก —</option>'+opts+'</select></td>'
        +'<td style="padding:7px 10px"><button onclick="saveLineTeamFn(\''+escH(t.name)+'\')" style="background:var(--ac);color:#000;border:none;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">บันทึก</button></td>'
        +'</tr>';
    }).join('');
    if(box)box.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px">'
      +'<thead><tr style="border-bottom:1px solid var(--bd)">'
      +'<th style="padding:6px 10px;text-align:left;color:var(--sub);font-size:10px">ทีม</th>'
      +'<th style="padding:6px 10px;text-align:left;color:var(--sub);font-size:10px">หัวหน้า</th>'
      +'<th style="padding:6px 10px;text-align:left;color:var(--sub);font-size:10px">LINE ที่ผูกอยู่</th>'
      +'<th style="padding:6px 10px;text-align:left;color:var(--sub);font-size:10px">เปลี่ยนเป็น</th>'
      +'<th></th></tr></thead><tbody>'+rows+'</tbody></table>';
  });
}
function saveLineTeamFn(teamName){
  var sel=document.getElementById('ltsel-'+teamName);
  var lineUserId=sel?sel.value:'';
  var msg=document.getElementById('line-team-msg');
  adminCall({action:'setLineTeamMapping',teamName:teamName,lineUserId:lineUserId},function(r){
    if(r&&r.ok){
      if(msg){msg.textContent='✅ บันทึก '+teamName+' แล้ว';msg.style.color='var(--gr)';}
      setTimeout(function(){loadLineTeamMappings();if(msg)msg.textContent='';},800);
    }else{
      if(msg){msg.textContent='❌ '+(r&&r.error||'บันทึกไม่ได้');msg.style.color='var(--re)';}
    }
  });
}
function provisionLineFn(){
  var btn=document.getElementById('btn-provision-line');
  var msg=document.getElementById('line-prov-msg');
  if(btn){btn.disabled=true;btn.textContent='⏳ กำลัง Provision…';}
  adminCall({action:'provisionLineMenus'},function(r){
    if(btn){btn.disabled=false;btn.textContent='🚀 Provision Menus';}
    if(r&&r.ok){
      if(msg){msg.textContent='✅ Provision สำเร็จ';msg.style.color='var(--gr)';}
      loadLineHealth();
      setTimeout(function(){if(msg)msg.textContent='';},4000);
    }else{
      if(msg){msg.textContent='❌ '+(r&&r.error||'เกิดข้อผิดพลาด');msg.style.color='var(--re)';}
    }
  });
}
function lineHealthCard(label,value,color){
  return '<div style="background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:10px">'
    +'<div style="font-size:10px;color:var(--sub);margin-bottom:3px">'+escH(label)+'</div>'
    +'<div style="font-size:16px;font-weight:800;color:'+color+'">'+escH(value)+'</div></div>';
}
function lineHealthStatusMeta(status){
  return {
    ok:{icon:'✅',label:'ปกติ',color:'var(--gr)'},
    drift:{icon:'⚠️',label:'Menu ไม่ตรง Role',color:'var(--ye)'},
    missing_link:{icon:'○',label:'ยังไม่ผูก LINE',color:'var(--sub)'},
    missing_menu:{icon:'⚠️',label:'ไม่มี Menu ID',color:'var(--ye)'},
    error:{icon:'❌',label:'ตรวจไม่สำเร็จ',color:'var(--re)'}
  }[status]||{icon:'•',label:status||'—',color:'var(--sub)'};
}
function loadLineHealth(){
  var btn=document.getElementById('btn-line-health');
  var body=document.getElementById('line-health-body');
  var summary=document.getElementById('line-health-summary');
  if(!body)return;
  if(btn){btn.disabled=true;btn.textContent='⏳ กำลังตรวจ…';}
  body.innerHTML='<span style="color:var(--sub)">กำลังถามสถานะจาก LINE และตรวจทุก URL…</span>';
  adminCall({action:'getLineHealth'},function(r){
    if(btn){btn.disabled=false;btn.textContent='↺ ตรวจระบบ';}
    if(!r||!r.ok){
      body.innerHTML='<span style="color:var(--re)">❌ '+escH(r&&r.error||'ตรวจระบบไม่ได้')+'</span>';
      return;
    }
    var s=r.summary||{};
    summary.innerHTML=[
      lineHealthCard('Healthy',String(s.healthy||0),'var(--gr)'),
      lineHealthCard('Menu Drift',String(s.drift||0),(s.drift||0)?'var(--ye)':'var(--gr)'),
      lineHealthCard('ยังไม่ผูก',String(s.missing||0),(s.missing||0)?'var(--ye)':'var(--gr)'),
      lineHealthCard('URL ผ่าน',(s.urlsOk||0)+'/'+(s.urlsTotal||0),(s.urlsOk===s.urlsTotal)?'var(--gr)':'var(--re)')
    ].join('');
    var rows=(r.assignments||[]).map(function(a){
      var st=lineHealthStatusMeta(a.status);
      var person=a.linkedMember?(a.linkedMember.nickname||a.linkedMember.name):'—';
      var actual=a.actualMenuId?escH(a.actualMenuId.slice(0,18))+'…':'—';
      var expected=a.expectedMenuId?escH(a.expectedMenuId.slice(0,18))+'…':'—';
      var repair=a.lineUserId&&a.status!=='ok'
        ?'<button onclick="repairLineMenu(\''+escH(a.lineUserId)+'\',\''+escH(a.expectedRole)+'\')" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:4px 9px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">ซ่อม</button>'
        :'';
      return '<tr style="border-bottom:1px solid var(--bd)">'
        +'<td style="padding:7px 9px;font-weight:700">'+escH(a.label||a.key)+'</td>'
        +'<td style="padding:7px 9px;color:var(--sub)">'+escH(person)+'</td>'
        +'<td style="padding:7px 9px">'+escH(a.expectedRole||'—')+'</td>'
        +'<td style="padding:7px 9px;font-family:monospace;font-size:10px" title="'+escH(a.expectedMenuId||'')+'">'+expected+'</td>'
        +'<td style="padding:7px 9px;font-family:monospace;font-size:10px" title="'+escH(a.actualMenuId||'')+'">'+actual+'</td>'
        +'<td style="padding:7px 9px;color:'+st.color+';white-space:nowrap">'+st.icon+' '+st.label+'</td>'
        +'<td style="padding:7px 9px">'+repair+'</td></tr>';
    }).join('');
    var badUrls=(r.urlChecks||[]).filter(function(x){return !x.ok;});
    var urlNote=badUrls.length
      ?'<div style="color:var(--re);margin-top:10px">URL ผิดปกติ: '+badUrls.map(function(x){return escH(x.url)+' ('+(x.status||'network')+')';}).join(', ')+'</div>'
      :'<div style="color:var(--gr);margin-top:10px">✅ LIFF และ legacy URLs ตอบสนองครบ</div>';
    body.innerHTML='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:720px">'
      +'<thead><tr style="border-bottom:1px solid var(--bd)">'
      +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">ตำแหน่ง</th>'
      +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">บัญชี</th>'
      +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Role</th>'
      +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">ควรเป็น</th>'
      +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">ใช้อยู่</th>'
      +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">สถานะ</th><th></th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table></div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:10px">Menu '+escH(r.menuVersion||'—')+' · ตรวจล่าสุด '+escH(r.provisionedAt||'—')+'</div>'
      +urlNote;
  });
}
function repairLineMenu(lineUserId,menuRole){
  var msg=document.getElementById('line-health-msg');
  if(msg){msg.textContent='⏳ กำลัง Reassign '+menuRole+' menu…';msg.style.color='var(--sub)';}
  adminCall({action:'reassignLineMenu',lineUserId:lineUserId,menuRole:menuRole},function(r){
    if(r&&r.ok){
      if(msg){msg.textContent='✅ Reassign สำเร็จ';msg.style.color='var(--gr)';}
      setTimeout(loadLineHealth,500);
    }else if(msg){
      msg.textContent='❌ '+(r&&r.error||'Reassign ไม่สำเร็จ');msg.style.color='var(--re)';
    }
  });
}
var _rosterImport={pdfBase64:null,preview:null};
function rosterCard(label,value,color){
  return '<div style="background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:10px">'
    +'<div style="font-size:10px;color:var(--sub);margin-bottom:3px">'+escH(label)+'</div>'
    +'<div style="font-size:16px;font-weight:800;color:'+color+'">'+escH(value)+'</div></div>';
}
function readRosterPdf(cb){
  var file=(document.getElementById('roster-pdf-file')||{}).files&&document.getElementById('roster-pdf-file').files[0];
  if(!file){cb({ok:false,error:'กรุณาเลือก Chapter Roster PDF'});return;}
  if(!/pdf/i.test(file.type||file.name)){cb({ok:false,error:'ไฟล์ต้องเป็น PDF'});return;}
  var reader=new FileReader();
  reader.onload=function(e){cb({ok:true,base64:String(e.target.result||'')});};
  reader.onerror=function(){cb({ok:false,error:'อ่านไฟล์ไม่ได้'});};
  reader.readAsDataURL(file);
}
function renderRosterPreview(r){
  var summary=document.getElementById('roster-import-summary');
  var body=document.getElementById('roster-import-body');
  var syncBtn=document.getElementById('btn-roster-sync');
  if(summary)summary.innerHTML=[
    rosterCard('Rows',String(r.totalRows||0),'var(--tx)'),
    rosterCard('Matched',String(r.matched||0),(r.matched||0)?'var(--gr)':'var(--ye)'),
    rosterCard('Unmatched',String(r.unmatched||0),(r.unmatched||0)?'var(--ye)':'var(--gr)'),
    rosterCard('BNI Count',String(r.memberCountLabel||'—'),'var(--ac)')
  ].join('');
  if(syncBtn){syncBtn.disabled=!(r.matched>0);syncBtn.style.opacity=r.matched>0?'1':'.5';}
  var rows=(r.rows||[]).slice(0,140).map(function(x){
    var st=x.matched?'<span style="color:var(--gr)">✅ '+escH(x.memberNick||x.memberName||'matched')+'</span>':'<span style="color:var(--ye)">⚠️ ยังไม่ match</span>';
    var metrics='G '+(x.referralsGiven90d||0)+' · R '+(x.referralsReceived90d||0)+' · V '+(x.visitors90d||0)+' · 121 '+(x.oneToOne90d||0)+' · L '+(x.late90d||0)+' · Abs '+(x.absent90d||0);
    return '<tr style="border-bottom:1px solid var(--bd)">'
      +'<td style="padding:7px 9px;font-weight:700">'+escH(x.rawName)+'</td>'
      +'<td style="padding:7px 9px;color:var(--sub)">'+escH(x.profession||'—')+'</td>'
      +'<td style="padding:7px 9px;color:var(--sub);max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escH(x.companyName||'')+'">'+escH(x.companyName||'—')+'</td>'
      +'<td style="padding:7px 9px;white-space:nowrap">'+escH(x.phone||'—')+'</td>'
      +'<td style="padding:7px 9px;font-size:10px;color:var(--sub);white-space:nowrap">'+escH(metrics)+'</td>'
      +'<td style="padding:7px 9px;white-space:nowrap">'+st+'</td>'
      +'</tr>';
  }).join('');
  var note=(r.rows||[]).length>140?'<div style="font-size:10px;color:var(--sub);margin-top:8px">แสดง 140 แถวแรก</div>':'';
  if(body)body.innerHTML='<div style="text-align:left;font-size:11px;color:var(--sub);margin-bottom:8px">Report: '+escH(r.chapter||'—')+' · '+escH(r.runAt||'ไม่พบเวลาในไฟล์')+'</div>'
    +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:780px">'
    +'<thead><tr style="border-bottom:1px solid var(--bd)">'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">ชื่อใน Roster</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Profession</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Company</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Phone</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">90 วัน</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Match</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>'+note;
}
function previewRosterImport(){
  var btn=document.getElementById('btn-roster-preview');
  var body=document.getElementById('roster-import-body');
  var msg=document.getElementById('roster-import-msg');
  var syncBtn=document.getElementById('btn-roster-sync');
  if(btn){btn.disabled=true;btn.textContent='⏳ Reading…';}
  if(syncBtn){syncBtn.disabled=true;syncBtn.style.opacity='.5';}
  if(body)body.innerHTML='<span style="color:var(--sub)">กำลังอ่าน PDF และ match กับสมาชิกในระบบ…</span>';
  if(msg)msg.textContent='';
  readRosterPdf(function(fileRes){
    if(!fileRes.ok){
      if(btn){btn.disabled=false;btn.textContent='Preview';}
      if(body)body.innerHTML='<span style="color:var(--re)">❌ '+escH(fileRes.error)+'</span>';
      return;
    }
    _rosterImport.pdfBase64=fileRes.base64;
    gsr('previewRosterImport',{role:S.role,pdfBase64:fileRes.base64},function(r){
      if(btn){btn.disabled=false;btn.textContent='Preview';}
      if(!r||!r.ok){
        if(body)body.innerHTML='<span style="color:var(--re)">❌ '+escH(r&&r.error||'Preview ไม่สำเร็จ')+'</span>';
        return;
      }
      _rosterImport.preview=r;
      renderRosterPreview(r);
      if(msg){msg.textContent='✅ Preview พร้อมแล้ว ตรวจ unmatched ก่อนกด Sync';msg.style.color='var(--gr)';}
    });
  });
}
function syncRosterImport(){
  var btn=document.getElementById('btn-roster-sync');
  var msg=document.getElementById('roster-import-msg');
  if(!_rosterImport.pdfBase64){toast('กรุณา Preview ก่อน Sync');return;}
  if(!confirm('Sync ข้อมูล profile ของสมาชิกที่ match แล้ว และบันทึก snapshot 90 วัน?'))return;
  if(btn){btn.disabled=true;btn.textContent='⏳ Syncing…';btn.style.opacity='.6';}
  if(msg){msg.textContent='กำลัง Sync…';msg.style.color='var(--sub)';}
  gsr('syncRosterImport',{role:S.role,pdfBase64:_rosterImport.pdfBase64},function(r){
    if(btn){btn.disabled=false;btn.textContent='Sync Matched';btn.style.opacity='1';}
    if(!r||!r.ok){
      if(msg){msg.textContent='❌ '+(r&&r.error||'Sync ไม่สำเร็จ');msg.style.color='var(--re)';}
      return;
    }
    if(msg){msg.textContent='✅ Sync แล้ว: profile '+(r.updatedProfiles||0)+' คน · snapshots '+(r.insertedSnapshots||0)+' รายการ'+((r.errors&&r.errors.length)?' · ⚠️ '+r.errors.join(' | '):'');msg.style.color=(r.errors&&r.errors.length)?'var(--ye)':'var(--gr)';}
    gsr('getDesktopDashboard',{role:'mc'},function(r2){if(r2&&r2.ok){D.mem=r2.members||[];D.sm=r2.summary||{};D.teams=r2.teams||[];D.ren=r2.renewal||[];}});
  });
}
var _palmsImport={pdfBase64:null,preview:null};
function readPalmsPdf(cb){
  var el=document.getElementById('palms-pdf-file');
  var file=el&&el.files&&el.files[0];
  if(!file){cb({ok:false,error:'กรุณาเลือก Summary PALMS PDF'});return;}
  if(!/pdf/i.test(file.type||file.name)){cb({ok:false,error:'ไฟล์ต้องเป็น PDF'});return;}
  var reader=new FileReader();
  reader.onload=function(e){cb({ok:true,base64:String(e.target.result||'')});};
  reader.onerror=function(){cb({ok:false,error:'อ่านไฟล์ไม่ได้'});};
  reader.readAsDataURL(file);
}
function tlColorKey(tl){
  return {green:'var(--gr)',yellow:'var(--ye)',red:'var(--re)',black:'var(--sub)',none:'var(--sub)'}[tl]||'var(--tx)';
}
function renderPalmsSummaryPreview(r){
  var summary=document.getElementById('palms-import-summary');
  var body=document.getElementById('palms-import-body');
  var syncBtn=document.getElementById('btn-palms-sync');
  if(summary)summary.innerHTML=[
    rosterCard('Rows',String(r.totalRows||0),'var(--tx)'),
    rosterCard('Matched',String(r.matched||0),(r.matched||0)?'var(--gr)':'var(--ye)'),
    rosterCard('Unmatched',String(r.unmatched||0),(r.unmatched||0)?'var(--ye)':'var(--gr)'),
    rosterCard('Avg Score',String(r.avgScore||0),(r.avgScore||0)>=70?'var(--gr)':(r.avgScore||0)>=50?'var(--ye)':'var(--re)')
  ].join('');
  if(syncBtn){syncBtn.disabled=!(r.matched>0);syncBtn.style.opacity=r.matched>0?'1':'.5';}
  var rows=(r.rows||[]).slice(0,140).map(function(x){
    var st=x.matched?'<span style="color:var(--gr)">✅ '+escH(x.memberNick||x.memberName||'matched')+'</span>':'<span style="color:var(--ye)">⚠️ ยังไม่ match</span>';
    var att='P '+(x.present||0)+' · A '+(x.absent||0)+' · L '+(x.late||0)+' · M '+(x.medical||0)+' · S '+(x.substitute||0);
    var act='RG '+((x.rgi||0)+(x.rgo||0))+' · V '+(x.visitors||0)+' · 121 '+(x.oneToOne||0)+' · CEU '+(x.ceu||0);
    return '<tr style="border-bottom:1px solid var(--bd)">'
      +'<td style="padding:7px 9px;font-weight:700">'+escH(x.rawName)+'</td>'
      +'<td style="padding:7px 9px;font-size:10px;color:var(--sub);white-space:nowrap">'+escH(att)+'</td>'
      +'<td style="padding:7px 9px;font-size:10px;color:var(--sub);white-space:nowrap">'+escH(act)+'</td>'
      +'<td style="padding:7px 9px;text-align:right">฿'+Number(x.revenueGivenThb||0).toLocaleString()+'</td>'
      +'<td style="padding:7px 9px;font-weight:800;color:'+tlColorKey(x.calculatedColor)+'">'+(x.calculatedScore||0)+' · '+escH(x.calculatedColor||'')+'</td>'
      +'<td style="padding:7px 9px;white-space:nowrap">'+st+'</td>'
      +'</tr>';
  }).join('');
  var note=(r.rows||[]).length>140?'<div style="font-size:10px;color:var(--sub);margin-top:8px">แสดง 140 แถวแรก</div>':'';
  if(body)body.innerHTML='<div style="text-align:left;font-size:11px;color:var(--sub);margin-bottom:8px">Report: '+escH(r.chapter||'—')+' · '+escH(r.periodFrom||'—')+' → '+escH(r.periodTo||'—')+' · run '+escH(r.runAt||'—')+'</div>'
    +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:780px">'
    +'<thead><tr style="border-bottom:1px solid var(--bd)">'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">ชื่อใน PALMS</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Attendance</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Activity</th>'
    +'<th style="padding:6px 9px;text-align:right;color:var(--sub)">Rev Given</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Score</th>'
    +'<th style="padding:6px 9px;text-align:left;color:var(--sub)">Match</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>'+note;
}
function previewPalmsSummaryImport(){
  var btn=document.getElementById('btn-palms-preview');
  var body=document.getElementById('palms-import-body');
  var msg=document.getElementById('palms-import-msg');
  var syncBtn=document.getElementById('btn-palms-sync');
  if(btn){btn.disabled=true;btn.textContent='⏳ Reading…';}
  if(syncBtn){syncBtn.disabled=true;syncBtn.style.opacity='.5';}
  if(body)body.innerHTML='<span style="color:var(--sub)">กำลังอ่าน PDF และคำนวณ PALMS…</span>';
  if(msg)msg.textContent='';
  readPalmsPdf(function(fileRes){
    if(!fileRes.ok){
      if(btn){btn.disabled=false;btn.textContent='Preview';}
      if(body)body.innerHTML='<span style="color:var(--re)">❌ '+escH(fileRes.error)+'</span>';
      return;
    }
    _palmsImport.pdfBase64=fileRes.base64;
    gsr('previewPalmsSummaryImport',{role:S.role,pdfBase64:fileRes.base64},function(r){
      if(btn){btn.disabled=false;btn.textContent='Preview';}
      if(!r||!r.ok){
        if(body)body.innerHTML='<span style="color:var(--re)">❌ '+escH(r&&r.error||'Preview ไม่สำเร็จ')+'</span>';
        return;
      }
      _palmsImport.preview=r;
      renderPalmsSummaryPreview(r);
      if(msg){msg.textContent='✅ Preview พร้อมแล้ว ตรวจ period และ unmatched ก่อนกด Sync';msg.style.color='var(--gr)';}
    });
  });
}
function syncPalmsSummaryImport(){
  var btn=document.getElementById('btn-palms-sync');
  var msg=document.getElementById('palms-import-msg');
  if(!_palmsImport.pdfBase64){toast('กรุณา Preview ก่อน Sync');return;}
  var p=_palmsImport.preview||{};
  if(!confirm('Sync Summary PALMS ช่วง '+(p.periodFrom||'—')+' → '+(p.periodTo||'—')+' ?\\n\\nระบบจะอัปเดต raw PALMS ล่าสุดของสมาชิกที่ match แล้ว'))return;
  if(btn){btn.disabled=true;btn.textContent='⏳ Syncing…';btn.style.opacity='.6';}
  if(msg){msg.textContent='กำลัง Sync Summary PALMS…';msg.style.color='var(--sub)';}
  gsr('syncPalmsSummaryImport',{role:S.role,pdfBase64:_palmsImport.pdfBase64},function(r){
    if(btn){btn.disabled=false;btn.textContent='Sync PALMS';btn.style.opacity='1';}
    if(!r||!r.ok){
      if(msg){msg.textContent='❌ '+(r&&r.error||'Sync ไม่สำเร็จ');msg.style.color='var(--re)';}
      return;
    }
    if(msg){msg.textContent='✅ Sync แล้ว: R2Y '+(r.updatedR2Y||0)+' คน · snapshots '+(r.insertedSnapshots||0)+' รายการ'+((r.errors&&r.errors.length)?' · ⚠️ '+r.errors.join(' | '):'');msg.style.color=(r.errors&&r.errors.length)?'var(--ye)':'var(--gr)';}
    gsr('getDesktopDashboard',{role:'mc'},function(r2){if(r2&&r2.ok){D.mem=r2.members||[];D.sm=r2.summary||{};D.teams=r2.teams||[];D.ren=r2.renewal||[];renderMCAll&&renderMCAll();}});
  });
}
// ── End Access Management ─────────────────────────────────────────

function renderGrowthWatch(){
  var tm=(document.getElementById('gw-team-filter')||{}).value||'';
  var gwMems=(D.mem||[]).filter(function(m){return m.mentoringMode==='growth_watch'&&(!tm||m.mentor===tm);});
  var normal=gwMems.filter(function(m){return(m.bniScore||0)>=GROWTH_WATCH_MIN_SCORE;});
  var atRisk=gwMems.filter(function(m){return(m.bniScore||0)<GROWTH_WATCH_MIN_SCORE;});
  // Summary cards
  document.getElementById('gw-summary').innerHTML=[
    {l:'Growth Watch ทั้งหมด',v:gwMems.length,c:'#60a5fa',i:'🔵'},
    {l:'ปกติดี',v:normal.length,c:'var(--gr)',i:'✅'},
    {l:'น่าเป็นห่วง',v:atRisk.length,c:'var(--re)',i:'⚠️'},
  ].map(function(c){return'<div class="kc" style="border:1px solid var(--bd)"><div class="kl">'+c.i+' '+c.l+'</div><div class="kv" style="color:'+c.c+'">'+c.v+'</div></div>';}).join('');
  // At-risk
  var arEl=document.getElementById('gw-atrisk');
  var arWrap=document.getElementById('gw-atrisk-wrap');
  if(atRisk.length){
    arWrap.style.display='';
    arEl.innerHTML=atRisk.map(function(m){
      var sn=m.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var hint=gwHint(m);
      return'<div class="ac2" style="display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:8px;border:1px solid rgba(248,113,113,.2);border-radius:8px;background:rgba(248,113,113,.05)">'
        +'<div style="flex:1"><div style="font-weight:600">'+esc(m.name)+'</div><div style="font-size:11px;color:var(--sub)">'+esc(m.mentor||'')+'</div>'+(hint?'<div style="font-size:10px;color:var(--re);margin-top:2px">'+hint+'</div>':'')+'</div>'
        +'<span class="badge b-'+tlK(m.bniTl)+'">'+m.bniScore+' pts</span>'
        +'<button class="bx" onclick="toggleGWMode(\''+sn+'\',\'growth_watch\')" style="font-size:11px;color:var(--re);border-color:rgba(248,113,113,.4)">ดึงกลับ Active</button>'
        +'<button class="bx" onclick="openIMD(\''+sn+'\')">📊</button>'
        +'</div>';
    }).join('');
  } else {arWrap.style.display='none';}
  // Normal
  var nEl=document.getElementById('gw-normal');
  var nWrap=document.getElementById('gw-normal-wrap');
  if(normal.length){
    nWrap.style.display='';
    nEl.innerHTML=normal.map(function(m){
      var sn=m.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var hint=gwHint(m);
      return'<div class="ac2" style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;border:1px solid var(--bd);border-radius:8px">'
        +'<div style="flex:1"><div style="font-weight:600">'+esc(m.name)+'</div><div style="font-size:11px;color:var(--sub)">'+esc(m.mentor||'')+'</div>'+(hint?'<div style="font-size:10px;color:var(--gr);margin-top:1px">'+hint+'</div>':'')+'</div>'
        +'<span class="badge b-'+tlK(m.bniTl)+'" style="font-size:11px">'+m.bniScore+' pts</span>'
        +'<button class="bx" onclick="toggleGWMode(\''+sn+'\',\'growth_watch\')" style="font-size:11px;color:var(--re);border-color:rgba(248,113,113,.3)">ดึงกลับ</button>'
        +'<button class="bx" onclick="openIMD(\''+sn+'\')">📊</button>'
        +'</div>';
    }).join('');
  } else {if(nWrap)nWrap.style.display='none';nEl.innerHTML='';}
  // Empty state
  var emEl=document.getElementById('gw-empty');
  if(emEl)emEl.style.display=gwMems.length?'none':'block';
  // Candidates: active members meeting the 65+ Growth Watch threshold.
  var candidates=(D.mem||[]).filter(function(m){
    return m.mentoringMode!=='growth_watch'&&(m.bniScore||0)>=GROWTH_WATCH_MIN_SCORE&&(!tm||m.mentor===tm);
  }).sort(function(a,b){return(b.bniScore||0)-(a.bniScore||0);}).slice(0,10);
  var candEl=document.getElementById('gw-candidates');
  if(candEl){
    if(candidates.length){
      candEl.innerHTML='<div style="font-size:12px;font-weight:700;color:var(--sub);margin-bottom:10px;margin-top:'+(gwMems.length?'16px':'0')+';padding-top:'+(gwMems.length?'16px':'0')+';border-top:'+(gwMems.length?'1px solid var(--bd)':'none')+'">💡 แนะนำให้เพิ่มเข้า Growth Watch</div>'
        +'<div style="font-size:11px;color:var(--sub);margin-bottom:10px">เฉพาะสมาชิกคะแนน '+GROWTH_WATCH_MIN_SCORE+'+ ที่พร้อมดูแลตัวเอง โดยให้ Growth Coordinator ติดตามแทน Mentor</div>'
        +candidates.map(function(m){
          var sn=m.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
          var hint=gwHint(m);
          var borderColor=m.bniTl==='red'?'rgba(248,113,113,.2)':m.bniTl==='yellow'?'rgba(251,191,36,.2)':'var(--bd)';
          return'<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;border:1px solid '+borderColor+';border-radius:8px;background:var(--sf2)">'
            +'<div style="flex:1"><div style="font-weight:600">'+esc(m.name)+'<span style="font-size:10px;color:var(--sub);font-weight:400;margin-left:6px">'+esc(m.mentor||'')+'</span></div>'
            +(hint?'<div style="font-size:10px;color:var(--ye);margin-top:2px">'+esc(hint)+'</div>':'')+'</div>'
            +'<span class="badge b-'+tlK(m.bniTl)+'" style="font-size:11px">'+m.bniScore+' pts</span>'
            +'<button class="bx" onclick="toggleGWMode(\''+sn+'\',\'active\')" style="font-size:11px;color:#60a5fa;border-color:rgba(96,165,250,.4)">🔵 ย้าย GW</button>'
            +'<button class="bx" onclick="openIMD(\''+sn+'\')">📊</button>'
            +'</div>';
        }).join('');
    } else {
      candEl.innerHTML='';
    }
  }
}

// ── Growth Watch for Growth role (reads G.mem, not D.mem) ──────────
function renderGrowthWatchGR(force){
  var mem=G.mem||[];
  if(!mem.length){
    // G.mem not loaded yet — trigger load then re-render
    if(force||!G._gwLoading){
      G._gwLoading=true;
      gsr('getGrowthData',{},function(r){
        G._gwLoading=false;
        if(r.ok){G.mem=(r.members||[]).map(normalizeGrowthMember);G.sm=r.summary||{};}
        renderGrowthWatchGR();
      });
    }
    return;
  }
  var tm=(document.getElementById('gw-gr-team-filter')||{}).value||'';
  var gwMems=mem.filter(function(m){return m.mentoringMode==='growth_watch'&&(!tm||m.mentor===tm);});
  var atRisk=gwMems.filter(function(m){return(m.score||0)<GROWTH_WATCH_MIN_SCORE;});
  var normal=gwMems.filter(function(m){return(m.score||0)>=GROWTH_WATCH_MIN_SCORE;});

  // Badge
  var badge=document.getElementById('badge-gw-gr');
  if(badge){badge.textContent=gwMems.length||'';badge.style.display=gwMems.length?'':'none';}

  // Summary cards
  document.getElementById('gw-gr-summary').innerHTML=[
    {l:'Growth Watch ทั้งหมด',v:gwMems.length,c:'#60a5fa',i:'🔵'},
    {l:'ปกติดี (≥'+GROWTH_WATCH_MIN_SCORE+')',v:normal.length,c:'var(--gr)',i:'✅'},
    {l:'น่าเป็นห่วง',v:atRisk.length,c:'var(--re)',i:'⚠️'},
  ].map(function(c){return'<div class="kc"><div class="kl">'+c.i+' '+c.l+'</div><div class="kv" style="color:'+c.c+'">'+c.v+'</div></div>';}).join('');

  function gwRow(m,isRisk){
    var sn=m.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var scoreColor=(m.score||0)>=70?'var(--gr)':(m.score||0)>=50?'var(--ye)':'var(--re)';
    var actionBtn=S.role==='mc'||S.role==='growth'
      ?'<button class="bx" onclick="toggleGWModeGR(\''+sn+'\',\'growth_watch\')" style="font-size:11px;color:var(--re);border-color:rgba(248,113,113,.4)">ดึงกลับ Active</button>'
      :'';
    return'<div style="display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:8px;border:1px solid '+(isRisk?'rgba(248,113,113,.25)':'var(--bd)')+';border-radius:8px;background:'+(isRisk?'rgba(248,113,113,.04)':'var(--sf2)')+'">'
      +'<div style="flex:1">'
      +'<div style="font-weight:600">'+esc(m.name)+(m.nick?'<span style="font-size:11px;color:var(--sub);font-weight:400;margin-left:5px">('+esc(m.nick)+')</span>':'')+'</div>'
      +'<div style="font-size:11px;color:var(--sub)">ทีม '+esc(m.mentor||'ไม่มีทีม')+'</div>'
      +'</div>'
      +'<span class="badge b-'+tlK(m.tl)+'" style="font-size:11px">'+(m.score||0)+' pts</span>'
      +actionBtn
      +'<button class="bx" onclick="openIMD(\''+sn+'\')">📊</button>'
      +'</div>';
  }

  var arEl=document.getElementById('gw-gr-atrisk');
  var arWrap=document.getElementById('gw-gr-atrisk-wrap');
  arWrap.style.display=atRisk.length?'':'none';
  if(atRisk.length)arEl.innerHTML=atRisk.map(function(m){return gwRow(m,true);}).join('');

  var nEl=document.getElementById('gw-gr-normal');
  var nWrap=document.getElementById('gw-gr-normal-wrap');
  nWrap.style.display=normal.length?'':'none';
  if(normal.length)nEl.innerHTML=normal.map(function(m){return gwRow(m,false);}).join('');

  document.getElementById('gw-gr-empty').style.display=gwMems.length?'none':'block';

  // Candidates
  var candidates=mem.filter(function(m){
    return m.mentoringMode!=='growth_watch'&&(m.score||0)>=GROWTH_WATCH_MIN_SCORE&&(!tm||m.mentor===tm);
  }).sort(function(a,b){return(b.score||0)-(a.score||0);}).slice(0,10);
  var candEl=document.getElementById('gw-gr-candidates');
  if(candidates.length){
    candEl.innerHTML='<div style="font-size:12px;font-weight:700;color:var(--sub);margin:16px 0 8px;padding-top:16px;border-top:1px solid var(--bd)">💡 แนะนำให้เพิ่มเข้า Growth Watch (คะแนน '+GROWTH_WATCH_MIN_SCORE+'+)</div>'
      +candidates.map(function(m){
        var sn=m.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var borderColor=m.tl==='red'?'rgba(248,113,113,.2)':m.tl==='yellow'?'rgba(251,191,36,.2)':'var(--bd)';
        return'<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;border:1px solid '+borderColor+';border-radius:8px;background:var(--sf2)">'
          +'<div style="flex:1"><div style="font-weight:600">'+esc(m.name)+'<span style="font-size:10px;color:var(--sub);font-weight:400;margin-left:6px">ทีม '+esc(m.mentor||'')+'</span></div></div>'
          +'<span class="badge b-'+tlK(m.tl)+'" style="font-size:11px">'+(m.score||0)+' pts</span>'
          +'<button class="bx" onclick="toggleGWModeGR(\''+sn+'\',\'active\')" style="font-size:11px;color:#60a5fa;border-color:rgba(96,165,250,.4)">🔵 ย้าย GW</button>'
          +'<button class="bx" onclick="openIMD(\''+sn+'\')">📊</button>'
          +'</div>';
      }).join('');
  } else {candEl.innerHTML='';}
}

function toggleGWModeGR(name,currentMode){
  var newMode=currentMode==='growth_watch'?'active':'growth_watch';
  var label=newMode==='growth_watch'?'ย้ายไป Growth Watch':'ดึงกลับ Active Mentoring';
  if(newMode==='growth_watch'){
    var member=(G.mem||[]).find(function(m){return m.name===name;});
    var score=member?(Number(member.score)||0):0;
    if(score<GROWTH_WATCH_MIN_SCORE){
      toast('❌ Growth Watch ต้องมีคะแนน '+GROWTH_WATCH_MIN_SCORE+'+ · '+name+' มี '+score+' คะแนน','err');
      return;
    }
  }
  if(!confirm(label+': "'+name+'"?'))return;
  ld(true);
  gsr('setMentoringMode',{memberName:name,mode:newMode},function(r){
    if(!r||!r.ok){ld(false);toast('❌ '+(r&&r.error||'เกิดข้อผิดพลาด'),'err');return;}
    toast('✅ '+label+': '+name,'ok');
    gsr('getGrowthData',{},function(r2){
      ld(false);
      if(r2.ok){G.mem=(r2.members||[]).map(normalizeGrowthMember);G.sm=r2.summary||{};}
      renderGrowthWatchGR();
    });
  });
}

// ══ IN-APP NOTIFICATIONS ══════════════════════════════════════════
var _notifData=[];
var _notifAutoShown=false;
function loadNotifications(){
  call('getNotifications',{},function(r){
    if(!r.ok)return;
    _notifData=r.notifications||[];
    var unread=r.unreadCount||0;
    var badge=document.getElementById('notif-badge');
    var btn=document.getElementById('btn-notif');
    if(btn)btn.style.display='';
    if(badge){badge.textContent=unread||'';badge.style.display=unread?'':'none';}
    // Auto-popup only once per session to avoid interrupting every data refresh
    if(!_notifAutoShown){
      var urgent=_notifData.filter(function(n){return!n.isRead&&(n.severity==='urgent'||n.severity==='warning');});
      if(urgent.length){_notifAutoShown=true;openNotifPanel();}
    }
  });
}
function openNotifPanel(){
  var modal=document.getElementById('notif-modal');
  if(!modal)return;
  _notifAutoShown=true;
  modal.style.display='flex';
  renderNotifList();
  // Mark all as read so badge clears and auto-popup won't retrigger on next load
  call('markNotificationsRead',{},function(r){
    var badge=document.getElementById('notif-badge');
    if(badge){badge.textContent='';badge.style.display='none';}
    _notifData.forEach(function(n){n.isRead=true;});
  });
}
function closeNotifPanel(){
  document.getElementById('notif-modal').style.display='none';
  _notifAutoShown=true;
}
function renderNotifList(){
  var el=document.getElementById('notif-list');
  if(!el)return;
  if(!_notifData.length){el.innerHTML='<div class="es">ไม่มี Notification</div>';return;}
  el.innerHTML=_notifData.map(function(n){
    var col=n.severity==='urgent'?'var(--re)':n.severity==='warning'?'var(--ye)':'var(--sub)';
    var ico=n.severity==='urgent'?'🚨':n.severity==='warning'?'⚠️':'ℹ️';
    return'<div style="padding:12px;border:1px solid var(--bd);border-left:3px solid '+col+';border-radius:8px;margin-bottom:8px;background:var(--sf2)">'
      +'<div style="display:flex;align-items:flex-start;gap:8px">'
      +'<span style="font-size:16px;flex-shrink:0">'+ico+'</span>'
      +'<div style="flex:1"><div style="font-weight:700;font-size:13px;margin-bottom:4px">'+esc(n.title)+'</div>'
      +(n.body?'<pre style="font-size:11px;color:var(--sub);margin:0;white-space:pre-wrap;font-family:inherit">'+esc(n.body)+'</pre>':'')
      +'<div style="font-size:10px;color:var(--sub);margin-top:4px">'+new Date(n.createdAt).toLocaleString('th-TH')+'</div>'
      +'</div>'
      +'<button class="bx" onclick="dismissNotif(\''+n.id+'\')" title="ปิดถาวร" style="font-size:11px;flex-shrink:0;padding:4px 8px">✕ ปิด</button>'
      +'</div></div>';
  }).join('');
}
function dismissNotif(id){
  call('dismissNotification',{id:id},function(r){
    if(!r.ok){toast('❌ '+(r.error||'ปิดไม่สำเร็จ'),'err');return;}
    _notifData=_notifData.filter(function(n){return n.id!==id;});
    renderNotifList();
    if(!_notifData.length){
      closeNotifPanel();
      var badge=document.getElementById('notif-badge');
      if(badge){badge.textContent='';badge.style.display='none';}
    }
  });
}
function dismissAllNotif(){
  call('dismissAllNotifications',{},function(r){
    if(!r.ok){toast('❌ '+(r.error||'ล้างไม่สำเร็จ'),'err');return;}
    _notifData=[];
    renderNotifList();
    closeNotifPanel();
    var badge=document.getElementById('notif-badge');
    if(badge){badge.textContent='';badge.style.display='none';}
    toast('✅ ล้าง Notifications แล้ว','ok');
  });
}

// ── Edit Member (name/nick/membership_start_date / seat transfer) ──
var _editMemberTarget = null;
function editMemberDlg(name, nick, startDate, memberId) {
  _editMemberTarget = { name: name, nick: nick, startDate: startDate, memberId: memberId };
  document.getElementById('em-orig-name').textContent = name;
  document.getElementById('em-name').value = name;
  document.getElementById('em-nick').value = nick || '';
  document.getElementById('em-start').value = startDate ? startDate.split('T')[0] : '';
  document.getElementById('em-clear-scores').checked = false;
  document.getElementById('em-clear-warn').style.display = 'none';
  document.getElementById('em-msg').textContent = '';
  document.getElementById('em-modal').style.display = 'flex';
}
function emClose() { document.getElementById('em-modal').style.display = 'none'; }
function emToggleClear() {
  var warn = document.getElementById('em-clear-warn');
  warn.style.display = document.getElementById('em-clear-scores').checked ? 'block' : 'none';
}
function emSave() {
  var newName  = document.getElementById('em-name').value.trim();
  var newNick  = document.getElementById('em-nick').value.trim();
  var newStart = document.getElementById('em-start').value.trim();
  var clearScores = document.getElementById('em-clear-scores').checked;
  var msg = document.getElementById('em-msg');
  if (!newName) { msg.textContent = '❌ กรุณาระบุชื่อ'; return; }
  if (clearScores && !confirm('⚠️ ล้างประวัติคะแนนทั้งหมดของ "'+_editMemberTarget.name+'" ?\n\nข้อมูลคะแนนรายเดือนจะหายถาวร ยืนยัน?')) return;
  msg.textContent = '⏳ กำลังบันทึก...';
  call('updateMember', {
    memberName: _editMemberTarget.name,
    newName: newName,
    newNick: newNick,
    membershipStartDate: newStart,
    clearScoreHistory: clearScores,
  }, function(r) {
    if (!r.ok) { msg.textContent = '❌ '+(r.error||'เกิดข้อผิดพลาด'); return; }
    emClose();
    toast('✅ อัปเดต "'+newName+'" เรียบร้อย'+(r.clearedScores?' (ล้างคะแนนแล้ว)':''), 'ok');
    gsr('getDesktopDashboard', {role:'mc'}, function(r2) {
      if (r2.ok) { D.mem=r2.members||[]; D.sm=r2.summary||{}; D.teams=r2.teams||[]; D.ren=r2.renewal||[]; }
      renderMCAll();
    });
  });
}

function archiveMemberDlg(name){
  var choice=prompt(
    '📁 จัดการสมาชิก: "'+name+'"\n\n'+
    'พิมพ์ตัวเลขเพื่อเลือก:\n'+
    '  1 = Archive (ซ่อน — กู้คืนได้)\n'+
    '  2 = ลบถาวร (ลบทั้งหมด — ไม่สามารถกู้คืนได้)\n'+
    '\n0 = ยกเลิก'
  );
  if(!choice||choice.trim()==='0')return;
  if(choice.trim()==='1'){
    call('archiveMember',{memberName:name},function(r){
      if(!r.ok){toast('❌ '+(r.error||'เกิดข้อผิดพลาด'),'err');return;}
      toast('✅ Archive เรียบร้อย: '+name,'ok');
      gsr('getDesktopDashboard',{role:'mc'},function(r2){if(r2.ok){D.mem=r2.members||[];D.sm=r2.summary||{};D.teams=r2.teams||[];D.ren=r2.renewal||[];}renderMem();renderKPI();renderDonut();renderMTTeams();});
    });
  } else if(choice.trim()==='2'){
    if(!confirm('⚠️ ลบ "'+name+'" ถาวร?\n\nจะลบข้อมูลทั้งหมด: คะแนน, Checklist, Notes, Renewal\n\nไม่สามารถกู้คืนได้! ยืนยันอีกครั้ง?'))return;
    call('deleteMember',{memberName:name},function(r){
      if(!r.ok){toast('❌ '+(r.error||'เกิดข้อผิดพลาด'),'err');return;}
      toast('✅ ลบถาวร: '+name,'ok');
      _8wLoaded=false;
      gsr('getDesktopDashboard',{role:'mc'},function(r2){if(r2.ok){D.mem=r2.members||[];D.sm=r2.summary||{};D.teams=r2.teams||[];D.ren=r2.renewal||[];}renderMCAll();load8WProgress();});
    });
  } else {
    toast('ไม่รู้จักคำสั่ง: '+choice,'err');
  }
}
function w8Remove(rowNum,memberName){
  if(!memberName){toast('ไม่พบชื่อสมาชิก','err');return;}
  var modal=document.getElementById('w8-del-modal');
  document.getElementById('w8-del-name').textContent='สมาชิก: "'+memberName+'"';
  modal.style.display='flex';
  function doDelete(alsoMaster){
    modal.style.display='none';
    gsr('removeNewMember',{role:S.role,rowNum:rowNum,memberName:memberName,alsoMaster:alsoMaster},function(r){
      if(!r.ok){toast('❌ '+(r.error||'เกิดข้อผิดพลาด'),'err');return;}
      var places=r.removed&&r.removed.length?r.removed.join(', '):'NEW MEMBERS';
      toast('✅ ลบ "'+memberName+'" ออกจาก: '+places,'ok');
      _8wLoaded=false;load8WProgress();
      gsr('getNewMembers',{role:S.role},function(r3){if(r3.ok){G.nm=r3.members||[];renderNM();}});
      if(alsoMaster){gsr('getDesktopDashboard',{role:'mc'},function(r2){if(r2.ok){D.mem=r2.members;D.sm=r2.summary;D.teams=r2.teams;D.ren=r2.renewal||[];}renderMem();renderMTTeams();});}
    });
  }
  document.getElementById('w8-del-nm-only').onclick=function(){doDelete(false);};
  document.getElementById('w8-del-all').onclick=function(){doDelete(true);};
}
function render8WProgress(nmList){
  function nmKey(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
  function passportFor8WMember(m,nm){
    var rows=(_passportData&&_passportData.members)||[];
    var keyId=String(m.id||nm.id||'');
    var keyName=nmKey(m.name||nm.name);
    var keyNick=nmKey(m.nick||m.nickname||nm.nick);
    return rows.find(function(p){
      var pm=p.members||{};
      return (keyId&&String(p.member_id||pm.id||'')===keyId)
        || (keyName&&nmKey(pm.name)===keyName)
        || (keyNick&&nmKey(pm.nickname)===keyNick);
    })||null;
  }
  function passportMiniCard(p){
    if(!p)return '<div style="border:1px dashed var(--bd);border-radius:9px;padding:8px 10px;margin:9px 0;background:var(--sf2);font-size:11px;color:var(--sub)">🛂 Passport: ยังไม่พบตาราง · กดแท็บ Passport แล้ว Sync สมาชิกใหม่</div>';
    var total=p.total||((p.sessions||[]).length)||0, done=p.done||0, pct=total?Math.round(done/total*100):0;
    var ns=p.nextSession||{};
    return '<div style="border:1px solid var(--bd);border-radius:10px;padding:9px 10px;margin:9px 0;background:linear-gradient(135deg,var(--sf2),var(--sf));">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">'
      +'<div style="font-size:11px;font-weight:900;color:var(--ac)">🛂 Passport '+done+'/'+total+'</div>'
      +'<button class="bsm" onclick="event.stopPropagation();sw(&quot;mc-passport&quot;,null,&quot;mc&quot;);loadPassportBoard()" style="font-size:10px;padding:3px 8px">เปิด</button>'
      +'</div>'
      +'<div style="height:6px;background:var(--bd);border-radius:99px;overflow:hidden;margin-bottom:6px"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--ac),var(--gr))"></div></div>'
      +'<div style="font-size:10px;color:var(--sub);line-height:1.45">Next: <b style="color:var(--tx)">W'+(ns.week_no||'—')+' '+esc(ns.title||'')+'</b><br>พบ: <b style="color:var(--tx)">'+esc(ns.assigned_lt_name||ns.lt_role||'ยังไม่กำหนด')+'</b> · '+passportFmtDate(ns.scheduled_date)+'</div>'
      +'</div>';
  }
  // Build map from D.mem by name
  var memMap={};
  (D.mem||[]).forEach(function(m){if(m.name)memMap[m.name]=m;});

  // Filter: members with bniDays <= 56 (8 weeks) OR in nmList
  var nmNames={},nmById={},nmByKey={};
  nmList.forEach(function(nm){
    if(nm.id)nmById[nm.id]=nm;
    if(nm.name)nmNames[nm.name]=nm;
    [nm.name,nm.nick].forEach(function(v){var k=nmKey(v);if(k&&!nmByKey[k])nmByKey[k]=nm;});
  });

  // Combine: new members = anyone in NM list OR bniDays<=56
  var newMems=[];
  var seen={};
  function matchNM(m){
    if(m.id&&nmById[m.id])return nmById[m.id];
    return nmByKey[nmKey(m.name)]||nmByKey[nmKey(m.nick)]||nmNames[m.name]||null;
  }
  // First from D.mem (has live PALMS data)
  (D.mem||[]).forEach(function(m){
    var nmMatch=matchNM(m);
    if((m.actual&&m.actual.bniDays>0&&m.actual.bniDays<=56)||nmMatch){
      var key=m.id||m.name;
      if(!seen[key]){seen[key]=1;newMems.push(m);}
    }
  });
  // Add any in NM list not yet in D.mem
  nmList.forEach(function(nm){
    var key=nm.id||nm.name;
    if(!seen[key]){seen[key]=1;newMems.push({id:nm.id,name:nm.name,nick:nm.nick,mentor:nm.mentor,bniTl:'none',bniScore:0,cats:null,actual:null,fastTrack:[]});}
  });
  newMems.sort(function(a,b){return(a.actual?a.actual.bniDays:0)-(b.actual?b.actual.bniDays:0);});

  // Update badge
  badge('badge-8w',newMems.length);

  // Summary
  var sumEl=document.getElementById('mc-8w-summary');
  if(newMems.length===0){
    document.getElementById('mc-8w-list').innerHTML='<div style="text-align:center;padding:30px;color:var(--sub)">✅ ไม่มีสมาชิกใหม่ที่อยู่ในช่วง 12 สัปดาห์แรก</div>';
    sumEl.innerHTML='';return;
  }
  var grCt=newMems.filter(function(m){return m.bniTl==='green';}).length;
  var ylCt=newMems.filter(function(m){return m.bniTl==='yellow';}).length;
  var rdCt=newMems.filter(function(m){return m.bniTl==='red'||m.bniTl==='black';}).length;
  sumEl.innerHTML='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">'
    +'<div class="kcard" style="flex:1;min-width:90px;text-align:center"><div style="font-size:20px;font-weight:800">'+newMems.length+'</div><div style="font-size:10px;color:var(--sub)">New Members</div></div>'
    +'<div class="kcard" style="flex:1;min-width:90px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--gr)">'+grCt+'</div><div style="font-size:10px;color:var(--sub)">🟢 Green</div></div>'
    +'<div class="kcard" style="flex:1;min-width:90px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--ye)">'+ylCt+'</div><div style="font-size:10px;color:var(--sub)">🟡 Yellow</div></div>'
    +'<div class="kcard" style="flex:1;min-width:90px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--re)">'+rdCt+'</div><div style="font-size:10px;color:var(--sub)">🔴 ต้องดูแล</div></div>'
    +'</div>';

  var tlC={green:'var(--gr)',yellow:'var(--ye)',red:'var(--re)',black:'#6b7280',blue:'#3b82f6',none:'#9ca3af'};
  var tlL={green:'🟢 Green',yellow:'🟡 Yellow',red:'🔴 Red',black:'⚫ New',blue:'🔵 New',none:'ยังไม่มีข้อมูล'};

  var html=newMems.map(function(m){
    var nm=matchNM(m)||{};
    var act=m.actual||{rg:0,rr:0,visitor:0,oToOne:0,ceu:0,tyfcb:0,bniDays:0,absent:0};
    var cats=m.cats||{absent:0,ref:0,tyfcb:0,visitor:0,one21:0,training:0};
    // Compute bniDays from joinedDate when R2Y hasn't synced yet (bniDays=0)
    var bniDays=act.bniDays||0;
    if(!bniDays&&(nm.joinedDate||nm.startDate)){
      var _jd=new Date(nm.joinedDate||nm.startDate);
      bniDays=Math.max(0,Math.floor((Date.now()-_jd.getTime())/86400000));
    }
    var weeks=Math.max(0,Math.floor(bniDays/7));
    var maxWk=12;
    var tlPct=Math.min(100,Math.round(weeks/maxWk*100));
    var tc=tlC[m.bniTl]||'#9ca3af';

    // Milestones — R2Y data first; fall back to checklist-based flags when R2Y not yet imported
    var ms=[
      {done:act.oToOne>=1||Boolean(nm.clHas121),icon:'🤝',label:'ทำ 1-2-1 แล้ว'+(act.oToOne>0?' ('+act.oToOne+'ครั้ง)':'')},
      {done:act.rg>=1||Boolean(nm.clHasReferral),icon:'💡',label:'ให้ Referral แล้ว'+(act.rg>0?' ('+act.rg+'ใบ)':'')},
      {done:act.visitor>=1||Boolean(nm.clHasVisitor),icon:'👥',label:'พา Visitor แล้ว'+(act.visitor>0?' ('+act.visitor+'คน)':'')},
      {done:act.ceu>=1||Boolean(nm.clHasTraining),icon:'📚',label:'เรียน Training แล้ว'+(act.ceu>0?' ('+act.ceu+'ครั้ง)':'')},
      {done:act.tyfcb>0,icon:'💰',label:'มี TYFCB'+(act.tyfcb>0?' ('+fmtB(act.tyfcb)+')':'')}
    ];
    var msDone=ms.filter(function(x){return x.done;}).length;

    // Category scores
    var catData=[
      {l:'ขาด',s:cats.absent,m:15,c:'var(--gr)'},
      {l:'Ref',s:cats.ref,m:15,c:'var(--gr)'},
      {l:'TYFB',s:cats.tyfcb,m:15,c:'var(--ye)'},
      {l:'Vis',s:cats.visitor,m:20,c:'#f472b6'},
      {l:'1-2-1',s:cats.one21,m:15,c:'#60a5fa'},
      {l:'CEU',s:cats.training,m:20,c:'#a78bfa'}
    ];

    // Fast track tip
    var ftTip='';
    if(m.fastTrack&&m.fastTrack.length){
      var top=m.fastTrack[0];
      ftTip='⚡ '+top.action+' → +'+top.gain+' pts → '+tlL[{green:'green',yellow:'yellow',red:'yellow',black:'red',blue:'red'}[m.bniTl]||'yellow'];
    }

    // NM checklist progress
    var nmProg=nm.progress||0;
    var nmStatus=nm.status||'';
    var passportRow=passportFor8WMember(m,nm);

    var safeNmName=m.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var safeNmRow=nm.rowNum||0;
    return '<div class="w8-card">'
      // Header
      +'<div class="w8-card-hdr">'
      +'<div class="w8-name">'+esc(m.nick||m.name)
        +(m.nick&&m.nick!==m.name?'<span style="font-size:11px;color:var(--sub);font-weight:400"> · '+esc(m.name)+'</span>':'')
        +'</div>'
      +'<span style="font-size:11px;font-weight:700;color:'+tc+'">'+tlL[m.bniTl||'none']+'</span>'
      +'<span style="font-size:18px;font-weight:800;color:'+tc+';margin-left:6px">'+(m.bniScore||0)+'</span>'
      +(S.role==='mc'?'<button onclick="w8Remove('+safeNmRow+',\''+safeNmName+'\')" style="background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.25);color:var(--re);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;margin-left:6px;flex-shrink:0" title="ลบออกจากระบบ">🗑️</button>':'')
      +'</div>'
      // Body
      +'<div class="w8-body">'
      // Meta
      +'<div style="display:flex;gap:12px;font-size:11px;color:var(--sub);margin-bottom:8px;flex-wrap:wrap;">'
      +'<span>👥 '+esc(m.mentor||nm.mentor||'—')+'</span>'
      +'<span>📅 W'+weeks+'/'+maxWk+'</span>'
      +(nm.joinedDate||nm.startDate?'<span>🗓️ เข้า BNI: '+esc(nm.joinedDate||nm.startDate)+'</span>':'')
      +(nm.w8Date?'<span style="color:'+(new Date()<new Date(nm.w8Date)?'var(--ye)':'var(--re)')+'">⏰ ครบ 8W: '+esc(nm.w8Date)+'</span>':'')
      +(bniDays>0?'<span>'+bniDays+' วัน</span>':'')
      +'</div>'
      // Timeline bar
      +'<div class="w8-tl-lbl"><span>สัปดาห์ที่ 1</span><span style="font-weight:700;color:'+tc+'">Week '+weeks+'/'+maxWk+'</span><span>สัปดาห์ที่ 12</span></div>'
      +'<div class="w8-tl"><div class="w8-tl-fill" style="width:'+tlPct+'%;background:'+tc+'"></div></div>'
      // Week badges — clickable to filter checklist
      +'<div style="display:flex;gap:4px;margin-bottom:10px;font-size:10px;flex-wrap:wrap;">'
      +[1,2,3,4,6,8,12].map(function(wk){
        var passed=weeks>=wk;
        var safeN=m.name.replace(/'/g,"\\'");
        return'<span onclick="event.stopPropagation();openNMCL(\''+safeN+'\','+wk+')" style="cursor:pointer;padding:2px 7px;border-radius:8px;background:'+(passed?'rgba(52,211,153,.2)':'var(--sf2)')+';color:'+(passed?'var(--gr)':'var(--sub)')+';border:1px solid '+(passed?'rgba(52,211,153,.25)':'var(--bd)')+'">'+  (passed?'✓ W'+wk:'W'+wk)+'</span>';
      }).join('')
      +'</div>'
      // Milestones
      +'<div style="font-size:10px;font-weight:700;color:var(--sub);margin-bottom:5px;letter-spacing:.05em;">MILESTONES ('+msDone+'/5)</div>'
      +'<div class="w8-ms">'
      +ms.map(function(ms2){
        var bg=ms2.done?'rgba(52,211,153,.15)':'rgba(248,113,113,.08)';
        var c=ms2.done?'var(--gr)':'var(--re)';
        return'<div class="w8-ms-item" style="background:'+bg+';color:'+c+'">'
          +(ms2.done?'✅':'❌')+' '+ms2.label+'</div>';
      }).join('')
      +'</div>'
      // Category scores
      +'<div class="w8-cats">'
      +catData.map(function(cd){
        var col=cd.s===cd.m?'var(--gr)':cd.s>0?cd.c:'#9ca3af';
        return'<div class="w8-cat"><div class="w8-cat-pts" style="color:'+col+'">'+cd.s+'</div><div class="w8-cat-lbl">/'+cd.m+'<br>'+cd.l+'</div></div>';
      }).join('')
      +'</div>'
      +passportMiniCard(passportRow)
      // Footer: NM checklist — entire section clickable
      +'<div class="w8-footer">'
      +'<div style="flex:1;cursor:pointer" onclick="event.stopPropagation();openNMCL(\''+m.name.replace(/'/g,"\\'")+'\')">'
      +'<div style="font-size:10px;color:var(--sub);margin-bottom:2px">📋 NM Checklist <span style="font-size:9px;opacity:.6">(กดเพื่อดู/แก้ไข)</span></div>'
      +'<div style="display:flex;align-items:center;gap:6px;">'
      +'<div class="w8-prog-bar"><div class="w8-prog-fill" style="width:'+nmProg+'%"></div></div>'
      +'<span style="font-size:12px;font-weight:800;color:'+(nmProg>=100?'var(--gr)':nmProg>0?'var(--ye)':'var(--sub)')+'">'+nmProg+'%</span>'
      +(nmStatus&&nmProg>0?'<span style="font-size:10px;color:var(--sub)">'+esc(nmStatus)+'</span>':'')
      +'</div></div>'
      +(act.absent>4?'<span style="font-size:11px;font-weight:700;color:var(--re)">⚠️ ขาด '+act.absent+'</span>':'')
      +'</div>'
      +(ftTip?'<div class="w8-ft">'+esc(ftTip)+'</div>':'')
      +'</div>'
      +'</div>';
  }).join('');
  document.getElementById('mc-8w-list').innerHTML='<div class="w8-grid">'+html+'</div>';
}

// ── NM Checklist Modal (MC + Mentor) ──────────────────────────
// Week-number → timeline strings mapping (from 41-task template)
var NMCL_WEEK_TL={
  1:['Orientation','1st Week'],
  2:['2nd Week'],
  3:['3rd Week'],
  4:['4th Week'],
  6:['5th Week','6th Week'],
  8:['7th Week','8th Week','60 Days'],
  12:['3 Months','12 Months']
};
var _nmclCurName='';
var _nmclCurData=null; // cached last loaded checklist data

function openNMCL(name,weekFilter){
  _nmclCurName=name;
  var el=document.getElementById('nmcl-body');
  var ttl=document.getElementById('nmcl-title');
  if(!el||!ttl)return;
  ttl.textContent='📋 Checklist: '+name+(weekFilter?' · W'+weekFilter:'');
  document.getElementById('nmcl-modal').style.display='flex';

  function renderNMCLData(d,wf){
    _nmclCurData=d;
    var pctColor=d.pct>=100?'var(--gr)':d.pct>=50?'var(--ye)':'var(--re)';
    var tlFilter=wf?NMCL_WEEK_TL[wf]||[]:null;
    var allTasks=d.tasks||[];
    var filtered=tlFilter?allTasks.filter(function(t){return tlFilter.indexOf(t.timeline)>=0;}):allTasks;

    var html='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:10px 12px;background:var(--sf2);border-radius:8px">'
      +'<div style="flex:1"><div style="height:6px;background:var(--bd);border-radius:3px"><div id="nmcl-pbar" style="height:100%;border-radius:3px;background:'+pctColor+';width:'+d.pct+'%;transition:width .3s"></div></div></div>'
      +'<span id="nmcl-pcnt" style="font-weight:700;color:'+pctColor+';font-size:12px;white-space:nowrap">'+d.done+'/'+d.total+' ('+d.pct+'%)</span>'
      +'<span id="nmcl-saved" style="font-size:10px;color:var(--sub);margin-left:6px"></span>'
      +'</div>';

    // Week filter chips
    html+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">';
    html+='<span onclick="openNMCL(\''+name+'\')" style="cursor:pointer;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;'
      +(!wf?'background:rgba(60,120,80,.25);color:var(--ac)':'background:var(--sf2);color:var(--sub)')
      +';border:1px solid var(--bd)">ทั้งหมด</span>';
    [1,2,3,4,6,8,12].forEach(function(w){
      var act=wf===w;
      var tls=NMCL_WEEK_TL[w]||[];
      var wTasks=allTasks.filter(function(t){return tls.indexOf(t.timeline)>=0;});
      var wDone=wTasks.filter(function(t){return t.pass;}).length;
      var wAll=wTasks.length;
      var wColor=wAll===0?'var(--sub)':wDone===wAll?'var(--gr)':wDone>0?'var(--ye)':'var(--re)';
      html+='<span onclick="openNMCL(\''+name+'\','+w+')" style="cursor:pointer;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;'
        +(act?'background:rgba(60,120,80,.25);color:var(--ac)':'background:var(--sf2);color:'+wColor)
        +';border:1px solid var(--bd)">W'+w+(wAll>0?' '+wDone+'/'+wAll:'')+'</span>';
    });
    html+='</div>';

    if(!filtered.length){html+='<div style="text-align:center;padding:20px;color:var(--sub)">ไม่มีข้อที่ตรงกับ W'+wf+'</div>';}

    var phases={},phaseOrder=[];
    filtered.forEach(function(t){if(!phases[t.phase]){phases[t.phase]=[];phaseOrder.push(t.phase);}phases[t.phase].push(t);});
    phaseOrder.forEach(function(phase){
      var pt=phases[phase];
      var pd=pt.filter(function(t){return t.pass;}).length;
      html+='<div style="font-size:11px;font-weight:700;color:var(--ac);margin:12px 0 6px;padding:4px 8px;background:rgba(60,120,80,.1);border-radius:5px;display:flex;justify-content:space-between">'
        +'<span>'+esc(phase)+'</span><span style="color:var(--sub)">'+pd+'/'+pt.length+'</span></div>';
      pt.forEach(function(t){
        var safeKey=t.itemKey.replace(/[^a-zA-Z0-9_]/g,'_');
        var tBg=t.pass?'rgba(52,211,153,.06)':t.nopass?'rgba(248,113,113,.06)':'transparent';
        html+='<div id="nmclrow_'+safeKey+'" style="display:flex;align-items:flex-start;gap:8px;padding:7px 8px;border-radius:6px;margin-bottom:4px;background:'+tBg+';border:1px solid var(--bd)">'
          +'<span style="font-size:14px;flex-shrink:0">'+(t.pass?'✅':t.nopass?'❌':'⏳')+'</span>'
          +'<div style="flex:1">'
          +'<div style="font-size:12px;font-weight:'+(t.pass||t.nopass?'600':'400')+'">'+esc(t.task)+'</div>'
          +(t.timeline?'<div style="font-size:10px;color:var(--sub)">'+esc(t.timeline)+'</div>':'')
          +(t.comment?'<div style="font-size:11px;color:var(--sub);margin-top:3px" id="nmclcmt_'+safeKey+'">💬 '+esc(t.comment)+'</div>':'<div style="font-size:11px;color:var(--sub);margin-top:3px;display:none" id="nmclcmt_'+safeKey+'"></div>')
          +'</div>'
          +'<div style="display:flex;gap:4px;flex-shrink:0">'
          +'<button id="nmclbtn_'+safeKey+'_p" onclick="nmclTick(\''+name+'\',\''+t.itemKey+'\',true,'+!!t.pass+','+!!t.nopass+')" style="font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid rgba(52,211,153,.3);background:'+(t.pass?'rgba(52,211,153,.3)':'rgba(52,211,153,.1)')+';color:var(--gr);cursor:pointer">'+(t.pass?'✅':'Pass')+'</button>'
          +'<button id="nmclbtn_'+safeKey+'_n" onclick="nmclTick(\''+name+'\',\''+t.itemKey+'\',false,'+!!t.pass+','+!!t.nopass+')" style="font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid rgba(248,113,113,.3);background:'+(t.nopass?'rgba(248,113,113,.2)':'rgba(248,113,113,.08)')+';color:var(--re);cursor:pointer">'+(t.nopass?'❌':'No')+'</button>'
          +'</div>'
          +'</div>';
      });
    });
    el.innerHTML=html;
    // Auto-save notice
    var s=document.getElementById('nmcl-saved');
    if(s)s.textContent='💾 บันทึกอัตโนมัติ';
  }

  if(_nmclCurData&&_nmclCurData._forMember===name){
    renderNMCLData(_nmclCurData,weekFilter);
    return;
  }
  el.innerHTML='<div style="text-align:center;padding:30px;color:var(--sub)">⏳ กำลังโหลด...</div>';
  gsr('getNMChecklist',{memberName:name},function(r){
    if(!r.ok){el.innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    r._forMember=name;
    renderNMCLData(r,weekFilter);
  });
}

function nmclTick(memberName,itemKey,pass,wasPass,wasNopass){
  var safeKey=itemKey.replace(/[^a-zA-Z0-9_]/g,'_');
  var pBtn=document.getElementById('nmclbtn_'+safeKey+'_p');
  var nBtn=document.getElementById('nmclbtn_'+safeKey+'_n');
  var rowEl=document.getElementById('nmclrow_'+safeKey);
  if(pBtn){pBtn.disabled=true;pBtn.textContent='⏳';}
  if(nBtn){nBtn.disabled=true;}

  gsr('saveNMCheckItem',{memberName:memberName,itemKey:itemKey,pass:pass,nopass:!pass},function(r){
    if(pBtn){pBtn.disabled=false;}
    if(nBtn){nBtn.disabled=false;}
    if(!r.ok){toast('❌ '+(r.error||''),'err');
      if(pBtn){pBtn.textContent=wasPass?'✅':'Pass';}
      if(nBtn){nBtn.textContent=wasNopass?'❌':'No';}
      return;
    }
    // Update row visually in-place
    if(pass){
      if(pBtn){pBtn.textContent='✅';pBtn.style.background='rgba(52,211,153,.3)';}
      if(nBtn){nBtn.textContent='No';nBtn.style.background='rgba(248,113,113,.08)';}
      if(rowEl){rowEl.style.background='rgba(52,211,153,.06)';}
    } else {
      if(pBtn){pBtn.textContent='Pass';pBtn.style.background='rgba(52,211,153,.1)';}
      if(nBtn){nBtn.textContent='❌';nBtn.style.background='rgba(248,113,113,.2)';}
      if(rowEl){rowEl.style.background='rgba(248,113,113,.06)';}
    }
    // Update icon in row
    if(rowEl){var ico=rowEl.querySelector('span:first-child');if(ico)ico.textContent=pass?'✅':'❌';}
    // Update saved badge
    var s=document.getElementById('nmcl-saved');if(s){s.textContent='✅ บันทึกแล้ว';s.style.color='var(--gr)';}
    // Invalidate cache so next open reloads fresh data
    if(_nmclCurData&&_nmclCurData._forMember===memberName){
      var t=(_nmclCurData.tasks||[]).find(function(x){return x.itemKey===itemKey;});
      if(t){t.pass=pass;t.nopass=!pass;}
      // Recalculate pct
      var done=(_nmclCurData.tasks||[]).filter(function(x){return x.pass;}).length;
      var pct=Math.round(done/41*100);
      _nmclCurData.done=done;_nmclCurData.pct=pct;
      var pb=document.getElementById('nmcl-pbar');var pc=document.getElementById('nmcl-pcnt');
      var pc2=pct>=100?'var(--gr)':pct>=50?'var(--ye)':'var(--re)';
      if(pb){pb.style.width=pct+'%';pb.style.background=pc2;}
      if(pc){pc.textContent=done+'/41 ('+pct+'%)';pc.style.color=pc2;}
    }
    // Refresh 8W card progress after 1s
    setTimeout(function(){_8wLoaded=false;load8WProgress();},1200);
  });
}
function closeNMCL(){document.getElementById('nmcl-modal').style.display='none';}

// ── 8W sub-tab switcher ───────────────────────────────────────
function sw8wSub(id){
  ['8w','rd','ml'].forEach(function(k){
    document.getElementById('sub-'+k).classList.toggle('on',k===id);
    document.getElementById('stb-'+k).classList.toggle('on',k===id);
  });
}

// ── 90-Day Review ─────────────────────────────────────────────
var _rdData=null, _rdLoaded=false;
var _rdYN={pp:null,po:null,gr:null,ex:null};

function rdLoad(force){
  if(_rdLoaded&&!force)return;
  document.getElementById('rd-list').innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:30px">⏳ กำลังโหลด...</div>';
  gsr('get90DayReviews',{role:'mc'},function(r){
    _rdLoaded=true;
    if(!r.ok){document.getElementById('rd-list').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _rdData=r.reviews||[];
    rdRender();
  });
}
function rdRender(){
  if(!_rdData){return;}
  var q=(document.getElementById('rd-filter').value||'').toLowerCase().trim();
  var rows=_rdData.filter(function(r){return!q||r.menteeName.toLowerCase().indexOf(q)>=0||r.mentorName.toLowerCase().indexOf(q)>=0;});
  if(!rows.length){
    document.getElementById('rd-list').innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:30px">'+(q?'ไม่พบข้อมูล':'ยังไม่มี 90-Day Review — กด "+ New Review" เพื่อเริ่ม')+'</div>';
    return;
  }
  var html='<div class="rd-tbl-wrap"><table class="rd-tbl"><thead><tr>'
    +'<th>วันที่</th><th>Mentee</th><th>Mentor</th><th>ทีม</th>'
    +'<th>Passport</th><th>PALMS</th><th>Graduate</th><th>ต่อ</th><th>Notes</th><th></th>'
    +'</tr></thead><tbody>'
    +rows.map(function(r){
      function yn(v){return v?'<span class="rd-badge rd-y">✅ ผ่าน</span>':'<span class="rd-badge rd-n">❌ ยัง</span>';}
      return '<tr>'
        +'<td style="white-space:nowrap;font-size:11px;">'+esc(r.date)+'</td>'
        +'<td style="font-weight:600">'+esc(r.menteeName)+'</td>'
        +'<td>'+esc(r.mentorName||'—')+'</td>'
        +'<td>'+esc(r.team||'—')+'</td>'
        +'<td>'+yn(r.passportOK)+'</td>'
        +'<td><span style="font-weight:700;color:'+(r.palmsPass?'var(--gr)':'var(--ye)')+'">'+r.palmsScore+'</span></td>'
        +'<td>'+yn(r.graduateReady)+'</td>'
        +'<td>'+(r.extendMentoring?'<span class="rd-badge" style="background:rgba(251,191,36,.15);color:var(--ye)">ต่อ</span>':'<span class="rd-badge" style="background:rgba(107,114,128,.15);color:#9ca3af">จบ</span>')+'</td>'
        +'<td style="max-width:180px;color:var(--sub);font-size:11px">'+esc(r.notes||'')+'</td>'
        +'<td><button class="rv-edt" onclick="rdOpenEdit('+r.rowNum+')">✏️</button></td>'
        +'</tr>';
    }).join('')
    +'</tbody></table></div>';
  document.getElementById('rd-list').innerHTML=html;
}
function rdOpenNew(){
  closeAllModals();
  _rdYN={pp:null,po:null,gr:null,ex:null};
  document.getElementById('rd-modal-title').textContent='📝 บันทึก 90-Day Review';
  document.getElementById('rd-row-num').value='';
  document.getElementById('rd-mentor').value='';
  document.getElementById('rd-team').value='';
  document.getElementById('rd-palms-score').value='';
  document.getElementById('rd-notes').value='';
  // Populate mentee dropdown from D.mem
  var sel=document.getElementById('rd-mentee');
  sel.innerHTML='<option value="">— เลือก Mentee —</option>';
  (D.mem||[]).sort(function(a,b){return(a.nick||a.name).localeCompare(b.nick||b.name);}).forEach(function(m){
    var o=document.createElement('option');o.value=m.name;o.textContent=(m.nick||m.name)+(m.nick&&m.nick!==m.name?' ('+m.name+')':'');
    sel.appendChild(o);
  });
  sel.onchange=function(){
    var m=(D.mem||[]).find(function(x){return x.name===this.value;},sel);
    if(m){document.getElementById('rd-mentor').value=m.mentor||'';document.getElementById('rd-team').value=m.mentor||'';}
  };
  ['pp','po','gr','ex'].forEach(function(k){rdYN(k,null,true);});
  document.getElementById('rd-modal').classList.add('open');
}
function rdOpenEdit(rowNum){
  var r=(_rdData||[]).find(function(x){return x.rowNum===rowNum;});
  if(!r)return;
  rdOpenNew();
  document.getElementById('rd-modal-title').textContent='✏️ แก้ไข 90-Day Review';
  document.getElementById('rd-row-num').value=rowNum;
  document.getElementById('rd-mentee').value=r.menteeName;
  document.getElementById('rd-mentor').value=r.mentorName;
  document.getElementById('rd-team').value=r.team;
  document.getElementById('rd-palms-score').value=r.palmsScore;
  document.getElementById('rd-notes').value=r.notes;
  rdYN('pp',r.passportOK?'y':'n',true);
  rdYN('po',r.palmsPass?'y':'n',true);
  rdYN('gr',r.graduateReady?'y':'n',true);
  rdYN('ex',r.extendMentoring?'y':'n',true);
}
function rdYN(key,val,silent){
  if(val===undefined)val=null;
  if(!silent)_rdYN[key]=val;
  else _rdYN[key]=val;
  var map={pp:'pp',po:'po',gr:'gr',ex:'ex'};
  var k=map[key];
  var yBtn=document.getElementById('rdyn-'+k+'-y');
  var nBtn=document.getElementById('rdyn-'+k+'-n');
  if(!yBtn||!nBtn)return;
  yBtn.className='rd-yn-opt'+(val==='y'?' sel-y':'');
  nBtn.className='rd-yn-opt'+(val==='n'?' sel-n':'');
}
function rdSave(){
  var menteeName=document.getElementById('rd-mentee').value.trim();
  if(!menteeName){alert('กรุณาเลือก Mentee');return;}
  if(_rdYN.pp===null||_rdYN.po===null||_rdYN.gr===null||_rdYN.ex===null){alert('กรุณาตอบทุกคำถาม');return;}
  var btn=document.querySelector('#rd-modal .rd-msave');
  btn.disabled=true;btn.textContent='⏳ กำลังบันทึก...';
  var payload={
    role:'mc',
    menteeName:menteeName,
    mentorName:document.getElementById('rd-mentor').value.trim(),
    team:document.getElementById('rd-team').value.trim(),
    palmsScore:parseFloat(document.getElementById('rd-palms-score').value)||0,
    passportOK:_rdYN.po==='y',
    palmsPass:_rdYN.pp==='y',
    graduateReady:_rdYN.gr==='y',
    extendMentoring:_rdYN.ex==='y',
    notes:document.getElementById('rd-notes').value.trim(),
    savedBy:'mc'
  };
  var rowNum=parseInt(document.getElementById('rd-row-num').value)||0;
  if(rowNum>=2)payload.rowNum=rowNum;
  gsr('save90DayReview',payload,function(r){
    btn.disabled=false;btn.textContent='💾 บันทึก Review';
    if(!r.ok){alert('❌ '+(r.error||'เกิดข้อผิดพลาด'));return;}
    rdCloseModal();
    _rdLoaded=false;rdLoad();
    toast('✅ บันทึก 90-Day Review แล้ว','ok');
  });
}
function rdCloseModal(){document.getElementById('rd-modal').classList.remove('open');}

// ── Mentor Activity Log ───────────────────────────────────────
var _mlData=null, _mlLoaded=false;

function mlLoad(force){
  if(_mlLoaded&&!force)return;
  document.getElementById('ml-list').innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:30px">⏳ กำลังโหลด...</div>';
  // Populate team filter
  var tfSel=document.getElementById('ml-filter-team');
  var teams=MENTOR_TEAMS;
  if(tfSel.options.length<=1){teams.forEach(function(t){var o=document.createElement('option');o.value=t.toLowerCase();o.textContent=t;tfSel.appendChild(o);});}
  gsr('getMentorLogs',{role:'mc'},function(r){
    _mlLoaded=true;
    if(!r.ok){document.getElementById('ml-list').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _mlData=r.logs||[];
    mlRender();
  });
}
function mlRender(){
  if(!_mlData)return;
  var qTeam=(document.getElementById('ml-filter-team').value||'').toLowerCase().trim();
  var qMentee=(document.getElementById('ml-filter-mentee').value||'').toLowerCase().trim();
  var rows=_mlData.filter(function(r){
    if(qTeam&&r.team.toLowerCase()!==qTeam)return false;
    if(qMentee&&r.menteeName.toLowerCase().indexOf(qMentee)<0&&r.mentorName.toLowerCase().indexOf(qMentee)<0)return false;
    return true;
  });
  if(!rows.length){
    document.getElementById('ml-list').innerHTML='<div style="color:var(--sub);font-size:13px;text-align:center;padding:30px">'+(qTeam||qMentee?'ไม่พบข้อมูล':'ยังไม่มี Mentor Log — กด "+ Log Activity" เพื่อเริ่ม')+'</div>';
    return;
  }
  var ACTIVITIES_SHORT={'โทรหา Mentee':'📞 โทร','นัด 1-2-1 กับ Mentee':'🤝 1-2-1','แนะนำ Mentee ให้รู้จักสมาชิก':'👥 แนะนำ','ให้ feedback presentation':'💬 Feedback','นั่งข้างๆ Mentee ในการประชุม':'🪑 นั่งข้างๆ','ช่วย Mentee เรื่อง referral':'💡 Referral','อื่นๆ':'📌 อื่นๆ'};
  var html='<div class="ml-tbl-wrap"><table class="ml-tbl"><thead><tr>'
    +'<th>วันที่</th><th>Mentor</th><th>Mentee</th><th>ทีม</th><th>สัปดาห์</th><th>กิจกรรม</th><th>Notes</th>'
    +'</tr></thead><tbody>'
    +rows.slice().reverse().map(function(r){
      var short=ACTIVITIES_SHORT[r.activity]||r.activity;
      return '<tr>'
        +'<td style="white-space:nowrap;font-size:11px">'+esc(r.date)+'</td>'
        +'<td style="font-weight:600">'+esc(r.mentorName||'—')+'</td>'
        +'<td>'+esc(r.menteeName)+'</td>'
        +'<td>'+esc(r.team||'—')+'</td>'
        +'<td style="text-align:center">'+(r.week||'—')+'</td>'
        +'<td style="white-space:nowrap">'+esc(short)+'</td>'
        +'<td style="max-width:200px;color:var(--sub);font-size:11px">'+esc(r.notes||'')+'</td>'
        +'</tr>';
    }).join('')
    +'</tbody></table></div>';
  document.getElementById('ml-list').innerHTML=html;
}
function mlOpenNew(){
  closeAllModals();
  var teams=MENTOR_TEAMS||MENTOR_TEAMS;
  // Mentors dropdown
  var mSel=document.getElementById('ml-mentor');
  mSel.innerHTML='<option value="">— เลือก Mentor —</option>';
  teams.forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=t;mSel.appendChild(o);});
  // Mentees dropdown
  var mtSel=document.getElementById('ml-mentee');
  mtSel.innerHTML='<option value="">— เลือก Mentee —</option>';
  (D.mem||[]).sort(function(a,b){return(a.nick||a.name).localeCompare(b.nick||b.name);}).forEach(function(m){
    var o=document.createElement('option');o.value=m.name;o.textContent=(m.nick||m.name)+(m.nick&&m.nick!==m.name?' ('+m.name+')':'');
    mtSel.appendChild(o);
  });
  // Auto-fill team when mentee selected
  mtSel.onchange=function(){
    var m=(D.mem||[]).find(function(x){return x.name===this.value;},mtSel);
    if(m){
      document.getElementById('ml-team').value=m.mentor||'';
      if(m.mentor)mSel.value=m.mentor;
    }
  };
  document.getElementById('ml-week').value='';
  document.getElementById('ml-activity').value='';
  document.getElementById('ml-notes').value='';
  document.getElementById('ml-team').value='';
  document.getElementById('ml-modal').classList.add('open');
}
function mlSave(){
  var mentorName=document.getElementById('ml-mentor').value.trim();
  var menteeName=document.getElementById('ml-mentee').value.trim();
  var activity=document.getElementById('ml-activity').value.trim();
  if(!mentorName||!menteeName){alert('กรุณาเลือก Mentor และ Mentee');return;}
  if(!activity){alert('กรุณาเลือกกิจกรรม');return;}
  var btn=document.querySelector('#ml-modal .ml-msave');
  btn.disabled=true;btn.textContent='⏳ กำลังบันทึก...';
  gsr('saveMentorLog',{
    role:'mc',
    mentorName:mentorName,
    menteeName:menteeName,
    team:document.getElementById('ml-team').value.trim(),
    week:parseInt(document.getElementById('ml-week').value)||0,
    activity:activity,
    notes:document.getElementById('ml-notes').value.trim()
  },function(r){
    btn.disabled=false;btn.textContent='💾 บันทึก';
    if(!r.ok){alert('❌ '+(r.error||'เกิดข้อผิดพลาด'));return;}
    mlCloseModal();
    _mlLoaded=false;mlLoad();
    toast('✅ บันทึก Mentor Log แล้ว','ok');
  });
}
function mlCloseModal(){document.getElementById('ml-modal').classList.remove('open');}

// ── LT Monthly Summary PDF ────────────────────────────────────
function openLTSummary(){
  if(!_scData){alert('กรุณาโหลด Scorecard ก่อน');return;}
  var sc=_scData, mv=sc.movement||{};
  var today=new Date();
  var months=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var monthYear=months[today.getMonth()]+' '+(today.getFullYear()+543);

  // Helpers
  function zoneTH(z){return{green:'🟢 เขียว',yellow:'🟡 เหลือง',red:'🔴 แดง',black:'⚫ ดำ',none:'—',blue:'🔵 ใหม่'}[z]||z;}
  function zoneC(z){return{green:'#15803d',yellow:'#92400e',red:'#9f1239',black:'#374151',blue:'#1e40af',none:'#9ca3af'}[z]||'#374151';}
  function zoneBg(z){return{green:'#f0fdf4',yellow:'#fffbeb',red:'#fff1f2',black:'#f9fafb',blue:'#eff6ff',none:'#f9fafb'}[z]||'#f9fafb';}
  function diffStr(d){if(d===null||d===undefined)return'—';return(d>0?'+':'')+d;}
  function diffC(d){return d>0?'#15803d':d<0?'#9f1239':'#6b7280';}
  function fmtNum(n){if(!n)return'0';if(n>=1000000)return(n/1000000).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(0)+'K';return''+Math.round(n);}

  // Chapter summary from D
  var allMem=D.mem||[];
  var chap={total:0,green:0,yellow:0,red:0,black:0,blue:0,absent0:0,avgScore:0};
  var totScore=0,scoreCt=0;
  allMem.forEach(function(m){
    if(!m.name)return;
    chap.total++;
    if(m.bniTl&&m.bniTl!=='none'){chap[m.bniTl]=(chap[m.bniTl]||0)+1;}
    if(m.absent===0)chap.absent0++;
    if(m.bniScore>0){totScore+=m.bniScore;scoreCt++;}
  });
  chap.avgScore=scoreCt?Math.round(totScore/scoreCt):0;

  // Build D.mem lookup by name for cats/absent
  var memMap={};
  allMem.forEach(function(m){memMap[m.name]=m;});

  // ── HTML ──
  var h='<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">'
    +'<title>BNI IDEAL Monthly Summary - '+sc.thisMonth+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:\'Sarabun\',\'Noto Sans Thai\',sans-serif;background:#fff;color:#1f2937;font-size:13px;padding:28px 32px;}'
    +'.page-break{page-break-before:always;margin-top:24px;}'
    +'h1{font-size:20px;font-weight:800;color:#1e3a5f;margin-bottom:2px;}'
    +'h2{font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px;border-left:4px solid #1e3a5f;padding-left:9px;}'
    +'h3{font-size:13px;font-weight:700;color:#374151;margin-bottom:7px;}'
    +'.sub{font-size:11px;color:#6b7280;}'
    +'.section{margin-bottom:22px;}'
    +'.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;}'
    +'.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}'
    +'.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}'
    +'.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}'
    +'.stat{text-align:center;padding:10px;background:#f1f5f9;border-radius:6px;}'
    +'.stat-num{font-size:22px;font-weight:800;line-height:1.1;}'
    +'.stat-lbl{font-size:10px;color:#6b7280;margin-top:2px;}'
    +'table{width:100%;border-collapse:collapse;font-size:12px;}'
    +'th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-weight:600;font-size:11px;}'
    +'td{padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:middle;}'
    +'tr:nth-child(even)td{background:#f8fafc;}'
    +'.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;}'
    +'.zone-bar{height:8px;border-radius:4px;display:inline-block;}'
    +'.team-hdr{background:#1e3a5f;color:#fff;padding:8px 12px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center;}'
    +'.team-box{border:1px solid #e2e8f0;border-radius:6px;margin-bottom:14px;overflow:hidden;}'
    +'.alert-row{background:#fff1f2;border-left:3px solid #dc2626;padding:7px 10px;margin-bottom:5px;border-radius:0 5px 5px 0;font-size:12px;}'
    +'.ok-row{background:#f0fdf4;border-left:3px solid #16a34a;padding:7px 10px;margin-bottom:5px;border-radius:0 5px 5px 0;font-size:12px;}'
    +'@media print{body{padding:12px 16px;}.page-break{page-break-before:always;}}'
    +'</style></head><body>';

  // ── HEADER ──
  h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #1e3a5f;">'
    +'<div>'
    +'<h1>📊 BNI IDEAL — Monthly Summary</h1>'
    +'<div style="font-size:14px;font-weight:700;color:var(--ye);margin-top:2px;">เดือน '+monthYear+' | รอบ '+sc.prevMonth+' → '+sc.thisMonth+'</div>'
    +'<div class="sub" style="margin-top:3px;">จัดทำ: '+today.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})+' | สำหรับ LT Team</div>'
    +'</div>'
    +'<div style="text-align:right"><div style="font-size:28px;font-weight:900;color:#1e3a5f;">BNI</div><div style="font-size:11px;color:#6b7280;">IDEAL Chapter</div></div>'
    +'</div>';

  // ── SECTION 1: Chapter Overview ──
  h+='<div class="section"><h2>1. ภาพรวม Chapter</h2>'
    +'<div class="grid5" style="margin-bottom:12px;">'
    +'<div class="stat"><div class="stat-num" style="color:#1e3a5f">'+chap.total+'</div><div class="stat-lbl">สมาชิกทั้งหมด</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#15803d">'+chap.green+'</div><div class="stat-lbl">🟢 Green</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#92400e">'+chap.yellow+'</div><div class="stat-lbl">🟡 Yellow</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#9f1239">'+chap.red+'</div><div class="stat-lbl">🔴 Red</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#374151">'+chap.black+'</div><div class="stat-lbl">⚫ ดำ/ใหม่</div></div>'
    +'</div>'
    +'<div class="grid3">'
    +'<div class="stat"><div class="stat-num" style="color:#1e3a5f">'+chap.avgScore+'</div><div class="stat-lbl">คะแนนเฉลี่ย Chapter</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:'+(chap.green>0?'#15803d':'#9f1239')+'">'+Math.round(chap.green/Math.max(1,chap.total)*100)+'%</div><div class="stat-lbl">% Green</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#15803d">'+chap.absent0+'</div><div class="stat-lbl">ไม่เคยขาด</div></div>'
    +'</div></div>';

  // ── SECTION 2: Team Scorecard Summary Table ──
  h+='<div class="section"><h2>2. สรุปผลงานแต่ละทีม Mentor</h2>'
    +'<table><thead><tr>'
    +'<th>ทีม Mentor</th><th style="text-align:center">คะแนนเฉลี่ย '+sc.thisMonth+'</th>'
    +'<th style="text-align:center">คะแนนเฉลี่ย '+sc.prevMonth+'</th>'
    +'<th style="text-align:center">เปลี่ยนแปลง</th>'
    +'<th style="text-align:center">🟢</th><th style="text-align:center">🟡</th>'
    +'<th style="text-align:center">🔴</th><th style="text-align:center">⚫</th>'
    +'<th style="text-align:center">สมาชิก</th><th>Grade</th>'
    +'</tr></thead><tbody>';
  sc.teams.forEach(function(t){
    var dc=t.diff>0?'#15803d':t.diff<0?'#9f1239':'#6b7280';
    var da=(t.diff>0?'▲+':t.diff<0?'▼':'')+Math.abs(t.diff||0);
    var dtm=D.teams.find(function(x){return x.team===t.team;})||{};
    h+='<tr>'
      +'<td style="font-weight:700">'+t.team+'</td>'
      +'<td style="text-align:center;font-weight:700;color:#1e3a5f">'+t.thisAvg+'</td>'
      +'<td style="text-align:center;color:#6b7280">'+t.prevAvg+'</td>'
      +'<td style="text-align:center;font-weight:700;color:'+dc+'">'+da+'</td>'
      +'<td style="text-align:center;color:#15803d;font-weight:600">'+(dtm.green||0)+'</td>'
      +'<td style="text-align:center;color:#92400e;font-weight:600">'+(dtm.yellow||0)+'</td>'
      +'<td style="text-align:center;color:#9f1239;font-weight:600">'+(dtm.red||0)+'</td>'
      +'<td style="text-align:center;color:#374151;font-weight:600">'+(dtm.blue||0)+'</td>'
      +'<td style="text-align:center">'+(t.members?t.members.length:0)+'</td>'
      +'<td><span style="font-weight:700;color:'+(t.grade==='A+'||t.grade==='A'?'#15803d':t.grade==='B+'?'#2563eb':t.grade==='B'?'#92400e':'#9f1239')+'">'+t.grade+'</span></td>'
      +'</tr>';
  });
  h+='</tbody></table></div>';

  // ── SECTION 3: Zone Changes ──
  h+='<div class="section"><h2>3. การเปลี่ยนแปลง Zone เดือนนี้</h2><div class="grid2">';
  // Achievements (zone up)
  h+='<div><h3 style="color:#15803d">🏆 เลื่อนขึ้น Zone ('+(mv.zoneUp?mv.zoneUp.length:0)+' คน)</h3>';
  if(mv.zoneUp&&mv.zoneUp.length){
    mv.zoneUp.forEach(function(m){
      h+='<div class="ok-row"><b>'+m.nick+'</b> <span class="sub">('+m.team+')</span>'
        +' &nbsp; <span style="color:#6b7280">'+m.from+' → '+m.to+'</span>'
        +' &nbsp; <b style="color:#15803d">+'+m.diff+' pts</b></div>';
    });
  }else{h+='<div class="sub" style="padding:8px">ไม่มีการเลื่อนขึ้น Zone</div>';}
  h+='</div>';
  // Declined
  h+='<div><h3 style="color:#9f1239">⚠️ ลดลง Zone ('+(mv.zoneDn?mv.zoneDn.length:0)+' คน)</h3>';
  if(mv.zoneDn&&mv.zoneDn.length){
    mv.zoneDn.forEach(function(m){
      h+='<div class="alert-row"><b>'+m.nick+'</b> <span class="sub">('+m.team+')</span>'
        +' &nbsp; <span style="color:#6b7280">'+m.from+' → '+m.to+'</span>'
        +' &nbsp; <b style="color:#9f1239">'+m.diff+' pts</b></div>';
    });
  }else{h+='<div class="sub" style="padding:8px">ไม่มีการลดลง Zone</div>';}
  h+='</div></div></div>';

  // ── SECTION 4: Per Team Detail ── (page break)
  h+='<div class="page-break"><h2>4. รายละเอียดสมาชิกแต่ละทีม ('+sc.prevMonth+' → '+sc.thisMonth+')</h2>';
  var ltZOrd={black:0,red:1,yellow:2,green:3,none:-1};
  sc.teams.forEach(function(t){
    var mems3=t.members||[];
    var t3Impr=mems3.filter(function(m){return m.diff!=null&&m.diff>0;}).sort(function(a,b){return b.diff-a.diff;});
    var t3Decl=mems3.filter(function(m){return m.diff!=null&&m.diff<0;}).sort(function(a,b){return a.diff-b.diff;});
    var t3ZUp=mems3.filter(function(m){return m.prevZone&&m.prevZone!=='none'&&(ltZOrd[m.thisZone]||0)>(ltZOrd[m.prevZone]||0);});
    var t3ZDn=mems3.filter(function(m){return m.prevZone&&m.prevZone!=='none'&&(ltZOrd[m.thisZone]||0)<(ltZOrd[m.prevZone]||0);});
    var t3RB=mems3.filter(function(m){return m.thisZone==='red'||m.thisZone==='black';});
    var nParts3=[];
    if(t3Impr.length){nParts3.push('<span style="color:#15803d">↑ ขึ้น '+t3Impr.length+' คน'+(t3Impr[0]?' (ดีสุด: '+t3Impr[0].nick+' +'+t3Impr[0].diff+')':'')+'</span>');}
    if(t3Decl.length){nParts3.push('<span style="color:#9f1239">↓ ลด '+t3Decl.length+' คน</span>');}
    if(t3ZUp.length){nParts3.push('<span style="color:#15803d">🏆 Zone↑: '+t3ZUp.map(function(m){return m.nick;}).join(', ')+'</span>');}
    if(t3ZDn.length){nParts3.push('<span style="color:#9f1239">⚠️ Zone↓: '+t3ZDn.map(function(m){return m.nick;}).join(', ')+'</span>');}
    nParts3.push(t3RB.length?'<span style="color:#9f1239">🚨 ต้องดูแล '+t3RB.length+' คน</span>':'<span style="color:#15803d">✅ ไม่มี Red/Black</span>');
    var dc2=t.diff>0?'#15803d':t.diff<0?'#9f1239':'#6b7280';
    h+='<div class="team-box" style="margin-bottom:14px;">'
      +'<div class="team-hdr">'
      +'<span>👥 '+t.team+'</span>'
      +'<span>Avg: '+t.thisAvg+' pts &nbsp; '
        +'<span style="color:'+(t.diff>0?'#86efac':t.diff<0?'#fca5a5':'#d1d5db')+'">('+(t.diff>0?'+':'')+t.diff+' vs '+sc.prevMonth+')</span></span>'
      +'</div>'
      +'<div style="padding:6px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-size:11px;line-height:1.8">'+nParts3.join(' &nbsp;·&nbsp; ')+'</div>'
      +'<table><thead><tr>'
      +'<th>ชื่อเล่น</th><th>ชื่อเต็ม</th>'
      +'<th style="text-align:center">'+sc.thisMonth+'</th>'
      +'<th style="text-align:center">'+sc.prevMonth+'</th>'
      +'<th style="text-align:center">เปลี่ยน</th>'
      +'<th style="text-align:center">Zone</th>'
      +'<th style="text-align:center">ขาด</th>'
      +'<th style="text-align:center">TYFCB</th>'
      +'</tr></thead><tbody>';
    (t.members||[]).forEach(function(m){
      var live=memMap[m.name]||{};
      var absent=live.absent||0;
      var tyfcb=live.actual?fmtNum(live.actual.tyfcb||0):'—';
      var rowBg=(m.thisZone==='red'||m.thisZone==='black')?'#fff1f2':(m.thisZone==='green'?'#f0fdf4':'');
      h+='<tr style="'+(rowBg?'background:'+rowBg:'')+'">'
        +'<td style="font-weight:700">'+esc(m.nick)+'</td>'
        +'<td style="color:#6b7280;font-size:11px">'+esc(m.name)+'</td>'
        +'<td style="text-align:center;font-weight:700;color:'+zoneC(m.thisZone)+'">'+(m.thisScore||'—')+'</td>'
        +'<td style="text-align:center;color:#6b7280">'+(m.prevScore||'—')+'</td>'
        +'<td style="text-align:center;font-weight:700;color:'+diffC(m.diff)+'">'+diffStr(m.diff)+'</td>'
        +'<td style="text-align:center"><span style="background:'+zoneBg(m.thisZone)+';color:'+zoneC(m.thisZone)+';padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">'+zoneTH(m.thisZone)+'</span></td>'
        +'<td style="text-align:center;color:'+(absent>4?'#9f1239':'#374151')+';font-weight:'+(absent>4?'700':'400')+'">'+absent+'</td>'
        +'<td style="text-align:center;color:#1e3a5f">'+tyfcb+'</td>'
        +'</tr>';
    });
    h+='</tbody></table></div>';
  });
  h+='</div>';

  // ── SECTION 5: Monthly Action Plan ──
  h+='<div class="page-break"><h2>5. แผนดูแลเดือนนี้</h2>';
  // Members needing attention (red/black + absent >= 3)
  var needAttn=allMem.filter(function(m){return m.bniTl==='red'||m.bniTl==='black'||m.absent>4;})
    .sort(function(a,b){return(a.bniScore||0)-(b.bniScore||0);});
  if(needAttn.length){
    h+='<h3 style="color:#9f1239;margin-bottom:8px">🚨 สมาชิกที่ต้องดูแลเร่งด่วน ('+needAttn.length+' คน)</h3>'
      +'<table><thead><tr><th>ชื่อเล่น</th><th>ทีม Mentor</th><th style="text-align:center">Zone</th><th style="text-align:center">คะแนน</th><th style="text-align:center">ขาด</th><th>สิ่งที่ต้องทำ</th></tr></thead><tbody>';
    needAttn.forEach(function(m){
      var actions=[];
      if(m.absent>4)actions.push('ติดตามการขาดประชุม ('+m.absent+' ครั้ง)');
      if(m.bniTl==='red'||m.bniTl==='black'){
        var cats=m.cats||{};
        if((cats.visitor||0)<10)actions.push('เพิ่ม Visitor');
        if((cats.ref||0)<10)actions.push('เพิ่ม Referral');
        if((cats.tyfcb||0)<5)actions.push('ปิด Business (TYFCB)');
        if((cats.one21||0)<10)actions.push('เพิ่ม 1-2-1');
      }
      h+='<tr style="background:'+(m.bniTl==='red'?'#fff1f2':'#f9fafb')+'">'
        +'<td style="font-weight:700">'+esc(m.nick||m.name)+'</td>'
        +'<td style="color:#6b7280">'+esc(m.mentor||'—')+'</td>'
        +'<td style="text-align:center"><span style="color:'+zoneC(m.bniTl)+';font-weight:700">'+zoneTH(m.bniTl)+'</span></td>'
        +'<td style="text-align:center;font-weight:700;color:'+zoneC(m.bniTl)+'">'+(m.bniScore||0)+'</td>'
        +'<td style="text-align:center;color:'+(m.absent>=3?'#9f1239':'#374151')+';font-weight:'+(m.absent>=3?'700':'400')+'">'+m.absent+'</td>'
        +'<td style="font-size:11px;color:#374151">'+actions.join(' · ')+'</td>'
        +'</tr>';
    });
    h+='</tbody></table>';
  }else{
    h+='<div class="ok-row">✅ ไม่มีสมาชิกที่ต้องดูแลเร่งด่วน</div>';
  }
  h+='</div>';

  // ── SECTION 6: Last Month Achievements ──
  h+='<div class="section" style="margin-top:18px;"><h2>6. ความสำเร็จเดือนก่อน</h2>'
    +'<div class="grid2">';
  // Top improved
  h+='<div><h3 style="color:#15803d;margin-bottom:8px">🏅 ขึ้นมากที่สุด Top 5</h3>';
  var topImp=(sc.topImproved||[]).slice(0,5);
  if(topImp.length){
    topImp.forEach(function(m,i){
      h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#f0fdf4;border-radius:5px;margin-bottom:4px;">'
        +'<span style="color:#6b7280;font-size:11px;width:18px">'+(i+1)+'.</span>'
        +'<span style="font-weight:700;flex:1">'+esc(m.nick)+'</span>'
        +'<span class="sub">'+esc(m.team)+'</span>'
        +'&nbsp;<span class="sub">'+esc(m.from)+'→'+esc(m.to)+'</span>'
        +'<span style="color:#15803d;font-weight:800;margin-left:10px">+'+m.diff+'</span>'
        +'</div>';
    });
  }else{h+='<div class="sub">ไม่มีข้อมูล</div>';}
  h+='</div>';
  // Zone achievements
  h+='<div><h3 style="color:#1e3a5f;margin-bottom:8px">⚡ สรุปการเคลื่อนไหว</h3>'
    +'<table><tbody>'
    +'<tr><td style="padding:6px;font-weight:600">↑ คะแนนขึ้น</td><td style="text-align:right;font-weight:700;color:#15803d">'+(mv.up||0)+' คน</td></tr>'
    +'<tr><td style="padding:6px;font-weight:600">→ คงที่</td><td style="text-align:right;color:#6b7280">'+(mv.same||0)+' คน</td></tr>'
    +'<tr><td style="padding:6px;font-weight:600">↓ คะแนนลด</td><td style="text-align:right;font-weight:700;color:#9f1239">'+(mv.down||0)+' คน</td></tr>'
    +'<tr><td style="padding:6px;font-weight:600">🏆 เลื่อน Zone ขึ้น</td><td style="text-align:right;font-weight:700;color:#15803d">'+(mv.zoneUp?mv.zoneUp.length:0)+' คน</td></tr>'
    +'<tr><td style="padding:6px;font-weight:600">⚠️ ลด Zone</td><td style="text-align:right;font-weight:700;color:#9f1239">'+(mv.zoneDn?mv.zoneDn.length:0)+' คน</td></tr>'
    +'</tbody></table>'
    +'</div>';
  h+='</div></div>';

  // Footer
  h+='<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;color:#9ca3af;font-size:10px;">'
    +'BNI IDEAL Chapter · Monthly Summary Report · '+today.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})
    +'</div>';

  h+='<script>window.onload=function(){window.print();}<\/script>'
    +'</body></html>';

  var w=window.open('','_blank','width=900,height=700');
  if(w){w.document.write(h);w.document.close();}
  else{alert('กรุณาอนุญาต Popup ใน Browser แล้วลองใหม่');}
}

// ════ EXPORT IMAGE ════════════════════════════════
function exportScorecardImage(){
  if(!_scData){alert('กรุณาโหลด Scorecard ก่อน');return;}
  if(typeof html2canvas==='undefined'){
    toast('⏳ กำลังเตรียมระบบ Export รูป','warn');
    loadHtml2Canvas().then(exportScorecardImage).catch(function(e){toast('❌ '+(e.message||'โหลดระบบ Export ไม่สำเร็จ'),'err');});
    return;
  }
  var sc=_scData,mv=sc.movement||{};
  var today=new Date();
  function gradeClr(g){if(g==='A+'||g==='A')return'var(--gr)';if(g==='B+')return'#60a5fa';if(g==='B')return'var(--ye)';return'var(--re)';}
  var teamsHtml='';
  sc.teams.forEach(function(t){
    var gc=gradeClr(t.grade);
    var dc=t.diff>0?'var(--gr)':t.diff<0?'var(--re)':'#94a3b8';
    var da=(t.diff>0?'▲+':t.diff<0?'▼':'')+Math.abs(t.diff||0);
    teamsHtml+='<div style="background:#1e293b;border-radius:10px;padding:14px 10px;border:1px solid #334155;text-align:center">'
      +'<div style="font-size:10px;color:#94a3b8;margin-bottom:3px">'+esc(t.name)+'</div>'
      +'<div style="font-size:26px;font-weight:900;color:'+gc+'">'+esc(t.grade)+'</div>'
      +'<div style="font-size:19px;font-weight:800;color:#f1f5f9;line-height:1.1">'+t.thisAvg+'</div>'
      +'<div style="font-size:11px;font-weight:600;color:'+dc+'">'+da+'</div>'
      +'<div style="font-size:9px;color:#475569;margin-top:3px">'+t.count+' คน · 🚨'+t.redBlk+'</div>'
      +'</div>';
  });
  var zUpHtml='',zDnHtml='';
  (mv.zoneUp||[]).forEach(function(m){zUpHtml+='<div style="padding:4px 0;border-bottom:1px solid #1e293b;font-size:11px"><b style="color:#f1f5f9">'+esc(m.nick)+'</b> <span style="color:#64748b;font-size:10px">'+esc(m.team)+'</span> <span style="color:var(--gr);font-weight:700">+'+m.diff+'</span></div>';});
  (mv.zoneDn||[]).forEach(function(m){zDnHtml+='<div style="padding:4px 0;border-bottom:1px solid #1e293b;font-size:11px"><b style="color:#f1f5f9">'+esc(m.nick)+'</b> <span style="color:#64748b;font-size:10px">'+esc(m.team)+'</span> <span style="color:var(--re);font-weight:700">'+m.diff+'</span></div>';});
  var hasZone=(mv.zoneUp&&mv.zoneUp.length)||(mv.zoneDn&&mv.zoneDn.length);
  var cardHtml='<div style="background:#0f172a;color:#f1f5f9;padding:28px;font-family:Sarabun,\'Noto Sans Thai\',sans-serif">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #1e40af">'
    +'<div>'
    +'<div style="font-size:10px;color:#93c5fd;font-weight:600;letter-spacing:2px;margin-bottom:2px">BNI IDEAL CHAPTER</div>'
    +'<div style="font-size:20px;font-weight:900">📊 Monthly Report</div>'
    +'<div style="font-size:12px;color:#94a3b8;margin-top:3px">'+esc(sc.prevMonth)+' → '+esc(sc.thisMonth)+' &nbsp;·&nbsp; '+today.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})+'</div>'
    +'</div>'
    +'<div style="text-align:right"><div style="font-size:30px;font-weight:900;color:#3b82f6">BNI</div><div style="font-size:10px;color:#64748b">IDEAL</div></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">'
    +'<div style="background:#1e293b;border-radius:8px;padding:10px;text-align:center"><div style="font-size:26px;font-weight:900;color:var(--gr)">'+mv.up+'</div><div style="font-size:10px;color:#64748b">↑ ขึ้น</div></div>'
    +'<div style="background:#1e293b;border-radius:8px;padding:10px;text-align:center"><div style="font-size:26px;font-weight:900;color:#94a3b8">'+mv.same+'</div><div style="font-size:10px;color:#64748b">→ คงที่</div></div>'
    +'<div style="background:#1e293b;border-radius:8px;padding:10px;text-align:center"><div style="font-size:26px;font-weight:900;color:var(--re)">'+mv.down+'</div><div style="font-size:10px;color:#64748b">↓ ลด</div></div>'
    +'<div style="background:#1e293b;border-radius:8px;padding:10px;text-align:center"><div style="font-size:26px;font-weight:900;color:var(--ye)">'+((mv.zoneUp||[]).length+(mv.zoneDn||[]).length)+'</div><div style="font-size:10px;color:#64748b">⚡ เปลี่ยน Zone</div></div>'
    +'</div>'
    +'<div style="font-size:10px;color:#64748b;margin-bottom:6px;font-weight:600;letter-spacing:1px">TEAM GRADES</div>'
    +'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:18px">'+teamsHtml+'</div>'
    +(hasZone?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">'
      +((mv.zoneUp&&mv.zoneUp.length)?'<div><div style="font-size:10px;font-weight:700;color:var(--gr);margin-bottom:5px">🏆 เลื่อนขึ้น Zone</div>'+zUpHtml+'</div>':'')
      +((mv.zoneDn&&mv.zoneDn.length)?'<div><div style="font-size:10px;font-weight:700;color:var(--re);margin-bottom:5px">⚠️ ลดลง Zone</div>'+zDnHtml+'</div>':'')
      +'</div>':'')
    +'<div style="border-top:1px solid #1e293b;padding-top:10px;text-align:center;font-size:9px;color:#475569">'
    +'จัดทำโดย BNI IDEAL Mentor System · '+today.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'})
    +'</div></div>';
  var wrap=document.getElementById('sc-export-wrap');
  wrap.innerHTML=cardHtml;
  var btn=document.getElementById('btn-sc-export');
  if(btn){btn.textContent='⏳ กำลัง Export...';btn.disabled=true;}
  setTimeout(function(){
    html2canvas(wrap.firstElementChild||wrap,{scale:2,backgroundColor:'#0f172a',useCORS:true,logging:false}).then(function(canvas){
      var link=document.createElement('a');
      link.download='BNI_IDEAL_'+sc.thisMonth+'_Report.png';
      link.href=canvas.toDataURL('image/png');
      link.click();
      if(btn){btn.textContent='📸 Export รูป';btn.disabled=false;}
      toast('✅ บันทึกรูปแล้ว — นำไปแชร์ใน LINE LT ได้เลย');
    }).catch(function(err){
      if(btn){btn.textContent='📸 Export รูป';btn.disabled=false;}
      toast('❌ Export ไม่สำเร็จ: '+(err&&err.message||err),'err');
    });
  },150);
}

// ════ GROWTH ══════════════════════════════════════
function buildGrowthFilters(){
  var teams=[...new Set(G.mem.map(function(m){return m.mentor;}))].filter(Boolean);
  ['gbteam'].forEach(function(id){
    var s=document.getElementById(id);
    s.innerHTML='<option value="">ทุกทีม</option>';
    teams.forEach(function(t){s.innerHTML+='<option value="'+esc(t)+'">'+esc(t)+'</option>';});
  });
}

function renderGrowthAll(){renderHealthScore();renderGKPI();renderJIBar();renderGOvActivity();renderGOvBalance();renderBal();renderTop();renderGoals();renderTrendChart();buildHeatmapFilters();renderTrendSection();}

function renderGKPI(){
  var sm=G.sm;
  var totRef=G.mem.reduce(function(a,m){return a+(m.rgCount||0);},0);
  var totRecv=G.mem.reduce(function(a,m){return a+(m.rrCount||0);},0);
  document.getElementById('gr-kpi').innerHTML=[
    {l:'สมาชิก (มีข้อมูล)',v:sm.total||0,s:'คนในระบบ',c:'pu',i:'👥'},
    {l:'TYFCB รวม',v:fmtB(sm.totalTYFCB||0),s:'ยอดธุรกิจทั้งหมด',c:'gr',i:'💰'},
    {l:'Referral ให้ (RG)',v:totRef,s:'ใบรวมทั้ง Chapter',c:'bl',i:'🔄'},
    {l:'Referral รับ (RR)',v:totRecv,s:'ใบรวมทั้ง Chapter',c:'te',i:'📨'},
    {l:'Visitor รวม',v:sm.totalVisitors||0,s:'คนทั้ง Chapter',c:'or',i:'👤'},
    {l:'1-2-1 รวม',v:sm.total121||0,s:'ครั้งทั้ง Chapter',c:'ye',i:'🤝'},
    {l:'Attend Rate',v:(sm.chapterAttendRate||0)+'%',s:sm.chapterAttend+' / '+(sm.chapterAttend+sm.chapterAbsent)+' ครั้ง',c:'gr',i:'✅'},
    {l:'Referral Imbalance',v:sm.highGiverLowRecv||0,s:'คนที่ให้เยอะแต่รับน้อย',c:'re',i:'⚠️'},
  ].map(function(c){return'<div class="kc '+c.c+'"><div class="kl">'+c.l+'</div><div class="kv" style="font-size:22px">'+c.v+'</div><div class="ks">'+c.s+'</div><div class="ki">'+c.i+'</div></div>';}).join('');
}

function fmtB(v){if(v>=1000000)return(v/1000000).toFixed(1)+'M';if(v>=1000)return(v/1000).toFixed(0)+'K';return v;}

function renderJIBar(){
  var gives=G.mem.map(function(m){return m.giveRatio||0;});
  var labels=G.mem.slice(0,15).map(function(m){return m.nick||m.name;});
  var data=G.mem.slice(0,15).map(function(m){return m.giveRatio||0;});
  if(jc)jc.destroy();
  jc=new Chart(document.getElementById('jiBar').getContext('2d'),{type:'bar',
    data:{labels:labels,datasets:[
      {label:'% ให้ (RG)',data:data,backgroundColor:data.map(function(v){return v>55?'rgba(248,113,113,.75)':v<45?'rgba(255,193,77,.75)':'rgba(52,211,153,.75)';}),borderRadius:4},
      {label:'เป้า (50%)',data:data.map(function(){return 50;}),type:'line',borderColor:'rgba(28,26,18,.2)',borderWidth:1,pointRadius:0,fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return' '+c.dataset.label+': '+c.raw+'%';}}}},
      scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick,font:{size:10}}},
        y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick},min:0,max:100}}}});
}

function renderGOvActivity(){
  var sm=G.sm;
  document.getElementById('gr-act').innerHTML=[
    {e:'📅',l:'Attend Rate',v:(sm.chapterAttendRate||0)+'%',sub:sm.chapterAttend+' / '+(sm.chapterAttend+sm.chapterAbsent)},
    {e:'💰',l:'Total TYFCB',v:fmtB(sm.totalTYFCB||0)+'฿',sub:'ยอดธุรกิจรวม'},
    {e:'🔄',l:'Referral Balance',v:sm.highGiverLowRecv+' / '+sm.lowGiverHighRecv,sub:'ให้เยอะ / รับเยอะ'},
    {e:'✅',l:'สมดุล',v:sm.balanced||0,sub:'คนที่ balance'},
  ].map(function(r){
    return'<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--bd)">'+
      '<span style="font-size:18px">'+r.e+'</span>'+
      '<div style="flex:1"><div style="font-weight:600">'+r.l+'</div><div style="font-size:11px;color:var(--sub)">'+r.sub+'</div></div>'+
      '<div style="font-size:18px;font-weight:700">'+r.v+'</div></div>';
  }).join('');
}

function renderGOvBalance(){
  var hlr=G.mem.filter(function(m){return m.zone==='highGiverLowRecv';});
  var lhr=G.mem.filter(function(m){return m.zone==='lowGiverHighRecv';});
  document.getElementById('gr-hlr-n').textContent=hlr.length;
  document.getElementById('gr-lhr-n').textContent=lhr.length;
  document.getElementById('gr-hlr').innerHTML=hlr.length?hlr.slice(0,6).map(function(m){
    return'<div class="ac2 risk"><div style="font-size:19px">🔴</div>'+
      '<div class="ai"><div class="an">'+esc(m.name)+'</div><div class="at">'+esc(m.mentor)+'</div>'+
      '<div style="font-size:11px;color:var(--sub)">RG:'+m.rgCount+' RR:'+m.rrCount+' | ให้ '+m.giveRatio+'%</div></div>'+
      '<div style="text-align:right"><div style="font-size:12px;font-weight:700;color:var(--re)">'+fmtB(m.tyfcb)+'฿</div><div style="font-size:10px;color:var(--sub)">TYFCB</div></div></div>';
  }).join(''):'<div class="es">ไม่มี ✅</div>';
  document.getElementById('gr-lhr').innerHTML=lhr.length?lhr.slice(0,6).map(function(m){
    return'<div class="ac2 soon"><div style="font-size:19px">🟡</div>'+
      '<div class="ai"><div class="an">'+esc(m.name)+'</div><div class="at">'+esc(m.mentor)+'</div>'+
      '<div style="font-size:11px;color:var(--sub)">RG:'+m.rgCount+' RR:'+m.rrCount+' | ให้ '+m.giveRatio+'%</div></div>'+
      '<div style="text-align:right"><div style="font-size:12px;font-weight:700;color:var(--ye)">'+fmtB(m.tyfcb)+'฿</div><div style="font-size:10px;color:var(--sub)">TYFCB</div></div></div>';
  }).join(''):'<div class="es">ไม่มี ✅</div>';
}

// ── Referral Balance Table ────────────────────────
var gzf2='all';
function sgz(z,el){gzf2=z;document.querySelectorAll('#gr-bal .zp').forEach(function(b){b.classList.remove('on');});el.classList.add('on');renderBal();}
function renderBal(){
  var se=document.getElementById('gbs').value.trim().toLowerCase();
  var tm=document.getElementById('gbteam').value;
  var so=document.getElementById('gbsort').value;
  var zoneOrder={highGiverLowRecv:0,lowGiverHighRecv:1,inactive:2,balanced:3};
  var list=G.mem.filter(function(m){
    if(se&&(m.name||'').toLowerCase().indexOf(se)===-1&&(m.nick||'').toLowerCase().indexOf(se)===-1)return false;
    if(tm&&m.mentor!==tm)return false;
    if(gzf2!=='all'&&m.zone!==gzf2)return false;
    return true;
  });
  list.sort(function(a,b){
    if(so==='zone'){var za=zoneOrder[a.zone]!==undefined?zoneOrder[a.zone]:4,zb=zoneOrder[b.zone]!==undefined?zoneOrder[b.zone]:4;return za!==zb?za-zb:a.score-b.score;}
    if(so==='give-d')return b.rgCount-a.rgCount;
    if(so==='recv-d')return b.rrCount-a.rrCount;
    if(so==='tyfcb-d')return b.tyfcb-a.tyfcb;
    if(so==='absent-d')return b.absent-a.absent;
    return a.score-b.score;
  });
  var zoneLabel={highGiverLowRecv:'🔴 ให้เยอะ',lowGiverHighRecv:'🟡 รับเยอะ',balanced:'✅ สมดุล',inactive:'⚪ Inactive'};
  var zoneBadge={highGiverLowRecv:'b-re',lowGiverHighRecv:'b-ye',balanced:'b-gr',inactive:'b-gy'};
  document.getElementById('baltb').innerHTML=list.length?list.map(function(m,i){
    var gp=Math.round(m.giveRatio);var rp=100-gp;
    return'<tr><td style="color:var(--sub);font-size:10px">'+(i+1)+'</td>'+
      '<td><div style="font-weight:600">'+esc(m.name)+'</div><div style="font-size:11px;color:var(--sub)">'+esc(m.nick||'')+'</div></td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(m.mentor||'—')+'</td>'+
      '<td><span class="badge '+(zoneBadge[m.zone]||'b-gy')+'">'+esc(zoneLabel[m.zone]||m.zone)+'</span></td>'+
      '<td style="font-weight:700;color:var(--bl)">'+m.rgCount+'</td>'+
      '<td style="font-weight:700;color:var(--gr)">'+m.rrCount+'</td>'+
      '<td><div style="display:flex;gap:3px;align-items:center">'+
        '<span style="font-size:10px;color:var(--sub);width:24px">'+gp+'%</span>'+
        '<div class="ji-bar" style="width:70px"><div class="ji-give" style="width:'+gp+'%"></div><div class="ji-recv" style="width:'+rp+'%"></div></div>'+
      '</div></td>'+
      '<td style="font-weight:700;color:var(--ye)">'+fmtB(m.tyfcb)+'</td>'+
      '<td>'+m.visitors+'</td><td>'+m.r121+'</td><td>'+m.ceu+'</td>'+
      '<td style="'+(m.absent>4?'color:var(--re);font-weight:700':'')+'">'+m.absent+'</td>'+
      '<td style="font-weight:600">'+m.score+'</td></tr>';
  }).join(''):'<tr><td colspan="13" class="es">ไม่พบข้อมูล</td></tr>';
  document.getElementById('balcnt').textContent='แสดง '+list.length+' / '+G.mem.length+' คน';
}

// ── Tasks ─────────────────────────────────────────
function toggleTaskForm(){var f=document.getElementById('taskForm');f.style.display=f.style.display==='block'?'none':'block';}
function createTask(){
  var tm=document.getElementById('tf-team').value;
  var mn=document.getElementById('tf-member').value.trim();
  var tp=document.getElementById('tf-type').value;
  var pr=document.getElementById('tf-pri').value;
  var nt=document.getElementById('tf-note').value.trim();
  var res=document.getElementById('tf-res');
  if(!tm||!mn){res.style.color='var(--re)';res.textContent='กรุณาเลือกทีมและใส่ชื่อสมาชิก';return;}
  res.style.color='var(--sub)';res.textContent='กำลังส่ง...';
  gsr('createGrowthTask',{teamName:tm,memberName:mn,taskType:tp,priority:pr,note:nt},function(r){
    if(r.ok){res.style.color='var(--gr)';res.textContent='✓ สร้าง Task แล้ว';
      document.getElementById('tf-member').value='';document.getElementById('tf-note').value='';
      gsr('getGrowthTasks',{statusFilter:'all'},function(r2){if(r2.ok){G.tasks=r2.tasks||[];renderTasks();}});
    }else{res.style.color='var(--re)';res.textContent='ผิดพลาด: '+(r.error||'');}
  });
}
function stf(s,el){tsf=s;document.querySelectorAll('[data-s]').forEach(function(b){if(b.closest('#gr-task'))b.classList.remove('on');});el.classList.add('on');renderTasks();}
function renderTasks(){
  var tm=document.getElementById('task-tf').value;
  var list=G.tasks.filter(function(t){
    if(tm&&t.team!==tm)return false;
    if(tsf!=='all'&&t.status!==tsf)return false;
    return true;
  });
  document.getElementById('taskn').textContent=list.length;
  document.getElementById('tasklist').innerHTML=list.length?list.map(function(t){
    return'<div class="task-card '+t.status+'">'+
      '<div class="task-hdr">'+
        '<span style="font-size:16px">'+esc(t.priority||'📋')+'</span>'+
        '<span style="font-weight:700">'+esc(t.memberName)+'</span>'+
        '<span class="badge b-pu" style="font-size:10px">'+esc(t.team)+'</span>'+
        '<span class="badge '+(t.status==='done'?'b-gr':'b-ye')+'" style="font-size:10px">'+esc(t.taskType||'')+'</span>'+
        '<span style="font-size:10px;color:var(--gy);margin-left:auto">'+esc(t.createdAt)+'</span>'+
        (t.status==='done'?'<span class="badge b-gr" style="font-size:10px">✅ เสร็จ</span>':'<span class="badge b-ye" style="font-size:10px">🟡 เปิด</span>')+
      '</div>'+
      (t.note?'<div class="task-note">'+esc(t.note)+'</div>':'')+
      (t.response?'<div class="task-resp"><span style="font-size:9px;color:var(--ac2);font-weight:600;text-transform:uppercase;display:block;margin-bottom:3px">Mentor Response — '+esc(t.respondedAt)+'</span>'+esc(t.response)+'</div>':'')+
    '</div>';
  }).join(''):'<div class="es">ไม่มี Task ในกลุ่มนี้</div>';
}

// ── New Members ───────────────────────────────────
function renderNM(){
  document.getElementById('nmn').textContent=G.nm.length;
  document.getElementById('nmtb').innerHTML=G.nm.length?G.nm.map(function(m,i){
    var pct=Math.min(100,Math.round(m.progress||0));
    return'<tr><td style="color:var(--sub);font-size:10px">'+(i+1)+'</td>'+
      '<td><div style="font-weight:600">'+esc(m.name)+'</div><div style="font-size:11px;color:var(--sub)">'+esc(m.nick||'')+'</div></td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(m.mentor||'—')+'</td>'+
      '<td style="font-size:12px">'+esc(m.startDate||'—')+'</td>'+
      '<td style="font-size:12px">'+esc(m.expDate||'—')+'</td>'+
      '<td><div style="display:flex;align-items:center;gap:7px">'+
        '<div class="nm-prog"><div class="nm-fill" style="width:'+pct+'%"></div></div>'+
        '<span style="font-size:11px;color:var(--sub)">'+pct+'%</span></div></td>'+
      '<td><span class="badge '+(m.status?'b-gr':'b-gy')+'">'+esc(m.status||'ยังไม่เสร็จ')+'</span></td>'+
      '<td><button onclick="w8Remove('+(m.rowNum||0)+',\''+esc(m.name).replace(/'/g,"\\'")+'\')" style="background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.25);color:var(--re);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer" title="ลบออกจากระบบ">🗑️</button></td></tr>';
  }).join(''):'<tr><td colspan="7" class="es">ไม่มีสมาชิกใหม่</td></tr>';
}

// ── Score Decline ─────────────────────────────────
function renderDec(){
  document.getElementById('decn').textContent=G.dec.length;
  document.getElementById('dectb').innerHTML=G.dec.length?G.dec.map(function(m,i){
    var clr=m.tl==='green'?'var(--gr)':m.tl==='yellow'?'var(--ye)':m.tl==='red'?'var(--re)':'#60a5fa';
    var dots=(m.recentScores||[]).map(function(s){
      var c=s>=70?'var(--gr)':s>=50?'var(--ye)':s>=30?'var(--re)':'#60a5fa';
      return'<span class="td" style="background:'+c+'" title="'+s+'"></span>';
    }).join('');
    return'<tr><td style="color:var(--sub);font-size:10px">'+(i+1)+'</td>'+
      '<td><div style="font-weight:600">'+esc(m.name)+'</div><div style="font-size:11px;color:var(--sub)">'+esc(m.nick||'')+'</div></td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(m.team||'—')+'</td>'+
      '<td style="font-size:15px;font-weight:700;color:'+clr+'">'+m.score+'</td>'+
      '<td><span class="badge b-'+tlK(m.tl)+'">'+tlL(m.tl)+'</span></td>'+
      '<td style="font-weight:700;color:var(--re)">'+m.streak+' เดือน</td>'+
      '<td style="font-weight:700;color:var(--re)">-'+m.decline+' pt</td>'+
      '<td><div class="trend-dots">'+dots+'</div></td></tr>';
  }).join(''):'<tr><td colspan="8" class="es">ไม่มีสมาชิกคะแนนลงต่อเนื่อง ✅</td></tr>';
}

// ── Top Performance ───────────────────────────────
function renderTop(){
  var top=function(arr){return arr.slice(0,10).map(function(m,i){return{n:i+1,m:m};});};
  var byTyfcb=[].concat(G.mem).sort(function(a,b){return b.tyfcb-a.tyfcb;});
  var byRef=[].concat(G.mem).sort(function(a,b){return b.rgCount-a.rgCount;});
  var byVis=[].concat(G.mem).sort(function(a,b){return b.visitors-a.visitors;});
  var by121=[].concat(G.mem).sort(function(a,b){return b.r121-a.r121;});
  document.getElementById('top-tyfcb').innerHTML=top(byTyfcb).map(function(x){
    return'<tr><td style="color:var(--sub);font-size:10px">'+x.n+'</td><td><div style="font-weight:600">'+esc(x.m.name)+'</div></td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(x.m.mentor)+'</td>'+
      '<td style="font-weight:700;color:var(--ye)">'+fmtB(x.m.tyfcb)+'฿</td>'+
      '<td style="font-size:11px;color:var(--sub)">'+fmtB(x.m.tyfcbPerDay)+'฿/วัน</td></tr>';
  }).join('');
  document.getElementById('top-ref').innerHTML=top(byRef).map(function(x){
    return'<tr><td style="color:var(--sub);font-size:10px">'+x.n+'</td><td><div style="font-weight:600">'+esc(x.m.name)+'</div></td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(x.m.mentor)+'</td>'+
      '<td style="font-weight:700;color:var(--bl)">'+x.m.rgCount+'</td>'+
      '<td style="color:var(--gr)">'+x.m.rrCount+'</td></tr>';
  }).join('');
  document.getElementById('top-vis').innerHTML=top(byVis).map(function(x){
    return'<tr><td style="color:var(--sub);font-size:10px">'+x.n+'</td><td><div style="font-weight:600">'+esc(x.m.name)+'</div></td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(x.m.mentor)+'</td>'+
      '<td style="font-weight:700;color:var(--or, #f97316)">'+x.m.visitors+'</td></tr>';
  }).join('');
  document.getElementById('top-121').innerHTML=top(by121).map(function(x){
    return'<tr><td style="color:var(--sub);font-size:10px">'+x.n+'</td><td><div style="font-weight:600">'+esc(x.m.name)+'</div></td>'+
      '<td style="font-size:12px;color:var(--sub)">'+esc(x.m.mentor)+'</td>'+
      '<td style="font-weight:700;color:var(--ac2)">'+x.m.r121+'</td></tr>';
  }).join('');
}

// ══════════════════════════════════════════════════
// ── 1. AUTO-REFRESH ───────────────────────────────
function startAR(){
  clearInterval(arTimer);arCount=300;
  arTimer=setInterval(function(){
    arCount--;
    var m=Math.floor(arCount/60),s=arCount%60;
    var el=document.getElementById('ar-txt');
    if(el)el.textContent=m+':'+(s<10?'0':'')+s;
    if(arCount<=0){reload();arCount=300;}
  },1000);
}
function toggleAR(){
  arActive=!arActive;
  var btn=document.getElementById('btn-ar'),dot=document.getElementById('ar-dot'),txt=document.getElementById('ar-txt');
  if(arActive){startAR();if(btn)btn.textContent='⏸';if(dot)dot.style.animation='blink 2s infinite';}
  else{clearInterval(arTimer);if(btn)btn.textContent='▶';if(txt)txt.textContent='หยุด';if(dot)dot.style.animation='none';}
}

// ── Score Timeline ────────────────────────────────
function renderScoreTimeline(historyArr, containerId) {
  var el = document.getElementById(containerId);
  if (!el || !historyArr || !historyArr.length) return;
  var sorted = [].concat(historyArr).sort(function(a,b){return (a.year*100+a.month)-(b.year*100+b.month);});
  var MONTHS = ['','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function tlColor(s){return s>=70?'tl-green':s>=50?'tl-yellow':s>=30?'tl-red':'tl-black';}
  function clrVar(s){return s>=70?'gr':s>=50?'ye':s>=30?'re':'gy';}
  el.innerHTML = '<div class="score-tl-wrap"><div class="score-tl-inner">'+
    sorted.map(function(h,i){
      var prev=sorted[i-1];
      var delta=prev?h.score-prev.score:0;
      var dStr=delta===0?'—':delta>0?'▲'+delta:'▼'+Math.abs(delta);
      var dCls=delta>0?'up':delta<0?'dn':'eq';
      return '<div class="tl-item">'+
        '<div class="tl-dot '+tlColor(h.score)+'">'+h.score+'</div>'+
        '<div class="tl-card">'+
          '<div class="tl-month">'+(MONTHS[h.month]||h.month)+' '+(String(h.year).slice(2))+'</div>'+
          '<div class="tl-score" style="color:var(--'+clrVar(h.score)+')">'+h.score+'</div>'+
          '<div class="tl-delta '+dCls+'">'+dStr+'</div>'+
        '</div></div>';
    }).join('')+
  '</div></div>';
}

// ── 2. MEMBER 360 MODAL + ACTION HUB ─────────────
function openModal(name){
  var mem=S.role==='mc'?D.mem.find(function(m){return m.name===name;}):G.mem.find(function(m){return m.name===name;});
  if(!mem)return;
  _m360.name=name; _m360.mentor=mem.mentor||'';
  document.getElementById('m360-name').textContent=mem.name+(mem.nick?' ('+mem.nick+')':'');
  document.getElementById('m360-sub').textContent=(mem.mentor||'ไม่มีทีม');
  var html='';

  if(S.role==='mc'){
    var c=mem.cats||{};
    var act=mem.actual||{};
    // ── Score Header ──────────────────────────────────────────────
    var scoreClr=tlC(mem.bniTl);
    var zoneLabel=tlL(mem.bniTl);
    var zoneClass='b-'+tlK(mem.bniTl);
    html+='<div class="p360-score-hdr">';
    html+='<div class="p360-score-big" style="color:'+scoreClr+'">'+(mem.bniTl!=='none'?mem.bniScore:'—')+'</div>';
    html+='<div class="p360-score-meta">'
      +'<span class="p360-score-zone '+zoneClass+'">'+zoneLabel+'</span>'
      +(mem.hist&&mem.hist.length?'<div>'+sparkline(mem.hist)+'</div>':'')
      +'<div class="p360-score-sub">Avg: '+(mem.scoreAvg||'—')+' pt'
      +' &nbsp;·&nbsp; BNI Days: '+(act.bniDays||'—')+'วัน</div>'
      +'</div>';
    html+='</div>';
    // ── Contact ───────────────────────────────────────────────────
    if(mem.phone||mem.email){
      html+='<div class="p360-section"><div class="p360-section-title">📞 ติดต่อ</div><div class="p360-contact-row">';
      if(mem.phone)html+='<a class="p360-contact-btn" href="tel:'+esc(mem.phone)+'" target="_top"><span class="p360-contact-ico">📞</span><div><div class="p360-contact-val">'+esc(mem.phone)+'</div><div class="p360-contact-lbl">โทรศัพท์</div></div></a>';
      if(mem.email)html+='<a class="p360-contact-btn" href="mailto:'+esc(mem.email)+'" target="_top"><span class="p360-contact-ico">✉️</span><div><div class="p360-contact-val">'+esc(mem.email)+'</div><div class="p360-contact-lbl">อีเมล</div></div></a>';
      html+='</div></div>';
    }
    // ── Business Stats ─────────────────────────────────────────────
    html+='<div class="p360-section"><div class="p360-section-title">📊 ตัวเลขธุรกิจ</div>';
    html+='<div class="p360-stat-grid">';
    function fmtM2(v){return v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'K':String(Math.round(v||0));}
    var balColor=(mem.given||0)>=(mem.recv||0)?'var(--gr)':'var(--re)';
    [
      {ico:'💰',val:'฿'+fmtM2(act.tyfcb||0),lbl:'TYFCB',c:'var(--ye)'},
      {ico:'💡',val:(act.rg||0)+'ใบ',lbl:'Referral ให้',c:'var(--ac2)'},
      {ico:'📨',val:(act.rr||0)+'ใบ',lbl:'Referral รับ',c:'var(--bl)'},
      {ico:'👥',val:(act.visitor||0)+'คน',lbl:'Visitor',c:'#f472b6'},
      {ico:'🤝',val:(act.oToOne||0)+'ครั้ง',lbl:'1-2-1',c:'#a78bfa'},
      {ico:'📚',val:(act.ceu||0)+'แต้ม',lbl:'CEU',c:'#60a5fa'},
      {ico:'💸',val:'฿'+fmtM2(mem.given||0),lbl:'Given (มูลค่า)',c:'var(--gr)'},
      {ico:'💵',val:'฿'+fmtM2(mem.recv||0),lbl:'Received',c:balColor},
      {ico:'📈',val:(mem.roi>0?mem.roi+'%':'—'),lbl:'ROI (ฐาน 28K/ปี)',c:mem.roi>=300?'var(--gr)':mem.roi>=100?'var(--ye)':'var(--re)'}
    ].forEach(function(s){
      html+='<div class="p360-stat"><div class="p360-stat-val" style="color:'+s.c+'">'+s.ico+' '+s.val+'</div><div class="p360-stat-lbl">'+s.lbl+'</div></div>';
    });
    html+='</div></div>';
    // ── Attendance ─────────────────────────────────────────────────
    var totalMtg=(act.attend||0)+(act.absent||0)+(act.late||0);
    if(totalMtg>0){
      html+='<div class="p360-section"><div class="p360-section-title">📅 Attendance ('+totalMtg+' ครั้ง)</div>';
      html+='<div class="p360-attend">';
      [{ico:'✅',val:act.attend||0,lbl:'เข้าประชุม',c:'var(--gr)'},{ico:'❌',val:act.absent||0,lbl:'ขาด',c:(act.absent||0)>4?'var(--re)':'var(--sub)'},{ico:'⏰',val:act.late||0,lbl:'สาย',c:'var(--ye)'},{ico:'👥',val:act.sub||0,lbl:'ส่งแทน',c:'var(--bl)'},{ico:'📊',val:totalMtg>0?Math.round((act.attend||0)/totalMtg*100)+'%':'—',lbl:'Attend Rate',c:(act.attend||0)/Math.max(1,totalMtg)>=0.8?'var(--gr)':'var(--ye)'}].forEach(function(a){
        html+='<div class="p360-att"><div class="p360-att-val" style="color:'+a.c+'">'+a.ico+' '+a.val+'</div><div class="p360-att-lbl">'+a.lbl+'</div></div>';
      });
      html+='</div></div>';
    }
    // ── Renewal + Drop Risk ────────────────────────────────────────
    var ren=D.ren.find(function(r){return r.name===name;});
    var dropR=_dropRisk(mem);
    var hasRenOrDrop=ren||dropR;
    if(hasRenOrDrop){
      html+='<div class="p360-section" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">';
      if(ren){
        var rc=ren.diffDays<0?'var(--re)':ren.diffDays<=30?'var(--re)':ren.diffDays<=60?'var(--ye)':'var(--gr)';
        html+='<div class="p360-ren-row" style="flex:1"><span style="font-size:16px">💳</span>'
          +'<div class="p360-ren-date">Renewal: '+esc(ren.expStr||'—')+'</div>'
          +'<span class="p360-ren-days" style="background:'+rc+'22;color:'+rc+';border:1px solid '+rc+'44">'
          +(ren.diffDays<0?'เกิน '+Math.abs(ren.diffDays)+'วัน':ren.diffDays===0?'วันนี้!':'อีก '+ren.diffDays+'วัน')+'</span></div>';
      }
      if(dropR){
        var dropCls={high:'p360-drop-h',medium:'p360-drop-m',low:'p360-drop-l'}[dropR]||'p360-drop-ok';
        var dropLabel={high:'🔴 Drop Risk สูง',medium:'⚠️ At Risk',low:'👁 Watch'}[dropR];
        html+='<span class="p360-drop '+dropCls+'">'+dropLabel+'</span>';
      }
      html+='</div>';
    }
    // ── Action Plan ────────────────────────────────────────────────
    var allCatsDef=[
      {cat:'Attendance',icon:'🏛️',ck:'absent', max:15},
      {cat:'Referral',  icon:'💡',ck:'ref',     max:15},
      {cat:'TYFB',      icon:'💰',ck:'tyfcb',   max:15},
      {cat:'Visitor',   icon:'👥',ck:'visitor',  max:20},
      {cat:'1-2-1',     icon:'🤝',ck:'one21',   max:15},
      {cat:'CEU',       icon:'📚',ck:'training', max:20}
    ];
    if(c&&Object.keys(c).length){
      var gapMapD={};(mem.gaps||[]).forEach(function(g){gapMapD[g.cat]=g;});
      var nextTlD=mem.ftNextTl||'yellow',neededD=mem.ftNeeded||0;
      var ftColorD=nextTlD==='green'?'var(--gr)':'var(--ye)';
      html+='<div class="p360-section"><div class="p360-section-title" style="display:flex;justify-content:space-between">'
        +'<span>📋 แผนพัฒนาคะแนน</span>'
        +(mem.bniTl==='green'?'<span style="color:var(--gr)">✅ Max Zone</span>'
          :'<span style="color:'+ftColorD+';font-weight:700">⚡ +'+neededD+' pts → '+(nextTlD==='green'?'🟢':'🟡')+'</span>')
        +'</div>';
      allCatsDef.forEach(function(ct){
        var pts=c[ct.ck]||0,gap=gapMapD[ct.cat],isMax=!gap;
        var pct=Math.min(100,Math.round(pts/ct.max*100));
        var barC=isMax?'var(--gr)':pts>0?'var(--ye)':'var(--re)';
        html+='<div style="display:grid;grid-template-columns:16px 72px 1fr 38px 58px;align-items:center;gap:6px;margin-bottom:5px">'
          +'<span style="font-size:12px">'+ct.icon+'</span><span style="font-size:11px;font-weight:600">'+ct.cat+'</span>'
          +'<div style="background:var(--sf);border-radius:3px;height:5px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+barC+'"></div></div>'
          +'<span style="font-size:10px;color:'+barC+';text-align:right;font-family:monospace">'+pts+'/'+ct.max+'</span>'
          +(isMax?'<span style="font-size:10px;color:var(--gr)">✅</span>':'<span style="font-size:10px;color:'+barC+';font-weight:700">+'+gap.gain+'pt</span>')
          +'</div>';
        if(!isMax){
          html+='<div style="font-size:10px;color:var(--sub);padding:1px 0 2px 22px;line-height:1.3">→ '+esc(gap.action)+' <span style="color:var(--tx)">('+esc(gap.curVal)+' → '+esc(gap.tgtVal)+')</span></div>';
          if(gap.altAction)html+='<div style="font-size:10px;color:var(--sub);padding:0 0 4px 22px;line-height:1.3;opacity:.65">→ '+esc(gap.altAction)+' <span style="color:var(--tx);opacity:.85">('+esc(gap.curVal)+' → '+esc(gap.altTgtVal||'')+')</span></div>';
        }
      });
      html+='</div>';
    }
    // ── Core Issues ────────────────────────────────────────────────
    var reps=D.reps.filter(function(r){return r.memberName===name;});
    var openRep=reps.find(function(r){return repIsOpen(r);});
    var doneRep=reps.find(function(r){return r.status==='done';});
    if(openRep){_m360.repRow=openRep.row;_m360.repTeam=openRep.team;}
    else if(doneRep){_m360.repRow=doneRep.row;_m360.repTeam=doneRep.team;}
    if(reps.length){
      html+='<div class="p360-section"><div class="p360-section-title">📋 Core Issues ('+reps.length+')</div>';
      reps.slice(0,2).forEach(function(r){
        var st=r.status||'pending';var sc=st==='done'?'var(--gr)':st==='reopened'?'var(--ye)':'var(--re)';
        html+='<div style="border-left:3px solid '+sc+';padding:7px 10px;margin-top:7px;background:var(--bg);border-radius:0 7px 7px 0">'
          +'<div style="font-size:9px;color:var(--sub)">'+esc(r.savedAt)+' · '+esc(r.team)+'</div>'
          +'<div style="font-size:12px;margin-top:3px;line-height:1.4">'+esc(r.coreIssue||'—')+'</div>'
          +(r.reply?'<div style="font-size:11px;color:var(--ac2);margin-top:3px">💬 '+esc(r.reply)+'</div>':'')
          +'</div>';
      });
      html+='</div>';
    }
    // ── Message (if any) ───────────────────────────────────────────
    var msgs=D.msgs.filter(function(m){return m.name===name;});
    if(msgs.length)html+='<div class="p360-section"><div class="p360-section-title">💬 ข้อความ MC</div><div style="font-size:12px;line-height:1.5;background:var(--bg);border-radius:7px;padding:8px;margin-top:6px">'+esc(msgs[0].msg)+'</div></div>';
    // ── On-demand: 90-Day Review + Mentor Log ─────────────────────
    html+='<div class="p360-section"><div class="p360-section-title">📂 ข้อมูลเพิ่มเติม</div>'
      +'<div class="p360-on-demand">'
      +'<button class="p360-od-btn" id="od-btn-90d" onclick="p360LoadOD(\'90d\',\''+esc(name).replace(/'/g,"\\'")+'\')" >📝 90-Day Review</button>'
      +'<button class="p360-od-btn" id="od-btn-ml" onclick="p360LoadOD(\'ml\',\''+esc(name).replace(/'/g,"\\'")+'\')" >📓 Mentor Log</button>'
      +'</div><div id="p360-od-body" class="p360-od-body"></div></div>';
    // ── ACTION HUB ────────────────────────────────────────────────
    html+='<div class="m360-actions">';
    html+='<button class="m360-act pri" onclick="m360TogPanel(\'m360-msg-panel\',\'m360-msg-txt\')">📨 ส่ง Message</button>';
    if(openRep){
      html+='<button class="m360-act" onclick="m360TogPanel(\'m360-rep-panel\',\'m360-rep-txt\')">💬 ตอบ Report</button>';
      html+='<button class="m360-act ok" onclick="m360Close()">✅ ปิดเคส</button>';
    }
    if(doneRep)html+='<button class="m360-act da" onclick="m360Reopen()">🔄 Reopen</button>';
    html+='</div>';
    html+='<div class="m360-panel" id="m360-msg-panel">'
      +'<div class="m360-panel-title">📨 ส่ง Message ถึง '+esc(name)+'</div>'
      +'<textarea id="m360-msg-txt" placeholder="ข้อความ..." rows="3"></textarea>'
      +'<div class="m360-panel-row"><button class="bsend" onclick="m360SendMsg()">ส่ง</button><button class="bsm" onclick="m360TogPanel(\'m360-msg-panel\')">ยกเลิก</button></div>'
      +'<div class="m360-res" id="m360-msg-res"></div></div>';
    if(openRep){
      html+='<div class="m360-panel" id="m360-rep-panel">'
        +'<div class="m360-panel-title">💬 ตอบ Report</div>'
        +'<div style="font-size:12px;color:var(--sub);margin-bottom:8px;background:var(--bg);padding:7px;border-radius:6px">'+esc(openRep.coreIssue||'—')+'</div>'
        +'<textarea id="m360-rep-txt" placeholder="ข้อความตอบกลับ..." rows="3"></textarea>'
        +'<div class="m360-panel-row"><button class="bsend" onclick="m360SendReply()">ส่ง Reply</button><button class="bsm" onclick="m360TogPanel(\'m360-rep-panel\')">ยกเลิก</button></div>'
        +'<div class="m360-res" id="m360-rep-res"></div></div>';
    }

  } else { // GROWTH
    var zl={highGiverLowRecv:'🔴 ให้เยอะ รับน้อย',lowGiverHighRecv:'🟡 รับเยอะ ให้น้อย',balanced:'✅ สมดุล',inactive:'⚪ Inactive'};
    var zb={highGiverLowRecv:'b-re',lowGiverHighRecv:'b-ye',balanced:'b-gr',inactive:'b-gy'};
    // Referral + TYFCB
    html+='<div class="m360g" style="margin-bottom:10px">';
    html+='<div class="m360c"><div class="m360l">Referral Balance</div>'+
      '<div style="display:flex;gap:14px;margin-top:6px">'+
        '<div><div style="font-size:28px;font-weight:800;color:var(--bl)">'+mem.rgCount+'</div><div style="font-size:10px;color:var(--sub)">ให้ (RG)</div></div>'+
        '<div><div style="font-size:28px;font-weight:800;color:var(--gr)">'+mem.rrCount+'</div><div style="font-size:10px;color:var(--sub)">รับ (RR)</div></div>'+
      '</div>'+
      '<span class="badge '+(zb[mem.zone]||'b-gy')+'" style="margin-top:8px;display:inline-block">'+esc(zl[mem.zone]||mem.zone)+'</span></div>';
    html+='<div class="m360c"><div class="m360l">TYFCB</div><div style="font-size:28px;font-weight:800;color:var(--ye)">'+fmtB(mem.tyfcb||0)+'฿</div><div style="font-size:11px;color:var(--sub);margin-top:3px">'+fmtB(mem.tyfcbPerDay||0)+'฿/วัน</div></div>';
    html+='</div>';
    // Activity stats
    html+='<div class="m360c" style="margin-bottom:10px"><div class="m360l">Activity</div>'+
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px;text-align:center">';
    [{l:'Visitor',v:mem.visitors||0,c:'#f472b6'},{l:'1-2-1',v:mem.r121||0,c:'#60a5fa'},{l:'CEU',v:mem.ceu||0,c:'#a78bfa'},{l:'ขาด',v:mem.absent||0,c:mem.absent>4?'var(--re)':'var(--sub)'}].forEach(function(s){
      html+='<div><div style="font-size:22px;font-weight:700;color:'+s.c+'">'+s.v+'</div><div style="font-size:10px;color:var(--sub)">'+s.l+'</div></div>';
    });
    html+='</div></div>';
    // Attendance + Score
    var ar2=mem.attendRate||0;
    html+='<div class="m360g">';
    html+='<div class="m360c"><div class="m360l">Attendance Rate</div>'+
      '<div style="font-size:28px;font-weight:800;color:'+(ar2>=80?'var(--gr)':ar2>=60?'var(--ye)':'var(--re)')+'">'+ar2+'%</div>'+
      '<div style="font-size:11px;color:var(--sub)">'+mem.attend+' / '+(mem.attend+mem.absent)+' ครั้ง</div></div>';
    html+='<div class="m360c"><div class="m360l">PALMS Score</div><div style="font-size:28px;font-weight:800">'+(mem.score||'—')+'</div><span class="badge b-'+tlK(mem.tl)+'">'+tlL(mem.tl)+'</span></div>';
    html+='</div>';
    // Existing tasks
    var memTasks=G.tasks.filter(function(t){return t.memberName===name&&t.status==='open';});
    if(memTasks.length){
      html+='<div class="m360c" style="margin-top:10px;margin-bottom:10px"><div class="m360l">Open Tasks ('+memTasks.length+')</div>';
      memTasks.slice(0,2).forEach(function(t){
        html+='<div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px">'+
          '<span>'+esc(t.priority||'📋')+'</span><span style="font-weight:600">'+esc(t.taskType)+'</span><span style="color:var(--sub)">'+esc(t.note||'')+'</span></div>';
      });
      html+='</div>';
    }
    // ── ACTION HUB (Growth) ──
    html+='<div class="m360-actions">'+
      '<button class="m360-act pri" onclick="m360TogPanel(\'m360-task-panel\',\'m360-task-note\')">📋 สร้าง Task</button>'+
      '</div>';
    html+='<div class="m360-panel" id="m360-task-panel">'+
      '<div class="m360-panel-title">📋 สร้าง Growth Task — '+esc(name)+'</div>'+
      '<select id="m360-task-type">'+
        '<option value="ติดตาม">📌 ติดตามสมาชิก</option>'+
        '<option value="แนะนำ">💡 แนะนำกลยุทธ์</option>'+
        '<option value="เร่งด่วน">🚨 เร่งด่วน</option>'+
        '<option value="ขาด">🚫 ปัญหาขาดประชุม</option>'+
        '<option value="Referral">🔄 เรื่อง Referral</option>'+
        '<option value="อื่นๆ">📋 อื่นๆ</option>'+
      '</select>'+
      '<select id="m360-task-pri">'+
        '<option value="🔴">🔴 สำคัญมาก</option>'+
        '<option value="🟡" selected>🟡 ปานกลาง</option>'+
        '<option value="📋">📋 ทั่วไป</option>'+
      '</select>'+
      '<textarea id="m360-task-note" placeholder="รายละเอียด / หมายเหตุ..." rows="3"></textarea>'+
      '<div class="m360-panel-row"><button class="bsend" onclick="m360SendTask()">ส่ง Task</button><button class="bsm" onclick="m360TogPanel(\'m360-task-panel\')">ยกเลิก</button></div>'+
      '<div class="m360-res" id="m360-task-res"></div></div>';
  }

  document.getElementById('m360-body').innerHTML=html;
  document.getElementById('modal').style.display='flex';
}
function closeModal(){document.getElementById('modal').style.display='none';}

// ── Modal Action Hub helpers ──────────────────────
// ── On-Demand sections in Member 360 ──────────────────────────
function p360LoadOD(type,name){
  var body=document.getElementById('p360-od-body');
  var btn90=document.getElementById('od-btn-90d');
  var btnMl=document.getElementById('od-btn-ml');
  if(!body)return;
  [btn90,btnMl].forEach(function(b){if(b)b.classList.remove('active');});
  var activeBtn=type==='90d'?btn90:btnMl;
  if(activeBtn)activeBtn.classList.add('active');
  body.innerHTML='<div style="color:var(--sub);font-size:12px;padding:12px 0">⏳ กำลังโหลด...</div>';
  if(type==='90d'){
    gsr('get90DayReviews',{role:'mc',menteeName:name},function(r){
      if(!r.ok){body.innerHTML='<div style="color:var(--re);font-size:12px">❌ '+(r.error||'')+'</div>';return;}
      var reviews=r.reviews||[];
      if(!reviews.length){body.innerHTML='<div style="color:var(--sub);font-size:12px;padding:8px 0">ยังไม่มี 90-Day Review — <button class="bsm" style="font-size:11px" onclick="rdOpenNew()">+ สร้างใหม่ (ใน 8W Tab)</button></div>';return;}
      body.innerHTML=reviews.map(function(rv){
        function yn(v){return v?'<span style="color:var(--gr);font-weight:700">✅</span>':'<span style="color:var(--re)">❌</span>';}
        return '<div style="background:var(--sf2);border-radius:9px;padding:10px 12px;margin-bottom:7px">'
          +'<div style="font-size:10px;color:var(--sub);margin-bottom:5px">'+esc(rv.date)+'</div>'
          +'<div style="display:flex;gap:12px;font-size:12px;flex-wrap:wrap">'
          +'<span>Passport: '+yn(rv.passportOK)+'</span>'
          +'<span>PALMS: '+yn(rv.palmsPass)+' '+rv.palmsScore+'pt</span>'
          +'<span>Graduate: '+yn(rv.graduateReady)+'</span>'
          +'<span>ต่อ: '+(rv.extendMentoring?'✅':'❌')+'</span>'
          +'</div>'+(rv.notes?'<div style="font-size:11px;color:var(--sub);margin-top:4px">'+esc(rv.notes)+'</div>':'')
          +'</div>';
      }).join('');
    });
  } else {
    gsr('getMentorLogs',{role:'mc',menteeName:name},function(r){
      if(!r.ok){body.innerHTML='<div style="color:var(--re);font-size:12px">❌ '+(r.error||'')+'</div>';return;}
      var logs=r.logs||[];
      if(!logs.length){body.innerHTML='<div style="color:var(--sub);font-size:12px;padding:8px 0">Mentor ยังไม่มี Activity Log สำหรับสมาชิกนี้</div>';return;}
      body.innerHTML=logs.slice().reverse().slice(0,5).map(function(lg){
        return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--sf2);border-radius:9px;margin-bottom:5px">'
          +'<span style="font-size:14px">'+({' โทรหา Mentee':'📞','นัด 1-2-1 กับ Mentee':'🤝','แนะนำ Mentee ให้รู้จักสมาชิก':'👥','ให้ feedback presentation':'💬','นั่งข้างๆ Mentee ในการประชุม':'🪑','ช่วย Mentee เรื่อง referral':'💡','อื่นๆ':'📌'}[lg.activity]||'📌')+'</span>'
          +'<div style="flex:1"><div style="font-size:12px;font-weight:600">'+esc(lg.activity)+'</div>'
          +'<div style="font-size:10px;color:var(--sub)">W'+lg.week+' · '+esc(lg.mentorName||'—')+' · '+esc(lg.date)+'</div></div>'
          +'</div>';
      }).join('');
    });
  }
}

function m360TogPanel(id,focusId){
  var p=document.getElementById(id);if(!p)return;
  p.style.display=p.style.display==='block'?'none':'block';
  if(p.style.display==='block'&&focusId){var f=document.getElementById(focusId);if(f){f.focus();}}
}
function m360SendMsg(){
  var msg=document.getElementById('m360-msg-txt').value.trim();
  var res=document.getElementById('m360-msg-res');
  if(!msg){res.style.color='var(--re)';res.textContent='ใส่ข้อความก่อน';return;}
  res.style.color='var(--sub)';res.textContent='กำลังส่ง...';
  gsr('getMyTeam',{role:'mc',teamName:_m360.mentor},function(r){
    var row=0;if(r.ok&&r.members)r.members.forEach(function(m,i){if(m.name===_m360.name)row=i+4;});
    if(!row){res.style.color='var(--re)';res.textContent='ไม่พบ row';return;}
    gsr('saveMCMessage',{role:'mc',teamName:_m360.mentor,row:row,message:msg},function(r2){
      if(r2.ok){
        res.style.color='var(--gr)';res.textContent='✓ ส่งแล้ว';
        document.getElementById('m360-msg-txt').value='';
        gsr('getMessages',{role:'mc'},function(r3){if(r3.ok){D.msgs=r3.messages||[];renderMsgs();updateBadges();}});
      }else{res.style.color='var(--re)';res.textContent='ผิดพลาด: '+(r2.error||'');}
    });
  });
}
function m360SendReply(){
  var txt=document.getElementById('m360-rep-txt').value.trim();
  var res=document.getElementById('m360-rep-res');
  if(!txt){res.style.color='var(--re)';res.textContent='ใส่ข้อความก่อน';return;}
  res.style.color='var(--sub)';res.textContent='กำลังส่ง...';
  gsr('saveReply',{role:'mc',teamName:_m360.repTeam,row:_m360.repRow,memberName:_m360.name,reply:txt},function(r){
    if(r.ok){
      res.style.color='var(--gr)';res.textContent='✓ ตอบแล้ว';
      gsr('getReports',{role:'mc'},function(r2){if(r2.ok){D.reps=r2.reports||[];renderRep();updateBadges();}});
    }else{res.style.color='var(--re)';res.textContent='ผิดพลาด: '+(r.error||'');}
  });
}
function m360Close(){
  if(!confirm('ปิดเคสของ '+_m360.name+'?'))return;
  gsr('setReportStatus',{role:'mc',teamName:_m360.repTeam,row:_m360.repRow,status:'done'},function(r){
    if(r.ok){closeModal();gsr('getReports',{role:'mc'},function(r2){if(r2.ok){D.reps=r2.reports||[];renderRep();updateBadges();}});}
    else alert('ผิดพลาด: '+(r.error||''));
  });
}
function m360Reopen(){
  if(!confirm('Reopen เคสของ '+_m360.name+'?'))return;
  gsr('setReportStatus',{role:'mc',teamName:_m360.repTeam,row:_m360.repRow,status:'reopened'},function(r){
    if(r.ok){closeModal();gsr('getReports',{role:'mc'},function(r2){if(r2.ok){D.reps=r2.reports||[];renderRep();updateBadges();}});}
    else alert('ผิดพลาด: '+(r.error||''));
  });
}
function m360SendTask(){
  var tp=document.getElementById('m360-task-type').value;
  var pr=document.getElementById('m360-task-pri').value;
  var nt=document.getElementById('m360-task-note').value.trim();
  var res=document.getElementById('m360-task-res');
  if(!_m360.mentor){
    res.style.color='var(--re)';
    res.textContent='สมาชิกคนนี้ยังไม่มี Mentor/ทีม จึงยังสร้าง Task ไม่ได้';
    return;
  }
  res.style.color='var(--sub)';res.textContent='กำลังส่ง...';
  gsr('createGrowthTask',{role:'growth',teamName:_m360.mentor,memberName:_m360.name,taskType:tp,priority:pr,note:nt},function(r){
    if(r.ok){
      res.style.color='var(--gr)';res.textContent='✓ สร้าง Task แล้ว';
      document.getElementById('m360-task-note').value='';
      gsr('getGrowthTasks',{statusFilter:'all'},function(r2){if(r2.ok){G.tasks=r2.tasks||[];renderTasks();updateBadges();}});
    }else{res.style.color='var(--re)';res.textContent='ผิดพลาด: '+(r.error||'');}
  });
}

// ── 3. TAB NOTIFICATION BADGES ────────────────────
function badge(id,n){var el=document.getElementById(id);if(!el)return;el.textContent=n;el.style.display=n>0?'flex':'none';}
function updateBadges(){
  if(S.role==='mc'){
    var openReports=D.reps.filter(function(r){return repIsOpen(r);}).length;
    badge('badge-rep',openReports);
    badge('badge-msg',D.msgs.filter(function(m){return!_readMsgs[_msgKey(m)];}).length);
    var rt=riskThresh.absent||4,rs=riskThresh.score||30;
    badge('badge-risk',D.mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);}).length);
    badge('badge-ren',D.ren.filter(function(r){return r.diffDays<=30;}).length);
    badge('badge-coach',D.mem.filter(function(m){return m.bniTl==='red'||m.bniTl==='yellow';}).length);
    badge('badge-8w',D.mem.filter(function(m){return m.actual&&m.actual.bniDays>0&&m.actual.bniDays<=56;}).length);
    badge('badge-line-issue',D.lineIssueOpen||0);
  }
  if(S.role==='growth'){
    badge('badge-task',G.tasks.filter(function(t){return t.status==='open';}).length);
    badge('badge-dec',G.dec.length);
    badge('badge-nm',G.nm.length);
    var gwCount=(G.mem||[]).filter(function(m){return m.mentoringMode==='growth_watch';}).length;
    badge('badge-gw-gr',gwCount);
    badge('badge-gr-ren',(G.ren||[]).filter(function(r){return(r.diffDays||999)<=30;}).length);
  }
}

function loadLineIssueBadge(force){
  if(S.role!=='mc'&&!S.isMC)return;
  if(D._lineIssueBadgeLoaded&&!force)return;
  D._lineIssueBadgeLoaded=true;
  gsr('getLineIssues',{role:S.role},function(r){
    if(!r||!r.ok)return;
    D.lineIssues=r.list||[];
    D.lineIssueOpen=D.lineIssues.filter(function(i){return i.status==='รอดำเนินการ'||i.status==='กำลังดำเนินการ';}).length;
    updateBadges();
    renderFocusBar();
  });
}

// ── 4. BULK ACTIONS ───────────────────────────────
function toggleBulk(name,mentor,chk){
  if(chk.checked)bulkSel[name]={name:name,mentor:mentor};
  else delete bulkSel[name];
  updateBulkBar();
}
function toggleAllBulk(chk){
  var rows=document.querySelectorAll('#mtb input.cb-chk');
  rows.forEach(function(r){r.checked=chk.checked;r.onclick&&r.onclick.call(r);});
  if(!chk.checked)bulkSel={};
  updateBulkBar();
}
function clearBulk(){
  bulkSel={};
  document.querySelectorAll('.cb-chk').forEach(function(c){c.checked=false;});
  updateBulkBar();
}
function updateBulkBar(){
  var n=Object.keys(bulkSel).length;
  document.getElementById('bulk-bar').style.display=n>0?'flex':'none';
  document.getElementById('bk-cnt').textContent=n+' คน';
}
function bulkMsg(){
  var names=Object.keys(bulkSel);
  if(!names.length)return;
  document.getElementById('bk-desc').textContent='ส่งถึง: '+names.join(', ');
  document.getElementById('bk-txt').value='';
  document.getElementById('bk-res').textContent='';
  document.getElementById('bk-modal').style.display='flex';
}
function closeBulkMsg(){document.getElementById('bk-modal').style.display='none';}
function sendBulkMsg(){
  var msg=document.getElementById('bk-txt').value.trim();
  var res=document.getElementById('bk-res');
  if(!msg){res.style.color='var(--re)';res.textContent='ใส่ข้อความก่อน';return;}
  var targets=Object.values(bulkSel);
  var done=0,total=targets.length;
  res.style.color='var(--sub)';res.textContent='กำลังส่ง 0/'+total+'...';
  targets.forEach(function(t){
    gsr('getMyTeam',{role:'mc',teamName:t.mentor},function(r){
      var row=0;
      if(r.ok&&r.members)r.members.forEach(function(m,i){if(m.name===t.name)row=i+4;});
      if(!row){done++;res.textContent='ส่งแล้ว '+done+'/'+total;return;}
      gsr('saveMCMessage',{role:'mc',teamName:t.mentor,row:row,message:msg},function(){
        done++;res.textContent='ส่งแล้ว '+done+'/'+total;
        if(done===total){res.style.color='var(--gr)';res.textContent='✓ ส่งครบ '+total+' คน';clearBulk();
          setTimeout(closeBulkMsg,1500);gsr('getMessages',{role:'mc'},function(r2){if(r2.ok){D.msgs=r2.messages||[];renderMsgs();updateBadges();}});}
      });
    });
  });
}
function bulkExport(){
  var names=Object.keys(bulkSel);
  if(!names.length)return;
  var list=D.mem.filter(function(m){return bulkSel[m.name];});
  var rows=[['ชื่อ','นิคเนม','ทีม','BNI Zone','BNI Score','PALMS','ขาด','Ref','TYFCB','Visitor','1-2-1','CEU']];
  list.forEach(function(m){var c=m.cats||{};rows.push([m.name,m.nick||'',m.mentor||'',m.bniTl,m.bniScore,m.palmsScore||'',m.absent,c.ref||0,c.tyfcb||0,c.visitor||0,c.one21||0,c.training||0]);});
  exportCSV(rows,'selected_members.csv');
}

// ── 5. MEETING MODE (MC) ──────────────────────────
function enterMeeting(){
  var sm=D.sm,total=sm.total||0;
  var sc=D.mem.filter(function(m){return m.bniTl!=='none';});
  var avg=sc.length?Math.round(sc.reduce(function(a,m){return a+m.bniScore;},0)/sc.length):0;
  var risk=D.mem.filter(function(m){return m.absent>4||(m.bniTl!=='none'&&m.bniScore<30);}).length;
  document.getElementById('mt-sub').textContent=new Date().toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('mt-grid').innerHTML=[
    {l:'สมาชิกทั้งหมด',v:total,c:'#B08A3C'},{l:'🟢 Green Zone',v:sm.green||0,c:'var(--gr)'},
    {l:'BNI Score เฉลี่ย',v:avg,c:'#60a5fa'},{l:'⚠️ Risk Members',v:risk,c:'var(--re)'},
    {l:'🟡 Yellow',v:sm.yellow||0,c:'var(--ye)'},{l:'🔴 Red',v:sm.red||0,c:'var(--re)'},
    {l:'⚫ Black',v:sm.black||0,c:'#8b92b8'},{l:'📋 Reports รอ',v:D.reps.filter(function(r){return repIsOpen(r);}).length,c:'#f97316'}
  ].map(function(k){return'<div class="mt-kc"><div class="mt-kv" style="color:'+k.c+'">'+k.v+'</div><div class="mt-kl">'+k.l+'</div></div>';}).join('');
  var riskList=D.mem.filter(function(m){return m.absent>4||(m.bniTl!=='none'&&m.bniScore<30);});
  document.getElementById('mt-risk').innerHTML=riskList.length?riskList.slice(0,6).map(function(m){
    return'<div class="ac2 risk" style="margin-bottom:8px"><div style="font-size:19px">⚠️</div><div class="ai"><div class="an">'+esc(m.name)+'</div><div class="at">'+esc(m.mentor||'')+'</div></div><span class="badge b-'+tlK(m.bniTl)+'">'+tlL(m.bniTl)+'</span></div>';
  }).join(''):'<div class="es">ไม่มี ✅</div>';
  if(mdc)mdc.destroy();
  var data=[sm.green||0,sm.yellow||0,sm.red||0,sm.black||0,sm.none||0];
  mdc=new Chart(document.getElementById('mt-donut').getContext('2d'),{type:'doughnut',
    data:{labels:['Green','Yellow','Red','Black','N/A'],datasets:[{data:data,backgroundColor:['#34D399','#FBBF24','#F87171','#8b92b8','#4b5563'],borderWidth:2,borderColor:chartColors().border}]},
    options:{cutout:'60%',plugins:{legend:{display:true,position:'bottom',labels:{color:'#8b92b8',font:{size:11}}}}}});
  document.getElementById('meeting').style.display='flex';
}
function exitMeeting(){document.getElementById('meeting').style.display='none';}

// ── 6. CHAPTER HEALTH SCORE ───────────────────────
function renderHealthScore(){
  var mem=G.mem,sm=G.sm;
  if(!mem.length){document.getElementById('hs-num').textContent='—';return;}
  var sc=mem.filter(function(m){return m.tl&&m.tl!=='none';});
  var bniAvg=sc.length?sc.reduce(function(a,m){return a+(m.score||0);},0)/sc.length:0;
  var attendRate=sm.chapterAttendRate||0;
  var total=sm.total||mem.length||1;
  var balanced=sm.balanced||0;
  var balRatio=Math.round(balanced/total*100);
  var taskDone=G.tasks.filter(function(t){return t.status==='done';}).length;
  var taskTotal=G.tasks.length;
  var taskRate=taskTotal?Math.round(taskDone/taskTotal*100):100;
  var score=Math.round((bniAvg/100)*30+(attendRate/100)*25+(balRatio/100)*25+(taskRate/100)*20);
  score=Math.min(100,Math.max(0,score));
  var color=score>=75?'var(--gr)':score>=50?'var(--ye)':'var(--re)';
  var grade=score>=75?'ดีเยี่ยม 🌟':score>=60?'ดี ✅':score>=45?'ปานกลาง 🟡':'ต้องปรับปรุง ⚠️';
  var arc=Math.round(score/100*251);
  document.getElementById('hs-arc').setAttribute('stroke-dasharray',arc+' 251');
  document.getElementById('hs-arc').setAttribute('stroke',color);
  document.getElementById('hs-num').textContent=score;
  document.getElementById('hs-num').style.color=color;
  document.getElementById('hs-grade').textContent=grade;
  document.getElementById('hs-bars').innerHTML=[
    {l:'BNI Score',v:Math.round(bniAvg),max:100,c:'#60a5fa'},
    {l:'Attendance',v:attendRate,max:100,c:'var(--gr)'},
    {l:'Balance',v:balRatio,max:100,c:'var(--ye)'},
    {l:'Tasks Done',v:taskRate,max:100,c:'#a78bfa'}
  ].map(function(b){return'<div class="hs-bar-item"><span>'+b.l+': </span><strong>'+b.v+'%</strong></div>';}).join('');
}

// ── 7. CSV EXPORT ─────────────────────────────────
function exportCSV(rows,filename){
  var csv=rows.map(function(r){return r.map(function(c){return'"'+String(c||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function exportMemberCSV(){
  var se=document.getElementById('ms').value.trim().toLowerCase();
  var tm=document.getElementById('mtf').value;
  var list=D.mem.filter(function(m){
    if(se&&(m.name||'').toLowerCase().indexOf(se)===-1&&(m.nick||'').toLowerCase().indexOf(se)===-1)return false;
    if(tm&&m.mentor!==tm)return false;
    if(mzf!=='all'&&m.bniTl!==mzf)return false;
    return true;
  });
  var rows=[['ชื่อ','นิคเนม','ทีม','BNI Zone','BNI Score','PALMS','ขาด','Ref','TYFCB','Visitor','1-2-1','CEU']];
  list.forEach(function(m){var c=m.cats||{};rows.push([m.name,m.nick||'',m.mentor||'',m.bniTl,m.bniScore,m.palmsScore||'',m.absent,c.ref||0,c.tyfcb||0,c.visitor||0,c.one21||0,c.training||0]);});
  exportCSV(rows,'members_export.csv');
}
function exportBalCSV(){
  var se=document.getElementById('gbs').value.trim().toLowerCase();
  var tm=document.getElementById('gbteam').value;
  var list=G.mem.filter(function(m){
    if(se&&(m.name||'').toLowerCase().indexOf(se)===-1&&(m.nick||'').toLowerCase().indexOf(se)===-1)return false;
    if(tm&&m.mentor!==tm)return false;
    if(gzf2!=='all'&&m.zone!==gzf2)return false;
    return true;
  });
  var rows=[['ชื่อ','นิคเนม','ทีม','Zone','RG','RR','Give%','TYFCB','Visitor','1-2-1','CEU','ขาด','PALMS']];
  list.forEach(function(m){rows.push([m.name,m.nick||'',m.mentor||'',m.zone,m.rgCount,m.rrCount,m.giveRatio,m.tyfcb,m.visitors,m.r121,m.ceu,m.absent,m.score]);});
  exportCSV(rows,'referral_balance.csv');
}

// ── 8. STICKY FILTERS ─────────────────────────────
function saveFilters(){
  if(!S.role)return;
  try{localStorage.setItem('bnif_'+S.role,JSON.stringify({mzf:mzf,ftf:ftf,rff:rff,gzf2:gzf2,tsf:tsf}));}catch(e){}
}
function loadFilters(){
  if(!S.role)return;
  try{
    var f=JSON.parse(localStorage.getItem('bnif_'+S.role)||'{}');
    if(f.mzf)mzf=f.mzf;if(f.ftf)ftf=f.ftf;if(f.rff)rff=f.rff;if(f.gzf2)gzf2=f.gzf2;if(f.tsf)tsf=f.tsf;
    // Restore zone pill highlights after filters loaded
    if(f.mzf){var zEl=document.querySelector('#mc-mem .zp[data-z="'+f.mzf+'"]');if(zEl){document.querySelectorAll('#mc-mem .zp').forEach(function(b){b.classList.remove('on');});zEl.classList.add('on');}}
  }catch(e){}
}

// ── 9. GLOBAL SEARCH ──────────────────────────────
function onGS(v){
  clearTimeout(window._gst);
  if(!v||v.length<2){closeGS();return;}
  window._gst=setTimeout(function(){doGS(v);},200);
}
function doGS(q){
  var ql=q.toLowerCase();var res=[];
  var mem=S.role==='mc'?D.mem:G.mem;
  mem.forEach(function(m){
    if((m.name||'').toLowerCase().indexOf(ql)>=0||(m.nick||'').toLowerCase().indexOf(ql)>=0){
      res.push({type:'สมาชิก',text:m.name+(m.nick?' ('+m.nick+')':''),sub:m.mentor||'',act:function(n){openModal(n);},arg:m.name});
    }
  });
  if(S.role==='mc'){
    D.reps.forEach(function(r){
      if((r.memberName||'').toLowerCase().indexOf(ql)>=0){
        res.push({type:'Report',text:r.memberName,sub:(r.coreIssue||'').slice(0,50),act:function(){swTo('mc-rep','mc',7);},arg:null});
      }
    });
    D.msgs.forEach(function(m){
      if((m.name||'').toLowerCase().indexOf(ql)>=0||(m.msg||'').toLowerCase().indexOf(ql)>=0){
        res.push({type:'Message',text:m.name,sub:(m.msg||'').slice(0,50),act:function(){swTo('mc-msg','mc',6);},arg:null});
      }
    });
  }
  if(S.role==='growth'){
    G.tasks.forEach(function(t){
      if((t.memberName||'').toLowerCase().indexOf(ql)>=0){
        res.push({type:'Task',text:t.memberName,sub:(t.note||'').slice(0,50),act:function(){swTo('gr-task','gr',2);},arg:null});
      }
    });
  }
  _gsResults=res.slice(0,8);
  var drop=document.getElementById('gs-drop');
  if(!_gsResults.length){drop.innerHTML='<div style="padding:12px;color:var(--sub);font-size:12px">ไม่พบ "'+esc(q)+'"</div>';drop.style.display='block';return;}
  drop.innerHTML=_gsResults.map(function(r,i){
    return'<div class="gs-item" onmousedown="gsClick('+i+')"><span class="gs-tag">'+esc(r.type)+'</span><div><div style="font-size:13px;font-weight:600">'+esc(r.text)+'</div>'+(r.sub?'<div style="font-size:11px;color:var(--sub)">'+esc(r.sub)+'</div>':'')+' </div></div>';
  }).join('');
  drop.style.display='block';
}
function gsClick(i){
  var r=_gsResults[i];if(!r)return;
  document.getElementById('gs-input').value='';closeGS();
  if(r.arg)r.act(r.arg);else r.act();
}
function closeGS(){document.getElementById('gs-drop').style.display='none';}
function swTo(secId,group,tabIdx){
  var tabs=document.querySelectorAll('#'+group+'-tabs .tb');
  if(tabs[tabIdx])sw(secId,tabs[tabIdx],group);
}

// ── 10. LIGHT / DARK MODE ─────────────────────────
function toggleLight(){
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : '');
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = isDark ? '☀️' : '🌙';
  const mc = document.querySelector('meta[name="theme-color"]');
  if(mc) mc.content = isDark ? '#0E1110' : '#F4F0E7';
  // Re-render charts so axis colors update immediately
  setTimeout(function(){
    try{ if(dc||bc){ renderDonut(); renderBar(); } }catch(e){}
    try{ if(jc){ renderJIBar(); } }catch(e){}
    try{ if(mdc){ renderMTTeams(); } }catch(e){}
    try{ if(tdc||tdc2){ var a=document.querySelector('.td-btn.on'); if(a)a.click(); } }catch(e){}
  }, 50);
}

// ══ FEATURE 8: TOAST (replace all alert()) ════════
function toast(msg,type,dur){
  type=type||'ok';dur=dur||3000;
  var w=document.getElementById('toast-wrap');
  var d=document.createElement('div');
  d.className='toast '+type;
  var ico=type==='ok'?'✅':type==='err'?'❌':'⚠️';
  d.innerHTML='<span>'+ico+'</span><span>'+esc(msg)+'</span>';
  w.appendChild(d);
  setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},dur);
}

// ══ FEATURE 2: KEYBOARD SHORTCUTS ════════════════
document.addEventListener('keydown',function(e){
  if(!S.role)return;
  var tag=(document.activeElement||{}).tagName||'';
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  var n=parseInt(e.key);
  if(n>=1&&n<=9){
    var tabs=document.querySelectorAll('#'+(S.role==='mc'?'mc':'gr')+'-tabs .tb');
    if(tabs[n-1])tabs[n-1].click();
    e.preventDefault();return;
  }
  if(e.key==='/'||e.key==='f'&&e.ctrlKey){
    var gi=document.getElementById('gs-input');if(gi){gi.focus();gi.select();}
    e.preventDefault();return;
  }
  if((e.key==='k'||e.key==='K')&&(e.ctrlKey||e.metaKey)){e.preventDefault();openCmdPal();return;}
  if(e.key==='Escape'){
    if(document.getElementById('cmd-pal').style.display==='flex'){closeCmdPal();return;}
    if(document.getElementById('cmp-modal').style.display==='flex'){closeCmp();return;}
    if(document.getElementById('mct-modal').style.display==='flex'){closeMCT();return;}
    if(document.getElementById('tmd').style.display==='flex'){closeTMD();return;}
    if(document.getElementById('imd').style.display==='flex'){closeIMD();return;}
    if(document.getElementById('modal').style.display==='flex'){closeModal();return;}
    if(document.getElementById('meeting').style.display==='flex'){exitMeeting();return;}
  }
  if(e.key==='r'||e.key==='R'){manualReload();}
  if(e.key==='p'||e.key==='P'){window.print();}
});

// ══ FEATURE 3: PIN MEMBERS ════════════════════════
var pinnedMembers=(function(){try{return JSON.parse(localStorage.getItem('bni_pins')||'{}');}catch(e){return{};}})();
function togglePin(name){
  if(pinnedMembers[name])delete pinnedMembers[name];else pinnedMembers[name]=1;
  try{localStorage.setItem('bni_pins',JSON.stringify(pinnedMembers));}catch(e){}
  renderMem();if(S.role==='growth')renderBal();
}
function pinSort(list){
  var pinned=list.filter(function(m){return pinnedMembers[m.name];});
  var rest=list.filter(function(m){return!pinnedMembers[m.name];});
  return pinned.concat(rest);
}

// ══ FEATURE 5: MESSAGE TEMPLATES ════════════════
var msgTemplates=[
  'สวัสดีครับ ขอแจ้งว่าคุณขาดประชุมมาหลายครั้งแล้ว ขอให้พยายามเข้าประชุมให้สม่ำเสมอนะครับ เพื่อรักษาสิทธิ์และความสัมพันธ์กับ Chapter',
  'สวัสดีครับ สังเกตว่าคะแนน BNI ของคุณลดลงต่อเนื่อง อยากนัดคุยเพื่อวางแผน Fast Track ร่วมกันครับ',
  'สวัสดีครับ ขอแจ้งว่าสมาชิกภาพของคุณกำลังจะหมดอายุในเร็วๆ นี้ กรุณาติดต่อเพื่อต่ออายุสมาชิกก่อนวันหมดอายุครับ',
  'ยินดีต้อนรับสู่ BNI IDEAL ครับ! ทีม Mentor พร้อมช่วยเหลือคุณทุกขั้นตอน อย่าลังเลที่จะถามหากมีข้อสงสัยนะครับ',
  'สวัสดีครับ อยากกระตุ้นให้คุณลอง ส่ง Referral ให้สมาชิกท่านอื่นในสัปดาห์นี้ เพื่อเพิ่ม BNI Score และสร้างความสัมพันธ์ที่ดีใน Chapter ครับ'
];
function useTmpl(i){var t=document.getElementById('msgTxt');if(t&&msgTemplates[i])t.value=msgTemplates[i];}

// ══ FEATURE 10: COLUMN SORT ═══════════════════════
var colSortState={col:'',dir:1};
function colSort(col,th){
  if(colSortState.col===col)colSortState.dir*=-1;else{colSortState.col=col;colSortState.dir=-1;}
  document.querySelectorAll('.sort-arrow').forEach(function(s){s.textContent='↕';});
  var arrow=document.getElementById('sa-'+col);
  if(arrow)arrow.textContent=colSortState.dir===-1?'↓':'↑';
  renderMem();
}

// ══ FEATURE 9: RISK THRESHOLDS ════════════════════
var riskThresh=(function(){try{return JSON.parse(localStorage.getItem('bni_thresh')||'{"absent":4,"score":30}');}catch(e){return{absent:4,score:30};}})();
function toggleThresh(){var w=document.getElementById('thresh-wrap');w.style.display=w.style.display==='block'?'none':'block';}
function saveThresh(){
  riskThresh.absent=parseInt(document.getElementById('th-absent').value)||3;
  riskThresh.score=parseInt(document.getElementById('th-score').value)||30;
  try{localStorage.setItem('bni_thresh',JSON.stringify(riskThresh));}catch(e){}
  renderRisk();updateBadges();
}
function initThreshUI(){
  var a=document.getElementById('th-absent'),s=document.getElementById('th-score');
  if(a)a.value=riskThresh.absent;if(s)s.value=riskThresh.score;
}

// ══ FEATURE 7: CHAPTER GOALS ══════════════════════
var goals=(function(){try{return JSON.parse(localStorage.getItem('bni_goals')||'{}');}catch(e){return{};}})();
var goalsEditing=false;
var goalDefs=[
  {id:'ref',label:'Referral Given',icon:'🔄',color:'#60a5fa',dataFn:function(){return G.mem.reduce(function(a,m){return a+(m.rgCount||0);},0);}},
  {id:'tyfcb',label:'TYFCB (฿)',icon:'💰',color:'var(--ye)',dataFn:function(){return G.sm.totalTYFCB||0;}},
  {id:'visitor',label:'Visitor',icon:'👤',color:'#f97316',dataFn:function(){return G.sm.totalVisitors||0;}},
  {id:'attend',label:'Attend Rate %',icon:'✅',color:'var(--gr)',dataFn:function(){return G.sm.chapterAttendRate||0;}},
  {id:'balanced',label:'Balanced Members',icon:'⚖️',color:'#a78bfa',dataFn:function(){return G.sm.balanced||0;}}
];
function renderGoals(){
  var html=goalDefs.map(function(g){
    var actual=g.dataFn();var target=goals[g.id]||0;
    var pct=target>0?Math.min(100,Math.round(actual/target*100)):0;
    var fill=pct>=100?'var(--gr)':pct>=70?'var(--ye)':'#60a5fa';
    return'<div class="goal-card" onclick="toggleGoalCardEdit(\''+g.id+'\')">'+
      '<div class="goal-lbl">'+g.icon+' '+g.label+'</div>'+
      '<div class="goal-val" style="color:'+g.color+'">'+fmtB(actual)+'</div>'+
      (target>0?'<div class="goal-prog"><div class="goal-fill" style="width:'+pct+'%;background:'+fill+'"></div></div>'+
        '<div class="goal-nums"><span>เป้า: '+fmtB(target)+'</span><span>'+pct+'%</span></div>':'<div style="font-size:11px;color:var(--sub)">ยังไม่ได้ตั้งเป้า</div>')+
      '<div class="goal-edit" id="ge-'+g.id+'">'+
        '<label>เป้าหมาย</label>'+
        '<input type="number" id="gi-'+g.id+'" value="'+(target||'')+'" placeholder="ใส่เป้าหมาย..." onclick="event.stopPropagation()">'+
        '<button class="bsend" style="padding:4px 10px;font-size:11px" onclick="event.stopPropagation();saveGoal(\''+g.id+'\')">บันทึก</button>'+
      '</div>'+
    '</div>';
  }).join('');
  document.getElementById('goal-grid').innerHTML=html;
}
function toggleGoalCardEdit(id){var e=document.getElementById('ge-'+id);if(e)e.style.display=e.style.display==='block'?'none':'block';}
function toggleGoalEdit(){goalDefs.forEach(function(g){toggleGoalCardEdit(g.id);});}
function saveGoal(id){
  var inp=document.getElementById('gi-'+id);if(!inp)return;
  goals[id]=parseFloat(inp.value)||0;
  try{localStorage.setItem('bni_goals',JSON.stringify(goals));}catch(e){}
  renderGoals();toast('บันทึกเป้าหมายแล้ว','ok');
}

// ══ FEATURE 6: SCORE TREND CHART ══════════════════
var tdc=null;
function renderTrendChart(){
  var mem=G.mem.filter(function(m){return m.hist&&m.hist.length;});
  if(!mem.length)return;
  var maxLen=Math.max.apply(null,mem.map(function(m){return m.hist.length;}));
  maxLen=Math.min(maxLen,6);
  var labels=[];for(var i=maxLen;i>0;i--)labels.push('เดือน -'+i);labels.push('ล่าสุด');
  // Average by month position
  var avgs=[];
  for(var j=0;j<=maxLen;j++){
    var vals=[];
    mem.forEach(function(m){var idx=m.hist.length-maxLen-1+j;if(idx>=0&&idx<m.hist.length){var v=parseFloat(m.hist[idx]);if(!isNaN(v)&&v>0)vals.push(v);}});
    avgs.push(vals.length?Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length):null);
  }
  if(tdc)tdc.destroy();
  var ctx=document.getElementById('trendChart');if(!ctx)return;
  tdc=new Chart(ctx.getContext('2d'),{type:'line',
    data:{labels:labels.slice(-avgs.length),datasets:[{label:'BNI Avg',data:avgs,borderColor:'#B08A3C',backgroundColor:'rgba(60,120,80,.1)',borderWidth:2,pointRadius:4,pointBackgroundColor:'#B08A3C',tension:.3,fill:true}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick,font:{size:10}}},
        y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick},min:0,max:100,suggestedMin:0}}}});
}

// ══ FEATURE 4: ACTIVITY HEATMAP ═══════════════════
function renderHeatmap(){
  var tm=document.getElementById('hm-team').value;
  var so=document.getElementById('hm-sort').value;
  var list=[].concat(G.mem).filter(function(m){return!tm||m.mentor===tm;});
  list.sort(function(a,b){return so==='tyfcb'?b.tyfcb-a.tyfcb:so==='ref'?b.rgCount-a.rgCount:so==='absent'?b.absent-a.absent:b.score-a.score;});
  var cols=[
    {l:'PALMS',fn:function(m){return m.score||0;},max:100,c:function(v){return v>=70?'var(--gr)':v>=50?'var(--ye)':v>=30?'var(--re)':'#60a5fa';}},
    {l:'RG',fn:function(m){return m.rgCount||0;},max:15,c:function(v,mx){return hmColor(v,mx,'#60a5fa');}},
    {l:'RR',fn:function(m){return m.rrCount||0;},max:15,c:function(v,mx){return hmColor(v,mx,'var(--gr)');}},
    {l:'TYFCB',fn:function(m){return Math.min(m.tyfcb||0,500000);},max:500000,c:function(v,mx){return hmColor(v,mx,'var(--ye)');}},
    {l:'Visitor',fn:function(m){return m.visitors||0;},max:20,c:function(v,mx){return hmColor(v,mx,'#f472b6');}},
    {l:'1-2-1',fn:function(m){return m.r121||0;},max:20,c:function(v,mx){return hmColor(v,mx,'#a78bfa');}},
    {l:'Attend%',fn:function(m){return m.attendRate||0;},max:100,c:function(v){return v>=80?'var(--gr)':v>=60?'var(--ye)':'var(--re)';}},
    {l:'ขาด',fn:function(m){return m.absent||0;},max:10,c:function(v){return v===0?'var(--gr)':v<=2?'var(--ye)':'var(--re)';},inv:true},
  ];
  var header='<tr><th>ชื่อ</th>'+cols.map(function(c){return'<th style="text-align:center">'+c.l+'</th>';}).join('')+'</tr>';
  var rows=list.slice(0,40).map(function(m){
    var cells=cols.map(function(c){
      var v=c.fn(m);var cl=c.c(v,c.max);
      var op=c.inv?(1-Math.min(v,c.max)/c.max*0.8):(Math.max(0.15,v/c.max));
      return'<td><div class="hm-cell" style="background:'+cl+';opacity:'+op.toFixed(2)+'" title="'+m.name+' · '+c.l+': '+v+'" onclick="openModal(\''+esc(m.name)+'\')">'+fmtB(v)+'</div></td>';
    }).join('');
    return'<tr><td style="font-size:12px;white-space:nowrap;padding:3px 8px"><span class="clickable-name" onclick="openIMD(\''+esc(m.name)+'\')">'+esc(m.nick||m.name)+'</span></td>'+cells+'</tr>';
  }).join('');
  document.getElementById('hm-tbl').innerHTML=header+rows;
}
function hmColor(v,max,base){var op=Math.max(0.12,Math.min(1,v/max));return base;}
function buildHeatmapFilters(){
  var teams=[...new Set(G.mem.map(function(m){return m.mentor;}))].filter(Boolean);
  var s=document.getElementById('hm-team');s.innerHTML='<option value="">ทุกทีม</option>';
  teams.forEach(function(t){s.innerHTML+='<option>'+esc(t)+'</option>';});
}

// ══ COACHING TAB ══════════════════════════════════
var coachFilter='all';
function scf(z,el){coachFilter=z;document.querySelectorAll('#ac-coach .zp').forEach(function(b){b.classList.remove('on');});el.classList.add('on');renderCoach();}
function renderCoach(){
  var _coft=document.getElementById('cof-team');if(!_coft)return;
  var tm=_coft.value;
  var list=D.mem.filter(function(m){
    if(tm&&m.mentor!==tm)return false;
    if(coachFilter==='nongreen')return m.bniTl!=='green'&&m.bniTl!=='none';
    if(coachFilter==='none')return m.bniTl==='none';
    if(coachFilter!=='all')return m.bniTl===coachFilter;
    return true;
  });
  list=pinSort(list);
  list.sort(function(a,b){
    if(pinnedMembers[a.name]&&!pinnedMembers[b.name])return -1;
    if(!pinnedMembers[a.name]&&pinnedMembers[b.name])return 1;
    var zo={red:0,blue:1,yellow:2,none:3,green:4};
    var za=zo[a.bniTl]!==undefined?zo[a.bniTl]:5,zb=zo[b.bniTl]!==undefined?zo[b.bniTl]:5;
    return za!==zb?za-zb:a.bniScore-b.bniScore;
  });
  // Summary row
  var ng=list.filter(function(m){return m.bniTl!=='green'&&m.bniTl!=='none';});
  var hasRep=ng.filter(function(m){return D.reps.some(function(r){return r.memberName===m.name&&repIsOpen(r);});});
  document.getElementById('co-sum').innerHTML=[
    {l:'Coaching ทั้งหมด',v:list.length,c:'var(--ac)'},{l:'ต้องพัฒนา',v:ng.length,c:'var(--ye)'},{l:'มี Open Report',v:hasRep.length,c:'var(--re)'}
  ].map(function(s){return'<div class="co-sum-card"><div style="font-size:22px;font-weight:800;color:'+s.c+'">'+s.v+'</div><div style="font-size:11px;color:var(--sub)">'+s.l+'</div></div>';}).join('');
  document.getElementById('co-cnt').textContent=list.length+' คน';
  document.getElementById('co-grid').innerHTML=list.length?list.map(function(m,i){
    var zc={green:'green-z',yellow:'yellow-z',red:'red-z',blue:'blue-z'}[m.bniTl]||'';
    var reps=D.reps.filter(function(r){return r.memberName===m.name;});
    var openRep=reps.find(function(r){return repIsOpen(r);});
    var ft=(m.fastTrack||[])[0];
    var isPinned=pinnedMembers[m.name]?1:0;
    var msgs=D.msgs.filter(function(msg){return msg.name===m.name;});
    return'<div class="co-card '+zc+'" id="cc-'+i+'">'+
      '<div class="co-hdr">'+
        '<div style="flex:1">'+
          '<div style="display:flex;align-items:center;gap:6px">'+
            '<span class="pin-icon'+(isPinned?' pinned':'')+'" onclick="togglePin(\''+esc(m.name)+'\')" title="Pin">📌</span>'+
            '<span class="clickable-name" style="font-weight:700;font-size:14px" onclick="openIMD(\''+esc(m.name)+'\')">'+esc(m.name)+'</span>'+
            (m.nick?'<span style="font-size:11px;color:var(--sub)">('+esc(m.nick)+')</span>':'')+
            _dropRiskBadge(m)+
            _coProg(m)+
          '</div>'+
          '<div style="font-size:11px;color:var(--sub)">'+esc(m.mentor||'—')+_cBadge(m.name)+'</div>'+
          '<div style="margin-top:5px">'+sparkline(m.hist)+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div class="co-score" style="color:'+tlC(m.bniTl)+'">'+(m.bniTl!=='none'?m.bniScore:'—')+'</div>'+
          '<span class="badge b-'+tlK(m.bniTl)+'" style="font-size:9px">'+tlL(m.bniTl)+'</span>'+
          '<div style="margin-top:4px;font-size:11px;color:'+(m.absent>=riskThresh.absent?'var(--re)':'var(--sub)')+'">ขาด '+m.absent+'ครั้ง</div>'+
        '</div>'+
      '</div>'+
      (openRep?'<div class="co-issue"><strong>Core Issue</strong>'+esc(openRep.coreIssue||'—')+'</div>'+(openRep.actionTaken?'<div class="co-issue"><strong>Action Plan</strong>'+esc(openRep.actionTaken)+'</div>':''):'<div style="font-size:11px;color:var(--sub);margin-bottom:8px">ไม่มี Open Report</div>')+
      (ft?'<div style="font-size:11px;color:var(--ac2);margin-bottom:8px">💡 Fast Track: '+esc(ft.action)+' <strong>+'+ft.gain+'pt</strong></div>':'')+
      (msgs.length?'<div style="font-size:11px;color:var(--sub);margin-bottom:8px;background:var(--sf2);padding:5px 8px;border-radius:5px">📩 '+esc(msgs[0].msg.slice(0,60))+(msgs[0].msg.length>60?'…':'')+'</div>':'')+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
        '<button class="bx" onclick="openIMD(\''+esc(m.name)+'\')">📊 Dashboard</button>'+
        '<button class="bx" onclick="openModal(\''+esc(m.name)+'\')">⚡ Actions</button>'+
        '<button class="bx" onclick="toggleCoNote('+i+')">📝 Note</button>'+
        '<button class="bx" onclick="openCM(\''+esc(m.name)+'\')" title="บันทึกการติดต่อ">📞 Log</button>'+
        '<button class="cmp-tog'+(cmpState.indexOf(m.name)>=0?' on':'')+'" onclick="toggleCmp(\''+esc(m.name)+'\')" title="เปรียบเทียบ">🔍</button>'+
      '</div>'+
      '<div class="co-note-wrap" id="co-note-'+i+'">'+
        '<textarea id="co-ntxt-'+i+'" placeholder="บันทึก coaching notes...">'+esc(msgs.length?msgs[0].msg:'')+'</textarea>'+
        '<div style="display:flex;gap:6px"><button class="bsend" onclick="saveCoNote(\''+esc(m.name)+'\',\''+esc(m.mentor||'')+'\','+i+')">บันทึก</button><button class="bsm" onclick="toggleCoNote('+i+')">ยกเลิก</button></div>'+
        '<div id="co-nres-'+i+'" style="font-size:11px;margin-top:4px"></div>'+
      '</div>'+
    '</div>';
  }).join(''):'<div class="es">ไม่มีสมาชิกในกลุ่มนี้</div>';
}
function toggleCoNote(i){var w=document.getElementById('co-note-'+i);if(w){w.style.display=w.style.display==='block'?'none':'block';if(w.style.display==='block'){var t=document.getElementById('co-ntxt-'+i);if(t)t.focus();}}}
function saveCoNote(name,mentor,i){
  var v=(document.getElementById('co-ntxt-'+i)||{}).value||'';
  var res=document.getElementById('co-nres-'+i);
  if(!v.trim()){res.style.color='var(--re)';res.textContent='ใส่ข้อความก่อน';return;}
  res.style.color='var(--sub)';res.textContent='กำลังบันทึก...';
  var allTeams=MENTOR_TEAMS;
  var ordered=mentor?[mentor].concat(allTeams.filter(function(t){return t!==mentor;})):allTeams;
  var idx=0;
  function tryNext(){
    if(idx>=ordered.length){res.style.color='var(--re)';res.textContent='ไม่พบสมาชิกในระบบ';toast('ไม่พบ row สมาชิก','err');return;}
    var tm=ordered[idx++];
    gsr('getMyTeam',{role:'mc',teamName:tm},function(r){
      if(!r.ok||!r.members){tryNext();return;}
      var row=0;
      r.members.forEach(function(m,j){if(String(m.name).trim()===String(name).trim())row=j+4;});
      if(!row){tryNext();return;}
      gsr('saveMCMessage',{role:'mc',teamName:tm,row:row,message:v},function(r2){
        if(r2.ok){res.style.color='var(--gr)';res.textContent='✓ บันทึกแล้ว';toast('บันทึก Coaching Note แล้ว','ok');
          gsr('getMessages',{role:'mc'},function(r3){if(r3.ok){D.msgs=r3.messages||[];renderMsgs();updateBadges();}});
        }else{res.style.color='var(--re)';res.textContent='ผิดพลาด: '+(r2.error||'');toast('บันทึกไม่สำเร็จ','err');}
      });
    });
  }
  tryNext();
}
function buildCoachFilters(){
  var teams=D.teams.map(function(t){return t.team;});
  var s=document.getElementById('cof-team');if(!s)return;
  s.innerHTML='<option value="">ทุกทีม</option>';
  teams.forEach(function(t){s.innerHTML+='<option>'+esc(t)+'</option>';});
}

// ══ INDIVIDUAL MEMBER DASHBOARD (IMD) ═════════════
var imdCurrentName='';
var idc1=null,idc2=null;
function openIMD(name){
  var mem=S.role==='mc'?D.mem.find(function(m){return m.name===name;}):G.mem.find(function(m){return m.name===name;});
  if(!mem){toast('ไม่พบข้อมูลสมาชิก','err');return;}
  imdCurrentName=name;
  document.getElementById('imd-name').textContent=mem.name+(mem.nick?' ('+mem.nick+')':'');
  document.getElementById('imd-sub').textContent=(mem.mentor||'ไม่มีทีม');
  // Fetch business description if not yet loaded
  if(mem.business===undefined){
    gsr('getMemberDetail',{memberName:name},function(r){
      if(r.ok){
        if(r.memberId)mem.memberId=r.memberId;
        if(r.business!=null)mem.business=r.business;
        var s=document.getElementById('imd-s0');if(s)s.innerHTML=buildIMDScore(mem);
        loadIMDMSB(mem);
      }
    });
  }else{
    loadIMDMSB(mem);
  }
  var tl=S.role==='mc'?mem.bniTl:mem.tl;
  var sc=S.role==='mc'?mem.bniScore:mem.score;
  var zEl=document.getElementById('imd-zone');
  zEl.className='badge b-'+tlK(tl);zEl.textContent=tlL(tl);
  document.getElementById('imd-score').textContent=sc||'—';
  document.getElementById('imd-score').style.color=tlC(tl);
  if(idc1){idc1.destroy();idc1=null;}if(idc2){idc2.destroy();idc2=null;}
  // Build tabs & content
  var tabs=[],secs=[];
  if(S.role==='mc'){
    tabs=['📊 Score','📈 Categories','📜 History','🚀 Fast Track','🎯 Coaching','🗺️ Journey','📝 Meeting Log','🔬 Simulate','💰 Growth','🤝 1-2-1 History'];
    secs=[buildIMDScore(mem),buildIMDCats(mem),buildIMDHistory(mem),buildIMDFT(mem),buildIMDCoachPlan(mem),buildIMDJourney(mem),buildIMDMeetingLog(mem),buildIMDSimulate(mem),buildIMDGrowthData(mem),buildIMD121History(mem)];
  } else {
    tabs=['📊 Overview','⚖️ Referral','📋 Tasks'];
    secs=[buildIMDGrOverview(mem),buildIMDReferral(mem),buildIMDTasks(mem)];
  }
  document.getElementById('imd-tabs').innerHTML=tabs.map(function(t,i){
    return'<button class="tb'+(i===0?' on':'')+'" onclick="imdSw('+i+',this)">'+esc(t)+'</button>';
  }).join('');
  document.getElementById('imd-body').innerHTML=secs.map(function(s,i){
    return'<div class="imd-sec'+(i===0?' on':'')+'" id="imd-s'+i+'">'+s+'</div>';
  }).join('');
  document.getElementById('imd').style.display='flex';
  if(S.role==='mc')loadIMD121History(mem);
  // Render charts after DOM ready
  setTimeout(function(){buildIMDCharts(mem);},50);
}
function closeTMD(){document.getElementById('tmd').style.display='none';}
function tmdSw(idx,btn){
  document.querySelectorAll('#tmd-tabs .tb').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('#tmd-body .imd-sec').forEach(function(s){s.classList.remove('on');});
  btn.classList.add('on');var s=document.getElementById('tmd-s'+idx);if(s)s.classList.add('on');
}
function openTeamDash(teamName){
  try{
    var mems=D.mem.filter(function(m){return m.mentor===teamName;});
    var team=D.teams.find(function(t){return t.team===teamName;})||{};
    var cnt=mems.length||1;
    var avg=team.avg||Math.round(mems.reduce(function(a,m){return a+(m.bniScore||0);},0)/cnt);
    var green=team.green!=null?team.green:mems.filter(function(m){return m.bniTl==='green';}).length;
    var gPct=Math.round(green/cnt*100);
    document.getElementById('tmd-name').textContent='👥 ทีม '+teamName;
    document.getElementById('tmd-sub').textContent=cnt+' สมาชิก · Avg '+avg+' pt · '+gPct+'% Green';
    var tabs=['📊 ภาพรวม','👥 สมาชิก','💡 แนะนำ'];
    var ovHtml='',memHtml='',recHtml='';
    try{ovHtml=buildTMDOverview(mems,team,avg,gPct);}catch(e){ovHtml='<div class="es">Error: '+e.message+'</div>';}
    try{memHtml=buildTMDMembers(mems);}catch(e){memHtml='<div class="es">Error: '+e.message+'</div>';}
    try{recHtml=buildTMDRecommend(mems);}catch(e){recHtml='<div class="es">Error: '+e.message+'</div>';}
    document.getElementById('tmd-tabs').innerHTML=tabs.map(function(t,i){
      return'<button class="tb'+(i===0?' on':'')+'" onclick="tmdSw('+i+',this)">'+esc(t)+'</button>';
    }).join('');
    document.getElementById('tmd-body').innerHTML=
      '<div class="imd-sec on" id="tmd-s0">'+ovHtml+'</div>'+
      '<div class="imd-sec" id="tmd-s1">'+memHtml+'</div>'+
      '<div class="imd-sec" id="tmd-s2">'+recHtml+'</div>';
    document.getElementById('tmd').style.display='flex';
  }catch(e){toast('Team Dash Error: '+e.message,'err');}
}
function buildTMDOverview(mems,team,avg,gPct){
  var cnt=mems.length||1;
  var green=mems.filter(function(m){return m.bniTl==='green';}).length;
  var yellow=mems.filter(function(m){return m.bniTl==='yellow';}).length;
  var red=mems.filter(function(m){return m.bniTl==='red';}).length;
  var blue=mems.filter(function(m){return m.bniTl==='blue';}).length;
  var absTot=mems.reduce(function(a,m){return a+(m.absent||0);},0);
  var kpis=[
    {l:'BNI Avg',v:avg+' pt',c:'#B08A3C'},
    {l:'% Green',v:gPct+'%',c:'var(--gr)'},
    {l:'สมาชิก',v:cnt+' คน',c:'#60a5fa'},
    {l:'ขาดรวม',v:absTot+' ครั้ง',c:absTot>cnt*3?'var(--re)':'var(--sub)'},
  ];
  var html='<div class="kpi-g" style="margin-bottom:20px">'+kpis.map(function(k){
    return'<div class="kc"><div class="kv" style="color:'+k.c+'">'+k.v+'</div><div class="kl">'+k.l+'</div></div>';
  }).join('')+'</div>';
  var zones=[{n:'🟢 Green',c:'var(--gr)',v:green},{n:'🟡 Yellow',c:'var(--ye)',v:yellow},{n:'🔴 Red',c:'var(--re)',v:red},{n:'🔵 Blue',c:'#60a5fa',v:blue}].filter(function(z){return z.v>0;});
  html+='<div class="cc" style="margin-bottom:16px"><div class="cct" style="margin-bottom:10px">Zone Distribution</div><div style="display:flex;gap:14px;flex-wrap:wrap">'+
    zones.map(function(z){return'<div style="display:flex;align-items:center;gap:5px"><div style="width:11px;height:11px;border-radius:3px;background:'+z.c+'"></div><span style="font-size:13px;font-weight:700;color:var(--tx)">'+z.n+'</span><span style="font-size:12px;color:var(--sub)">'+z.v+' คน</span></div>';}).join('')+'</div></div>';
  var scores=mems.map(function(m){return m.bniScore||0;}).filter(function(s){return s>0;}).sort(function(a,b){return b-a;});
  if(scores.length){
    var top=mems.find(function(m){return m.bniScore===scores[0];});
    var bot=mems.find(function(m){return m.bniScore===scores[scores.length-1];});
    html+='<div class="cc"><div class="cct" style="margin-bottom:10px">ช่วงคะแนน</div><div style="display:flex;gap:12px">'+
      '<div style="flex:1;background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.18);border-radius:8px;padding:10px 14px">'+
      '<div style="font-size:10px;color:var(--sub);margin-bottom:3px">สูงสุด</div>'+
      '<div style="font-size:20px;font-weight:700;color:var(--gr)">'+scores[0]+'</div>'+
      '<div style="font-size:12px">'+esc(top?top.name:'')+'</div></div>'+
      '<div style="flex:1;background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.18);border-radius:8px;padding:10px 14px">'+
      '<div style="font-size:10px;color:var(--sub);margin-bottom:3px">ต่ำสุด</div>'+
      '<div style="font-size:20px;font-weight:700;color:var(--re)">'+scores[scores.length-1]+'</div>'+
      '<div style="font-size:12px">'+esc(bot?bot.name:'')+'</div></div></div></div>';
  }
  return html;
}
function buildTMDMembers(mems){
  var sorted=[].concat(mems).sort(function(a,b){return(_calcPri(b).score||0)-(_calcPri(a).score||0);});
  if(!sorted.length)return'<div class="es">ไม่มีสมาชิก</div>';
  return'<div class="tw"><table><thead><tr><th>#</th><th>ชื่อ</th><th>Zone</th><th>BNI</th><th>ขาด</th><th>ติดต่อล่าสุด</th><th></th></tr></thead><tbody>'+
    sorted.map(function(m,i){
      var dr=_dropRiskBadge(m);
      return'<tr>'+
        '<td style="font-size:11px;color:var(--sub)">'+(i+1)+'</td>'+
        '<td><span class="clickable-name" onclick="closeTMD();openIMD(\''+esc(m.name)+'\')">'+esc(m.name)+'</span>'+
          (m.nick?'<div style="font-size:10px;color:var(--sub)">'+esc(m.nick)+'</div>':'')+
          (dr?'<div style="margin-top:2px">'+dr+'</div>':'')+'</td>'+
        '<td><span class="badge b-'+tlK(m.bniTl)+'" style="font-size:9px">'+tlL(m.bniTl)+'</span></td>'+
        '<td style="font-weight:700;color:'+tlC(m.bniTl)+'">'+m.bniScore+'</td>'+
        '<td style="'+(m.absent>=(riskThresh.absent||4)?'color:var(--re);font-weight:700':'')+'">'+m.absent+'</td>'+
        '<td>'+_cBadge(m.name)+'</td>'+
        '<td style="white-space:nowrap">'+
          '<button class="bsm" onclick="openMCT(\''+esc(m.name)+'\')" style="background:rgba(60,120,80,.18);color:#a78bfa;border-color:rgba(60,120,80,.3)">💬 TALK</button> '+
          '<button class="bsm" onclick="closeTMD();openCM(\''+esc(m.name)+'\')">📞</button> '+
          '<button class="bsm" onclick="closeTMD();openIMD(\''+esc(m.name)+'\')">📊</button></td>'+
      '</tr>';
    }).join('')+'</tbody></table></div>';
}
function buildTMDRecommend(mems){
  var items=[].concat(mems).map(function(m){return{m:m,pri:_calcPri(m)};}).filter(function(x){return x.pri.score>0;}).sort(function(a,b){return b.pri.score-a.pri.score;});
  if(!items.length)return'<div class="es">ไม่มีรายการที่ต้องดำเนินการ ✅</div>';
  return'<div style="display:flex;flex-direction:column;gap:10px">'+items.map(function(x){
    var m=x.m,pri=x.pri;
    var urgCol=pri.score>=60?'var(--re)':pri.score>=35?'var(--ye)':'var(--sub)';
    var urgLbl=pri.score>=60?'🔴 ด่วน':pri.score>=35?'🟡 ควรติดต่อ':'👁 ติดตาม';
    return'<div style="background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:13px 16px">'+
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">'+
        '<div style="flex:1">'+
          '<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">'+
            '<span style="font-size:14px;font-weight:700">'+esc(m.name)+'</span>'+
            '<span class="badge b-'+tlK(m.bniTl)+'" style="font-size:9px">'+tlL(m.bniTl)+'</span>'+
            '<span style="font-size:11px;font-weight:700;color:'+urgCol+'">'+urgLbl+'</span>'+
          '</div>'+
          '<div style="display:flex;flex-wrap:wrap;gap:4px">'+
            pri.reasons.map(function(r){return'<span style="font-size:10px;background:var(--sf2);border:1px solid var(--bd);border-radius:4px;padding:2px 7px;color:var(--sub)">'+esc(r)+'</span>';}).join('')+
          '</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-shrink:0;padding-top:2px">'+
          '<button class="bsm" onclick="openMCT(\''+esc(m.name)+'\')" style="background:rgba(60,120,80,.18);color:#a78bfa;border-color:rgba(60,120,80,.3)">💬 TALK</button>'+
          '<button class="bsm" onclick="closeTMD();openCM(\''+esc(m.name)+'\')">📞</button>'+
          '<button class="bsm" onclick="closeTMD();openIMD(\''+esc(m.name)+'\')">📊</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('')+'</div>';
}
function closeIMD(){
  if(idc1){idc1.destroy();idc1=null;}if(idc2){idc2.destroy();idc2=null;}
  document.getElementById('imd').style.display='none';
}
function imdSw(idx,btn){
  document.querySelectorAll('#imd-tabs .tb').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.imd-sec').forEach(function(s){s.classList.remove('on');});
  btn.classList.add('on');
  var s=document.getElementById('imd-s'+idx);if(s)s.classList.add('on');
}
function buildIMD121History(m){return'<div id="imd-121-history"><div class="es">⏳ กำลังโหลด Relationship History…</div></div>';}
function loadIMD121History(m){var root=document.getElementById('imd-121-history');if(!root)return;gsr('getOneToOneMemberHistory',{memberId:m.memberId||'',memberName:m.name},function(r){if(!root)return;if(!r||!r.ok){root.innerHTML='<div class="es">'+esc((r&&r.error)||'โหลดประวัติไม่ได้')+'</div>';return;}var s=r.stats||{},kpis=[['จับคู่',s.matched||0,'var(--ac)'],['สำเร็จ',s.verified||0,'var(--gr)'],['Completion',Number(s.completionRate||0)+'%','#60a5fa'],['On-time',Number(s.onTimeRate||0)+'%','#a78bfa'],['โอกาส',s.opportunities||0,'var(--ye)'],['งานค้าง',s.pendingFollowUps||0,s.pendingFollowUps?'var(--re)':'var(--gr)']];var html='<div class="kpi-g" style="grid-template-columns:repeat(6,minmax(0,1fr));margin-bottom:14px">'+kpis.map(function(k){return'<div class="kc"><div class="kv" style="color:'+k[2]+'">'+k[1]+'</div><div class="kl">'+k[0]+'</div></div>';}).join('')+'</div>';html+='<div class="m360g" style="margin-bottom:14px"><div class="m360c"><div class="m360l">Relationship History</div>'+((r.relationships||[]).map(function(x){var p=x.partner||{};return'<div style="display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--bd)"><div style="width:34px;height:34px;border-radius:10px;background:var(--ac-dim);display:grid;place-items:center;color:var(--ac);font-weight:800">'+esc(String(p.nickname||p.name||'?').charAt(0))+'</div><div style="flex:1"><b style="font-size:12px">'+esc(p.name||'สมาชิกที่ Archive แล้ว')+'</b><div style="font-size:10px;color:var(--sub)">'+x.count+' รอบ · สำเร็จ '+x.verified+' · ล่าสุด '+esc(x.lastDate||'—')+'</div></div>'+(x.pendingFollowUps?'<span class="badge b-ye">งานค้าง '+x.pendingFollowUps+'</span>':'')+'</div>';}).join('')||'<div class="es">ยังไม่มี Relationship History</div>')+'</div><div class="m360c"><div class="m360l">Waiting & Attention</div><div style="font-size:12px;margin-top:8px">Waiting ทั้งหมด <b style="color:#fbbf24">'+Number(s.waitingCount||0)+'</b> รอบ</div><div style="font-size:10px;color:var(--sub);margin-top:3px">การรอเพราะจำนวนคี่ไม่ถือเป็นความเสี่ยง</div>'+((r.attention||[]).slice(0,5).map(function(a){return'<div style="margin-top:8px;padding:8px;border:1px solid var(--bd);border-radius:8px"><b style="font-size:10px">'+esc(a.level)+'</b><div style="font-size:10px;color:var(--sub)">'+esc(a.reason)+'</div></div>';}).join('')||'<div style="font-size:11px;color:var(--gr);margin-top:10px">ไม่มี Attention ที่เปิดอยู่</div>')+'</div></div>';html+='<div class="cc"><div class="cct" style="margin-bottom:10px">Round History</div>'+((r.history||[]).map(function(x){var names=(x.partners||[]).map(function(p){return p.name||'Archive Member';}).join(' + '),schedule=x.schedule||{},feedback=(x.sharedFeedback||[])[0],follow=(x.followUps||[]),g=x.guidedSession||null,gc=g&&g.shared_content||{},triggers=g&&g.referralTriggers||[];return'<div style="padding:12px 0;border-bottom:1px solid var(--bd)"><div style="display:flex;gap:8px;align-items:center"><b style="font-size:12px">'+esc(x.meetingDate||'ไม่ระบุวันที่')+' · '+esc(names)+'</b>'+(x.legacyGroup?'<span class="badge b-gy">Legacy Group</span>':'')+'<span class="badge '+(['verified','late_verified'].includes(x.status)?'b-gr':'b-ye')+'" style="margin-left:auto">'+esc(x.status)+'</span></div>'+(schedule.starts_at?'<div style="font-size:10px;color:var(--sub);margin-top:4px">นัด '+new Date(schedule.starts_at).toLocaleString('th-TH')+'</div>':'')+(g?'<div style="margin-top:7px;padding:8px;border-radius:8px;background:var(--sf2);font-size:10px"><b style="color:var(--ac)">Guided · '+esc(g.session_mode||'discover')+'</b> · '+Math.round(Number(g.duration_seconds||0)/60)+' นาที · '+esc(g.status||'draft')+(gc.introductionScript?'<div style="margin-top:4px">ประโยคแนะนำ: '+esc(gc.introductionScript)+'</div>':'')+(triggers.length?'<div style="margin-top:4px">Referral Trigger: '+triggers.map(function(t){return esc(t.trigger_text);}).join(' · ')+'</div>':'')+'</div>':'')+(feedback&&feedback.learned?'<div style="font-size:11px;margin-top:6px">💬 '+esc(feedback.learned)+'</div>':'')+(follow.length?'<div style="font-size:10px;color:var(--ac);margin-top:5px">Next Action: '+follow.map(function(f){return esc(f.description||f.action_type)+' ('+esc(f.status)+')';}).join(' · ')+'</div>':'')+'</div>';}).join('')||'<div class="es">ยังไม่มีรอบจากระบบใหม่</div>')+((r.legacy||[]).length?'<div style="margin-top:12px;font-size:10px;color:var(--sub)">Legacy logs '+r.legacy.length+' รายการยังถูกเก็บรักษาไว้</div>':'')+'</div>';root.innerHTML=html;});}
function buildIMDScore(m){
  var ftHtml='';
  if(m.fastTrack&&m.fastTrack.length&&m.bniTl!=='green'&&m.bniTl!=='none'){
    var ftTarget=m.bniTl==='red'?50:70;
    var ftTargetName=m.bniTl==='red'?'🟡 Yellow':'🟢 Green';
    var ftNeeded=Math.max(0,ftTarget-m.bniScore);
    var ftTop=m.fastTrack.slice(0,3);
    var ftGainTotal=ftTop.reduce(function(a,f){return a+f.gain;},0);
    ftHtml='<div style="background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.22);border-radius:10px;padding:12px 14px;margin-top:4px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
        '<span style="font-size:12px;font-weight:700;color:var(--gr)">🎯 ขึ้น '+ftTargetName+' ต้องเพิ่ม +'+ftNeeded+' pt</span>'+
        '<button onclick="document.querySelectorAll(\'#imd-tabs .tb\')[3].click()" style="font-size:10px;padding:3px 8px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:5px;color:var(--gr);cursor:pointer">ดูทั้งหมด →</button>'+
      '</div>'+
      ftTop.map(function(ft){
        return'<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--bd);font-size:12px">'+
          '<span>'+(ft.icon||'💡')+' <strong>'+esc(ft.cat)+'</strong> — '+esc(ft.action)+'</span>'+
          '<span style="color:var(--gr);font-weight:700;flex-shrink:0;margin-left:10px">+'+ft.gain+'pt</span>'+
        '</div>';
      }).join('')+
      '<div style="margin-top:8px;font-size:11px;color:var(--sub)">'+
        'ทำทั้งหมด → ได้ +'+ftGainTotal+'pt → <strong style="color:'+(m.bniScore+ftGainTotal>=ftTarget?'var(--gr)':'var(--ye)')+'">'+
        (m.bniScore+ftGainTotal)+'pt</strong>'+
        (m.bniScore+ftGainTotal>=ftTarget?' <span style="color:var(--gr)">= '+ftTargetName+' ✅</span>':' (ยังขาด '+(ftTarget-m.bniScore-ftGainTotal)+'pt)')+
      '</div>'+
    '</div>';
  } else if(m.bniTl==='green'){
    ftHtml='<div style="background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.2);border-radius:10px;padding:10px 14px;margin-top:4px;font-size:12px;color:var(--gr)">🎉 Green Zone แล้ว — รักษาระดับต่อไป!</div>';
  }
  return'<div class="sh"><h2>BNI Score History</h2></div>'+
    '<div class="cc" style="margin-bottom:20px"><div class="imd-ch-wrap"><canvas id="idc1"></canvas></div></div>'+
    '<div class="m360g">'+
      '<div class="m360c"><div class="m360l">คะแนนปัจจุบัน</div><div style="font-size:36px;font-weight:800;color:'+tlC(m.bniTl)+'">'+m.bniScore+'</div><span class="badge b-'+tlK(m.bniTl)+'">'+tlL(m.bniTl)+'</span></div>'+
      '<div class="m360c"><div class="m360l">Avg ('+((m.hist&&m.hist.length)||0)+' เดือน) / ขาด</div><div style="font-size:28px;font-weight:700">'+(m.scoreAvg||'—')+'</div><div style="font-size:12px;color:'+(m.absent>=riskThresh.absent?'var(--re)':'var(--sub)')+'">ขาด '+m.absent+' ครั้ง</div></div>'+
    '</div>'+
    (m.business?'<div style="font-size:12px;color:var(--sub);margin:8px 2px 0;">🏢 ธุรกิจ: <strong style="color:var(--tx)">'+esc(m.business)+'</strong></div>':'')+
    ftHtml;
}
function buildIMDCats(m){
  var c=m.cats||{};
  return'<div class="sh"><h2>Category Breakdown</h2></div>'+
    '<div class="cc" style="margin-bottom:20px"><div class="imd-cat-wrap"><canvas id="idc2"></canvas></div></div>'+
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">'+
    [{l:'Referral',v:c.ref||0,max:15,cl:'var(--gr)'},{l:'TYFCB',v:c.tyfcb||0,max:15,cl:'var(--ye)'},
     {l:'Visitor',v:c.visitor||0,max:20,cl:'#f472b6'},{l:'1-2-1',v:c.one21||0,max:15,cl:'#60a5fa'},{l:'CEU',v:c.training||0,max:20,cl:'#a78bfa'},{l:'ขาด',v:m.absent||0,max:10,cl:'var(--re)'}
    ].map(function(ct){var p=Math.min(100,Math.round((ct.v/(ct.max||1))*100));
      return'<div class="m360c"><div class="m360l">'+ct.l+'</div><div style="font-size:22px;font-weight:700;color:'+ct.cl+'">'+ct.v+'</div>'+
        '<div style="height:4px;background:var(--bd);border-radius:2px;margin-top:5px"><div style="height:100%;border-radius:2px;background:'+ct.cl+';width:'+p+'%"></div></div></div>';
    }).join('')+'</div>';
}
function buildIMDHistory(m){
  var reps=D.reps.filter(function(r){return r.memberName===m.name;});
  var msgs=D.msgs.filter(function(msg){return msg.name===m.name;});
  var tlUid='imd-health-tl-'+Date.now();
  setTimeout(function(){loadIMDHealthTimeline(m.name,tlUid);},80);
  var html='<div class="sh"><h2>📋 History</h2></div>'
    +'<div id="'+tlUid+'" style="background:var(--sf2);border:1px solid var(--bd);border-radius:12px;padding:13px 14px;margin-bottom:16px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">'
    +'<div><div style="font-size:13px;font-weight:900">🧵 Member Health Timeline</div><div style="font-size:10px;color:var(--sub);margin-top:2px">รวม Core Issue, Mentor Log, 1-2-1, Renewal และ Assignment จากระบบเดียวกัน</div></div>'
    +'<span style="font-size:11px;color:var(--sub)">⏳ กำลังโหลด...</span></div></div>';
  // Monthly score trend comes from monthly_scores imported from Traffic Lights Evolution.
  var scoreHistory=(m.scoreHistory||[]).filter(function(s){return s&&s.score!==null&&s.score!==undefined&&Number(s.score)>0;});
  var hist=(m.hist||[]).filter(function(v){return v>0;});
  var hasTrend=scoreHistory.length>0||hist.length>0;
  if(hasTrend){
    html+='<div class="sh" style="margin-bottom:8px"><h2 style="font-size:13px">📅 คะแนนรายเดือน ('+(scoreHistory.length||hist.length)+' เดือน)</h2></div>';
    // Build timeline items array sorted chronologically
    var tlItems=scoreHistory.length
      ?[].concat(scoreHistory).sort(function(a,b){return(a.year*100+a.month)-(b.year*100+b.month);})
      :[].concat(hist).reverse().map(function(v,i){return{label:'M'+(i+1),score:v};});
    var MNAMES=['','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    html+='<div id="imd-score-tl" class="score-tl-wrap"><div class="score-tl-inner">';
    tlItems.forEach(function(item,i){
      var sc=Number(item.score)||0;
      var tlCls=sc>=70?'tl-green':sc>=50?'tl-yellow':sc>=30?'tl-red':'tl-black';
      var prev=tlItems[i-1]?Number(tlItems[i-1].score)||0:null;
      var delta=prev!=null?sc-prev:null;
      var dStr=delta===null?'':delta>0?'▲'+delta:delta<0?'▼'+Math.abs(delta):'—';
      var dCls=delta===null?'eq':delta>0?'up':delta<0?'dn':'eq';
      var lbl=item.month&&item.year?(MNAMES[item.month]||item.month)+' '+String(item.year).slice(2):(item.label||('M'+(i+1)));
      html+='<div class="tl-item">';
      html+='<div class="tl-dot '+tlCls+'">'+sc+'</div>';
      html+='<div class="tl-card"><div class="tl-month">'+lbl+'</div>';
      html+='<div class="tl-score" style="color:var(--'+(sc>=70?'gr':sc>=50?'ye':sc>=30?'re':'gy')+')">'+sc+'</div>';
      html+='<div class="tl-delta '+dCls+'">'+dStr+'</div></div>';
      html+='</div>';
    });
    html+='</div></div>';
  }
  if(!reps.length&&!msgs.length)return html+'<div class="es">ไม่มีประวัติ Reports/Messages</div>';
  if(reps.length){
    html+='<div class="sh" style="margin-top:16px"><h2 style="font-size:13px">📋 Core Issues ('+reps.length+')</h2></div>';
    html+=reps.map(function(r){
      var st=r.status||'pending';var sc=st==='done'?'var(--gr)':st==='reopened'?'var(--ye)':'var(--re)';
      return'<div class="rc '+(st||'pending')+'" style="margin-bottom:10px">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
          '<span style="font-size:10px;color:var(--sub)">'+esc(r.savedAt)+' · '+esc(r.team)+'</span>'+
          '<span class="badge '+(st==='done'?'b-gr':st==='reopened'?'b-ye':'b-re')+'" style="font-size:9px">'+(st==='done'?'✅ ปิด':st==='reopened'?'🔄 Reopen':'🔴 รอ')+'</span>'+
        '</div>'+
        '<div class="rf">'+
          '<div><label>Core Issue</label><p>'+esc(r.coreIssue||'—')+'</p></div>'+
          '<div><label>Action</label><p>'+esc(r.actionTaken||'—')+'</p></div>'+
          '<div><label>Plan</label><p>'+esc(r.plan||'—')+'</p></div>'+
        '</div>'+
        (r.reply?'<div class="rre">💬 '+esc(r.reply)+'</div>':'')+
      '</div>';
    }).join('');
  }
  if(msgs.length){
    html+='<div class="sh" style="margin-top:16px"><h2 style="font-size:13px">📩 MC Messages</h2></div>';
    html+=msgs.map(function(msg){return'<div class="mc3" style="margin-bottom:8px"><div class="mb2">'+esc(msg.msg)+'</div></div>';}).join('');
  }
  return html;
}
function loadIMDHealthTimeline(memberName,containerId){
  var el=document.getElementById(containerId);if(!el)return;
  gsr('getMemberTimeline',{role:S.role,memberName:memberName},function(r){
    if(!el)return;
    if(!r||!r.ok){
      el.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><div style="font-size:13px;font-weight:900;color:var(--re)">🧵 Member Health Timeline</div><div style="font-size:10px;color:var(--sub);margin-top:2px">โหลด timeline ไม่สำเร็จ</div></div><button class="bsm" onclick="loadIMDHealthTimeline('+JSON.stringify(memberName)+','+JSON.stringify(containerId)+')" style="font-size:10px">↺</button></div><div style="font-size:11px;color:var(--re);margin-top:8px">'+esc(r&&r.error||'unknown')+'</div>';
      return;
    }
    var events=(r.events||[]).slice(0,12);
    function fmtDate(v){
      if(!v)return '—';
      try{var d=new Date(v);return d.toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'});}catch(e){return String(v).slice(0,10);}
    }
    function evCard(x,i){
      var color=x.status==='done'||x.status==='resolved'||x.status==='logged'?'var(--gr)':x.status==='pending'||x.status==='open'?'var(--ye)':'var(--sub)';
      return '<div style="display:grid;grid-template-columns:28px 1fr;gap:9px;padding:9px 0;border-top:1px solid var(--bd)">'
        +'<div style="width:24px;height:24px;border-radius:999px;background:var(--sf);display:grid;place-items:center;font-size:13px">'+esc(x.icon||'•')+'</div>'
        +'<div style="min-width:0"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><b style="font-size:12px">'+esc(x.title||'Activity')+'</b><span style="font-size:10px;color:var(--sub);white-space:nowrap">'+fmtDate(x.at)+'</span></div>'
        +(x.detail?'<div style="font-size:10px;color:var(--sub);line-height:1.5;margin-top:3px">'+esc(x.detail).slice(0,180)+'</div>':'')
        +'<div style="font-size:9px;color:'+color+';font-weight:900;margin-top:4px">'+esc(x.type||'event')+' · '+esc(x.status||'')+'</div></div>'
        +'</div>';
    }
    el.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">'
      +'<div><div style="font-size:13px;font-weight:900">🧵 Member Health Timeline</div><div style="font-size:10px;color:var(--sub);margin-top:2px">ล่าสุด '+events.length+' รายการ จาก report / mentor log / 1-2-1 / renewal / assignment</div></div>'
      +'<button class="bsm" onclick="loadIMDHealthTimeline('+JSON.stringify(memberName)+','+JSON.stringify(containerId)+')" style="font-size:10px">↺</button></div>'
      +(events.length?events.map(evCard).join(''):'<div style="font-size:12px;color:var(--sub);padding:14px 0;border-top:1px solid var(--bd)">ยังไม่มี timeline event จากระบบกลาง</div>');
  });
}
// ── Training event cache for Fast-Track suggestions ──────────────
var _deskTrainCache = null;
var _deskTrainCacheAt = 0;
function ensureDeskTrainCache(cb){
  // Invalidate after 15 minutes so admin event edits are visible within a session
  if(_deskTrainCache && (Date.now()-_deskTrainCacheAt < 900000)){cb(_deskTrainCache);return;}
  gsr('getTrainingEvents',{daysAhead:90},function(r){
    _deskTrainCache=r.ok?r.events:[];
    _deskTrainCacheAt=Date.now();
    cb(_deskTrainCache);
  });
}
function injectTrainSuggestions(m, containerId){
  ensureDeskTrainCache(function(events){
    var el=document.getElementById(containerId);
    if(!el)return;
    var cats=m.cats||{};
    var noCats=!m.cats; // true when member has no PALMS data yet
    // Pick events relevant to member gaps; if no data show CEU events as default
    var picks=events.filter(function(e){
      var c=e.course||'';
      if(noCats)return c==='msp'||c==='advanced'; // no data → suggest MSP
      if((cats.training||0)<20&&(c==='msp'||c==='advanced'))return true;
      if((cats.one21||0)<15&&c==='121')return true;
      if((cats.ref||0)<15&&c==='networking')return true;
      return false;
    }).slice(0,3);
    if(!picks.length){el.innerHTML='<div style="font-size:11px;color:var(--sub)">ไม่มี Event ที่เหมาะกับสถานการณ์ใน 90 วันข้างหน้า</div>';return;}
    el.innerHTML=picks.map(function(e){
      var d=new Date(e.date);
      var MONTH_TH=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      var dateStr=d.getDate()+' '+MONTH_TH[d.getMonth()];
      var onlineBadge=e.format==='online'?'<span style="font-size:9px;background:rgba(96,165,250,.15);color:#60a5fa;border-radius:4px;padding:1px 5px;margin-left:4px">Online</span>':'';
      var ceuBadge=e.ceu?'<span style="font-size:9px;background:rgba(251,191,36,.15);color:#fbbf24;border-radius:4px;padding:1px 5px;margin-left:4px">+'+e.ceu+' CEU</span>':'';
      return'<div style="display:flex;align-items:flex-start;gap:10px;background:var(--sf);border-radius:7px;padding:9px 11px;margin-bottom:6px">'+
        '<div style="min-width:36px;text-align:center;font-size:15px;font-weight:700;color:var(--ac);line-height:1.2">'+d.getDate()+'<div style="font-size:9px;color:var(--sub);font-weight:400">'+MONTH_TH[d.getMonth()]+'</div></div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:12px;font-weight:600">'+esc(e.title||'')+onlineBadge+ceuBadge+'</div>'+
          '<div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc(e.location||'')+(e.price?' · '+esc(e.price):'')+'</div>'+
        '</div></div>';
    }).join('');
  });
}

function buildIMDFT(m){
  var target=m.bniTl==='red'?50:m.bniTl==='yellow'?70:50;
  var needed=Math.max(0,target-m.bniScore);
  var totalGain=(m.fastTrack||[]).reduce(function(a,ft){return a+ft.gain;},0);
  var header='<div class="sh"><h2>🚀 Fast Track Actions</h2></div>'+
    '<div style="background:var(--sf2);border-radius:10px;padding:14px;margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap">'+
      '<div><div style="font-size:10px;color:var(--sub)">คะแนนปัจจุบัน</div><div style="font-size:28px;font-weight:800;color:'+tlC(m.bniTl)+'">'+m.bniScore+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--sub)">เป้าถัดไป ('+(m.bniTl==='red'?'Yellow':m.bniTl==='yellow'?'Green':'Green')+')</div><div style="font-size:28px;font-weight:800;color:var(--gr)">'+target+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--sub)">ต้องการเพิ่ม</div><div style="font-size:28px;font-weight:800;color:var(--ye)">+'+needed+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--sub)">ทำได้จาก Actions นี้</div><div style="font-size:28px;font-weight:800;color:var(--ac)">+'+totalGain+'</div></div>'+
    '</div>'+
    '<div class="pm" style="margin-bottom:4px;position:relative">'+
      '<div class="pmf" style="width:'+Math.min(100,m.bniScore)+'%"></div>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--sub);margin-bottom:16px"><span>0</span><span style="color:var(--gr);font-weight:700">'+target+'</span><span>100</span></div>';
  var trainUid='imd-train-'+Date.now();
  // Training section placeholder — populated async after cache loads
  var trainSection='<div style="margin-top:20px"><div class="sh" style="margin-bottom:8px"><h2 style="font-size:13px">📚 Training ที่แนะนำ (90 วันข้างหน้า)</h2></div><div id="'+trainUid+'"><div style="font-size:11px;color:var(--sub)">⏳ กำลังโหลด...</div></div></div>';

  if(!m.fastTrack||!m.fastTrack.length){
    setTimeout(function(){injectTrainSuggestions(m,trainUid);},100);
    return header+'<div class="es">ไม่มี Action ที่แนะนำ — คะแนนดีแล้ว 🎉</div>'+trainSection;
  }
  var ftHtml=m.fastTrack.map(function(ft){
    return'<div class="fc" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
        '<div style="display:flex;align-items:center;gap:7px">'+
          '<span style="font-size:20px">'+(ft.icon||'💡')+'</span>'+
          '<span style="font-weight:700;font-size:14px">'+esc(ft.cat)+'</span>'+
        '</div>'+
        '<span style="font-size:20px;font-weight:800;color:var(--gr)">+'+ft.gain+' pt</span>'+
      '</div>'+
      '<div style="background:var(--sf);border-radius:7px;padding:10px 12px;margin-bottom:6px">'+
        '<div style="font-size:13px;font-weight:600;margin-bottom:4px">📌 '+esc(ft.action)+'</div>'+
        (ft.curVal?'<div style="display:flex;gap:8px;font-size:11px;color:var(--sub)"><span>ตอนนี้: <strong style="color:var(--tx)">'+esc(ft.curVal)+'</strong></span><span>→</span><span>เป้า: <strong style="color:var(--gr)">'+esc(ft.tgtVal||'')+'</strong></span></div>':'')+
      '</div>'+
    '</div>';
  }).join('');
  setTimeout(function(){injectTrainSuggestions(m,trainUid);},100);
  return header+ftHtml+trainSection;
}

function buildIMDCoachPlan(m){
  var tl=m.bniTl,sc=m.bniScore,ab=m.absent,cats=m.cats||{};
  var zoneGuide={
    red:   {title:'🔴 Zone แดง — ต้องช่วยเร่งด่วน',approach:'เน้นสร้างแรงจูงใจ + แก้ปัญหาเฉพาะ ไม่ใช่สั่งการ',freq:'พูดคุยทุกสัปดาห์',tone:'อบอุ่น เป็นกันเอง ตั้งคำถามเปิด'},
    yellow:{title:'🟡 Zone เหลือง — ต้องกระตุ้น',approach:'หาว่าอะไรที่ยัง "ติดขัด" — มักเป็นเรื่อง Referral คุณภาพหรือ 1-2-1',freq:'พูดคุยทุก 2 สัปดาห์',tone:'กระตุ้น ตั้งเป้าชัด ใช้ Commitment'},
    blue:  {title:'🔵 Zone น้ำเงิน — ขาดประชุม',approach:'หาสาเหตุการขาด — ธุรกิจ? สุขภาพ? ความเชื่อมั่น?',freq:'พูดคุยเมื่อขาด',tone:'ห่วงใย ไม่ตำหนิ หาแนวทางช่วย'},
    none:  {title:'⚪ ยังไม่มีข้อมูล BNI',approach:'เก็บข้อมูลให้ครบก่อน — ตรวจสอบ Reporting2You',freq:'ตรวจสอบในสัปดาห์นี้',tone:'ให้กำลังใจ ทำความรู้จัก'}
  };
  var g=zoneGuide[tl]||zoneGuide.none;
  var weakCats=[];
  if(cats.ref<10)weakCats.push({l:'Referral',v:cats.ref,max:15,tip:'ขอ Referral จาก member ที่คุณรู้จักดีที่สุดก่อน'});
  if(cats.tyfcb<10)weakCats.push({l:'TYFCB',v:cats.tyfcb,max:15,tip:'ติดตาม Referral ที่ให้ไปว่า close deal แล้วหรือยัง'});
  if(cats.visitor<10)weakCats.push({l:'Visitor',v:cats.visitor,max:20,tip:'ลองเชิญ 1 คนจาก network ส่วนตัวมาเยี่ยม'});
  if(cats.one21<10)weakCats.push({l:'1-2-1',v:cats.one21,max:15,tip:'นัด 1-2-1 กับ member ที่ธุรกิจ overlap กัน'});
  if(ab>=(riskThresh.absent||4))weakCats.push({l:'Attendance',v:ab+'ครั้งที่ขาด',max:null,tip:'ตรวจสอบว่ามีตัวแทนได้หรือเปล่าในสัปดาห์ที่ติดงาน'});
  var openRep=D.reps.find(function(r){return r.memberName===m.name&&repIsOpen(r);});
  var questions=[
    'สัปดาห์ที่ผ่านมาธุรกิจเป็นยังไงบ้าง?',
    'มี Referral ที่อยากให้ member คนไหนช่วยบ้างไหม?',
    'มีอะไรติดขัดที่ทำให้ยังไม่ได้ทำ '+( weakCats[0]?weakCats[0].l:'BNI')+'?',
    'ถ้าจะตั้งเป้าสัปดาห์หน้า 1 อย่าง จะตั้งว่าอะไร?'
  ];
  return'<div class="sh"><h2>🎯 Coaching Plan</h2></div>'+
    '<div style="background:rgba(60,120,80,.1);border:1px solid var(--ac);border-radius:10px;padding:14px;margin-bottom:14px">'+
      '<div style="font-weight:700;font-size:14px;margin-bottom:6px">'+g.title+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">'+
        '<div><span style="color:var(--sub)">แนวทาง</span><div>'+g.approach+'</div></div>'+
        '<div><span style="color:var(--sub)">ความถี่</span><div>'+g.freq+'</div></div>'+
        '<div style="grid-column:1/-1"><span style="color:var(--sub)">Tone</span> <span style="color:var(--ac);font-weight:600">'+g.tone+'</span></div>'+
      '</div>'+
    '</div>'+
    (openRep?'<div style="background:rgba(248,113,113,.1);border:1px solid var(--re);border-radius:10px;padding:12px;margin-bottom:14px">'+
      '<div style="font-size:11px;color:var(--re);font-weight:700;margin-bottom:5px">🔴 Open Core Issue</div>'+
      '<div style="font-size:12px">'+esc(openRep.coreIssue||'—')+'</div>'+
      (openRep.actionTaken?'<div style="font-size:11px;color:var(--sub);margin-top:4px">Action Plan: '+esc(openRep.actionTaken)+'</div>':'')+
    '</div>':'')+
    (weakCats.length?'<div style="margin-bottom:14px"><div style="font-size:11px;color:var(--sub);font-weight:600;margin-bottom:8px;text-transform:uppercase">จุดที่ต้องพัฒนา</div>'+
      weakCats.map(function(w){return'<div style="background:var(--sf2);border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;align-items:flex-start;gap:8px">'+
        '<span style="font-size:18px">⚠️</span>'+
        '<div><div style="font-size:12px;font-weight:700">'+w.l+(w.max?' ('+w.v+'/'+w.max+')':' '+w.v)+'</div><div style="font-size:11px;color:var(--sub)">💡 '+w.tip+'</div></div>'+
      '</div>';}).join('')+
    '</div>':'')+
    '<div style="margin-bottom:14px"><div style="font-size:11px;color:var(--sub);font-weight:600;margin-bottom:8px;text-transform:uppercase">คำถาม Coaching แนะนำ</div>'+
    questions.map(function(q,i){return'<div style="background:var(--sf2);border-radius:7px;padding:8px 12px;margin-bottom:5px;font-size:12px"><span style="color:var(--ac);font-weight:700">Q'+(i+1)+'</span> '+q+'</div>';}).join('')+
    '</div>';
}
function buildIMDGrOverview(m){
  var ar=m.attendRate||0;
  return imdMSBPlaceholder(m)+'<div class="m360g" style="margin-bottom:14px">'+
    '<div class="m360c"><div class="m360l">PALMS Score</div><div style="font-size:36px;font-weight:800;color:'+tlC(m.tl)+'">'+( m.score||'—')+'</div><span class="badge b-'+tlK(m.tl)+'">'+tlL(m.tl)+'</span></div>'+
    '<div class="m360c"><div class="m360l">Attendance</div><div style="font-size:28px;font-weight:800;color:'+(ar>=80?'var(--gr)':ar>=60?'var(--ye)':'var(--re)')+'">'+ar+'%</div><div style="font-size:11px;color:var(--sub)">ขาด '+m.absent+' ครั้ง</div></div>'+
  '</div>'+
  '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'+
    [{l:'TYFCB',v:fmtB(m.tyfcb||0)+'฿',c:'var(--ye)'},{l:'Visitor',v:m.visitors||0,c:'#f472b6'},{l:'1-2-1',v:m.r121||0,c:'#60a5fa'},{l:'CEU',v:m.ceu||0,c:'#a78bfa'}].map(function(s){
      return'<div class="m360c" style="text-align:center"><div class="m360l">'+s.l+'</div><div style="font-size:22px;font-weight:800;color:'+s.c+'">'+s.v+'</div></div>';
    }).join('')+
  '</div>';
}
function buildIMDReferral(m){
  var zl={highGiverLowRecv:'🔴 ให้เยอะ รับน้อย',lowGiverHighRecv:'🟡 รับเยอะ ให้น้อย',balanced:'✅ สมดุล',inactive:'⚪ Inactive'};
  var zb={highGiverLowRecv:'b-re',lowGiverHighRecv:'b-ye',balanced:'b-gr',inactive:'b-gy'};
  var gp=Math.round(m.giveRatio||0);var rp=100-gp;
  return'<div class="m360g" style="margin-bottom:14px">'+
    '<div class="m360c"><div class="m360l">Referral Given (RG)</div><div style="font-size:36px;font-weight:800;color:var(--bl)">'+m.rgCount+'</div></div>'+
    '<div class="m360c"><div class="m360l">Referral Received (RR)</div><div style="font-size:36px;font-weight:800;color:var(--gr)">'+m.rrCount+'</div></div>'+
  '</div>'+
  '<div class="m360c" style="margin-bottom:14px"><div class="m360l">Justice Index (Give Ratio)</div>'+
    '<div style="display:flex;align-items:center;gap:10px;margin-top:8px">'+
      '<div style="font-size:26px;font-weight:800">'+gp+'%</div>'+
      '<div style="flex:1"><div class="ji-bar" style="height:12px"><div class="ji-give" style="width:'+gp+'%"></div><div class="ji-recv" style="width:'+rp+'%"></div></div>'+
      '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--sub);margin-top:3px"><span>ให้</span><span>รับ</span></div></div>'+
    '</div>'+
    '<span class="badge '+(zb[m.zone]||'b-gy')+'" style="margin-top:8px;display:inline-block">'+esc(zl[m.zone]||m.zone)+'</span>'+
  '</div>'+
  '<div class="m360g">'+
    '<div class="m360c"><div class="m360l">TYFCB</div><div style="font-size:28px;font-weight:800;color:var(--ye)">'+fmtB(m.tyfcb||0)+'฿</div><div style="font-size:11px;color:var(--sub)">'+fmtB(m.tyfcbPerDay||0)+'฿/วัน</div></div>'+
    '<div class="m360c"><div class="m360l">Days in BNI</div><div style="font-size:28px;font-weight:800">'+( m.bniDays||'—')+'</div><div style="font-size:11px;color:var(--sub)">วัน</div></div>'+
  '</div>';
}
function buildIMDTasks(m){
  var tasks=G.tasks.filter(function(t){return t.memberName===m.name;});
  if(!tasks.length)return'<div class="es">ไม่มี Growth Tasks</div>';
  return'<div class="sh"><h2>📋 Growth Tasks ('+tasks.length+')</h2></div>'+
    tasks.map(function(t){
      return'<div class="task-card '+t.status+'">'+
        '<div class="task-hdr"><span>'+esc(t.priority||'📋')+'</span><span style="font-weight:700">'+esc(t.taskType)+'</span><span class="badge '+(t.status==='done'?'b-gr':'b-ye')+'">'+esc(t.status)+'</span><span style="font-size:10px;color:var(--gy);margin-left:auto">'+esc(t.createdAt)+'</span></div>'+
        (t.note?'<div class="task-note">'+esc(t.note)+'</div>':'')+
        (t.response?'<div class="task-resp"><span style="font-size:9px;color:var(--ac2);font-weight:600;display:block;margin-bottom:3px">Mentor Response</span>'+esc(t.response)+'</div>':'')+
      '</div>';
    }).join('');
}
// ── IMD Growth Tab helpers ────────────────────────
function _findGshMember(name, nick){
  if(!_gshData||!_gshData.groups)return null;
  for(var gi=0;gi<_gshData.groups.length;gi++){
    var mems=_gshData.groups[gi].members||[];
    for(var mi=0;mi<mems.length;mi++){
      var gm=mems[mi];
      if(gm.name===name||(nick&&gm.nick&&gm.nick===nick))
        return Object.assign({},gm,{_gi:gi});
    }
  }
  return null;
}

function imdMSBId(name){return 'imd-msb-'+String(name||'').replace(/[^a-zA-Z0-9ก-๙_-]/g,'_');}
function imdMSBPlaceholder(m){
  return '<div id="'+imdMSBId(m.name)+'" style="background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:14px;margin-bottom:14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
    +'<div><div style="font-size:14px;font-weight:900">🎯 MSB Goal Intelligence</div><div style="font-size:11px;color:var(--sub);margin-top:3px">เป้าหมายจาก Blueprint + Actual + คำแนะนำสำหรับ Mentor/Growth</div></div>'
    +'<span style="font-size:11px;color:var(--sub)">⏳ กำลังโหลด...</span>'
    +'</div></div>';
}
function imdMSBRetry(name,memberId){
  var mem=(D.mem||[]).find(function(x){return x.name===name;})||(G.mem||[]).find(function(x){return x.name===name;})||{name:name};
  if(memberId)mem.memberId=memberId;
  if(mem.memberId){loadIMDMSB(mem);return;}
  gsr('getMemberDetail',{memberName:name},function(r){
    if(r&&r.ok){
      mem.memberId=r.memberId;
      if(r.business!=null)mem.business=r.business;
    }
    loadIMDMSB(mem);
  });
}
function loadIMDMSB(m){
  if(!m||!m.name)return;
  var box=document.getElementById(imdMSBId(m.name));
  if(!box)return;
  if(!m.memberId){
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div style="font-size:14px;font-weight:900;color:var(--ye)">🎯 MSB Goal Intelligence</div><div style="font-size:11px;color:var(--sub);margin-top:3px">ยังไม่พบ member_id สำหรับโหลด Blueprint</div></div><button class="bsm" onclick="imdMSBRetry('+JSON.stringify(m.name).replace(/"/g,'&quot;')+')" style="font-size:10px">↺</button></div>';
    return;
  }
  var year=new Date().getFullYear();
  gsr('getMSBMemberIntelligence',{role:S.role,memberId:m.memberId,blueprintYear:year},function(r){
    if(!r||!r.ok){
      box.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div style="font-size:14px;font-weight:900;color:var(--re)">🎯 MSB Goal Intelligence</div><div style="font-size:11px;color:var(--sub);margin-top:3px">โหลด MSB ไม่สำเร็จ</div></div><button class="bsm" onclick="imdMSBRetry('+JSON.stringify(m.name).replace(/"/g,'&quot;')+','+JSON.stringify(m.memberId).replace(/"/g,'&quot;')+')" style="font-size:10px">↺</button></div><div style="font-size:11px;color:var(--re);margin-top:10px">'+esc(r&&r.error||'unknown')+'</div>';
      return;
    }
    gsr('getMSBMatchingSuggestions',{role:S.role,memberId:m.memberId,blueprintYear:year},function(pm){
      renderIMDMSB(box,r,(pm&&pm.ok)?(pm.suggestions||[]):[]);
    });
  });
}
function renderIMDMSB(box,r,suggestions){
  var ps=r.planSummary||{}, as=r.actualSummary||{}, gs=r.gapSummary||{}, member=r.member||{};
  var revPct=Number(gs.revenueProgressPercent)||0, refPct=Number(gs.referralProgressPercent)||0;
  function pctColor(p){return p>=70?'var(--gr)':p>=40?'var(--ye)':'var(--re)';}
  function mini(label,val,sub,color){
    return '<div class="m360c"><div class="m360l">'+esc(label)+'</div><div style="font-size:20px;font-weight:900;color:'+(color||'var(--tx)')+'">'+val+'</div><div style="font-size:10px;color:var(--sub);margin-top:3px">'+esc(sub||'')+'</div></div>';
  }
  function bar(label,pct,color){
    return '<div style="margin-top:9px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span>'+esc(label)+'</span><b style="color:'+color+'">'+msbNum(pct,1)+'%</b></div><div style="height:7px;background:var(--bd);border-radius:999px;overflow:hidden"><div style="height:100%;width:'+Math.max(0,Math.min(100,pct))+'%;background:'+color+';border-radius:999px"></div></div></div>';
  }
  var insights=(r.coachingInsights||[]).filter(Boolean);
  var lf=r.lookingFor||{}, pt=r.powerTeam||{};
  var statusText=(gs.statusLabel||gs.status||'—');
  box.innerHTML='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    +'<div><div style="font-size:14px;font-weight:900">🎯 MSB Goal Intelligence</div><div style="font-size:11px;color:var(--sub);margin-top:3px">'+esc(member.nickname||member.name||'สมาชิก')+' · '+esc(member.mentorTeam||'—')+' · '+esc(statusText)+'</div></div>'
    +'<span style="font-size:10px;color:'+pctColor(Math.max(revPct,refPct))+';font-weight:900;border:1px solid var(--bd);border-radius:999px;padding:5px 9px">'+esc(statusText)+'</span>'
    +'</div>'
    +'<div class="m360g" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:12px">'
    +mini('MSB Goal',msbMoney(ps.msbGoal||0),'เป้ารายได้จาก BNI','var(--ye)')
    +mini('Actual Received',msbMoney(as.actualReceived||0),'ยอดรับจริง','var(--gr)')
    +mini('Revenue Gap',msbMoney(gs.revenueGap||0),'ส่วนที่ยังต้องปิด',gs.revenueGap>0?'var(--re)':'var(--gr)')
    +mini('Referral',msbNum(as.rr||0,0)+' / '+msbNum(ps.referralNeeded||0,0),'received / needed',pctColor(refPct))
    +'</div>'
    +bar('Revenue Progress',revPct,pctColor(revPct))
    +bar('Referral Progress',refPct,pctColor(refPct))
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px">'
    +'<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:12px;padding:11px"><div style="font-size:11px;font-weight:900;color:var(--ac)">Looking For</div><div style="font-size:12px;color:var(--tx);line-height:1.55;margin-top:5px">'+esc((lf.categories||[]).join(', ')||'—')+'</div><div style="font-size:10px;color:var(--sub);line-height:1.5;margin-top:4px">'+esc(lf.detail||'')+'</div></div>'
    +'<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:12px;padding:11px"><div style="font-size:11px;font-weight:900;color:var(--ac)">Power Team</div><div style="font-size:12px;color:var(--tx);line-height:1.55;margin-top:5px">'+esc((pt.categories||[]).join(', ')||'—')+'</div><div style="font-size:10px;color:var(--sub);line-height:1.5;margin-top:4px">'+esc(pt.detail||'')+'</div></div>'
    +'</div>'
    +(insights.length?'<div style="margin-top:12px;background:rgba(199,167,106,.10);border:1px solid rgba(199,167,106,.25);border-radius:12px;padding:11px"><div style="font-size:11px;font-weight:900;color:var(--ye);margin-bottom:5px">Suggested Support</div>'+insights.slice(0,3).map(function(x){return '<div style="font-size:11px;color:var(--tx);line-height:1.55">• '+esc(x)+'</div>';}).join('')+'</div>':'')
    +(suggestions.length?'<div style="margin-top:12px"><div style="font-size:11px;font-weight:900;color:var(--gr);margin-bottom:6px">🤝 Suggested Matching</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">'+suggestions.slice(0,3).map(function(s){var reason=(s.matchedCategories&&s.matchedCategories.length)?('Matched: '+s.matchedCategories.join(', ')):(s.label||'น่าคุย 1-2-1');return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:9px"><div style="font-size:12px;font-weight:900">'+esc(s.nickname||s.name||'—')+'</div><div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc([s.mentorTeam,s.profession].filter(Boolean).join(' · ')||'—')+'</div><div style="font-size:10px;color:var(--ac);margin-top:5px">'+esc(reason.slice(0,90))+'</div></div>';}).join('')+'</div></div>':'')
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">'
    +msbActionBtn('⚡ สร้าง Task','msbCreateTask('+JSON.stringify(member.mentorTeam||'')+','+JSON.stringify(member.name||'')+','+JSON.stringify('MSB Member 360')+','+JSON.stringify((insights[0]||'ติดตาม MSB Goal / Actual gap'))+','+JSON.stringify(gs.status==='critical'?'🚨':'🎯')+')','var(--ye)')
    +msbActionBtn('📋 Copy Summary','msbCopyText('+JSON.stringify('MSB Goal: '+msbMoney(ps.msbGoal||0)+'\\nActual Received: '+msbMoney(as.actualReceived||0)+'\\nRevenue Gap: '+msbMoney(gs.revenueGap||0)+'\\nReferral: '+msbNum(as.rr||0,0)+'/'+msbNum(ps.referralNeeded||0,0)+'\\nSupport: '+(insights[0]||''))+','+JSON.stringify('MSB Summary')+')','var(--ac)')
    +'</div>';
}
function buildIMDGrowthData(m){
  var msbHtml=imdMSBPlaceholder(m);
  var gMem=_findGshMember(m.name,m.nick||'');
  if(!_gshLoaded){
    return msbHtml+'<div class="sh"><h2>💰 Growth Data</h2></div>'
      +'<div style="text-align:center;padding:30px">'
      +'<div style="color:var(--sub);margin-bottom:14px">ยังไม่ได้โหลด Growth Sheet</div>'
      +'<button class="bx" onclick="imdGrowthLoad(\''+esc(m.name)+'\',8)">📊 โหลด Growth Data</button>'
      +'</div>';
  }
  if(!gMem){
    return msbHtml+'<div class="sh"><h2>💰 Growth Data</h2></div>'
      +'<div class="es">ไม่พบข้อมูล Growth ของ '+esc(m.name)+'<br><small style="color:var(--sub)">ชื่อใน BNI อาจต่างจากชื่อใน Growth Sheet</small></div>';
  }
  var gT=gMem.target||0,gR=gMem.received||0;
  var gP=gT>0?Math.round(gR/gT*100):0;
  var pc=gP>=80?'var(--gr)':gP>=50?'var(--ye)':'var(--re)';
  var h=_gshData.headers||[],cm=_gshData.colMap||{},cells=gMem.cells||[];
  var skip={0:true};
  if(cm.name!==undefined)skip[cm.name]=true;
  if(cm.nick!==undefined)skip[cm.nick]=true;
  var colCards='';
  h.forEach(function(hdr,ci){
    if(skip[ci])return;
    if(!String(hdr||'').trim())return;
    var val=cells[ci]!==undefined?cells[ci]:'';
    var str=String(val||'');if(!str)return;
    var n=parseFloat(String(val).replace(/[,\s฿]/g,''));
    var display=(!isNaN(n)&&str!==''&&str.indexOf('%')===-1)?gshFmtNum(n):str;
    var color=ci===cm.received?'var(--gr)':ci===cm.target?'#B08A3C':'var(--tx)';
    colCards+='<div class="m360c"><div class="m360l">'+esc(hdr)+'</div>'
      +'<div style="font-size:16px;font-weight:700;color:'+color+'">'+esc(display)+'</div></div>';
  });
  return msbHtml+'<div class="sh"><h2>💰 Growth — '+esc(gMem.nick||gMem.name)+'</h2></div>'
    +'<div style="background:var(--sf2);border-radius:12px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:14px">'
    +'<div style="text-align:center;min-width:64px">'
    +'<div style="font-size:10px;color:var(--sub)">ทำได้</div>'
    +'<div style="font-size:36px;font-weight:800;color:'+pc+'">'+gP+'%</div>'
    +'</div>'
    +'<div style="flex:1">'
    +'<div style="height:8px;background:var(--bd);border-radius:4px;overflow:hidden;margin-bottom:6px">'
    +'<div style="height:100%;border-radius:4px;background:'+pc+';width:'+Math.min(gP,100)+'%;"></div></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:11px">'
    +'<span style="color:var(--gr)">รับจริง '+gshFmtNum(gR)+'</span>'
    +'<span style="color:#B08A3C">เป้า '+gshFmtNum(gT)+'</span></div>'
    +'</div></div>'
    +(colCards?'<div class="m360g" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-bottom:14px">'+colCards+'</div>':'')
    +'<div style="text-align:right">'
    +'<button class="bsm" onclick="gshOpenEdit('+gMem._gi+',\''+gMem.sheetRow+'\');document.getElementById(\'gsh-modal\').classList.add(\'open\')">✏️ แก้ไข Growth</button>'
    +'</div>';
}

function imdGrowthLoad(name,secIdx){
  var sec=document.getElementById('imd-s'+secIdx);
  if(sec)sec.innerHTML='<div style="text-align:center;padding:30px;color:var(--sub)">⏳ โหลด Growth Data...</div>';
  gsr('getGrowthSheetData',{role:S.role},function(r){
    if(!r||!r.ok){
      if(sec)sec.innerHTML='<div style="color:var(--re);padding:20px;text-align:center">❌ '+(r&&r.error||'โหลดไม่ได้')+'</div>';
      return;
    }
    _gshData=r;_gshLoaded=true;_rvData=r;_rvLoaded=true;
    var mem=(D.mem||[]).find(function(mm){return mm.name===name;});
    if(mem&&sec){sec.innerHTML=buildIMDGrowthData(mem);loadIMDMSB(mem);}
  });
}

function buildIMDCharts(mem){
  if(S.role==='mc'){
    // Score history line chart
    var c1=document.getElementById('idc1');
    if(c1&&mem.hist&&mem.hist.length){
      var pts=mem.hist.map(Number).filter(function(n){return!isNaN(n)&&n>=0;});
      var labels=pts.map(function(_,i){return i===pts.length-1?'ล่าสุด':'เดือน -'+(pts.length-1-i);});
      idc1=new Chart(c1.getContext('2d'),{type:'line',
        data:{labels:labels,datasets:[{label:'BNI Score',data:pts,borderColor:'#B08A3C',backgroundColor:'rgba(60,120,80,.12)',borderWidth:2,pointRadius:5,pointBackgroundColor:pts.map(function(s){return s>=70?'#34D399':s>=50?'#FBBF24':s>=30?'#F87171':'#60a5fa';}),tension:.3,fill:true}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
          scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick,font:{size:10}}},
            y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick},min:0,max:100,suggestedMin:0}}}});
    }
    // Category bar chart
    var c2=document.getElementById('idc2');
    if(c2){var cats=mem.cats||{};
      var cd={Ref:cats.ref||0,TYFCB:cats.tyfcb||0,Visitor:cats.visitor||0,'1-2-1':cats.one21||0,CEU:cats.training||0};
      var max={Ref:15,TYFCB:15,Visitor:20,'1-2-1':15,CEU:20};
      idc2=new Chart(c2.getContext('2d'),{type:'bar',
        data:{labels:Object.keys(cd),datasets:[
          {label:'ทำได้',data:Object.values(cd),backgroundColor:['#34D399','#FBBF24','#f472b6','#60a5fa','#a78bfa'],borderRadius:5},
          {label:'เป้า',data:Object.keys(cd).map(function(k){return max[k];}),backgroundColor:'var(--sf2)',borderRadius:5}
        ]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#8b92b8',font:{size:10}}}},
          scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick}},
            y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick},min:0}}}});
    }
  }
}

// ══ FEATURE 1: PRINT ══════════════════════════════
// (print button calls window.print() directly)

// ══════════════════════════════════════════════════
// NEW FEATURES
// ══════════════════════════════════════════════════

// ── State ─────────────────────────────────────────
var tdc2=null;
var cmpState=[];
var trendMetric='bni';

// ══ F1: COMMAND PALETTE ═══════════════════════════
var _cmdRes=[];
function openCmdPal(){
  document.getElementById('cmd-pal').style.display='flex';
  var inp=document.getElementById('cmd-in');inp.value='';inp.focus();
  onCmdInput('');
}
function closeCmdPal(){document.getElementById('cmd-pal').style.display='none';}
function onCmdInput(v){
  var q=v.toLowerCase().trim();
  var mem=S.role==='mc'?D.mem:G.mem;
  var res=[];
  if(!q){
    res=[
      {ico:'🔄',main:'รีเฟรชข้อมูล',sub:'โหลดข้อมูลใหม่',fn:'closeCmdPal();manualReload()'},
      {ico:'🖨️',main:'Print',sub:'พิมพ์หน้าปัจจุบัน',fn:'closeCmdPal();window.print()'},
      {ico:'📊',main:'Overview',sub:'ไปยังแท็บ Overview',fn:'closeCmdPal();document.querySelector(\'#'+(S.role==='mc'?'mc':'gr')+'-tabs .tb\').click()'},
    ];
  } else {
    mem.forEach(function(m){
      if((m.name||'').toLowerCase().indexOf(q)>=0||(m.nick||'').toLowerCase().indexOf(q)>=0){
        var tl=S.role==='mc'?m.bniTl:m.tl;var sc=S.role==='mc'?m.bniScore:m.score;
        res.push({ico:({green:'🟢',yellow:'🟡',red:'🔴',blue:'🔵',none:'⚪'}[tl]||'👤'),main:m.name+(m.nick?' ('+m.nick+')':''),sub:esc(m.mentor||'')+(sc?' · '+sc+' pt':''),fn:'closeCmdPal();openIMD(\''+esc(m.name)+'\')'});
      }
    });
  }
  _cmdRes=res;
  var box=document.getElementById('cmd-res');
  box.innerHTML=res.length?res.map(function(r,i){
    return'<div class="cmd-item" id="ci'+i+'" onclick="'+r.fn+'">'+
      '<span class="cmd-ico">'+r.ico+'</span>'+
      '<div><div class="cmd-main">'+r.main+'</div><div class="cmd-sub">'+r.sub+'</div></div>'+
    '</div>';
  }).join('')+'<div class="cmd-hint"><span>↑↓ เลือก</span><span>Enter เปิด</span><span>Esc ปิด</span></div>':
  '<div style="padding:14px 18px;color:var(--gy);font-size:13px">ไม่พบ "'+esc(v)+'"</div>';
  _cmdSel=-1;
}
var _cmdSel=-1;
function cmdKey(e){
  if(e.key==='ArrowDown'){e.preventDefault();_cmdSel=Math.min(_cmdSel+1,_cmdRes.length-1);_cmdHL();}
  else if(e.key==='ArrowUp'){e.preventDefault();_cmdSel=Math.max(_cmdSel-1,0);_cmdHL();}
  else if(e.key==='Enter'){if(_cmdSel>=0&&_cmdRes[_cmdSel])eval(_cmdRes[_cmdSel].fn);}
  else if(e.key==='Escape'){closeCmdPal();}
}
function _cmdHL(){
  document.querySelectorAll('.cmd-item').forEach(function(el,i){el.classList.toggle('csel',i===_cmdSel);});
  var sel=document.getElementById('ci'+_cmdSel);if(sel)sel.scrollIntoView({block:'nearest'});
}

// ══ F2: ALERT DIGEST ══════════════════════════════
var _digOpen=true;
function renderAlertDigest(){
  if(S.role!=='mc')return;
  var rt=riskThresh.absent||4,rs=riskThresh.score||30;
  var risk=D.mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);});
  var pend=D.reps.filter(function(r){return repIsOpen(r);});
  var ren=D.ren.filter(function(r){return r.diffDays<=30;});
  var noMsg=D.mem.filter(function(m){return m.bniTl==='red'&&!D.msgs.some(function(ms){return ms.name===m.name;});});
  var el=document.getElementById('mc-dig');if(!el)return;
  var items=[
    {v:risk.length,l:'Risk Members',c:'re',fn:'sw(\'mc-risk\',null,\'mc\')'},
    {v:pend.length,l:'รอ Reply Reports',c:'ye',fn:'sw(\'mc-rep\',null,\'mc\')'},
    {v:ren.length,l:'Renewal ≤30 วัน',c:'pu',fn:'sw(\'mc-ren\',null,\'mc\')'},
    {v:noMsg.length,l:'Red Zone ไม่มีข้อความ',c:'re',fn:'openActionCenter(\'coach\')'},
  ];
  el.innerHTML='<div class="alert-dig">'+
    '<div class="alert-dig-hdr" onclick="var b=document.getElementById(\'dig-body\');b.style.display=b.style.display===\'none\'?\'flex\':\'none\'">'+
      '<h3>🚨 วันนี้ต้องทำอะไร</h3><span style="font-size:11px;color:var(--sub)">'+(items.reduce(function(a,c){return a+c.v;},0)+' รายการ')+'</span><span style="font-size:12px;color:var(--sub)">▼</span>'+
    '</div>'+
    '<div class="alert-items" id="dig-body">'+
      items.map(function(it){return'<div class="ad-item '+it.c+'" onclick="'+it.fn+'"><div class="ad-v">'+it.v+'</div><div class="ad-l">'+it.l+'</div></div>';}).join('')+
    '</div>'+
  '</div>';
}

// ══ F3: ADVANCED FILTER TOGGLE ════════════════════
function toggleAdvFil(){var f=document.getElementById('adv-fil');f.style.display=f.style.display==='block'?'none':'block';}
function clearAdvFil(){['af-smin','af-smax','af-amin','af-amax'].forEach(function(id){document.getElementById(id).value='';});renderMem();}

// ══ F4: COMPARISON ════════════════════════════════
function toggleCmp(name){
  var idx=cmpState.indexOf(name);
  if(idx>=0){cmpState.splice(idx,1);}
  else if(cmpState.length<3){cmpState.push(name);}
  else{toast('เลือกได้สูงสุด 3 คน','err');return;}
  updateCmpBar();renderMem();
}
function clearCmp(){cmpState=[];updateCmpBar();renderMem();}
function updateCmpBar(){
  var bar=document.getElementById('cmp-state-bar');
  bar.style.display=cmpState.length>0?'flex':'none';
  var lbl=document.getElementById('cmp-bar-lbl');if(lbl)lbl.textContent='เลือก '+cmpState.length+' คน: '+cmpState.map(function(n){return n.split(' ')[0];}).join(', ');
  var btn=bar.querySelector('.bsm.bac');if(btn)btn.disabled=cmpState.length<2;
}
function openCmp(){
  if(cmpState.length<2){toast('เลือกอย่างน้อย 2 คน','err');return;}
  var mems=cmpState.map(function(n){return S.role==='mc'?D.mem.find(function(m){return m.name===n;}):G.mem.find(function(m){return m.name===n;});}).filter(Boolean);
  if(mems.length<2){toast('ไม่พบข้อมูลสมาชิก','err');return;}
  var cols=mems.length;
  var nameRow='<div class="cmp-names-row" style="grid-template-columns:90px'+' 1fr'.repeat(cols)+'">'+'<div></div>'+mems.map(function(m){
    var tl=S.role==='mc'?m.bniTl:m.tl;
    return'<div>'+esc(m.name)+(m.nick?'<div style="font-size:11px;color:var(--sub)">('+esc(m.nick)+')</div>':'')+'<span class="badge b-'+tlK(tl)+'" style="font-size:9px">'+tlL(tl)+'</span></div>';
  }).join('')+'</div>';
  var defs=S.role==='mc'?[
    {l:'BNI Score',fn:function(m){return m.bniScore||0;},max:100,color:'#B08A3C'},
    {l:'PALMS',fn:function(m){return m.palmsScore||0;},max:100,color:'var(--gr)'},
    {l:'ขาด',fn:function(m){return m.absent||0;},max:10,color:'var(--re)',inv:true},
    {l:'Referral',fn:function(m){return(m.cats||{}).ref||0;},max:15,color:'var(--gr)'},
    {l:'TYFCB',fn:function(m){return(m.cats||{}).tyfcb||0;},max:15,color:'var(--ye)'},
    {l:'Visitor',fn:function(m){return(m.cats||{}).visitor||0;},max:20,color:'#f472b6'},
    {l:'1-2-1',fn:function(m){return(m.cats||{}).one21||0;},max:15,color:'#60a5fa'},
    {l:'CEU',fn:function(m){return(m.cats||{}).training||0;},max:20,color:'#a78bfa'},
  ]:[
    {l:'PALMS Score',fn:function(m){return m.score||0;},max:100,color:'#B08A3C'},
    {l:'Attend Rate',fn:function(m){return m.attendRate||0;},max:100,color:'var(--gr)'},
    {l:'ขาด',fn:function(m){return m.absent||0;},max:10,color:'var(--re)',inv:true},
    {l:'RG (ให้)',fn:function(m){return m.rgCount||0;},max:20,color:'#60a5fa'},
    {l:'RR (รับ)',fn:function(m){return m.rrCount||0;},max:20,color:'var(--gr)'},
    {l:'TYFCB',fn:function(m){return m.tyfcb||0;},max:500000,color:'var(--ye)'},
    {l:'Visitor',fn:function(m){return m.visitors||0;},max:20,color:'#f472b6'},
    {l:'1-2-1',fn:function(m){return m.r121||0;},max:20,color:'#a78bfa'},
  ];
  var rows=defs.map(function(d){
    var vals=mems.map(function(m){return d.fn(m);});
    var mx=Math.max.apply(null,vals)||1;
    return'<div class="cmp-row" style="grid-template-columns:90px'+' 1fr'.repeat(cols)+';display:grid">'+
      '<span class="cmp-lbl">'+d.l+'</span>'+
      vals.map(function(v,i){
        var pct=Math.min(100,Math.round(v/d.max*100));
        var isBest=vals.every(function(vv,ii){return d.inv?(v<=vv||ii===i):(v>=vv||ii===i);});
        return'<div class="cmp-v" style="color:'+(isBest&&vals.length>1?(d.inv?'var(--gr)':'var(--gr)'):'var(--tx)')+'">'+
          fmtB(v)+
          '<div class="cmp-bar-w" style="justify-content:center;margin-top:3px"><div class="cmp-bar" style="width:'+pct+'px;max-width:80px;background:'+d.color+'"></div></div>'+
        '</div>';
      }).join('')+
    '</div>';
  }).join('');
  document.getElementById('cmp-body').innerHTML=nameRow+rows;
  document.getElementById('cmp-modal').style.display='flex';
}
function closeCmp(){document.getElementById('cmp-modal').style.display='none';}

// ══ F5: COMPREHENSIVE SCORE TREND ═════════════════
function setTrendMetric(m,btn){
  trendMetric=m;
  document.querySelectorAll('.tt').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  renderTrendSection();
}
function renderTrendSection(){
  var ctx=document.getElementById('trendChart2');if(!ctx)return;
  if(tdc2){tdc2.destroy();tdc2=null;}
  // Summary cards
  var sm=G.sm,mem=G.mem;
  var cards=[
    {l:'BNI Avg',v:mem.length?Math.round(mem.reduce(function(a,m){return a+(m.score||0);},0)/mem.length):0,c:'#B08A3C'},
    {l:'Attend Rate',v:(sm.chapterAttendRate||0)+'%',c:'var(--gr)'},
    {l:'Avg RG',v:mem.length?(mem.reduce(function(a,m){return a+(m.rgCount||0);},0)/mem.length).toFixed(1):0,c:'#60a5fa'},
    {l:'Avg TYFCB',v:fmtB(mem.length?mem.reduce(function(a,m){return a+(m.tyfcb||0);},0)/mem.length:0)+'฿',c:'var(--ye)'},
    {l:'% Green',v:mem.length?Math.round(mem.filter(function(m){return m.tl==='green';}).length/mem.length*100)+'%':0,c:'var(--gr)'},
    {l:'Total Visitor',v:sm.totalVisitors||0,c:'#f472b6'},
  ];
  document.getElementById('trend-sum-cards').innerHTML=cards.map(function(c){
    return'<div class="ts-card"><div class="tsv" style="color:'+c.c+'">'+c.v+'</div><div class="tsl">'+c.l+'</div></div>';
  }).join('');
  // Chart
  var lbl=document.getElementById('trend-main-lbl'),note=document.getElementById('trend-main-note');
  if(trendMetric==='bni'){
    var haHist=mem.filter(function(m){return m.hist&&m.hist.length;});
    if(haHist.length){
      var maxL=Math.min(6,Math.max.apply(null,haHist.map(function(m){return m.hist.length;})));
      var labs=[];for(var i=maxL;i>0;i--)labs.push('เดือน -'+i);labs.push('ล่าสุด');
      var avgs=[];
      for(var j=0;j<=maxL;j++){
        var vs=[];
        haHist.forEach(function(m){var idx=m.hist.length-maxL-1+j;if(idx>=0&&idx<m.hist.length){var vv=parseFloat(m.hist[idx]);if(!isNaN(vv)&&vv>0)vs.push(vv);}});
        avgs.push(vs.length?Math.round(vs.reduce(function(a,b){return a+b;},0)/vs.length):null);
      }
      lbl.textContent='BNI Score Trend (Chapter Avg)';note.textContent=haHist.length+' คน มีประวัติ';
      tdc2=new Chart(ctx.getContext('2d'),{type:'line',data:{labels:labs,datasets:[{label:'BNI Avg',data:avgs,borderColor:'#B08A3C',backgroundColor:'rgba(60,120,80,.12)',borderWidth:2,pointRadius:5,pointBackgroundColor:'#B08A3C',tension:.35,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick,font:{size:10}}},y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick},min:0,max:100}}}});
    } else {_renderBarTrend(ctx,'BNI Score — ทุกคน','score','#B08A3C',0,100);lbl.textContent='BNI Score Distribution';note.textContent='ไม่มีข้อมูล Trend รายเดือน';}
  } else if(trendMetric==='attend'){
    _renderBarTrend(ctx,'Attendance Rate %','attendRate','var(--gr)',0,100);lbl.textContent='Attendance Rate — แยกสมาชิก';note.textContent='สีเขียว ≥80% · สีเหลือง ≥60% · สีแดง <60%';
  } else if(trendMetric==='ref'){
    _renderBarTrend(ctx,'Referral Given (RG)','rgCount','#60a5fa',0,0);lbl.textContent='Referral Given — แยกสมาชิก';note.textContent='เรียงจากมากสุด';
  } else if(trendMetric==='tyfcb'){
    _renderBarTrend(ctx,'TYFCB (฿)','tyfcb','var(--ye)',0,0);lbl.textContent='TYFCB — แยกสมาชิก';note.textContent='เรียงจากมากสุด';
  } else if(trendMetric==='visitor'){
    _renderBarTrend(ctx,'Visitor','visitors','#f472b6',0,0);lbl.textContent='Visitor — แยกสมาชิก';note.textContent='เรียงจากมากสุด';
  } else if(trendMetric==='zone'){
    _renderZoneDist(ctx);lbl.textContent='Zone Distribution';note.textContent=G.mem.length+' สมาชิก';
  }
  // Movers
  renderMovers();
}
function _renderBarTrend(ctx,label,key,color,ymin,ymax){
  var list=[].concat(G.mem).sort(function(a,b){return(parseFloat(b[key])||0)-(parseFloat(a[key])||0);});
  var labs=list.map(function(m){return m.nick||m.name;});
  var data=list.map(function(m){return parseFloat(m[key])||0;});
  var bg=data.map(function(v){
    if(key==='attendRate')return v>=80?'rgba(52,211,153,.7)':v>=60?'rgba(255,193,77,.7)':'rgba(248,113,113,.7)';
    return color+'cc';
  });
  document.getElementById('trend-main-note').textContent='ทั้งหมด '+list.length+' คน (เรียงจากมากสุด)';
  tdc2=new Chart(ctx.getContext('2d'),{type:'bar',data:{labels:labs,datasets:[{label:label,data:data,backgroundColor:bg,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick,font:{size:9},maxRotation:45}},y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick},min:ymin||0,suggestedMax:ymax||undefined}}}});
}
function _renderZoneDist(ctx){
  var z={green:0,yellow:0,red:0,black:0,none:0};
  G.mem.forEach(function(m){z[m.tl]=(z[m.tl]||0)+1;});
  tdc2=new Chart(ctx.getContext('2d'),{type:'doughnut',data:{labels:['🟢 Green','🟡 Yellow','🔴 Red','⚫ Black','⚪ No Data'],datasets:[{data:[z.green,z.yellow,z.red,z.black||0,z.none||0],backgroundColor:['#34D399','#FBBF24','#F87171','#8b92b8','#4b5563'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#8b92b8',font:{size:11}}}}}});
}

// ══ F6: SCORE MOVERS ══════════════════════════════
function renderMovers(){
  var uEl=document.getElementById('movers-up'),dEl=document.getElementById('movers-down');
  if(!uEl||!dEl)return;
  var src=(G.mem.some(function(m){return m.hist&&m.hist.length>=2;})?G.mem:D.mem);
  var withDelta=src.filter(function(m){return m.hist&&m.hist.length>=2;}).map(function(m){
    var h=m.hist.map(Number).filter(function(n){return!isNaN(n)&&n>0;});
    return{name:m.name,nick:m.nick,score:h[h.length-1]||0,delta:h.length>=2?h[h.length-1]-h[h.length-2]:0};
  }).filter(function(m){return m.delta!==0;});
  var medals=['🥇','🥈','🥉','4️⃣','5️⃣'];
  function deltaRow(m,i,up){
    return'<div class="mover-item">'+
      '<span class="mv-rank">'+medals[i]+'</span>'+
      '<div class="mv-info"><div class="mv-name">'+esc(m.nick||m.name)+'</div><div class="mv-sc">'+m.score+' pt</div></div>'+
      '<span class="mv-delta" style="color:'+(up?'var(--gr)':'var(--re)')+'">'+( up?'▲ +':'▼ ')+Math.abs(m.delta)+'</span>'+
    '</div>';
  }
  if(withDelta.length){
    var ups=[].concat(withDelta).sort(function(a,b){return b.delta-a.delta;}).slice(0,5);
    var dns=[].concat(withDelta).sort(function(a,b){return a.delta-b.delta;}).slice(0,5);
    uEl.innerHTML=ups.map(function(m,i){return deltaRow(m,i,true);}).join('');
    dEl.innerHTML=dns.map(function(m,i){return deltaRow(m,i,false);}).join('');
  } else {
    // No hist data — show top scorers vs lowest scorers from current data
    var pool=G.mem.length?G.mem:(D.mem.length?D.mem:[]);
    if(!pool.length){
      uEl.innerHTML='<div class="es" style="font-size:12px">ไม่มีข้อมูล</div>';
      dEl.innerHTML='<div class="es" style="font-size:12px">ไม่มีข้อมูล</div>';
      return;
    }
    var sorted=[].concat(pool).sort(function(a,b){return(parseFloat(b.score)||0)-(parseFloat(a.score)||0);});
    function staticRow(m,i,hi){
      return'<div class="mover-item">'+
        '<span class="mv-rank">'+medals[i]+'</span>'+
        '<div class="mv-info"><div class="mv-name">'+esc(m.nick||m.name)+'</div><div class="mv-sc">'+(parseFloat(m.score)||0)+' pt</div></div>'+
        '<span class="mv-delta" style="color:'+(hi?'var(--gr)':'var(--re)')+'">'+( hi?'▲ Top':'▼ Low')+'</span>'+
      '</div>';
    }
    var topH=document.getElementById('movers-up-hd'),botH=document.getElementById('movers-dn-hd');
    if(topH)topH.textContent='คะแนนสูงสุด';
    if(botH)botH.textContent='คะแนนต่ำสุด';
    uEl.innerHTML=sorted.slice(0,5).map(function(m,i){return staticRow(m,i,true);}).join('');
    dEl.innerHTML=sorted.slice(-5).reverse().map(function(m,i){return staticRow(m,i,false);}).join('');
  }
}

// ══ F7: COACHING PROGRESS BADGE ═══════════════════
function _coProg(m){
  if(!m.hist||m.hist.length<2)return'';
  var h=m.hist.map(Number).filter(function(n){return!isNaN(n)&&n>0;});
  if(h.length<2)return'';
  var delta=h[h.length-1]-h[h.length-2];
  if(delta>0)return'<span class="co-prog up">▲ +'+delta+'</span>';
  if(delta<0)return'<span class="co-prog dn">▼ '+delta+'</span>';
  return'<span class="co-prog st">→ ไม่เปลี่ยน</span>';
}

// ══ F8: WEEKLY SNAPSHOT ═══════════════════════════
function generateSnapshot(){
  var now=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  var sm=S.role==='mc'?D.sm:G.sm;
  var mem=S.role==='mc'?D.mem:G.mem;
  var rt=riskThresh.absent||4,rs=riskThresh.score||30;
  var risk=S.role==='mc'?D.mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);}).length:0;
  var txt='📊 BNI IDEAL — Weekly Snapshot\n';
  txt+='📅 '+now+'\n';
  txt+='─────────────────────────\n';
  if(S.role==='mc'){
    var sc=mem.filter(function(m){return m.bniTl!=='none';});
    var avg=sc.length?Math.round(sc.reduce(function(a,m){return a+m.bniScore;},0)/sc.length):0;
    txt+='👥 สมาชิกทั้งหมด: '+( sm.total||0)+' คน\n';
    txt+='📊 BNI Avg Score: '+avg+' pt\n';
    txt+='🟢 Green: '+(sm.green||0)+' · 🟡 Yellow: '+(sm.yellow||0)+' · 🔴 Red: '+(sm.red||0)+' · ⚫ Black: '+(sm.black||0)+'\n';
    txt+='⚠️  Risk Members: '+risk+' คน\n';
    txt+='📋 Open Reports: '+D.reps.filter(function(r){return repIsOpen(r);}).length+' รายการ\n';
    txt+='📩 Active Messages: '+D.msgs.length+' รายการ\n';
    txt+='📅 Renewal ≤30 วัน: '+D.ren.filter(function(r){return r.diffDays<=30;}).length+' รายการ\n';
    var top=sc.sort(function(a,b){return b.bniScore-a.bniScore;}).slice(0,3);
    if(top.length)txt+='🏆 Top 3: '+top.map(function(m){return m.name+' ('+m.bniScore+'pt)';}).join(', ')+'\n';
  } else {
    txt+='👥 สมาชิก: '+(sm.total||0)+' คน\n';
    txt+='💰 TYFCB รวม: '+fmtB(sm.totalTYFCB||0)+'฿\n';
    txt+='🔄 Referral Given: '+G.mem.reduce(function(a,m){return a+(m.rgCount||0);},0)+' ใบ\n';
    txt+='✅ Attend Rate: '+(sm.chapterAttendRate||0)+'%\n';
    txt+='📋 Open Tasks: '+G.tasks.filter(function(t){return t.status==='open';}).length+' รายการ\n';
  }
  txt+='─────────────────────────\n';
  txt+='🤖 Generated by BNI IDEAL Desktop';
  var box=document.getElementById('snap-box'),txtEl=document.getElementById('snap-txt');
  if(box&&txtEl){box.style.display='block';txtEl.textContent=txt;document.getElementById('snap-copy-btn').style.display='';}
}
function copySnapshot(){
  var txt=(document.getElementById('snap-txt')||{}).textContent||'';
  navigator.clipboard.writeText(txt).then(function(){toast('Copy แล้ว! 📋','ok');}).catch(function(){toast('ไม่สามารถ Copy ได้','err');});
}

// ══ F9: AUTO-SAVE DRAFT ═══════════════════════════
function autoDraft(id,key){
  var v=(document.getElementById(id)||{}).value||'';
  try{localStorage.setItem('bni_draft_'+( key||id),v);}catch(e){}
}
function restoreDraft(id,key){
  try{var v=localStorage.getItem('bni_draft_'+(key||id));if(v){var el=document.getElementById(id);if(el&&!el.value)el.value=v;}}catch(e){}
}

// ══ F10: ALERT DIGEST ELEMENT IN MC-OV ════════════
// (rendered via renderAlertDigest called from renderMCAll)
// Needs a target div — injected before KPI grid

// ── Score Sparkline ───────────────────────────────
function sparkline(hist){
  if(!hist||!hist.length)return'<span style="color:var(--gy);font-size:10px">—</span>';
  var pts=hist.slice(-6).map(Number).filter(function(n){return!isNaN(n)&&n>0;});
  if(!pts.length)return'<span style="color:var(--gy);font-size:10px">—</span>';
  var mx=Math.max.apply(null,pts)||1;
  var trend=pts.length>=2?pts[pts.length-1]-pts[pts.length-2]:0;
  var arr=pts.map(function(s){
    var h=Math.max(3,Math.round(s/mx*26));
    var cl=s>=70?'var(--gr)':s>=50?'var(--ye)':s>=30?'var(--re)':'#60a5fa';
    return'<div class="spark-bar" style="height:'+h+'px;background:'+cl+';opacity:'+(s===pts[pts.length-1]?'1':'.6')+';" title="'+s+'"></div>';
  }).join('');
  var arrow=trend>0?'<span style="font-size:9px;color:var(--gr)">▲'+trend+'</span>':trend<0?'<span style="font-size:9px;color:var(--re)">▼'+Math.abs(trend)+'</span>':'';
  return'<div style="display:flex;align-items:flex-end;gap:4px"><div class="score-spark">'+arr+'</div>'+arrow+'</div>';
}

// ══ SMART ALERT CARDS ════════════════════════════════════
function renderSmartAlerts(){
  var el=document.getElementById('mc-sa');if(!el)return;
  var mem=D.mem,rt=riskThresh.absent||4,rs=riskThresh.score||30;
  var miss121=mem.filter(function(m){return m.bniTl!=='none'&&(m.cats||{}).one21<5;});
  var missCEU=mem.filter(function(m){return m.bniTl!=='none'&&(m.cats||{}).training<5;});
  var lowRef=mem.filter(function(m){return m.bniTl!=='none'&&(m.cats||{}).ref<3;});
  // contact info available only after _contacts is init'd — safe since called at runtime
  var noContact=mem.filter(function(m){return m.bniTl!=='none'&&m.bniTl!=='green';}).filter(function(m){var c=_contacts&&_contacts[m.name];return !c||!c.date;});
  var mentorLoad={};mem.forEach(function(m){mentorLoad[m.mentor||'—']=(mentorLoad[m.mentor||'—']||0)+1;});
  var overloaded=Object.keys(mentorLoad).filter(function(k){return mentorLoad[k]>6;}).length;
  var items=[
    {ico:'🤝',v:miss121.length,l:'Missing 1-2-1',c:miss121.length>4?'alert':miss121.length>0?'warn':'ok',fn:"sw('mc-mem',null,'mc')"},
    {ico:'📚',v:missCEU.length,l:'Missing CEU',c:missCEU.length>4?'alert':missCEU.length>0?'warn':'ok',fn:"sw('mc-mem',null,'mc')"},
    {ico:'🔄',v:lowRef.length,l:'Low Referral (<3)',c:lowRef.length>5?'alert':lowRef.length>0?'warn':'ok',fn:"sw('mc-mem',null,'mc')"},
    {ico:'📞',v:noContact.length,l:'ยังไม่ได้ติดต่อ',c:noContact.length>3?'alert':noContact.length>0?'warn':'ok',fn:"openActionCenter('pq')"},
    {ico:'⚖️',v:overloaded,l:'Mentor Overload',c:overloaded>0?'alert':'ok',fn:"sw('mc-team',null,'mc')"},
    {ico:'⚠️',v:D.reps.filter(function(r){return repIsOpen(r);}).length,l:'Open Reports',c:D.reps.filter(function(r){return repIsOpen(r);}).length>0?'warn':'ok',fn:"sw('mc-rep',null,'mc')"},
  ];
  el.innerHTML=items.map(function(it){
    return'<div class="sa-card '+it.c+'" onclick="'+it.fn+'" title="คลิกเพื่อดูรายละเอียด">'+
      '<div class="sa-ico">'+it.ico+'</div>'+
      '<div><div class="sa-val">'+it.v+'</div><div class="sa-lbl">'+it.l+'</div></div>'+
    '</div>';
  }).join('');
}

// ══ DROP RISK ════════════════════════════════════════════
function _dropRisk(m){
  var sc=0,rt=riskThresh.absent||4,rs=riskThresh.score||30;
  if(m.bniTl==='red')sc+=3;
  if(m.absent>=rt+2)sc+=2;else if(m.absent>=rt)sc+=1;
  if(m.bniTl!=='none'&&m.bniScore<rs)sc+=2;
  if(!D.msgs.some(function(ms){return ms.name===m.name;}))sc+=1;
  var cd=_cDays?_cDays(m.name):null;
  if(cd===null||cd>30)sc+=2;
  var h=(m.hist||[]).map(Number).filter(function(n){return!isNaN(n)&&n>0;});
  if(h.length>=3&&h[h.length-1]<h[h.length-2]&&h[h.length-2]<h[h.length-3])sc+=2;
  var ren=D.ren.find(function(r){return r.name===m.name;});
  if(ren&&ren.diffDays<=45)sc+=2;
  if(sc>=7)return'high';if(sc>=4)return'medium';if(sc>=2)return'low';return null;
}
function _dropRiskBadge(m){
  var r=_dropRisk(m);if(!r)return'';
  if(r==='high')return'<span class="dr-badge dr-high">🔴 Drop Risk</span>';
  if(r==='medium')return'<span class="dr-badge dr-med">⚠️ At Risk</span>';
  return'<span class="dr-badge dr-low">👁 Watch</span>';
}

// ══ MENTORING JOURNEY ════════════════════════════════════
var _jPhases=[
  {n:1,ico:'🌱',t:'Orientation',items:[
    'ทำความเข้าใจ BNI Philosophy & Core Values',
    'ตั้งเป้าหมาย Personal Business Goals ร่วมกับ Mentor',
    'กรอก GAINS Profile ครบถ้วน',
    'เข้าร่วมประชุม BNI ครบ 4 สัปดาห์แรก ไม่ขาด',
    'รู้จักสมาชิกในทีม Mentor ทุกคน ทำ 1-2-1 ครั้งแรก'
  ]},
  {n:2,ico:'🤝',t:'GAINS & 1-2-1',items:[
    'GAINS Profile สมบูรณ์ 100% พร้อม Share',
    'ทำ 1-2-1 ครบอย่างน้อย 5 คนในทีม',
    'เข้า BNI Training อย่างน้อย 1 หลักสูตร (CEU)',
    'ส่ง Referral ครั้งแรกให้สมาชิกคนอื่น',
    'รับ Referral และ Follow Up อย่างน้อย 1 ครั้ง'
  ]},
  {n:3,ico:'🎯',t:'Referral Strategy',items:[
    'กำหนด Top 3 Referral Sources ที่ชัดเจน',
    'เขียน Weekly Presentation ได้อย่างน้อย 2 รูปแบบ',
    'รายงาน TYFCB ครั้งแรก (มีการปิด Deal)',
    'สร้าง Specific Ask ที่ชัดเจนและวัดผลได้',
    'เข้าร่วม Power Team อย่างน้อย 1 กลุ่ม'
  ]},
  {n:4,ico:'⚡',t:'Power Team',items:[
    'จัด Power Team Meeting นอกรอบ BNI แล้วอย่างน้อย 1 ครั้ง',
    'ให้ Referral ภายใน Power Team อย่างน้อย 2 ครั้ง',
    'BNI Score ≥50 คะแนน (Yellow Zone ขึ้นไป)',
    'มีประวัติ TYFCB ต่อเนื่องทุกเดือน',
    'ช่วย Visitor ที่มาเยี่ยม Chapter อย่างน้อย 1 คน'
  ]},
  {n:5,ico:'🚀',t:'Performance',items:[
    'BNI Score ≥70 คะแนน สม่ำเสมอ (Green Zone)',
    'ส่ง Referral คุณภาพ ≥10 ใบต่อปี',
    'TYFCB สม่ำเสมอและเพิ่มขึ้นทุกปี',
    'สามารถเป็น Mentor ให้สมาชิกใหม่ได้',
    'มีส่วนร่วมใน Chapter Leadership หรือ Power Team Leader'
  ]}
];
function _getJrn(name){try{var j=JSON.parse(localStorage.getItem('bni_journey')||'{}');return j[name]||{phase:1,checks:{}};}catch(e){return{phase:1,checks:{}};}}
function _saveJrn(name,d){try{var j=JSON.parse(localStorage.getItem('bni_journey')||'{}');j[name]=d;localStorage.setItem('bni_journey',JSON.stringify(j));}catch(e){}}
function setJrnPhase(name,phase){
  var d=_getJrn(name);d.phase=phase;_saveJrn(name,d);
  var el=document.getElementById('imd-s5');
  if(el){var mem=D.mem.find(function(m){return m.name===name;});if(mem)el.innerHTML=buildIMDJourney(mem);}
}
function toggleJrnCheck(name,phase,idx,val){
  var d=_getJrn(name);if(!d.checks)d.checks={};
  d.checks[phase+'-'+idx]=val;_saveJrn(name,d);
}
function buildIMDJourney(m){
  var d=_getJrn(m.name),cur=d.phase||1;
  // Auto-detect suggested phase from data
  var c=m.cats||{},auto=1;
  if(c.one21>=3)auto=Math.max(auto,2);
  if(c.ref>=2&&c.tyfcb>=1)auto=Math.max(auto,3);
  if(m.bniScore>=50&&c.ref>=5)auto=Math.max(auto,4);
  if(m.bniTl==='green')auto=Math.max(auto,5);
  var html='<div class="sh"><h2>🗺️ Mentoring Journey</h2></div>';
  html+='<div class="journey-phases">';
  _jPhases.forEach(function(p){
    var isDone=p.n<cur,isActive=p.n===cur;
    var done=Object.keys(d.checks||{}).filter(function(k){return k.startsWith(p.n+'-')&&d.checks[k];}).length;
    html+='<button class="jp-btn'+(isDone?' jdone':isActive?' jactive':'')+'" onclick="setJrnPhase(\''+esc(m.name)+'\','+p.n+')">'+
      (isDone?'✅':p.ico)+' '+esc(p.t)+'<br>'+
      '<span style="font-size:9px;opacity:.65">'+done+'/'+p.items.length+(isDone?' ✓':'')+'</span>'+
    '</button>';
  });
  html+='</div>';
  if(auto>cur){
    html+='<div style="background:rgba(60,120,80,.1);border:1px solid rgba(60,120,80,.3);border-radius:8px;padding:8px 12px;font-size:11px;margin-bottom:12px;color:var(--ac)">'+
      '💡 จากข้อมูล BNI — แนะนำว่า '+esc(m.nick||m.name)+' น่าจะพร้อมขึ้น Phase '+auto+' แล้ว'+
    '</div>';
  }
  var p=_jPhases[cur-1];
  var doneN=p.items.filter(function(it,idx){return d.checks&&d.checks[cur+'-'+idx];}).length;
  var pct=Math.round(doneN/p.items.length*100);
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'+
    '<div style="font-size:14px;font-weight:700">'+p.ico+' '+esc(p.t)+'</div>'+
    '<div style="font-size:12px;color:var(--sub)">'+doneN+'/'+p.items.length+' ('+pct+'%)</div>'+
  '</div>';
  html+='<div class="jp-progress"><div class="jp-progress-f" style="width:'+pct+'%"></div></div>';
  html+=p.items.map(function(item,idx){
    var chk=d.checks&&d.checks[cur+'-'+idx];
    var eid='jck-'+cur+'-'+idx;
    return'<div class="jp-check'+(chk?' jdone-item':'')+'">'+
      '<input type="checkbox" id="'+eid+'" '+(chk?'checked':'')+
      ' onchange="toggleJrnCheck(\''+esc(m.name)+'\','+cur+','+idx+',this.checked);this.closest(\'.jp-check\').classList.toggle(\'jdone-item\',this.checked)">'+
      '<label for="'+eid+'">'+esc(item)+'</label>'+
    '</div>';
  }).join('');
  html+='<div style="font-size:10px;color:var(--gy);margin-top:10px;text-align:center">คลิกที่ Phase ด้านบนเพื่อเปลี่ยน / ✓ เช็คเมื่อทำเสร็จ</div>';
  return html;
}

// ══ MEETING LOG ══════════════════════════════════════════
function _getMLog(name){try{var d=JSON.parse(localStorage.getItem('bni_mlog')||'{}');return d[name]||[];}catch(e){return[];}}
function _saveMLog(name,entries){try{var d=JSON.parse(localStorage.getItem('bni_mlog')||'{}');d[name]=entries;localStorage.setItem('bni_mlog',JSON.stringify(d));}catch(e){}}
var _mlCurrent='';
function buildIMDMeetingLog(m){
  _mlCurrent=m.name;
  var entries=_getMLog(m.name);
  var html='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'+
    '<h2 style="font-size:14px;font-weight:700">📝 Meeting Log</h2>'+
    '<span class="ctag">'+entries.length+' ครั้ง</span>'+
    '<button class="bsm bac" onclick="toggleMLForm()" style="font-size:11px;margin-left:auto">＋ บันทึกการประชุม</button>'+
  '</div>';
  html+='<div class="ml-form" id="ml-form">'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:7px">'+
      '<div><div style="font-size:10px;color:var(--sub);margin-bottom:3px">📅 วันที่ประชุม</div>'+
        '<input type="date" id="ml-date" value="'+(new Date().toISOString().slice(0,10))+'"></div>'+
      '<div><div style="font-size:10px;color:var(--sub);margin-bottom:3px">📅 นัดครั้งต่อไป</div>'+
        '<input type="date" id="ml-next"></div>'+
    '</div>'+
    '<div style="font-size:10px;color:var(--sub);margin-bottom:3px">💬 หัวข้อที่คุย</div>'+
    '<textarea id="ml-topics" placeholder="BNI Score, 1-2-1, Referral Strategy, Fast Track..."></textarea>'+
    '<div style="font-size:10px;color:var(--sub);margin-bottom:3px">🚧 ปัญหาและอุปสรรค</div>'+
    '<textarea id="ml-challenges" placeholder="อุปสรรคที่สมาชิกเจอ..."></textarea>'+
    '<div style="font-size:10px;color:var(--sub);margin-bottom:3px">📌 Action Plan — ตกลงกันจะทำ</div>'+
    '<textarea id="ml-action" placeholder="สิ่งที่ MC และสมาชิกตกลงจะทำ..."></textarea>'+
    '<div style="display:flex;gap:7px;margin-top:4px">'+
      '<button class="bsend" onclick="saveMeetingLog()">💾 บันทึก</button>'+
      '<button class="bsm" onclick="toggleMLForm()">ยกเลิก</button>'+
    '</div>'+
    '<div id="ml-res" style="font-size:11px;margin-top:5px"></div>'+
  '</div>';
  if(entries.length){
    html+='<div style="font-size:11px;color:var(--sub);margin-bottom:10px">บันทึกการประชุม '+entries.length+' ครั้ง</div>';
    html+=entries.slice().reverse().map(function(e,i){
      var isRec=i<2;
      return'<div class="ml-entry'+(isRec?' ml-recent':'')+'">'+
        '<div class="ml-entry-date">'+
          '<span>📅 '+esc(e.date)+'</span>'+
          (e.nextDate?'<span style="color:var(--ac)">→ นัดหน้า: '+esc(e.nextDate)+'</span>':'')+
          '<button class="bsm" style="font-size:10px;margin-left:auto;padding:2px 7px" onclick="deleteMLog('+e.id+')">🗑️</button>'+
        '</div>'+
        (e.topics?'<div class="ml-field"><div class="ml-field-lbl">หัวข้อ</div><div class="ml-field-val">'+esc(e.topics)+'</div></div>':'')+
        (e.challenges?'<div class="ml-field"><div class="ml-field-lbl">ปัญหา</div><div class="ml-field-val">'+esc(e.challenges)+'</div></div>':'')+
        (e.action?'<div class="ml-field"><div class="ml-field-lbl">Action Plan</div><div class="ml-field-val">'+esc(e.action)+'</div></div>':'')+
      '</div>';
    }).join('');
  } else {
    html+='<div class="es">ยังไม่มีบันทึกการประชุม<br><span style="font-size:11px">คลิก "+ บันทึกการประชุม" เพื่อเริ่ม</span></div>';
  }
  return html;
}
// ══ SCORE SIMULATOR ══════════════════════════════════════
var _simBase=null,_simCur=null;
function _simBuildScore(a){
  var d=a.bniDays||1,ew=Math.max(1,Math.min(Math.floor(d/7),26));
  function scAb(x){return x===0?15:x===1?10:x===2?5:0;}
  function scRef(x){var r=x/ew;return r>=2?15:r>=1?10:0;}
  function scTy(x){var r=x/ew;return r>=15000?15:r>=5000?10:r>=1500?5:0;}
  function scVi(x){return x>=4?20:x>=1?10:0;}
  function sc12(x){var r=x/ew;return r>=2?15:r>=1?10:r>0?5:0;}
  function scCe(x){return x>=4?20:x>=3?15:x>=2?10:x>=1?5:0;}
  var s={absent:scAb(a.absent||0),ref:scRef(a.rg||0),tyfcb:scTy(a.tyfcb||0),visitor:scVi(a.visitor||0),one21:sc12(a.oToOne||0),training:scCe(a.ceu||0)};
  s.total=s.absent+s.ref+s.tyfcb+s.visitor+s.one21+s.training;
  s.tl=s.total>=70?'green':s.total>=50?'yellow':s.total>=30?'red':'blue';
  return s;
}
function simAdj(key,delta){
  if(!_simCur)return;
  var v=(_simCur[key]||0)+delta;
  if(v<0)v=0;
  _simCur[key]=v;
  _simRefresh();
}
function simReset(){
  if(!_simBase)return;
  _simCur={rg:_simBase.rg,visitor:_simBase.visitor,oToOne:_simBase.oToOne,ceu:_simBase.ceu,tyfcb:_simBase.tyfcb,bniDays:_simBase.bniDays,absent:_simBase.absent};
  _simRefresh();
}
function _simRefresh(){
  if(!_simCur)return;
  var s=_simBuildScore(_simCur);
  var scEl=document.getElementById('sim-score'),bdEl=document.getElementById('sim-badge'),barEl=document.getElementById('sim-bar');
  if(scEl){scEl.textContent=s.total;scEl.style.color=tlC(s.tl);}
  if(bdEl){bdEl.className='badge b-'+tlK(s.tl);bdEl.textContent=tlL(s.tl);}
  if(barEl)barEl.style.width=Math.min(100,s.total)+'%';
  var map={absent:{pts:s.absent,val:_simCur.absent},rg:{pts:s.ref,val:_simCur.rg},tyfcb:{pts:s.tyfcb,val:_simCur.tyfcb},visitor:{pts:s.visitor,val:_simCur.visitor},oToOne:{pts:s.one21,val:_simCur.oToOne},ceu:{pts:s.training,val:_simCur.ceu}};
  Object.keys(map).forEach(function(k){
    var ve=document.getElementById('sim-v-'+k),pe=document.getElementById('sim-pts-'+k);
    if(ve)ve.textContent=k==='tyfcb'?(map[k].val>=1000?(map[k].val/1000).toFixed(0)+'K':map[k].val):map[k].val;
    if(pe){pe.textContent=map[k].pts;pe.style.color=map[k].pts>0?'var(--gr)':'var(--sub)';}
  });
}
function buildIMDSimulate(m){
  var a=m.actual;
  if(!a)return'<div class="sh"><h2>🎯 Score Simulator</h2></div><div class="es">🗂️ ไม่มีข้อมูล — โหลดข้อมูลใหม่</div>';
  _simBase={rg:a.rg,visitor:a.visitor,oToOne:a.oToOne,ceu:a.ceu,tyfcb:a.tyfcb,bniDays:a.bniDays,absent:a.absent};
  _simCur={rg:a.rg,visitor:a.visitor,oToOne:a.oToOne,ceu:a.ceu,tyfcb:a.tyfcb,bniDays:a.bniDays,absent:a.absent};
  var cs=_simBuildScore(_simBase);
  var html='<div class="sh"><h2>🎯 Score Simulator</h2></div>';
  // Score comparison header
  html+='<div style="display:flex;align-items:center;gap:12px;background:var(--sf2);border-radius:12px;padding:16px;margin-bottom:16px">';
  html+='<div style="flex:1;text-align:center"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">คะแนนปัจจุบัน</div>';
  html+='<div style="font-size:40px;font-weight:800;color:'+tlC(m.bniTl)+'">'+m.bniScore+'</div>';
  html+='<span class="badge b-'+tlK(m.bniTl)+'">'+tlL(m.bniTl)+'</span></div>';
  html+='<div style="font-size:24px;color:var(--sub)">→</div>';
  html+='<div style="flex:1;text-align:center"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">คะแนนคาดการณ์</div>';
  html+='<div id="sim-score" style="font-size:40px;font-weight:800;color:'+tlC(cs.tl)+'">'+cs.total+'</div>';
  html+='<span id="sim-badge" class="badge b-'+tlK(cs.tl)+'">'+tlL(cs.tl)+'</span></div>';
  html+='</div>';
  // Progress bar
  html+='<div class="pm" style="margin-bottom:4px"><div id="sim-bar" class="pmf" style="width:'+Math.min(100,cs.total)+'%"></div></div>';
  html+='<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--sub);margin-bottom:20px"><span>0</span><span style="color:var(--re)">30</span><span style="color:var(--ye)">50</span><span style="color:var(--gr)">70</span><span>100</span></div>';
  // Metric rows
  var rows=[
    {key:'absent',label:'🎫 ขาดประชุม',unit:'ครั้ง',step:1,max:15,pts:cs.absent,disp:a.absent},
    {key:'rg',label:'📢 Referral',unit:'Ref',step:1,max:15,pts:cs.ref,disp:a.rg},
    {key:'tyfcb',label:'💰 TYFCB',unit:'K บาท',step:5000,max:15,pts:cs.tyfcb,disp:a.tyfcb>=1000?(a.tyfcb/1000).toFixed(0)+'K':a.tyfcb},
    {key:'visitor',label:'👥 Visitor',unit:'คน',step:1,max:20,pts:cs.visitor,disp:a.visitor},
    {key:'oToOne',label:'🤝 1-2-1',unit:'ครั้ง',step:1,max:15,pts:cs.one21,disp:a.oToOne},
    {key:'ceu',label:'🎓 Training',unit:'CEU',step:1,max:20,pts:cs.training,disp:a.ceu}
  ];
  var btnS='width:32px;height:32px;border-radius:50%;background:var(--sf);border:1px solid var(--bd);color:var(--tx);font-size:18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1';
  rows.forEach(function(r){
    html+='<div style="display:flex;align-items:center;justify-content:space-between;background:var(--sf2);border-radius:10px;padding:12px 14px;margin-bottom:10px">';
    html+='<div style="flex:1"><div style="font-size:13px;font-weight:600;margin-bottom:6px">'+r.label+'</div>';
    html+='<div style="display:flex;align-items:center;gap:10px">';
    html+='<button style="'+btnS+'" onclick="simAdj(\''+r.key+'\',-('+r.step+'))">−</button>';
    html+='<div style="min-width:54px;text-align:center"><div id="sim-v-'+r.key+'" style="font-size:18px;font-weight:700">'+r.disp+'</div><div style="font-size:10px;color:var(--sub)">'+r.unit+'</div></div>';
    html+='<button style="'+btnS+'" onclick="simAdj(\''+r.key+'\','+r.step+')">+</button>';
    html+='</div></div>';
    html+='<div style="text-align:center;min-width:56px"><div style="font-size:10px;color:var(--sub);margin-bottom:2px">คะแนน</div>';
    html+='<div id="sim-pts-'+r.key+'" style="font-size:24px;font-weight:800;color:'+(r.pts>0?'var(--gr)':'var(--sub)')+'">'+r.pts+'</div>';
    html+='<div style="font-size:10px;color:var(--sub)">/ '+r.max+'</div></div>';
    html+='</div>';
  });
  html+='<div style="text-align:center;margin-top:8px"><button onclick="simReset()" style="background:var(--sf2);border:1px solid var(--bd);color:var(--sub);padding:8px 24px;border-radius:20px;font-size:13px;cursor:pointer">↩ รีเซ็ต</button></div>';
  html+='<div style="font-size:11px;color:var(--sub);text-align:center;margin-top:10px">กด +/− เพื่อปรับค่าและดูคะแนนที่คาดการณ์</div>';
  return html;
}
function toggleMLForm(){
  var f=document.getElementById('ml-form');
  if(!f)return;
  var show=f.style.display!=='block';
  f.style.display=show?'block':'none';
  if(show){
    var di=document.getElementById('ml-date');if(di)di.value=new Date().toISOString().slice(0,10);
    ['ml-topics','ml-challenges','ml-action','ml-next'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
    var res=document.getElementById('ml-res');if(res)res.textContent='';
  }
}
function saveMeetingLog(){
  var date=(document.getElementById('ml-date')||{}).value||new Date().toISOString().slice(0,10);
  var topics=(document.getElementById('ml-topics')||{}).value||'';
  var challenges=(document.getElementById('ml-challenges')||{}).value||'';
  var action=(document.getElementById('ml-action')||{}).value||'';
  var nextDate=(document.getElementById('ml-next')||{}).value||'';
  var res=document.getElementById('ml-res');
  if(!topics.trim()&&!challenges.trim()&&!action.trim()){if(res){res.style.color='var(--re)';res.textContent='กรอกอย่างน้อย 1 ช่อง';}return;}
  var entries=_getMLog(_mlCurrent);
  entries.push({id:Date.now(),date:date,topics:topics,challenges:challenges,action:action,nextDate:nextDate});
  _saveMLog(_mlCurrent,entries);
  if(res){res.style.color='var(--gr)';res.textContent='✓ บันทึกแล้ว';}
  toast('บันทึก Meeting Log แล้ว ✓','ok');
  var mem=D.mem.find(function(m){return m.name===_mlCurrent;});
  if(mem){var el=document.getElementById('imd-s6');if(el)el.innerHTML=buildIMDMeetingLog(mem);}
}
function deleteMLog(id){
  var entries=_getMLog(_mlCurrent).filter(function(e){return e.id!==id;});
  _saveMLog(_mlCurrent,entries);
  var mem=D.mem.find(function(m){return m.name===_mlCurrent;});
  if(mem){var el=document.getElementById('imd-s6');if(el)el.innerHTML=buildIMDMeetingLog(mem);}
  toast('ลบแล้ว','ok');
}

// ══ CONTACT LOG ══════════════════════════════════════════
var _contacts=(function(){try{return JSON.parse(localStorage.getItem('bni_contacts')||'{}');}catch(e){return{};}})();
var _cmCurrent='';
function _cDays(name){var c=_contacts[name];if(!c||!c.date)return null;return Math.floor((Date.now()-new Date(c.date).getTime())/86400000);}
function _cBadge(name){
  var d=_cDays(name);
  if(d===null)return'<span class="lc-badge lc-none">ยังไม่ได้ติดต่อ</span>';
  if(d<=7)return'<span class="lc-badge lc-ok">ติดต่อ '+d+'วันที่แล้ว</span>';
  if(d<=14)return'<span class="lc-badge lc-warn">'+d+' วันที่แล้ว</span>';
  return'<span class="lc-badge lc-danger">'+d+' วัน ⚠️</span>';
}
function openCM(name){
  _cmCurrent=name;
  document.getElementById('cm-name').textContent='📋 '+name;
  var c=_contacts[name]||{};
  document.getElementById('cm-note').value=c.note||'';
  document.querySelectorAll('.cm-type-btn').forEach(function(b){b.classList.toggle('sel',b.textContent.trim()===c.type);});
  document.getElementById('cm-modal').style.display='flex';
}
function selCMType(el){document.querySelectorAll('.cm-type-btn').forEach(function(b){b.classList.remove('sel');});el.classList.add('sel');}
function closeCM(){document.getElementById('cm-modal').style.display='none';}
function saveCM(){
  var type='📞 โทร';
  document.querySelectorAll('.cm-type-btn.sel').forEach(function(b){type=b.textContent.trim();});
  var note=(document.getElementById('cm-note')||{}).value||'';
  var now=new Date().toISOString().slice(0,10);
  _contacts[_cmCurrent]={date:now,type:type,note:note};
  try{localStorage.setItem('bni_contacts',JSON.stringify(_contacts));}catch(e){}
  closeCM();
  toast('บันทึก '+type+' กับ '+_cmCurrent+' แล้ว ✓','ok');
  renderCoach();
  var pqEl=document.getElementById('pq-list');if(pqEl&&pqEl.innerHTML)renderPriority();
}

// ══ PRIORITY QUEUE ════════════════════════════════════════
function _calcPri(m){
  var sc=0,reasons=[];
  if(m.bniTl==='red'){sc+=40;reasons.push('🔴 Red Zone');}
  else if(m.bniTl==='blue'){sc+=30;reasons.push('🔵 ขาดบ่อย');}
  else if(m.bniTl==='yellow'){sc+=20;reasons.push('🟡 Yellow Zone');}
  var rt=riskThresh.absent||4;
  if(m.absent>=rt){sc+=Math.min(3,m.absent-rt+1)*8;reasons.push('ขาด '+m.absent+' ครั้ง');}
  if(m.bniTl!=='none'&&m.bniScore<30){sc+=15;reasons.push('คะแนน <30');}
  var openRep=D.reps.some(function(r){return r.memberName===m.name&&repIsOpen(r);});
  if(openRep){sc+=20;reasons.push('📋 Report ค้าง');}
  var cd=_cDays(m.name);
  if(cd===null){sc+=12;reasons.push('ยังไม่ได้ติดต่อ');}
  else if(cd>30){sc+=18;reasons.push('ไม่ติดต่อ '+cd+' วัน');}
  else if(cd>14){sc+=8;reasons.push('ไม่ติดต่อ '+cd+' วัน');}
  if(!D.msgs.some(function(ms){return ms.name===m.name;})&&m.bniTl==='red'){sc+=8;reasons.push('ไม่มีข้อความ');}
  var ren=D.ren.find(function(r){return r.name===m.name;});
  if(ren&&ren.diffDays<=30){sc+=15;reasons.push('Renewal '+ren.diffDays+' วัน');}
  var h=(m.hist||[]).map(Number).filter(function(n){return!isNaN(n)&&n>0;});
  if(h.length>=3&&h[h.length-1]<h[h.length-2]&&h[h.length-2]<h[h.length-3]){sc+=10;reasons.push('คะแนนลดต่อเนื่อง');}
  return{score:sc,reasons:reasons};
}
// ── Action Center: open tab + set sub-tab ─────────────────────
function openActionCenter(sub){
  var acTab=document.getElementById('mc-ac-tab');
  if(acTab) sw('mc-pq',acTab,'mc');
  acSub(sub||'pq');
}
function acSub(sub){
  ['pq','inbox','ft','coach'].forEach(function(k){
    var p=document.getElementById('ac-'+k);
    var b=document.getElementById('ac-stb-'+k);
    if(p)p.classList.toggle('on',k===sub);
    if(b)b.classList.toggle('on',k===sub);
  });
  if(sub==='pq')renderPriority();
  else if(sub==='inbox')loadUnifiedFollowUpInbox();
  else if(sub==='ft')renderFT();
  else if(sub==='coach'){renderCoach();}
  // sync badges
  var bpq=document.getElementById('ac-badge-pq'),bco=document.getElementById('ac-badge-coach'),bin=document.getElementById('ac-badge-inbox');
  var bpq2=document.getElementById('badge-pq'),bco2=document.getElementById('badge-coach'),bin2=document.getElementById('badge-inbox');
  if(bpq&&bpq2)bpq.textContent=bpq2.textContent;
  if(bco&&bco2)bco.textContent=bco2.textContent;
  if(bin&&bin2)bin.textContent=bin2.textContent;
}

var _ufiLoaded=false,_ufiData=null;
function ufiLevelMeta(level){
  return ({
    critical:{label:'Critical',color:'var(--re)',icon:'🚨'},
    overdue:{label:'Overdue',color:'var(--re)',icon:'⏰'},
    urgent:{label:'Urgent',color:'var(--ye)',icon:'⚠️'},
    due_soon:{label:'Due soon',color:'var(--ye)',icon:'📌'},
    open:{label:'Open',color:'var(--sub)',icon:'•'}
  })[level]||{label:level||'Open',color:'var(--sub)',icon:'•'};
}
function ufiTypeMeta(type){
  return ({
    line_issue:{label:'LINE Help',color:'#f87171'},
    core_issue:{label:'Core Issue',color:'#fb7185'},
    growth_task:{label:'Growth Task',color:'#a78bfa'},
    renewal:{label:'Renewal',color:'#fbbf24'},
    passport:{label:'Passport',color:'#38bdf8'},
    msb:{label:'MSB',color:'#34d399'}
  })[type]||{label:type||'Follow-up',color:'var(--ac)'};
}
function ufiSummaryChip(label,value,color){
  return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:12px;padding:9px 12px;min-width:92px">'
    +'<div style="font-size:18px;font-weight:900;color:'+color+';line-height:1">'+esc(value)+'</div>'
    +'<div style="font-size:10px;color:var(--sub);font-weight:800;margin-top:4px">'+esc(label)+'</div>'
  +'</div>';
}
function ufiOpenTarget(target){
  if(target==='line'){sw('mc-usage',null,'mc');setTimeout(function(){actSw('line',document.getElementById('act-tab-line'));loadLineActivityTimeline(true);},80);return;}
  if(target==='renewal'){sw('mc-ren',null,'mc');return;}
  if(target==='passport'){sw('mc-passport',null,'mc');loadPassportBoard();return;}
  if(target==='msb'){sw('mc-msb',null,'mc');msbLoad('mc');return;}
  openActionCenter('pq');
}
function ufiOpenMember(name){
  if(!name){toast('ยังไม่มีชื่อสมาชิกสำหรับเปิด Member 360','err');return;}
  openIMD(name);
}
function ufiCard(x){
  var lm=ufiLevelMeta(x.level),tm=ufiTypeMeta(x.type);
  var name=x.nickname||x.memberName||x.team||'Chapter';
  var detail=x.detail?'<div style="margin-top:8px;background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:8px 9px;font-size:11px;color:var(--tx);line-height:1.55">'+esc(String(x.detail).slice(0,220))+'</div>':'';
  return '<article style="background:var(--sf);border:1px solid var(--bd);border-left:4px solid '+lm.color+';border-radius:14px;padding:13px 14px;box-shadow:0 10px 24px rgba(0,0,0,.10)">'
    +'<div style="display:flex;align-items:flex-start;gap:10px">'
      +'<div style="width:38px;height:38px;border-radius:13px;background:'+tm.color+'18;border:1px solid '+tm.color+'44;display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto">'+esc(x.icon||lm.icon)+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">'
          +'<span style="font-size:10px;font-weight:900;color:'+tm.color+';text-transform:uppercase">'+esc(tm.label)+'</span>'
          +'<span style="font-size:10px;border:1px solid '+lm.color+'55;background:'+lm.color+'16;color:'+lm.color+';border-radius:999px;padding:3px 7px;font-weight:900">'+esc(lm.icon+' '+lm.label)+'</span>'
          +(x.team?'<span style="font-size:10px;color:var(--sub);background:var(--sf2);border:1px solid var(--bd);border-radius:999px;padding:3px 7px;font-weight:800">'+esc(x.team)+'</span>':'')
          +'<span style="margin-left:auto;font-size:10px;color:var(--sub)">'+esc(x.dueText||'')+'</span>'
        +'</div>'
        +'<div style="font-size:14px;font-weight:900;color:var(--tx);line-height:1.35;margin-top:6px">'+esc(name)+'</div>'
        +'<div style="font-size:12px;font-weight:800;color:var(--tx);line-height:1.45;margin-top:3px">'+esc(x.title||'Follow-up')+'</div>'
        +detail
        +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-top:8px">Next: <b style="color:var(--tx)">'+esc(x.nextAction||'ติดตามต่อ')+'</b></div>'
      +'</div>'
    +'</div>'
    +'<div style="display:flex;justify-content:flex-end;margin-top:10px">'
      +(x.memberName?'<button class="bsm" onclick="ufiOpenMember('+JSON.stringify(x.memberName).replace(/"/g,'&quot;')+')" style="font-size:10px;margin-right:6px">👤 Member 360</button>':'')
      +'<button class="bsm bac" onclick="ufiOpenTarget('+JSON.stringify(x.actionTarget||'pq').replace(/"/g,'&quot;')+')" style="font-size:10px">'+esc(x.actionLabel||'เปิด')+' ▸</button>'
    +'</div>'
  +'</article>';
}
function loadUnifiedFollowUpInbox(force){
  if(_ufiLoaded&&!force){renderUnifiedFollowUpInbox();return;}
  var list=document.getElementById('ufi-list'),sum=document.getElementById('ufi-summary');
  if(list)list.innerHTML='<div class="es">⏳ กำลังรวมงานค้างจากทุกระบบ...</div>';
  gsr('getUnifiedFollowUpInbox',{role:S.role},function(r){
    if(!r||!r.ok){
      if(list)list.innerHTML='<div style="background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.28);border-radius:12px;padding:14px;color:var(--re);font-size:12px">❌ '+esc(r&&r.error||'โหลด Follow-up Inbox ไม่สำเร็จ')+'</div>';
      if(sum)sum.innerHTML='';
      return;
    }
    _ufiLoaded=true;_ufiData=r.inbox||{};renderUnifiedFollowUpInbox();
  });
}
function renderUnifiedFollowUpInbox(){
  var data=_ufiData||{},items=data.items||[],sum=document.getElementById('ufi-summary'),list=document.getElementById('ufi-list');
  var urgentCount=items.filter(function(x){return ['critical','overdue','urgent'].indexOf(x.level)>=0;}).length||0;
  badge('ac-badge-inbox',urgentCount);
  badge('badge-inbox',urgentCount);
  if(sum){
    var levels=data.levels||{},counts=data.counts||{};
    sum.innerHTML=[
      ufiSummaryChip('ทั้งหมด',data.total||items.length,'var(--ac)'),
      ufiSummaryChip('Critical',levels.critical||0,'var(--re)'),
      ufiSummaryChip('Overdue',levels.overdue||0,'var(--re)'),
      ufiSummaryChip('LINE Help',counts.line_issue||0,'#f87171'),
      ufiSummaryChip('Renewal',counts.renewal||0,'#fbbf24'),
      ufiSummaryChip('MSB',counts.msb||0,'#34d399')
    ].join('');
  }
  if(!list)return;
  if(!items.length){list.innerHTML='<div class="es">✅ ไม่มีงานค้างสำคัญใน Follow-up Inbox ตอนนี้</div>';return;}
  list.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">'+items.map(ufiCard).join('')+'</div>'
    +'<div class="pq-legend" style="margin-top:12px">Unified Inbox รวม source เดิมโดยไม่เปลี่ยน workflow: LINE Issue, Core Issue, Growth Task, Renewal, Passport และ MSB Intelligence</div>';
}

function renderPriority(){
  var el=document.getElementById('pq-list');if(!el)return;
  var list=D.mem.filter(function(m){return m.bniTl!=='green';}).map(function(m){
    var p=_calcPri(m);return{m:m,score:p.score,reasons:p.reasons};
  }).sort(function(a,b){return b.score-a.score;}).slice(0,25);
  badge('badge-pq',list.filter(function(x){return x.score>=50;}).length);
  if(!list.length){el.innerHTML='<div class="es">✅ ไม่มีสมาชิกที่ต้องติดตามเร่งด่วน</div>';return;}
  el.innerHTML=list.map(function(item,i){
    var m=item.m,sc=item.score;
    var color=sc>=60?'var(--re)':sc>=40?'var(--ye)':'var(--gy)';
    var cd=_cDays(m.name),cdStr=cd===null?'ยังไม่ได้ติดต่อ':cd+' วันที่แล้ว';
    var ctType=_contacts[m.name]?(' ('+esc(_contacts[m.name].type||'')+')'):'';
    return'<div class="pq-item">'+
      '<div class="pq-rank" style="background:'+color+'22;color:'+color+'">'+(i+1)+'</div>'+
      '<div class="pq-info">'+
        '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">'+
          '<span style="font-weight:700;font-size:14px;cursor:pointer;text-decoration:underline;text-underline-offset:2px" onclick="openIMD(\''+esc(m.name)+'\')">'+esc(m.name)+'</span>'+
          (m.nick?'<span style="font-size:11px;color:var(--sub)">('+esc(m.nick)+')</span>':'')+
          '<span class="badge b-'+tlK(m.bniTl)+'" style="font-size:9px">'+tlL(m.bniTl)+'</span>'+
          '<span style="font-size:12px;color:'+tlC(m.bniTl)+';font-weight:600">'+(m.bniTl!=='none'?m.bniScore+'pt':'—')+'</span>'+
          '<span style="font-size:11px;color:var(--gy)">'+esc(m.mentor||'')+'</span>'+
        '</div>'+
        '<div class="pq-why">'+item.reasons.slice(0,4).join(' · ')+'</div>'+
        '<div style="font-size:10px;color:var(--sub);margin-top:3px">📞 '+cdStr+ctType+'</div>'+
      '</div>'+
      '<div class="pq-score" style="color:'+color+'">'+sc+'</div>'+
      '<div class="pq-acts">'+
        '<button class="bsm" onclick="openIMD(\''+esc(m.name)+'\')" title="ดูข้อมูล">👤</button>'+
        '<button class="bsm" onclick="openCM(\''+esc(m.name)+'\')" title="บันทึกการติดต่อ">📞</button>'+
        '<button class="bsm bac" onclick="openMsg4(\''+esc(m.name)+'\',\''+esc(m.mentor||'')+'\')">💬 ส่ง</button>'+
      '</div>'+
    '</div>';
  }).join('')+'<div class="pq-legend">Priority Score: Zone (20–40) + Report ค้าง (20) + Renewal (15) + ไม่ติดต่อ (12–18) + ขาด (8–24) + ลดต่อเนื่อง (10) + ไม่มีข้อความ (8)</div>';
}
function openMsg4(name,mentor){
  var tabs=document.querySelectorAll('#mc-tabs .tb');
  var msgTab=null;
  tabs.forEach(function(t){if(t.textContent.indexOf('Messages')>=0)msgTab=t;});
  if(msgTab){sw('mc-msg',msgTab,'mc');}
  if(mentor){var ts=document.getElementById('msgTeam');if(ts){ts.value=mentor;loadMsgMem();}}
  setTimeout(function(){
    if(name){var ms=document.getElementById('msgMem');if(ms)for(var k=0;k<ms.options.length;k++)if(ms.options[k].text.indexOf(name)>=0){ms.selectedIndex=k;break;}}
    var txt=document.getElementById('msgTxt');if(txt)txt.focus();
  },500);
  toast('ไปที่ Messages แล้ว','ok');
}

// ══ MEETING PREP ═════════════════════════════════════════
function openMeetingPrep(){
  var now=new Date();
  var dateStr=now.toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var rt=riskThresh.absent||4,rs=riskThresh.score||30,mem=D.mem;
  var greens=mem.filter(function(m){return m.bniTl==='green';}).sort(function(a,b){return b.bniScore-a.bniScore;}).slice(0,5);
  var risk=mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);});
  var openReps=D.reps.filter(function(r){return repIsOpen(r);});
  var ren30=D.ren.filter(function(r){return r.diffDays<=30;});
  var noContact=mem.filter(function(m){return m.bniTl==='red'&&(_cDays(m.name)===null||_cDays(m.name)>7);});
  var sm=D.sm,sc=mem.filter(function(m){return m.bniTl!=='none';});
  var avg=sc.length?Math.round(sc.reduce(function(a,m){return a+m.bniScore;},0)/sc.length):0;
  var html='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px">'+
    '<div><div style="font-size:16px;font-weight:800">📋 Meeting Preparation</div>'+
    '<div style="font-size:12px;color:var(--sub)">'+dateStr+'</div></div>'+
    '<div style="display:flex;gap:7px">'+
      '<button class="bsm bac" onclick="copyMP()">📋 Copy</button>'+
      '<button class="bsm" onclick="window.print()">🖨️ Print</button>'+
      '<button class="bsm" onclick="document.getElementById(\'mp-modal\').style.display=\'none\'">✕ ปิด</button>'+
    '</div>'+
  '</div>';
  html+='<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">'+
    [{l:'สมาชิก',v:sm.total||0,c:'var(--ac)'},{l:'BNI Avg',v:avg+'pt',c:'var(--gr)'},{l:'🟢 Green',v:sm.green||0,c:'var(--gr)'},{l:'🟡 Yellow',v:sm.yellow||0,c:'var(--ye)'},{l:'🔴 Red',v:sm.red||0,c:'var(--re)'},{l:'⚠️ Risk',v:risk.length,c:'var(--re)'}]
    .map(function(c){return'<div style="background:var(--sf2);border-radius:8px;padding:6px 12px;font-size:12px"><span style="font-weight:800;color:'+c.c+'">'+c.v+'</span><span style="color:var(--sub);margin-left:5px">'+c.l+'</span></div>';}).join('')+
  '</div>';
  html+='<div class="mp-section"><h3>🏆 Recognition — ยกย่องสมาชิก Green Zone</h3>';
  html+=greens.length?greens.map(function(m){
    return'<div class="mp-row"><span class="badge b-gr" style="font-size:9px">GREEN</span>'+
      '<span style="font-weight:700">'+esc(m.name)+'</span>'+
      (m.nick?'<span style="font-size:11px;color:var(--sub)">('+esc(m.nick)+')</span>':'')+
      '<span style="color:var(--gr);font-size:12px;font-weight:600">'+m.bniScore+' pt</span>'+
      '<span style="font-size:11px;color:var(--sub);margin-left:auto">'+esc(m.mentor||'')+'</span>'+
    '</div>';
  }).join(''):'<div style="color:var(--sub);font-size:13px;padding:6px 0">ยังไม่มีสมาชิก Green Zone</div>';
  html+='</div>';
  html+='<div class="mp-section"><h3>⚠️ Concerns — สมาชิกที่ต้องติดตาม ('+risk.length+' คน)</h3>';
  html+=risk.length?risk.slice(0,10).map(function(m){
    var iss=[];
    if(m.absent>=rt)iss.push('ขาด '+m.absent);
    if(m.bniTl!=='none'&&m.bniScore<rs)iss.push('BNI '+m.bniScore+'pt');
    return'<div class="mp-row">'+
      '<span class="badge b-'+tlK(m.bniTl)+'" style="font-size:9px">'+tlL(m.bniTl)+'</span>'+
      '<span style="font-weight:600">'+esc(m.name)+'</span>'+
      '<span style="font-size:11px;color:var(--re)">'+iss.join(' · ')+'</span>'+
      _cBadge(m.name)+
      '<span style="font-size:11px;color:var(--sub);margin-left:auto">'+esc(m.mentor||'')+'</span>'+
    '</div>';
  }).join(''):'<div style="color:var(--gr);font-size:13px;padding:6px 0">✅ ไม่มีสมาชิก Risk</div>';
  html+='</div>';
  if(openReps.length){
    html+='<div class="mp-section"><h3>📋 Open Reports รอ MC Reply ('+openReps.length+')</h3>';
    html+=openReps.slice(0,6).map(function(r){
      return'<div class="mp-row">'+
        '<span style="font-weight:600">'+esc(r.memberName)+'</span>'+
        '<span style="font-size:11px;color:var(--sub);flex:1;overflow:hidden;text-overflow:ellipsis">'+esc((r.coreIssue||'').substring(0,55))+'</span>'+
        '<span style="font-size:11px;color:var(--sub);flex-shrink:0">'+esc(r.team)+'</span>'+
      '</div>';
    }).join('');
    html+='</div>';
  }
  if(ren30.length){
    html+='<div class="mp-section"><h3>📅 Renewal Alert — ต่ออายุใน 30 วัน ('+ren30.length+' คน)</h3>';
    html+=ren30.map(function(r){
      return'<div class="mp-row">'+
        '<span style="font-weight:600">'+esc(r.name)+'</span>'+
        '<span style="color:var(--ye);font-size:12px;font-weight:600">เหลือ '+r.diffDays+' วัน</span>'+
        '<span style="font-size:11px;color:var(--sub);margin-left:auto">'+esc(r.mentor||'')+'</span>'+
      '</div>';
    }).join('');
    html+='</div>';
  }
  html+='<div class="mp-section"><h3>📌 Action Items — MC ต้องทำสัปดาห์นี้</h3>';
  var actions=[];
  noContact.forEach(function(m){actions.push({c:'var(--re)',t:'ติดต่อ '+m.name+' (Red — ยังไม่ได้โทร)',sub:m.mentor||''});});
  openReps.slice(0,3).forEach(function(r){actions.push({c:'var(--ye)',t:'Reply Report: '+r.memberName,sub:r.team});});
  ren30.slice(0,3).forEach(function(r){actions.push({c:'var(--bl)',t:'ติดตาม Renewal: '+r.name+' ('+r.diffDays+' วัน)',sub:r.mentor||''});});
  if(actions.length){
    html+=actions.slice(0,10).map(function(a){
      return'<div class="mp-row">'+
        '<span style="color:'+a.c+';font-weight:700;margin-right:4px">→</span>'+
        '<span style="font-size:13px;flex:1">'+esc(a.t)+'</span>'+
        '<span style="font-size:11px;color:var(--sub)">'+esc(a.sub)+'</span>'+
      '</div>';
    }).join('');
  } else {html+='<div style="color:var(--gr);font-size:13px;padding:6px 0">✅ ไม่มี Action Item เร่งด่วน</div>';}
  html+='</div>';
  document.getElementById('mp-box').innerHTML=html;
  document.getElementById('mp-modal').style.display='flex';
}
function copyMP(){
  var rt=riskThresh.absent||4,rs=riskThresh.score||30;
  var now=new Date().toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var txt='📋 BNI IDEAL Meeting Prep\n'+now+'\n═══════════════\n\n';
  txt+='🏆 Recognition\n';
  D.mem.filter(function(m){return m.bniTl==='green';}).sort(function(a,b){return b.bniScore-a.bniScore;}).slice(0,5).forEach(function(m){txt+='  • '+m.name+' ('+m.bniScore+' pt)\n';});
  txt+='\n⚠️ Concerns\n';
  D.mem.filter(function(m){return m.absent>=rt||(m.bniTl!=='none'&&m.bniScore<rs);}).slice(0,8).forEach(function(m){txt+='  • '+m.name+' ['+tlL(m.bniTl)+' '+m.bniScore+'pt, ขาด '+m.absent+']\n';});
  txt+='\n📋 Open Reports: '+D.reps.filter(function(r){return repIsOpen(r);}).length+' รายการ\n';
  txt+='📅 Renewal ≤30 วัน: '+D.ren.filter(function(r){return r.diffDays<=30;}).length+' คน\n';
  txt+='\n📌 Actions\n';
  D.mem.filter(function(m){return m.bniTl==='red'&&(_cDays(m.name)===null||_cDays(m.name)>7);}).slice(0,5).forEach(function(m){txt+='  → ติดต่อ '+m.name+'\n';});
  D.reps.filter(function(r){return repIsOpen(r);}).slice(0,3).forEach(function(r){txt+='  → Reply Report: '+r.memberName+'\n';});
  txt+='\n🤖 Generated by BNI IDEAL Desktop';
  navigator.clipboard.writeText(txt).then(function(){toast('Copy แล้ว 📋','ok');}).catch(function(){toast('ไม่สามารถ Copy ได้','err');});
}

// ══ MC TALK Generator ════════════════════════════
var _mctText='';
function closeMCT(){document.getElementById('mct-modal').style.display='none';}
function openMCT(name){
  try{
    var m=D.mem.find(function(x){return x.name===name;});
    if(!m){toast('ไม่พบข้อมูล '+name,'err');return;}
    var pri=_calcPri(m);
    var cd=_cDays(name);
    var ren=D.ren.find(function(r){return r.name===name;});
    var openRep=D.reps.find(function(r){return r.memberName===name&&repIsOpen(r);});
    var contact=_contacts[name]||{};
    var h=(m.hist||[]).map(Number).filter(function(n){return!isNaN(n)&&n>0;});
    var delta=h.length>=2?h[h.length-1]-h[h.length-2]:null;
    var cats=m.cats||{};
    var nick=m.nick||m.name;
    var today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
    var gMem=_findGshMember(m.name,m.nick||'');
    var gT=gMem?gMem.target:0,gR=gMem?gMem.received:0;
    var gP=gT>0?Math.round(gR/gT*100):null;
    var steps=[];
    var txt='💬 MC TALK — '+name+'\n'+today+'\nทีม: '+(m.mentor||'—')+'\n\n';

    // ── Step 1: เปิดบทสนทนา ─────────────────────────
    steps.push({n:1,ico:'🔓',title:'เปิดบทสนทนา',time:'2 นาที',urgent:false,lines:[
      {t:'script',v:'"สวัสดีครับ '+nick+' เป็นยังไงบ้างช่วงนี้?"'},
      {t:'note',v:'ถามเรื่องธุรกิจล่าสุด หรือข่าวสารทั่วไปก่อน'},
      {t:'note',v:'สร้างบรรยากาศ relaxed ก่อนเข้าเรื่องสำคัญ'}
    ]});
    txt+='1. เปิดบทสนทนา\n   → "สวัสดีครับ '+nick+' เป็นยังไงบ้าง?"\n   → ถามธุรกิจล่าสุด\n\n';

    // ── Step 2: ประเด็นเร่งด่วน (ถ้ามี) ──────────────
    var urgLines=[],urgTxt='';
    if(m.bniTl==='red'){
      urgLines.push({t:'script',v:'"คะแนน BNI ตอนนี้ '+m.bniScore+' pt อยู่ใน Red Zone ต้องการความช่วยเหลืออะไรบ้างครับ?"'});
      urgLines.push({t:'note',v:'ฟังก่อน อย่าเพิ่งสั่ง — หาสาเหตุที่แท้จริง'});
      urgTxt+='   → ถาม Red Zone: BNI '+m.bniScore+' pt\n';
    }
    if(m.absent>=(riskThresh.absent||4)){
      urgLines.push({t:'script',v:'"ช่วงนี้ขาดประชุม '+m.absent+' ครั้ง มีติดขัดอะไรไหม? จะช่วยจัดการยังไงได้บ้าง?"'});
      urgTxt+='   → ขาดประชุม '+m.absent+' ครั้ง\n';
    }
    if(ren&&ren.diffDays<=30){
      urgLines.push({t:'script',v:'"Renewal เหลืออีก '+ren.diffDays+' วัน วางแผนต่ออายุยังไงบ้างครับ?"'});
      urgLines.push({t:'note',v:'ถ้าลังเล → หาเหตุผล / เสนอ payment plan'});
      urgTxt+='   → Renewal อีก '+ren.diffDays+' วัน\n';
    }
    if(openRep){
      urgLines.push({t:'script',v:'"มี Report ค้างอยู่ รบกวนช่วยอัปเดตสถานการณ์ล่าสุดด้วยครับ — '+esc((openRep.coreIssue||'').substring(0,40))+'"'});
      urgTxt+='   → Report ค้าง: '+(openRep.coreIssue||'').substring(0,30)+'\n';
    }
    if(cd===null||cd>30){
      urgLines.push({t:'note',v:'ยังไม่ได้ติดต่อมานาน — ถามว่า "มีอะไรอัปเดตไหมครับ?"'});
    }
    if(urgLines.length){
      steps.push({n:2,ico:'⚡',title:'ประเด็นเร่งด่วน',time:'10-15 นาที',urgent:true,lines:urgLines});
      txt+='2. ประเด็นเร่งด่วน\n'+urgTxt+'\n';
    }

    // ── Step 3: Performance Review ───────────────────
    var perfLines=[],perfTxt='';
    perfLines.push({t:'note',v:'BNI Score: '+m.bniScore+' pt — '+tlL(m.bniTl)});
    if(delta!==null){
      if(delta>0){
        perfLines.push({t:'script',v:'"คะแนนเพิ่มขึ้น +'+delta+' pt ดีมากครับ ทำยังไงถึงเพิ่มได้?"'});
        perfTxt+='   → ชม: +'+delta+' pt\n';
      } else if(delta<0){
        perfLines.push({t:'script',v:'"เดือนที่แล้วลดลง '+Math.abs(delta)+' pt รู้สึกยังไงบ้างครับ มีอะไรที่เราช่วยได้ไหม?"'});
        perfTxt+='   → ลดลง '+Math.abs(delta)+' pt — ถามสาเหตุ\n';
      } else {
        perfLines.push({t:'script',v:'"คะแนนทรงตัวที่ '+m.bniScore+' pt มีแผนจะ push ขึ้นไปถึง '+(m.bniTl==='red'?30:m.bniTl==='yellow'?70:m.bniScore+10)+' ไหมครับ?"'});
      }
    } else {
      perfLines.push({t:'script',v:'"มีเป้าหมาย BNI Score เดือนหน้าไว้ที่เท่าไหร่ครับ?"'});
    }
    if(cats.ref!==undefined){
      perfLines.push({t:'note',v:'Referral: '+(cats.ref||0)+' ใบ | 1-2-1: '+(cats.one21||0)+' ครั้ง | CEU: '+(cats.training||0)});
      if((cats.ref||0)<3)perfLines.push({t:'script',v:'"Referral ยังน้อยอยู่ มี Power Team ไหนที่อยากทำ 1-2-1 เพิ่มบ้างครับ?"'});
      if((cats.training||0)<5)perfLines.push({t:'script',v:'"Training CEU ยังขาดอยู่ มีแผนเข้า training ไหมครับ?"'});
    }
    if(gMem&&gP!==null){
      perfLines.push({t:'note',v:'Growth Revenue: รับจริง '+gshFmtNum(gR)+' / เป้า '+gshFmtNum(gT)+' ('+gP+'%)'});
      if(gP<50)perfLines.push({t:'script',v:'"ยอด Growth ตอนนี้ '+gP+'% ของเป้า มีอะไรที่ผมช่วยหา Referral เพิ่มได้ไหมครับ?"'});
      perfTxt+='   → Growth '+gP+'%\n';
    }
    steps.push({n:steps.length+1,ico:'📊',title:'ทบทวน Performance',time:'5-8 นาที',urgent:false,lines:perfLines});
    txt+=(steps.length)+'. ทบทวน Performance\n   → BNI '+m.bniScore+' pt'+perfTxt+'\n';

    // ── Step 4: แผนต่อไป ─────────────────────────────
    var planLines=[],planTxt='';
    planLines.push({t:'script',v:'"เดือนหน้าเราจะช่วยกัน focus ที่อะไร? มีเป้าหมายไหมครับ?"'});
    if(m.bniTl==='red'||m.bniTl==='yellow'){
      var target=m.bniTl==='red'?50:70;
      planLines.push({t:'note',v:'เสนอ: ตั้งเป้า BNI '+target+' pt ภายใน 1 เดือน'});
      planTxt+='   → Target: '+target+' pt\n';
    }
    planLines.push({t:'script',v:'"จะทำ 1-2-1 กับใครบ้างเดือนหน้า? นัดกันได้เลยไหม?"'});
    steps.push({n:steps.length+1,ico:'🎯',title:'วางแผนเดือนหน้า',time:'5 นาที',urgent:false,lines:planLines});
    txt+=(steps.length)+'. วางแผนเดือนหน้า\n'+planTxt+'\n';

    // ── Step 5: Action Items ─────────────────────────
    var actions=[],actTxt='';
    if(delta!==null&&delta>0)actions.push({t:'action',v:'☑ ชมเชยผลงานที่ดีขึ้น — บันทึกไว้'});
    actions.push({t:'action',v:'☐ นัด 1-2-1 ครั้งต่อไปก่อนจบการคุย'});
    if(m.bniTl==='red'||m.bniTl==='yellow')actions.push({t:'action',v:'☐ ตั้งเป้า BNI Score เดือนหน้า และ commit กัน'});
    if(m.absent>=(riskThresh.absent||4))actions.push({t:'action',v:'☐ หาทางแก้ปัญหาการขาดประชุม — บันทึก action'});
    if(ren&&ren.diffDays<=60)actions.push({t:'action',v:'☐ ยืนยันแผน Renewal ภายใน '+ren.diffDays+' วัน'});
    if(openRep)actions.push({t:'action',v:'☐ อัปเดต Report ที่ค้างอยู่ก่อน 3 วัน'});
    if((cats.ref||0)<3)actions.push({t:'action',v:'☐ ช่วย connect กับ Power Team ที่เหมาะสม'});
    if(gMem&&gP!==null&&gP<50)actions.push({t:'action',v:'☐ วางแผนเพิ่ม Referral ให้ถึงเป้า Growth (ตอนนี้ '+gP+'%)'});
    actions.push({t:'action',v:'☐ บันทึกการติดต่อ (กด 📞) หลังคุยเสร็จ'});
    steps.push({n:steps.length+1,ico:'✅',title:'Action Items — ก่อนแยกกัน',time:'3 นาที',urgent:false,lines:actions});
    actions.forEach(function(a){actTxt+='   '+a.v.replace('☐','□').replace('☑','✓')+'\n';});
    txt+=(steps.length)+'. Action Items\n'+actTxt+'\n';

    // ── Step 6: ปิดบทสนทนา ──────────────────────────
    steps.push({n:steps.length+1,ico:'🔒',title:'ปิดบทสนทนา',time:'2 นาที',urgent:false,lines:[
      {t:'note',v:'สรุป action items ที่ตกลงกันทั้งหมด'},
      {t:'script',v:'"ขอบคุณมากครับ '+nick+' ฝากธุรกิจด้วยนะครับ ถ้ามีอะไรที่ต้องการให้ช่วยติดต่อมาได้เลย 🙏"'},
      {t:'note',v:'นัดติดตามผลครั้งต่อไป'}
    ]});
    txt+=(steps.length)+'. ปิดบทสนทนา\n   → สรุป + ขอบคุณ\n\n🤖 BNI IDEAL MC TALK';

    // ── Build HTML ───────────────────────────────────
    var zoneIco={green:'🟢',yellow:'🟡',red:'🔴',blue:'🔵',none:'⚪'};
    var summHtml='<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px">'+
      '<span class="badge b-'+tlK(m.bniTl)+'">'+zoneIco[m.bniTl||'none']+' BNI '+m.bniScore+' pt</span>'+
      '<span class="badge" style="background:var(--sf2)">ขาด '+m.absent+' ครั้ง</span>'+
      (cd!==null?'<span class="badge" style="background:var(--sf2)">ติดต่อ '+cd+' วันที่แล้ว</span>':'<span class="badge" style="background:rgba(248,113,113,.12);color:var(--re)">ยังไม่ได้ติดต่อ</span>')+
      (ren&&ren.diffDays<=60?'<span class="badge" style="background:rgba(255,193,77,.12);color:var(--ye)">⏰ Renewal '+ren.diffDays+' วัน</span>':'')+
      (openRep?'<span class="badge" style="background:rgba(248,113,113,.12);color:var(--re)">📋 Report ค้าง</span>':'')+
      (pri.score>0?'<span class="badge" style="background:rgba(139,92,246,.1);color:#a78bfa">Priority '+pri.score+'</span>':'')+
      (gMem&&gP!==null?'<span class="badge" style="background:rgba(52,211,153,.1);color:var(--gr)">💰 Growth '+gP+'%</span>':'')+
    '</div>';
    var stepsHtml=steps.map(function(s){
      return'<div class="mct-step '+(s.urgent?'urgent':'normal')+'">'+
        '<div class="mct-step-hdr">'+
          '<div class="mct-step-num">'+s.n+'</div>'+
          '<span style="font-size:16px">'+s.ico+'</span>'+
          '<span class="mct-step-title">'+s.title+'</span>'+
          '<span class="mct-step-time">'+s.time+'</span>'+
        '</div>'+
        s.lines.map(function(l){
          var ico=l.t==='script'?'💬':l.t==='action'?'':l.t==='note'?'→':'';
          var cls='mct-line'+(l.t==='script'?' script':l.t==='action'?' action':'');
          return'<div class="'+cls+'"><span class="mct-line-ico">'+ico+'</span><span>'+esc(l.v)+'</span></div>';
        }).join('')+
      '</div>';
    }).join('');

    _mctText=txt;
    document.getElementById('mct-title').textContent='💬 MC TALK — '+name;
    document.getElementById('mct-sub').textContent=today+' · ทีม '+(m.mentor||'—')+' · '+tlL(m.bniTl)+' Zone';
    document.getElementById('mct-body').innerHTML=summHtml+stepsHtml;
    document.getElementById('mct-modal').style.display='flex';
  }catch(e){toast('MCT Error: '+e.message,'err');}
}
function copyMCT(){
  if(!_mctText){toast('ไม่มีข้อมูล','err');return;}
  navigator.clipboard.writeText(_mctText).then(function(){toast('Copy MC TALK แล้ว 📋','ok');}).catch(function(){toast('ไม่สามารถ Copy ได้','err');});
}
// ── Tab Switching ─────────────────────────────────
function findTabButtonForSection(id,group){
  var tabs=document.querySelectorAll('#'+group+'-tabs .tb');
  for(var i=0;i<tabs.length;i++){
    var attr=tabs[i].getAttribute('onclick')||'';
    if(attr.indexOf("'"+id+"'")>=0||attr.indexOf('"'+id+'"')>=0)return tabs[i];
  }
  return null;
}
function sw(id,btn,group){
  group=group||((String(id||'').indexOf('gr-')===0)?'gr':'mc');
  var sec=document.getElementById(id);
  if(!sec){
    console.warn('[dashboard] section not found:',id);
    if(typeof toast==='function')toast('ไม่พบหน้า '+id,'err');
    return;
  }
  btn=btn||findTabButtonForSection(id,group);
  document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('on');});
  document.querySelectorAll('#'+group+'-tabs .tb').forEach(function(b){b.classList.remove('on');});
  sec.classList.add('on');
  if(btn&&btn.classList)btn.classList.add('on');
  ld(false);
  if(id==='gr-dec'&&typeof renderTrendSection==='function')renderTrendSection();
}

// ── Tab Fold (collapse/expand left sidebar) ──────────────
function toggleTabFold(group){
  var tabs=document.getElementById(group+'-tabs');
  if(!tabs)return;
  var folded=tabs.classList.toggle('folded');
  var app=document.getElementById('app');
  if(app)app.classList.toggle('tabs-folded',folded);
  var foldBtn=document.getElementById(group+'-fold-btn');
  if(foldBtn)foldBtn.textContent=folded?'»':'☰';
  try{localStorage.setItem('tabFold_'+group,folded?'1':'0');}catch(e){}
}
function restoreTabFold(group){
  try{
    // Make sure app doesn't carry over folded class from previous role
    var app=document.getElementById('app');
    if(app)app.classList.remove('tabs-folded');
    var tabs=document.getElementById(group+'-tabs');
    if(tabs)tabs.classList.remove('folded');
    if(localStorage.getItem('tabFold_'+group)==='1')toggleTabFold(group);
  }catch(e){}
}

// ── Utils ─────────────────────────────────────────
function tlK(tl){return tl==='green'?'gr':tl==='yellow'?'ye':tl==='red'?'re':tl==='blue'?'bl':'gy';}
function tlL(tl){return tl==='green'?'GREEN':tl==='yellow'?'YELLOW':tl==='red'?'RED':tl==='blue'?'BLUE':'N/A';}
function tlC(tl){return tl==='green'?'var(--gr)':tl==='yellow'?'var(--ye)':tl==='red'?'var(--re)':tl==='blue'?'#60a5fa':'#6b7280';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ── Member Success Blueprint (MSB) ───────────────────────────
var MSB={mc:{loaded:false,rows:[],summary:null,overview:null,intelRows:[],radar:null,pairs:null,followups:null,dataQuality:null,year:new Date().getFullYear()},gr:{loaded:false,rows:[],summary:null,overview:null,intelRows:[],radar:null,pairs:null,followups:null,dataQuality:null,year:new Date().getFullYear()}};
function msbMoney(v){v=Number(v)||0;if(v>=1000000)return '฿'+(v/1000000).toFixed(v>=10000000?0:1)+'M';if(v>=1000)return '฿'+Math.round(v/1000)+'K';return '฿'+Math.round(v).toLocaleString('th-TH');}
function msbNum(v,d){v=Number(v)||0;return v.toLocaleString('th-TH',{maximumFractionDigits:d==null?1:d});}
function msbYearSelect(group){
  var id=group==='gr'?'msb-gr-year':'msb-mc-year';
  var el=document.getElementById(id);if(!el||el.options.length)return;
  var y=new Date().getFullYear();
  for(var i=-1;i<=2;i++){var o=document.createElement('option');o.value=String(y+i);o.textContent=String(y+i);if(i===0)o.selected=true;el.appendChild(o);}
}
function msbStatusLabel(s){
  if(s==='submitted')return '<span style="color:var(--gr);font-weight:800">✅ submitted</span>';
  if(s==='draft')return '<span style="color:var(--ye);font-weight:800">📝 draft</span>';
  return '<span style="color:var(--sub);font-weight:800">— missing</span>';
}
function msbLinkStatusLabel(s){
  if(s==='saved')return '<span style="color:var(--gr);font-weight:800">✅ saved</span>';
  if(s==='link_created')return '<span style="color:var(--ye);font-weight:800">🔗 link created</span>';
  return '<span style="color:var(--sub);font-weight:800">ยังไม่สร้างลิงก์</span>';
}
function msbIntelStatusLabel(s){
  var cfg={
    no_plan:['ยังไม่กรอก','var(--sub)','📝'],
    no_actual_data:['ไม่มี Actual','var(--ye)','⏳'],
    on_track:['On Track','var(--gr)','✅'],
    behind:['Behind','var(--ye)','⚠️'],
    critical:['Critical','var(--re)','🚨']
  }[s]||[s||'—','var(--sub)','•'];
  return '<span style="color:'+cfg[1]+';font-weight:900">'+cfg[2]+' '+esc(cfg[0])+'</span>';
}
function msbCanManageLinks(){return S&&(S.role==='mc'||S.role==='growth');}
function msbGenerateLink(memberId,group){
  group=group==='gr'?'gr':'mc';
  var year=MSB[group]&&MSB[group].year||new Date().getFullYear();
  gsr('generateMemberSuccessBlueprintLink',{role:S.role,memberId:memberId,blueprintYear:year},function(r){
    if(!r||!r.ok){toast('สร้างลิงก์ไม่สำเร็จ: '+(r&&r.error||'unknown'));return;}
    var link=r.link||'';
    function done(){toast('คัดลอกลิงก์ Blueprint แล้ว');MSB[group].loaded=false;msbLoad(group,true);}
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(done).catch(function(){prompt('คัดลอกลิงก์นี้',link);done();});
    }else{
      prompt('คัดลอกลิงก์นี้',link);done();
    }
  });
}
function msbLoad(group,force){
  group=group==='gr'?'gr':'mc';
  msbYearSelect(group);
  var yEl=document.getElementById(group==='gr'?'msb-gr-year':'msb-mc-year');
  var year=Number(yEl&&yEl.value)||new Date().getFullYear();
  if(MSB[group].loaded&&!force&&MSB[group].year===year){msbRender(group);return;}
  var table=document.getElementById(group==='gr'?'msb-gr-table':'msb-mc-table');
  if(table)table.innerHTML='<div style="text-align:center;padding:36px;color:var(--sub)">⏳ กำลังโหลด Blueprint...</div>';
  MSB[group].year=year;
  gsr('getMSBDashboardBundle',{role:S.role,blueprintYear:year},function(b){
    if(b&&b.ok){
      MSB[group].rows=b.rows||[];
      MSB[group].summary=b.summary||null;
      MSB[group].overview=b.overview||null;
      MSB[group].intelRows=(b.planVsActual&&b.planVsActual.rows)||b.rowsPlan||[];
      MSB[group].radar=b.radar||null;
      MSB[group].pairs=b.matching||null;
      MSB[group].followups=b.followups||null;
      MSB[group].dataQuality=b.dataQuality||null;
      MSB[group].loaded=true;
      msbRender(group);
      return;
    }
    console.warn('[MSB] bundle fallback:',b&&b.error);
    msbLoadLegacy(group,year,table);
  });
}
function msbLoadLegacy(group,year,table){
  gsr('getMemberSuccessBlueprintsForDashboard',{role:S.role,blueprintYear:year},function(r){
    if(!r||!r.ok){if(table)table.innerHTML='<div style="padding:26px;color:var(--re)">โหลดข้อมูลไม่สำเร็จ: '+esc(r&&r.error||'unknown')+'</div>';return;}
    MSB[group].rows=r.rows||[];
    gsr('getMemberSuccessBlueprintSummary',{role:S.role,blueprintYear:year},function(s){
      MSB[group].summary=(s&&s.ok)?s.summary:null;
      gsr('getMSBIntelligenceOverview',{role:S.role,blueprintYear:year},function(o){
        MSB[group].overview=(o&&o.ok)?o.overview:null;
        gsr('getMSBPlanVsActual',{role:S.role,blueprintYear:year},function(pa){
          MSB[group].intelRows=(pa&&pa.ok)?(pa.rows||[]):[];
          gsr('getMSBSupportRadar',{role:S.role,blueprintYear:year},function(rd){
            MSB[group].radar=(rd&&rd.ok)?rd.radar:null;
            gsr('getMSBPairMatchingSuggestions',{role:S.role,blueprintYear:year},function(pm){
              MSB[group].pairs=(pm&&pm.ok)?pm.matching:null;
              gsr('getMSBFollowUpQueue',{role:S.role},function(fq){
                MSB[group].followups=(fq&&fq.ok)?fq.queue:{error:(fq&&fq.error)||'โหลด Follow-up Queue ไม่สำเร็จ'};
                MSB[group].dataQuality=null;
                MSB[group].loaded=true;
                msbRender(group);
              });
            });
          });
        });
      });
    });
  });
}
function msbSummaryCard(label,value,sub,color){
  return '<div class="kc"><div class="kl">'+esc(label)+'</div><div class="kv" style="color:'+(color||'var(--tx)')+'">'+value+'</div><div style="font-size:11px;color:var(--sub);margin-top:6px">'+esc(sub||'')+'</div></div>';
}
function msbActionBtn(label,fn,color){
  return '<button class="bsm" onclick="'+esc(fn)+'" style="font-size:10px;padding:5px 8px;border-color:'+color+';color:'+color+'">'+label+'</button>';
}
function msbCreateTask(team,memberName,taskType,note,priority){
  if(!team||!memberName){toast('ข้อมูลทีม/สมาชิกไม่ครบ','err');return;}
  gsr('createGrowthTask',{role:S.role,teamName:team,memberName:memberName,taskType:taskType||'MSB Follow-up',priority:priority||'🎯',note:note||''},function(r){
    if(r&&r.ok){toast('สร้าง Growth Task แล้ว','ok');try{gsr('getGrowthTasks',{statusFilter:'all'},function(r2){if(r2&&r2.ok){G.tasks=r2.tasks||[];updateBadges&&updateBadges();}});}catch(e){}}
    else toast('สร้าง Task ไม่สำเร็จ: '+(r&&r.error||'unknown'),'err');
  });
}
function msbCreateCoreIssue(memberName,issue,plan){
  if(!memberName||!issue){toast('ข้อมูลสมาชิก/ประเด็นไม่ครบ','err');return;}
  if(!confirm('สร้าง Core Issue ให้ '+memberName+' ใช่ไหม?'))return;
  gsr('saveCoreIssue',{role:S.role,memberName:memberName,issue:issue,actionPlan:plan||''},function(r){
    if(r&&r.ok){toast('สร้าง Core Issue แล้ว','ok');try{updateBadges&&updateBadges();}catch(e){}}
    else toast('สร้าง Core Issue ไม่สำเร็จ: '+(r&&r.error||'unknown'),'err');
  });
}
function msbCopyText(text,label){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text||'').then(function(){toast('Copy '+(label||'ข้อความ')+' แล้ว','ok');}).catch(function(){prompt('คัดลอกข้อความนี้',text||'');});
  }else prompt('คัดลอกข้อความนี้',text||'');
}
function msbReloadAfterAction(group){
  group=group==='gr'?'gr':'mc';
  MSB[group].loaded=false;
  msbLoad(group,true);
  try{updateBadges&&updateBadges();}catch(e){}
  try{gsr('getGrowthTasks',{statusFilter:'all'},function(r){if(r&&r.ok){G.tasks=r.tasks||[];updateBadges&&updateBadges();}});}catch(e){}
  try{loadReports&&loadReports();}catch(e){}
}
function msbCloseFollowUp(type,id,group){
  group=group==='gr'?'gr':'mc';
  if(!id){toast('ไม่พบรหัสรายการ','err');return;}
  if(type==='growth_task'){
    if(!confirm('Mark Growth Task นี้ว่าเสร็จแล้วใช่ไหม?'))return;
    gsr('respondGrowthTask',{role:S.role,taskId:id,response:'Followed up from MSB Queue'},function(r){
      if(r&&r.ok){toast('ปิด Growth Task แล้ว','ok');msbReloadAfterAction(group);}
      else toast('ปิด Task ไม่สำเร็จ: '+(r&&r.error||'unknown'),'err');
    });
    return;
  }
  if(type==='core_issue'){
    if(S.role!=='mc'){toast('ปิด Core Issue ได้เฉพาะ MC','err');return;}
    if(!confirm('ปิด Core Issue นี้เป็น done/resolved ใช่ไหม?'))return;
    gsr('setReportStatus',{role:S.role,row:id,status:'done'},function(r){
      if(r&&r.ok){toast('ปิด Core Issue แล้ว','ok');msbReloadAfterAction(group);}
      else toast('ปิด Core Issue ไม่สำเร็จ: '+(r&&r.error||'unknown'),'err');
    });
  }
}
function msbFollowUpRender(group){
  var wrap=document.getElementById(group==='gr'?'msb-gr-followups':'msb-mc-followups');
  if(!wrap)return;
  var data=MSB[group]&&MSB[group].followups;
  if(!data){wrap.innerHTML='';return;}
  if(data.error){
    wrap.innerHTML='<div style="background:var(--sf);border:1px solid rgba(248,113,113,.35);border-radius:14px;padding:14px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      +'<div><h3 style="font-size:14px;font-weight:900;margin:0;color:var(--re)">📌 Follow-up Due Queue</h3><div style="font-size:11px;color:var(--sub);margin-top:3px">กล่องนี้มีแล้ว แต่โหลดข้อมูลค้างงานไม่สำเร็จ</div></div>'
      +'<button class="bsm" onclick="msbLoad('+JSON.stringify(group)+',true)" style="font-size:11px">🔄 ลองใหม่</button></div>'
      +'<div style="font-size:12px;color:var(--re);margin-top:12px;border-top:1px solid var(--bd);padding-top:12px">'+esc(data.error)+'</div>'
      +'</div>';
    return;
  }
  var sm=data.summary||{}, items=data.items||[];
  var targetLabel=group==='mc'?'Unified Follow-up Inbox':'Growth Tasks';
  var targetAction=group==='mc'?"openActionCenter('inbox')":"sw('gr-task',null,'gr');renderTasks()";
  wrap.innerHTML='<div style="background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
    +'<div><h3 style="font-size:14px;font-weight:900;margin:0">📌 Follow-up Summary</h3>'
    +'<div style="font-size:11px;color:var(--sub);margin-top:3px">MSB ไม่แสดง queue ซ้ำแล้ว — งานค้างทั้งหมดให้จัดการที่ '+esc(targetLabel)+' เพื่อไม่ให้ข้อมูลตกหล่นหลายที่</div></div>'
    +'<button class="bsm" onclick="'+targetAction+'" style="font-size:11px;background:var(--ac);color:#000;border-color:transparent;font-weight:800">เปิด '+esc(targetLabel)+' ▸</button>'
    +'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
    +'<span style="font-size:11px;background:rgba(248,113,113,.12);color:var(--re);border:1px solid rgba(248,113,113,.28);border-radius:999px;padding:5px 9px;font-weight:800">Overdue '+msbNum(sm.overdue||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(199,167,106,.12);color:var(--ye);border:1px solid rgba(199,167,106,.28);border-radius:999px;padding:5px 9px;font-weight:800">Soon '+msbNum(sm.dueSoon||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(96,165,250,.12);color:var(--bl);border:1px solid rgba(96,165,250,.28);border-radius:999px;padding:5px 9px;font-weight:800">Issues '+msbNum(sm.coreIssues||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(0,212,170,.12);color:var(--gr);border:1px solid rgba(0,212,170,.28);border-radius:999px;padding:5px 9px;font-weight:800">Tasks '+msbNum(sm.growthTasks||0,0)+'</span>'
    +'</div>'
    +(items.length?'<div style="font-size:11px;color:var(--sub);line-height:1.6;margin-top:10px">มีรายการค้าง '+msbNum(items.length,0)+' รายการในระบบกลาง แนะนำให้ปิดงานจากที่เดียวเพื่อกันสถานะไม่ตรงกัน</div>':'<div style="font-size:12px;color:var(--sub);margin-top:10px">✅ ไม่มี Follow-up ที่ค้างอยู่ตอนนี้</div>')
    +'</div>';
  return;
  function levelMeta(level){
    if(level==='overdue')return ['เลยกำหนด','var(--re)','🚨'];
    if(level==='due_soon')return ['ใกล้ถึงกำหนด','var(--ye)','⏳'];
    return ['Open','var(--sub)','•'];
  }
  function itemCard(x){
    var lv=levelMeta(x.level), isTask=x.type==='growth_task', member=x.memberName||x.nickname||'—';
    var dateText=x.followUpAt?('Follow-up '+String(x.followUpAt).slice(0,10)):('เปิดมา '+msbNum(x.ageDays||0,0)+' วัน');
    return '<div style="border-top:1px solid var(--bd);padding:10px 0">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'
      +'<div style="min-width:0"><div style="font-size:12px;font-weight:900">'+esc(x.icon||'📌')+' '+esc(member)+'</div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc(x.team||'—')+' · '+(isTask?'Growth Task':'Core Issue')+' · '+esc(dateText)+'</div></div>'
      +'<span style="font-size:10px;color:'+lv[1]+';font-weight:900;white-space:nowrap">'+lv[2]+' '+lv[0]+'</span></div>'
      +'<div style="font-size:11px;color:var(--tx);line-height:1.5;margin-top:7px">'+esc(x.title||'')+'</div>'
      +(x.detail?'<div style="font-size:10px;color:var(--sub);line-height:1.5;margin-top:4px">'+esc(x.detail).slice(0,220)+'</div>':'')
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      +(x.memberName?msbActionBtn('📊 เปิดสมาชิก','openIMD('+JSON.stringify(x.memberName)+')','var(--ac)'):'')
      +(isTask&&x.canClose?msbActionBtn('✅ Task Done','msbCloseFollowUp('+JSON.stringify(x.type)+','+JSON.stringify(x.id)+','+JSON.stringify(group)+')','var(--gr)'):'')
      +(!isTask&&x.canClose?msbActionBtn('✅ Close Issue','msbCloseFollowUp('+JSON.stringify(x.type)+','+JSON.stringify(x.id)+','+JSON.stringify(group)+')','var(--gr)'):'')
      +'</div>'
      +'</div>';
  }
  wrap.innerHTML='<div style="background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    +'<div><h3 style="font-size:14px;font-weight:900;margin:0">📌 Follow-up Due Queue</h3><div style="font-size:11px;color:var(--sub);margin-top:3px">รวม Core Issue และ Growth Task ที่ยังค้าง เพื่อให้ Mentor/Growth ไม่ตกหล่นงานสำคัญ</div></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<span style="font-size:11px;background:rgba(248,113,113,.12);color:var(--re);border:1px solid rgba(248,113,113,.28);border-radius:999px;padding:5px 9px;font-weight:800">Overdue '+msbNum(sm.overdue||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(199,167,106,.12);color:var(--ye);border:1px solid rgba(199,167,106,.28);border-radius:999px;padding:5px 9px;font-weight:800">Soon '+msbNum(sm.dueSoon||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(96,165,250,.12);color:var(--bl);border:1px solid rgba(96,165,250,.28);border-radius:999px;padding:5px 9px;font-weight:800">Issues '+msbNum(sm.coreIssues||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(0,212,170,.12);color:var(--gr);border:1px solid rgba(0,212,170,.28);border-radius:999px;padding:5px 9px;font-weight:800">Tasks '+msbNum(sm.growthTasks||0,0)+'</span>'
    +'</div></div>'
    +(items.length?'<div class="row2">'+items.slice(0,8).map(itemCard).join('')+'</div>':'<div style="font-size:12px;color:var(--sub);padding:18px;border-top:1px solid var(--bd)">ไม่มี Follow-up ที่ค้างอยู่ตอนนี้ — หน้า dashboard หายใจโล่งขึ้นนิดนึงครับ</div>')
    +'</div>';
}
function msbDataQualityRender(group){
  var wrap=document.getElementById(group==='gr'?'msb-gr-data-quality':'msb-mc-data-quality');
  if(!wrap)return;
  var dq=MSB[group]&&MSB[group].dataQuality;
  if(!dq){wrap.innerHTML='';return;}
  var sm=dq.summary||{}, issues=dq.issues||[];
  function levelMeta(level){
    if(level==='critical')return ['ต้องรีบปิด','var(--re)','🚨'];
    if(level==='warning')return ['ควรเติม','var(--ye)','⚠️'];
    return ['ช่วยให้แม่นขึ้น','var(--bl)','ℹ️'];
  }
  function issueCard(x){
    var lv=levelMeta(x.level);
    return '<div style="border-top:1px solid var(--bd);padding:10px 0">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'
      +'<div style="min-width:0"><div style="font-size:12px;font-weight:900">'+esc(x.nickname||x.name||'—')+'</div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc(x.mentorTeam||'—')+'</div></div>'
      +'<span style="font-size:10px;color:'+lv[1]+';font-weight:900;white-space:nowrap">'+lv[2]+' '+lv[0]+'</span></div>'
      +'<div style="font-size:11px;color:var(--tx);line-height:1.5;margin-top:7px;font-weight:800">'+esc(x.title||'')+'</div>'
      +'<div style="font-size:10px;color:var(--sub);line-height:1.5;margin-top:4px">'+esc(x.detail||'')+'</div>'
      +'<div style="font-size:10px;color:var(--ac);line-height:1.5;margin-top:6px">Next: '+esc(x.nextAction||'เติมข้อมูลให้ครบ')+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      +(x.name?msbActionBtn('📊 เปิดสมาชิก','openIMD('+JSON.stringify(x.name)+')','var(--ac)'):'')
      +(x.type==='missing_link'&&msbCanManageLinks()?msbActionBtn('🔗 Copy Link','msbGenerateLink('+JSON.stringify(x.memberId)+','+JSON.stringify(group)+')','var(--ye)'):'')
      +(x.level!=='info'?msbActionBtn('⚡ Task','msbCreateTask('+JSON.stringify(x.mentorTeam||'')+','+JSON.stringify(x.name||'')+','+JSON.stringify('MSB Data Quality')+','+JSON.stringify((x.title||'')+' · '+(x.nextAction||''))+','+JSON.stringify(x.level==='critical'?'🚨':'🧹')+')','var(--ye)'):'')
      +'</div>'
      +'</div>';
  }
  wrap.innerHTML='<div style="background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    +'<div><h3 style="font-size:14px;font-weight:900;margin:0">🧹 Data Quality Center</h3><div style="font-size:11px;color:var(--sub);margin-top:3px">จุดที่ควรเติมข้อมูล เพื่อให้ Growth / Mentor จับคู่และติดตามได้แม่นขึ้น</div></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<span style="font-size:11px;background:rgba(248,113,113,.12);color:var(--re);border:1px solid rgba(248,113,113,.28);border-radius:999px;padding:5px 9px;font-weight:800">Critical '+msbNum(sm.critical||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(199,167,106,.12);color:var(--ye);border:1px solid rgba(199,167,106,.28);border-radius:999px;padding:5px 9px;font-weight:800">Warning '+msbNum(sm.warning||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(96,165,250,.12);color:var(--bl);border:1px solid rgba(96,165,250,.28);border-radius:999px;padding:5px 9px;font-weight:800">Info '+msbNum(sm.info||0,0)+'</span>'
    +'</div></div>'
    +(issues.length?'<div class="row2">'+issues.slice(0,8).map(issueCard).join('')+'</div>':'<div style="font-size:12px;color:var(--sub);padding:18px;border-top:1px solid var(--bd)">ข้อมูลหลักพร้อมใช้งานครับ — ตอนนี้ระบบมีวัตถุดิบพอสำหรับการช่วยจับคู่และ follow-up</div>')
    +'</div>';
}
function msbRadarRender(group){
  var wrap=document.getElementById(group==='gr'?'msb-gr-radar':'msb-mc-radar');
  if(!wrap)return;
  var radar=MSB[group]&&MSB[group].radar;
  if(!radar){wrap.innerHTML='';return;}
  var sm=radar.summary||{}, lanes=radar.lanes||{};
  function item(x){
    var cats=(x.lookingForCategories||[]).slice(0,2).concat((x.powerTeamCategories||[]).slice(0,1)).filter(Boolean);
    return '<div style="border-top:1px solid var(--bd);padding:9px 0">'
      +'<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between">'
      +'<div><b style="font-size:12px">'+esc(x.nickname||x.name||'—')+'</b><span style="font-size:10px;color:var(--sub)"> · '+esc(x.mentorTeam||'—')+'</span>'
      +(x.profession||x.companyName?'<div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc([x.profession,x.companyName].filter(Boolean).join(' · '))+'</div>':'')
      +'</div><span style="font-size:10px;color:'+tlC(x.trafficLight)+';font-weight:900">'+tlL(x.trafficLight)+'</span></div>'
      +'<div style="font-size:11px;color:var(--tx);line-height:1.5;margin-top:6px">'+esc(x.reason||'')+'</div>'
      +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-top:4px">Next: '+esc(x.nextAction||x.suggestedSupport||'ติดตามต่อ')+'</div>'
      +(cats.length?'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">'+cats.map(function(c){return '<span style="font-size:9px;border:1px solid var(--bd);border-radius:999px;padding:2px 6px;color:var(--sub)">'+esc(c)+'</span>';}).join('')+'</div>':'')
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      +msbActionBtn('⚡ Task','msbCreateTask('+JSON.stringify(x.mentorTeam||'')+','+JSON.stringify(x.name||'')+','+JSON.stringify('MSB Radar')+','+JSON.stringify((x.reason||'')+' · Next: '+(x.nextAction||x.suggestedSupport||''))+','+JSON.stringify(x.lane==='urgent'?'🚨':'🎯')+')','var(--ye)')
      +(x.lane==='urgent'?msbActionBtn('📋 Core Issue','msbCreateCoreIssue('+JSON.stringify(x.name||'')+','+JSON.stringify(x.reason||'MSB / Growth follow-up needed')+','+JSON.stringify(x.nextAction||x.suggestedSupport||'')+')','var(--re)'):'')
      +'</div>'
      +'</div>';
  }
  function lane(title,subtitle,items,color){
    return '<div class="cc"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px">'
      +'<div><div class="cct" style="color:'+color+'">'+esc(title)+'</div><div style="font-size:10px;color:var(--sub);line-height:1.4">'+esc(subtitle)+'</div></div>'
      +'<b style="color:'+color+'">'+(items||[]).length+'</b></div>'
      +((items||[]).length?(items||[]).slice(0,4).map(item).join(''):'<div style="font-size:12px;color:var(--sub);padding:14px 0;border-top:1px solid var(--bd)">ยังไม่มีรายการในกลุ่มนี้</div>')
      +'</div>';
  }
  wrap.innerHTML='<div style="background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    +'<div><h3 style="font-size:14px;font-weight:900;margin:0">🧭 Member Support Radar</h3><div style="font-size:11px;color:var(--sub);margin-top:3px">ระบบช่วยจัดลำดับว่า Mentor/Growth ควรช่วยใครก่อน และช่วยเรื่องอะไร</div></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<span style="font-size:11px;background:rgba(248,113,113,.12);color:var(--re);border:1px solid rgba(248,113,113,.28);border-radius:999px;padding:5px 9px;font-weight:800">Urgent '+msbNum(sm.urgentCount||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(199,167,106,.12);color:var(--ye);border:1px solid rgba(199,167,106,.28);border-radius:999px;padding:5px 9px;font-weight:800">Growth '+msbNum(sm.growthActionCount||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(0,212,170,.12);color:var(--gr);border:1px solid rgba(0,212,170,.28);border-radius:999px;padding:5px 9px;font-weight:800">Match '+msbNum(sm.matchingReadyCount||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(96,165,250,.12);color:var(--bl);border:1px solid rgba(96,165,250,.28);border-radius:999px;padding:5px 9px;font-weight:800">Profession '+msbNum(sm.professionCoveragePercent||0,0)+'%</span>'
    +'</div></div>'
    +'<div class="row2">'
    +lane('🚨 Help First','ต้องช่วยก่อนเพราะยังไม่มีแผนหรือ gap สูง',lanes.urgent,'var(--re)')
    +lane('🌱 Growth Actions','ควรให้ Growth ช่วยออกแบบ action 30 วัน',lanes.growth,'var(--ye)')
    +lane('🤝 Ready to Match','พร้อมจับคู่ 1-2-1 / Power Circle',lanes.matching,'var(--gr)')
    +lane('🧹 Data Quality','เติมข้อมูลเพื่อให้ matching แม่นขึ้น',lanes.dataQuality,'var(--bl)')
    +'</div></div>';
}
function msbPairsRender(group){
  var wrap=document.getElementById(group==='gr'?'msb-gr-pairs':'msb-mc-pairs');
  if(!wrap)return;
  var data=MSB[group]&&MSB[group].pairs;
  if(!data){wrap.innerHTML='';return;}
  var sm=data.summary||{}, pairs=data.pairs||[];
  function conf(p){
    if(p.confidence==='high')return ['High','var(--gr)','✅'];
    if(p.confidence==='medium')return ['Medium','var(--ye)','⚠️'];
    return ['Low','var(--sub)','•'];
  }
  function memberBox(m,label){
    return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:12px;padding:10px;min-width:0">'
      +'<div style="font-size:9px;color:var(--sub);font-weight:900;text-transform:uppercase;letter-spacing:.05em">'+esc(label)+'</div>'
      +'<div style="font-size:13px;font-weight:900;margin-top:3px">'+esc(m.nickname||m.name||'—')+'</div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc([m.mentorTeam,m.profession,m.companyName].filter(Boolean).join(' · ')||'—')+'</div>'
      +(m.lookingForCategories&&m.lookingForCategories.length?'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px">'+m.lookingForCategories.slice(0,2).map(function(c){return '<span style="font-size:9px;border:1px solid var(--bd);border-radius:999px;padding:2px 6px;color:var(--sub)">'+esc(c)+'</span>';}).join('')+'</div>':'')
      +'</div>';
  }
  function pairCard(p){
    var c=conf(p), terms=(p.matchedTerms||[]).slice(0,4);
    return '<div class="cc" style="overflow:hidden">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px">'
      +'<div class="cct">🤝 Suggested 1-2-1</div>'
      +'<span style="font-size:10px;color:'+c[1]+';font-weight:900;border:1px solid var(--bd);border-radius:999px;padding:3px 8px">'+c[2]+' '+c[0]+' · '+msbNum(p.score,0)+'</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:stretch">'
      +memberBox(p.source||{},'คนที่ต้องการโอกาส')
      +'<div style="display:grid;place-items:center;color:var(--ye);font-weight:900">→</div>'
      +memberBox(p.target||{},'คนที่น่าคุยด้วย')
      +'</div>'
      +'<div style="font-size:11px;color:var(--tx);line-height:1.55;margin-top:10px">'+(p.reasons||[]).map(esc).join('<br>')+'</div>'
      +(terms.length?'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">'+terms.map(function(t){return '<span style="font-size:9px;background:rgba(199,167,106,.12);border:1px solid rgba(199,167,106,.28);border-radius:999px;padding:2px 6px;color:var(--ye)">'+esc(t)+'</span>';}).join('')+'</div>':'')
      +'<details style="margin-top:9px;font-size:11px;color:var(--sub);line-height:1.55"><summary style="cursor:pointer;color:var(--ye);font-weight:900">หัวข้อคุย 1-2-1</summary><ol style="margin:7px 0 0 18px;padding:0">'+(p.suggestedAgenda||[]).map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ol></details>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">'
      +msbActionBtn('⚡ สร้าง Task','msbCreateTask('+JSON.stringify((p.source&&p.source.mentorTeam)||'')+','+JSON.stringify((p.source&&p.source.name)||'')+','+JSON.stringify('1-2-1 Matching')+','+JSON.stringify('แนะนำ 1-2-1 กับ '+((p.target&&p.target.nickname)||(p.target&&p.target.name)||'สมาชิกที่ match')+' · '+(p.reasons||[]).join(' / '))+','+JSON.stringify('🤝')+')','var(--ye)')
      +msbActionBtn('📋 Copy Agenda','msbCopyText('+JSON.stringify((p.suggestedAgenda||[]).join('\\n'))+','+JSON.stringify('Agenda')+')','var(--ac)')
      +'</div>'
      +'</div>';
  }
  wrap.innerHTML='<div style="background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:14px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    +'<div><h3 style="font-size:14px;font-weight:900;margin:0">🤝 Pair Matching Engine</h3><div style="font-size:11px;color:var(--sub);margin-top:3px">แนะนำคู่ 1-2-1 จาก MSB Looking For / Power Team + อาชีพและบริษัทใน roster</div></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<span style="font-size:11px;background:rgba(0,212,170,.12);color:var(--gr);border:1px solid rgba(0,212,170,.28);border-radius:999px;padding:5px 9px;font-weight:800">High '+msbNum(sm.highConfidence||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(199,167,106,.12);color:var(--ye);border:1px solid rgba(199,167,106,.28);border-radius:999px;padding:5px 9px;font-weight:800">Medium '+msbNum(sm.mediumConfidence||0,0)+'</span>'
    +'<span style="font-size:11px;background:rgba(96,165,250,.12);color:var(--bl);border:1px solid rgba(96,165,250,.28);border-radius:999px;padding:5px 9px;font-weight:800">Pairs '+msbNum(sm.pairCount||0,0)+'</span>'
    +'</div></div>'
    +(pairs.length?'<div class="row2">'+pairs.slice(0,6).map(pairCard).join('')+'</div>':'<div style="font-size:12px;color:var(--sub);padding:18px;border-top:1px solid var(--bd)">ยังไม่มีคู่ที่ระบบมั่นใจพอ ลองเติม profession / company / Looking For / Power Team ให้ครบขึ้น</div>')
    +'</div>';
}
function msbRender(group){
  group=group==='gr'?'gr':'mc';
  var state=MSB[group], rows=(state.rows||[]).slice(), sm=state.summary||{}, ov=state.overview||{};
  var intelById={};
  (state.intelRows||[]).forEach(function(x){if(x&&x.memberId)intelById[x.memberId]=x;});
  var qEl=document.getElementById(group==='gr'?'msb-gr-search':'msb-mc-search');
  var teamEl=document.getElementById('msb-gr-team');
  var q=(qEl&&qEl.value||'').toLowerCase().trim();
  var team=group==='gr'?(teamEl&&teamEl.value||''):'';
  rows=rows.filter(function(r){
    var b=r.blueprint||{};
    var hay=[r.name,r.nickname,r.mentorTeam,b.looking_for_detail,b.power_team_detail,b.personal_goal_category].join(' ').toLowerCase();
    return (!q||hay.indexOf(q)>=0)&&(!team||r.mentorTeam===team);
  });
  var sumEl=document.getElementById(group==='gr'?'msb-gr-summary':'msb-mc-summary');
  if(sumEl){
    sumEl.innerHTML=[
      msbSummaryCard('Completion',msbNum(ov.completionPercent!=null?ov.completionPercent:sm.completionPct,0)+'%','submitted '+(ov.submittedCount!=null?ov.submittedCount:(sm.submitted||0))+' / '+(ov.totalMembers!=null?ov.totalMembers:(sm.totalMembers||0)),'var(--gr)'),
      msbSummaryCard('Total MSB BNI Goal',msbMoney(ov.totalMsbBniGoal!=null?ov.totalMsbBniGoal:(sm.totalExpectedSalesFromBni||0)),'PLAN จาก Blueprint','var(--ye)'),
      msbSummaryCard('Total Actual Received',msbMoney(ov.totalActualReceived||0),'ACTUAL จาก members.received_thb','var(--gr)'),
      msbSummaryCard('Revenue Gap',msbMoney(ov.totalRevenueGap||0),'MSB Goal - Actual Received','var(--re)'),
      msbSummaryCard('Referral Needed',msbNum(ov.totalReferralNeeded!=null?ov.totalReferralNeeded:(sm.totalReferralDemand||0),0),'PLAN ใบต่อปีรวม','var(--ac)'),
      msbSummaryCard('Referral Received',msbNum(ov.totalReferralReceived||0,0),'ACTUAL จาก R2Y RR','#a78bfa')
    ].join('');
  }
  var intelEl=document.getElementById(group==='gr'?'msb-gr-intel':'msb-mc-intel');
  if(intelEl){
    var sc=ov.statusCounts||{};
    function statPill(k,label,color){return '<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--bd);padding:8px 0;font-size:12px"><span style="color:'+color+';font-weight:800">'+esc(label)+'</span><b>'+msbNum(sc[k]||0,0)+'</b></div>';}
    function topBox(title,items){
      return '<div class="cc"><div class="cct">'+esc(title)+'</div>'+((items||[]).length?(items||[]).map(function(x){return '<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--bd);padding:8px 0;font-size:12px"><span>'+esc(x.name)+'</span><b>'+x.count+'</b></div>';}).join(''):'<div style="color:var(--sub);font-size:12px;padding:16px 0">ยังไม่มีข้อมูล</div>')+'</div>';
    }
    intelEl.innerHTML=
      '<div class="cc"><div class="cct">Status Counts</div>'
      +statPill('on_track','✅ On Track','var(--gr)')
      +statPill('behind','⚠️ Behind','var(--ye)')
      +statPill('critical','🚨 Critical','var(--re)')
      +statPill('no_plan','📝 No Plan','var(--sub)')
      +'</div>'
      +topBox('Top Looking For',ov.topLookingForCategories||sm.topLookingForCategories)
      +topBox('Top Power Team',ov.topPowerTeamCategories||sm.topPowerTeamCategories);
  }
  if(group==='gr'){
    var tops=document.getElementById('msb-gr-tops');
    if(tops){
      function topBox(title,items){
        return '<div class="cc"><div class="cct">'+esc(title)+'</div>'+((items||[]).length?(items||[]).map(function(x){return '<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--bd);padding:8px 0;font-size:12px"><span>'+esc(x.name)+'</span><b>'+x.count+'</b></div>';}).join(''):'<div style="color:var(--sub);font-size:12px;padding:16px 0">ยังไม่มีข้อมูล</div>')+'</div>';
      }
      tops.innerHTML=topBox('Top Looking For',sm.topLookingForCategories)+topBox('Top Power Team',sm.topPowerTeamCategories);
    }
  }
  msbDataQualityRender(group);
  msbFollowUpRender(group);
  msbRadarRender(group);
  msbPairsRender(group);
  var canLink=msbCanManageLinks();
  var html='<table class="tbl" style="min-width:1680px"><thead><tr><th>สมาชิก</th><th>ทีม</th><th>MSB Goal</th><th>Actual Received</th><th>Revenue Progress</th><th>Revenue Gap</th><th>Referral Needed/Received</th><th>Referral Progress</th><th>Referral Gap</th><th>Looking For</th><th>Power Team</th><th>Intelligence Status</th><th>Suggested Support</th><th>Blueprint</th><th>Link</th>'+(canLink?'<th>Action</th>':'')+'</tr></thead><tbody>';
  if(!rows.length){
    html+='<tr><td colspan="'+(canLink?16:15)+'" style="text-align:center;color:var(--sub);padding:28px">ยังไม่มีข้อมูลตาม filter นี้</td></tr>';
  }else{
    rows.forEach(function(r){
      var b=r.blueprint||{};
      var it=intelById[r.memberId]||{};
      var looking=(b.looking_for_categories||[]).slice(0,3).join(', ');
      var power=(b.power_team_categories||[]).slice(0,3).join(', ');
      var revPct=Number(it.revenueProgressPercent)||0, refPct=Number(it.referralProgressPercent)||0;
      var revColor=revPct>=70?'var(--gr)':revPct>=40?'var(--ye)':'var(--re)';
      var refColor=refPct>=70?'var(--gr)':refPct>=40?'var(--ye)':'var(--re)';
      html+='<tr>'+
        '<td><b>'+esc(r.nickname||r.name)+'</b><div style="font-size:10px;color:var(--sub)">'+esc(r.name||'')+'</div></td>'+
        '<td>'+esc(r.mentorTeam||'—')+'</td>'+
        '<td>'+msbMoney((it.msbGoal!=null?it.msbGoal:r.bniGoal)||0)+'<div style="font-size:9px;color:var(--sub);margin-top:2px">MSB Goal</div></td>'+
        '<td>'+msbMoney(it.actualReceived||0)+'<div style="font-size:9px;color:var(--sub);margin-top:2px">members.received_thb</div></td>'+
        '<td><b style="color:'+revColor+'">'+msbNum(revPct,1)+'%</b></td>'+
        '<td>'+msbMoney(it.revenueGap||0)+'</td>'+
        '<td>'+msbNum(it.referralNeeded||b.referral_needed,0)+' / '+msbNum(it.referralReceived||0,0)+'<div style="font-size:9px;color:var(--sub);margin-top:2px">Needed / R2Y RR</div></td>'+
        '<td><b style="color:'+refColor+'">'+msbNum(refPct,1)+'%</b></td>'+
        '<td>'+msbNum(it.referralGap||0,0)+'</td>'+
        '<td><div style="max-width:190px;white-space:normal">'+esc(looking||'—')+'<div style="font-size:10px;color:var(--sub);line-height:1.5">'+esc(b.looking_for_detail||'')+'</div></div></td>'+
        '<td><div style="max-width:180px;white-space:normal">'+esc(power||'—')+'<div style="font-size:10px;color:var(--sub);line-height:1.5">'+esc(b.power_team_detail||'')+'</div></div></td>'+
        '<td>'+msbIntelStatusLabel(it.status)+'</td>'+
        '<td><div style="max-width:260px;white-space:normal;line-height:1.5">'+esc(it.suggestedSupport||'—')+'</div></td>'+
        '<td>'+msbStatusLabel(r.status)+'</td>'+
        '<td>'+msbLinkStatusLabel(r.linkStatus)+'</td>'+
        (canLink?'<td><button class="btn small" onclick="msbGenerateLink(\''+esc(r.memberId)+'\',\''+group+'\')">🔗 Copy Link</button></td>':'')+
      '</tr>';
    });
  }
  html+='</tbody></table>';
  var table=document.getElementById(group==='gr'?'msb-gr-table':'msb-mc-table');
  if(table)table.innerHTML=html;
}

// ── Growth Revenue Dashboard ──────────────────────────────────
var _rvData=null,_rvLoaded=false,_rvSort={col:-1,asc:true},_rvFilter={team:'',q:''},_rvLibrary=null;

function rvLoad(){
  if(_rvLoaded&&_rvData){
    document.getElementById('rv-loading').style.display='none';
    document.getElementById('rv-content').style.display='block';
    rvBuildTeamFilter();
    rvRender();
    rvLoadLibrary();
    return;
  }
  document.getElementById('rv-loading').style.display='block';
  document.getElementById('rv-content').style.display='none';
  gsr('getGrowthSheetData',{role:S.role},function(r){
    if(!r||!r.ok){
      document.getElementById('rv-loading').innerHTML='<span style="color:var(--re)">❌ '+(r&&r.error||'โหลดไม่ได้')+'</span>';
      return;
    }
    _rvData=r;_rvLoaded=true;
    // Sync with gshData too
    _gshData=r;_gshLoaded=true;
    document.getElementById('rv-loading').style.display='none';
    document.getElementById('rv-content').style.display='block';
    rvBuildTeamFilter();
    rvRender();
    rvLoadLibrary();
  });
}

function rvFmt(n){
  if(!n&&n!==0)return '—';
  n=parseFloat(n)||0;
  if(n>=1000000)return (n/1000000).toFixed(2).replace(/\.?0+$/,'')+'M';
  if(n>=1000)return (n/1000).toFixed(0)+'K';
  return n.toLocaleString();
}

function rvPctColor(p){return p>=80?'var(--gr)':p>=50?'var(--ye)':'var(--re)';}
function rvGoalBadge(src){
  if(src==='msb')return '<div style="font-size:9px;color:var(--ye);font-weight:900;margin-top:2px">MSB active</div>';
  if(src==='legacy')return '<div style="font-size:9px;color:var(--sub);font-weight:800;margin-top:2px">Legacy baseline</div>';
  if(src==='msb_fallback')return '<div style="font-size:9px;color:var(--ye);font-weight:800;margin-top:2px">MSB fallback</div>';
  return '<div style="font-size:9px;color:var(--sub);font-weight:800;margin-top:2px">No goal</div>';
}
function rvReviewBadge(m){
  if(m.blueprintStatus==='missing')return '<span style="color:var(--sub);font-weight:800">📝 No MSB</span>';
  if(m.goalReviewStatus==='reviewed')return '<span style="color:var(--gr);font-weight:900">✅ Reviewed</span>';
  if(m.goalReviewStatus==='needs_revision')return '<span style="color:var(--re);font-weight:900">↩ Needs Revision</span>';
  if(m.goalReviewNeeded)return '<span style="color:var(--ye);font-weight:900">⚠️ Review Goal</span><div style="font-size:9px;color:var(--sub);margin-top:2px">MSB ต่างจากเดิม '+(m.goalDeltaPct>0?'+':'')+(m.goalDeltaPct||0)+'%</div>';
  if(m.activeGoalSource==='msb')return '<span style="color:var(--gr);font-weight:900">✅ MSB Ready</span>';
  return '<span style="color:var(--sub);font-weight:800">Baseline</span>';
}
function rvQualityBadge(m){
  var score=Number(m.dataQualityScore)||0, grade=m.dataQualityGrade||'weak';
  var color=score>=85?'var(--gr)':score>=65?'var(--ye)':score>=45?'var(--ye)':'var(--re)';
  var label=grade==='excellent'?'Excellent':grade==='good'?'Good':grade==='needs_work'?'Needs work':'Weak';
  var miss=(m.dataQualityMissing||[]).slice(0,2).join(', ');
  return '<span class="rv-pill" style="color:'+color+';border-color:'+color+'">'+score+' · '+label+'</span>'+(miss?'<div style="font-size:9px;color:var(--sub);margin-top:3px;white-space:normal;max-width:150px">เติม: '+esc(miss)+'</div>':'');
}
function rvSaveReview(memberId,status){
  var note='';
  if(status==='needs_revision')note=prompt('หมายเหตุให้สมาชิก/ทีมแก้เป้า:', '')||'';
  gsr('saveGrowthGoalReview',{role:S.role,memberId:memberId,status:status,note:note},function(r){
    if(!r||!r.ok){toast('บันทึก review ไม่สำเร็จ: '+(r&&r.error||'unknown'),'err');return;}
    toast(status==='reviewed'?'บันทึกว่า review แล้ว':'บันทึกว่าให้แก้เป้าแล้ว','ok');
    _rvLoaded=false;rvLoad();
  });
}
function rvLoadLibrary(){
  gsr('getMSBCategoryLibrary',{role:S.role},function(r){
    if(!r||!r.ok)return;
    _rvLibrary=r;
    rvRenderLibrary();
  });
}
function rvRenderLibrary(){
  var el=document.getElementById('rv-library');if(!el||!_rvLibrary)return;
  var cats=_rvLibrary.categories||{};
  function box(type,title,items){
    items=(items||[]).slice(0,8);
    return '<div class="rv-lib-box"><div style="font-size:12px;font-weight:900;margin-bottom:8px">'+esc(title)+'</div>'
      +(items.length?items.map(function(x){
        var raws=(x.raw||[]).filter(function(r){return r!==x.name;}).slice(0,3);
        return '<div class="rv-lib-row"><div><b>'+esc(x.name)+'</b> <span style="color:var(--sub)">· '+x.count+'</span>'
          +(raws.length?'<div style="font-size:10px;color:var(--sub);margin-top:2px">alias: '+esc(raws.join(', '))+'</div>':'')+'</div>'
          +'<button onclick="rvAddAlias('+JSON.stringify(type)+','+JSON.stringify(x.name)+')">+ alias</button></div>';
      }).join(''):'<div style="color:var(--sub);font-size:12px;padding:8px 0">ยังไม่มีข้อมูล</div>')
      +'</div>';
  }
  el.style.display='block';
  el.innerHTML='<div class="rv-lib-head"><div class="rv-lib-title">🧹 Category Library <span style="color:var(--sub);font-weight:500">รวมคำซ้ำให้ Matching อ่านง่ายขึ้น</span></div><button class="bsm" onclick="rvLoadLibrary()" style="font-size:11px">↺</button></div>'
    +'<div class="rv-lib-grid">'+box('looking_for','Top Looking For',cats.looking_for)+box('power_team','Top Power Team',cats.power_team)+'</div>';
}
function rvAddAlias(type,canonical){
  var alias=prompt('คำสะกดอื่นที่อยากรวมเข้า "'+canonical+'"', '');
  if(!alias)return;
  gsr('saveMSBCategoryAlias',{role:S.role,categoryType:type,canonicalCategory:canonical,alias:alias},function(r){
    if(!r||!r.ok){toast('บันทึก alias ไม่สำเร็จ: '+(r&&r.error||'unknown'),'err');return;}
    toast('บันทึก alias แล้ว','ok');
    rvLoadLibrary();
  });
}

function rvBuildTeamFilter(){
  var tf=document.getElementById('rv-tf-team');
  var prev=tf.value;
  tf.innerHTML='<option value="">ทุกทีม</option>';
  (_rvData.groups||[]).forEach(function(g){
    var o=document.createElement('option');
    o.value=g.name;o.textContent=g.name;
    tf.appendChild(o);
  });
  tf.value=prev;
}

function rvFilterTeam(v){_rvFilter.team=v;rvRenderTable();}
function rvSearch(v){_rvFilter.q=v.trim().toLowerCase();rvRenderTable();}

function rvRender(){
  if(!_rvData)return;
  var s=_rvData.summary;
  var pc=s.pct>=80?'var(--gr)':s.pct>=50?'var(--ye)':'var(--re)';
  var completion=s.memberCount?Math.round((s.submittedBlueprints||0)/s.memberCount*100):0;

  // Hero KPI cards
  document.getElementById('rv-hero').innerHTML=
    rvKpi('🎯','Active Goal',rvFmt(s.totalTarget),'#c7a76a','MSB ถ้ามี / Legacy ถ้ายังไม่มี')
    +rvKpi('💰','Actual Received',rvFmt(s.totalReceived),'var(--gr)','รายได้ที่รับจริงในระบบ Growth')
    +rvKpi('📊','Progress',s.pct+'%',pc,'Actual / Active Goal')
    +rvKpi('📝','MSB Completion',completion+'%','#a78bfa',(s.submittedBlueprints||0)+' / '+(s.memberCount||0)+' คน')
    +rvKpi('📚','Legacy Baseline',rvFmt(s.totalLegacyTarget||0),'#94a3b8','เป้าเดิมก่อนมี MSB')
    +rvKpi('✨','MSB Goal Total',rvFmt(s.totalMsbGoal||0),'#fbbf24','เป้าใหม่จากสมาชิก')
    +rvKpi('📉','Revenue Gap',rvFmt(s.revenueGap||0),'var(--re)','Active Goal - Actual')
    +rvKpi('⚠️','Need Review',(s.reviewNeeded||0)+' คน','var(--ye)','MSB ต่างจาก Legacy ≥30%')
    +rvKpi('🧹','Data Quality',(s.avgDataQuality||0)+'/100','#38bdf8','ความพร้อมของข้อมูลต่อสมาชิก')
    +rvKpi('✅','Reviewed',(s.reviewedGoals||0)+' คน','#34d399','เป้าที่ Growth/MC ตรวจแล้ว');

  // Chapter progress bar
  document.getElementById('rv-prog-wrap').innerHTML=
    '<div class="rv-prog-top">'
    +'<span class="rv-prog-title">Chapter Growth Plan Progress</span>'
    +'<span class="rv-prog-pct" style="color:'+pc+';">'+s.pct+'% · '+rvFmt(s.totalReceived)+' / '+rvFmt(s.totalTarget)+'</span>'
    +'</div>'
    +'<div class="rv-prog-bar">'
    +'<div class="rv-prog-fill" style="background:'+pc+';width:'+Math.min(s.pct,100)+'%;"></div>'
    +'</div>';

  // Team cards
  document.getElementById('rv-teams').innerHTML=(_rvData.groups||[]).map(function(g){
    var gR=g.totalRow?g.totalRow.received:g.members.reduce(function(a,m){return a+m.received;},0);
    var gT=g.totalRow?g.totalRow.target:g.members.reduce(function(a,m){return a+m.target;},0);
    var gP=gT>0?Math.round(gR/gT*100):0;
    var gc=rvPctColor(gP);
    var revNeed=g.totalRow?g.totalRow.reviewNeeded:0;
    var msbCnt=g.totalRow?g.totalRow.submittedBlueprints:0;
    return '<div class="rv-team-card" style="cursor:pointer;" onclick="document.getElementById(\'rv-tf-team\').value=\''+esc(g.name)+'\';rvFilterTeam(\''+esc(g.name)+'\')">'
      +'<div class="rv-tc-name">'+esc(g.name)+'</div>'
      +'<div class="rv-tc-meta">'+g.members.length+' คน · '+rvFmt(gR)+' / '+rvFmt(gT)+' · MSB '+msbCnt+'</div>'
      +'<div class="rv-tc-bar"><div class="rv-tc-fill" style="background:'+gc+';width:'+Math.min(gP,100)+'%;"></div></div>'
      +'<div class="rv-tc-pct" style="color:'+gc+';">'+gP+'%'+(revNeed?'<span style="float:right;color:var(--ye);font-size:10px">⚠️ '+revNeed+'</span>':'')+'</div>'
      +'</div>';
  }).join('');

  rvRenderTable();
}

function rvKpi(icon,lbl,val,color,sub){
  return '<div class="rv-kpi" style="--rv-accent:'+color+';">'
    +'<div style="font-size:20px;margin-bottom:4px;">'+icon+'</div>'
    +'<div class="rv-kpi-val">'+val+'</div>'
    +'<div class="rv-kpi-lbl">'+lbl+'</div>'
    +'<div class="rv-kpi-sub">'+sub+'</div>'
    +'</div>';
}

function rvRenderTable(){
  if(!_rvData)return;

  // Collect all members matching filter
  var all=[];
  (_rvData.groups||[]).forEach(function(g){
    if(_rvFilter.team&&g.name!==_rvFilter.team)return;
    var gi2=(_rvData.groups||[]).indexOf(g);
    g.members.forEach(function(m){all.push(Object.assign({},m,{_group:g.name,_gi:gi2}));});
  });

  // Search filter
  if(_rvFilter.q){
    var q=_rvFilter.q;
    all=all.filter(function(m){
      return (m.name&&m.name.toLowerCase().indexOf(q)!==-1)||
             (m.nick&&m.nick.toLowerCase().indexOf(q)!==-1);
    });
  }

  // Sort
  if(_rvSort.col!==-1){
    var sc=_rvSort.col;
    var asc=_rvSort.asc;
    all.sort(function(a,b){
      var av,bv;
      if(sc===-2){av=a.nick||a.name||'';bv=b.nick||b.name||'';}
      else if(sc===-3){av=a._group||'';bv=b._group||'';}
      else if(sc===-4){av=a.legacyTarget||0;bv=b.legacyTarget||0;}
      else if(sc===-5){av=a.msbGoal||0;bv=b.msbGoal||0;}
      else if(sc===-6){av=a.activeGoal||a.target||0;bv=b.activeGoal||b.target||0;}
      else if(sc===-7){av=a.received||0;bv=b.received||0;}
      else if(sc===-8){av=a.pct||0;bv=b.pct||0;}
      else if(sc===-9){av=a.gap||0;bv=b.gap||0;}
      else if(sc===-10){av=a.goalReviewNeeded?1:0;bv=b.goalReviewNeeded?1:0;}
      else{av=a.cells&&a.cells[sc]!==undefined?a.cells[sc]:0;bv=b.cells&&b.cells[sc]!==undefined?b.cells[sc]:0;}
      var an=parseFloat(av),bn=parseFloat(bv);
      if(!isNaN(an)&&!isNaN(bn)){return asc?an-bn:bn-an;}
      return asc?String(av).localeCompare(String(bv),'th'):String(bv).localeCompare(String(av),'th');
    });
  }

  // Show add button if group-filtered
  var addBtn=document.getElementById('rv-add-global-btn');
  if(addBtn)addBtn.style.display=_rvFilter.team?'inline-flex':'none';

  document.getElementById('rv-cnt').textContent=all.length+' รายการ';

  // Build header row
  var thHtml='<th style="width:36px;text-align:center;">#</th>';
  thHtml+='<th onclick="rvSortBy(-2,this)">ชื่อ / นิคเนม</th>';
  thHtml+='<th onclick="rvSortBy(-3,this)">ทีม</th>';
  thHtml+='<th onclick="rvSortBy(-4,this)">Legacy Target</th>';
  thHtml+='<th onclick="rvSortBy(-5,this)">MSB Goal</th>';
  thHtml+='<th onclick="rvSortBy(-6,this)">Active Goal</th>';
  thHtml+='<th onclick="rvSortBy(-7,this)">Actual</th>';
  thHtml+='<th onclick="rvSortBy(-8,this)">Progress</th>';
  thHtml+='<th onclick="rvSortBy(-9,this)">Gap</th>';
  thHtml+='<th>Looking For</th>';
  thHtml+='<th>Power Team</th>';
  thHtml+='<th>Data Quality</th>';
  thHtml+='<th onclick="rvSortBy(-10,this)">Review</th>';
  thHtml+='<th style="width:50px;"></th>';
  document.getElementById('rv-thead').innerHTML='<tr>'+thHtml+'</tr>';

  // Build body
  var rows=all.map(function(m,idx){
    var mP=m.target>0?Math.round(m.received/m.target*100):0;
    var mc2=rvPctColor(mP);
    var dn=m.nick&&m.nick!==m.name?m.nick:m.name;
    var looking=(m.lookingForCategories||[]).slice(0,2).join(', ');
    var power=(m.powerTeamCategories||[]).slice(0,2).join(', ');

    var tdHtml='<td style="color:var(--sub);text-align:center;font-size:11px;">'+(idx+1)+'</td>';
    tdHtml+='<td><div style="font-weight:600;font-size:13px;">'+esc(dn)+'</div>'
      +(m.nick&&m.nick!==m.name?'<div style="font-size:10px;color:var(--sub);">'+esc(m.name)+'</div>':'')
      +'</td>';
    tdHtml+='<td style="color:var(--sub);">'+esc(m._group)+'</td>';
    tdHtml+='<td style="color:var(--sub)">'+rvFmt(m.legacyTarget||0)+'<div style="font-size:9px;color:var(--sub);margin-top:2px">old baseline</div></td>';
    tdHtml+='<td>'+(m.msbGoal?rvFmt(m.msbGoal):'—')+'<div style="font-size:9px;color:var(--ye);font-weight:800;margin-top:2px">'+(m.blueprintStatus==='submitted'?'submitted':'not submitted')+'</div></td>';
    tdHtml+='<td><b>'+rvFmt(m.activeGoal||m.target||0)+'</b>'+rvGoalBadge(m.activeGoalSource||m.targetSource)+'</td>';
    tdHtml+='<td><span style="font-weight:800;color:'+mc2+'">'+rvFmt(m.received||0)+'</span></td>';
    tdHtml+='<td><div class="rv-pbar"><div class="rv-pbar-f" style="background:'+mc2+';width:'+Math.min(mP,100)+'%;"></div></div> <span style="font-size:11px;color:'+mc2+';font-weight:800">'+mP+'%</span></td>';
    tdHtml+='<td>'+rvFmt(m.gap||0)+'</td>';
    tdHtml+='<td><div style="max-width:180px;white-space:normal;line-height:1.35">'+esc(looking||'—')+'<div style="font-size:9px;color:var(--sub)">'+esc((m.lookingForDetail||'').slice(0,64))+'</div></div></td>';
    tdHtml+='<td><div style="max-width:180px;white-space:normal;line-height:1.35">'+esc(power||'—')+'<div style="font-size:9px;color:var(--sub)">'+esc((m.powerTeamDetail||'').slice(0,64))+'</div></div></td>';
    tdHtml+='<td>'+rvQualityBadge(m)+'</td>';
    tdHtml+='<td>'+rvReviewBadge(m)+(m.memberId&&m.goalReviewNeeded?'<div><button class="rv-action" onclick="rvSaveReview(\''+esc(m.memberId)+'\',\'reviewed\')">Mark reviewed</button><br><button class="rv-action" onclick="rvSaveReview(\''+esc(m.memberId)+'\',\'needs_revision\')">Needs revision</button></div>':'')+'</td>';
    tdHtml+='<td><button class="rv-edt" onclick="gshOpenEdit('+m._gi+',\''+m.sheetRow+'\');document.getElementById(\'gsh-modal\').classList.add(\'open\')">✏️</button></td>';
    return '<tr>'+tdHtml+'</tr>';
  }).join('');

  document.getElementById('rv-tbody').innerHTML=rows||'<tr><td colspan="20" style="text-align:center;padding:20px;color:var(--sub);">ไม่พบข้อมูล</td></tr>';
}

function rvSortBy(col,th){
  if(_rvSort.col===col){_rvSort.asc=!_rvSort.asc;}
  else{_rvSort.col=col;_rvSort.asc=true;}
  document.querySelectorAll('#rv-thead th').forEach(function(t){t.classList.remove('sort-asc','sort-desc');});
  th.classList.add(_rvSort.asc?'sort-asc':'sort-desc');
  rvRenderTable();
}

function rvOpenAdd(groupName){
  // Find group index
  var gi=0;
  if(groupName){
    gi=0;
    for(var gi3=0;gi3<(_rvData.groups||[]).length;gi3++){if(_rvData.groups[gi3].name===groupName){gi=gi3;break;}}
    if(gi<0)gi=0;
  }
  gshOpenAdd(gi);
}

// ══════════════════════════════════════════════════════════════
// GROWTH SYSTEM v2 JS
// ══════════════════════════════════════════════════════════════
function fmtBig(v){return v>=1000000000?(v/1000000000).toFixed(2)+'B':v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'K':String(Math.round(v||0));}
function fmtMon(v){return v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'K':String(Math.round(v||0));}

// ── 🎯 Command Center ─────────────────────────────────────────
var _cmdData=null,_cmdLoaded=false;
function cmdLoad(force){
  if(_cmdLoaded&&!force)return;
  _cmdLoaded=true;
  document.getElementById('cmd-content').innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)">⏳ กำลังโหลด...</div>';
  gsr('getChapterRevenue',{role:S.role},function(r){
    if(!r.ok){document.getElementById('cmd-content').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _cmdData=r;
    if(r.chapterGoal) document.getElementById('cmd-goal-input').value=r.chapterGoal;
    renderCMD(r);
  });
}
function cmdSetGoal(){
  var g=parseFloat(document.getElementById('cmd-goal-input').value)||0;
  if(!g){toast('❌ ใส่เป้าหมาย','err');return;}
  gsr('setChapterGoal',{role:S.role,goal:g},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ ตั้งเป้า '+fmtBig(g)+' แล้ว','ok');
    _cmdLoaded=false;cmdLoad();
  });
}
function renderCMD(r){
  var el=document.getElementById('cmd-content');
  var pct=r.chapterPct||0;
  var barC=pct>=100?'var(--gr)':pct>=75?'var(--gr)':pct>=50?'var(--ye)':'var(--re)';
  var tlC2={G:'var(--gr)',Y:'var(--ye)',R:'var(--re)','':"var(--sub)"};

  // Milestones
  var mHTML=(r.milestones||[]).map(function(m){
    return '<div style="text-align:center;padding:8px 12px;border-radius:8px;background:'+(m.reached?'rgba(52,211,153,.15)':'var(--sf2)')+';border:1px solid '+(m.reached?'var(--gr)':'var(--bd)')+';">'
      +'<div style="font-size:16px">'+m.emoji+'</div>'
      +'<div style="font-size:11px;font-weight:700;color:'+(m.reached?'var(--gr)':'var(--sub)')+'">'+m.label+'</div>'
      +(m.reached?'<div style="font-size:9px;color:var(--gr)">✅ ถึงแล้ว</div>':'<div style="font-size:9px;color:var(--sub)">ยังไม่ถึง</div>')
      +'</div>';
  }).join('');

  // Team cards
  var tHTML=(r.teams||[]).map(function(t){
    var tp=t.chapterPct||0;
    var tc=tp>=100?'var(--gr)':tp>=75?'var(--gr)':tp>=50?'var(--ye)':'var(--re)';
    return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:14px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:6px">'+esc(t.team)+'<span style="font-size:10px;color:var(--sub);font-weight:400;margin-left:6px">'+t.memberCount+' คน · '+t.allocPct+'%</span></div>'
      +'<div style="font-size:10px;color:var(--sub);margin-bottom:6px">เป้า Chapter: <b style="color:var(--tx)">฿'+fmtBig(t.chapterTarget)+'</b></div>'
      +'<div style="background:var(--bg3);border-radius:4px;height:6px;overflow:hidden;margin-bottom:6px"><div style="height:100%;width:'+Math.min(100,tp)+'%;background:'+tc+';border-radius:4px;transition:width .5s"></div></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:10px">'
      +'<span style="color:'+tc+'">'+fmtBig(t.teamRecv)+' ('+tp+'%)</span>'
      +'<span style="color:var(--sub)">ขาด ฿'+fmtBig(t.gap)+'</span></div>'
      +'</div>';
  }).join('');

  // Top performers
  var topHTML=(r.topPerformers||[]).map(function(m,i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd)">'
      +'<span style="font-size:12px;color:var(--sub);width:18px">'+(i+1)+'</span>'
      +'<span style="font-size:13px;font-weight:600;flex:1">'+esc(m.nick||m.firstName||'')+'</span>'
      +'<span style="font-size:10px;color:var(--sub)">'+esc(m.team||'')+'</span>'
      +'<span style="font-size:12px;font-weight:700;color:var(--gr)">฿'+fmtMon(m.recv||0)+'</span>'
      +'</div>';
  }).join('');

  // Need attention
  var needHTML=(r.needAttention||[]).map(function(m){
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd)">'
      +'<span style="font-size:13px;font-weight:600;flex:1">'+esc(m.nick||m.firstName||'')+'</span>'
      +'<span style="font-size:10px;color:var(--sub)">'+esc(m.team||'')+'</span>'
      +'<span style="font-size:11px;color:var(--re)">'+Math.round(m.goalPct||0)+'%</span>'
      +'<span style="font-size:10px;color:var(--sub)">/ ฿'+fmtMon(m.bniGoal||0)+'</span>'
      +'</div>';
  }).join('');

  el.innerHTML=
    // Hero
    '<div style="background:linear-gradient(135deg,rgba(60,120,80,.15),rgba(52,211,153,.1));border:1px solid rgba(60,120,80,.3);border-radius:14px;padding:20px;margin-bottom:20px">'
    +'<div style="font-size:11px;color:var(--sub);margin-bottom:4px">🏆 Chapter Revenue Goal</div>'
    +'<div style="font-size:32px;font-weight:900;color:'+barC+'">'+pct+'%</div>'
    +'<div style="font-size:12px;color:var(--sub);margin-bottom:10px">฿'+fmtBig(r.totalRecv)+' / ฿'+fmtBig(r.chapterGoal)+'</div>'
    +'<div style="background:var(--bd);border-radius:6px;height:10px;overflow:hidden;margin-bottom:12px"><div style="height:100%;width:'+Math.min(100,pct)+'%;background:'+barC+';border-radius:6px;transition:width .8s"></div></div>'
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'
    +'<div style="text-align:center"><div style="font-size:11px;color:var(--sub)">ขาด</div><div style="font-size:14px;font-weight:700;color:var(--re)">฿'+fmtBig(r.gap||0)+'</div></div>'
    +'<div style="text-align:center"><div style="font-size:11px;color:var(--sub)">Run Rate/เดือน</div><div style="font-size:14px;font-weight:700;color:var(--ac)">฿'+fmtMon(r.runRate||0)+'</div></div>'
    +'<div style="text-align:center"><div style="font-size:11px;color:var(--sub)">คาดการณ์ EOY</div><div style="font-size:14px;font-weight:700;color:'+(r.projectedPct>=100?'var(--gr)':'var(--ye)')+'">'+r.projectedPct+'%</div></div>'
    +'<div style="text-align:center"><div style="font-size:11px;color:var(--sub)">เหลืออีก</div><div style="font-size:14px;font-weight:700">'+r.mRemain+' เดือน</div></div>'
    +'</div></div>'
    // Milestones
    +'<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;margin-bottom:10px">🏁 Milestones</div>'
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'+mHTML+'</div></div>'
    // Teams
    +'<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;margin-bottom:10px">📊 Power Team Progress</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">'+tHTML+'</div></div>'
    // Top + Need Attention
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
    +'<div><div style="font-size:12px;font-weight:700;margin-bottom:8px">🌟 Top Performers</div>'+topHTML+'</div>'
    +'<div><div style="font-size:12px;font-weight:700;margin-bottom:8px">⚠️ ต้องช่วยเหลือ</div>'+needHTML+'</div>'
    +'</div>';
}

// ── 🔗 Cross-Team ─────────────────────────────────────────────
var _crossData=null,_crossLoaded=false;
function crossLoad(force){
  if(_crossLoaded&&!force)return; _crossLoaded=true;
  document.getElementById('cross-content').innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)">⏳ กำลังโหลด...</div>';
  gsr('getCrossTeamSynergy',{role:S.role},function(r){
    if(!r.ok){document.getElementById('cross-content').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _crossData=r; renderCross(r);
  });
}
function renderCross(r){
  var el=document.getElementById('cross-content');
  var stClr={pending:'var(--ye)',done:'var(--gr)','in-progress':'var(--ac)',cancelled:'var(--sub)'};
  var stLabel={pending:'รอ 1-2-1',done:'✅ เสร็จแล้ว','in-progress':'🔄 กำลังดำเนินการ',cancelled:'ยกเลิก'};
  var tlC3={G:'var(--gr)',Y:'var(--ye)',R:'var(--re)','':"var(--sub)"};

  // Saved pairs
  var savedHTML=(r.savedPairs||[]).length?'<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;margin-bottom:10px">📌 คู่ที่ Assign แล้ว ('+r.savedPairs.length+')</div>'
    +(r.savedPairs||[]).map(function(p){
      var sc=stClr[p.status]||'var(--sub)';
      return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        +'<span style="font-weight:600">'+esc(p.nick1)+'</span><span style="color:var(--sub)">'+esc(p.team1)+'</span>'
        +'<span style="color:var(--sub)">↔️</span>'
        +'<span style="font-weight:600">'+esc(p.nick2)+'</span><span style="color:var(--sub)">'+esc(p.team2)+'</span>'
        +'<select onchange="crossUpdateStatus('+p.row+',this.value)" style="margin-left:auto;background:transparent;border:1px solid '+sc+';color:'+sc+';border-radius:6px;padding:2px 6px;font-size:11px;outline:none">'
        +['pending','in-progress','done','cancelled'].map(function(s){return '<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+stLabel[s]+'</option>';}).join('')
        +'</select>'
        +'<button onclick="crossDelete('+p.row+')" style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:var(--re);border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer">🗑️</button>'
        +'</div>';
    }).join('')+'</div>':'' ;

  // Recommendations
  var recHTML=(r.recommendations||[]).filter(function(x){return !x.isSaved;}).slice(0,15).map(function(rec){
    var scoreC=rec.score>=60?'var(--gr)':rec.score>=40?'var(--ye)':'var(--sub)';
    var reasons=rec.reasons||[];
    var safeN1=String(rec.nick1||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var safeN2=String(rec.nick2||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var safeT1=String(rec.team1||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var safeT2=String(rec.team2||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
      +'<div style="flex:1"><span style="font-weight:600">'+esc(rec.nick1)+'</span> <span style="font-size:10px;color:var(--sub)">'+esc(rec.team1)+'</span></div>'
      +'<span style="color:var(--sub);font-size:12px">↔️</span>'
      +'<div style="flex:1;text-align:right"><span style="font-weight:600">'+esc(rec.nick2)+'</span> <span style="font-size:10px;color:var(--sub)">'+esc(rec.team2)+'</span></div>'
      +'<span style="font-size:11px;font-weight:700;color:'+scoreC+'">Score: '+rec.score+'</span>'
      +'</div>'
      +(reasons.length?'<div style="font-size:10px;color:var(--ac);margin-bottom:8px">💡 '+reasons.join(' · ')+'</div>':'')
      +'<div style="display:flex;gap:6px">'
      +'<button onclick="crossAssign(\''+safeN1+'\',\''+safeN2+'\',\''+safeT1+'\',\''+safeT2+'\')" style="background:var(--ac-dim);border:1px solid var(--bd-hover);color:var(--ac);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600">📌 Assign 1-2-1</button>'
      +'</div></div>';
  }).join('');

  el.innerHTML=savedHTML
    +'<div><div style="font-size:12px;font-weight:700;margin-bottom:10px">🤖 AI แนะนำ '+((r.recommendations||[]).filter(function(x){return !x.isSaved;}).length)+' คู่</div>'
    +recHTML+'</div>';
}
function crossAssign(n1,n2,t1,t2){
  gsr('saveCrossTeamPair',{role:S.role,nick1:n1,nick2:n2,team1:t1,team2:t2},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ Assign '+n1+' ↔ '+n2+' แล้ว','ok');
    _crossLoaded=false;crossLoad();
  });
}
function crossUpdateStatus(row,val){
  gsr('saveCrossTeamPair',{role:S.role,row:row,field:'status',value:val},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    _crossLoaded=false;crossLoad();
  });
}
function crossDelete(row){
  gsr('saveCrossTeamPair',{role:S.role,row:row,field:'delete'},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ ลบแล้ว','ok'); _crossLoaded=false;crossLoad();
  });
}

// ── 🗓️ Sprint Board ───────────────────────────────────────────
var _sprintData=null,_sprintLoaded=false;
function sprintLoad(force){
  if(_sprintLoaded&&!force)return; _sprintLoaded=true;
  document.getElementById('sprint-content').innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)">⏳ กำลังโหลด...</div>';
  gsr('getSprintBoard',{role:S.role},function(r){
    if(!r.ok){document.getElementById('sprint-content').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _sprintData=r; renderSprint(r);
  });
}
function renderSprint(r){
  var el=document.getElementById('sprint-content');
  var now=new Date(); var TH_MONTHS=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var stClr2={pending:'var(--ye)',done:'var(--gr)','in-progress':'var(--ac)'};
  var stLbl2={pending:'รอดำเนินการ',done:'✅ สำเร็จ','in-progress':'🔄 กำลังทำ'};

  // Current sprint highlight
  var curHTML='';
  if((r.currentSprint||[]).length){
    var cur=r.currentSprint[0];
    curHTML='<div style="background:linear-gradient(135deg,rgba(60,120,80,.15),rgba(52,211,153,.08));border:1px solid rgba(60,120,80,.3);border-radius:12px;padding:16px;margin-bottom:20px">'
      +'<div style="font-size:11px;color:var(--ac);font-weight:700;margin-bottom:6px">📅 Sprint เดือนนี้ — '+TH_MONTHS[cur.month-1]+' '+cur.year+'</div>'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:6px">ทีม: '+esc(cur.team||'ทุกทีม')+'</div>'
      +(cur.target>0?'<div style="font-size:12px;margin-bottom:4px">🎯 เป้า: <b>฿'+fmtBig(cur.target)+'</b></div>':'')
      +(cur.focus?'<div style="font-size:11px;color:var(--sub);margin-bottom:4px">👤 Focus: '+esc(cur.focus)+'</div>':'')
      +(cur.pairs?'<div style="font-size:11px;color:var(--sub);margin-bottom:8px">🔗 1-2-1: '+esc(cur.pairs)+'</div>':'')
      +'<select onchange="sprintUpdateStatus(\''+cur.row+'\',this.value)" style="background:transparent;border:1px solid '+(stClr2[cur.status]||'var(--bd)')+';color:'+(stClr2[cur.status]||'var(--tx)')+';border-radius:6px;padding:4px 8px;font-size:11px;outline:none">'
      +['pending','in-progress','done'].map(function(s){return '<option value="'+s+'"'+(cur.status===s?' selected':'')+'>'+stLbl2[s]+'</option>';}).join('')
      +'</select></div>';
  } else {
    curHTML='<div style="background:var(--sf2);border:1px dashed var(--bd);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;color:var(--sub)">'
      +'ยังไม่มี Sprint เดือนนี้ — กด <b>➕ สร้าง Sprint</b> เพื่อเริ่ม</div>';
  }

  var histHTML=(r.sprints||[]).filter(function(s){
    return !(s.year===now.getFullYear()&&s.month===now.getMonth()+1);
  }).reverse().slice(0,12).map(function(s){
    var sc=stClr2[s.status]||'var(--sub)';
    return '<div style="background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:10px 14px;margin-bottom:6px">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      +'<span style="font-size:11px;font-weight:700;color:var(--sub)">'+TH_MONTHS[(s.month||1)-1]+' '+s.year+'</span>'
      +'<span style="font-size:11px;color:var(--tx)">'+esc(s.team||'ทุกทีม')+'</span>'
      +(s.target>0?'<span style="font-size:11px;color:var(--ac)">฿'+fmtBig(s.target)+'</span>':'')
      +'<span style="font-size:10px;font-weight:700;color:'+sc+';margin-left:auto">'+stLbl2[s.status||'pending']+'</span>'
      +'<button onclick="sprintDelete(\''+s.row+'\')" style="background:none;border:none;color:var(--sub);cursor:pointer;font-size:13px;padding:0 4px">🗑️</button>'
      +'</div>'
      +(s.focus?'<div style="font-size:10px;color:var(--sub);margin-top:4px">👤 '+esc(s.focus)+'</div>':'')
      +'</div>';
  }).join('');

  el.innerHTML=curHTML
    +'<div style="font-size:12px;font-weight:700;margin-bottom:10px">📚 ประวัติ Sprint</div>'
    +(histHTML||'<div style="color:var(--sub);font-size:12px">ยังไม่มีประวัติ</div>');
}
function sprintOpenAdd(){
  var teams=(_sprintData&&_sprintData.sprints||[]);
  var now=new Date(); var m=now.getMonth()+1; var y=now.getFullYear();
  var name=prompt('ชื่อทีม (ว่าง = ทุกทีม):','ทุกทีม');if(name===null)return;
  var target=parseFloat(prompt('เป้ารายเดือน (฿):','0')||'0');
  var focus=prompt('สมาชิก Focus (ชื่อ, คั่นด้วย ,):','')||'';
  var pairs=prompt('คู่ 1-2-1 (เช่น นุ่น↔ไผ่):','')||'';
  gsr('saveSprintPlan',{role:S.role,year:y,month:m,team:name||'ทุกทีม',target:target,focus:focus,pairs:pairs},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ สร้าง Sprint แล้ว','ok'); _sprintLoaded=false;sprintLoad();
  });
}
function sprintUpdateStatus(row,val){
  gsr('saveSprintPlan',{role:S.role,row:row,field:'status',value:val},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    _sprintLoaded=false;sprintLoad();
  });
}
function sprintDelete(row){
  gsr('saveSprintPlan',{role:S.role,row:row,field:'delete'},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ ลบแล้ว','ok'); _sprintLoaded=false;sprintLoad();
  });
}

// ── 🌊 Referral Flow ──────────────────────────────────────────
var _flowData=null,_flowLoaded=false;
function flowLoad(force){
  if(_flowLoaded&&!force)return; _flowLoaded=true;
  document.getElementById('flow-content').innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)">⏳ กำลังโหลด...</div>';
  gsr('getReferralFlow',{role:S.role},function(r){
    if(!r.ok){document.getElementById('flow-content').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _flowData=r; renderFlow(r);
  });
}
function renderFlow(r){
  var el=document.getElementById('flow-content');
  var maxFlow=(r.flow||[]).reduce(function(m,f){return Math.max(m,f.refCount);},1);

  // Team stats table
  var tsHTML='<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">'
    +'<thead><tr style="background:var(--sf2)"><th style="padding:8px;text-align:left">ทีม</th><th style="padding:8px;text-align:right">สมาชิก</th><th style="padding:8px;text-align:right">ให้ Ref</th><th style="padding:8px;text-align:right">รับ Ref</th><th style="padding:8px;text-align:right">รับจริง</th></tr></thead><tbody>'
    +(r.teamStats||[]).map(function(t){
      var balance=t.refIn-t.refOut; var bc=balance>0?'var(--gr)':balance<0?'var(--re)':'var(--sub)';
      return '<tr style="border-bottom:1px solid var(--bd)">'
        +'<td style="padding:8px;font-weight:600">'+esc(t.team)+'</td>'
        +'<td style="padding:8px;text-align:right;color:var(--sub)">'+t.memberCount+'</td>'
        +'<td style="padding:8px;text-align:right;color:var(--re)">'+t.refOut+'</td>'
        +'<td style="padding:8px;text-align:right;color:var(--gr)">'+t.refIn+'</td>'
        +'<td style="padding:8px;text-align:right;color:var(--ac)">฿'+fmtMon(t.recv||0)+'</td>'
        +'</tr>';
    }).join('')+'</tbody></table>';

  // Top flow
  var flowHTML=(r.flow||[]).slice(0,10).map(function(f){
    var w=Math.round(f.refCount/maxFlow*100);
    return '<div style="margin-bottom:8px">'
      +'<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">'
      +'<span><b>'+esc(f.fromTeam)+'</b> → <b>'+esc(f.toTeam)+'</b></span>'
      +'<span style="color:var(--ac)">~'+f.refCount+' Ref</span></div>'
      +'<div style="background:var(--bg3);border-radius:3px;height:5px"><div style="height:100%;width:'+w+'%;background:var(--ac);border-radius:3px"></div></div>'
      +'</div>';
  }).join('');

  // Imbalanced
  var imbHTML=(r.imbalanced||[]).length?'<div style="margin-top:20px"><div style="font-size:12px;font-weight:700;margin-bottom:8px">⚠️ Taker (รับเยอะ ให้น้อย — ควร Coach)</div>'
    +(r.imbalanced||[]).map(function(m){
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd)">'
        +'<span style="font-size:12px;font-weight:600;flex:1">'+esc(m.nick||m.firstName||'')+'</span>'
        +'<span style="font-size:10px;color:var(--sub)">'+esc(m.team||'')+'</span>'
        +'<span style="font-size:11px;color:var(--gr)">รับ '+m.refIn+'</span>'
        +'<span style="font-size:11px;color:var(--re)">ให้ '+(m.refOut||0)+'</span>'
        +'</div>';
    }).join('')+'</div>':'';

  el.innerHTML=tsHTML
    +'<div style="font-size:12px;font-weight:700;margin-bottom:10px">🌊 Estimated Referral Flow (top 10)</div>'
    +flowHTML+imbHTML;
}

// ── ⚡ Power Team Manager ─────────────────────────────────────
var _ptMgrData=null,_ptMgrLoaded=false;
function ptLoad(force){
  if(_ptMgrLoaded&&!force)return; _ptMgrLoaded=true;
  document.getElementById('pt-mgr-content').innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)">⏳ กำลังโหลด...</div>';
  gsr('getPTMembers',{role:S.role},function(r){
    if(!r.ok){document.getElementById('pt-mgr-content').innerHTML='<div style="color:var(--re);padding:20px">❌ '+(r.error||'')+'</div>';return;}
    _ptMgrData=r; renderPTMgr(r);
  });
}
function renderPTMgr(r){
  var el=document.getElementById('pt-mgr-content');
  if(!(r.teams||[]).length){
    el.innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)">'
      +'ยังไม่มีข้อมูลใน Sheet ⚡ POWER TEAMS<br><small>กด ➕ เพิ่มสมาชิก เพื่อเริ่ม</small></div>';
    return;
  }
  var tlBadge={'G':'🟢','Y':'🟡','R':'🔴','':''};
  var teamsHTML=(r.teams||[]).map(function(t){
    var memHTML=t.members.map(function(m){
      var safeName=(m.nick||m.firstName||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return '<tr style="border-bottom:1px solid var(--bd)">'
        +'<td style="padding:6px 8px;font-weight:600">'+esc(m.nick||m.firstName||'')+(m.lastName?' '+esc(m.lastName):'')+'</td>'
        +'<td style="padding:6px 8px;font-size:11px;color:var(--sub)">'+esc(m.profession||'—')+'</td>'
        +'<td style="padding:6px 8px;text-align:center">'+(tlBadge[m.tl||'']||'')+'</td>'
        +'<td style="padding:6px 8px;text-align:right;font-size:11px">฿'+fmtMon(m.bniGoal||0)+'</td>'
        +'<td style="padding:6px 8px;text-align:right;font-size:11px;color:var(--gr)">฿'+fmtMon(m.recv||0)+'</td>'
        +'<td style="padding:6px 8px;text-align:right;font-size:11px;color:var(--ac)">'+Math.round(m.goalPct||0)+'%</td>'
        +'<td style="padding:6px 4px;white-space:nowrap">'
        +'<button onclick="ptOpenEdit('+m.row+',\''+esc(t.team)+'\')" style="font-size:11px;background:var(--sf2);border:1px solid var(--bd);border-radius:5px;padding:2px 7px;cursor:pointer;color:var(--tx)">✏️</button> '
        +'<button onclick="ptOpenMove('+m.row+',\''+safeName+'\')" style="font-size:11px;background:var(--sf2);border:1px solid var(--bd);border-radius:5px;padding:2px 7px;cursor:pointer;color:var(--tx)">↩️</button> '
        +'<button onclick="ptDelete('+m.row+',\''+safeName+'\')" style="font-size:11px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:5px;padding:2px 7px;cursor:pointer;color:var(--re)">🗑️</button>'
        +'</td>'
        +'</tr>';
    }).join('');
    var tPct=t.teamGoal>0?Math.round(t.teamRecv/t.teamGoal*100):0;
    return '<div style="margin-bottom:24px">'
      +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
      +'<span style="font-size:13px;font-weight:700">'+esc(t.team)+'</span>'
      +'<span style="font-size:11px;color:var(--sub)">'+t.memberCount+' คน</span>'
      +'<span style="font-size:11px;color:var(--ac)">฿'+fmtBig(t.teamRecv)+' / ฿'+fmtBig(t.teamGoal)+' ('+tPct+'%)</span>'
      +'<button onclick="ptOpenAdd(\''+esc(t.team)+'\')" style="margin-left:auto;font-size:11px;background:rgba(60,120,80,.1);border:1px solid rgba(60,120,80,.3);border-radius:6px;padding:3px 10px;cursor:pointer;color:var(--ac)">➕ เพิ่ม</button>'
      +'</div>'
      +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
      +'<thead><tr style="background:var(--sf2)"><th style="padding:6px 8px;text-align:left">ชื่อ</th><th style="padding:6px 8px;text-align:left">อาชีพ</th><th style="padding:6px 8px;text-align:center">TL</th><th style="padding:6px 8px;text-align:right">เป้า</th><th style="padding:6px 8px;text-align:right">รับจริง</th><th style="padding:6px 8px;text-align:right">%</th><th style="padding:6px 4px"></th></tr></thead>'
      +'<tbody>'+memHTML+'</tbody></table></div></div>';
  }).join('');

  el.innerHTML='<div style="font-size:11px;color:var(--sub);margin-bottom:16px;padding:8px 12px;background:var(--sf2);border-radius:8px;border-left:3px solid var(--ac)">'
    +'📝 ข้อมูลจาก Sheet <b>⚡ POWER TEAMS</b> — แก้ได้ทั้งใน UI นี้และใน Sheet โดยตรง</div>'
    +teamsHTML;
}
function ptOpenAdd(teamName){
  var t=prompt('ชื่อทีม:',teamName||'');if(t===null)return;
  var firstName=prompt('ชื่อ:','');if(firstName===null)return;
  var lastName=prompt('นามสกุล:','')||'';
  var nick=prompt('ชื่อเล่น:',firstName||'')||'';
  var prof=prompt('อาชีพ:','')||'';
  var tl=prompt('TL (G/Y/R):','')||'';
  var goal=parseFloat(prompt('เป้าหมาย (฿):','0')||'0');
  var recv=parseFloat(prompt('รับจริง (฿):','0')||'0');
  gsr('savePTMember',{role:S.role,team:t,firstName:firstName,lastName:lastName,nick:nick,profession:prof,tl:tl.toUpperCase(),bniGoal:goal,recv:recv},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ เพิ่ม '+nick+' แล้ว','ok'); _ptMgrLoaded=false;ptLoad();
  });
}
function ptOpenEdit(row,team){
  var t=prompt('ชื่อทีม:',team);if(t===null)return;
  var firstName=prompt('ชื่อ:','')||'';
  var nick=prompt('ชื่อเล่น:','')||'';
  var prof=prompt('อาชีพ:','')||'';
  var tl=prompt('TL (G/Y/R):','')||'';
  var goal=parseFloat(prompt('เป้าหมาย (฿):','0')||'0');
  var recv=parseFloat(prompt('รับจริง (฿):','0')||'0');
  gsr('savePTMember',{role:S.role,row:row,team:t,firstName:firstName,nick:nick,profession:prof,tl:tl.toUpperCase(),bniGoal:goal,recv:recv},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ แก้ไขแล้ว','ok'); _ptMgrLoaded=false;ptLoad();
  });
}
function ptOpenMove(row,nick){
  var newTeam=prompt('ย้าย '+nick+' ไปทีม:','');if(!newTeam)return;
  gsr('movePTMember',{role:S.role,row:row,newTeam:newTeam},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ ย้าย '+nick+' → '+newTeam+' แล้ว','ok'); _ptMgrLoaded=false;ptLoad();
  });
}
function ptDelete(row,nick){
  gsr('deletePTMember',{role:S.role,row:row},function(r){
    if(!r.ok){toast('❌ '+(r.error||''),'err');return;}
    toast('✅ ลบ '+nick+' แล้ว','ok'); _ptMgrLoaded=false;ptLoad();
  });
}

// ── Growth Sheet Tab ──────────────────────────────────────────
var _gshData=null,_gshLoaded=false;

function gshLoad(){
  if(_gshLoaded&&_gshData){
    document.getElementById('gsh-loading').style.display='none';
    document.getElementById('gsh-content').style.display='block';
    gshRender();
    return;
  }
  document.getElementById('gsh-loading').style.display='block';
  document.getElementById('gsh-content').style.display='none';
  gsr('getGrowthSheetData',{role:S.role},function(r){
    if(!r||!r.ok){
      document.getElementById('gsh-loading').innerHTML='<span style="color:var(--re)">❌ '+(r&&r.error||'โหลดไม่ได้')+'</span>';
      return;
    }
    _gshData=r;_gshLoaded=true;
    _rvData=r;_rvLoaded=true; // keep both tabs in sync
    document.getElementById('gsh-loading').style.display='none';
    document.getElementById('gsh-content').style.display='block';
    gshRender();
  });
}

function gshRender(){
  if(!_gshData)return;
  var s=_gshData.summary;
  var pc=s.pct>=80?'var(--gr)':s.pct>=50?'var(--ye)':'var(--re)';
  document.getElementById('gsh-summary').innerHTML=
    '<div class="gsh-cards">'
    +gshCard('💰 รับจริง',gshFmt(s.totalReceived),'var(--gr)')
    +gshCard('🎯 เป้าหมาย',gshFmt(s.totalTarget),'#B08A3C')
    +gshCard('📊 ทำได้',s.pct+'%',pc)
    +'</div>'
    +'<div class="gsh-prog"><div class="gsh-prog-fill" style="background:'+pc+';width:'+Math.min(s.pct,100)+'%;"></div></div>'
    +'<div style="font-size:11px;color:var(--sub);margin-bottom:14px;">'+s.groupCount+' ทีม · '+s.memberCount+' สมาชิก</div>';
  document.getElementById('gsh-groups').innerHTML=_gshData.groups.map(function(g,gi){return gshRenderGroup(g,gi);}).join('');
}

function gshCard(lbl,val,color){
  return '<div class="gsh-card"><div class="gsh-card-val" style="color:'+color+';">'+val+'</div><div class="gsh-card-lbl">'+lbl+'</div></div>';
}

function gshFmt(n){
  if(!n)return '0';
  if(n>=1000000)return (n/1000000).toFixed(1).replace(/\.0$/,'')+'M';
  if(n>=1000)return (n/1000).toFixed(0)+'K';
  return String(Math.round(n));
}

function gshFmtNum(n){
  if(isNaN(n)||n===null||n===undefined)return'-';
  if(n===0)return'0';
  var neg=n<0;var abs=Math.abs(n);
  var s=Math.round(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return(neg?'-':'')+s;
}

function gshRenderGroup(g,gi){
  var data=_gshData;
  var h=data.headers||[];
  var cm=data.colMap||{};
  var nameCol=cm.name!==undefined?cm.name:1;
  var nickCol=cm.nick;
  var pctCol=cm.pct;

  // Build visible column list from real headers (skip col 0 = seq, skip blank)
  var visCols=[];
  h.forEach(function(hdr,ci){
    if(ci===0)return;
    if(!String(hdr||'').trim())return;
    visCols.push({ci:ci,hdr:String(hdr).trim()});
  });
  if(!visCols.length){
    visCols=[{ci:1,hdr:'ชื่อ'},{ci:cm.target||9,hdr:'เป้า'},{ci:cm.received||11,hdr:'รับจริง'}];
  }

  var gR=g.totalRow?g.totalRow.received:g.members.reduce(function(a,m){return a+m.received;},0);
  var gT=g.totalRow?g.totalRow.target:g.members.reduce(function(a,m){return a+m.target;},0);
  var gP=gT>0?Math.round(gR/gT*100):0;
  var gc=gP>=80?'var(--gr)':gP>=50?'var(--ye)':'var(--re)';

  // Table header row
  var ths=visCols.map(function(vc){
    var isR=vc.ci>=8||vc.hdr.indexOf('%')!==-1;
    return'<th style="text-align:'+(isR?'right':'left')+'">'+esc(vc.hdr)+'</th>';
  }).join('')+'<th style="width:36px"></th>';

  // Member rows
  var rows=g.members.map(function(m){
    var tds=visCols.map(function(vc){
      var raw=m.cells&&m.cells[vc.ci]!==undefined?m.cells[vc.ci]:'';
      var str=raw===null||raw===''?'':String(raw);

      // Name cell: display nick + full name
      if(vc.ci===nameCol){
        var nick=nickCol!==undefined&&m.cells?String(m.cells[nickCol]||'').trim():'';
        var dn=nick||str;
        var sub=nick&&nick!==str?'<div style="font-size:10px;color:var(--sub);">'+esc(str)+'</div>':'';
        return'<td style="min-width:100px;position:sticky;left:0;background:var(--sf2);z-index:1;"><b>'+esc(dn)+'</b>'+sub+'</td>';
      }

      // Pct cell: color coded
      if(vc.ci===pctCol){
        var pv=parseFloat(str)||0;
        var pc2=pv>=80?'var(--gr)':pv>=50?'var(--ye)':'var(--re)';
        return'<td style="text-align:right;color:'+pc2+';font-weight:700;white-space:nowrap;">'+(str||'-')+'</td>';
      }

      // %Conversion cell: show as-is (already has % sign)
      if(str.indexOf('%')!==-1){
        return'<td style="text-align:right;white-space:nowrap;">'+esc(str)+'</td>';
      }

      // Numeric: right-align formatted
      var n=parseFloat(String(raw).replace(/[,\s฿]/g,''));
      if(!isNaN(n)&&str!==''){
        var isTarget=vc.ci===cm.target;
        var isRec=vc.ci===cm.received;
        var color=isRec?(n>=(m.target||0)?'var(--gr)':'inherit'):'inherit';
        return'<td style="text-align:right;color:'+color+';white-space:nowrap;">'+gshFmtNum(n)+'</td>';
      }

      return'<td style="white-space:nowrap;">'+esc(str)+'</td>';
    }).join('');
    return'<tr>'+tds+'<td><button class="gsh-edt" onclick="gshOpenEdit('+gi+',\''+m.sheetRow+'\')">✏️</button></td></tr>';
  }).join('');

  // Total row (from sheet)
  var totalHtml='';
  if(g.totalRow&&g.totalRow.cells){
    var tc=g.totalRow.cells;
    var ttds=visCols.map(function(vc){
      var raw=tc[vc.ci]!==undefined?tc[vc.ci]:'';
      var str=String(raw||'');
      if(str.indexOf('รวม')!==-1)return'<td style="font-weight:700;color:var(--sub);">รวม</td>';
      var n=parseFloat(String(raw).replace(/[,\s฿]/g,''));
      if(!isNaN(n)&&str!=='')return'<td style="text-align:right;font-weight:700;white-space:nowrap;">'+gshFmtNum(n)+'</td>';
      return'<td></td>';
    }).join('');
    totalHtml='<tr style="background:var(--sf2);border-top:1px solid var(--bd);">'+ttds+'<td></td></tr>';
  }

  return'<div class="gsh-group">'
    +'<div class="gsh-grp-hdr" onclick="gshToggle(this)">'
    +'<span class="gsh-grp-name">'+esc(g.name)+'</span>'
    +'<span class="gsh-grp-meta">'+g.members.length+' คน · '+gshFmt(gR)+' / '+gshFmt(gT)+'</span>'
    +'<span style="font-weight:800;color:'+gc+';">'+gP+'%</span>'
    +'<span class="gsh-arr" style="font-size:10px;color:var(--sub);margin-left:4px;">▼</span>'
    +'</div>'
    +'<div class="gsh-grp-bar"><div class="gsh-grp-bar-f" style="background:'+gc+';width:'+Math.min(gP,100)+'%;"></div></div>'
    +'<div class="gsh-grp-body open">'
    +'<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">'
    +'<table class="gsh-tbl"><thead><tr>'+ths+'</tr></thead>'
    +'<tbody>'+rows+totalHtml+'</tbody></table>'
    +'</div>'
    +'<div class="gsh-add-row" onclick="gshOpenAdd('+gi+')">+ เพิ่มสมาชิก</div>'
    +'</div>'
    +'</div>';
}

function gshToggle(hdr){
  var body=hdr.parentElement.querySelector('.gsh-grp-body');
  var arr=hdr.querySelector('.gsh-arr');
  if(!body)return;
  var open=body.classList.toggle('open');
  if(arr)arr.textContent=open?'▼':'▶';
}

// Shared edit helper — used by both Sheet tab and Revenue Dashboard
function gshOpenEdit(gi,sheetRow){
  closeAllModals();
  var data=_gshData||_rvData;
  if(!data||!data.groups[gi])return;
  var m=data.groups[gi].members.find(function(x){return x.sheetRow===sheetRow;});
  if(!m)return;
  var h=data.headers||[];
  var cm=data.colMap||{};
  var pctCol=cm.pct;
  var nameCol=cm.name!==undefined?cm.name:1;
  var curGroupName=data.groups[gi].name;

  // Build field list: all headers except seq(0), formula pct
  var fields=[];
  h.forEach(function(hdr,ci){
    if(ci===0)return;
    if(!String(hdr||'').trim())return;
    if(ci===pctCol)return;
    var val=m.cells&&m.cells[ci]!==undefined?m.cells[ci]:'';
    var isNum=val!==''&&!isNaN(parseFloat(String(val).replace(/[,%]/g,'')))&&String(val).indexOf('%')===-1&&!/^\d{2}\/\d{2}\/\d{4}$/.test(String(val));
    var isDis=(ci===nameCol);
    var isWide=ci<=2||String(hdr).length>12;
    fields.push({ci:ci,hdr:String(hdr).trim(),val:val,isNum:isNum,isDis:isDis,wide:isWide});
  });

  // Power Team selector
  var teamOptions=(data.groups||[]).map(function(g){
    return'<option value="'+esc(g.name)+'"'+(g.name===curGroupName?' selected':'')+'>'+esc(g.name)+'</option>';
  }).join('');
  var teamField='<div class="gshf wide"><label>⚡ Power Team</label>'
    +'<select id="gsh-team-sel">'+teamOptions+'</select></div>'
    +'<hr class="gsh-team-sep">';

  document.getElementById('gsh-mtitle').textContent='✏️ '+(m.nick||m.name);
  document.getElementById('gsh-mfields').innerHTML=
    '<div class="gsh-fgrid">'+teamField
    +fields.map(function(f){
      return f.isNum
        ?gshNumField('gsh-c'+f.ci,f.hdr,f.val,f.wide)
        :gshField('gsh-c'+f.ci,f.hdr,'text',f.val,f.isDis,f.wide);
    }).join('')
    +'</div>';

  var btn=document.getElementById('gsh-msave');
  btn.textContent='💾 บันทึก';btn.disabled=false;
  btn.onclick=function(){gshSaveEdit(gi,sheetRow,fields,data,curGroupName);};
  document.getElementById('gsh-modal').classList.add('open');
}

function gshSaveEdit(gi,sheetRow,fields,data,origGroupName){
  var m=data.groups[gi].members.find(function(x){return x.sheetRow===sheetRow;});
  if(!m)return;
  var newTeam=(document.getElementById('gsh-team-sel')||{}).value||origGroupName;
  var teamChanged=newTeam&&newTeam!==origGroupName;

  var updates=[];
  fields.forEach(function(f){
    if(f.isDis)return;
    var el=document.getElementById('gsh-c'+f.ci);
    if(!el)return;
    var val=el.value;
    if(f.isNum)val=parseFloat(val)||0;
    else val=val.trim();
    updates.push({col:f.ci+1,val:val});
    if(m.cells)m.cells[f.ci]=val;
  });

  var btn=document.getElementById('gsh-msave');
  btn.textContent='⏳...';btn.disabled=true;

  function doFieldSave(afterCb){
    if(!updates.length){afterCb();return;}
    gsr('updateGrowthMember',{role:S.role,sheetRow:sheetRow,updates:updates},function(r){
      if(!r||!r.ok){btn.textContent='💾 บันทึก';btn.disabled=false;alert('❌ '+(r&&r.error||'บันทึกไม่ได้'));return;}
      afterCb();
    });
  }

  function doTeamMove(afterCb){
    if(!teamChanged){afterCb();return;}
    gsr('moveGrowthMember',{role:S.role,sheetRow:sheetRow,targetGroup:newTeam},function(r){
      if(!r||!r.ok){btn.textContent='💾 บันทึก';btn.disabled=false;alert('❌ '+(r&&r.error||'ย้ายทีมไม่ได้'));return;}
      afterCb();
    });
  }

  doFieldSave(function(){
    doTeamMove(function(){
      btn.textContent='💾 บันทึก';btn.disabled=false;
      gshCloseModal();
      // Reload data from server to reflect row changes
      _gshLoaded=false;_rvLoaded=false;
      gshLoad();
    });
  });
}

function gshOpenAdd(gi){
  closeAllModals();
  if(!_gshData||!_gshData.groups[gi])return;
  document.getElementById('gsh-mtitle').textContent='➕ เพิ่มสมาชิกใหม่ · '+esc(_gshData.groups[gi].name);
  document.getElementById('gsh-mfields').innerHTML=
    '<div class="gsh-fgrid">'
    +gshField('gsh-f-name','ชื่อ-สกุล *','text','',false,true)
    +gshField('gsh-f-nick','ชื่อเล่น','text','',false,false)
    +gshNumField('gsh-f-target','เป้าหมาย (บาท)',0,false)
    +'</div>';
  var btn=document.getElementById('gsh-msave');
  btn.textContent='➕ เพิ่ม';btn.disabled=false;
  btn.onclick=function(){gshAddMember(gi);};
  document.getElementById('gsh-modal').classList.add('open');
}

function gshAddMember(gi){
  var name=document.getElementById('gsh-f-name').value.trim();
  if(!name){alert('กรุณาใส่ชื่อ');return;}
  var nick=document.getElementById('gsh-f-nick').value.trim();
  var target=parseFloat(document.getElementById('gsh-f-target').value)||0;
  var groupName=_gshData.groups[gi].name;
  var btn=document.getElementById('gsh-msave');
  btn.textContent='⏳...';btn.disabled=true;
  gsr('addGrowthMember',{role:S.role,name:name,nick:nick,target:target,groupName:groupName},function(r){
    btn.textContent='➕ เพิ่ม';btn.disabled=false;
    if(!r||!r.ok){alert('❌ '+(r&&r.error||'เพิ่มไม่ได้'));return;}
    gshCloseModal();
    _gshLoaded=false;gshLoad();
  });
}

function gshCloseModal(){document.getElementById('gsh-modal').classList.remove('open');}

function gshField(id,lbl,type,val,dis,wide){
  return '<div class="gshf'+(wide?' wide':'')+'"><label>'+lbl+'</label>'
    +'<input id="'+id+'" type="'+type+'" value="'+esc(String(val||''))+'"'+(dis?' disabled':'')+'/></div>';
}
function gshNumField(id,lbl,val,wide){
  return '<div class="gshf'+(wide?' wide':'')+'"><label>'+lbl+'</label>'
    +'<input id="'+id+'" type="number" min="0" step="1000" value="'+(parseFloat(val)||0)+'"/></div>';
}

// ── LINE Compose (Desktop) ────────────────────────────────────
var _dLineTarget = null;
var DESK_LINE_TMPLS = [
  {l:'📊 ติดตามคะแนน', t:'สวัสดีครับ คุณ{nick} 👋\n\nอยากติดตามคะแนน BNI ของคุณนะครับ\nพิมพ์ "สถานะ" ใน LINE Bot เพื่อดูคะแนน + Action Plan ได้เลยครับ 📊'},
  {l:'📅 นัด 1-2-1',    t:'สวัสดีครับ คุณ{nick}\n\nสัปดาห์นี้มีเวลา 1-2-1 กันไหมครับ?\nอยากคุยเรื่องโอกาส Referral และ Action Plan ของคุณครับ 🤝'},
  {l:'🔔 เตือนประชุม',  t:'สวัสดีครับ คุณ{nick} 👋\n\n⏰ เตือนนะครับ — ประชุม BNI IDEAL อาทิตย์นี้\nอย่าลืมมาด้วยนะครับ เชียร์กันอยู่! 🏆'},
  {l:'💪 ให้กำลังใจ',   t:'สวัสดีครับ คุณ{nick} 💪\n\nอยากให้กำลังใจนะครับ ทำต่อเนื่องไปเรื่อยๆ\nBNI IDEAL เชียร์คุณอยู่เสมอครับ! 🚀'},
  {l:'👋 ยินดีต้อนรับ',  t:'สวัสดีครับ คุณ{nick} 👋\n\nยินดีต้อนรับสู่ BNI IDEAL ครับ!\nยินดีให้คำปรึกษาและช่วยเหลือเสมอนะครับ 🙏'},
];

function _renderDeskLineTpls(nick) {
  document.getElementById('desk-line-tpls').innerHTML = DESK_LINE_TMPLS.map(function(t,i){
    return '<button style="font-size:11px;padding:3px 7px;background:var(--sf2);border:1px solid var(--bd);border-radius:5px;color:var(--tx);cursor:pointer" onclick="deskLineUseTpl('+i+',\''+nick.replace(/'/g,"\\'")+'\')">'+t.l+'</button>';
  }).join('');
}

function deskLineUseTpl(i, nick) {
  document.getElementById('desk-line-txt').value = DESK_LINE_TMPLS[i].t.replace(/\{nick\}/g, nick);
}

function openDeskLineCompose(name, nick) {
  _dLineTarget = {name:name, nick:nick, broadcast:false};
  document.getElementById('desk-line-title').textContent = '📲 ส่ง LINE — '+(nick||name.split(' ')[0]);
  document.getElementById('desk-line-bcast-info').style.display = 'none';
  document.getElementById('desk-line-txt').value = '';
  _renderDeskLineTpls(nick||name.split(' ')[0]);
  document.getElementById('desk-line-modal').style.display = 'flex';
}

function openDeskLineBroadcast(teamName) {
  _dLineTarget = {broadcast:true, teamName:teamName};
  document.getElementById('desk-line-title').textContent = '📢 Broadcast — ทีม '+teamName;
  document.getElementById('desk-line-bcast-info').style.display = 'block';
  document.getElementById('desk-line-txt').value = '';
  _renderDeskLineTpls('ทีม');
  document.getElementById('desk-line-modal').style.display = 'flex';
}

function closeDeskLine() { document.getElementById('desk-line-modal').style.display='none'; }

function doDeskSendLine() {
  var text = (document.getElementById('desk-line-txt').value||'').trim();
  if (!text) { toast('กรุณาพิมพ์ข้อความครับ','err'); return; }
  var t = _dLineTarget; if (!t) return;
  var btn = document.getElementById('desk-line-send-btn');
  btn.disabled=true; btn.textContent='⏳ กำลังส่ง...';
  if (t.broadcast) {
    gsr('sendLineBroadcast',{role:S.role,teamName:t.teamName,message:text},function(r){
      btn.disabled=false; btn.textContent='📤 ส่ง LINE';
      if (!r.ok){toast(r.error||'ส่งไม่สำเร็จ','err');return;}
      toast('📢 ส่งถึง '+(r.sentCount||r.sent||0)+' คน ✅','ok'); closeDeskLine();
    });
  } else {
    gsr('sendLineMessage',{role:S.role,memberName:t.name,message:text},function(r){
      btn.disabled=false; btn.textContent='📤 ส่ง LINE';
      if (!r.ok){toast(r.error||'ส่งไม่สำเร็จ','err');return;}
      if (!r.sent){toast('⚠️ '+t.name+' ยังไม่ได้ลงทะเบียน LINE Bot ครับ','err');return;}
      toast('📲 ส่งสำเร็จ ✅','ok'); closeDeskLine();
    });
  }
}

function loadDeskLineMembers() {
  gsr('getLineMembers',{role:S.role},function(r){
    if(r&&r.ok) {
      // API returns array [{lineUserId, name, ...}] — convert to {name: lineUserId} map
      var m={};
      (r.members||[]).forEach(function(i){if(i.name)m[i.name]=i.lineUserId;});
      D.lineMembers=m;
      _populateLineMemberSelects();
    }
  });
}

function _populateLineMemberSelects() {
  var names = Object.keys(D.lineMembers||{}).sort();
  ['line-dm-member','line-intro-m1','line-intro-m2','mc-line-id-member'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    names.forEach(function(n) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
  });
  _populateLinkMemberSelect();
}

function deskSendDM() {
  var member = (document.getElementById('line-dm-member').value||'').trim();
  var text   = (document.getElementById('line-dm-text').value||'').trim();
  if (!member) { toast('เลือกสมาชิกก่อนครับ','err'); return; }
  if (!text)   { toast('พิมพ์ข้อความก่อนครับ','err'); return; }
  gsr('sendLineMessage',{role:S.role,memberName:member,message:text},function(r){
    if (!r.ok) { toast(r.error||'ส่งไม่สำเร็จ','err'); return; }
    if (!r.sent) { toast('⚠️ '+member+' ยังไม่ได้ลงทะเบียน LINE Bot ครับ','err'); return; }
    toast('📲 ส่งถึง '+member+' แล้ว ✅','ok');
    document.getElementById('line-dm-text').value='';
  });
}

function deskSendBroadcast() {
  var team = (document.getElementById('line-bc-team').value||'').trim();
  var text = (document.getElementById('line-bc-text').value||'').trim();
  if (!text) { toast('พิมพ์ข้อความก่อนครับ','err'); return; }
  var label = team || 'ทุกคน';
  if (!confirm('ส่ง Broadcast ถึง ' + label + '?')) return;
  gsr('sendLineBroadcast',{role:S.role,teamName:team||null,message:text},function(r){
    if (!r.ok) { toast(r.error||'ส่งไม่สำเร็จ','err'); return; }
    toast('📢 ส่งถึง '+(r.sentCount||r.sent||0)+' คน ✅','ok');
    document.getElementById('line-bc-text').value='';
  });
}

function deskSendIntro() {
  var m1 = (document.getElementById('line-intro-m1').value||'').trim();
  var m2 = (document.getElementById('line-intro-m2').value||'').trim();
  if (!m1 || !m2) { toast('เลือกสมาชิก 2 คนก่อนครับ','err'); return; }
  if (m1===m2) { toast('ต้องเลือกคนละคนครับ','err'); return; }
  gsr('sendLineIntro',{role:S.role,name1:m1,name2:m2},function(r){
    if (!r.ok) { toast(r.error||'ส่งไม่สำเร็จ','err'); return; }
    if (!r.sent) { toast('⚠️ ไม่พบ LINE ID ของสมาชิกทั้งคู่ครับ','err'); return; }
    toast('🤝 แนะนำ '+(r.sentTo||[]).join(' & ')+' แล้ว ✅','ok');
  });
}

function deskTriggerCheckinReminder() {
  if (!confirm('ส่ง Check-In Reminder ถึงสมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerCheckinReminder',{role:S.role},function(r){
    if (r&&r.ok) toast('📅 ส่ง Reminder แล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerScoreAlert() {
  if (!confirm('ส่ง Low Score Alert ถึงสมาชิกที่คะแนนลด 2 เดือนติดต่อกันตอนนี้ไหมครับ?')) return;
  gsr('triggerScoreAlert',{role:S.role},function(r){
    if (r&&r.ok) toast('⚠️ Alert ส่งแล้ว '+r.alerted+' คน ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerAnniversary() {
  if (!confirm('ส่ง BNI Anniversary แจ้งเตือนสมาชิกที่ครบรอบใน 30 วันตอนนี้ไหมครับ?')) return;
  gsr('triggerAnniversary',{role:S.role},function(r){
    if (r&&r.ok) toast('🎂 Anniversary Alert ส่งแล้ว '+r.sent+' คน ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

var _absenceLoaded = false;
function loadAbsenceLog(force) {
  if (_absenceLoaded && !force) return;
  gsr('getAbsenceLog',{role:S.role},function(r){
    _absenceLoaded = true;
    var wrap = document.getElementById('absence-wrap');
    var cntEl = document.getElementById('absence-count');
    if (!r||!r.ok) { wrap.innerHTML='<div style="color:var(--re);padding:16px;font-size:12px">❌ '+(r&&r.error||'error')+'</div>'; return; }
    var list = (r.list||[]).slice(0,20);
    cntEl.textContent = r.list.length + ' รายการ';
    if (!list.length) {
      wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มีการแจ้งขาด</div>';
      return;
    }
    var TEAM_C={TOOMTAM:'#3b82f6',Aof:'var(--gr)',Draft:'var(--ye)',PHAI:'#f97316',AMP:'#a855f7'};
    var rows = list.map(function(a){
      var tc = TEAM_C[a.team]||'var(--sub)';
      var isSub = a.type==='ส่ง sub';
      var typeClr = isSub ? '#06C755' : 'var(--ye)';
      return '<tr>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(a.reportedAt)+'</td>'
        +'<td style="font-weight:600;font-size:12px">'+esc(a.nick||a.name)+'</td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+tc+'">'+esc(a.team)+'</span></td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+typeClr+'">'+esc(a.type||'ลา')+'</span></td>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(a.absDate)+'</td>'
        +'<td style="font-size:11px;color:var(--tx)">'+esc(a.detail||a.reason||'—')+'</td>'
        +'</tr>';
    }).join('');
    wrap.innerHTML='<table class="usage-log-tbl"><thead><tr>'
      +'<th>แจ้งเมื่อ</th><th>ชื่อเล่น</th><th>ทีม</th><th>ประเภท</th><th>วันที่ขาด</th><th>รายละเอียด</th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table>';
  });
}

function deskSetMCLineId() {
  var name = (document.getElementById('mc-line-id-member').value||'').trim();
  if (!name) { toast('เลือกชื่อก่อนครับ','err'); return; }
  gsr('setMCLineId',{role:S.role,memberName:name},function(r){
    if (!r||!r.ok) { toast(r&&r.error||'ไม่สำเร็จ','err'); return; }
    toast('✅ บันทึก LINE ID ของ '+r.name+' เป็น MC แล้ว','ok');
  });
}

function deskTriggerChapterPulse() {
  if (!confirm('ส่ง Chapter Pulse สรุปภาพรวม Chapter ให้ MC ตอนนี้เลยไหมครับ?')) return;
  gsr('triggerChapterPulse',{role:S.role},function(r){
    if (r&&r.ok) toast('🏆 Chapter Pulse ส่งให้ MC แล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

var _tracker121Loaded = false;
function load121Tracker(force) {
  if (_tracker121Loaded && !force) return;
  document.getElementById('tracker-121-wrap').innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">⏳ กำลังโหลด...</div>';
  gsr('get121Tracker',{role:S.role},function(r){
    _tracker121Loaded = true;
    var wrap  = document.getElementById('tracker-121-wrap');
    var cntEl = document.getElementById('tracker-121-count');
    var statsEl = document.getElementById('tracker-121-stats');
    if (!r||!r.ok){ wrap.innerHTML='<div style="color:var(--re);padding:16px;font-size:12px">❌ '+(r&&r.error||'error')+'</div>'; return; }
    var list = r.list||[]; var stats = r.stats||{};
    cntEl.textContent = list.length+' ครั้ง';
    if (stats.total) {
      statsEl.style.display='flex';
      statsEl.innerHTML = [
        {v:stats.total,    l:'ทั้งหมด', c:'var(--sub)'},
        {v:stats.pending,  l:'รอยืนยัน',c:'var(--ye)'},
        {v:stats.met,      l:'เจอแล้ว', c:'#60a5fa'},
        {v:stats.gotRef,   l:'ได้ Ref',  c:'var(--gr)'},
        {v:(stats.convRate||0)+'%', l:'Conversion', c:'#a78bfa'}
      ].map(function(s){
        return '<div style="background:var(--sf);border-radius:8px;padding:6px 10px;text-align:center;flex:1;min-width:60px">'
          +'<div style="font-size:15px;font-weight:700;color:'+s.c+'">'+s.v+'</div>'
          +'<div style="font-size:9px;color:var(--sub)">'+s.l+'</div></div>';
      }).join('');
    }
    if (!list.length) { wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มีการบันทึก 1-2-1</div>'; return; }
    var statusColor={'นัดแล้ว':'var(--ye)','เจอแล้ว':'#60a5fa','ยกเลิก':'var(--sub)'};
    var outcomeIcon={'ได้ Referral':'🎊','มีโอกาส':'🌱','ยังคุยอยู่':'💬','ไม่ได้อะไร':'📝',''  :'—'};
    var rows = list.slice(0,30).map(function(i){
      var sc = statusColor[i.status]||'var(--sub)';
      var oi = outcomeIcon[i.outcome]!==undefined ? outcomeIcon[i.outcome] : '📝';
      return '<tr>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(i.date.slice(0,10))+'</td>'
        +'<td style="font-weight:600;font-size:12px">'+esc(i.nick||i.name.split(' ')[0])+'</td>'
        +'<td style="font-size:10px;font-weight:700;color:#fb923c">'+esc(i.team)+'</td>'
        +'<td style="font-size:12px">'+esc(i.partner.split(' ')[0])+'<br><span style="font-size:9px;color:var(--sub)">'+esc(i.partnerTeam)+'</span></td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+sc+'">'+esc(i.status)+'</span></td>'
        +'<td style="font-size:13px;text-align:center">'+oi+'<br><span style="font-size:9px;color:var(--sub)">'+esc(i.outcome||'—')+'</span></td>'
        +'</tr>';
    }).join('');
    wrap.innerHTML='<table class="usage-log-tbl"><thead><tr><th>วันที่</th><th>สมาชิก</th><th>ทีม</th><th>นัดกับ</th><th>สถานะ</th><th>ผล</th></tr></thead><tbody>'+rows+'</tbody></table>';
  });
}

function deskTriggerLeaderboard() {
  if (!confirm('ส่ง Team Leaderboard ให้สมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerTeamLeaderboard',{role:S.role},function(r){
    if (r&&r.ok) toast('🏆 Team Leaderboard ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

var _lineIssuesLoaded = false;
function loadLineIssues(force) {
  if (_lineIssuesLoaded && !force) return;
  document.getElementById('line-issues-wrap').innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">⏳ กำลังโหลด...</div>';
  gsr('getLineIssues',{role:S.role},function(r){
    _lineIssuesLoaded = true;
    var wrap = document.getElementById('line-issues-wrap');
    var cntEl = document.getElementById('line-issues-count');
    if (!r||!r.ok) { wrap.innerHTML='<div style="color:var(--re);padding:16px;font-size:12px">❌ '+(r&&r.error||'error')+'</div>'; return; }
    var list = r.list||[];
    D.lineIssues = list;
    var open = list.filter(function(i){ return i.status==='รอดำเนินการ'||i.status==='กำลังดำเนินการ'; });
    D.lineIssueOpen = open.length;
    updateBadges();
    renderFocusBar();
    cntEl.textContent = open.length ? open.length+' รอดำเนินการ' : 'ไม่มี';
    cntEl.style.color = open.length ? 'var(--ye)' : 'var(--sub)';
    if (!list.length) { wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มี Core Issues ที่แจ้งผ่าน LINE</div>'; return; }
    var statusColor = {'รอดำเนินการ':'var(--ye)','กำลังดำเนินการ':'#60a5fa','เสร็จสิ้น':'var(--gr)','ยกเลิก':'var(--sub)'};
    var rows = list.slice(0,20).map(function(i){
      var sc = statusColor[i.status]||'var(--sub)';
      var issueId = JSON.stringify(i.id || '');
      var memberName = JSON.stringify(i.name || '');
      var response = i.response
        ? '<div style="font-size:10px;color:#06C755;margin-top:4px">ตอบแล้ว: '+esc(String(i.response).slice(0,80))+(String(i.response).length>80?'…':'')+'</div>'
        : '';
      var actions = i.status==='เสร็จสิ้น'
        ? '<button onclick="lineIssueReopen('+issueId+')" style="font-size:10px;padding:3px 7px;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.3);border-radius:5px;color:#60a5fa;cursor:pointer">เปิดใหม่</button>'
        : '<button onclick="lineIssueReply('+issueId+','+memberName+',false)" style="font-size:10px;padding:3px 7px;background:rgba(6,199,85,.12);border:1px solid rgba(6,199,85,.3);border-radius:5px;color:#06C755;cursor:pointer;margin-right:4px">ตอบ</button>'
          +'<button onclick="lineIssueReply('+issueId+','+memberName+',true)" style="font-size:10px;padding:3px 7px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);border-radius:5px;color:var(--ye);cursor:pointer;margin-right:4px">ตอบ+ปิด</button>'
          +'<button onclick="lineIssueClose('+issueId+')" style="font-size:10px;padding:3px 7px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.3);border-radius:5px;color:var(--sub);cursor:pointer">ปิด</button>';
      return '<tr>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(i.date)+'</td>'
        +'<td style="font-weight:600;font-size:12px">'+esc(i.name)+'<br><span style="font-size:10px;color:var(--sub)">'+(i.nick?'('+esc(i.nick)+')':'')+'</span></td>'
        +'<td style="font-size:10px;font-weight:700;color:#fb923c">'+esc(i.team)+'</td>'
        +'<td style="font-size:11px;max-width:220px">'+esc(i.detail.slice(0,90))+(i.detail.length>90?'…':'')+response+'</td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+sc+'">'+esc(i.status)+'</span></td>'
        +'<td style="white-space:nowrap">'+actions+'</td>'
        +'</tr>';
    }).join('');
    wrap.innerHTML='<table class="usage-log-tbl"><thead><tr><th>วันที่</th><th>สมาชิก</th><th>ทีม</th><th>รายละเอียด</th><th>สถานะ</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table>';
  });
}

function lineIssueReply(issueId,memberName,closeIssue){
  var msg=prompt('ตอบกลับ '+memberName+' ทาง LINE:', closeIssue?'รับทราบครับ ทีม Mentor จะช่วยดูแลเรื่องนี้ และขอปิดเคสนี้ไว้ก่อนนะครับ':'');
  if(msg===null)return;
  msg=String(msg||'').trim();
  if(!msg){toast('กรุณาพิมพ์ข้อความตอบกลับ','err');return;}
  gsr('replyLineIssue',{role:S.role,issueId:issueId,response:msg,closeIssue:!!closeIssue},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'ตอบกลับไม่สำเร็จ'),'err',5000);return;}
    toast(closeIssue?'💬 ตอบกลับและปิดเคสแล้ว ✅':'💬 ตอบกลับแล้ว ✅','ok');
    _lineIssuesLoaded=false;_lineActivityLoaded=false;
    loadLineIssues(true);loadLineActivityTimeline(true);loadLineIssueBadge(true);
  });
}
function lineIssueClose(issueId){
  if(!confirm('ปิดเคสนี้โดยไม่ส่งข้อความหา member?'))return;
  gsr('updateLineIssueStatus',{role:S.role,issueId:issueId,status:'closed'},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'ปิดเคสไม่สำเร็จ'),'err');return;}
    toast('✅ ปิดเคสแล้ว','ok');
    _lineIssuesLoaded=false;_lineActivityLoaded=false;
    loadLineIssues(true);loadLineActivityTimeline(true);loadLineIssueBadge(true);
  });
}
function lineIssueReopen(issueId){
  gsr('updateLineIssueStatus',{role:S.role,issueId:issueId,status:'open'},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'เปิดเคสไม่สำเร็จ'),'err');return;}
    toast('🔄 เปิดเคสใหม่แล้ว','ok');
    _lineIssuesLoaded=false;_lineActivityLoaded=false;
    loadLineIssues(true);loadLineActivityTimeline(true);loadLineIssueBadge(true);
  });
}

function deskTriggerPostMeeting() {
  if (!confirm('ส่ง Friday Prep Prompt เตรียมประชุมวันศุกร์ให้สมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerPostMeetingPrompt',{role:S.role},function(r){
    if (r&&r.ok) toast('📋 Friday Prep Prompt ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerWednesdayNudge() {
  if (!confirm('ส่ง Friday Meeting Reminder เตือนประชุมวันศุกร์ตอนนี้เลยไหมครับ?')) return;
  gsr('triggerWednesdayNudge',{role:S.role},function(r){
    if (r&&r.ok) toast('⏰ Friday Meeting Reminder ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskSetupAllTriggers() {
  if (!confirm('ตั้งค่า Auto Trigger ทั้งหมดให้ถูกต้อง?\n(จะลบ Trigger เก่าและสร้างใหม่)')) return;
  gsr('setupAllTriggers',{role:S.role},function(r){
    if (!r||!r.ok) { toast((r&&r.error)||'เกิดข้อผิดพลาด','err'); return; }
    var msg = (r.results||[]).join('\n');
    alert('ผลการตั้งค่า Trigger:\n\n' + msg);
    toast('⚙️ ตั้งค่า Triggers แล้ว ✅','ok');
  });
}

function deskTriggerWeeklyScore() {
  if (!confirm('ส่ง Weekly Score Card ถึงสมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerWeeklyScorePush',{role:S.role},function(r){
    if (r&&r.ok) toast('📊 Score Card ส่งแล้ว '+(r.sentCount||0)+' คน ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerMondayBrief() {
  if (!confirm('ส่ง Monday Morning Brief ให้สมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerMondayBrief',{role:S.role},function(r){
    if (r&&r.ok) toast('🌅 Monday Brief ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerMonthlyRecap() {
  if (!confirm('ส่ง Monthly Recap ให้สมาชิกทุกคนตอนนี้เลย?\n(ปกติส่งอัตโนมัติจันทร์แรกของเดือน)')) return;
  gsr('triggerMonthlyRecap',{role:S.role},function(r){
    if (r&&r.ok) toast('📊 Monthly Recap ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTrigger121Reminder() {
  if (!confirm('ส่ง 1-2-1 Auto-Reminder ให้คนที่มีนัดค้างอยู่ตอนนี้เลยไหมครับ?')) return;
  gsr('trigger121Reminder',{role:S.role},function(r){
    if (r&&r.ok) toast('⏰ 1-2-1 Reminder ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskCopyLineCommandGuide() {
  var txt = [
    'BNI IDEAL LINE Bot — คำสั่งที่สมาชิกใช้ได้',
    '',
    '📊 สถานะ — ดูคะแนนล่าสุด',
    '📈 ประวัติ — ดูสี/คะแนนย้อนหลัง',
    '🎯 ทำอะไร / next — ดูสิ่งที่ควรทำเร็วที่สุดเพื่อขยับสี',
    '🎯 เป้า — ดูเป้าสั้นใน LINE',
    '✍️ เป้า ref 8 — ตั้งเป้าสั้น เช่น Referral 8 ใบ',
    '📋 Blueprint — เปิดฟอร์มแผนธุรกิจประจำปี',
    '🆘 ขอความช่วยเหลือ — ดูวิธีแจ้งเรื่องให้ทีมดูแล',
    '',
    '🤝 แนะนำ — หาเพื่อน 1-2-1',
    'นัด [ชื่อ] — บันทึกนัด 1-2-1 เช่น นัด Pete',
    'เจอแล้ว — ปิดนัด 1-2-1 ล่าสุด',
    '',
    '🙋 ลา [เหตุผล] — แจ้งลา เช่น ลา ติดประชุมลูกค้า',
    '👥 ส่ง sub [ชื่อ] — แจ้งคนแทน เช่น ส่ง sub คุณสมชาย',
    'ยกเลิกลา — ยกเลิกรายการล่าสุด',
    '',
    '💬 ถาม [คำถาม] — ให้ AI ช่วยคิด เช่น ถาม จะเพิ่ม Referral ยังไงดี',
  ].join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(function(){toast('📋 Copy คู่มือคำสั่ง LINE แล้ว','ok');});
  } else {
    var t=document.createElement('textarea');t.value=txt;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);toast('📋 Copy คู่มือคำสั่ง LINE แล้ว','ok');
  }
}

function deskMentorBroadcast() {
  var msg = (document.getElementById('mentor-broadcast-msg').value||'').trim();
  if (!msg) { toast('กรุณาพิมพ์ข้อความก่อนครับ','err'); return; }
  var confirmTxt = S.role==='mc'
    ? 'ส่งข้อความนี้ไปยังสมาชิกทุกคน ('+msg.slice(0,40)+(msg.length>40?'…':'')+') ใช่ไหมครับ?'
    : 'ส่งข้อความนี้ไปยังทีม '+S.role+' ('+msg.slice(0,40)+(msg.length>40?'…':'')+') ใช่ไหมครับ?';
  if (!confirm(confirmTxt)) return;
  gsr('mentorBroadcast',{role:S.role,message:msg},function(r){
    if (r&&r.ok) {
      toast('📢 ส่งแล้ว '+(r.sentCount||0)+' คน ✅','ok');
      document.getElementById('mentor-broadcast-msg').value='';
    } else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTestLineToken() {
  toast('🔌 กำลังทดสอบ LINE Token...','ok');
  gsr('testLineConnection',{role:S.role},function(r){
    if (!r||!r.ok) { toast('❌ LINE Token ไม่ถูกต้อง: '+(r&&r.error||'error'),'err'); return; }
    alert('✅ LINE Bot เชื่อมต่อสำเร็จ!\n\nBot: '+r.botName+'\nFollowers: '+r.followers+' คน\nลงทะเบียนแล้ว: '+r.registered+' คน');
  });
}

function deskSetupRichMenu() {
  if (!confirm('ตั้งค่า LINE Rich Menu (เมนูถาวรที่ด้านล่าง chat)?\nต้องอัพโหลด image ผ่าน LINE OA Manager ด้วย')) return;
  gsr('setupRichMenu',{role:S.role},function(r){
    if (r&&r.ok) alert('✅ Rich Menu ตั้งค่าแล้ว!\n\n'+r.note);
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskSetupRichMenuTabs(dryRun) {
  if (!dryRun && !confirm('เปิด Rich Menu แบบ 2 หน้าให้สมาชิกที่เชื่อม LINE ทุกคนตอนนี้ใช่ไหม?\nระบบจะเก็บเมนูเดิมไว้เพื่อย้อนกลับ')) return;
  toast(dryRun?'กำลังตรวจ Rich Menu 2 หน้า…':'กำลังเปิด Rich Menu 2 หน้า…','ok');
  gsr('setupRichMenuTabs',{role:S.role,dryRun:dryRun},function(r){
    if (!r||!r.ok) { toast((r&&r.error)||'ตั้งค่า Rich Menu ไม่สำเร็จ','err'); return; }
    if (dryRun) alert('✅ Dry-run ผ่าน\n\nพบเมนู 2 หน้าและ Alias พร้อมใช้งาน\nยังไม่ได้เปลี่ยนเมนูของสมาชิก');
    else alert('✅ เปิด Rich Menu 2 หน้าแล้ว\n\nอัปเดตสมาชิก '+(r.assignedUsers||0)+' คน\nหากพบปัญหา กด “ย้อนกลับเมนูเดิม” ได้ทันที');
  });
}

function deskRollbackRichMenuTabs() {
  if (!confirm('ย้อนกลับไปใช้ Rich Menu เดิมให้สมาชิกทุกคนใช่ไหม?')) return;
  gsr('rollbackRichMenuTabs',{role:S.role},function(r){
    if (r&&r.ok) alert('✅ ย้อนกลับเมนูเดิมแล้ว\nอัปเดตสมาชิก '+(r.assignedUsers||0)+' คน');
    else toast((r&&r.error)||'ย้อนกลับไม่สำเร็จ','err');
  });
}
