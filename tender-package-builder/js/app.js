/* Phase 2: basic UI rendering only. No PDF processing, matching, validation, or generation. */

(function () {
  "use strict";

  var checklistBody = document.getElementById("checklist-body");
  var langEnBtn = document.getElementById("lang-en");
  var langBnBtn = document.getElementById("lang-bn");
  var dropzone = document.getElementById("dropzone");

  var currentLang = "en";
  var cachedRequirements = null;

  // Static fallback mirroring requirements.json (used if fetch fails, e.g. file://).
  var fallbackData = {
    tender: {
      tender_id: "T-2026-0417",
      title: "Supply of IT Equipment",
      procuring_entity: "Directorate of Sample Services",
      bidder: "Meghna Tech Solutions Ltd.",
      submission_deadline: "2026-10-20"
    },
    requirements: [
      { id: "R01", order: 1, title_en: "Trade License", title_bn: "ট্রেড লাইসেন্স", mandatory: true, has_expiry: true },
      { id: "R02", order: 2, title_en: "TIN Certificate", title_bn: "টিআইএন সনদ", mandatory: true, has_expiry: false },
      { id: "R03", order: 3, title_en: "VAT Registration Certificate", title_bn: "ভ্যাট নিবন্ধন সনদ", mandatory: true, has_expiry: false },
      { id: "R04", order: 4, title_en: "Bank Solvency Certificate", title_bn: "ব্যাংক সচ্ছলতা সনদ", mandatory: true, has_expiry: true },
      { id: "R05", order: 5, title_en: "Experience Certificate", title_bn: "অভিজ্ঞতার সনদ", mandatory: true, has_expiry: false },
      { id: "R06", order: 6, title_en: "Audited Financial Statement", title_bn: "নিরীক্ষিত আর্থিক বিবরণী", mandatory: false, has_expiry: false },
      { id: "R07", order: 7, title_en: "Manufacturer's Authorization", title_bn: "প্রস্তুতকারকের অনুমোদনপত্র", mandatory: false, has_expiry: true },
      { id: "R08", order: 8, title_en: "Technical Proposal", title_bn: "কারিগরি প্রস্তাব", mandatory: true, has_expiry: false },
      { id: "R09", order: 9, title_en: "Financial Proposal", title_bn: "আর্থিক প্রস্তাব", mandatory: true, has_expiry: false },
      { id: "R10", order: 10, title_en: "Signed Declaration", title_bn: "স্বাক্ষরিত ঘোষণাপত্র", mandatory: true, has_expiry: false }
    ]
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTenderInfo(tender) {
    if (!tender) return;
    var map = {
      "tender-id": tender.tender_id,
      "tender-title": tender.title,
      "tender-entity": tender.procuring_entity,
      "tender-bidder": tender.bidder,
      "tender-deadline": tender.submission_deadline,
      "tender-id-badge": tender.tender_id
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && map[id] != null) el.textContent = map[id];
    });
  }

  function badgeHtml(mandatory) {
    if (mandatory) {
      return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">Mandatory</span>';
    }
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Optional</span>';
  }

  function statusHtml() {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Pending</span>';
  }

  function renderChecklist(requirements) {
    if (!checklistBody || !requirements) return;
    var rows = requirements
      .slice()
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (req) {
        var name = currentLang === "bn" ? req.title_bn : req.title_en;
        var sub = currentLang === "bn" ? req.title_en : req.title_bn;
        var expiryCell = req.has_expiry
          ? '<input type="date" disabled placeholder="YYYY-MM-DD" aria-label="Expiry date for ' + escapeHtml(req.title_en) + '" class="w-36 px-2 py-1 text-xs rounded-lg border border-slate-200" />'
          : '<span class="text-xs text-slate-300">—</span>';
        return (
          '<tr class="hover:bg-slate-50">' +
            '<td class="px-5 py-3 text-slate-500 font-mono text-xs">' + escapeHtml(String(req.order)) + '</td>' +
            '<td class="px-4 py-3">' +
              '<p class="font-medium text-slate-900">' + escapeHtml(name) + '</p>' +
              '<p class="text-xs text-slate-400">' + escapeHtml(sub) + ' &middot; ' + escapeHtml(req.id) + '</p>' +
            '</td>' +
            '<td class="px-4 py-3">' + badgeHtml(req.mandatory) + '</td>' +
            '<td class="px-4 py-3 text-xs text-slate-400">— Not matched —</td>' +
            '<td class="px-4 py-3">' + expiryCell + '</td>' +
            '<td class="px-4 py-3">' + statusHtml() + '</td>' +
            '<td class="px-5 py-3 text-right">' +
              '<button type="button" data-req="' + escapeHtml(req.id) + '" title="Available in a later phase" ' +
              'class="select-pdf-btn inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">Select PDF</button>' +
            '</td>' +
          '</tr>'
        );
      })
      .join("");
    checklistBody.innerHTML = rows;
  }

  function renderSummary(requirements) {
    if (!requirements) return;
    var total = requirements.length;
    var mandatory = requirements.filter(function (r) { return r.mandatory; }).length;
    var set = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = String(v);
    };
    set("stat-total", total);
    set("stat-mandatory", mandatory);
    set("stat-ready", 0);
    set("stat-blocking", mandatory); // placeholder: all mandatory pending
  }

  function renderAll(data) {
    cachedRequirements = data.requirements;
    renderTenderInfo(data.tender);
    renderChecklist(data.requirements);
    renderSummary(data.requirements);
  }

  function setLang(lang) {
    currentLang = lang;
    var isEn = lang === "en";
    if (langEnBtn) {
      langEnBtn.setAttribute("aria-pressed", String(isEn));
      langEnBtn.className = "lang-btn px-3 py-1 text-sm font-medium rounded-md " +
        (isEn ? "bg-white shadow-sm border border-slate-200 text-slate-900" : "text-slate-500");
    }
    if (langBnBtn) {
      langBnBtn.setAttribute("aria-pressed", String(!isEn));
      langBnBtn.className = "lang-btn px-3 py-1 text-sm font-medium rounded-md " +
        (!isEn ? "bg-white shadow-sm border border-slate-200 text-slate-900" : "text-slate-500");
    }
    document.documentElement.setAttribute("lang", isEn ? "en" : "bn");
    if (cachedRequirements) renderChecklist(cachedRequirements);
  }

  if (langEnBtn) langEnBtn.addEventListener("click", function () { setLang("en"); });
  if (langBnBtn) langBnBtn.addEventListener("click", function () { setLang("bn"); });

  // Visual-only drag highlight. No file processing in Phase 2.
  if (dropzone) {
    ["dragenter", "dragover"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
      });
    });
  }

  // Load live tender data when served over http; fall back to static copy.
  renderAll(fallbackData);
  fetch("requirements.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (data && data.tender && Array.isArray(data.requirements)) renderAll(data);
    })
    .catch(function () {
      /* keep fallback — no console error for file:// preview */
    });
})();
