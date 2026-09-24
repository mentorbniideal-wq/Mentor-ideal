(function(){
  'use strict';

  function number(v,d){
    var n=Number(v);if(!Number.isFinite(n))n=0;
    return n.toLocaleString('th-TH',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});
  }
  function money(v){return '฿'+number(v,0);}
  function displayName(member){return member.nickname||member.name||'—';}
  function coverageFor(state){
    if(state&&state.coverage&&Array.isArray(state.coverage.members))return state.coverage;
    var year=Number(state&&state.year)||new Date().getFullYear();
    var members=(state&&state.rows||[]).map(function(row){
      return {memberId:String(row.memberId||''),name:row.name||'',nickname:row.nickname||'',years:row.status==='missing'?[]:[{year:year,status:row.status==='submitted'?'submitted':'draft',updatedAt:null}]};
    });
    var submitted=members.filter(function(member){return member.years[0]&&member.years[0].status==='submitted';}).length;
    var draft=members.filter(function(member){return member.years[0]&&member.years[0].status==='draft';}).length;
    return {availableYears:[year],byYear:[{year:year,totalMembers:members.length,submitted:submitted,draft:draft,missing:Math.max(0,members.length-submitted-draft)}],members:members};
  }
  function yearEntry(member,year){return (member.years||[]).find(function(entry){return Number(entry.year)===Number(year);})||null;}
  function statusLabel(entry){return !entry?'ยังไม่กรอก':entry.status==='submitted'?'ส่งแล้ว':'Draft';}
  function statusClass(entry){return !entry?'missing':entry.status==='submitted'?'submitted':'draft';}
  function currentLists(coverage,year){
    var submitted=[],draft=[],missing=[];
    (coverage.members||[]).forEach(function(member){
      var entry=yearEntry(member,year),target=!entry?missing:entry.status==='submitted'?submitted:draft;
      target.push(member);
    });
    return {submitted:submitted,draft:draft,missing:missing};
  }

  function render(state){
    var root=document.getElementById('msb-gr-meeting-summary');if(!root)return;
    var coverage=coverageFor(state),year=Number(state.year)||new Date().getFullYear();
    var lists=currentLists(coverage,year),total=(coverage.members||[]).length;
    var yearly=(coverage.byYear||[]).map(function(item){
      return '<span class="lac-tag" style="font-weight:800">'+esc(item.year)+' · ส่งแล้ว '+number(item.submitted,0)+' / '+number(item.totalMembers,0)+'</span>';
    }).join('');
    var pending=lists.draft.concat(lists.missing);
    var pendingNames=pending.slice(0,10).map(function(member){
      var entry=yearEntry(member,year);
      return '<span style="border:1px solid '+(entry?'rgba(199,167,106,.35)':'rgba(248,113,113,.3)')+';border-radius:999px;padding:5px 8px;font-size:10px">'+esc(displayName(member))+' · '+esc(statusLabel(entry))+'</span>';
    }).join('');
    var matrix=(coverage.members||[]).map(function(member){
      var statuses=(coverage.availableYears||[]).map(function(y){
        var entry=yearEntry(member,y),cls=statusClass(entry),color=cls==='submitted'?'var(--gr)':cls==='draft'?'var(--ye)':'var(--re)';
        return '<span style="color:'+color+';font-weight:800;white-space:nowrap">'+esc(y)+' '+esc(statusLabel(entry))+'</span>';
      }).join(' · ');
      return '<tr><td><b>'+esc(displayName(member))+'</b><div style="font-size:10px;color:var(--sub)">'+esc(member.name||'')+'</div></td><td style="white-space:normal">'+(statuses||'—')+'</td></tr>';
    }).join('');
    root.innerHTML='<section style="background:linear-gradient(135deg,rgba(199,167,106,.12),rgba(29,185,126,.06));border:1px solid rgba(199,167,106,.3);border-radius:16px;padding:16px">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><div style="font-size:10px;color:var(--ac);font-weight:900;letter-spacing:.08em">BLUEPRINT MEETING SUMMARY</div><h3 style="font-size:16px;margin:4px 0 0">สถานะการกรอกปี '+esc(year)+'</h3><div style="font-size:11px;color:var(--sub);margin-top:4px">ตรวจคนที่ส่งแล้ว Draft และผู้ที่ยังตกหล่นก่อนประชุม</div></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button type="button" class="bsm" onclick="copyBlueprintMeetingSummary()" style="font-weight:900">📋 Copy สรุปส่ง LINE</button><button type="button" class="bsm" onclick="msbExportPdf(&quot;gr&quot;)" style="background:var(--ac);color:#111;border-color:transparent;font-weight:900">📄 Save as PDF</button></div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:14px"><div class="kc"><div class="kl">สมาชิกทั้งหมด</div><div class="kv">'+number(total,0)+'</div></div><div class="kc"><div class="kl">ส่งแล้ว</div><div class="kv" style="color:var(--gr)">'+number(lists.submitted.length,0)+'</div></div><div class="kc"><div class="kl">Draft</div><div class="kv" style="color:var(--ye)">'+number(lists.draft.length,0)+'</div></div><div class="kc"><div class="kl">ยังไม่กรอก</div><div class="kv" style="color:var(--re)">'+number(lists.missing.length,0)+'</div></div></div>'
      +'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">'+(yearly||'<span style="font-size:11px;color:var(--sub)">ยังไม่มีข้อมูลรายปี</span>')+'</div>'
      +'<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--bd)"><div style="font-size:11px;font-weight:900;margin-bottom:8px">คนที่ต้องติดตาม '+number(pending.length,0)+' คน</div><div style="display:flex;gap:6px;flex-wrap:wrap">'+(pendingNames||'<span style="font-size:11px;color:var(--gr)">✅ ครบทุกคนแล้ว</span>')+(pending.length>10?'<span style="font-size:10px;color:var(--sub);padding:5px">และอีก '+number(pending.length-10,0)+' คน</span>':'')+'</div></div>'
      +'<details style="margin-top:12px"><summary style="cursor:pointer;font-size:11px;font-weight:900;color:var(--ac)">ดูว่าแต่ละคนมีข้อมูลปีใดบ้าง</summary><div style="overflow-x:auto;margin-top:8px;max-height:320px"><table class="tbl"><thead><tr><th>สมาชิก</th><th>สถานะรายปี</th></tr></thead><tbody>'+matrix+'</tbody></table></div></details></section>';
  }

  function buildPdf(group,state){
    group=group==='gr'?'gr':'mc';state=state||{};
    var year=Number(state.year)||new Date().getFullYear(),coverage=coverageFor(state),lists=currentLists(coverage,year);
    var rows=(state.rows||[]).filter(function(row){return row&&row.status==='submitted'&&row.blueprint;});
    var safePlanByMember={};
    (state.intelRows||[]).forEach(function(row){if(row&&row.memberId)safePlanByMember[String(row.memberId)]=row;});
    var totalGoal=rows.reduce(function(sum,row){return sum+(Number(row.blueprint.expected_sales_from_bni_year)||0);},0);
    var totalReferrals=rows.reduce(function(sum,row){return sum+(Number(row.blueprint.referral_needed)||0);},0);
    var generatedAt=new Date().toLocaleString('th-TH',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Bangkok'});
    function safeCategories(plan,key){var values=plan&&Array.isArray(plan[key])?plan[key]:[];return values.length?values.slice(0,6).map(esc).join(', '):'<span class="muted">ไม่แสดง / ไม่ได้อนุญาต</span>';}
    function nameList(items){return items.length?items.map(function(member){return esc(displayName(member));}).join(', '):'—';}
    var yearHead=(coverage.availableYears||[]).map(function(y){return '<th>'+esc(y)+'</th>';}).join('');
    var coverageRows=(coverage.members||[]).map(function(member,index){
      var cells=(coverage.availableYears||[]).map(function(y){var entry=yearEntry(member,y);return '<td class="'+statusClass(entry)+'">'+esc(statusLabel(entry))+'</td>';}).join('');
      return '<tr><td class="center">'+(index+1)+'</td><td><strong>'+esc(displayName(member))+'</strong><div class="muted">'+esc(member.name||'')+'</div></td>'+cells+'</tr>';
    }).join('');
    var detailRows=rows.map(function(row,index){
      var b=row.blueprint||{},plan=safePlanByMember[String(row.memberId)]||{};
      return '<tr><td class="center">'+(index+1)+'</td><td><strong>'+esc(displayName(row))+'</strong><div class="muted">'+esc(row.name||'')+'</div></td><td class="num">'+money(b.total_sales_target_year)+'</td><td class="num"><strong>'+money(b.expected_sales_from_bni_year)+'</strong><div class="muted">เดิม '+money(b.existing_customer_revenue_from_bni)+' · ใหม่ '+money(b.new_customer_revenue_from_bni)+'</div></td><td class="num">'+money(b.average_customer_value_year)+'</td><td class="num">'+number(b.conversion_rate_percent,1)+'%</td><td class="num">'+number(b.customer_needed,0)+'</td><td class="num">'+number(b.referral_needed,0)+'<div class="muted">'+number(b.referral_per_week,1)+'/สัปดาห์</div></td><td>'+safeCategories(plan,'lookingForCategories')+'</td><td>'+safeCategories(plan,'powerTeamCategories')+'</td></tr>';
    }).join('');
    var empty='<tr><td colspan="10" class="empty">ยังไม่มี Blueprint ที่ส่งสมบูรณ์ในปี '+esc(year)+'</td></tr>';
    return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Blueprint Meeting Summary '+esc(year)+'</title><style>@page{size:A4 landscape;margin:12mm 10mm 14mm}*{box-sizing:border-box}body{font-family:"Noto Sans Thai","Thonburi","Tahoma",sans-serif;color:#17221c;margin:0;font-size:9px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid #b89045;padding-bottom:10px;margin-bottom:10px}h1{font-size:21px;margin:0 0 3px}h2{font-size:13px;margin:15px 0 7px;color:#274c3a}.eyebrow{color:#98752f;font-weight:800;letter-spacing:.12em;font-size:8px}.meta{text-align:right;color:#59645d;line-height:1.55}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-bottom:10px}.stat,.follow{border:1px solid #d8ddd9;border-radius:8px;padding:7px 9px;background:#f8faf8}.stat b{display:block;font-size:15px;color:#274c3a;margin-top:2px}.follow{line-height:1.5;margin:6px 0}.follow strong{color:#9f1239}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{background:#274c3a;color:#fff;padding:7px 5px;text-align:left;font-size:8px}td{border-bottom:1px solid #dfe4e0;padding:6px 5px;vertical-align:top;line-height:1.35;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f7f9f7}.center{text-align:center}.num{text-align:right;white-space:nowrap}.muted{color:#718078;font-size:7px;margin-top:2px}.submitted{color:#157347;font-weight:800}.draft{color:#8a6417;font-weight:800}.missing{color:#9f1239;font-weight:800}.empty{text-align:center;padding:30px;color:#718078}.privacy{margin-top:9px;padding:7px 9px;border:1px solid #e1d5bd;background:#fffaf0;border-radius:7px;color:#6f5a32;font-size:8px}.footer{position:fixed;bottom:-9mm;left:0;right:0;text-align:center;color:#87918b;font-size:7px}.footer:after{content:" · หน้า " counter(page)}.page-break{break-before:page}@media screen{body{padding:24px;background:#eef1ee}header,.summary,.follow,table,.privacy,h2{max-width:1280px;margin-left:auto;margin-right:auto}}</style></head><body>'
      +'<header><div><div class="eyebrow">MY IDEAL · MEMBER SUCCESS BLUEPRINT</div><h1>Blueprint Meeting Summary ปี '+esc(year)+'</h1><div>ข้อมูลตามสิทธิ์ของบัญชีและ Chapter ปัจจุบัน</div></div><div class="meta">สร้างเมื่อ '+esc(generatedAt)+'<br>เฉพาะข้อมูลที่ระบบอนุญาตให้ใช้ในการประชุม</div></header>'
      +'<section class="summary"><div class="stat"><span>สมาชิกทั้งหมด</span><b>'+number((coverage.members||[]).length,0)+'</b></div><div class="stat"><span>ส่งแล้ว</span><b>'+number(lists.submitted.length,0)+'</b></div><div class="stat"><span>Draft</span><b>'+number(lists.draft.length,0)+'</b></div><div class="stat"><span>ยังไม่กรอก</span><b>'+number(lists.missing.length,0)+'</b></div><div class="stat"><span>เป้าจาก BNI รวม</span><b>'+money(totalGoal)+'</b></div></section>'
      +'<div class="follow"><strong>ต้องติดตาม:</strong> '+nameList(lists.draft.concat(lists.missing))+'<br><strong>ส่งแล้ว:</strong> '+nameList(lists.submitted)+'</div>'
      +'<h2>สถานะ Blueprint รายคนและรายปี</h2><table><thead><tr><th style="width:4%">#</th><th style="width:22%">สมาชิก</th>'+yearHead+'</tr></thead><tbody>'+coverageRows+'</tbody></table>'
      +'<h2 class="page-break">รายละเอียด Blueprint ที่ส่งสมบูรณ์ ปี '+esc(year)+'</h2><table><thead><tr><th>#</th><th>สมาชิก</th><th>เป้ารวม/ปี</th><th>เป้าจาก BNI</th><th>มูลค่า/ลูกค้า</th><th>Conversion</th><th>ลูกค้า</th><th>Referral</th><th>Looking For</th><th>Power Team</th></tr></thead><tbody>'+(detailRows||empty)+'</tbody></table>'
      +'<div class="privacy">รายงานนี้ไม่รวมรายละเอียดข้อความอิสระ, Mentor/MY121 notes หรือข้อมูลที่สมาชิกไม่ได้อนุญาต หมวด Looking For และ Power Team มาจาก DTO ที่ผ่าน consent policy เท่านั้น · Referral ที่ต้องการรวม '+number(totalReferrals,0)+'</div><div class="footer">MY IDEAL · Blueprint Meeting Summary '+esc(year)+'</div><script>window.onload=function(){setTimeout(function(){window.print();},150)};<\/script></body></html>';
  }

  function buildCopyText(state){
    state=state||{};
    var year=Number(state.year)||new Date().getFullYear(),coverage=coverageFor(state),lists=currentLists(coverage,year);
    var pending=lists.draft.concat(lists.missing);
    var lines=[
      '📊 Blueprint Meeting Summary ปี '+year,
      'สมาชิกทั้งหมด '+number((coverage.members||[]).length,0)+' คน',
      '✅ ส่งแล้ว '+number(lists.submitted.length,0)+' คน',
      '📝 Draft '+number(lists.draft.length,0)+' คน',
      '⏳ ยังไม่กรอก '+number(lists.missing.length,0)+' คน',
      '',
      'สถานะรายปี'
    ];
    (coverage.byYear||[]).forEach(function(item){
      lines.push('• '+item.year+': ส่งแล้ว '+number(item.submitted,0)+'/'+number(item.totalMembers,0)+' · Draft '+number(item.draft,0)+' · ยังไม่กรอก '+number(item.missing,0));
    });
    lines.push('','ผู้ที่ต้องติดตาม ('+number(pending.length,0)+' คน)');
    lines.push(pending.length?pending.map(function(member){
      var entry=yearEntry(member,year);
      return '• '+displayName(member)+' — '+statusLabel(entry);
    }).join('\n'):'✅ ครบทุกคนแล้ว');
    lines.push('','อัปเดตจาก MY IDEAL · กรุณาตรวจ Dashboard ก่อนประชุม');
    return lines.join('\n').slice(0,4500);
  }

  function copyText(){
    var state=window.MSB&&window.MSB.gr;
    if(!state||!state.loaded){toast('กรุณารอให้ข้อมูล Blueprint โหลดเสร็จก่อน Copy','warn');return;}
    var text=buildCopyText(state);
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){toast('คัดลอกสรุปสำหรับส่ง LINE แล้ว','ok');}).catch(function(){prompt('คัดลอกสรุปนี้',text);});
    }else prompt('คัดลอกสรุปนี้',text);
  }

  function exportPdf(group){
    group=group==='gr'?'gr':'mc';
    var state=window.MSB&&window.MSB[group];
    if(!state||!state.loaded){toast('กรุณารอให้ข้อมูล Blueprint โหลดเสร็จก่อน Export','warn');return;}
    var w=window.open('','_blank','width=1280,height=820');
    if(!w){toast('กรุณาอนุญาต Popup แล้วลอง Save as PDF อีกครั้ง','err');return;}
    w.document.open();w.document.write(buildPdf(group,state));w.document.close();
  }

  window.BlueprintMeetingSummary={render:render,buildPdf:buildPdf,buildCopyText:buildCopyText,coverageFor:coverageFor};
  window.copyBlueprintMeetingSummary=copyText;
  window.msbBuildBlueprintPdfReport=buildPdf;
  window.msbExportPdf=exportPdf;
})();
