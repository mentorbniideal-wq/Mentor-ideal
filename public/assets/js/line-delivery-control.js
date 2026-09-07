(function () {
  var timer = null,
    typing = null,
    loading = false,
    canRetry = false;
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function time(v) {
    if (!v) return "—";
    try {
      return new Date(v).toLocaleString("th-TH", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch (e) {
      return String(v);
    }
  }
  function status(row) {
    var map = {
        sent: ["LINE รับแล้ว", "ok"],
        failed: ["ล้มเหลว", "bad"],
        skipped: ["ระบบระงับ", "muted"],
        pending: ["กำลังส่ง", "wait"],
      },
      x = map[row.status] || [row.status || "ไม่ทราบ", "muted"];
    return '<span class="ldc-badge ' + x[1] + '">' + esc(x[0]) + "</span>";
  }
  function card(row) {
    var reason = row.lastError || row.suppressionReason || "",
      retry =
        canRetry && row.status === "failed"
          ? '<button class="ldc-retry" type="button" onclick="previewLineDeliveryRetry(\'' +
            esc(row.id) +
            "')\">ตรวจและส่งใหม่</button>"
          : "";
    return (
      '<article class="ldc-row"><div class="ldc-row-main"><div class="ldc-row-top">' +
      status(row) +
      "<b>" +
      esc(row.memberNick || row.memberName || "ไม่ระบุสมาชิก") +
      "</b><small>" +
      time(row.sentAt || row.createdAt) +
      '</small></div><div class="ldc-meta">' +
      esc(row.notifType || "ไม่ระบุประเภท") +
      " · " +
      esc(row.memberTeam || "ไม่มีทีม") +
      " · ครั้งที่ " +
      Math.max(1, Number(row.attempts || 0)) +
      "</div>" +
      (row.preview ? "<p>" + esc(row.preview) + "</p>" : "") +
      (reason
        ? '<div class="ldc-error" role="alert">' + esc(reason) + "</div>"
        : "") +
      "</div>" +
      retry +
      "</article>"
    );
  }
  window.loadLineDeliveryControl = function (force) {
    var root = document.getElementById("line-delivery-control-root");
    if (!root || loading) return;
    loading = true;
    root.className = "ldc-state";
    root.innerHTML =
      "<strong>กำลังตรวจผลส่ง</strong><span>อ่านข้อมูลจาก Delivery Ledger…</span>";
    var statusValue = (document.getElementById("ldc-status") || {}).value || "",
      type = (document.getElementById("ldc-type") || {}).value || "";
    gsr(
      "getLineDeliveryLog",
      {
        status: statusValue || null,
        notifType: type.trim() || null,
        limit: 100,
      },
      function (r) {
        loading = false;
        if (!r || !r.ok) {
          root.className = "ldc-state error";
          root.innerHTML =
            "<strong>โหลดผลส่งไม่สำเร็จ</strong><span>" +
            esc((r && r.error) || "กรุณาลองใหม่") +
            '</span><button type="button" onclick="loadLineDeliveryControl(true)">ลองใหม่</button>';
          return;
        }
        var rows = r.rows || [],
          sent = rows.filter(function (x) {
            return x.status === "sent";
          }).length,
          failed = rows.filter(function (x) {
            return x.status === "failed";
          }).length,
          suppressed = rows.filter(function (x) {
            return x.status === "skipped";
          }).length;
        canRetry = r.canRetry === true;
        root.className = "";
        root.innerHTML =
          '<div class="ldc-summary"><div><b>' +
          r.total +
          '</b><span>ตรงกับตัวกรอง</span></div><div class="ok"><b>' +
          sent +
          '</b><span>LINE รับแล้ว</span></div><div class="bad"><b>' +
          failed +
          "</b><span>ล้มเหลว</span></div><div><b>" +
          suppressed +
          "</b><span>ระบบระงับ</span></div></div>" +
          (rows.length
            ? '<div class="ldc-list">' + rows.map(card).join("") + "</div>"
            : '<div class="ldc-empty"><strong>ไม่พบรายการ</strong><span>ลองเปลี่ยนตัวกรองหรือตรวจใหม่</span></div>');
      },
    );
  };
  window.lineDeliveryFilterChanged = function () {
    clearTimeout(typing);
    typing = setTimeout(function () {
      loadLineDeliveryControl(true);
    }, 350);
  };
  window.previewLineDeliveryRetry = function (id) {
    gsr("previewLineDeliveryRetry", { id: id }, function (r) {
      if (!r || !r.ok) {
        toast("ไม่สามารถ Retry: " + ((r && r.error) || "ไม่ทราบสาเหตุ"), "err");
        return;
      }
      var d = r.delivery || {},
        message =
          "ผู้รับ: " +
          (d.memberName || "สมาชิก") +
          "\nประเภท: " +
          (d.notificationType || "—") +
          "\n\nตัวอย่างข้อความ:\n" +
          (d.preview || "ไม่มีตัวอย่าง") +
          "\n\nยืนยันส่งข้อความเดิมอีกครั้งหรือไม่?";
      if (!confirm(message)) return;
      gsr("retryLineDelivery", { id: id, confirmed: true }, function (x) {
        if (!x || !x.ok) {
          toast(
            "ส่งใหม่ไม่สำเร็จ: " + ((x && x.error) || "ไม่ทราบสาเหตุ"),
            "err",
          );
          return;
        }
        toast(
          x.skipped ? "รายการนี้ถูกป้องกันการส่งซ้ำ" : "ส่งใหม่ให้ LINE แล้ว",
          "ok",
        );
        loadLineDeliveryControl(true);
      });
    });
  };
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      clearInterval(timer);
      timer = null;
    } else if (
      document.getElementById("mc-line-auto") &&
      document.getElementById("mc-line-auto").classList.contains("on")
    ) {
      loadLineDeliveryControl(true);
      timer = setInterval(function () {
        loadLineDeliveryControl(true);
      }, 15000);
    }
  });
  var old = window.loadLineAutoControlCenter;
  window.loadLineAutoControlCenter = function (force) {
    if (old) old(force);
    setTimeout(function () {
      loadLineDeliveryControl(force);
    }, 50);
    clearInterval(timer);
    timer = setInterval(function () {
      var sec = document.getElementById("mc-line-auto");
      if (!document.hidden && sec && sec.classList.contains("on"))
        loadLineDeliveryControl(true);
    }, 15000);
  };
})();
