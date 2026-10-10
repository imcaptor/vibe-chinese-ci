import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_BASE = 'https://open.cnkgraph.com/api';
const RATE_FILE = path.join(os.tmpdir(), 'vibe-chinese-ci-cnkgraph-rate.json');

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) { out._.push(item); continue; }
    const key = item.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

export async function readInput(args) {
  if (args.file) return fs.readFile(args.file, 'utf8');
  if (typeof args.content === 'string') return args.content;
  if (!process.stdin.isTTY) {
    let s = '';
    for await (const chunk of process.stdin) s += chunk;
    if (s.trim()) return s;
  }
  throw new Error('请用 --file、--content 或 stdin 提供词作正文');
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function rateGate() {
  let last = 0;
  try { last = JSON.parse(await fs.readFile(RATE_FILE, 'utf8')).last || 0; } catch {}
  const wait = Math.max(0, 1050 - (Date.now() - last));
  if (wait) await sleep(wait);
  await fs.writeFile(RATE_FILE, JSON.stringify({ last: Date.now() }));
}

export async function fetchJson(url, options = {}, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    await rateGate();
    try {
      const response = await fetch(url, {
        ...options,
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
        error.retryAfter = Number(response.headers.get('retry-after') || 0);
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const wait = error.retryAfter ? error.retryAfter * 1000 : 3000 + (attempt - 1) * 1000;
      await sleep(wait);
    }
  }
  throw lastError;
}

export function normalizeName(s = '') {
  return s.normalize('NFKC').replace(/[《》〈〉\s]/g, '').trim();
}

export function normalizeText(s = '') {
  return s.normalize('NFKC').replace(/[，。、！？；：”“‘’（）《》【】\s,.!?;:'"()\[\]{}<>·…—-]/g, '');
}

export function splitClauses(s = '') {
  return s.split(/[，。！？；：、\n]+/).map(x => x.trim()).filter(Boolean);
}

export async function loadTune(name) {
  const root = new URL('../references/tunes/', import.meta.url);
  const index = JSON.parse(await fs.readFile(new URL('index.json', root), 'utf8'));
  const needle = normalizeName(name);
  const entry = index.tunes.find(t => [t.name, ...(t.aliases || [])].some(n => normalizeName(n) === needle));
  if (!entry) return { index, entry: null, profile: null };
  const profile = JSON.parse(await fs.readFile(new URL(entry.file, root), 'utf8'));
  return { index, entry, profile };
}

export function parseDefinition(definition = '') {
  const toneChars = new Set(['○', '●', '◎', '⊙', '△', '▲']);
  const units = [];
  let length = 0;
  let marker = '';
  for (const ch of definition) {
    if (toneChars.has(ch)) {
      if (marker && length) { units.push({ length, marker }); length = 0; marker = ''; }
      length++;
    } else if (/韵|句|叠|叶|换|读/.test(ch)) {
      marker += ch;
      if (/[韵句叠]/.test(ch) && length) { units.push({ length, marker }); length = 0; marker = ''; }
    }
  }
  if (length) units.push({ length, marker });
  return units;
}

export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = old;
    }
  }
  return prev[b.length];
}

export function longestCommonSubstring(a, b) {
  const dp = Array(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = b.length; j >= 1; j--) {
      dp[j] = a[i - 1] === b[j - 1] ? dp[j - 1] + 1 : 0;
      best = Math.max(best, dp[j]);
    }
  }
  return best;
}

export async function loadRhymeBook() {
  const url = new URL('../references/rhyme/clzy.json', import.meta.url);
  return JSON.parse(await fs.readFile(url, 'utf8'));
}

export function buildRhymeIndex(book) {
  const map = new Map();
  for (const cat of book.Categories || []) {
    for (const ps of cat.PingShuiCategories || []) {
      for (const item of ps.Chars || []) {
        const row = { group: cat.Group, tone: cat.Tone, category: ps.Name, comment: item.Comment || null };
        if (!map.has(item.Char)) map.set(item.Char, []);
        map.get(item.Char).push(row);
      }
    }
  }
  return map;
}

export function setExitForStatus(status) {
  if (status === '不通过') process.exitCode = 2;
  else if (status === '需人工确认') process.exitCode = 3;
  else if (status === '本地校验／待接口复核') process.exitCode = 4;
}
