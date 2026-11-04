# 第三方组件来源与许可

本目录下的文件按原样分发，仅用于「灵魂角色」模块，未做修改。

| 文件 | 项目 | 版本 | 许可证 | 版权 |
|---|---|---|---|---|
| `chart.umd.min.js` | [chartjs/Chart.js](https://github.com/chartjs/Chart.js)（67.8k ★） | 4.4.1 | MIT | © 2014-2024 Chart.js Contributors |
| `html2canvas.min.js` | [niklasvh/html2canvas](https://github.com/niklasvh/html2canvas)（31.9k ★） | 1.4.1 | MIT | © 2012 Niklas von Hertzen |
| `anime.iife.min.js` | [juliangarnier/anime](https://github.com/juliangarnier/anime)（74.2k ★） | 4.0.2 | MIT | © 2025 Julian Garnier |
| `fuse.min.js` | [krisk/Fuse](https://github.com/krisk/Fuse)（20.5k ★） | 7.0.0 | Apache-2.0 | © 2017 Kiro Risk |
| `medium-zoom.min.js` | [francoischalifour/medium-zoom](https://github.com/francoischalifour/medium-zoom)（3.9k ★） | 1.1.0 | MIT | © 2018 François Chalifour |

MIT / Apache-2.0 许可证允许自由使用、修改与再分发，保留版权声明即可。

用途：
- Chart.js：结果页十维人格雷达图与分享长图中的雷达图。
- html2canvas：把结果卡截成长图（PNG）供下载分享；页面顶部已有 CDN 引入，此处为本地兜底，CDN 不可用时自动切换。
- anime.js：结果页角色卡、相似角色列表的入场动效；系统开启「减少动态效果」时不加载。
- Fuse.js：角色图鉴的模糊搜索（角色名 / 作品名 / 标签，允许错别字与部分匹配），只在打开图鉴时加载。
- medium-zoom：点角色立绘看原图（带过渡动画）。
