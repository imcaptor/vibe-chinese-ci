# 定稿归档

群聊作品不自动保存。只有用户明确说“定稿”“收录”或作同等确认时才归档。

运行：

```bash
node scripts/archive-ci.mjs --confirmed --tune "词牌" --title "题目" --author "作者或发起人" --file /tmp/ci.txt --style "风格" --status "通过"
```

归档到当前 workspace 的 `archives/vibe-chinese-ci/`，与其他 skill 完全分开。

至少记录：日期、作者或发起人、词牌、题目、采用风格、正文、最终状态和校验摘要。

未通过接口复核或仍有人工确认项者只能标为暂存稿，不能标正式定稿。
