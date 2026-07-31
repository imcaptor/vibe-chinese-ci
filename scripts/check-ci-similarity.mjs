#!/usr/bin/env node
import { API_BASE, fetchJson, levenshtein, longestCommonSubstring, normalizeText, parseArgs, readInput, setExitForStatus, splitClauses } from './lib.mjs';

const args = parseArgs();
const content = (await readInput(args)).trim();
const clauses = [...new Set(splitClauses(content))];

function assess(original, candidate) {
  const a = normalizeText(original);
  const b = normalizeText(candidate);
  if (!a || !b) return null;
  if (a === b) return { level: a.length <= 4 ? '人工复核' : '整句相同候选', exact: true, diff: 0, lcs: a.length };
  const diff = levenshtein(a, b);
  const lcs = longestCommonSubstring(a, b);
  if (lcs >= 6) return { level: '高风险', exact: false, diff, lcs };
  if (Math.max(a.length, b.length) >= 6 && diff <= 1) return { level: '高风险', exact: false, diff, lcs };
  if (Math.max(a.length, b.length) < 6 && diff <= 1) return { level: '人工复核', exact: false, diff, lcs };
  return null;
}

const all = [];
let apiError = null;
try {
  if (args.offline) throw new Error('offline test mode');
  const reference = await fetchJson(`${API_BASE}/Tool/Reference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Content: content }),
  });
  for (const sentence of reference.Sentences || []) {
    for (const hit of sentence.References || []) {
      const score = assess(sentence.Clause, hit.Clause);
      if (score) all.push({ original: sentence.Clause, candidate: hit.Clause, ...score, id: hit.WritingId, dynasty: hit.Dynasty, author: hit.Author, title: hit.Title, source: 'Reference' });
    }
  }

  for (const clause of clauses) {
    if (normalizeText(clause).length < 4) continue;
    const data = await fetchJson(`${API_BASE}/Writing/SimilarClauses/${encodeURIComponent(clause)}`);
    for (const group of Array.isArray(data) ? data : []) {
      for (const hit of group.Clauses || group.SimilarClauses || []) {
        const candidate = hit.Content || hit.Clause || '';
        const score = assess(clause, candidate);
        if (score) all.push({ original: clause, candidate, ...score, id: hit.Id || hit.WritingId, dynasty: hit.Dynasty, author: hit.Author, title: hit.Title, source: 'SimilarClauses' });
      }
    }
  }
} catch (error) {
  apiError = error.message;
}

const seen = new Set();
const hits = all.filter(x => {
  const key = [normalizeText(x.original), normalizeText(x.candidate), x.id, x.level].join('|');
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const workCounts = new Map();
for (const h of hits) {
  const key = h.id || `${h.author}|${h.title}`;
  workCounts.set(key, (workCounts.get(key) || 0) + 1);
}
const multiClauseSources = [...workCounts.entries()].filter(([, n]) => n > 1).map(([key, count]) => ({ key, count }));

let status = '通过';
if (apiError) status = '本地校验／待接口复核';
else if (hits.length) status = '需人工确认';

const result = {
  status,
  policy: '先排查成语、典故原文和词牌惯用语；其余整句相同候选视为硬伤，高风险句要求重写。',
  hits,
  multiClauseSources,
  apiError,
};

if (args.json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`【查重】${status}`);
  for (const h of hits) console.log(`- ${h.level}：「${h.original}」≈「${h.candidate}」— ${h.dynasty || ''}${h.author || ''}《${h.title || ''}》`);
  if (apiError) console.log(`- 接口错误：${apiError}`);
}
setExitForStatus(status);
