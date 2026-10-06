var fs = require('fs');
var p = 'tender-package-builder/index.html';
var t = fs.readFileSync(p, 'utf8');
function rep(oldS, newS, label) {
  if (t.indexOf(oldS) < 0) { console.log('MISS: ' + label); return; }
  t = t.split(oldS).join(newS);
  console.log('OK: ' + label);
}

// 1. Upload card header polish (ids preserved)
rep('<h2 id="upload-heading" class="text-base font-semibold text-slate-900">Upload Tender Documents</h2>',
    '<p class="text-xs font-semibold uppercase tracking-wider text-emerald-700">Step 1 \u00b7 Upload</p>\n        <h2 id="upload-heading" class="text-base font-bold tracking-tight text-slate-900">Upload Tender Documents</h2>',
    'upload-heading');
rep('<span class="text-xs text-slate-500"><span id="file-count">0</span> files',
    '<span class="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm whitespace-nowrap"><span id="file-count">0</span> files',
    'upload-counter');

// 2. Dropzone polish (id + file-input preserved)
rep('border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 px-6 py-10 text-center transition-colors',
    'border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/70 px-6 py-10 text-center transition-all hover:border-emerald-500 hover:bg-emerald-50/40',
    'dropzone');
rep('class="w-6 h-6 text-red-600"',
    'class="w-6 h-6 text-emerald-700"',
    'dropzone-icon');
rep('<p class="mt-3 text-sm text-slate-700">Drag &amp; drop your PDF files here</p>',
    '<p class="mt-4 text-sm font-semibold text-slate-800">Drag &amp; drop your PDF files here</p>\n          <p class="mt-1 text-xs text-slate-500">or</p>',
    'dropzone-text');

// 3. Error box polish (id preserved)
rep('class="hidden mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3" role="alert"',
    'class="hidden mt-4 text-sm text-red-800 bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-xl px-4 py-3 shadow-sm" role="alert" aria-live="assertive"',
    'error-box');

fs.writeFileSync(p, t);
console.log('DONE');
