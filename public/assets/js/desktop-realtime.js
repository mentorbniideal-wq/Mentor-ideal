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

  function showRealtimeToast(msg){
    var toast=document.getElementById('rt-toast');
    if(!toast){
      toast=document.createElement('div');
      toast.id='rt-toast';
      toast.style.cssText='position:fixed;bottom:24px;right:24px;background:var(--sf);border:1px solid var(--bd);color:var(--tx);padding:.5rem 1rem;border-radius:12px;font-size:.75rem;z-index:9999;transition:opacity .5s;box-shadow:var(--sh-float);';
      document.body.appendChild(toast);
    }
    toast.textContent=msg;
    toast.style.opacity='1';
    setTimeout(function(){toast.style.opacity='0';},4000);
  }

  function onScoreChange(){
    clearTimeout(_debounceTimer);
    _debounceTimer=setTimeout(function(){
      showRealtimeToast('🔄 ข้อมูลสมาชิกอัพเดตแล้ว');
      // Reload the active MC view
      if(typeof reload==='function')reload();
    },2000);
  }

  function onAlertChange(){
    clearTimeout(_debounceTimer);
    _debounceTimer=setTimeout(function(){
      showRealtimeToast('⚠️ Core Issues อัพเดตแล้ว');
      if(typeof loadAlerts==='function')loadAlerts();
    },2000);
  }

  function setupRealtime(){
    var client=getSbClient();
    if(!client){loadSupabaseSdk().then(setupRealtime).catch(function(){/* Realtime is optional. */});return;}
    if(_realtimeChannel){client.removeChannel(_realtimeChannel);}
    _realtimeChannel=client.channel('dash-realtime')
      .on('postgres_changes',{event:'*',schema:'public',table:'members'},onScoreChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'r2y_stats'},onScoreChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'monthly_scores'},onScoreChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'core_issues'},onAlertChange)
      .subscribe(function(status){
        if(status==='SUBSCRIBED'){
          console.log('[Realtime] dashboard connected');
          // Update connection indicator if exists
          var ind=document.getElementById('rt-indicator');
          if(ind){ind.style.background='var(--gr)';ind.title='Live updates active';}
        }
      });
  }

  // Watch for login and start realtime
  var _check=setInterval(function(){
    if(window.S&&window.S.role&&!_realtimeChannel){
      setupRealtime();
      clearInterval(_check);
    }
  },500);
})();
function bootDesktop(){
  var savedTheme=localStorage.getItem('theme');
  if(savedTheme!=='light'){
    document.body.classList.add('dark');
    const btn=document.getElementById('themeBtn');
    if(btn) btn.textContent='☀️';
    const mc=document.querySelector('meta[name="theme-color"]');
    if(mc) mc.content='#0E1110';
  }
  if(typeof loadPublicTeamLabels==='function')loadPublicTeamLabels().finally(checkSession);
  else checkSession();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootDesktop,{once:true});
else bootDesktop();

// ── AI Copilot ─────────────────────────────────────────────────────
var _copHistory = [];
function copilotSend(preset) {
  var input = document.getElementById('cop-input');
  var text = (preset || input.value || '').trim();
  if (!text || text.length < 3) return;
  if (!preset) input.value = '';
  input.style.height = 'auto';

  // Hide suggestions / empty state
  var empty = document.getElementById('cop-empty');
  if (empty) { empty.style.display = 'none'; }

  copAppendBubble('user', text);

  var loadId = 'cop-load-' + Date.now();
  copAppendBubble('bot', '⏳ กำลังคิด...', loadId);

  var btn = document.getElementById('cop-send-btn');
  btn.disabled = true;

  var requestHistory=_copHistory.slice(-6);
  _copHistory.push({role:'user',content:text});
  gsr('askCopilot', { question: text, history: requestHistory }, function(r) {
    btn.disabled = false;
    var el = document.getElementById(loadId);
    if (el) el.remove();
    if (r.ok && r.answer) {
      copAppendBubble('bot', r.answer);
      _copHistory.push({role:'assistant',content:r.answer});
      if(r.grounding) copAppendGrounding(r.grounding);
    } else {
      copAppendBubble('bot', '❌ ' + (r.error || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'));
    }
  });
}

function copAppendGrounding(g){
  var msgs=document.getElementById('cop-msgs');
  if(!msgs)return;
  var el=document.createElement('div');
  el.style.cssText='align-self:flex-start;margin-left:36px;font-size:10px;color:var(--sub);background:var(--sf2);border:1px solid var(--bd);border-radius:999px;padding:4px 9px';
  el.textContent='🔎 อิง '+Number(g.memberCount||0)+' สมาชิก · '+(g.teamScope==='chapter'?'Chapter':g.teamScope||'ตามสิทธิ์')+' · Read-only';
  msgs.appendChild(el);
}

function copAppendBubble(role, text, id) {
  var msgs = document.getElementById('cop-msgs');
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;' + (role === 'user' ? 'flex-direction:row-reverse' : '');
  if (id) row.id = id;

  var avatar = document.createElement('div');
  avatar.style.cssText = 'width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;margin-top:2px;' +
    (role === 'user' ? 'background:var(--ac);' : 'background:var(--sf);border:1px solid var(--bd);');
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  var bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;' +
    (role === 'user'
      ? 'background:var(--ac);color:#000;border-bottom-right-radius:3px;'
      : 'background:var(--sf);border:1px solid var(--bd);color:var(--tx);border-top-left-radius:3px;');
  bubble.textContent = text;

  row.appendChild(avatar);
  row.appendChild(bubble);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function copilotClear() {
  _copHistory=[];
  var msgs = document.getElementById('cop-msgs');
  msgs.innerHTML = '';
  // Re-add empty state
  msgs.innerHTML = '<div id="cop-empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--sub);gap:8px;text-align:center"><div style="font-size:2rem">🤖</div><div style="font-size:13px;font-weight:600">เริ่มจากสิ่งที่ Mentor ต้องตัดสินใจ</div><div id="cop-suggestions" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px"><button onclick="copilotSend(this.textContent)" class="bsm" style="font-size:11px">วันนี้ควรดูแลใครก่อน เพราะอะไร?</button><button onclick="copilotSend(this.textContent)" class="bsm" style="font-size:11px">สรุปงานค้างและจัดลำดับ</button><button onclick="copilotSend(this.textContent)" class="bsm" style="font-size:11px">ช่วยวางแผนคุยกับสมาชิกที่ต้องดูแลที่สุด</button></div></div>';
}

// ── BNI Events Calendar ─────────────────────────────────────────────
var _calCache = null;
function loadCalendar(force) {
  var audience = (document.getElementById('cal-audience')||{value:'all'}).value;
  var daysAhead = (document.getElementById('cal-days')||{value:'60'}).value;
  var list = document.getElementById('cal-list');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--sub)">⏳ กำลังโหลด...</div>';
  gsr('getTrainingEvents', {audience: audience, daysAhead: parseInt(daysAhead)}, function(r) {
    if (!r.ok || !r.events || !r.events.length) {
      list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--sub)"><div style="font-size:28px;margin-bottom:8px">📅</div><div>ไม่มี Event ในช่วงที่เลือก</div></div>';
      return;
    }
    var CAT_COLOR = {msp:'#06C755',advanced:'var(--gr)',skill:'#60a5fa','121':'#60a5fa',networking:'#60a5fa',lt:'var(--ye)',club:'#a78bfa',event:'#f472b6'};
    var CAT_TH = {msp:'MSP',advanced:'Advanced MSP',skill:'ฝึกอบรม','121':'1-2-1 Training',networking:'Networking',lt:'LT',club:'Club',event:'งาน'};
    // Group by month
    var months = {};
    r.events.forEach(function(e) {
      var d = new Date(e.date);
      var mk = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      if (!months[mk]) months[mk] = [];
      months[mk].push(e);
    });
    var MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    var DAY_TH   = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
    var html = '';
    Object.keys(months).sort().forEach(function(mk) {
      var parts = mk.split('-');
      var mLabel = MONTH_TH[parseInt(parts[1])-1]+' '+parts[0];
      html += '<div style="margin-bottom:20px">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--bd)">'+mLabel+'</div>';
      months[mk].forEach(function(e) {
        var d = new Date(e.date);
        var dayTh = DAY_TH[d.getDay()];
        // API now returns: title, course, format ('online'/'onsite'), time ('HH:MM-HH:MM'), ceu
        var color = CAT_COLOR[e.course]||'#94a3b8';
        var catTh = CAT_TH[e.course]||e.course||'';
        var time = e.time || '';
        var badge = e.ceu ? '<span style="background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.4);border-radius:4px;font-size:10px;padding:1px 5px;margin-left:6px">+'+e.ceu+' CEU</span>' : '';
        var isOnline = e.format === 'online';
        var onlineBadge = isOnline ? '<span style="background:rgba(96,165,250,.12);color:#60a5fa;border:1px solid rgba(96,165,250,.35);border-radius:4px;font-size:10px;padding:1px 5px;margin-left:4px">Online</span>' : '';
        var locStr = e.location && !isOnline ? '<div style="font-size:10px;color:var(--sub);margin-top:2px">📍 '+e.location+'</div>' : '';
        html += '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;background:var(--sf2);border-radius:8px;margin-bottom:6px;border-left:3px solid '+color+'">';
        html += '<div style="min-width:40px;text-align:center">';
        html += '<div style="font-size:18px;font-weight:700;color:'+color+';line-height:1">'+d.getDate()+'</div>';
        html += '<div style="font-size:10px;color:var(--sub)">'+dayTh+'</div>';
        html += '</div>';
        html += '<div style="flex:1;min-width:0">';
        html += '<div style="font-size:13px;font-weight:600;margin-bottom:2px">'+(e.title||'')+badge+onlineBadge+'</div>';
        html += '<div style="font-size:11px;color:var(--sub)">'+catTh+(time?' · '+time:'')+'</div>';
        html += locStr;
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    });
    list.innerHTML = html;
  });
}
