#!/usr/bin/env node
import { buildRhymeIndex, fetchJson, loadRhymeBook, loadTune, normalizeText, parseArgs, parseDefinition, readInput, setExitForStatus, splitClauses, API_BASE } from './lib.mjs';

const args = parseArgs();
if (!args.tune) {
  console.error('用法: node scripts/analyze-ci.mjs --tune "词牌" --file poem.txt [--json]');
  process.exit(1);
}

const content = (await readInput(args)).trim();
const { profile } = await loadTune(args.tune);
if (!profile) {
  console.error(`暂不支持词牌：${args.tune}`);
  process.exit(2);
}

function localCheck() {
  const units = parseDefinition(profile.format.Definition);
  const clauses = splitClauses(content);
  const actualLengths = clauses.map(c => Array.from(normalizeText(c)).length);
  const expectedLengths = units.map(u => u.length);
  const errors = [];
  if (clauses.length !== units.length) errors.push(`句数应为 ${units.length}，实际 ${clauses.length}`);
  for (let i = 0; i < Math.min(actualLengths.length, expectedLengths.length); i++) {
    if (actualLengths[i] !== expectedLengths[i]) errors.push(`第${i + 1}句应${expectedLengths[i]}字，实际${actualLengths[i]}字`);
  }
  const expectedTotal = Array.from(profile.format.SampleContent || '').length;
  const actualTotal = Array.from(normalizeText(content)).length;
  if (expectedTotal && actualTotal !== expectedTotal) errors.push(`总字数应为 ${expectedTotal}，实际 ${actualTotal}`);
  return { units, clauses, actualLengths, expectedLengths, expectedTotal, actualTotal, errors };
}

function collectRhymeFeet(local, rhymeIndex) {
  const out = [];
  for (let i = 0; i < Math.min(local.units.length, local.clauses.length); i++) {
    if (!/[韵叠叶]/.test(local.units[i].marker || '')) continue;
    const clean = normalizeText(local.clauses[i]);
    const char = Array.from(clean).at(-1) || '';
    out.push({ clause: i + 1, char, marker: local.units[i].marker, categories: rhymeIndex.get(char) || [] });
  }
  return out;
}

const local = localCheck();
let result;
try {
  if (args.offline) throw new Error('offline test mode');
  const data = await fetchJson(`${API_BASE}/Tool/AnalyzeCi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Content: content,
      RhymeBook: 'clzy',
      TuneName: profile.name,
      TuneFormatIndex: profile.approvedFormatIndex,
    }),
  });

  const hardErrors = [];
  const manual = [];
  if (data.ErrorMessage) hardErrors.push(data.ErrorMessage);
  const q = data.QinPuValidationResult;
  if (!q) hardErrors.push('接口未返回《钦定词谱》校验结果');
  if (q) {
    if (q.TuneName !== profile.name) hardErrors.push(`接口识别词牌为${q.TuneName}，目标为${profile.name}`);
    if (Number(q.TuneId) !== Number(profile.id)) hardErrors.push(`接口 TuneId=${q.TuneId}，目标 TuneId=${profile.id}`);
    if (String(q.FormatIndex) !== '一') hardErrors.push(`接口采用第${q.FormatIndex}体，目标为正体第一体`);
    if (Array.isArray(q.InvalidRhymes) && q.InvalidRhymes.length) hardErrors.push(...q.InvalidRhymes.map(x => `出韵：${typeof x === 'string' ? x : JSON.stringify(x)}`));
    for (const [i, clause] of (q.Clauses || []).entries()) {
      if (clause.ValidationError) hardErrors.push(`第${i + 1}句：${clause.ValidationError}`);
      // NeedBreak marks a stanza/display break in the API response; it is not a metrical error.
      for (const ch of clause.Chars || []) {
        if (!ch.Status) continue;
        const msg = `${ch.Character}：${ch.Status}`;
        if (/因义而异|多音|读音|古今音|人工/.test(ch.Status)) manual.push(msg);
        else hardErrors.push(msg);
      }
    }
  }

  const status = hardErrors.length ? '不通过' : manual.length ? '需人工确认' : '通过';
  result = {
    status,
    source: 'cnkgraph AnalyzeCi',
    tune: profile.name,
    tuneId: profile.id,
    approvedFormatIndex: profile.approvedFormatIndex,
    formatDescription: profile.format.Desc,
    hardErrors,
    manual,
    notification: data.Notification || null,
    qinPu: q || null,
  };
} catch (error) {
  let rhymeFeet = [];
  try {
    const book = await loadRhymeBook();
    rhymeFeet = collectRhymeFeet(local, buildRhymeIndex(book));
  } catch {}
  result = {
    status: '本地校验／待接口复核',
    source: 'local fallback',
    tune: profile.name,
    formatDescription: profile.format.Desc,
    localErrors: local.errors,
    rhymeFeet,
    apiError: error.message,
  };
}

if (args.json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`【${result.tune}】${result.status}`);
  for (const x of result.hardErrors || result.localErrors || []) console.log(`- ${x}`);
  for (const x of result.manual || []) console.log(`- 需人工确认：${x}`);
}
setExitForStatus(result.status);
