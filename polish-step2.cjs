var fs = require('fs');
var p = 'tender-package-builder/index.html';
var t = fs.readFileSync(p, 'utf8');
function rep(oldS, newS, label) {
  if (t.indexOf(oldS) < 0) { console.log('MISS: ' + label); return; }
  t = t.split(oldS).join(newS);
  console.log('OK: ' + label);
}

// Upload header: step eyebrow + bold title + pill counter (ids preserved)
rep('<h2 id="upload-heading" class="text-base font-semibold text-slate-900">Upload Documents</h2>',
    '<div>\n          <p class="text-xs font-semibold uppercase tracking-wider text-emerald-700">Step 1 \u00b7 Upload</p>\n          <h2 id="upload-heading" class="text-base font-bold tracking-tight text-slate-900">Upload Tender Documents</h2>\n        </div>',
    'upload-heading');
rep('<span class="text-xs text-slate-500"><span id="file-count">0</span> files',
    '<span class="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm whitespace-nowrap"><span id="file-count">0</span> files',
    'upload-counter');

// Dropzone: hover affordance + emerald icon + bold prompt (id preserved)
rep('class="mt-8 border-2 border-dashed border-slate-300 rounded-xl px-6 py-8 text-center transition-colors"',
    'class="mt-8 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/70 px-6 py-9 text-center transition-all hover:border-emerald-500 hover:bg-emerald-50/40"',
    'dropzone');
rep('class="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center"',
    'class="mx-auto w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm"',
    'dropzone-icon-bg');
rep('<h3 class="mt-4 text-base font-semibold text-slate-900">Upload PDF files</h3>',
    '<h3 class="mt-4 text-base font-bold tracking-tight text-slate-900">Upload PDF files</h3>',
    'dropzone-title');
rep('<p class="mt-1 text-sm text-slate-500">Drag &amp; drop your PDF files here</p>',
    '<p class="mt-1 text-sm font-medium text-slate-600">Drag &amp; drop your PDF files here, or use the button below</p>',
    'dropzone-text');

// Error box polish (id preserved)
rep('class="hidden mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"',
    'class="hidden mt-4 rounded-xl border border-red-200 border-l-4 border-l-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm"',
    'error-box');

// Files table: sticky header + softer empty state (ids preserved)
rep('<thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">',
    '<thead class="bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500 sticky top-0">',
    'files-thead');
rep('id="files-empty" class="px-5 py-8 text-center text-sm text-slate-400"',
    'id="files-empty" class="px-5 py-10 text-center"',
    'files-empty');
rep('<p class="font-medium text-slate-600">No files uploaded yet</p>',
    '<p class="font-semibold text-slate-700">No files uploaded yet</p>',
    'files-empty-title');
rep('<p class="mt-1 text-xs">Uploaded PDFs will appear here with page count and size.</p>',
    '<p class="mt-1 text-xs text-slate-500">Uploaded PDFs will appear here with page count and size.</p>',
    'files-empty-sub');

// Checklist card polish (ids preserved)
rep('<h2 id="checklist-heading" class="text-base font-semibold text-slate-900">Document Checklist</h2>',
    '<div>\n          <p class="text-xs font-semibold uppercase tracking-wider text-emerald-700">Step 2 \u00b7 Match</p>\n          <h2 id="checklist-heading" class="text-base font-bold tracking-tight text-slate-900">Document Checklist</h2>\n        </div>',
    'checklist-heading');
rep('<thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">',
    '<thead class="bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500 sticky top-0">',
    'checklist-thead');

// Summary cards polish (ids + values preserved)
rep('<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Total Documents</p>\n          <p id="stat-total" class="mt-1 text-2xl font-semibold text-slate-900">10</p>',
    '<p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Documents</p>\n          <p id="stat-total" class="mt-1 text-3xl font-bold tracking-tight text-slate-900">10</p>',
    'stat-total');
rep('<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Mandatory</p>\n          <p id="stat-mandatory" class="mt-1 text-2xl font-semibold text-slate-900">8</p>',
    '<p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Mandatory</p>\n          <p id="stat-mandatory" class="mt-1 text-3xl font-bold tracking-tight text-slate-900">8</p>',
    'stat-mandatory');
rep('<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Ready / OK</p>\n          <p id="stat-ready" class="mt-1 text-2xl font-semibold text-emerald-700">0</p>',
    '<p class="text-xs font-semibold uppercase tracking-wider text-emerald-700">Ready / OK</p>\n          <p id="stat-ready" class="mt-1 text-3xl font-bold tracking-tight text-emerald-700">0</p>',
    'stat-ready');
rep('<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Blocking Issues</p>\n          <p id="stat-blocking" class="mt-1 text-2xl font-semibold text-red-700">8</p>',
    '<p class="text-xs font-semibold uppercase tracking-wider text-red-600">Blocking Issues</p>\n          <p id="stat-blocking" class="mt-1 text-3xl font-bold tracking-tight text-red-700">8</p>',
    'stat-blocking');

fs.writeFileSync(p, t);
console.log('DONE');
