(function () {
  "use strict";
  var escape = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  };
  window.openPowerTeamOperationDialog = function (
    state,
    action,
    proposal,
    onSaved,
  ) {
    var previous = document.activeElement,
      d = document.createElement("dialog"),
      busy = false;
    d.className = "pt-dialog";
    d.style.cssText =
      "box-sizing:border-box;width:min(94vw,520px);max-width:calc(100vw - 24px);max-height:85dvh;overflow:auto;border:1px solid var(--bd,#ccc);border-radius:16px;padding:20px;background:var(--sf,#fff);color:var(--tx,#222)";
    var labels = {
      assigned: "มอบหมายแล้ว",
      exploring: "กำลังสำรวจ",
      active: "พร้อมเสนอเป็นทีมจริง",
      closed: "ปิดข้อเสนอ",
      archived: "เก็บเข้าประวัติ",
    };
    var choices = action === "assign"
      ? (state.growthOwners || []).map(function (o) {
        return { value: o.email, label: o.display_name || o.email };
      })
      : (state.canCoordinate
        ? ["assigned", "exploring", "active", "closed", "archived"]
        : ["exploring", "closed"]).map(function (s) {
          return { value: s, label: labels[s] };
        });
    d.innerHTML = "<form><h2>" +
      (action === "assign" ? "มอบหมายผู้รับผิดชอบ" : "อัปเดตสถานะ Proposal") +
      '</h2><label>เลือก<select name="choice" required style="display:block;width:100%"><option value="">— เลือก —</option>' +
      choices.map(function (o) {
        return '<option value="' + escape(o.value) + '">' + escape(o.label) +
          "</option>";
      }).join("") + "</select></label>" +
      (action === "status"
        ? '<label>เหตุผล/ผลลัพธ์ (จำเป็นเมื่อปิดข้อเสนอ)<textarea name="reason" maxlength="1500" style="display:block;width:100%"></textarea></label>'
        : "") +
      '<p role="alert" aria-live="polite"></p><button type="button" data-cancel>ยกเลิก</button> <button type="submit">ยืนยันและบันทึก</button></form>';
    document.body.appendChild(d);
    d.showModal();
    var form = d.querySelector("form"),
      error = d.querySelector('[role="alert"]');
    d.querySelector("[data-cancel]").onclick = function () {
      if (!busy) d.close();
    };
    d.addEventListener("cancel", function (e) {
      if (busy) e.preventDefault();
    });
    d.addEventListener("close", function () {
      d.remove();
      if (previous && previous.isConnected) previous.focus();
    });
    form.onsubmit = function (e) {
      e.preventDefault();
      if (busy) return;
      var value = form.elements.choice.value,
        payload = {
          proposalId: proposal.id,
          expectedUpdatedAt: proposal.updated_at,
        };
      if (action === "assign") payload.ownerEmail = value;
      else {
        payload.status = value;
        payload.closeReason = form.elements.reason.value.trim();
        if (value === "closed" && payload.closeReason.length < 5) {
          error.textContent = "กรุณาระบุผลลัพธ์อย่างน้อย 5 ตัวอักษร";
          return;
        }
      }
      busy = true;
      form.querySelectorAll("input,select,textarea,button").forEach(
        function (x) {
          x.disabled = true;
        },
      );
      error.textContent = "กำลังบันทึก…";
      gsr(
        action === "assign"
          ? "assignPowerTeamProposal"
          : "updatePowerTeamProposal",
        payload,
        function (r) {
          busy = false;
          form.querySelectorAll("input,select,textarea,button").forEach(
            function (x) {
              x.disabled = false;
            },
          );
          if (!r || !r.ok) {
            error.textContent = r && r.error || "บันทึกไม่สำเร็จ กรุณาลองใหม่";
            return;
          }
          d.close();
          onSaved();
        },
      );
    };
  };
  window.openPowerTeamProposalBuilder = function (state, seed, onSaved) {
    var previous = document.activeElement,
      dialog = document.createElement("dialog"),
      requestId = crypto.randomUUID(),
      lastSignature = "",
      busy = false;
    seed = seed || {};
    dialog.className = "pt-dialog";
    dialog.style.cssText =
      "box-sizing:border-box;max-width:calc(100vw - 24px);width:min(94vw,680px);max-height:88dvh;overflow:auto;background:var(--sf,#fff);color:var(--tx,#222);border:1px solid var(--bd,#ccc);border-radius:16px;padding:20px";
    dialog.innerHTML = "<form><h2>สร้างข้อเสนอ Power Team" +
      (seed.supersedesPublicationId ? " · ฉบับปรับปรุง" : "") +
      '</h2><p>กำหนดกลุ่มลูกค้าร่วมและเลือกสมาชิกเองได้ ข้อเสนอยังไม่ใช่ทีมจริง สมาชิกต้องตอบรับใน LINE → MY121 → Power Team ของฉัน ก่อน Admin อนุมัติ · คำเชิญจะแสดงใน MY121 แต่ระบบไม่ส่งข้อความ LINE อัตโนมัติ</p><label>ชื่อข้อเสนอ<input name="title" required minlength="2" maxlength="120" style="display:block;width:100%" value="' +
      escape(seed.title || seed.category || "") +
      '"></label><label>กลุ่มลูกค้าเป้าหมายร่วม<textarea name="target" required minlength="2" maxlength="500" style="display:block;width:100%">' +
      escape(seed.targetCustomerGroup || "") +
      '</textarea></label><label>เหตุผล/หลักฐานว่าช่วยลูกค้ากลุ่มเดียวกันได้<textarea name="reason" required minlength="5" maxlength="1500" style="display:block;width:100%">' +
      escape(seed.rationale || "") +
      '</textarea></label><label>ค้นหาสมาชิก<input name="search" type="search" style="display:block;width:100%"></label><fieldset style="max-height:220px;overflow:auto"><legend>สมาชิกอย่างน้อย 2 คน</legend>' +
      (state.eligibleMembers || []).map(function (m) {
        return '<label data-search="' +
          escape((m.name + " " + (m.nickname || "")).toLowerCase()) +
          '" style="display:block;padding:8px"><input type="checkbox" name="member" value="' +
          escape(m.id) + '" ' +
          ((seed.memberIds || []).includes(String(m.id)) ? "checked" : "") +
          "> " + escape(m.nickname || m.name) + " <small>" + escape(m.name) +
          "</small></label>";
      }).join("") +
      '</fieldset><label>ผู้ประสานงานทีม (ไม่บังคับ ต้องเป็นสมาชิกที่เลือก)<select name="leader" style="display:block;width:100%"><option value="">ยังไม่ระบุ</option>' +
      (state.eligibleMembers || []).map(function (m) {
        return '<option value="' + escape(m.id) + '" ' +
          (seed.leaderMemberId === m.id ? "selected" : "") + ">" +
          escape(m.nickname || m.name) + "</option>";
      }).join("") +
      '</select></label><label style="display:block;margin:14px 0"><input type="checkbox" name="confirmed" required> ยืนยันว่าเป็นข้อเสนอเพื่อทบทวน ไม่ใช่การจัดทีมอัตโนมัติ</label><p role="alert" aria-live="polite"></p><div style="display:flex;gap:12px"><button type="button" data-close>ยกเลิก</button><button type="submit">บันทึกข้อเสนอ</button></div></form>';
    document.body.appendChild(dialog);
    dialog.showModal();
    var form = dialog.querySelector("form"),
      error = dialog.querySelector('[role="alert"]');
    dialog.querySelector("[data-close]").onclick = function () {
      if (!busy) dialog.close();
    };
    dialog.addEventListener("cancel", function (e) {
      if (busy) e.preventDefault();
    });
    dialog.addEventListener("close", function () {
      dialog.remove();
      if (previous && previous.isConnected) previous.focus();
    });
    form.elements.search.oninput = function () {
      var q = this.value.trim().toLowerCase();
      dialog.querySelectorAll("[data-search]").forEach(function (label) {
        label.hidden = !label.dataset.search.includes(q);
      });
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      if (busy) return;
      var members = Array.from(form.querySelectorAll('[name="member"]:checked'))
        .map(function (x) {
          return x.value;
        }).sort();
      if (members.length < 2) {
        error.textContent = "กรุณาเลือกสมาชิกอย่างน้อย 2 คน";
        return;
      }
      var payload = {
        title: form.elements.title.value.trim(),
        targetCustomerGroup: form.elements.target.value.trim(),
        rationale: form.elements.reason.value.trim(),
        sourceCategory: seed.category || null,
        leaderMemberId: form.elements.leader.value || null,
        memberIds: members,
        requestId: requestId,
        supersedesPublicationId: seed.supersedesPublicationId || null,
      };
      if (payload.leaderMemberId && !members.includes(payload.leaderMemberId)) {
        error.textContent = "ผู้ประสานงานต้องเป็นสมาชิกที่เลือก";
        return;
      }
      var signature = JSON.stringify(
        Object.assign({}, payload, { requestId: null }),
      );
      if (lastSignature && lastSignature !== signature) {
        requestId = crypto.randomUUID();
        payload.requestId = requestId;
      }
      lastSignature = signature;
      busy = true;
      error.textContent = "กำลังบันทึก…";
      form.querySelectorAll("input,textarea,select,button").forEach(
        function (x) {
          x.disabled = true;
        },
      );
      gsr("savePowerTeamProposal", payload, function (r) {
        busy = false;
        form.querySelectorAll("input,textarea,button").forEach(function (x) {
          x.disabled = false;
        });
        if (!r || !r.ok) {
          error.textContent = r && r.error ||
            "เชื่อมต่อไม่สำเร็จ ลองอีกครั้งได้โดยไม่สร้างข้อเสนอซ้ำ";
          return;
        }
        dialog.close();
        onSaved();
      });
    };
  };
})();
