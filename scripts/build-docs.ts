// Documentation generator: pnpm docs:build
//
//   docs/DOCUMENTATION-SOURCE.md  ─┐
//   docs/CHANGELOG.md             ─┴─> docs/LEARN-HONO-COMPLETE.html ──(browser print)──> docs/LEARN-HONO-COMPLETE.pdf
//
// 1. Reads the Markdown source and the changelog.
// 2. Converts Markdown to HTML with "marked", highlights code with "highlight.js",
//    turns ```diagram blocks into figures and "> [!NOTE]" quotes into callout boxes.
// 3. Wraps everything in one standalone HTML file (all CSS and JS embedded, works offline).
// 4. Opens that exact HTML file in a headless Chrome/Edge and prints it to PDF,
//    so the PDF always contains exactly what the HTML contains.
// 5. Verifies both files and prints a summary.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import hljs from 'highlight.js';
import { Marked, type Tokens } from 'marked';
import puppeteer from 'puppeteer-core';
import { findBrowser } from './lib/browser';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const SOURCE_FILE = join(DOCS, 'DOCUMENTATION-SOURCE.md');
const CHANGELOG_FILE = join(DOCS, 'CHANGELOG.md');
const HTML_FILE = join(DOCS, 'LEARN-HONO-COMPLETE.html');
const PDF_FILE = join(DOCS, 'LEARN-HONO-COMPLETE.pdf');

const TITLE = 'Learn Hono — The Complete Beginner’s Guide';
const SUBTITLE = 'Building, understanding and extending a full-stack To-Do application with Hono, TypeScript, SQLite and Drizzle ORM';

// ---------------------------------------------------------------------------
// 1. Read the sources
// ---------------------------------------------------------------------------
const source = readFileSync(SOURCE_FILE, 'utf8');
const changelog = readFileSync(CHANGELOG_FILE, 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };

// A short fingerprint of the sources. It is printed on the cover of both the
// HTML and the PDF, so you can see at a glance that they come from the same build.
const buildId = createHash('sha256').update(source).update(changelog).digest('hex').slice(0, 10);
const buildDate = new Date().toISOString().slice(0, 10);

// The changelog becomes the last chapter. Its own "# Changelog" title is replaced.
const changelogBody = changelog.replace(/^#\s+.*\n/, '');
const fullMarkdown = `${source.trim()}\n\n# Appendix — Change History\n\n${changelogBody}`;

// ---------------------------------------------------------------------------
// 2. Markdown -> HTML
// ---------------------------------------------------------------------------
type TocEntry = { level: 1 | 2; id: string; text: string };
const toc: TocEntry[] = [];
const usedIds = new Map<string, number>();

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** "Chapter 2 — Understanding Hono" -> "chapter-2-understanding-hono" (unique). */
function slugify(text: string): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'section';
  const seen = usedIds.get(base) ?? 0;
  usedIds.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

const CALLOUTS: Record<string, string> = { NOTE: 'Note', TIP: 'Tip', WARNING: 'Warning', IMPORTANT: 'Important' };

const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    heading(token: Tokens.Heading) {
      const html = this.parser.parseInline(token.tokens);
      const text = stripTags(html);
      const id = slugify(text);
      if (token.depth === 1 || token.depth === 2) toc.push({ level: token.depth, id, text });
      return `<h${token.depth} id="${id}">${html}</h${token.depth}>\n`;
    },
    code(token: Tokens.Code) {
      const lang = (token.lang ?? '').trim().toLowerCase();
      if (lang === 'diagram') {
        return `<figure class="diagram"><pre>${escapeHtml(token.text)}</pre></figure>\n`;
      }
      const highlighted =
        lang && hljs.getLanguage(lang) ? hljs.highlight(token.text, { language: lang }).value : escapeHtml(token.text);
      const label = lang && lang !== 'text' ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
      return `<div class="code-block">${label}<pre><code class="hljs">${highlighted}</code></pre></div>\n`;
    },
    blockquote(token: Tokens.Blockquote) {
      const body = this.parser.parse(token.tokens);
      const match = body.match(/^<p>\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*/);
      if (match) {
        const kind = match[1];
        const rest = body.slice(match[0].length);
        return `<div class="callout callout-${kind.toLowerCase()}"><div class="callout-title">${CALLOUTS[kind]}</div><p>${rest}</div>\n`;
      }
      return `<blockquote>${body}</blockquote>\n`;
    },
    table(token: Tokens.Table) {
      // Wrap tables so wide ones scroll on small screens instead of overflowing.
      const header = token.header.map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`).join('');
      const rows = token.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`)
        .join('\n');
      return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
    },
  },
});

const contentHtml = marked.parse(fullMarkdown, { async: false });

// Build a small search index: the plain text of each chapter/section.
const searchIndex: { id: string; text: string }[] = [];
{
  const parts = contentHtml.split(/(?=<h[12] id=")/);
  for (const part of parts) {
    const idMatch = part.match(/^<h[12] id="([^"]+)"/);
    if (idMatch) searchIndex.push({ id: idMatch[1], text: stripTags(part).replace(/\s+/g, ' ').toLowerCase() });
  }
}

// ---------------------------------------------------------------------------
// 3. Assemble the standalone HTML file
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const highlightCss = readFileSync(require.resolve('highlight.js/styles/github.css'), 'utf8');

function renderToc(): string {
  let html = '<ol class="toc-list">';
  let open = false;
  for (const entry of toc) {
    if (entry.level === 1) {
      if (open) html += '</ol></li>';
      html += `<li class="toc-chapter" data-id="${entry.id}"><a href="#${entry.id}">${escapeHtml(entry.text)}</a><ol>`;
      open = true;
    } else {
      html += `<li class="toc-section" data-id="${entry.id}"><a href="#${entry.id}">${escapeHtml(entry.text)}</a></li>`;
    }
  }
  if (open) html += '</ol></li>';
  return `${html}</ol>`;
}

const STYLES = `
:root { --ink:#383745; --muted:#5d6678; --line:#e2e6ef; --accent:#cf4520; --accent-soft:#fdeee8; --paper:#ffffff; --bg:#f7f8fb; --code-bg:#f6f8fa; --sidebar:300px; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin:0; font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; color:var(--ink); background:var(--bg); line-height:1.7; font-size:17px; }
h1,h2,h3,h4,.toc,.cover,.callout-title,.code-lang,table,.search { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--accent); }
/* Ligatures off: beginners must see "===" and "=>" exactly as they type them. */
code, pre { font-family: "Cascadia Code", Consolas, "SF Mono", Menlo, monospace; font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0; }

/* Sidebar with table of contents */
.toc { position:fixed; top:0; left:0; bottom:0; width:var(--sidebar); overflow-y:auto; background:var(--paper); border-right:1px solid var(--line); padding:1.25rem 1rem 3rem; font-size:0.86rem; }
.toc h2 { font-size:0.8rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin:0 0 0.6rem; }
.toc .search { width:100%; padding:0.5rem 0.65rem; border:1px solid var(--line); border-radius:8px; font-size:0.86rem; margin-bottom:0.4rem; }
.toc .search-hint { font-size:0.75rem; color:var(--muted); margin:0 0 0.8rem; }
.toc-list, .toc-list ol { list-style:none; margin:0; padding:0; }
.toc-chapter > a { display:block; font-weight:600; color:var(--ink); text-decoration:none; padding:0.3rem 0.4rem; border-radius:6px; margin-top:0.25rem; }
.toc-section > a { display:block; color:var(--muted); text-decoration:none; padding:0.15rem 0.4rem 0.15rem 1rem; border-radius:6px; }
.toc a:hover, .toc a.active { background:var(--accent-soft); color:var(--accent); }
.toc .hidden { display:none; }
.menu-toggle { display:none; }

/* Main column */
main { margin-left:var(--sidebar); }
.content { max-width: 860px; margin:0 auto; padding: 2rem 2.5rem 6rem; background:var(--paper); min-height:100vh; box-shadow: 0 0 0 1px var(--line); }
.content h1 { font-size:2rem; line-height:1.25; margin:3.5rem 0 1rem; padding-top:1.2rem; border-top:4px solid var(--accent); }
.content h1:first-child { margin-top:0; }
.content h2 { font-size:1.45rem; margin:2.4rem 0 0.8rem; padding-bottom:0.3rem; border-bottom:1px solid var(--line); }
.content h3 { font-size:1.15rem; margin:1.8rem 0 0.5rem; }
.content h4 { font-size:1rem; margin:1.4rem 0 0.4rem; color:var(--muted); }
.content p, .content li { overflow-wrap: break-word; }
:not(pre) > code { background:var(--code-bg); border:1px solid var(--line); border-radius:4px; padding:0.05em 0.35em; font-size:0.86em; overflow-wrap:anywhere; }

/* Code blocks */
.code-block { position:relative; margin:1rem 0 1.3rem; }
.code-block pre { margin:0; background:var(--code-bg); border:1px solid var(--line); border-radius:8px; padding:0.95rem 1rem; overflow-x:auto; font-size:0.8rem; line-height:1.55; }
.code-block pre code.hljs { background:transparent; padding:0; }
.code-lang { position:absolute; top:0; right:0; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); background:var(--line); padding:0.1rem 0.5rem; border-radius:0 8px 0 6px; }

/* Diagrams (plain text, so they work offline, in print and in Markdown) */
figure.diagram { margin:1.2rem 0 1.5rem; background:#fffaf7; border:1px solid #f3d6c8; border-left:4px solid var(--accent); border-radius:8px; padding:0.9rem 1rem; overflow-x:auto; }
figure.diagram pre { margin:0; font-size:0.78rem; line-height:1.45; color:#2a2f45; }

/* Callouts */
.callout { border-radius:8px; padding:0.75rem 1rem; margin:1.2rem 0; border-left:4px solid; }
.callout p { margin:0.3rem 0; }
.callout-title { font-weight:700; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; }
.callout-note { background:#eef5ff; border-color:#2563eb; } .callout-note .callout-title { color:#1d4ed8; }
.callout-tip { background:#ecfdf3; border-color:#16a34a; } .callout-tip .callout-title { color:#15803d; }
.callout-warning { background:#fff7ed; border-color:#ea580c; } .callout-warning .callout-title { color:#c2410c; }
.callout-important { background:#f5f3ff; border-color:#7c3aed; } .callout-important .callout-title { color:#6d28d9; }
blockquote { margin:1rem 0; padding:0.2rem 1rem; border-left:4px solid var(--line); color:var(--muted); }

/* Tables */
.table-wrap { overflow-x:auto; margin:1rem 0 1.4rem; }
table { border-collapse:collapse; width:100%; font-size:0.84rem; line-height:1.5; }
th, td { border:1px solid var(--line); padding:0.45rem 0.6rem; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
th { background:#f1f3f9; }
tr:nth-child(even) td { background:#fafbfd; }

/* Cover */
.cover { background: linear-gradient(135deg, #2b2a35 0%, #383745 60%, #4a4757 100%); border-bottom: 6px solid #ef5a35; color:#fff; padding:4rem 3rem; border-radius:0 0 16px 16px; margin: -2rem -2.5rem 2.5rem; }
.cover .kicker { text-transform:uppercase; letter-spacing:0.18em; font-size:0.8rem; color:#f58c5f; }
.cover h1.cover-title { border:none; font-size:2.6rem; margin:0.8rem 0 1rem; padding:0; color:#fff; }
.cover .cover-subtitle { font-size:1.15rem; opacity:0.92; max-width:36rem; line-height:1.5; }
.cover .cover-meta { margin-top:2.5rem; font-size:0.85rem; opacity:0.85; line-height:1.8; }
.cover .cover-stack { margin-top:1.5rem; display:flex; flex-wrap:wrap; gap:0.4rem; }
.cover .cover-stack span { background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); border-radius:999px; padding:0.15rem 0.7rem; font-size:0.8rem; }
.print-toc { display:none; }

/* Small screens */
@media (max-width: 1000px) {
  .toc { transform: translateX(-100%); transition: transform 0.2s; z-index:20; box-shadow: 4px 0 20px rgba(0,0,0,0.15); }
  body.toc-open .toc { transform:none; }
  main { margin-left:0; }
  .menu-toggle { display:block; position:fixed; top:0.75rem; left:0.75rem; z-index:30; background:var(--accent); color:#fff; border:none; border-radius:8px; padding:0.45rem 0.8rem; font-family:system-ui,sans-serif; font-size:0.85rem; }
  .content { padding: 3.5rem 1.1rem 4rem; }
  .cover { margin: -3.5rem -1.1rem 2rem; padding: 4rem 1.5rem 3rem; }
  .cover h1.cover-title { font-size:1.9rem; }
}

/* Printing / PDF */
@media print {
  body { background:#fff; font-size:10.5pt; line-height:1.55; }
  .toc, .menu-toggle { display:none !important; }
  main { margin:0; }
  .content { max-width:none; padding:0; box-shadow:none; }
  .cover { margin:0; border-radius:0; min-height: 247mm; padding: 45mm 18mm 20mm; break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-toc { display:block; break-after: page; font-family: system-ui, sans-serif; }
  .print-toc h2 { font-size:18pt; border:none; margin-top:0; }
  .print-toc ol { list-style:none; padding-left:0; margin:0; }
  .print-toc .toc-chapter { margin-top:0.35rem; }
  .print-toc .toc-chapter > a { font-weight:600; color:var(--ink); text-decoration:none; font-size:10pt; }
  .print-toc .toc-section > a { color:var(--muted); text-decoration:none; font-size:8.5pt; padding-left:1.2rem; display:block; }
  .content h1 { break-before: page; margin-top:0; font-size:20pt; }
  .content h1:first-of-type { break-before: auto; }
  .content h2 { font-size:14pt; }
  .content h3 { font-size:11.5pt; }
  h1, h2, h3, h4 { break-after: avoid; }
  .code-block pre, figure.diagram pre { white-space: pre-wrap; overflow-wrap: anywhere; overflow: visible; font-size:7.8pt; }
  figure.diagram, .callout, tr { break-inside: avoid; }
  .table-wrap { overflow: visible; }
  table { font-size:8.5pt; }
  a { color: var(--ink); text-decoration:none; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const SCRIPT = `
(function () {
  var index = ${JSON.stringify(searchIndex).replace(/</g, '\\u003c')};
  var input = document.getElementById('toc-search');
  var items = Array.prototype.slice.call(document.querySelectorAll('.toc [data-id]'));
  // Search: show only chapters/sections whose text contains every typed word.
  input.addEventListener('input', function () {
    var words = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
    var matches = {};
    index.forEach(function (entry) {
      matches[entry.id] = words.every(function (w) { return entry.text.indexOf(w) !== -1; });
    });
    items.forEach(function (li) {
      if (li.classList.contains('toc-chapter')) {
        var anyChild = li.querySelector('.toc-section:not(.hidden)');
        li.classList.toggle('hidden', words.length > 0 && !matches[li.dataset.id] && !anyChild);
      } else {
        li.classList.toggle('hidden', words.length > 0 && !matches[li.dataset.id]);
      }
    });
    // Run the chapter pass again now that sections are updated.
    items.forEach(function (li) {
      if (!li.classList.contains('toc-chapter')) return;
      var anyChild = li.querySelector('.toc-section:not(.hidden)');
      li.classList.toggle('hidden', words.length > 0 && !matches[li.dataset.id] && !anyChild);
    });
  });
  // Mobile menu button.
  document.querySelector('.menu-toggle').addEventListener('click', function () { document.body.classList.toggle('toc-open'); });
  document.querySelectorAll('.toc a').forEach(function (a) { a.addEventListener('click', function () { document.body.classList.remove('toc-open'); }); });
  // Highlight the section currently on screen.
  var links = {};
  document.querySelectorAll('.toc a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && links[e.target.id]) {
          document.querySelectorAll('.toc a.active').forEach(function (x) { x.classList.remove('active'); });
          links[e.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '0px 0px -75% 0px' });
    document.querySelectorAll('.content h1[id], .content h2[id]').forEach(function (h) { observer.observe(h); });
  }
})();
`;

const tocHtml = renderToc();
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="build-id" content="${buildId}">
<title>${escapeHtml(TITLE)}</title>
<style>${highlightCss}\n${STYLES}</style>
</head>
<body>
<button class="menu-toggle" type="button">☰ Contents</button>
<nav class="toc" aria-label="Table of contents">
  <h2>Contents</h2>
  <input id="toc-search" class="search" type="search" placeholder="Search the manual…" aria-label="Search the manual">
  <p class="search-hint">Filters chapters by their text. Use Ctrl+F to find words on the page.</p>
  ${tocHtml}
</nav>
<main>
<article class="content">
  <header class="cover">
    <div class="kicker">Aeto To-Do Project · Learning Manual</div>
    <h1 class="cover-title">${escapeHtml(TITLE)}</h1>
    <p class="cover-subtitle">${escapeHtml(SUBTITLE)}</p>
    <div class="cover-stack"><span>Hono</span><span>TypeScript</span><span>Node.js</span><span>SQLite</span><span>Drizzle ORM</span><span>Zod</span><span>HTML · CSS · JavaScript</span><span>Vitest</span></div>
    <div class="cover-meta">
      Application version ${escapeHtml(pkg.version)}<br>
      Generated ${buildDate} · Build <span id="build-id">${buildId}</span><br>
      Source: docs/DOCUMENTATION-SOURCE.md + docs/CHANGELOG.md
    </div>
  </header>
  <section class="print-toc"><h2>Table of Contents</h2>${tocHtml}</section>
${contentHtml}
</article>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;

writeFileSync(HTML_FILE, html, 'utf8');
console.log(`HTML written: ${HTML_FILE}`);

// ---------------------------------------------------------------------------
// 4. HTML -> PDF (print the file we just wrote)
// ---------------------------------------------------------------------------
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
let domHeadingCount = 0;
let domBuildId = '';
try {
  const page = await browser.newPage();
  // The manual must never run unexpected code. Script errors or dialogs
  // (alert/confirm) mean something in the content broke out of its HTML.
  const pageProblems: string[] = [];
  page.on('pageerror', (err) => pageProblems.push(`Script error in HTML: ${err}`));
  page.on('dialog', async (dialog) => {
    pageProblems.push(`Unexpected dialog in HTML: ${dialog.message()}`);
    await dialog.dismiss();
  });
  await page.goto(pathToFileURL(HTML_FILE).href, { waitUntil: 'load' });
  if (pageProblems.length > 0) throw new Error(pageProblems.join('\n'));
  await page.emulateMediaType('print');

  // Read back what the browser actually loaded, to verify it before printing.
  domHeadingCount = await page.$$eval('.content > h1[id], .content > h2[id]', (els) => els.length);
  domBuildId = await page.$eval('#build-id', (el) => el.textContent ?? '');

  const small = 'font-family: system-ui, Segoe UI, sans-serif; font-size: 8px; color: #6b7280; width: 100%; padding: 0 18mm;';
  await page.pdf({
    path: PDF_FILE,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    outline: true, // PDF bookmarks generated from the headings
    tagged: true,
    margin: { top: '20mm', bottom: '18mm', left: '18mm', right: '18mm' },
    headerTemplate: `<div style="${small} display:flex; justify-content:space-between;"><span>${escapeHtml(TITLE)}</span><span>Aeto To-Do Learning Manual</span></div>`,
    footerTemplate: `<div style="${small} display:flex; justify-content:space-between;"><span>Build ${buildId} · ${buildDate}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });
} finally {
  await browser.close();
}
console.log(`PDF written:  ${PDF_FILE}`);

// ---------------------------------------------------------------------------
// 5. Verify
// ---------------------------------------------------------------------------
const problems: string[] = [];
const pdfBytes = readFileSync(PDF_FILE);
const pdfText = pdfBytes.toString('latin1');
const pageCount = (pdfText.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

if (!pdfBytes.subarray(0, 5).toString().startsWith('%PDF')) problems.push('PDF file does not start with %PDF');
if (pageCount < 10) problems.push(`PDF has only ${pageCount} pages`);
if (domHeadingCount !== toc.length) {
  problems.push(`Browser saw ${domHeadingCount} chapter/section headings but the source has ${toc.length}`);
}
if (domBuildId !== buildId) problems.push(`HTML build id ${domBuildId} does not match source build id ${buildId}`);
for (const entry of toc) {
  if (!html.includes(`id="${entry.id}"`)) problems.push(`Missing heading anchor #${entry.id}`);
}

const chapters = toc.filter((t) => t.level === 1).length;
console.log('\nVerification');
console.log(`  Build id:            ${buildId} (HTML and PDF)`);
console.log(`  Chapters / sections: ${chapters} / ${toc.length - chapters}`);
console.log(`  Headings in browser: ${domHeadingCount} (expected ${toc.length})`);
console.log(`  HTML size:           ${(statSync(HTML_FILE).size / 1024).toFixed(0)} KB`);
console.log(`  PDF size / pages:    ${(statSync(PDF_FILE).size / 1024).toFixed(0)} KB / ${pageCount} pages`);

if (problems.length > 0) {
  console.error('\nDocumentation build FAILED:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nDocumentation build OK: HTML and PDF regenerated from the same source.');
