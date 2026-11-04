# 角色立绘目录

「灵魂角色」结果页会先读 `index.json`，命中角色名才加载图片；读不到就用角色主题色的渐变字牌兜底，不会 404，也不会拖慢页面。

## 怎么加一张立绘

1. 把图片放进本目录，文件名**必须**和角色名一致（角色名见 `personality-data.js` 里的 `n` 字段），推荐 `.webp`：
   ```
   assets/soul/灰原哀.webp
   ```
2. 在 `index.json` 的 `names` 里加名字：
   ```json
   { "names": ["灰原哀"] }
   ```
   也可以直接指定路径（扩展名/目录任你放）：
   ```json
   { "map": { "灰原哀": "assets/soul/2026/haihara.webp" } }
   ```
3. 建议尺寸：竖版 600×900 以内、单张 < 150KB。结果页是正方形容器 + `object-fit: cover`，横向图会被裁掉两侧。

## 用图的版权提醒

- **官方原画/番剧截图有版权**，只在自己这台机器上私人使用问题不大，一旦公开分发（推到 GitHub Pages）就有风险。
- 相对安全的来源：自己画的同人、作者标注可商用/可再分发的同人图（CC0 / CC-BY，记得在页脚署名）、AI 生成图的授权明确版本。
- 想彻底避开版权问题：保持 `names` 为空，用渐变字牌 + 动效光环，视觉上也成立。

## 动效

立绘外层自带 `soul-aura` 光环（呼吸 + 扩散两段 CSS 动画，不依赖 JS），图片本身还有轻微的浮动缩放；动效编排用 anime.js（结果页元素逐个淡入）。在「系统设置 → 减少动态效果」下全部自动关闭。

## 跟着新番更新角色和题目（不用改代码）

本目录下有两个追加文件，页面加载时自动合并进现有数据：

- `characters-extra.json`：新增角色数组
- `questions-extra.json`：新增加试题数组

加一个角色，往 `characters-extra.json` 里塞一条：

```json
[{
  "n": "角色名", "f": "《作品名》", "g": "男/女", "a": "十几岁", "st": "活跃", "j": "身份",
  "v": [3,0,2,1,-1,-1,2,-2,1,-2],
  "c": "linear-gradient(145deg,#b8c7c9,#5d7478)",
  "tg": ["短标签1", "短标签2"],
  "qt": "一句台词",
  "it": "两三句介绍"
}]
```

`v` 是 10 个 −3~3 的数字，顺序固定：**理性 秩序 孤高 向阳 利他 果决 坚韧 外放 纯粹 竞逐**（正数偏左词，负数偏右词）。

加一道加试题：

```json
[{ "id": "x11", "q": "题干", "o": [
  { "t": "选项A", "s": { "rat": 2, "ord": 1 } },
  { "t": "选项B", "s": { "act": 2, "ord": -2 } }
] }]
```

改完先校验，再提交：

```bash
node tools/soul-check.mjs                                   # 全量校验
node tools/soul-check.mjs --chars repo/assets/soul/characters-extra.json
node tools/soul-check.mjs --questions repo/assets/soul/questions-extra.json
```

最后把 `personality-data.js` 顶部的 `window.SOUL_META.updated` 改成新日期，页面底部会显示「题库更新于 X 年 X 月 X 日」。
