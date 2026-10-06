/* Phase 5: final PDF package generation (pdf-lib, browser-only).
 * Cover page (A4, page 1) + matched PDFs copied in requirements[].order +
 * "<tender_id> | Page X of Y" footer on every page + Blob download.
 * Pure PDF assembly — validation state is read from the caller.
 * Exposed as window.PackageGenerator.
 */

(function () {
  "use strict";

  var A4 = [595.28, 841.89];
  var MARGIN = 48;
  var FOOTER_SIZE = 9;
  var FOOTER_MARGIN = 22; // safe distance above the bottom edge

  function lib() {
    return window.PDFLib || null;
  }

  function ascii(text) {
    // Cover page uses WinAnsi standard fonts: transliterate non-Latin text to
    // a readable placeholder instead of emitting corrupt glyphs.
    var s = String(text == null ? "" : text);
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      out += (code >= 32 && code <= 126) || code === 10 || code === 13 ? s.charAt(i) : "?";
    }
    return out;
  }

  function formatCreationDate(d) {
    var months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    var dd = (d.getDate() < 10 ? "0" : "") + d.getDate();
    return dd + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  // Wrap ASCII text to fit maxWidth using the given font/size.
  function wrapLines(text, font, size, maxWidth) {
    var words = String(text).split(/\s+/).filter(function (w) { return w.length > 0; });
    var lines = [];
    var cur = "";
    words.forEach(function (w) {
      var trial = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth || !cur) {
        cur = trial;
      } else {
        lines.push(cur);
        cur = w;
      }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  function drawCover(out, tender, included, fonts) {
    var PDFLib = lib();
    var page = out.addPage(A4);
    var W = A4[0];
    var H = A4[1];
    var usable = W - MARGIN * 2;
    var y = H - 64;

    page.drawText(ascii("TENDER DOCUMENT PACKAGE"), {
      x: MARGIN, y: y, size: 22, font: fonts.bold, color: PDFLib.rgb(0.09, 0.11, 0.16)
    });
    y -= 12;
    page.drawLine({
      start: { x: MARGIN, y: y }, end: { x: MARGIN + usable, y: y },
      thickness: 2, color: PDFLib.rgb(0.09, 0.11, 0.16)
    });
    y -= 30;

    function label(text) {
      page.drawText(ascii(text), { x: MARGIN, y: y, size: 11, font: fonts.bold, color: PDFLib.rgb(0.29, 0.33, 0.42) });
      y -= 15;
    }
    function value(text, size) {
      var lines = wrapLines(ascii(text), fonts.regular, size || 12, usable);
      lines.forEach(function (ln) {
        page.drawText(ln, { x: MARGIN, y: y, size: size || 12, font: fonts.regular, color: PDFLib.rgb(0.09, 0.11, 0.16) });
        y -= (size || 12) + 5;
      });
      y -= 4;
    }

    label("Tender ID");
    value(tender.tender_id || "—", 14);
    label("Tender Title");
    value(tender.title || "—", 14);
    label("Procuring Entity");
    value(tender.procuring_entity || "—");
    label("Bidder");
    value(tender.bidder || "—");
    label("Submission Deadline");
    value(tender.submission_deadline || "—");
    label("Package Creation Date");
    value(formatCreationDate(new Date()));
    y -= 6;

    page.drawText(ascii("Included Documents (" + included.length + ")"), {
      x: MARGIN, y: y, size: 13, font: fonts.bold, color: PDFLib.rgb(0.09, 0.11, 0.16)
    });
    y -= 20;

    included.forEach(function (item, idx) {
      if (y < 90) return; // cover is intentionally a single page; list is capped
      var line = (idx + 1) + ". " + ascii(item.name) + "  (" + item.pages + (item.pages === 1 ? " page" : " pages") + ")";
      wrapLines(line, fonts.regular, 11, usable).forEach(function (ln) {
        if (y < 90) return;
        page.drawText(ln, { x: MARGIN, y: y, size: 11, font: fonts.regular, color: PDFLib.rgb(0.2, 0.25, 0.32) });
        y -= 17;
      });
    });
  }

  function addFooters(out, tenderId) {
    var PDFLib = lib();
    var total = out.getPageCount(); // Y = actual final page count
    var prefix = ascii(tenderId) + " | Page ";
    out.getPages().forEach(function (pg, i) {
      var size = pg.getSize();
      var footer = prefix + (i + 1) + " of " + total;
      pg.drawText(footer, {
        x: Math.max(10, (size.width - footer.length * 5.2) / 2),
        y: FOOTER_MARGIN,
        size: FOOTER_SIZE,
        color: PDFLib.rgb(0.42, 0.45, 0.51)
      });
    });
    return total;
  }

  // opts: { tender, requirements (any order), matches, filesById,
  //         statusOf(req)->status, isOkStatus(status)->bool, lang: "en"|"bn" }
  // onProgress(msg) optional. Resolves { bytes, filename, totalPages, includedCount }.
  function generatePackagePdf(opts, onProgress) {
    opts = opts || {};
    var PDFLib = lib();
    if (!PDFLib) return Promise.reject(new Error("PDF_LIB_MISSING"));

    var tender = opts.tender || {};
    var tenderId = String(tender.tender_id || "Tender").trim() || "Tender";
    var reqs = (Array.isArray(opts.requirements) ? opts.requirements.slice() : [])
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    // Included = matched + valid, in requirement order. Optional unmatched skipped.
    var included = [];
    reqs.forEach(function (req) {
      var fileId = opts.matches ? opts.matches[req.id] : null;
      if (!fileId) return;
      var st = opts.statusOf ? opts.statusOf(req) : null;
      if (opts.isOkStatus && !opts.isOkStatus(st)) return;
      var file = opts.filesById ? opts.filesById(fileId) : null;
      if (!file || !file.file) return;
      var name = opts.lang === "bn" ? (req.title_bn || req.title_en) : (req.title_en || req.title_bn);
      included.push({ req: req, file: file.file, name: name || req.id, pageCount: file.pageCount || 0 });
    });

    function step(msg) {
      if (typeof onProgress === "function") { try { onProgress(msg); } catch (e) { /* ignore */ } }
    }

    var out = null;
    var fonts = null;
    var chain = PDFLib.PDFDocument.create().then(function (doc) {
      out = doc;
      return Promise.all([
        out.embedFont(PDFLib.StandardFonts.Helvetica),
        out.embedFont(PDFLib.StandardFonts.HelveticaBold)
      ]);
    }).then(function (f) {
      fonts = { regular: f[0], bold: f[1] };
      step("Creating cover page…");
      // Page counts are known from the upload state (PDF.js), so the cover
      // (page 1) is drawn first with real counts, then documents are appended.
      drawCover(out, tender, included.map(function (item) {
        return { name: item.name, pages: item.pageCount };
      }), fonts);
      step("Adding documents…");
      var seq = Promise.resolve();
      // Copy pages sequentially in requirement order (preserves in-file order).
      included.forEach(function (item, idx) {
        seq = seq.then(function () {
          step("Adding document " + (idx + 1) + " of " + included.length + ": " + item.name);
          return item.file.arrayBuffer().then(function (buf) {
            if (!buf || buf.byteLength === 0) throw new Error("UNREADABLE_PDF:" + item.name);
            return PDFLib.PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
          }).then(function (src) {
            return out.copyPages(src, src.getPageIndices()).then(function (pages) {
              pages.forEach(function (p) { out.addPage(p); }); // original size kept
            });
          });
        });
      });
      return seq;
    }).then(function () {
      step("Numbering pages…");
      var total = addFooters(out, tenderId); // Y = actual final page count
      step("Saving package…");
      return out.save().then(function (bytes) {
        return {
          bytes: bytes,
          filename: tenderId + "_Package.pdf",
          totalPages: total,
          includedCount: included.length
        };
      });
    });

    return chain;
  }

  window.PackageGenerator = {
    generatePackagePdf: generatePackagePdf
  };
})();
