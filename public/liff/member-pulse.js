// Member-facing Pulse: existing LIFF session and liff-api are the only auth path.
// No LINE send, campaign creation, or staff access is exposed here.
(function () {
  "use strict";
  var current = null;
  var escape = function (value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  };
  var box = function () { return document.getElementById("pulseContent"); };
  function questionHtml(question, value, disabled) {
    var id = String(question.id || "");
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(id) || !["scale", "choice", "text"].includes(question.type)) return "";
    var label = escape(question.label || id);
    var required = question.required ? " <span aria-hidden=\"true\">*</span>" : "";
    var disabledAttr = disabled ? " disabled" : "";
    var input = "";
    if (question.type === "scale") {
      input = '<select name="' + id + '"' + disabledAttr + '><option value="">เลือก 1–10</option>' +
        Array.from({ length: 10 }, function (_, i) { var n = i + 1; return '<option value="' + n + '"' + (value === n ? ' selected' : '') + '>' + n + '</option>'; }).join("") + "</select>";
    } else if (question.type === "choice" && Array.isArray(question.options)) {
      input = '<select name="' + id + '"' + disabledAttr + '><option value="">เลือกคำตอบ</option>' +
        question.options.map(function (option) { return '<option value="' + escape(option) + '"' + (value === option ? ' selected' : '') + '>' + escape(option) + '</option>'; }).join("") + "</select>";
    } else if (question.type === "text") {
      input = '<textarea name="' + id + '" maxlength="1000"' + disabledAttr + ' placeholder="เขียนเท่าที่สะดวก">' + escape(value || "") + "</textarea>";
    }
    return input ? '<label for="pulse-' + id + '">' + label + required + '</label>' + input.replace(/^(<select|<textarea)/, '$1 id="pulse-' + id + '"') : "";
  }
  window.loadMemberPulse = async function () {
    var target = box();
    if (!target) return;
    target.textContent = "กำลังโหลดแบบสอบถาม…";
    var result = await api({ action: "get-my-pulse" }, { latestKey: "get-my-pulse" });
    if (!result.ok) {
      target.innerHTML = '<p role="alert">' + escape(result.error || "โหลดข้อมูลไม่สำเร็จ") + '</p><button type="button" id="pulseRetry">ลองใหม่</button>';
      return;
    }
    if (!result.available) {
      target.textContent = result.reason === "not_enabled" ? "Member Pulse ยังไม่เปิดใช้งาน" : "ตอนนี้ยังไม่มีแบบสอบถามสำหรับคุณ";
      return;
    }
    current = result;
    var done = Boolean(result.campaign.completedAt || result.campaign.status === "completed");
    var questions = result.template && result.template.questions;
    if (!Array.isArray(questions) || !questions.length) {
      target.textContent = "แบบสอบถามยังไม่พร้อม กรุณาติดต่อทีม Growth";
      return;
    }
    target.innerHTML = '<h3>' + escape(result.template.title) + '</h3>' +
      '<p class="hint">' + (done ? "คุณส่งคำตอบแล้ว ขอบคุณที่ช่วยให้เราเข้าใจและดูแลสมาชิกได้ดีขึ้น" : "ตอบเฉพาะสิ่งที่สะดวก คำตอบจะถูกเก็บอย่างจำกัดสิทธิ์") + '</p>' +
      '<form id="memberPulseForm">' + questions.map(function (q) { return questionHtml(q, (result.answers || {})[q.id], done); }).join("") +
      (done ? "" : '<p class="hint">โปรดตรวจคำตอบก่อนส่ง เมื่อส่งแล้วจะไม่สามารถแก้ไขผ่านหน้านี้ได้</p><button type="submit" class="submit">ส่งคำตอบ</button>') + '</form><p id="pulseMessage" role="status" aria-live="polite"></p>';
  };
  document.addEventListener("click", function (event) {
    if (event.target && event.target.id === "pulseRetry") window.loadMemberPulse();
  });
  document.addEventListener("submit", async function (event) {
    if (!event.target || event.target.id !== "memberPulseForm") return;
    event.preventDefault();
    if (!current || !window.confirm("ยืนยันส่งคำตอบ Member Pulse?")) return;
    var form = event.target;
    var button = form.querySelector('button[type="submit"]');
    var message = document.getElementById("pulseMessage");
    var answers = {};
    (current.template.questions || []).forEach(function (q) {
      var value = new FormData(form).get(q.id);
      if (value !== "" && value !== null) answers[q.id] = q.type === "scale" ? Number(value) : value;
    });
    button.disabled = true;
    message.textContent = "กำลังส่งคำตอบ…";
    var result = await api({ action: "submit-my-pulse", campaignId: current.campaign.id, answers });
    if (!result.ok) {
      button.disabled = false;
      message.textContent = result.error || "ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่";
      return;
    }
    message.textContent = result.duplicate ? "คำตอบนี้ถูกบันทึกไว้แล้ว" : "บันทึกคำตอบเรียบร้อย ขอบคุณครับ 💛";
    await window.loadMemberPulse();
  });
})();
