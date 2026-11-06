// LINE-authenticated member view. Does not send LINE or edit Chapter membership.
(function () {
  var busy = false;
  function root() {
    var d = document.getElementById("my-power-teams");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "my-power-teams";
      d.style.cssText =
        "box-sizing:border-box;max-width:calc(100vw - 24px);width:min(94vw,640px);max-height:85dvh;overflow:auto;border:1px solid #ccc;border-radius:16px;padding:20px";
      document.body.appendChild(d);
      d.addEventListener("click", function (e) {
        var b = e.target.closest("[data-pt-response]");
        if (b) respond(b.dataset.ptProposal, b.dataset.ptResponse);
      });
    }
    return d;
  }
  var esc = function (v) {
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
  window.openMyPowerTeams = async function () {
    var d = root();
    if (!d.open) d.showModal();
    d.innerHTML =
      '<button type="button" onclick="document.getElementById(\'my-power-teams\').close()">ปิด</button><h2>Power Team ของฉัน</h2><div role="status">กำลังโหลด…</div>';
    var r;
    try {
      r = await api({ action: "get-my-power-teams" });
    } catch {
      r = { ok: false };
    }
    var html = "";
    if (!r.ok) {
      html =
        '<p role="alert">โหลดไม่สำเร็จ</p><button type="button" onclick="openMyPowerTeams()">ลองใหม่</button>';
    } else {html = (r.teams || []).map(function (t) {
        return '<article style="border:1px solid #ccc;border-radius:12px;padding:14px;margin:12px 0"><h3>' +
          esc(t.title) + "</h3><p>" + esc(t.targetCustomerGroup) + "</p><p>ปี " +
          esc(t.year) + " · " +
          (t.official ? "ทีมที่อนุมัติแล้ว" : "คำเชิญสำรวจทีม ยังไม่ใช่ทีมที่อนุมัติ") +
          "</p><p>สมาชิก: " + (t.members || []).map(function (l) {
            return esc(
              l.members && (l.members.nickname || l.members.name) || "สมาชิก",
            ) + (String(l.member_id) === String(t.leaderMemberId)
              ? " (ผู้ประสานงาน)"
              : "");
          }).join(" · ") + "</p><p>คำตอบของคุณ: " +
          esc(
            {
              invited: "รอตอบรับ",
              accepted: "ยินดีเข้าร่วม",
              declined: "ยังไม่สะดวก",
            }[t.response] || "ยังไม่ตอบ",
          ) + "</p>" + (!t.official
            ? '<button type="button" data-pt-proposal="' + esc(t.id) +
              '" data-pt-response="accepted">ยินดีเข้าร่วม</button> <button type="button" data-pt-proposal="' +
              esc(t.id) + '" data-pt-response="declined">ยังไม่สะดวก</button>'
            : "<small>หากต้องการเปลี่ยนสมาชิก โปรดแจ้ง Growth เพื่อทบทวนทีมฉบับใหม่</small>") +
          "</article>";
      }).join("") || "<p>ยังไม่มีคำเชิญหรือทีมที่คุณเข้าร่วม</p>";}
    d.querySelector('[role="status"]').outerHTML = html;
  };
  async function respond(id, status) {
    if (
      busy || !confirm(
        status === "accepted"
          ? "ยืนยันว่าคุณยินดีเข้าร่วมสำรวจทีมนี้?"
          : "ยืนยันว่ายังไม่สะดวกเข้าร่วม?",
      )
    ) return;
    busy = true;
    root().querySelectorAll("[data-pt-response]").forEach(function (b) {
      b.disabled = true;
    });
    try {
      var r = await api({
        action: "respond-power-team-invitation",
        proposalId: id,
        status: status,
        confirmed: true,
      });
      if (!r.ok) alert(r.error || "บันทึกไม่สำเร็จ");
    } catch {
      alert("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      busy = false;
      await openMyPowerTeams();
    }
  }
})();
