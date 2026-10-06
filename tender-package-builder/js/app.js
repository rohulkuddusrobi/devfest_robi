/* Phase 3 Part 2: exact duplicate detection (SHA-256) + document matching.
 * Phase 2 UI and Phase 3 Part 1 upload flow preserved. No expiry/final-status/generation.
 */

(function () {
  "use strict";

  // ---------- Config ----------
  var MAX_FILES = 30;
  var MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB

  // ---------- DOM ----------
  var checklistBody = document.getElementById("checklist-body");
  var langEnBtn = document.getElementById("lang-en");
  var langBnBtn = document.getElementById("lang-bn");
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file-input");
  var filesBody = document.getElementById("files-body");
  var filesEmpty = document.getElementById("files-empty");
  var fileCountEl = document.getElementById("file-count");
  var totalSizeEl = document.getElementById("total-size");
  var usageFilesEl = document.getElementById("usage-files");
  var usageSizeEl = document.getElementById("usage-size");
  var errorsEl = document.getElementById("upload-errors");
  var processingEl = document.getElementById("processing-indicator");

  // ---------- State (single source of truth) ----------
  var uploadedFiles = []; // { id, file, name, size, pageCount, hash }
  var matches = {}; // reqId -> fileId (single source of truth for document matching)
  var idCounter = 0;
  // Reservations for files currently being read (prevents limit bypass on overlapping batches).
  var pendingCount = 0;
  var pendingBytes = 0;
  var activeBatches = 0;

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

  // ---------- PDF.js setup (page count only) ----------
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    } catch (e) {
      /* worker config is best-effort */
    }
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return "0 KB";
    var kb = bytes / 1024;
    if (kb < 1024) {
      return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + " KB";
    }
    var mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb * 10) / 10) + " MB";
  }

  function totalBytes() {
    return uploadedFiles.reduce(function (sum, f) { return sum + f.size; }, 0);
  }

  function makeId() {
    idCounter += 1;
    return "f-" + Date.now().toString(36) + "-" + idCounter + "-" +
      Math.random().toString(36).slice(2, 7);
  }

  function showErrors(messages) {
    if (!errorsEl) return;
    if (!messages || messages.length === 0) {
      errorsEl.classList.add("hidden");
      errorsEl.innerHTML = "";
      return;
    }
    var html = "<ul class=\"list-disc pl-5 space-y-1\">" +
      messages.map(function (m) { return "<li>" + escapeHtml(m) + "</li>"; }).join("") +
      "</ul>";
    errorsEl.innerHTML = html;
    errorsEl.classList.remove("hidden");
  }

  function setProcessing(text) {
    if (!processingEl) return;
    if (!text) {
      processingEl.classList.add("hidden");
      processingEl.textContent = "Processing PDFs…";
    } else {
      processingEl.textContent = text;
      processingEl.classList.remove("hidden");
    }
  }

  function isPdfName(file) {
    var typeOk = file.type === "application/pdf";
    var extOk = /\.pdf$/i.test(file.name || "");
    return typeOk || extOk;
  }

  function getPdfPageCount(file) {
    if (!window.pdfjsLib) {
      return Promise.reject(new Error("PDF_READER_MISSING"));
    }
    return file.arrayBuffer().then(function (buf) {
      if (!buf || buf.byteLength === 0) throw new Error("EMPTY_PDF");
      return window.pdfjsLib.getDocument({ data: buf }).promise.then(function (pdf) {
        var n = pdf.numPages;
        var destroy = pdf.destroy ? pdf.destroy() : Promise.resolve();
        return Promise.resolve(destroy).then(function () {
          if (!n || n < 1) throw new Error("INVALID_PDF");
          return n;
        });
      });
    });
  }
  // ---------- Phase 3 Part 2: SHA-256 duplicates + document matching ----------

  function sha256Hex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      hex += h.length === 1 ? "0" + h : h;
    }
    return hex;
  }

  // Exact-content hash of the complete file. Hex string, or null when
  // Web Crypto is unavailable (e.g. non-secure file:// preview).
  function hashFile(file) {
    if (!window.crypto || !window.crypto.subtle || typeof window.crypto.subtle.digest !== "function") {
      return Promise.resolve(null);
    }
    return file.arrayBuffer().then(function (buf) {
      if (!buf || buf.byteLength === 0) throw new Error("EMPTY_PDF");
      return window.crypto.subtle.digest("SHA-256", buf);
    }).then(function (digest) {
      return sha256Hex(digest);
    });
  }

  function fileById(id) {
    for (var i = 0; i < uploadedFiles.length; i++) {
      if (uploadedFiles[i].id === id) return uploadedFiles[i];
    }
    return null;
  }

  // Other files with exactly identical content (same SHA-256), regardless of filename.
  function duplicatePeers(file) {
    if (!file || !file.hash) return [];
    return uploadedFiles.filter(function (f) { return f.id !== file.id && f.hash === file.hash; });
  }

  function duplicateInfo(file) {
    if (!file.hash) return { state: "unknown", duplicateOf: null };
    var peers = duplicatePeers(file);
    if (peers.length === 0) return { state: "unique", duplicateOf: null };
    return { state: "duplicate", duplicateOf: peers[0].name };
  }

  function duplicateBadgeHtml(file) {
    var info = duplicateInfo(file);
    if (info.state === "duplicate") {
      return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">Exact Duplicate</span>' +
        '<p class="mt-1 text-xs text-slate-500">Duplicate of: ' + escapeHtml(info.duplicateOf || "") + '</p>';
    }
    if (info.state === "unique") {
      return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Unique</span>';
    }
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Not checked</span>';
  }

  function requirementUsingFile(fileId) {
    var ids = Object.keys(matches);
    for (var i = 0; i < ids.length; i++) {
      if (matches[ids[i]] === fileId) return ids[i];
    }
    return null;
  }

  function matchedFileFor(reqId) {
    var id = matches[reqId];
    return id ? fileById(id) : null;
  }

  // Returns null when allowed, "taken" when matched elsewhere, "duplicate" when
  // identical content is used by another requirement.
  function matchBlockReason(reqId, file) {
    var usedBy = requirementUsingFile(file.id);
    if (usedBy && usedBy !== reqId) return "taken";
    if (file.hash) {
      var ids = Object.keys(matches);
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] === reqId) continue;
        var other = fileById(matches[ids[i]]);
        if (other && other.hash && other.hash === file.hash) return "duplicate";
      }
    }
    return null;
  }

  function showMatchError(msg) {
    var el = document.getElementById("match-errors");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function clearMatchError() {
    var el = document.getElementById("match-errors");
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
  }

  function fileLabel(f) {
    return f.name + " — " + f.pageCount + (f.pageCount === 1 ? " page" : " pages");
  }

  function matchOptionsHtml(req) {
    var html = '<option value="">No file / Unmatched</option>';
    uploadedFiles.forEach(function (f) {
      var selected = matches[req.id] === f.id;
      var reason = matchBlockReason(req.id, f);
      var disabled = reason && !selected ? " disabled" : "";
      var suffix = "";
      if (reason === "taken" && !selected) suffix = " · in use";
      else if (reason === "duplicate" && !selected) suffix = " · duplicate in use";
      else if (!reason && duplicateInfo(f).state === "duplicate") suffix = " · duplicate";
      html += '<option value="' + escapeHtml(f.id) + '"' + (selected ? " selected" : "") + disabled +
        ' title="' + escapeHtml(fileLabel(f)) + '">' + escapeHtml(fileLabel(f) + suffix) + '</option>';
    });
    return html;
  }

  function matchedCellHtml(req) {
    var f = matchedFileFor(req.id);
    if (!f) return '<span class="text-xs text-slate-400">— Not matched —</span>';
    return '<span class="font-medium text-slate-800">' + escapeHtml(f.name) + '</span>' +
      '<p class="text-xs text-slate-400">' + escapeHtml(String(f.pageCount)) + ' pages &middot; ' + escapeHtml(formatSize(f.size)) + '</p>';
  }

  function refreshChecklist() {
    if (cachedRequirements) renderChecklist(cachedRequirements);
  }

  function setMatch(reqId, fileId) {
    clearMatchError();
    if (!fileId) {
      delete matches[reqId]; // clear / undo match
      refreshChecklist();
      return;
    }
    var file = fileById(fileId);
    if (!file) {
      delete matches[reqId];
      refreshChecklist();
      return;
    }
    var reason = matchBlockReason(reqId, file);
    if (reason === "taken") {
      showMatchError('"' + file.name + '" is already matched to another requirement. Clear or change that match first.');
      refreshChecklist();
      return;
    }
    if (reason === "duplicate") {
      showMatchError('"' + file.name + '" is an exact duplicate of another uploaded document and cannot be matched to a different requirement.');
      refreshChecklist();
      return;
    }
    matches[reqId] = fileId;
    refreshChecklist();
  }


  // ---------- Phase 2 preserved: tender / checklist / summary ----------
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
            '<td class="px-4 py-3">' + matchedCellHtml(req) + '</td>' +
            '<td class="px-4 py-3">' + expiryCell + '</td>' +
            '<td class="px-4 py-3">' + statusHtml() + '</td>' +
            '<td class="px-5 py-3 text-right">' +
              '<select data-match="' + escapeHtml(req.id) + '" aria-label="Match PDF for ' + escapeHtml(req.title_en) + '" ' +
              'class="match-select w-56 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700">' +
              matchOptionsHtml(req) + '</select>' +
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
    set("stat-blocking", mandatory); // placeholder until later phases
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

  // ---------- Phase 3 Part 1: files ----------
  function renderFiles() {
    var bytes = totalBytes();
    if (fileCountEl) fileCountEl.textContent = String(uploadedFiles.length);
    if (totalSizeEl) totalSizeEl.textContent = formatSize(bytes);
    if (usageFilesEl) usageFilesEl.textContent = uploadedFiles.length + " / " + MAX_FILES + " files";
    if (usageSizeEl) usageSizeEl.textContent = formatSize(bytes) + " / 50 MB";

    if (filesEmpty) {
      filesEmpty.style.display = uploadedFiles.length === 0 ? "" : "none";
    }
    if (!filesBody) return;
    if (uploadedFiles.length === 0) {
      filesBody.innerHTML = "";
      return;
    }
    filesBody.innerHTML = uploadedFiles.map(function (f) {
      return (
        '<tr class="border-t border-slate-100 hover:bg-slate-50">' +
          '<td class="px-5 py-3">' +
            '<p class="file-name font-medium text-slate-900" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</p>' +
          '</td>' +
          '<td class="px-4 py-3 text-slate-700 whitespace-nowrap">' + escapeHtml(String(f.pageCount)) + '</td>' +
          '<td class="px-4 py-3 text-slate-700 whitespace-nowrap">' + escapeHtml(formatSize(f.size)) + '</td>' +
          '<td class="px-4 py-3">' + duplicateBadgeHtml(f) + '</td>' +
          '<td class="px-5 py-3 text-right">' +
            '<button type="button" data-remove="' + escapeHtml(f.id) + '" aria-label="Remove ' + escapeHtml(f.name) + '" ' +
            'class="remove-btn inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50">Remove</button>' +
          '</td>' +
        '</tr>'
      );
    }).join("");
  }

  // Single shared pipeline for Browse + Drop.
  function handleIncomingFiles(fileList) {
    var incoming = Array.prototype.slice.call(fileList || []);
    if (incoming.length === 0) return Promise.resolve();

    var errors = [];
    var baseCount = uploadedFiles.length + pendingCount;
    var runningBytes = totalBytes() + pendingBytes;
    var validQueue = [];

    // Cheap pre-checks: type + empty + limits (before slow PDF.js read).
    incoming.forEach(function (file) {
      var label = file.name || "Unnamed file";
      if (!isPdfName(file)) {
        errors.push('"' + label + '": Only PDF files are allowed.');
        return;
      }
      if (!file.size || file.size <= 0) {
        errors.push('"' + label + '": This file is empty and was not added.');
        return;
      }
      if (baseCount + validQueue.length >= MAX_FILES) {
        errors.push('"' + label + '": Maximum 30 files allowed. The file was not added.');
        return;
      }
      if (runningBytes + file.size > MAX_TOTAL_SIZE) {
        errors.push('"' + label + '": Maximum total size is 50 MB. The file was not added.');
        return;
      }
      runningBytes += file.size;
      validQueue.push(file);
    });

    if (validQueue.length === 0) {
      showErrors(errors);
      return Promise.resolve();
    }

    // Reserve so a second batch started while this one reads cannot bypass limits.
    pendingCount += validQueue.length;
    pendingBytes += validQueue.reduce(function (s, f) { return s + f.size; }, 0);
    activeBatches += 1;

    showErrors(errors); // show pre-check errors immediately, keep adding below if read fails
    setProcessing("Processing PDFs…");

    // Sequential read so UI can show progress and one bad PDF never blocks others.
    var chain = Promise.resolve();
    validQueue.forEach(function (file, idx) {
      chain = chain.then(function () {
        setProcessing("Reading PDF " + (idx + 1) + " of " + validQueue.length + "…");
        return getPdfPageCount(file).then(function (pages) {
          setProcessing("Hashing PDF " + (idx + 1) + " of " + validQueue.length + "…");
          return hashFile(file).then(function (hash) {
            return { pages: pages, hash: hash };
          }, function () {
            return { pages: pages, hash: null }; // readable PDF, hash unavailable — keep file
          });
        }).then(function (info) {
          pendingCount -= 1;
          pendingBytes -= file.size;
          uploadedFiles.push({
            id: makeId(),
            file: file,
            name: file.name,
            size: file.size,
            pageCount: info.pages,
            hash: info.hash
          });
          renderFiles();
          refreshChecklist();
        }).catch(function (err) {
          pendingCount -= 1;
          pendingBytes -= file.size;
          var label = file.name || "Unnamed file";
          if (err && err.message === "PDF_READER_MISSING") {
            errors.push("PDF reader could not be loaded. Check your internet connection and reload the page.");
          } else {
            errors.push('"' + label + '": This PDF could not be read. The file was not added.');
          }
          showErrors(errors);
        });
      });
    });

    return chain.then(function () {
      activeBatches -= 1;
      if (activeBatches <= 0) {
        activeBatches = 0;
        setProcessing(null);
      }
      showErrors(errors);
      renderFiles();
      refreshChecklist();
    });
  }

  // ---------- Events ----------
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      handleIncomingFiles(fileInput.files).then(function () {
        fileInput.value = ""; // allow re-selecting the same file
      });
    });
  }

  if (checklistBody) {
    checklistBody.addEventListener("change", function (e) {
      var sel = e.target && e.target.getAttribute ? e.target : null;
      if (!sel || !sel.getAttribute("data-match")) return;
      setMatch(sel.getAttribute("data-match"), sel.value);
    });
  }

  if (filesBody) {
    filesBody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-remove]") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-remove");
      uploadedFiles = uploadedFiles.filter(function (f) { return f.id !== id; });
      // Clear any match pointing at the removed file (no broken IDs).
      Object.keys(matches).forEach(function (reqId) {
        if (matches[reqId] === id) delete matches[reqId];
      });
      clearMatchError();
      renderFiles(); // no stale DOM: full re-render from state
      refreshChecklist(); // re-renders dropdowns + recalculates duplicate badges
    });
  }

  if (dropzone) {
    var dragDepth = 0;
    dropzone.addEventListener("dragenter", function (e) {
      e.preventDefault();
      dragDepth += 1;
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      dragDepth -= 1;
      if (dragDepth <= 0) {
        dragDepth = 0;
        dropzone.classList.remove("drag-over");
      }
    });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dragDepth = 0;
      dropzone.classList.remove("drag-over");
      var files = e.dataTransfer ? e.dataTransfer.files : [];
      handleIncomingFiles(files);
    });
  }

  if (langEnBtn) langEnBtn.addEventListener("click", function () { setLang("en"); });
  if (langBnBtn) langBnBtn.addEventListener("click", function () { setLang("bn"); });

  // ---------- Init ----------
  renderFiles();
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
