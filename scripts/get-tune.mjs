#!/usr/bin/env node
import { loadTune, parseArgs } from './lib.mjs';

const args = parseArgs();
const name = args._[0] || args.tune;
if (!name) {
  console.error('用法: node scripts/get-tune.mjs "词牌名" [--json]');
  process.exit(1);
}

const { entry, profile } = await loadTune(name);
if (!entry) {
  console.error(`暂不支持词牌：${name}`);
  process.exit(2);
}

const result = {
  name: profile.name,
  aliases: profile.aliases,
  tuneId: profile.id,
  type: profile.type,
  approvedFormatIndex: profile.approvedFormatIndex,
  description: profile.format.Desc,
  definition: profile.format.Definition,
  leadingChars: profile.format.LeadingChars,
  sampleAuthor: profile.format.SampleAuthor,
  sampleContent: profile.format.SampleContent,
  comment: profile.format.Comment,
};

if (args.json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`【${result.name}】${result.description}`);
  if (result.aliases?.length) console.log(`别名：${result.aliases.join('、')}`);
  console.log(`正体索引：${result.approvedFormatIndex}`);
  console.log(`词谱：${result.definition}`);
  if (result.leadingChars) console.log(`领字：${JSON.stringify(result.leadingChars)}`);
}
