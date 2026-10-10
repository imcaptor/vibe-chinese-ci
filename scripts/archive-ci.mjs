#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, readInput } from './lib.mjs';

const args = parseArgs();
if (!args.confirmed) {
  console.error('拒绝归档：必须在用户明确确认“定稿／收录”后传入 --confirmed');
  process.exit(2);
}
if (!args.tune) {
  console.error('归档需要 --tune');
  process.exit(1);
}
const content = (await readInput(args)).trim();
const now = new Date();
const date = now.toISOString().slice(0, 10);
const safe = `${args.tune}-${args.title || '无题'}`.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 80);
const dir = path.resolve(process.cwd(), 'archives/vibe-chinese-ci');
await fs.mkdir(dir, { recursive: true });
let file = path.join(dir, `${date}-${safe}.md`);
for (let i = 2; ; i++) {
  try { await fs.access(file); file = path.join(dir, `${date}-${safe}-${i}.md`); }
  catch { break; }
}
const status = args.status || '需人工确认';
const finalLabel = status === '通过' ? '正式定稿' : '暂存稿';
const text = `# ${args.tune}${args.title ? `·${args.title}` : ''}\n\n- 状态：${finalLabel}\n- 校验：${status}\n- 作者／发起人：${args.author || '未注明'}\n- 风格：${args.style || '未注明'}\n- 日期：${date}\n\n${content}\n`;
await fs.writeFile(file, text, 'utf8');
console.log(file);
