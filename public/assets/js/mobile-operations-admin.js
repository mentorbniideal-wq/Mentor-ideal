(function(){
  var SB_URL='https://itwyjhlfemxsfbimshby.supabase.co';
  var SB_ANON='sb_publishable_vTX2pRpd9axDyAuMHTVhDQ_zfS1VE-j';
  var _sbClient=null;
  var _realtimeChannel=null;
  var _debounceTimer=null;

  function getSbClient(){
    if(!_sbClient&&window.supabase){
      _sbClient=window.supabase.createClient(SB_URL,SB_ANON,{realtime:{params:{eventsPerSecond:5}}});
    }
    return _sbClient;
  }

  function onScoreChange(payload){
    // Debounce: wait 1.5s after last change before refreshing
    clearTimeout(_debounceTimer);
    _debounceTimer=setTimeout(function(){
      if(!S||!S.role)return;
      // Show a subtle "data updated" toast
      var toast=document.getElementById('rt-toast');
      if(!toast){
        toast=document.createElement('div');
        toast.id='rt-toast';
        toast.style.cssText='position:fixed;bottom:72px;left:50%;transform:translateX(-50%);background:rgba(200,169,106,.15);backdrop-filter:blur(12px);border:1px solid rgba(200,169,106,.2);color:#C8A96A;padding:.4rem .9rem;border-radius:20px;font-size:.72rem;z-index:9999;transition:opacity .5s;';
        document.body.appendChild(toast);
      }
      toast.textContent='🔄 ข้อมูลอัพเดตแล้ว';
      toast.style.opacity='1';
      setTimeout(function(){toast.style.opacity='0';},3000);
      // Reload relevant section
      if(typeof loadDashboard==='function'&&S.role==='mc')loadDashboard();
      if(typeof loadMentorPerformance==='function'&&S.role!=='mc'&&S.role!=='growth')loadMentorPerformance();
    },1500);
  }

  function setupRealtime(){
    var client=getSbClient();
    if(!client){
      loadSupabaseSdk().then(setupRealtime).catch(function(){/* Realtime is optional; core app remains usable. */});
      return;
    }
    if(_realtimeChannel){client.removeChannel(_realtimeChannel);}
    _realtimeChannel=client.channel('score-updates')
      .on('postgres_changes',{event:'*',schema:'public',table:'members'},onScoreChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'r2y_stats'},onScoreChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'monthly_scores'},onScoreChange)
      .subscribe(function(status){
        if(status==='SUBSCRIBED'){console.log('[Realtime] connected');}
      });
  }

  // Hook into login success — S.role is set after login
  var _origLoginOk=window._realtimeHooked;
  if(!_origLoginOk){
    window._realtimeHooked=true;
    var _check=setInterval(function(){
      if(S&&S.role&&!_realtimeChannel){
        setupRealtime();
        clearInterval(_check);
      }
    },500);
  }
})();

// ── Admin Panel ────────────────────────────────────────────────
function openAdminPanel(){
  if(!S||!S.isSystemOwner){toast('เฉพาะเจ้าของระบบเท่านั้นที่เปิด Setting ได้');return;}
  var el=document.getElementById('admin-panel-modal');
  if(!el)return;
  el.style.display='flex';
  var cr=document.getElementById('admin-cur-role');
  if(cr)cr.textContent=(S.role||'').toUpperCase();
  var vi=document.getElementById('admin-ver-info');
  if(vi){var vn=document.getElementById('verNum');vi.textContent=vn?vn.textContent:'—';}
  _adminLoadEmails();
}
function closeAdminPanel(){
  var el=document.getElementById('admin-panel-modal');
  if(el)el.style.display='none';
}
function _adminLoadEmails(){
  var el=document.getElementById('admin-email-list');
  if(!el)return;
  el.textContent='⏳ กำลังโหลด...';
  call('getAdminEmails',{},function(err,r){
    if(err||!r||!r.ok){el.textContent='❌ '+(err?err.message:(r&&r.error)||'โหลดไม่ได้');return;}
    var emails=r.emails||[];
    if(!emails.length){el.innerHTML='<div style="color:#64748b;font-style:italic;padding:4px 0;">ยังไม่มีอีเมล</div>';return;}
    el.innerHTML=emails.map(function(e){
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">'
        +'<div style="flex:1;">'
        +'<div style="color:#e2e8f0;font-size:12px;">'+escHtml(e.email)+'</div>'
        +(e.label?'<div style="color:#94a3b8;font-size:11px;">'+escHtml(e.label)+'</div>':'')
        +'</div>'
        +'<button onclick="adminRemoveEmail(\''+escHtml(e.email)+'\')" style="background:none;border:1px solid rgba(248,113,113,.3);color:#f87171;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:\'Sarabun\',sans-serif;">ลบ</button>'
        +'</div>';
    }).join('');
  });
}
function adminAddEmail(){
  var emailEl=document.getElementById('admin-email-input');
  var labelEl=document.getElementById('admin-email-label');
  var errEl=document.getElementById('admin-email-error');
  var email=(emailEl?emailEl.value.trim().toLowerCase():'');
  var label=(labelEl?labelEl.value.trim():'');
  if(errEl)errEl.textContent='';
  if(!email||!email.includes('@')){if(errEl)errEl.textContent='กรุณากรอกอีเมลที่ถูกต้อง';return;}
  call('addAdminEmail',{email:email,label:label},function(err,r){
    if(err||!r||!r.ok){if(errEl)errEl.textContent=(err?err.message:(r&&r.error)||'เพิ่มไม่สำเร็จ');return;}
    if(emailEl)emailEl.value='';
    if(labelEl)labelEl.value='';
    _adminLoadEmails();
  });
}
function adminRemoveEmail(email){
  if(!confirm('ลบ '+email+' ออกจาก whitelist?'))return;
  call('removeAdminEmail',{email:email},function(err,r){
    if(err||!r||!r.ok){toast('❌ ลบไม่สำเร็จ');return;}
    _adminLoadEmails();
  });
}

// ── Quick Role Switcher ─────────────────────────────────────────
var _cachedRoles={};  // role -> {role,isMC,teamName,displayName,token,version,versionDate}
var _rsSwitchTarget=null;

function openRoleSwitcher(){
  if(!S||!S.isSystemOwner){toast('บัญชีนี้เข้าใช้งานตามหน้าที่โดยอัตโนมัติ');return;}
  var el=document.getElementById('role-switcher-modal');
  if(!el)return;
  // Mark buttons that are cached (no PIN needed)
  el.querySelectorAll('.rs-role-btn[data-role]').forEach(function(b){
    var r=b.getAttribute('data-role');
    b.querySelector('.rs-cached-dot').style.display=_cachedRoles[r]?'inline':'none';
  });
  el.style.display='flex';
}
function closeSwitcher(){
  var el=document.getElementById('role-switcher-modal');
  if(el)el.style.display='none';
  var ps=document.getElementById('rs-pin-section');
  if(ps)ps.style.display='none';
  var pi=document.getElementById('rs-pin-input');
  if(pi)pi.value='';
  var er=document.getElementById('rs-error');
  if(er)er.textContent='';
  _rsSwitchTarget=null;
}
function rsSwitchTo(role){
  if(_cachedRoles[role]){
    closeSwitcher();
    if(_cachedRoles[role].pin){S.pin=_cachedRoles[role].pin;}
    if(_cachedRoles[role].token){S.token=_cachedRoles[role].token;}
    _doRoleSwitch(_cachedRoles[role]);return;
  }
  // If user has a Google OAuth token and is MC/TOOMTAM, bypass PIN via viewAsRole
  if(S.token&&(S.isMC||S.role==='toomtam')){
    closeSwitcher();
    fetch(SUPABASE_API,{method:'POST',headers:API_HEADERS,body:JSON.stringify({action:'viewAsRole',token:S.token,targetRole:role})})
      .then(function(res){return res.json();})
      .then(function(r){
        if(r.ok){_doRoleSwitch(r);}
        else{// Fallback: show PIN entry
          _rsSwitchTarget=role;
          var el=document.getElementById('role-switcher-modal');
          if(el)el.style.display='flex';
          var rn=document.getElementById('rs-target-name');
          if(rn)rn.textContent=role.toUpperCase();
          var ps=document.getElementById('rs-pin-section');
          if(ps)ps.style.display='block';
          var pi=document.getElementById('rs-pin-input');
          if(pi){pi.focus();pi.value='';}
          var er=document.getElementById('rs-error');
          if(er)er.textContent=r.error||'ต้องใช้ PIN';
        }
      })
      .catch(function(){
        _rsSwitchTarget=role;
        var el=document.getElementById('role-switcher-modal');
        if(el)el.style.display='flex';
      });
    return;
  }
  _rsSwitchTarget=role;
  var rn=document.getElementById('rs-target-name');
  if(rn)rn.textContent=role.toUpperCase();
  var ps=document.getElementById('rs-pin-section');
  if(ps)ps.style.display='block';
  var pi=document.getElementById('rs-pin-input');
  if(pi){pi.focus();pi.value='';}
  var er=document.getElementById('rs-error');
  if(er)er.textContent='';
}
function rsConfirmPin(){
  var pin=(document.getElementById('rs-pin-input').value||'').trim();
  if(!pin||!_rsSwitchTarget){return;}
  var er=document.getElementById('rs-error');
  if(er)er.textContent='';
  fetch(SUPABASE_API,{method:'POST',headers:API_HEADERS,body:JSON.stringify({action:'login',role:_rsSwitchTarget,pin:pin})})
    .then(function(res){return res.json();})
    .then(function(r){
      if(!r.ok){if(er)er.textContent='PIN ไม่ถูกต้อง';return;}
      if(r.role!==_rsSwitchTarget){if(er)er.textContent='PIN นี้เป็นของ '+r.role.toUpperCase()+' ไม่ใช่ '+_rsSwitchTarget.toUpperCase();return;}
      closeSwitcher();
      S.pin=pin;
      storeSession({role:r.role,pin:pin,displayName:r.displayName,isMC:r.isMC,teamName:r.teamName});
      _doRoleSwitch(r);
    })
    .catch(function(){if(er)er.textContent='เกิดข้อผิดพลาด กรุณาลองใหม่';});
}
function _doRoleSwitch(r){
  document.getElementById('mcApp').classList.remove('on');
  document.getElementById('mentorApp').classList.remove('on');
  document.getElementById('growthApp').classList.remove('on');
  S.role=null;S.isMC=false;S.teamName=null;S.displayName=null;
  S.allMembers=[];S.teamMembers=[];S.curFilter='all';S.curMFilter='all';S.curMentorFilter='all';
  GS={members:[],curFilter:'all',loaded:false,taskFilter:'all'};
  enterApp(r);
}
