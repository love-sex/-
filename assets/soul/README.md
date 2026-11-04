# 角色立绘目录

「灵魂角色」结果页会先读 `index.json`，命中角色名才加载图片；读不到就用角色主题色的渐变字牌兜底，不会 404，也不会拖慢页面。

现在这里已经放着 134 张立绘（`460×575` webp，平均 22KB，合计约 3MB），来源是 AniList 公开角色库，由 `tools/soul-art.mjs` 批量抓取。

在页面里点「角色图鉴 · 看看全部 134 位角色的立绘 →」可以一次看完所有立绘；顶部会显示「立绘已加载 N / 134」，加载不全时那张会先显示字牌，网络恢复后自动重试 2 次。

## 重新抓一批（角色更新后）

```bash
node tools/soul-art.mjs --dry          # 只检索，打印「中文名 ← 命中角色」核对表
node tools/soul-art.mjs                # 检索 + 下载 + 裁成 460×575 webp + 重写 index.json
node tools/soul-art.mjs --only=芙莉莲  # 只补抓某个角色（不会清掉其它已抓到的）
```

检索词写在 `tools/soul-art-map.json`（中文名 → AniList 检索词 + 作品关键词）。命中靠「角色名 + 作品关键词」双重校验；重名角色（如 Archer / Saber）可以在检索词里直接写 AniList 的角色 id：`["#2087", "Fate/stay night"]`。

## 手动加一张立绘

1. 图片放进本目录，文件名**必须**和角色名一致（角色名见 `personality-data.js` 的 `n` 字段），推荐 `.webp`：
   ```
   assets/soul/灰原哀.webp
   ```
2. 在 `index.json` 的 `names` 里加名字；也可以直接指定路径：
   ```json
   { "map": { "灰原哀": "assets/soul/2026/haihara.webp" } }
   ```
3. 建议竖版、单张 < 150KB。结果页是正方形容器 + `object-fit: cover`，横向图会被裁掉两侧。

## 用图的版权提醒

- 这批立绘是**动漫角色的官方/版权图**，版权归原作者与制作委员会。当前按「个人娱乐、非商业」使用；一旦用来接广告、卖会员或做商业分发，就有侵权风险。
- 想彻底避开风险：把 `index.json` 的 `names` 清空（或删掉本目录的 webp），页面会自动回到「渐变字牌 + 动效光环」，视觉上依然成立。
- 更稳妥的替代：换成自己画的同人图，或作者标注可商用 / CC0 / CC-BY 的图（记得署名）。

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
