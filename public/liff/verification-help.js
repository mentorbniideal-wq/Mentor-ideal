// Member-owned verification UI; requests never contain a verification code.
async function startVerify121(pairId) {
  const flow = document.querySelector('#otoFlow');
  if (!flow) return;
  const panel = document.createElement('div');
  panel.className = 'oto-panel';
  panel.innerHTML = '<b>กำลังเปิดรหัสรับรอง…</b><p class="hint" role="status">กรุณารอสักครู่</p>';
  flow.replaceChildren(panel);
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  let result;
  try { result = preview ? {ok:true,legacy:true,message:'ตัวอย่าง: รหัสรุ่นเก่าต้องให้ผู้ดูแลตรวจสอบ'} : await api({action:'start-one-to-one-verification',pairId}); }
  catch { result = {ok:false,error:'เชื่อมต่อไม่สำเร็จ กรุณาลองโหลดรหัสอีกครั้ง'}; }
  if (flow.firstChild !== panel) return;
  if (result.complete) {
    panel.innerHTML = '<b>รับรองครบแล้ว</b><p class="hint">สมาชิกในคู่รับรองครบแล้ว ไม่ต้องขอรีเซ็ตหรือกรอกรหัสอีก</p>';
    return;
  }
  const code = /^\d{6}$/.test(String(result.code || '')) ? String(result.code) : '';
  panel.innerHTML = '<b>รับรองร่วมกันว่าได้พบกันแล้ว</b><p class="hint">แสดงรหัสของคุณให้คู่สนทนาหลังพบกันแล้ว</p>';
  const message = document.createElement('p'); message.className='hint'; message.setAttribute('role','status');
  message.textContent = result.error || result.message || (code ? 'รหัสของคุณจะแสดงจนกว่าจะรับรองครบ' : 'ยังไม่พบรหัส ลองโหลดอีกครั้งหรือแจ้งผู้ดูแล');
  if(code) {
    const display=document.createElement('div');display.className='oto-code';display.textContent=code;panel.appendChild(display);
    const copy=document.createElement('button');copy.type='button';copy.className='oto-code-copy';copy.textContent='คัดลอกรหัส 6 หลัก';copy.onclick=()=>copyVerify121Code(code,copy);panel.appendChild(copy);
  }
  panel.appendChild(message);
  if(result.ok && !result.legacy) {
    if(result.ownVerified) {
      const done=document.createElement('p');done.className='hint';done.textContent='คุณรับรองแล้ว รอสมาชิกที่เหลือรับรอง';panel.appendChild(done);
    } else {
      const label=document.createElement('label');label.htmlFor='otoPartnerCode';label.textContent='กรอกรหัส 6 หลักของคู่คุณ';
      const input=document.createElement('input');input.id='otoPartnerCode';input.inputMode='numeric';input.maxLength=6;input.placeholder='000000';input.autocomplete='off';
      const submit=document.createElement('button');submit.type='button';submit.className='submit';submit.textContent='รับรองว่าพบกันแล้ว';submit.onclick=()=>submitVerify121(pairId);
      panel.append(label,input,submit);
    }
  }
  const retry=document.createElement('button');retry.type='button';retry.className='p121-shortcut';retry.textContent='ลองโหลดรหัสอีกครั้ง';retry.style.marginTop='12px';retry.onclick=()=>startVerify121(pairId);
  const request=document.createElement('button');request.type='button';request.className='p121-shortcut';request.textContent='แจ้งปัญหารหัส / ขอรีเซ็ต';request.style.marginTop='8px';
  const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='กำลังตรวจสถานะคำขอ…';
  panel.append(retry,request,status);request.disabled=true;
  const showStatus = value => {
    status.textContent=value.message||value.error||'';
    request.disabled=['pending','reviewed','complete'].includes(value.state);
    request.textContent=request.disabled?'ส่งคำขอแล้ว':'แจ้งปัญหารหัส / ขอรีเซ็ต';
  };
  try { showStatus(preview?{state:'none'}:await api({action:'get-one-to-one-verification-help',pairId})); }
  catch { showStatus({error:'ตรวจสถานะคำขอไม่สำเร็จ คุณยังลองแจ้งได้ ระบบจะป้องกันคำขอซ้ำ'}); }
  request.onclick=async()=>{
    if(request.disabled)return;
    if(!confirm('ส่งคำขอให้ผู้ดูแลตรวจปัญหารหัสของคู่นี้?\n\nยังไม่รีเซ็ตทันที หากผู้ดูแลยืนยันรีเซ็ต รหัสเดิมและสถานะรับรองของทุกคนในคู่หรือกลุ่มจะถูกล้าง'))return;
    request.disabled=true;status.textContent='กำลังส่งคำขอ…';
    try {
      const value=preview?{ok:true,state:'pending',message:'ตัวอย่าง: ส่งคำขอแล้ว ไม่มีการส่งจริง'}:await api({action:'request-one-to-one-verification-help',pairId});
      if(flow.firstChild===panel)showStatus(value);
    } catch { if(flow.firstChild===panel)showStatus({error:'ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง'}); }
  };
}
