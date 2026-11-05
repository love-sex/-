/* ==========================================================================
   二次元角色库 · 122 条（46 发型 + 12 刘海 + 20 发色 + 16 发饰 + 19 眼色 + 9 眼型）
   结构参照 HRuiCcc/RuiC-PoseAtlas（三图鉴 / 三语 / 编号 / 渐进加载）
   配色与换色参照 gka/chroma.js 的明暗派生思路
   角色卡导出遵循 character-card-spec-v2（SillyTavern 生态通用）
   全部为程序化矢量，无任何第三方图片素材。
   ========================================================================== */
(function () {
  'use strict';

  var W = 300, H = 300;
  var F = { cx: 150, cy: 108, rx: 31, ry: 41 };
  var TOP = F.cy - F.ry;          // 68
  var BOT = F.cy + F.ry;          // 148
  var LX = F.cx - F.rx;           // 117
  var RX = F.cx + F.rx;           // 183

  function f(n) { return Math.round(n * 10) / 10; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function pad(n) { return ('00' + n).slice(-3); }

  /* ===================== 1. 颜色 ===================== */
  // 每种发色给 light / base / dark 三档，light 由 base 提亮、dark 压暗，保证渐变自然
  var HAIR_COLORS = [
    { id: 'black', zh: '黑发', en: 'black', ja: '黒髪', base: '#2b2530' },
    { id: 'blueblack', zh: '蓝黑', en: 'blue black', ja: '藍黒', base: '#2a3040' },
    { id: 'darkbrown', zh: '深棕', en: 'dark brown', ja: 'ダークブラウン', base: '#4a3126' },
    { id: 'chestnut', zh: '栗棕', en: 'chestnut', ja: '栗色', base: '#7b4b32' },
    { id: 'brown', zh: '棕发', en: 'brown', ja: 'ブラウン', base: '#8f5f3d' },
    { id: 'lightbrown', zh: '浅棕', en: 'light brown', ja: 'ライトブラウン', base: '#a9784f' },
    { id: 'flax', zh: '亚麻', en: 'flax', ja: '亜麻色', base: '#c2a273' },
    { id: 'blonde', zh: '金发', en: 'blonde', ja: '金髪', base: '#e0c26a' },
    { id: 'platinum', zh: '白金', en: 'platinum', ja: 'プラチナ', base: '#e8ddc4' },
    { id: 'silver', zh: '银发', en: 'silver', ja: '銀髪', base: '#c8ccd4' },
    { id: 'gray', zh: '灰发', en: 'gray', ja: '灰色', base: '#9aa0a8' },
    { id: 'pink', zh: '粉发', en: 'pink', ja: 'ピンク', base: '#f0a5bd' },
    { id: 'sakura', zh: '樱粉', en: 'sakura', ja: '桜色', base: '#f7c2cf' },
    { id: 'rose', zh: '玫瑰', en: 'rose', ja: 'ローズ', base: '#d4718b' },
    { id: 'red', zh: '红发', en: 'red', ja: '赤髪', base: '#c84b46' },
    { id: 'wine', zh: '酒红', en: 'wine red', ja: 'ワインレッド', base: '#8e3040' },
    { id: 'orange', zh: '橙发', en: 'orange', ja: 'オレンジ', base: '#e08a45' },
    { id: 'peach', zh: '蜜桃', en: 'peach', ja: 'ピーチ', base: '#f2b48c' },
    { id: 'mint', zh: '薄荷', en: 'mint', ja: 'ミント', base: '#9fd8c4' },
    { id: 'purple', zh: '紫发', en: 'purple', ja: '紫髪', base: '#9a7bc4' }
  ];

  var EYE_COLORS = [
    { id: 'amber', zh: '琥珀', en: 'amber', base: '#c98a2e' },
    { id: 'gold', zh: '金瞳', en: 'gold', base: '#d9a93c' },
    { id: 'hazel', zh: '榛色', en: 'hazel', base: '#9a7b3e' },
    { id: 'brown', zh: '棕瞳', en: 'brown', base: '#7a5230' },
    { id: 'darkbrown', zh: '深棕瞳', en: 'dark brown', base: '#4a3120' },
    { id: 'ruby', zh: '红瞳', en: 'ruby', base: '#b8353c' },
    { id: 'wine', zh: '酒红瞳', en: 'wine', base: '#7e2433' },
    { id: 'orange', zh: '橙瞳', en: 'orange', base: '#d97a35' },
    { id: 'peach', zh: '蜜桃瞳', en: 'peach', base: '#e8a179' },
    { id: 'yellow', zh: '黄瞳', en: 'yellow', base: '#dfc04a' },
    { id: 'olive', zh: '橄榄', en: 'olive', base: '#a8b44e' },
    { id: 'green', zh: '绿瞳', en: 'green', base: '#4e8f5e' },
    { id: 'emerald', zh: '翡翠', en: 'emerald', base: '#2f7a55' },
    { id: 'teal', zh: '青瞳', en: 'teal', base: '#2f8a86' },
    { id: 'sky', zh: '天蓝', en: 'sky blue', base: '#5aa5cc' },
    { id: 'blue', zh: '蓝瞳', en: 'blue', base: '#3f6fb5' },
    { id: 'navy', zh: '深蓝', en: 'navy', base: '#2f4a80' },
    { id: 'purple', zh: '紫瞳', en: 'purple', base: '#7b5aa8' },
    { id: 'gray', zh: '灰瞳', en: 'gray', base: '#8b8f99' }
  ];

  /* ===================== 2. 选项 ===================== */
  // topo 决定轮廓拓扑，其余参数微调长度/蓬松/分缝/卷度
  var HAIRS = [
    { zh: '长发', en: 'long hair', ja: 'ロング', topo: 'straight', L: 1.2, Wd: 1, P: 0 },
    { zh: '超长发', en: 'very long hair', ja: 'ベリーロング', topo: 'straight', L: 1.85, Wd: 1.05, P: 0 },
    { zh: '中长发', en: 'medium long hair', ja: 'ミディアムロング', topo: 'straight', L: 0.85, Wd: 1, P: 0 },
    { zh: '齐肩发', en: 'collarbone hair', ja: 'コリボンヘア', topo: 'straight', L: 0.55, Wd: 1, P: 0 },
    { zh: '高层次长发', en: 'layered long hair', ja: 'レイヤーロング', topo: 'wolf', L: 1.3, Wd: 1.1, P: 0 },
    { zh: '不对称长发', en: 'asymmetric long hair', ja: 'アシンメトリー', topo: 'asym', L: 1.25, Wd: 1, P: 0.4 },
    { zh: '偏分长发', en: 'side part long hair', ja: 'サイド分けロング', topo: 'straight', L: 1.2, Wd: 1, P: 0.45 },
    { zh: '狼尾', en: 'wolf cut', ja: 'ウルフカット', topo: 'wolf', L: 0.95, Wd: 1.15, P: 0 },
    { zh: '鲻鱼头', en: 'mullet', ja: 'マレット', topo: 'wolf', L: 0.7, Wd: 1.2, P: 0 },
    { zh: '公主切', en: 'princess cut', ja: '姫カット', topo: 'hime', L: 0.9, Wd: 1, P: 0 },
    { zh: '姬发式', en: 'hime cut', ja: '姫カット風', topo: 'hime', L: 1.25, Wd: 1, P: 0 },
    { zh: '微卷长发', en: 'wavy long hair', ja: 'ゆる巻きロング', topo: 'wavy', L: 1.25, Wd: 1.05, P: 0, C: 0.5 },
    { zh: '大波浪', en: 'big waves', ja: '大波ウェーブ', topo: 'wavy', L: 1.45, Wd: 1.15, P: 0, C: 0.9 },
    { zh: '水波纹', en: 'water wave', ja: '水波ウェーブ', topo: 'wavy', L: 1.1, Wd: 1.1, P: 0, C: 1 },
    { zh: '内扣中长', en: 'inward curl bob', ja: '内巻きボブ', topo: 'bob', L: 0.75, Wd: 1, P: 0, C: 1 },
    { zh: '外翻长发', en: 'flip long hair', ja: '外ハネロング', topo: 'wavy', L: 1.0, Wd: 1, P: 0, C: 1.2 },
    { zh: '羊毛卷', en: 'curly hair', ja: 'カーリーヘア', topo: 'curly', L: 1.0, Wd: 1.2, P: 0, C: 1 },
    { zh: '短卷发', en: 'short curly', ja: 'ショートカーリー', topo: 'curly', L: 0.5, Wd: 1.15, P: 0, C: 1 },
    { zh: '烫发长发', en: 'perm long hair', ja: 'パーマロング', topo: 'curly', L: 1.3, Wd: 1.1, P: 0, C: 0.8 },
    { zh: '波波头', en: 'bob cut', ja: 'ボブ', topo: 'bob', L: 0.5, Wd: 1, P: 0, C: 0 },
    { zh: '短波波头', en: 'short bob', ja: 'ショートボブ', topo: 'bob', L: 0.28, Wd: 1, P: 0, C: 0 },
    { zh: '蘑菇头', en: 'mushroom cut', ja: 'マッシュルーム', topo: 'bob', L: 0.34, Wd: 1.25, P: 0, C: 0 },
    { zh: '齐耳短发', en: 'ear length short', ja: '耳下ショート', topo: 'pixie', L: 0.34, Wd: 1, P: 0 },
    { zh: '精灵短发', en: 'pixie cut', ja: 'ピクシー', topo: 'pixie', L: 0.2, Wd: 0.92, P: 0 },
    { zh: '男孩风短发', en: 'tomboy short', ja: 'ボーイッシュ', topo: 'pixie', L: 0.26, Wd: 1.05, P: 0.3 },
    { zh: '齐刘海长直', en: 'long straight with bangs', ja: 'ぱっつんロング', topo: 'straight', L: 1.3, Wd: 1, P: 0, bang: 'straight' },
    { zh: '空气刘海长发', en: 'air bangs long hair', ja: 'エアリー前髪ロング', topo: 'straight', L: 1.2, Wd: 1, P: 0, bang: 'airy' },
    { zh: '单马尾', en: 'ponytail', ja: 'ポニーテール', topo: 'ponytail', L: 0.9, Wd: 1, P: 0, TH: 0.5 },
    { zh: '高马尾', en: 'high ponytail', ja: 'ハイポニー', topo: 'ponytail', L: 1.1, Wd: 1, P: 0, TH: 0.95 },
    { zh: '低马尾', en: 'low ponytail', ja: 'ローポニー', topo: 'ponytail', L: 0.85, Wd: 1, P: 0, TH: 0.15 },
    { zh: '侧马尾', en: 'side ponytail', ja: 'サイドポニー', topo: 'ponytail', L: 0.95, Wd: 1, P: 0, TH: 0.7, TS: 1 },
    { zh: '双马尾', en: 'twintails', ja: 'ツインテール', topo: 'twin', L: 1.0, Wd: 1, P: 0, TH: 0.55 },
    { zh: '低双马尾', en: 'low twintails', ja: 'ローツイン', topo: 'twin', L: 0.9, Wd: 1, P: 0, TH: 0.2 },
    { zh: '高双马尾', en: 'high twintails', ja: 'ハイツイン', topo: 'twin', L: 1.15, Wd: 1, P: 0, TH: 0.95 },
    { zh: '丸子头', en: 'bun', ja: 'お団子', topo: 'bun', L: 0.4, Wd: 1, P: 0, TH: 0.85 },
    { zh: '双丸子', en: 'double bun', ja: 'お団子ツイン', topo: 'bun', L: 0.45, Wd: 1, P: 0, TH: 0.8, TS: 1 },
    { zh: '半丸子头', en: 'half bun', ja: 'ハーフアップ', topo: 'bun', L: 1.1, Wd: 1, P: 0, TH: 0.9, half: 1 },
    { zh: '麻花辫', en: 'braid', ja: '三つ編み', topo: 'braid', L: 1.0, Wd: 1, P: 0, TS: 1 },
    { zh: '双麻花辫', en: 'twin braids', ja: 'ツイン三つ編み', topo: 'braid', L: 1.0, Wd: 1, P: 0, TS: 2 },
    { zh: '侧编发', en: 'side braid', ja: 'サイド編み込み', topo: 'braid', L: 0.95, Wd: 1, P: 0, TS: -1 },
    { zh: '低盘发', en: 'low updo', ja: 'ローポニーアップ', topo: 'updo', L: 0.3, Wd: 1, P: 0, TH: 0.1 },
    { zh: '法式盘发', en: 'french twist', ja: 'フレンチツイスト', topo: 'updo', L: 0.35, Wd: 1, P: 0, TH: 0.45 },
    { zh: '编发环', en: 'halo braid', ja: 'コロネ', topo: 'updo', L: 0.4, Wd: 1, P: 0, TH: 0.6, halo: 1 },
    { zh: '内外层次', en: 'choppy layers', ja: 'レイヤーショート', topo: 'wolf', L: 0.6, Wd: 1.1, P: 0 },
    { zh: '中分长发', en: 'center part long', ja: 'センター分けロング', topo: 'straight', L: 1.35, Wd: 1, P: -0.05 },
    { zh: '三七分长发', en: 'three-seven part', ja: 'スリーセブン', topo: 'straight', L: 1.15, Wd: 1, P: 0.35 }
  ];

  var BANGS = [
    { id: 'straight', zh: '齐刘海', en: 'straight bangs', ja: 'ぱっつん前髪' },
    { id: 'center', zh: '中分', en: 'center part', ja: 'センターパート' },
    { id: 'side', zh: '侧分刘海', en: 'side part bangs', ja: 'サイド分け' },
    { id: 'airy', zh: '空气刘海', en: 'air bangs', ja: 'エアリー前髪' },
    { id: 'swept', zh: '斜刘海', en: 'swept bangs', ja: '流し前髪' },
    { id: 'none', zh: '无刘海', en: 'no bangs', ja: '前髪なし' },
    { id: 'choppy', zh: '碎刘海', en: 'choppy bangs', ja: 'ギザギザ前髪' },
    { id: 'double', zh: '双层刘海', en: 'double bangs', ja: '二重前髪' },
    { id: 'heart', zh: '心形刘海', en: 'heart bangs', ja: 'ハート前髪' },
    { id: 'catear', zh: '猫耳刘海', en: 'cat ear bangs', ja: '猫耳前髪' },
    { id: 'curtain', zh: '八字刘海', en: 'curtain bangs', ja: 'カーテンバング' },
    { id: 'longside', zh: '长侧分', en: 'long side part', ja: '長めサイド分け' }
  ];

  var ACCS = [
    { id: 'none', zh: '无发饰', en: 'no accessory', ja: 'なし' },
    { id: 'headband', zh: '发箍', en: 'headband', ja: 'カチューシャ' },
    { id: 'bow', zh: '蝴蝶结', en: 'bow', ja: 'リボン' },
    { id: 'clip', zh: '发夹', en: 'hair clip', ja: 'ヘアピン' },
    { id: 'ribbon', zh: '发带', en: 'ribbon band', ja: 'リボンバンド' },
    { id: 'flower', zh: '花饰', en: 'flower', ja: '花飾り' },
    { id: 'satin', zh: '缎带', en: 'satin ribbon', ja: 'サテンリボン' },
    { id: 'bunny', zh: '兔耳', en: 'bunny ears', ja: 'うさ耳' },
    { id: 'neko', zh: '猫耳', en: 'cat ears', ja: '猫耳' },
    { id: 'bandana', zh: '头巾', en: 'bandana', ja: 'バンダナ' },
    { id: 'crown', zh: '小皇冠', en: 'tiara', ja: 'ティアラ' },
    { id: 'star', zh: '星星夹', en: 'star clip', ja: 'スターピン' },
    { id: 'pearl', zh: '珍珠发卡', en: 'pearl pin', ja: 'パールピン' },
    { id: 'knot', zh: '丝带结', en: 'ribbon knot', ja: 'リボン結び' },
    { id: 'tie', zh: '发绳', en: 'hair tie', ja: 'ヘアゴム' },
    { id: 'feather', zh: '羽毛', en: 'feather', ja: '羽飾り' }
  ];

  var EYES = [
    { id: 'round', zh: '圆眼', en: 'round eyes', ja: '丸目', w: 14.5, h: 12.5, tilt: 0, star: 0 },
    { id: 'almond', zh: '杏眼', en: 'almond eyes', ja: 'アーモンド', w: 15.5, h: 9.5, tilt: 1, star: 0 },
    { id: 'upturned', zh: '上挑眼', en: 'upturned eyes', ja: 'つり目', w: 14.5, h: 10, tilt: 3.2, star: 0 },
    { id: 'downturned', zh: '下垂眼', en: 'downturned eyes', ja: 'たれ目', w: 14.5, h: 10, tilt: -2.8, star: 0 },
    { id: 'half', zh: '半眯眼', en: 'half closed eyes', ja: 'ジト目', w: 14, h: 5.6, tilt: 0.6, star: 0 },
    { id: 'cat', zh: '猫眼', en: 'cat eyes', ja: 'キャットアイ', w: 15, h: 9, tilt: 4.2, star: 0 },
    { id: 'big', zh: '大眼', en: 'big eyes', ja: '大きな瞳', w: 16.5, h: 13.5, tilt: 0.6, star: 0 },
    { id: 'narrow', zh: '细长眼', en: 'narrow eyes', ja: '細目', w: 15, h: 6.6, tilt: 1.4, star: 0 },
    { id: 'star', zh: '星眼', en: 'starry eyes', ja: 'スターアイ', w: 15.5, h: 11.5, tilt: 0.8, star: 1 }
  ];

  /* ===================== 3. 颜色派生 ===================== */
  function hex2rgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    }).join('');
  }
  function shade(hex, k) {
    var c = hex2rgb(hex);
    return rgb2hex(c[0] * k, c[1] * k, c[2] * k);
  }
  function tint(hex, k) {
    var c = hex2rgb(hex);
    return rgb2hex(c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k);
  }

  /* ===================== 4. 条目装配 ===================== */
  var BASE = {
    hair: 0,            // 发型索引
    hairColor: 3,       // 栗棕
    bang: 'straight',
    acc: 'none',
    eye: 'almond',
    eyeColor: 0
  };

  var ALL = [];
  (function build() {
    var i;
    for (i = 0; i < HAIRS.length; i++) {
      ALL.push({
        kind: 'hair', idx: i, zh: HAIRS[i].zh, en: HAIRS[i].en, ja: HAIRS[i].ja,
        hair: i, tag: '发型'
      });
    }
    for (i = 0; i < BANGS.length; i++) {
      ALL.push({
        kind: 'bang', idx: i, zh: BANGS[i].zh, en: BANGS[i].en, ja: BANGS[i].ja,
        bang: BANGS[i].id, tag: '刘海'
      });
    }
    for (i = 0; i < HAIR_COLORS.length; i++) {
      ALL.push({
        kind: 'haircolor', idx: i, zh: HAIR_COLORS[i].zh, en: HAIR_COLORS[i].en + ' hair',
        ja: HAIR_COLORS[i].ja, hairColor: i, tag: '发色'
      });
    }
    for (i = 0; i < ACCS.length; i++) {
      ALL.push({
        kind: 'acc', idx: i, zh: ACCS[i].zh, en: ACCS[i].en, ja: ACCS[i].ja,
        acc: ACCS[i].id, tag: '发饰'
      });
    }
    for (i = 0; i < EYE_COLORS.length; i++) {
      ALL.push({
        kind: 'eyecolor', idx: i, zh: EYE_COLORS[i].zh, en: EYE_COLORS[i].en + ' eyes',
        ja: EYE_COLORS[i].zh, eyeColor: i, tag: '眼睛颜色'
      });
    }
    for (i = 0; i < EYES.length; i++) {
      ALL.push({
        kind: 'eyeshape', idx: i, zh: EYES[i].zh, en: EYES[i].en, ja: EYES[i].ja,
        eye: EYES[i].id, tag: '眼睛形状'
      });
    }
    ALL.forEach(function (p, i) {
      p.id = 'H' + pad(i + 1);
      // 每个条目给 5 个常用发色，作为卡片底部色点
      p.swatches = swatchesFor(i);
    });
  })();

  function swatchesFor(seed) {
    var pool = [3, 0, 7, 11, 19, 14, 9, 15, 5, 13];   // 栗棕/黑/金/粉/紫/红/银/酒红/浅棕/樱粉
    var out = [], k = (seed * 3) % pool.length;
    for (var i = 0; i < 5; i++) {
      out.push(pool[(k + i * 2) % pool.length]);
    }
    return out;
  }

  /* ===================== 5. 渲染 ===================== */
  var uidSeq = 0;

  function hairColorOf(p, override) {
    var i = override == null ? (p.hairColor == null ? BASE.hairColor : p.hairColor) : override;
    return HAIR_COLORS[i] || HAIR_COLORS[0];
  }
  function eyeColorOf(p, override) {
    var i = override == null ? (p.eyeColor == null ? BASE.eyeColor : p.eyeColor) : override;
    return EYE_COLORS[i] || EYE_COLORS[0];
  }
  function hairDefOf(p) { return HAIRS[p.hair == null ? BASE.hair : p.hair] || HAIRS[0]; }
  function eyeDefOf(p) {
    var id = p.eye || BASE.eye;
    for (var i = 0; i < EYES.length; i++) { if (EYES[i].id === id) { return EYES[i]; } }
    return EYES[1];
  }

  // 脸：下半收成尖下巴
  function facePath() {
    var cx = F.cx, cy = F.cy, rx = F.rx, ry = F.ry;
    return 'M' + f(cx - rx) + ' ' + f(cy - ry * 0.28) +
      'C' + f(cx - rx) + ' ' + f(cy - ry * 1.02) + ' ' + f(cx + rx) + ' ' + f(cy - ry * 1.02) + ' ' + f(cx + rx) + ' ' + f(cy - ry * 0.28) +
      'C' + f(cx + rx) + ' ' + f(cy + ry * 0.3) + ' ' + f(cx + rx * 0.74) + ' ' + f(cy + ry * 0.74) + ' ' + f(cx + rx * 0.3) + ' ' + f(cy + ry * 0.96) +
      'C' + f(cx + rx * 0.15) + ' ' + f(cy + ry * 1.03) + ' ' + f(cx - rx * 0.15) + ' ' + f(cy + ry * 1.03) + ' ' + f(cx - rx * 0.3) + ' ' + f(cy + ry * 0.96) +
      'C' + f(cx - rx * 0.74) + ' ' + f(cy + ry * 0.74) + ' ' + f(cx - rx) + ' ' + f(cy + ry * 0.3) + ' ' + f(cx - rx) + ' ' + f(cy - ry * 0.28) + 'Z';
  }

  // 后发底板：贴着头形落下，发梢自然外撇（宽了就是披风，这是第一版翻车的地方）
  function backMass(h, w) {
    var L = h.L || 1, Wd = (h.Wd || 1) * w;
    var eq = TOP + 6;
    var end = BOT - 8 + 58 * L;              // 发梢 y（L=0.28 到下巴，L=1.85 到腰）
    var side = 5 * Wd;                       // 耳侧外扩
    var flare = (10 + 10 * Math.min(L, 1.4)) * Wd;   // 发梢外撇
    return 'M' + f(LX - side) + ' ' + f(eq) +
      'C' + f(LX - side - 2) + ' ' + f(TOP + 34) + ' ' + f(LX - side - flare) + ' ' + f(end - 22) + ' ' + f(LX - side - flare) + ' ' + f(end) +
      'Q' + f(F.cx - 13) + ' ' + f(end + 6) + ' ' + f(F.cx) + ' ' + f(end + 6) +
      'Q' + f(F.cx + 13) + ' ' + f(end + 6) + ' ' + f(RX + side + flare) + ' ' + f(end) +
      'C' + f(RX + side + flare) + ' ' + f(end - 22) + ' ' + f(RX + side + 2) + ' ' + f(TOP + 34) + ' ' + f(RX + side) + ' ' + f(eq) +
      'C' + f(RX + side - 3) + ' ' + f(TOP - 16) + ' ' + f(F.cx + 24) + ' ' + f(TOP - 26) + ' ' + f(F.cx) + ' ' + f(TOP - 26) +
      'C' + f(F.cx - 24) + ' ' + f(TOP - 26) + ' ' + f(LX - side + 3) + ' ' + f(TOP - 16) + ' ' + f(LX - side) + ' ' + f(eq) + 'Z';
  }

  // 波浪后发：边缘改成连续 S 形
  function backWave(h, w) {
    var L = h.L || 1, C = h.C == null ? 0.6 : h.C, Wd = (h.Wd || 1) * w;
    var end = BOT - 8 + 58 * L;
    var out = (F.rx + 1) * Wd;
    var amp = 5 * C;
    var d = 'M' + f(LX - out) + ' ' + f(TOP + 4) +
      'C' + f(LX - out - 7) + ' ' + f(TOP + 30) + ' ' + f(LX - out + amp) + ' ' + f(TOP + 52) + ' ' + f(LX - out - amp * 0.6) + ' ' + f(TOP + 78);
    var steps = 3, y0 = TOP + 78, y1 = end;
    for (var i = 1; i <= steps; i++) {
      var ya = y0 + (y1 - y0) * (i - 1) / steps, yb = y0 + (y1 - y0) * i / steps;
      var s = i % 2 ? 1 : -1;
      d += 'C' + f(LX - out - amp * s) + ' ' + f((ya + yb) / 2) + ' ' + f(LX - out + amp * s) + ' ' + f((ya + yb) / 2) + ' ' +
        f(LX - out * 0.72) + ' ' + f(yb);
    }
    d += 'Q' + f(F.cx) + ' ' + f(end + 10) + ' ' + f(RX + out * 0.72) + ' ' + f(end) +
      'C' + f(RX + out - amp) + ' ' + f((y0 + y1) / 2) + ' ' + f(RX + out + amp) + ' ' + f((y0 + y1) / 2) + ' ' + f(RX + out + 6) + ' ' + f(TOP + 34) +
      'C' + f(RX + 24) + ' ' + f(TOP - 15) + ' ' + f(F.cx - 24) + ' ' + f(TOP - 15) + ' ' + f(LX - out) + ' ' + f(TOP + 4) + 'Z';
    return d;
  }

  // 卷发：用一串圆弧做发团
  function backCurly(h, w) {
    var L = h.L || 1, Wd = (h.Wd || 1) * w;
    var end = BOT - 8 + 58 * L;
    var out = (F.rx + 1) * Wd;
    var d = 'M' + f(F.cx) + ' ' + f(TOP - 14);
    var n = 7, ya = TOP + 2, yb = end;
    for (var i = 0; i < n; i++) {   // 左半边，一串外凸的瓣
      var t0 = i / n, t1 = (i + 1) / n;
      var y0 = ya + (yb - ya) * t0, y1 = ya + (yb - ya) * t1;
      var xo = LX - out * (0.55 + 0.55 * Math.sin(Math.PI * t0));
      d += 'C' + f(xo - 7) + ' ' + f(y0) + ' ' + f(xo - 7) + ' ' + f(y1) + ' ' + f(xo + 2) + ' ' + f(y1);
    }
    d += 'Q' + f(F.cx) + ' ' + f(end + 12) + ' ' + f(RX + out * 0.5) + ' ' + f(end);
    for (var j = n - 1; j >= 0; j--) {
      var s0 = j / n, s1 = (j + 1) / n;
      var z0 = ya + (yb - ya) * s0, z1 = ya + (yb - ya) * s1;
      var xr = RX + out * (0.55 + 0.55 * Math.sin(Math.PI * s1));
      d += 'C' + f(xr + 7) + ' ' + f(z1) + ' ' + f(xr + 7) + ' ' + f(z0) + ' ' + f(xr - 2) + ' ' + f(z0);
    }
    d += 'C' + f(F.cx + 40) + ' ' + f(TOP - 22) + ' ' + f(F.cx - 40) + ' ' + f(TOP - 22) + ' ' + f(F.cx) + ' ' + f(TOP - 14) + 'Z';
    return d;
  }

  // 马尾 / 双马尾 / 丸子 / 盘发
  function tailShape(x, y, len, spread, thick) {
    return 'M' + f(x - thick) + ' ' + f(y) +
      'C' + f(x - thick - spread) + ' ' + f(y + len * 0.42) + ' ' + f(x - spread * 0.5 - thick * 0.6) + ' ' + f(y + len * 0.8) + ' ' + f(x + spread * 0.15) + ' ' + f(y + len) +
      'C' + f(x + spread * 0.9) + ' ' + f(y + len * 0.82) + ' ' + f(x + thick + spread * 0.2) + ' ' + f(y + len * 0.4) + ' ' + f(x + thick) + ' ' + f(y) + 'Z';
  }
  function bunShape(cx, cy, r) {
    return 'M' + f(cx - r) + ' ' + f(cy) +
      'C' + f(cx - r) + ' ' + f(cy - r * 1.3) + ' ' + f(cx + r) + ' ' + f(cy - r * 1.3) + ' ' + f(cx + r) + ' ' + f(cy) +
      'C' + f(cx + r) + ' ' + f(cy + r * 1.25) + ' ' + f(cx - r) + ' ' + f(cy + r * 1.25) + ' ' + f(cx - r) + ' ' + f(cy) + 'Z';
  }
  function braidShape(x, y, len, wdt) {
    var d = '', segs = 7, sw = wdt;
    for (var i = 0; i < segs; i++) {
      var yy = y + len * i / segs;
      var ww = sw * (1 - i / segs * 0.45);
      var off = (i % 2 ? 1 : -1) * ww * 0.5;
      d += 'M' + f(x - ww + off) + ' ' + f(yy) +
        'C' + f(x - ww) + ' ' + f(yy + len / segs * 0.7) + ' ' + f(x + ww) + ' ' + f(yy + len / segs * 0.3) + ' ' + f(x + ww + off) + ' ' + f(yy + len / segs) +
        'C' + f(x + ww * 0.4) + ' ' + f(yy + len / segs * 0.8) + ' ' + f(x - ww * 0.4) + ' ' + f(yy + len / segs * 0.8) + ' ' + f(x - ww + off) + ' ' + f(yy) + 'Z';
    }
    return d;
  }

  // 刘海：下缘压到眉毛上方，上缘收进头顶，两侧贴到鬓角
  function bangPath(id, part) {
    var eq = TOP + 4;                 // 发际线 72
    var brow = F.cy - 15;             // 眉毛 93
    var low = brow - 1;               // 刘海下缘 92（压在眉毛上方，不遮眼）
    var capTop = eq - 22;             // 上缘（跟后发顶几乎齐平，接缝才不显）
    if (id === 'none') {
      return 'M' + f(LX + 4) + ' ' + f(eq + 4) + 'Q' + f(F.cx) + ' ' + f(eq - 5) + ' ' + f(RX - 4) + ' ' + f(eq + 4) +
        'Q' + f(F.cx) + ' ' + f(eq + 13) + ' ' + f(LX + 4) + ' ' + f(eq + 4) + 'Z';
    }
    if (id === 'center') {
      return 'M' + f(F.cx - 1) + ' ' + f(capTop) +
        'C' + f(LX + 4) + ' ' + f(eq - 4) + ' ' + f(LX + 5) + ' ' + f(low) + ' ' + f(LX + 9) + ' ' + f(low + 4) +
        'C' + f(LX + 18) + ' ' + f(low - 2) + ' ' + f(F.cx - 8) + ' ' + f(eq + 6) + ' ' + f(F.cx - 2) + ' ' + f(eq - 2) + 'Z' +
        'M' + f(F.cx + 1) + ' ' + f(capTop) +
        'C' + f(RX - 4) + ' ' + f(eq - 4) + ' ' + f(RX - 5) + ' ' + f(low) + ' ' + f(RX - 9) + ' ' + f(low + 4) +
        'C' + f(RX - 18) + ' ' + f(low - 2) + ' ' + f(F.cx + 8) + ' ' + f(eq + 6) + ' ' + f(F.cx + 2) + ' ' + f(eq - 2) + 'Z';
    }
    if (id === 'side' || id === 'longside') {
      var deep = id === 'longside' ? 16 : 8;
      return 'M' + f(LX - 1) + ' ' + f(eq) +
        'C' + f(LX + 2) + ' ' + f(low + deep) + ' ' + f(F.cx + 4) + ' ' + f(low + deep * 0.6) + ' ' + f(F.cx + 16) + ' ' + f(low - 2) +
        'C' + f(F.cx + 26) + ' ' + f(eq + 6) + ' ' + f(RX - 2) + ' ' + f(eq) + ' ' + f(RX) + ' ' + f(eq - 3) +
        'C' + f(RX - 10) + ' ' + f(capTop) + ' ' + f(LX + 10) + ' ' + f(capTop) + ' ' + f(LX - 1) + ' ' + f(eq) + 'Z';
    }
    if (id === 'airy' || id === 'choppy') {
      var n = id === 'choppy' ? 7 : 5;
      var d0 = 'M' + f(LX) + ' ' + f(eq + 1);
      for (var i = 0; i < n; i++) {
        var xb = LX + (RX - LX) * (i + 1) / n;
        var tip = low - (i % 2 ? 0 : 7);
        d0 += 'C' + f(xb - (RX - LX) / n * 0.6) + ' ' + f(tip + 6) + ' ' + f(xb - 3) + ' ' + f(tip + 2) + ' ' + f(xb) + ' ' + f(tip);
      }
      d0 += 'C' + f(RX + 1) + ' ' + f(eq) + ' ' + f(F.cx + 22) + ' ' + f(capTop) + ' ' + f(F.cx) + ' ' + f(capTop) +
        'C' + f(F.cx - 22) + ' ' + f(capTop) + ' ' + f(LX - 2) + ' ' + f(eq - 2) + ' ' + f(LX) + ' ' + f(eq + 1) + 'Z';
      return d0;
    }
    if (id === 'double') {
      return 'M' + f(LX) + ' ' + f(eq) + 'C' + f(LX + 2) + ' ' + f(low + 3) + ' ' + f(RX - 2) + ' ' + f(low + 3) + ' ' + f(RX) + ' ' + f(eq) +
        'C' + f(RX - 10) + ' ' + f(capTop) + ' ' + f(LX + 10) + ' ' + f(capTop) + ' ' + f(LX) + ' ' + f(eq) + 'Z' +
        'M' + f(LX + 6) + ' ' + f(eq + 6) + 'C' + f(LX + 10) + ' ' + f(low - 2) + ' ' + f(F.cx + 4) + ' ' + f(low) + ' ' + f(F.cx + 1) + ' ' + f(eq + 2) +
        'C' + f(F.cx - 12) + ' ' + f(eq + 6) + ' ' + f(LX + 8) + ' ' + f(eq + 8) + ' ' + f(LX + 6) + ' ' + f(eq + 6) + 'Z';
    }
    if (id === 'heart') {
      return 'M' + f(F.cx) + ' ' + f(capTop - 3) +
        'C' + f(LX + 2) + ' ' + f(eq - 2) + ' ' + f(LX + 6) + ' ' + f(low + 4) + ' ' + f(F.cx - 12) + ' ' + f(low - 2) +
        'C' + f(F.cx - 6) + ' ' + f(low - 9) + ' ' + f(F.cx - 1) + ' ' + f(low - 1) + ' ' + f(F.cx) + ' ' + f(low + 4) +
        'C' + f(F.cx + 1) + ' ' + f(low - 1) + ' ' + f(F.cx + 6) + ' ' + f(low - 9) + ' ' + f(F.cx + 12) + ' ' + f(low - 2) +
        'C' + f(RX - 6) + ' ' + f(low + 4) + ' ' + f(RX - 2) + ' ' + f(eq - 2) + ' ' + f(F.cx) + ' ' + f(capTop - 3) + 'Z';
    }
    if (id === 'catear') {
      return 'M' + f(F.cx - 28) + ' ' + f(eq - 4) +
        'C' + f(F.cx - 24) + ' ' + f(low - 2) + ' ' + f(F.cx - 14) + ' ' + f(low - 4) + ' ' + f(F.cx - 10) + ' ' + f(eq + 1) +
        'C' + f(F.cx - 7) + ' ' + f(low - 6) + ' ' + f(F.cx - 2) + ' ' + f(low - 4) + ' ' + f(F.cx) + ' ' + f(eq + 2) +
        'C' + f(F.cx + 2) + ' ' + f(low - 4) + ' ' + f(F.cx + 7) + ' ' + f(low - 6) + ' ' + f(F.cx + 10) + ' ' + f(eq + 1) +
        'C' + f(F.cx + 14) + ' ' + f(low - 4) + ' ' + f(F.cx + 24) + ' ' + f(low - 2) + ' ' + f(F.cx + 28) + ' ' + f(eq - 4) +
        'C' + f(F.cx + 18) + ' ' + f(capTop) + ' ' + f(F.cx - 18) + ' ' + f(capTop) + ' ' + f(F.cx - 28) + ' ' + f(eq - 4) + 'Z';
    }
    if (id === 'curtain') {
      return 'M' + f(F.cx) + ' ' + f(capTop - 2) +
        'C' + f(F.cx - 18) + ' ' + f(eq) + ' ' + f(F.cx - 24) + ' ' + f(low) + ' ' + f(LX + 1) + ' ' + f(low + 8) +
        'C' + f(LX - 1) + ' ' + f(eq + 6) + ' ' + f(F.cx - 12) + ' ' + f(eq + 2) + ' ' + f(F.cx - 4) + ' ' + f(capTop + 2) + 'Z' +
        'M' + f(F.cx) + ' ' + f(capTop - 2) +
        'C' + f(F.cx + 18) + ' ' + f(eq) + ' ' + f(F.cx + 24) + ' ' + f(low) + ' ' + f(RX - 1) + ' ' + f(low + 8) +
        'C' + f(RX + 1) + ' ' + f(eq + 6) + ' ' + f(F.cx + 12) + ' ' + f(eq + 2) + ' ' + f(F.cx + 4) + ' ' + f(capTop + 2) + 'Z';
    }
    if (id === 'swept') {
      return 'M' + f(LX) + ' ' + f(eq + 2) +
        'C' + f(LX + 6) + ' ' + f(low + 2) + ' ' + f(F.cx + 12) + ' ' + f(low) + ' ' + f(RX) + ' ' + f(low - 9) +
        'C' + f(RX - 1) + ' ' + f(eq + 2) + ' ' + f(RX - 8) + ' ' + f(eq - 2) + ' ' + f(RX - 14) + ' ' + f(eq + 4) +
        'C' + f(F.cx) + ' ' + f(eq) + ' ' + f(LX + 12) + ' ' + f(eq - 4) + ' ' + f(LX) + ' ' + f(eq + 2) + 'Z';
    }
    // straight：一整片月牙，下缘平齐压到眉毛
    return 'M' + f(LX) + ' ' + f(eq + 2) +
      'C' + f(LX + 2) + ' ' + f(low + 2) + ' ' + f(LX + 14) + ' ' + f(low + 3) + ' ' + f(F.cx - 6) + ' ' + f(low + 3) +
      'C' + f(F.cx + 14) + ' ' + f(low + 3) + ' ' + f(RX - 2) + ' ' + f(low + 2) + ' ' + f(RX) + ' ' + f(eq + 2) +
      'C' + f(RX - 10) + ' ' + f(capTop) + ' ' + f(LX + 10) + ' ' + f(capTop) + ' ' + f(LX) + ' ' + f(eq + 2) + 'Z';
  }

  // 侧发（贴脸两缕）
  function sideLock(sign, h) {
    var xi = F.cx + sign * (F.rx - 1);      // 内缘：贴着脸的边缘
    var xo = xi + sign * 7;                  // 外缘
    var L2 = h.L || 1;
    var yb = F.cy + 16 + 26 * Math.min(L2, 1.25);
    return 'M' + f(xi - sign * 1) + ' ' + f(TOP + 4) +
      'C' + f(xo + sign * 2) + ' ' + f(F.cy - 16) + ' ' + f(xo + sign * 1) + ' ' + f(yb - 10) + ' ' + f(xo) + ' ' + f(yb + 6) +
      'C' + f(xi + sign * 2.5) + ' ' + f(yb + 2) + ' ' + f(xi) + ' ' + f(F.cy + 12) + ' ' + f(xi - sign * 1) + ' ' + f(TOP + 4) + 'Z';
  }

  // 发饰
  function accMarkup(id, hair, ink, fill) {
    var bx = F.cx + 30, by = TOP + 12;      // 右侧头部上方
    if (id === 'none' || !id) { return ''; }
    if (id === 'headband') {
      return '<path d="M' + f(LX - 5) + ' ' + f(TOP + 16) + 'Q' + f(F.cx) + ' ' + f(TOP - 20) + ' ' + f(RX + 5) + ' ' + f(TOP + 16) +
        '" fill="none" stroke="' + ink + '" stroke-width="4.6" stroke-linecap="round"/>' +
        '<path d="M' + f(LX - 5) + ' ' + f(TOP + 16) + 'Q' + f(F.cx) + ' ' + f(TOP - 20) + ' ' + f(RX + 5) + ' ' + f(TOP + 16) +
        '" fill="none" stroke="' + fill + '" stroke-width="2.4" stroke-linecap="round"/>';
    }
    if (id === 'bow' || id === 'satin' || id === 'knot' || id === 'ribbon') {
      var big = id === 'satin' ? 1.25 : 1;
      return '<g transform="translate(' + f(bx) + ',' + f(by) + ') scale(' + big + ')">' +
        '<path d="M0 0C-9 -8 -18 -5 -15 2C-13 8 -5 6 0 0Z" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.4"/>' +
        '<path d="M0 0C9 -8 18 -5 15 2C13 8 5 6 0 0Z" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.4"/>' +
        '<circle cx="0" cy="1" r="3" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.2"/></g>';
    }
    if (id === 'clip' || id === 'star' || id === 'pearl') {
      if (id === 'star') {
        return '<path d="M' + f(bx) + ' ' + f(by - 8) + 'l2.4 5 5.4.6-4 3.8 1.1 5.4-4.9-2.8-4.9 2.8 1.1-5.4-4-3.8 5.4-.6Z" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.2"/>';
      }
      if (id === 'pearl') {
        return '<g fill="' + fill + '" stroke="' + ink + '" stroke-width="1">' +
          '<circle cx="' + f(bx) + '" cy="' + f(by) + '" r="3.2"/><circle cx="' + f(bx + 8) + '" cy="' + f(by + 3) + '" r="2.6"/>' +
          '<circle cx="' + f(bx + 15) + '" cy="' + f(by + 7) + '" r="2"/></g>';
      }
      return '<rect x="' + f(bx - 8) + '" y="' + f(by - 2.4) + '" width="17" height="4.8" rx="2.4" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.2"/>';
    }
    if (id === 'flower') {
      return '<g transform="translate(' + f(bx) + ',' + f(by) + ')">' +
        [0, 72, 144, 216, 288].map(function (a) {
          return '<ellipse cx="0" cy="-6" rx="4.4" ry="6.2" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.1" transform="rotate(' + a + ')"/>';
        }).join('') +
        '<circle cx="0" cy="0" r="3" fill="' + ink + '" opacity=".5"/></g>';
    }
    if (id === 'bunny' || id === 'neko') {
      var tall = id === 'bunny' ? 1 : 0.62;
      return '<g transform="translate(' + f(F.cx) + ',' + f(TOP - 2) + ')">' +
        '<path d="M-16 2C-20 -14 -14 -26 -8 -26C-2 -26 -2 -14 -6 2Z" fill="' + hair + '" stroke="' + ink + '" stroke-width="1.6" transform="scale(1,' + tall + ')"/>' +
        '<path d="M16 2C20 -14 14 -26 8 -26C2 -26 2 -14 6 2Z" fill="' + hair + '" stroke="' + ink + '" stroke-width="1.6" transform="scale(1,' + tall + ')"/>' +
        '<path d="M-13 0C-16 -10 -12 -19 -8 -19C-4 -19 -5 -10 -8 0Z" fill="' + tint(ink, 0.62) + '" opacity=".55"/>' +
        '<path d="M13 0C16 -10 12 -19 8 -19C4 -19 5 -10 8 0Z" fill="' + tint(ink, 0.62) + '" opacity=".55"/></g>';
    }
    if (id === 'bandana') {
      return '<path d="M' + f(LX - 4) + ' ' + f(TOP + 20) + 'Q' + f(F.cx) + ' ' + f(TOP - 14) + ' ' + f(RX + 4) + ' ' + f(TOP + 20) +
        'L' + f(RX + 4) + ' ' + f(TOP + 26) + 'Q' + f(F.cx) + ' ' + f(TOP - 2) + ' ' + f(LX - 4) + ' ' + f(TOP + 26) + 'Z"' +
        ' fill="' + fill + '" stroke="' + ink + '" stroke-width="1.3"/>';
    }
    if (id === 'crown') {
      return '<path d="M' + f(F.cx - 16) + ' ' + f(TOP - 10) + 'l4 -12 6 8 6 -12 6 12 6 -8 4 12Z" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.3" stroke-linejoin="round"/>';
    }
    if (id === 'tie') {
      return '<ellipse cx="' + f(F.cx + 34) + '" cy="' + f(F.cy + 6) + '" rx="4.5" ry="6" fill="' + fill + '" stroke="' + ink + '" stroke-width="1.2"/>';
    }
    if (id === 'feather') {
      return '<path d="M' + f(bx) + ' ' + f(by + 14) + 'C' + f(bx + 4) + ' ' + f(by) + ' ' + f(bx + 12) + ' ' + f(by - 10) + ' ' + f(bx + 16) + ' ' + f(by - 18) +
        'C' + f(bx + 12) + ' ' + f(by - 6) + ' ' + f(bx + 8) + ' ' + f(by + 6) + ' ' + f(bx) + ' ' + f(by + 14) + 'Z"' +
        ' fill="' + fill + '" stroke="' + ink + '" stroke-width="1.1"/>';
    }
    return '';
  }

  // 眼睛
  function eyeMarkup(cx, cy, e, irisBase, ink, mode, uid, sign) {
    var w = e.w, h = e.h, tilt = e.tilt || 0;
    var l = cx - w / 2, r = cx + w / 2;
    var lidUp = cy - h * 1.05;
    var shape = 'M' + f(l) + ' ' + f(cy + 1) +
      'C' + f(l + w * 0.16) + ' ' + f(lidUp) + ' ' + f(r - w * 0.2) + ' ' + f(lidUp + tilt * 0.4) + ' ' + f(r) + ' ' + f(cy - h * 0.12 - tilt) +
      'C' + f(r - w * 0.16) + ' ' + f(cy + h * 0.72) + ' ' + f(l + w * 0.18) + ' ' + f(cy + h * 0.68) + ' ' + f(l) + ' ' + f(cy + 1) + 'Z';
    var clip = 'ce' + uid;
    var irisR = Math.min(w * 0.42, h * 0.78);
    var g = '<defs><clipPath id="' + clip + '"><path d="' + shape + '"/></clipPath>' +
      '<radialGradient id="ig' + uid + '" cx="0.5" cy="0.32" r="0.72">' +
      '<stop offset="0" stop-color="' + tint(irisBase, 0.42) + '"/>' +
      '<stop offset="0.55" stop-color="' + irisBase + '"/>' +
      '<stop offset="1" stop-color="' + shade(irisBase, 0.52) + '"/></radialGradient></defs>';
    var inner = '<g clip-path="url(#' + clip + ')">' +
      '<rect x="' + f(l - 2) + '" y="' + f(lidUp - 4) + '" width="' + f(w + 4) + '" height="' + f(h * 2.4) + '" fill="' + (mode === 'line' ? '#fbf5e8' : '#fdfbf6') + '"/>' +
      '<ellipse cx="' + f(cx) + '" cy="' + f(cy - 1) + '" rx="' + f(irisR) + '" ry="' + f(irisR * 1.12) + '" fill="url(#ig' + uid + ')"/>' +
      '<ellipse cx="' + f(cx) + '" cy="' + f(cy - 1) + '" rx="' + f(irisR * 0.44) + '" ry="' + f(irisR * 0.6) + '" fill="' + shade(irisBase, 0.28) + '"/>' +
      '<circle cx="' + f(cx - irisR * 0.34) + '" cy="' + f(cy - irisR * 0.62) + '" r="' + f(irisR * 0.3) + '" fill="#fff" opacity=".95"/>' +
      '<circle cx="' + f(cx + irisR * 0.36) + '" cy="' + f(cy + irisR * 0.36) + '" r="' + f(irisR * 0.15) + '" fill="#fff" opacity=".8"/>' +
      (e.star ? '<path d="M' + f(cx + 1) + ' ' + f(cy - irisR * 0.9) + 'l1.5 3 3.2.4-2.4 2.2.7 3.2-3-1.7-3 1.7.7-3.2-2.3-2.2 3.2-.4Z" fill="#fff" opacity=".85"/>' : '') +
      '</g>';
    // 上睫毛加粗、下睑细线、外眼角挑起
    var lash = 'M' + f(l) + ' ' + f(cy + 1) +
      'C' + f(l + w * 0.16) + ' ' + f(lidUp) + ' ' + f(r - w * 0.2) + ' ' + f(lidUp + tilt * 0.4) + ' ' + f(r) + ' ' + f(cy - h * 0.12 - tilt);
    var wing = 'M' + f(r) + ' ' + f(cy - h * 0.12 - tilt) + 'l' + f(sign * 3.4) + ' ' + f(-1.6 - h * 0.08);
    var lower = 'M' + f(l + w * 0.14) + ' ' + f(cy + h * 0.5) + 'C' + f(l + w * 0.34) + ' ' + f(cy + h * 0.86) + ' ' + f(r - w * 0.3) + ' ' + f(cy + h * 0.82) + ' ' + f(r - w * 0.06) + ' ' + f(cy + h * 0.36);
    return g + inner +
      '<path d="' + lash + '" fill="none" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="' + wing + '" fill="none" stroke="' + ink + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="' + lower + '" fill="none" stroke="' + ink + '" stroke-width="1" opacity=".45"/>';
  }

  /* ---------- 主渲染 ---------- */
  function drawChar(p, opts) {
    opts = opts || {};
    var mode = opts.mode === 'line' ? 'line' : 'color';
    var uid = (++uidSeq).toString(36);
    var hc = hairColorOf(p, opts.hairColor);
    var ec = eyeColorOf(p, opts.eyeColor);
    var hd = hairDefOf(p);
    var ed = eyeDefOf(p);
    var bangId = p.bang || hd.bang || BASE.bang;
    var accId = p.acc || BASE.acc;

    var ink = mode === 'line' ? '#6f6156' : shade(hc.base, 0.42);
    var skin = mode === 'line' ? '#fdf8ee' : '#fdf2ea';
    var skinInk = mode === 'line' ? '#b9a68e' : '#d8b49c';
    var hairA = mode === 'line' ? '#f6efe0' : tint(hc.base, 0.34);
    var hairB = mode === 'line' ? '#efe6d4' : hc.base;
    var hairC = mode === 'line' ? '#e5d9c3' : shade(hc.base, 0.66);
    var clothFill = mode === 'line' ? '#fbf6ea' : '#f2f6fb';
    var clothInk = mode === 'line' ? '#b9a68e' : '#9fb0c2';
    var silk = mode === 'line' ? '#f3ead9' : tint(hc.base, 0.3);
    var hair2 = mode === 'line' ? '#eadfc9' : shade(hc.base, 0.86);

    var gid = 'ch' + uid;
    // 前发（刘海+侧发）单独一档渐变：比后发亮一点，边缘才有前后层次
    var frontA = mode === 'line' ? '#f8f2e5' : tint(hc.base, 0.5);
    var frontB = mode === 'line' ? '#ece2cd' : tint(hc.base, 0.18);
    var frontC = mode === 'line' ? '#ded1b8' : shade(hc.base, 0.8);
    var defs = '<defs><linearGradient id="hg' + gid + '" x1="150" y1="46" x2="150" y2="248" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="' + hairA + '"/><stop offset="0.4" stop-color="' + hairB + '"/><stop offset="1" stop-color="' + hairC + '"/></linearGradient>' +
      '<linearGradient id="fg' + gid + '" x1="150" y1="50" x2="150" y2="168" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="' + frontA + '"/><stop offset="0.5" stop-color="' + frontB + '"/>' +
      '<stop offset="1" stop-color="' + frontC + '"/></linearGradient></defs>';

    /* 1. 后发结构 */
    var back = '';
    var tp = hd.topo;
    if (tp === 'wavy') { back = backWave(hd, 1); }
    else if (tp === 'curly') { back = backCurly(hd, 1); }
    else if (tp === 'bob') { back = backMass({ L: hd.L, Wd: hd.Wd * 1.06 }, 1); }
    else if (tp === 'pixie') { back = backMass({ L: hd.L, Wd: hd.Wd * 0.94 }, 1); }
    else if (tp === 'hime') { back = backMass({ L: hd.L, Wd: hd.Wd }, 1); }
    else if (tp === 'wolf') { back = backMass({ L: hd.L, Wd: hd.Wd * 1.12 }, 1); }
    else if (tp === 'asym') { back = backMass({ L: hd.L * 1.05, Wd: hd.Wd }, 1); }
    else { back = backMass(hd, 1); }

    var backLayer = '<path d="' + back + '" fill="url(#hg' + gid + ')" stroke="' + ink + '" stroke-width="1.6" stroke-linejoin="round"/>';

    // 马尾 / 双马尾
    if (tp === 'ponytail') {
      var th = hd.TH == null ? 0.5 : hd.TH;
      var ty = TOP + 16 + (1 - th) * 44;
      var sideX = hd.TS ? F.cx + 54 : F.cx + 40;
      backLayer += '<path d="' + tailShape(sideX, ty, 58 + 46 * (hd.L || 1), 15, 9) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.7"/>';
      if (hd.TS) {
        backLayer += '<path d="' + tailShape(F.cx - 40, ty, 58 + 46 * (hd.L || 1), -15, 9) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.7"/>';
      }
    }
    if (tp === 'twin') {
      var th2 = hd.TH == null ? 0.55 : hd.TH;
      var ty2 = TOP + 20 + (1 - th2) * 40;
      [-1, 1].forEach(function (s) {
        backLayer += '<path d="' + tailShape(F.cx + s * 54, ty2, 52 + 52 * (hd.L || 1), s * 18, 9) +
          '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.7"/>';
      });
    }
    if (tp === 'bun') {
      var th3 = hd.TH == null ? 0.85 : hd.TH;
      var by3 = TOP - 4 - th3 * 12;
      backLayer += '<path d="' + bunShape(F.cx, by3, 15) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.7"/>';
      if (hd.TS) {
        backLayer += '<path d="' + bunShape(F.cx - 30, by3 + 14, 10) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.6"/>' +
          '<path d="' + bunShape(F.cx + 30, by3 + 14, 10) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.6"/>';
      }
    }
    if (tp === 'braid') {
      var ts = hd.TS || 1;
      if (ts === 2) {
        backLayer += '<path d="' + braidShape(F.cx - 44, F.cy, 66, 7) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.6"/>' +
          '<path d="' + braidShape(F.cx + 44, F.cy, 66, 7) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.6"/>';
      } else {
        backLayer += '<path d="' + braidShape(F.cx + ts * 42, F.cy - 2, 70, 8) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.6"/>';
      }
    }
    if (tp === 'updo') {
      backLayer += '<path d="' + bunShape(F.cx, TOP + 16 + (hd.TH || 0.3) * 12, 13) + '" fill="' + hair2 + '" stroke="' + ink + '" stroke-width="1.6"/>';
      if (hd.halo) {
        backLayer += '<path d="M' + f(LX - 2) + ' ' + f(TOP + 12) + 'Q' + f(F.cx) + ' ' + f(TOP - 18) + ' ' + f(RX + 2) + ' ' + f(TOP + 12) +
          '" fill="none" stroke="' + ink + '" stroke-width="7" stroke-linecap="round" opacity=".9"/>';
      }
    }
    // 后发上的发丝线：破一下「整块布帘」的观感（用后发轮廓裁剪，绝不出界）
    var clipDefs = '';
    if (mode !== 'line') {
      var stEnd = Math.min(BOT - 8 + 58 * (hd.L || 1), 246);
      var stTop = Math.max(TOP + 16, 92);
      var strand = '';
      [-1, 1].forEach(function (s) {
        [0, 1].forEach(function (k) {
          var xa = F.cx + s * (F.rx - 2 + k * 9);
          var xb = F.cx + s * (F.rx + 3 + k * 11);
          strand += '<path d="M' + f(xa) + ' ' + f(stTop) +
            'Q' + f(xb + s * 2) + ' ' + f((stTop + stEnd) / 2) + ' ' + f(xb) + ' ' + f(stEnd) +
            '" fill="none" stroke="' + hairC + '" stroke-width="' + (k ? 1.3 : 1.9) + '" opacity="' + (k ? 0.28 : 0.4) + '" stroke-linecap="round"/>';
        });
      });
      clipDefs = '<defs><clipPath id="cb' + gid + '"><path d="' + back + '"/></clipPath></defs>';
      backLayer += '<g clip-path="url(#cb' + gid + ')">' + strand + '</g>';
    }
    // 姬发式：两侧齐切发片
    if (tp === 'hime') {
      [-1, 1].forEach(function (s) {
        backLayer += '<path d="M' + f(F.cx + s * (F.rx + 2)) + ' ' + f(TOP + 30) +
          'L' + f(F.cx + s * (F.rx + 9)) + ' ' + f(BOT - 4) +
          'L' + f(F.cx + s * (F.rx - 4)) + ' ' + f(BOT - 4) +
          'L' + f(F.cx + s * (F.rx - 2)) + ' ' + f(TOP + 30) + 'Z"' +
          ' fill="url(#hg' + gid + ')" stroke="' + ink + '" stroke-width="1.4"/>';
      });
    }

    /* 2. 颈 + 肩 + 衬衫 */
    var body = '<path d="M' + f(F.cx - 8) + ' ' + f(BOT - 14) + 'L' + f(F.cx - 9) + ' ' + f(BOT + 16) +
      'C' + f(F.cx - 24) + ' ' + f(BOT + 20) + ' ' + f(F.cx - 36) + ' ' + f(BOT + 26) + ' ' + f(F.cx - 42) + ' ' + f(BOT + 42) +
      'L' + f(F.cx - 46) + ' ' + f(H) + 'L' + f(F.cx + 46) + ' ' + f(H) +
      'L' + f(F.cx + 42) + ' ' + f(BOT + 42) +
      'C' + f(F.cx + 36) + ' ' + f(BOT + 26) + ' ' + f(F.cx + 24) + ' ' + f(BOT + 20) + ' ' + f(F.cx + 9) + ' ' + f(BOT + 16) +
      'L' + f(F.cx + 8) + ' ' + f(BOT - 14) + 'Z" fill="' + (mode === 'line' ? '#fdf8ee' : '#f7e7dc') + '" stroke="' + skinInk + '" stroke-width="1.3"/>' +
      '<path d="M' + f(F.cx - 11) + ' ' + f(BOT + 14) + 'C' + f(F.cx - 26) + ' ' + f(BOT + 18) + ' ' + f(F.cx - 48) + ' ' + f(BOT + 26) + ' ' + f(F.cx - 56) + ' ' + f(BOT + 48) +
      'L' + f(F.cx - 54) + ' ' + f(H) + 'L' + f(F.cx + 54) + ' ' + f(H) + 'L' + f(F.cx + 46) + ' ' + f(BOT + 48) +
      'C' + f(F.cx + 44) + ' ' + f(BOT + 26) + ' ' + f(F.cx + 26) + ' ' + f(BOT + 18) + ' ' + f(F.cx + 11) + ' ' + f(BOT + 14) +
      'C' + f(F.cx + 5) + ' ' + f(BOT + 30) + ' ' + f(F.cx - 5) + ' ' + f(BOT + 30) + ' ' + f(F.cx - 11) + ' ' + f(BOT + 14) + 'Z"' +
      ' fill="' + clothFill + '" stroke="' + clothInk + '" stroke-width="1.4"/>' +
      // 衬衫领
      '<path d="M' + f(F.cx - 11) + ' ' + f(BOT + 14) + 'L' + f(F.cx - 3) + ' ' + f(BOT + 36) + 'L' + f(F.cx - 18) + ' ' + f(BOT + 33) + 'Z" fill="' + clothFill + '" stroke="' + clothInk + '" stroke-width="1.2"/>' +
      '<path d="M' + f(F.cx + 11) + ' ' + f(BOT + 14) + 'L' + f(F.cx + 3) + ' ' + f(BOT + 36) + 'L' + f(F.cx + 18) + ' ' + f(BOT + 33) + 'Z" fill="' + clothFill + '" stroke="' + clothInk + '" stroke-width="1.2"/>' +
      '<path d="M' + f(F.cx - 26) + ' ' + f(BOT + 52) + 'Q' + f(F.cx - 18) + ' ' + f(BOT + 70) + ' ' + f(F.cx - 20) + ' ' + f(H) +
      'M' + f(F.cx + 26) + ' ' + f(BOT + 52) + 'Q' + f(F.cx + 18) + ' ' + f(BOT + 70) + ' ' + f(F.cx + 20) + ' ' + f(H) +
      '" fill="none" stroke="' + clothInk + '" stroke-width="1" opacity=".55"/>';

    /* 3. 脸 */
    var face = '<path d="' + facePath() + '" fill="' + skin + '" stroke="' + skinInk + '" stroke-width="1.3"/>';

    /* 4. 五官 */
    var eyeY = F.cy + 4;
    var eyes = eyeMarkup(F.cx - 17.5, eyeY, ed, ec.base, mode === 'line' ? '#6f6156' : shade(ec.base, 0.3), mode, uid + 'a', -1) +
      eyeMarkup(F.cx + 17.5, eyeY, ed, ec.base, mode === 'line' ? '#6f6156' : shade(ec.base, 0.3), mode, uid + 'b', 1);
    var brows = [-1, 1].map(function (s) {
      return '<path d="M' + f(F.cx + s * 26) + ' ' + f(eyeY - 15) + 'Q' + f(F.cx + s * 18) + ' ' + f(eyeY - 19) + ' ' + f(F.cx + s * 10) + ' ' + f(eyeY - 14) +
        '" fill="none" stroke="' + (mode === 'line' ? '#8a7a68' : shade(hc.base, 0.5)) + '" stroke-width="1.7" stroke-linecap="round"/>';
    }).join('');
    var nose = '<path d="M' + f(F.cx + 1) + ' ' + f(eyeY + 12) + 'l2.6 2.2' + '" fill="none" stroke="' + skinInk + '" stroke-width="1.3" stroke-linecap="round"/>';
    var mouth = '<path d="M' + f(F.cx - 4) + ' ' + f(eyeY + 22) + 'Q' + f(F.cx) + ' ' + f(eyeY + 26) + ' ' + f(F.cx + 4) + ' ' + f(eyeY + 22) +
      '" fill="none" stroke="' + (mode === 'line' ? '#b9a68e' : '#c98a80') + '" stroke-width="1.5" stroke-linecap="round"/>';
    var blush = mode === 'line' ? '' :
      '<ellipse cx="' + f(F.cx - 24) + '" cy="' + f(eyeY + 14) + '" rx="7" ry="3.4" fill="#f2a8a0" opacity=".32"/>' +
      '<ellipse cx="' + f(F.cx + 24) + '" cy="' + f(eyeY + 14) + '" rx="7" ry="3.4" fill="#f2a8a0" opacity=".32"/>';

    /* 5. 侧发 + 刘海 */
    var sides = sideLock(-1, hd) + sideLock(1, hd);
    var bangP = bangPath(bangId, hd.P);
    var front = '<path d="' + bangP + '" fill="url(#fg' + gid + ')" stroke="' + ink + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="' + sides + '" fill="url(#fg' + gid + ')" stroke="' + ink + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      // 发丝高光
      (mode === 'line' ? '' :
        '<path d="M' + f(F.cx - 24) + ' ' + f(TOP + 14) + 'Q' + f(F.cx - 30) + ' ' + f(TOP + 40) + ' ' + f(F.cx - 27) + ' ' + f(TOP + 62) +
        '" fill="none" stroke="' + tint(hc.base, 0.55) + '" stroke-width="2.4" opacity=".55" stroke-linecap="round"/>');

    /* 6. 发饰 */
    var acc = accMarkup(accId, 'url(#hg' + gid + ')', ink, mode === 'line' ? '#f0e6d2' : silk);

    return '<svg viewBox="' + (opts.vb || '0 0 300 300') + '" xmlns="http://www.w3.org/2000/svg" class="char-svg" role="img" preserveAspectRatio="xMidYMid slice">' +
      defs + clipDefs +
      (opts.paper ? '<rect width="300" height="300" fill="' + opts.paper + '"/>' : '') +
      backLayer + body + face + blush + brows + eyes + nose + mouth + front + acc + '</svg>';
  }

  /* ===================== 6. 导出数据 ===================== */
  function charPrompt(p, opts) {
    var hd = hairDefOf(p), ec = eyeColorOf(p, opts && opts.eyeColor), hc = hairColorOf(p, opts && opts.hairColor);
    var ed = eyeDefOf(p);
    return '1girl, upper body, ' + hd.en + ', ' + hc.en + ' hair, ' + ed.en + ', ' + ec.en + ' eyes, ' +
      'white shirt, clean lineart, plain background, anime style';
  }
  // character-card-spec-v2：SillyTavern / Pygmalion 生态通用
  function charCard(p, opts) {
    var hd = hairDefOf(p), ec = eyeColorOf(p, opts && opts.eyeColor), hc = hairColorOf(p, opts && opts.hairColor);
    var ed = eyeDefOf(p);
    var bangObj = null;
    for (var i = 0; i < BANGS.length; i++) { if (BANGS[i].id === (p.bang || BASE.bang)) { bangObj = BANGS[i]; } }
    var accObj = null;
    for (var j = 0; j < ACCS.length; j++) { if (ACCS[j].id === (p.acc || BASE.acc)) { accObj = ACCS[j]; } }
    return JSON.stringify({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: hd.en + ' / ' + ec.en + ' eyes',
        description: 'Hair: ' + hd.en + ' (' + hc.en + '). Bangs: ' + (bangObj ? bangObj.en : 'straight') +
          '. Eyes: ' + ed.en + ', ' + ec.en + '. Accessory: ' + (accObj ? accObj.en : 'none') +
          '. Outfit: white shirt. Build: slender, upper body reference.',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        creator_notes: 'Generated by think-workbench PoseAtlas Character Library (' + p.id + '). Pure vector, no third-party image assets.',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        character_book: null,
        tags: [hd.en, hc.en + ' hair', ed.en, ec.en + ' eyes', 'anime', 'lineart', 'upper body'],
        creator: 'think-workbench',
        character_version: '1.0',
        extensions: {
          poseatlas: {
            id: p.id, kind: p.kind, hair: hd.en, hairColor: hc.id,
            bang: p.bang || BASE.bang, acc: p.acc || BASE.acc,
            eyeShape: ed.id, eyeColor: ec.id
          }
        }
      }
    }, null, 1);
  }

  window.CharAtlas = {
    HAIRS: HAIRS, BANGS: BANGS, ACCS: ACCS, EYES: EYES,
    HAIR_COLORS: HAIR_COLORS, EYE_COLORS: EYE_COLORS,
    ITEMS: ALL, drawChar: drawChar, charPrompt: charPrompt, charCard: charCard
  };

  /* ===================== 7. UI ===================== */
  var S = {
    lang: 'zh', cat: 'all', q: '', stage: 'list', cur: null,
    mode: 'color', uniform: -1, custom: {}, fav: {}, onlyFav: false, showMore: 48
  };
  var app = null, booted = false;

  function load() {
    try {
      var raw = localStorage.getItem('charAtlas.v1');
      if (raw) {
        var o = JSON.parse(raw);
        if (o.lang) { S.lang = o.lang; }
        S.fav = o.fav || {};
        S.custom = o.custom || {};
      }
    } catch (e) { }
  }
  function save() {
    try { localStorage.setItem('charAtlas.v1', JSON.stringify({ lang: S.lang, fav: S.fav, custom: S.custom })); } catch (e) { }
  }
  load();

  var CATS = [
    { id: 'all', zh: '全部', en: 'All', ja: 'すべて' },
    { id: 'hair', zh: '发型', en: 'Hair', ja: '髪型' },
    { id: 'bang', zh: '刘海', en: 'Bangs', ja: '前髪' },
    { id: 'haircolor', zh: '发色', en: 'Hair color', ja: '髪色' },
    { id: 'acc', zh: '发饰', en: 'Accessory', ja: 'アクセ' },
    { id: 'eyecolor', zh: '眼睛颜色', en: 'Eye color', ja: '瞳色' },
    { id: 'eyeshape', zh: '眼睛形状', en: 'Eye shape', ja: '瞳型' }
  ];

  function nameOf(p) { return p[S.lang] || p.zh; }
  function altOf(p) { return S.lang === 'en' ? p.zh : p.en; }
  function catLabel(c) { return c[S.lang] || c.zh; }
  function kindLabel(kind) {
    for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === kind) { return catLabel(CATS[i]); } }
    return kind;
  }

  // 三语界面文案（跟随 S.lang，跟姿态图鉴的 中/EN/日 一致）
  var DICT = {
    zh: {
      tabHair: '发型与眼睛', tabCostume: '服装', tabPose: '姿势',
      note: '同一个基准角色 × {n} 个可替换选项（{h} 发型 / {b} 刘海 / {c} 发色 / {a} 发饰 / {ec} 眼色 / {es} 眼型）。全部是矢量，换色是实时重绘，不是同一张图换的五张贴图。',
      search: '搜索名称、ID 或英文标签', reset: '重置',
      uniform: '统一发色预览', own: '各自默认', color: '上色', line: '线稿', onlyFav: '只看收藏',
      count: '{a} 个条目 · 已显示 {b}', more: '加载更多（还有 {n} 条）',
      empty: '没找到这个条目，换个词试试',
      back: '← 返回列表', hair: '发色', eye: '眼睛',
      png: '下载 PNG', svg: '下载 SVG', card: '下载角色卡 JSON', prompt: '复制提示词',
      fav: '☆ 收藏', faved: '★ 已收藏', prev: '← 上一个', next: '下一个 →',
      hint: '← → 换条目 · D 切线稿 · ESC 返回',
      toastPng: 'PNG 已下载', toastSvg: 'SVG 已下载', toastCard: '角色卡已下载（chara_card_v2 规范）'
    },
    en: {
      tabHair: 'Hair & eyes', tabCostume: 'Outfits', tabPose: 'Poses',
      note: 'One base character × {n} swappable parts ({h} hair / {b} bangs / {c} hair colors / {a} accessories / {ec} eye colors / {es} eye shapes). All vector: recoloring is a live redraw, not five pre-rendered images.',
      search: 'Search name, ID or tag', reset: 'Reset',
      uniform: 'Uniform hair color', own: 'each default', color: 'Color', line: 'Lineart', onlyFav: 'Favorites only',
      count: '{a} items · showing {b}', more: 'Load more ({n} left)',
      empty: 'Nothing matched. Try another keyword.',
      back: '← Back to list', hair: 'Hair', eye: 'Eyes',
      png: 'Download PNG', svg: 'Download SVG', card: 'Download card JSON', prompt: 'Copy prompt',
      fav: '☆ Favorite', faved: '★ Favorited', prev: '← Previous', next: 'Next →',
      hint: '← → switch · D lineart · ESC back',
      toastPng: 'PNG downloaded', toastSvg: 'SVG downloaded', toastCard: 'Character card downloaded (chara_card_v2)'
    },
    ja: {
      tabHair: '髪と瞳', tabCostume: '衣装', tabPose: 'ポーズ',
      note: '同一のベースキャラ × {n} 個の差し替えパーツ（髪 {h} / 前髪 {b} / 髪色 {c} / アクセ {a} / 瞳色 {ec} / 瞳型 {es}）。すべてベクターで、色替えはリアルタイム再描画です。',
      search: '名前・ID・タグで検索', reset: 'リセット',
      uniform: '髪色を統一', own: '各デフォルト', color: 'カラー', line: '線画', onlyFav: 'お気に入りのみ',
      count: '{a} 件 · 表示 {b}', more: 'もっと見る（残り {n} 件）',
      empty: '見つかりませんでした。別のキーワードで。',
      back: '← 一覧へ戻る', hair: '髪色', eye: '瞳',
      png: 'PNG を保存', svg: 'SVG を保存', card: 'キャラカード JSON', prompt: 'プロンプトをコピー',
      fav: '☆ お気に入り', faved: '★ 登録済み', prev: '← 前へ', next: '次へ →',
      hint: '← → 切替 · D 線画 · ESC 戻る',
      toastPng: 'PNG を保存しました', toastSvg: 'SVG を保存しました', toastCard: 'キャラカードを保存しました（chara_card_v2）'
    }
  };
  function T(k, vars) {
    var d = DICT[S.lang] || DICT.zh;
    var s = d[k] != null ? d[k] : (DICT.zh[k] != null ? DICT.zh[k] : k);
    if (vars) {
      for (var v in vars) { s = s.split('{' + v + '}').join(vars[v]); }
    }
    return s;
  }

  function filtered() {
    var arr = ALL.filter(function (p) { return S.cat === 'all' || p.kind === S.cat; });
    if (S.onlyFav) { arr = arr.filter(function (p) { return !!S.fav[p.id]; }); }
    var q = (S.q || '').trim().toLowerCase();
    if (!q) { return arr; }
    var mc = q.match(/^[hh]?[-_]?(\d{1,3})$/);
    if (mc) {
      var code = 'H' + pad(mc[1]);
      return arr.filter(function (p) { return p.id === code; });
    }
    return arr.filter(function (p) {
      return (p.zh + p.en + p.ja + p.id).toLowerCase().indexOf(q) >= 0;
    });
  }

  // 该条目当前发色：单卡自定义 > 统一预览 > 条目默认
  function colorOf(p) {
    if (S.custom[p.id] != null) { return S.custom[p.id]; }
    if (S.uniform >= 0) { return S.uniform; }
    return null;
  }

  function cardHtml(p) {
    var cIdx = colorOf(p);
    var dots = p.swatches.map(function (c) {
      var on = cIdx === c ? ' on' : '';
      return '<button class="char-dot' + on + '" data-dot="' + p.id + ':' + c + '" style="background:' +
        HAIR_COLORS[c].base + '" title="' + esc(HAIR_COLORS[c].zh) + '"></button>';
    }).join('');
    return '<div class="char-card" data-card="' + p.id + '">' +
      '<button class="char-open" data-open="' + p.id + '" aria-label="' + esc(nameOf(p)) + '">' +
      '<div class="char-thumb">' +
      '<span class="char-code">' + p.id + '</span>' +
      drawChar(p, { mode: S.mode, hairColor: cIdx, vb: '40 -16 220 264' }) +
      '</div></button>' +
      (S.fav[p.id] ? '<span class="char-star">★</span>' : '') +
      '<div class="char-meta">' +
      '<div class="char-name">' + esc(nameOf(p)) + '</div>' +
      '<div class="char-sub">' + esc(altOf(p)) + '</div>' +
      '<div class="char-dots">' + dots + '</div>' +
      '</div></div>';
  }

  function renderList() {
    S.stage = 'list';
    S.cur = null;
    var arr = filtered();
    var shown = arr.slice(0, S.showMore);
    app.innerHTML = '<div class="char-wrap">' +
      '<div class="char-head">' +
      '<div class="char-tabs">' +
      '<button class="char-tab on">' + T('tabHair') + ' <i>' + ALL.length + '</i></button>' +
      (window.CostumeAtlas ? '<button class="char-tab" id="charGotoCostume">' + T('tabCostume') + ' <i>' + (window.CostumeAtlas.ITEMS || []).length + '</i></button>' : '') +
      (window.PoseAtlas ? '<button class="char-tab" id="charGotoPose">' + T('tabPose') + ' <i>' + window.PoseAtlas.POSES.length + '</i></button>' : '') +
      '</div>' +
      '<p class="char-note">' + esc(T('note', {
        n: ALL.length, h: HAIRS.length, b: BANGS.length, c: HAIR_COLORS.length,
        a: ACCS.length, ec: EYE_COLORS.length, es: EYES.length
      })) + '</p>' +
      '</div>' +
      '<div class="char-tools">' +
      '<input class="char-search" id="charSearch" type="search" autocomplete="off" placeholder="' + esc(T('search')) + '" value="' + esc(S.q) + '">' +
      '<div class="char-lang">' +
      ['zh', 'en', 'ja'].map(function (k) {
        return '<button class="char-lang-btn' + (S.lang === k ? ' on' : '') + '" data-clang="' + k + '">' +
          (k === 'zh' ? '中' : k === 'en' ? 'EN' : '日') + '</button>';
      }).join('') + '</div>' +
      '<button class="char-reset" id="charReset">' + T('reset') + '</button>' +
      '</div>' +
      '<div class="char-chips">' +
      CATS.map(function (c) {
        var n = c.id === 'all' ? ALL.length : ALL.filter(function (p) { return p.kind === c.id; }).length;
        return '<button class="char-chip' + (S.cat === c.id ? ' on' : '') + '" data-cat="' + c.id + '">' +
          esc(catLabel(c)) + ' <i>' + n + '</i></button>';
      }).join('') +
      '</div>' +
      '<div class="char-bar">' +
      '<label class="char-uniform">' + T('uniform') +
      '<select id="charUniform"><option value="-1"' + (S.uniform < 0 ? ' selected' : '') + '>' + T('own') + '</option>' +
      HAIR_COLORS.map(function (c, i) {
        return '<option value="' + i + '"' + (S.uniform === i ? ' selected' : '') + '>' + esc(c[S.lang] || c.zh) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="char-modes">' +
      '<button class="char-mode' + (S.mode === 'color' ? ' on' : '') + '" data-mode="color">' + T('color') + '</button>' +
      '<button class="char-mode' + (S.mode === 'line' ? ' on' : '') + '" data-mode="line">' + T('line') + '</button>' +
      '</div>' +
      '<label class="char-onlyfav"><input type="checkbox" id="charFavOnly"' + (S.onlyFav ? ' checked' : '') + '>' + T('onlyFav') + '</label>' +
      '<span class="char-count">' + esc(T('count', { a: arr.length, b: shown.length })) + '</span>' +
      '</div>' +
      '<div class="char-grid">' + (shown.length ? shown.map(cardHtml).join('') :
        '<div class="char-empty">' + T('empty') + '</div>') + '</div>' +
      (shown.length < arr.length ? '<button class="char-more" id="charMore">' + esc(T('more', { n: arr.length - shown.length })) + '</button>' : '') +
      '</div>';
    bindList();
  }

  function bindList() {
    var input = document.getElementById('charSearch');
    var timer = 0;
    input.oninput = function () {
      S.q = input.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var keep = S.q;
        S.showMore = 48;
        renderList();
        var i2 = document.getElementById('charSearch');
        if (i2) { i2.value = keep; i2.focus(); }
      }, 220);
    };
    document.getElementById('charReset').onclick = function () {
      S.q = ''; S.cat = 'all'; S.uniform = -1; S.showMore = 48; S.custom = {}; S.onlyFav = false;
      save(); renderList();
    };
    Array.prototype.forEach.call(app.querySelectorAll('[data-clang]'), function (b) {
      b.onclick = function () { S.lang = b.dataset.clang; save(); renderList(); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-cat]'), function (b) {
      b.onclick = function () { S.cat = b.dataset.cat; S.showMore = 48; renderList(); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-mode]'), function (b) {
      b.onclick = function () { S.mode = b.dataset.mode; renderList(); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { openDetail(b.dataset.open); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-dot]'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var parts = b.dataset.dot.split(':');
        var id = parts[0], ci = +parts[1];
        S.custom[id] = (S.custom[id] === ci) ? null : ci;
        if (S.custom[id] === null) { delete S.custom[id]; }
        save(); renderList();
      };
    });
    document.getElementById('charUniform').onchange = function () {
      S.uniform = +this.value; renderList();
    };
    document.getElementById('charFavOnly').onchange = function () {
      S.onlyFav = this.checked; S.showMore = 48; renderList();
    };
    var mo = document.getElementById('charMore');
    if (mo) {
      mo.onclick = function () { S.showMore += 48; renderList(); };
    }
    var gp = document.getElementById('charGotoPose');
    if (gp) { gp.onclick = function () { if (window.__poseView) { window.__poseView(); } }; }
    var gc = document.getElementById('charGotoCostume');
    if (gc) { gc.onclick = function () { if (window.__costumeView) { window.__costumeView(); } }; }
  }

  function openDetail(id) {
    var p = null;
    for (var i = 0; i < ALL.length; i++) { if (ALL[i].id === id) { p = ALL[i]; } }
    if (!p) { return; }
    S.stage = 'detail';
    S.cur = id;
    var cIdx = colorOf(p);
    app.innerHTML = '<div class="char-wrap">' +
      '<button class="char-back" id="charBack">' + T('back') + '</button>' +
      '<div class="char-detail">' +
      '<div class="char-dstage" id="charStage">' + drawChar(p, { mode: S.mode, hairColor: cIdx }) + '</div>' +
      '<div class="char-dinfo">' +
      '<div class="char-code2">' + p.id + ' · ' + esc(kindLabel(p.kind)) + '</div>' +
      '<h2>' + esc(nameOf(p)) + '</h2>' +
      '<div class="char-dsub">' + esc(p.en) + ' · ' + esc(p.ja) + '</div>' +
      '<div class="char-swap"><span>' + T('hair') + '</span><div class="char-dots">' +
      HAIR_COLORS.map(function (c, i) {
        return '<button class="char-dot' + ((cIdx == null ? (p.hairColor == null ? BASE.hairColor : p.hairColor) : cIdx) === i ? ' on' : '') +
          '" data-dcolor="' + i + '" style="background:' + c.base + '" title="' + esc(c[S.lang] || c.zh) + '"></button>';
      }).join('') + '</div></div>' +
      '<div class="char-swap"><span>' + T('eye') + '</span><div class="char-dots">' +
      EYE_COLORS.map(function (c, i) {
        return '<button class="char-dot' + ((p.eyeColor == null ? BASE.eyeColor : p.eyeColor) === i ? ' on' : '') +
          '" data-ecolor="' + i + '" style="background:' + c.base + '" title="' + esc(c[S.lang] || c.zh) + '"></button>';
      }).join('') + '</div></div>' +
      '<div class="char-acts">' +
      '<button class="char-btn primary" id="charPng">' + T('png') + '</button>' +
      '<button class="char-btn" id="charSvg">' + T('svg') + '</button>' +
      '<button class="char-btn" id="charCardBtn">' + T('card') + '</button>' +
      '<button class="char-btn" id="charPromptBtn">' + T('prompt') + '</button>' +
      '<button class="char-btn' + (S.fav[p.id] ? ' fav' : '') + '" id="charFav">' + (S.fav[p.id] ? T('faved') : T('fav')) + '</button>' +
      '</div>' +
      '<div class="char-nav"><button class="char-btn ghost" id="charPrev">' + T('prev') + '</button>' +
      '<span class="char-hint">' + T('hint') + '</span>' +
      '<button class="char-btn ghost" id="charNext">' + T('next') + '</button></div>' +
      '</div></div></div>';
    bindDetail(p);
  }

  function bindDetail(p) {
    var cur = { hairColor: colorOf(p), eyeColor: p.eyeColor == null ? BASE.eyeColor : p.eyeColor };

    function paint() {
      var st = document.getElementById('charStage');
      if (st) { st.innerHTML = drawChar(p, { mode: S.mode, hairColor: cur.hairColor, eyeColor: cur.eyeColor }); }
    }
    paint();

    document.getElementById('charBack').onclick = function () { renderList(); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-dcolor]'), function (b) {
      b.onclick = function () {
        cur.hairColor = +b.dataset.dcolor;
        S.custom[p.id] = cur.hairColor; save();
        Array.prototype.forEach.call(app.querySelectorAll('[data-dcolor]'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        paint();
      };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-ecolor]'), function (b) {
      b.onclick = function () {
        cur.eyeColor = +b.dataset.ecolor;
        Array.prototype.forEach.call(app.querySelectorAll('[data-ecolor]'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        paint();
      };
    });
    document.getElementById('charPng').onclick = function () {
      svgToPng(drawChar(p, { mode: S.mode, hairColor: cur.hairColor, eyeColor: cur.eyeColor, paper: '#fffdf8' }))
        .then(function (b) { saveBlob(b, p.id + '.png'); toast(T('toastPng')); })
        .catch(function (e) { toast(e.message); });
    };
    document.getElementById('charSvg').onclick = function () {
      var svg = drawChar(p, { mode: S.mode, hairColor: cur.hairColor, eyeColor: cur.eyeColor, paper: '#fffdf8' })
        .replace('<svg ', '<svg width="900" height="900" ');
      saveBlob(new Blob([svg], { type: 'image/svg+xml' }), p.id + '.svg');
      toast(T('toastSvg'));
    };
    document.getElementById('charCardBtn').onclick = function () {
      saveBlob(new Blob([charCard(p, cur)], { type: 'application/json' }), p.id + '-charcard.json');
      toast(T('toastCard'));
    };
    document.getElementById('charPromptBtn').onclick = function () {
      copyText(charPrompt(p, cur));
    };
    document.getElementById('charFav').onclick = function () {
      S.fav[p.id] = !S.fav[p.id];
      if (!S.fav[p.id]) { delete S.fav[p.id]; }
      save(); openDetail(p.id);
    };
    document.getElementById('charPrev').onclick = function () { step(-1); };
    document.getElementById('charNext').onclick = function () { step(1); };
  }

  function step(dir) {
    var arr = filtered();
    var at = -1;
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === S.cur) { at = i; } }
    if (at < 0) { return; }
    var nx = (at + dir + arr.length) % arr.length;
    openDetail(arr[nx].id);
  }

  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function svgToPng(svg) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = 900; c.height = 900;
        var g = c.getContext('2d');
        g.fillStyle = '#fffdf8'; g.fillRect(0, 0, 900, 900);
        g.drawImage(img, 0, 0, 900, 900);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('导出失败')); }, 'image/png');
      };
      img.onerror = function () { rej(new Error('SVG 转 PNG 失败')); };
      img.src = url;
    });
  }
  function copyText(t) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(t).then(function () { toast('已复制'); }, function () { toast('复制失败'); });
    } else { toast('浏览器不支持'); }
  }
  function toast(msg) {
    var old = document.getElementById('charToast');
    if (old) { old.remove(); }
    var d = document.createElement('div');
    d.id = 'charToast'; d.className = 'char-toast'; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add('on'); }, 10);
    setTimeout(function () { d.classList.remove('on'); setTimeout(function () { d.remove(); }, 300); }, 2000);
  }

  document.addEventListener('keydown', function (e) {
    if (!app || !app.offsetParent) { return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) { return; }
    // L：中 → EN → 日 循环（跟姿态图鉴一致）
    if (e.key === 'l' || e.key === 'L') {
      var order = ['zh', 'en', 'ja'];
      var nx = order[(order.indexOf(S.lang) + 1) % 3];
      S.lang = nx; save();
      if (S.stage === 'detail' && S.cur) { openDetail(S.cur); } else { renderList(); }
      return;
    }
    if (S.stage === 'detail') {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'Escape') { renderList(); }
      else if (e.key === 'd' || e.key === 'D') {
        S.mode = S.mode === 'line' ? 'color' : 'line';
        // 重开详情，保留已选的发色/眼色（直接重绘会丢掉自定义色）
        if (S.cur) { openDetail(S.cur); }
      }
    }
  });

  window.__charView = function () {
    app = document.getElementById('charApp');
    if (!app) { return; }
    if (!booted) { booted = true; }
    S.showMore = 48;
    renderList();
  };
})();
