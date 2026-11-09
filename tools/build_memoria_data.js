const https = require('https');
const fs = require('fs');
const path = require('path');

const API = 'https://magireco.fandom.com/api.php';
const OUT = path.join(__dirname, '..', 'MemoriaData.jsxinc');

function getJson(params) {
  const url = API + '?' + new URLSearchParams({
    format: 'json',
    formatversion: '2',
    ...params
  });
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Codex-Memoria-AE-Panel/1.0 (personal offline dataset)' }
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(new Error(`Invalid JSON: ${error.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Request timed out')));
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJsonRetry(params) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { return await getJson(params); }
    catch (error) {
      last = error;
      await delay(500 * attempt);
    }
  }
  throw last;
}

function extractTemplate(source, templateName) {
  const re = new RegExp('\\{\\{\\s*' + templateName + '\\b', 'i');
  const match = re.exec(source);
  if (!match) return null;
  const start = match.index;
  let depth = 0;
  for (let i = start; i < source.length - 1; i++) {
    const pair = source.slice(i, i + 2);
    if (pair === '{{') { depth++; i++; continue; }
    if (pair === '}}') {
      depth--; i++;
      if (depth === 0) return source.slice(start + 2, i - 1);
    }
  }
  return null;
}

function splitTopLevel(text, delimiter) {
  const parts = [];
  let last = 0;
  let curly = 0;
  let square = 0;
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { curly++; i++; continue; }
    if (pair === '}}') { curly = Math.max(0, curly - 1); i++; continue; }
    if (pair === '[[') { square++; i++; continue; }
    if (pair === ']]') { square = Math.max(0, square - 1); i++; continue; }
    if (text[i] === delimiter && curly === 0 && square === 0) {
      parts.push(text.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(text.slice(last));
  return parts;
}

function decodeEntities(text) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»'
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
    if (code[0] === '#') {
      const hex = code[1].toLowerCase() === 'x';
      const n = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return Object.prototype.hasOwnProperty.call(named, code.toLowerCase()) ? named[code.toLowerCase()] : all;
  });
}

function cleanWikitext(text) {
  if (!text) return '';
  let out = text;
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, '');
  out = out.replace(/<ref\b[^>]*\/\s*>/gi, '');
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');
  out = out.replace(/\[(?:https?:\/\/)[^\s\]]+\s+([^\]]+)\]/g, '$1');
  out = out.replace(/\[(?:https?:\/\/)[^\]]+\]/g, '');
  out = out.replace(/\{\{(?:lang\s*\|\s*(?:ja|en)\s*\|)?([^{}|]+)\}\}/gi, '$1');
  out = out.replace(/\{\{(?:ruby|furigana)\s*\|\s*([^|{}]+)\|[^{}]+\}\}/gi, '$1');
  out = out.replace(/\{\{[^{}]*\}\}/g, '');
  out = out.replace(/<[^>]+>/g, '');
  out = out.replace(/'''?/g, '');
  out = decodeEntities(out);
  out = out.replace(/\r\n?/g, '\n');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n[ \t]+/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function parseLore(source) {
  const body = extractTemplate(source, 'MemoriaLore');
  if (!body) return null;
  const chunks = splitTopLevel(body, '|');
  const variants = {};
  for (let i = 1; i < chunks.length; i++) {
    const pair = splitTopLevel(chunks[i], '=');
    if (pair.length < 2) continue;
    const key = pair.shift().trim().toLowerCase();
    const value = cleanWikitext(pair.join('='));
    if (key && value) variants[key] = value;
  }
  return Object.keys(variants).length ? variants : null;
}

async function getTitles() {
  const titles = [];
  let cont = {};
  do {
    const json = await getJsonRetry({
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Category:Memoria',
      cmnamespace: '0',
      cmlimit: '500',
      cmtype: 'page',
      ...cont
    });
    for (const item of json.query.categorymembers) titles.push(item.title);
    cont = json.continue || null;
  } while (cont);
  return titles;
}

async function getEntries(titles) {
  const entries = [];
  for (let offset = 0; offset < titles.length; offset += 50) {
    const batch = titles.slice(offset, offset + 50);
    const json = await getJsonRetry({
      action: 'query',
      titles: batch.join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main'
    });
    for (const page of json.query.pages || []) {
      const source = page.revisions && page.revisions[0] && page.revisions[0].slots.main.content;
      const variants = source && parseLore(source);
      if (variants) entries.push({ title: page.title, variants });
    }
    process.stdout.write(`\rFetched ${Math.min(offset + 50, titles.length)} / ${titles.length}`);
    await delay(100);
  }
  process.stdout.write('\n');
  return entries.sort((a, b) => a.title.localeCompare(b.title));
}

(async () => {
  const titles = await getTitles();
  console.log(`Found ${titles.length} Memoria pages.`);
  const entries = await getEntries(titles);
  const counts = {};
  for (const entry of entries) {
    for (const key of Object.keys(entry.variants)) counts[key] = (counts[key] || 0) + 1;
  }
  const header = [
    '// Generated from https://magireco.fandom.com/wiki/Memoria_List',
    `// Generated: ${new Date().toISOString()}`,
    `// Entries: ${entries.length}`,
    '// Source content is community-authored and available under CC BY-SA.',
    'var MEMORIA_DATA = '
  ].join('\n');
  fs.writeFileSync(OUT, header + JSON.stringify(entries, null, 0) + ';\n', 'utf8');
  console.log(`Wrote ${entries.length} entries to ${OUT}`);
  console.log('Variants:', counts);
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
