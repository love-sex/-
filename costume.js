/* 衣装图鉴（Costume Atlas）——平面裁剪式矢量线稿
   画法：虚线人台打底 + 衣身（肩斜线/袖窿弧/侧缝收腰）+ 分片袖 + 领型 + 细节。
   与 RuiC-PoseAtlas 的衣装图鉴对齐功能（分类/多色/下载/提示词），线稿全部本页生成，不用其图片。 */
(function () {
  'use strict';
  var LINE = '#b7a48c', PAPER = '#fdfaf3';
  var PALS = [
    { zh: '米白', a: '#fdf8ee', b: '#eadfc8' },
    { zh: '黛蓝', a: '#e9edf2', b: '#b9c3d2' },
    { zh: '蜜桃', a: '#f9ede3', b: '#e3bda6' },
    { zh: '抹茶', a: '#f0f3e8', b: '#c8d2b6' },
    { zh: '驼色', a: '#f6efe2', b: '#d3bd97' }
  ];
  /* 人台关键点（正视图，单位 px，画布 300×300） */
  var B = { neckY: 44, nx: 9, sh: 38, shy: 63, ar: 30, ary: 99, wa: 27, way: 132 };

  function hemY(c) { return 108 + (c.len == null ? .5 : c.len) * 120; }
  function hemB(c) { return 142 + (c.len == null ? .5 : c.len) * 108; }
  function fx(n) { return Math.round(n * 10) / 10; }

  /* ---- 虚线人台（衬底参照） ---- */
  function ghost() {
    var d = 'stroke="' + LINE + '" stroke-width="1" stroke-dasharray="3 4" fill="none" opacity=".38"';
    return '<g ' + d + '>' +
      '<circle cx="150" cy="23" r="10"/>' +
      '<path d="M144 33 L144 44 M156 33 L156 44"/>' +
      '<path d="M112 62 Q118 82 120 98 Q115 124 122 152"/>' +
      '<path d="M188 62 Q182 82 180 98 Q185 124 178 152"/>' +
      '<path d="M112 62 Q97 84 94 114 M188 62 Q203 84 206 114"/>' +
      '<path d="M122 152 Q128 200 133 250 M178 152 Q172 200 167 250"/>' +
      '</g>';
  }

  /* ---- 袖片：沿手臂方向垂下 ---- */
  function sleevePath(c, s) {
    var sl = c.sleeve;
    if (!sl) { return ''; }
    var len = sl === 1 ? 42 : sl === 2 ? 68 : 88;
    var th = (c.ang || 10) * Math.PI / 180;
    var w1 = c.sw1 || 12, w2 = c.sw2 || 7.5;
    var ax = 150 + s * (B.sh - 4), ay = B.shy - 5;
    var dx = Math.sin(th) * s, dy = Math.cos(th);
    var px = Math.cos(th) * s, py = -Math.sin(th);
    var bx = ax + dx * len - px * w2, by = ay + dy * len - py * w2;
    var cx = ax + dx * len + px * w2, cy = ay + dy * len + py * w2;
    var top = { x: ax - s * 2, y: ay - 4 };
    var cap = { x: ax + dx * len * 0.45 - px * (w1 + 1), y: ay + dy * len * 0.45 - py * (w1 + 1) };
    var und = { x: ax + dx * len * 0.45 + px * (w1 - 2), y: ay + dy * len * 0.45 + py * (w1 - 2) };
    var d = 'M' + fx(top.x) + ' ' + fx(top.y) +
      ' Q' + fx(cap.x) + ' ' + fx(cap.y) + ' ' + fx(bx) + ' ' + fx(by) +
      ' L' + fx(cx) + ' ' + fx(cy) +
      ' Q' + fx(und.x) + ' ' + fx(und.y) + ' ' + (150 + s * B.ar) + ' ' + (B.ary - 4) + ' Z';
    return '<path d="' + d + '" fill="url(#cst)" stroke="' + LINE + '" stroke-width="1.3" stroke-linejoin="round"/>';
  }

  /* ---- 衣身（上衣/外套）：肩斜线→袖窿弧→侧缝收腰→下摆 ---- */
  function topBody(c) {
    var hw = 35 + (c.loose ? 3 : 0);
    var hem = hemY(c);
    var hemW = hw - 4 + (c.flare || 0);
    var d = 'M' + (150 - B.nx) + ' ' + B.neckY +
      ' L' + (150 - B.sh) + ' ' + B.shy +
      ' Q' + (150 - B.sh - 4) + ' 82 ' + (150 - B.ar) + ' ' + B.ary +
      ' Q' + (150 - B.wa + 1) + ' 118 ' + (150 - B.wa) + ' ' + B.way +
      ' L' + (150 - hemW) + ' ' + hem +
      ' Q150 ' + (hem + 5) + ' ' + (150 + hemW) + ' ' + hem +
      ' L' + (150 + B.wa) + ' ' + B.way +
      ' Q' + (150 + B.wa - 1) + ' 118 ' + (150 + B.ar) + ' ' + B.ary +
      ' Q' + (150 + B.sh + 4) + ' 82 ' + (150 + B.sh) + ' ' + B.shy +
      ' L' + (150 + B.nx) + ' ' + B.neckY +
      ' Q150 ' + (B.neckY + 6) + ' ' + (150 - B.nx) + ' ' + B.neckY + ' Z';
    return '<path d="' + d + '" fill="url(#cst)" stroke="' + LINE + '" stroke-width="1.4" stroke-linejoin="round"/>';
  }

  /* ---- 连衣裙：衣身 + A 字裙 ---- */
  function dressBody(c) {
    var hem = hemY(c);
    var flare = 22 + (c.len || .7) * 34;
    var d = 'M' + (150 - B.nx) + ' ' + B.neckY +
      ' L' + (150 - B.sh) + ' ' + B.shy +
      ' Q' + (150 - B.sh - 4) + ' 82 ' + (150 - B.ar) + ' ' + B.ary +
      ' L' + (150 - B.wa) + ' ' + B.way +
      ' Q' + (150 - flare - 14) + ' ' + (B.way + (hem - B.way) * .55) + ' ' + (150 - flare) + ' ' + hem +
      ' Q150 ' + (hem + 6) + ' ' + (150 + flare) + ' ' + hem +
      ' Q' + (150 + flare + 14) + ' ' + (B.way + (hem - B.way) * .55) + ' ' + (150 + B.wa) + ' ' + B.way +
      ' L' + (150 + B.ar) + ' ' + B.ary +
      ' Q' + (150 + B.sh + 4) + ' 82 ' + (150 + B.sh) + ' ' + B.shy +
      ' L' + (150 + B.nx) + ' ' + B.neckY +
      ' Q150 ' + (B.neckY + 6) + ' ' + (150 - B.nx) + ' ' + B.neckY + ' Z';
    return '<path d="' + d + '" fill="url(#cst)" stroke="' + LINE + '" stroke-width="1.4" stroke-linejoin="round"/>';
  }

  /* ---- 裤：腰头 + 左右裤腿（裆弯 + 内侧缝） ---- */
  function pantsBody(c) {
    var out = 30 * (c.loose ? 1.26 : 1);
    var ank = c.shape === 'shorts' ? hemB(c) : 248;
    var hemOut = out - (c.loose ? 3 : 7), innerGap = c.loose ? 8 : 6;
    var crotch = 146 + (ank - 146) * 0.17;
    var waist = '<path d="M' + fx(150 - out) + ' 128 L' + fx(150 + out) + ' 128 L' + fx(150 + out) + ' 147 L' + fx(150 - out) + ' 147 Z" ' +
      'fill="url(#cst)" stroke="' + LINE + '" stroke-width="1.3"/>';
    var legs = [-1, 1].map(function (s) {
      var d = 'M' + fx(150 + s * (out - 1)) + ' 145' +
        ' L' + fx(150 + s * (out + 1)) + ' ' + fx(146 + (ank - 146) * .5) +
        ' L' + fx(150 + s * hemOut) + ' ' + ank +
        ' L' + fx(150 + s * innerGap) + ' ' + ank +
        ' L' + fx(150 + s * (innerGap + 2)) + ' ' + fx(ank - 26) +
        ' Q' + fx(150 + s * 4) + ' ' + fx(crotch + 12) + ' ' + fx(150 + s * 1.5) + ' ' + fx(145) + ' Z';
      return '<path d="' + d + '" fill="url(#cst)" stroke="' + LINE + '" stroke-width="1.3" stroke-linejoin="round"/>';
    }).join('');
    return legs + waist;
  }

  /* ---- 裙：腰头 + 扇形裙片 ---- */
  function skirtBody(c) {
    var hem = hemB(c);
    var sw = 26 + (c.len || .4) * 26;
    var band = '<path d="M122 130 L178 130 L178 143 L122 143 Z" fill="url(#cst)" stroke="' + LINE + '" stroke-width="1.3"/>';
    var cone = '<path d="M122 141 L178 141 Q' + fx(150 + sw + 16) + ' ' + (141 + (hem - 141) * .55) + ' ' + fx(150 + sw) + ' ' + hem +
      ' Q150 ' + (hem + 6) + ' ' + fx(150 - sw) + ' ' + hem +
      ' Q' + fx(150 - sw - 16) + ' ' + (141 + (hem - 141) * .55) + ' 122 141 Z" ' +
      'fill="url(#cst)" stroke="' + LINE + '" stroke-width="1.3" stroke-linejoin="round"/>';
    return band + cone;
  }

  /* ---- 领型 ---- */
  function collarPath(c) {
    var s = c.collar;
    if (!s || s === 'none') { return ''; }
    var o = '';
    if (s === 'round') {
      o = '<path d="M' + (150 - B.nx) + ' ' + B.neckY + ' Q150 ' + (B.neckY + 16) + ' ' + (150 + B.nx) + ' ' + B.neckY +
        ' L' + (150 + B.nx - 1) + ' ' + (B.neckY + 7) + ' Q150 ' + (B.neckY + 24) + ' ' + (150 - B.nx + 1) + ' ' + (B.neckY + 7) +
        ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.2"/>';
    } else if (s === 'v') {
      o = '<path d="M' + (150 - B.nx - 2) + ' ' + (B.neckY - 2) + ' L150 ' + (B.neckY + 34) + ' L' + (150 + B.nx + 2) + ' ' + (B.neckY - 2) +
        ' L' + (150 + B.nx + 1) + ' ' + (B.neckY + 6) + ' L150 ' + (B.neckY + 44) + ' L' + (150 - B.nx - 1) + ' ' + (B.neckY + 6) +
        ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.2"/>';
    } else if (s === 'shirt') {
      o = '<path d="M' + (150 - B.nx - 3) + ' ' + (B.neckY - 3) + ' L146 ' + (B.neckY + 14) + ' L134 ' + (B.neckY + 26) + ' L' + (150 - B.nx - 10) + ' ' + (B.neckY + 4) + ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.1"/>' +
        '<path d="M' + (150 + B.nx + 3) + ' ' + (B.neckY - 3) + ' L154 ' + (B.neckY + 14) + ' L166 ' + (B.neckY + 26) + ' L' + (150 + B.nx + 10) + ' ' + (B.neckY + 4) + ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.1"/>';
    } else if (s === 'stand') {
      o = '<path d="M' + (150 - B.nx - 3) + ' ' + (B.neckY + 10) + ' Q150 ' + (B.neckY - 6) + ' ' + (150 + B.nx + 3) + ' ' + (B.neckY + 10) +
        ' L' + (150 + B.nx + 3) + ' ' + (B.neckY + 20) + ' Q150 ' + (B.neckY + 4) + ' ' + (150 - B.nx - 3) + ' ' + (B.neckY + 20) +
        ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.2"/>';
    } else if (s === 'hood') {
      o = '<path d="M' + (150 - 26) + ' ' + (B.neckY + 12) + ' Q150 ' + (B.neckY - 30) + ' ' + (150 + 26) + ' ' + (B.neckY + 12) +
        ' L' + (150 + 20) + ' ' + (B.neckY + 22) + ' Q150 ' + (B.neckY - 10) + ' ' + (150 - 20) + ' ' + (B.neckY + 22) +
        ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.2"/>' +
        '<path d="M136 ' + (B.neckY + 18) + ' Q150 ' + (B.neckY + 26) + ' 164 ' + (B.neckY + 18) + '" fill="none" stroke="' + LINE + '" stroke-width="1" opacity=".6"/>';
    } else if (s === 'lapel') {
      o = '<path d="M' + (150 - B.nx - 2) + ' ' + (B.neckY - 2) + ' L146 108 L' + (150 - 20) + ' ' + (B.neckY + 12) + ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.1"/>' +
        '<path d="M' + (150 + B.nx + 2) + ' ' + (B.neckY - 2) + ' L154 108 L' + (150 + 20) + ' ' + (B.neckY + 12) + ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.1"/>' +
        '<path d="M' + (150 - B.nx - 2) + ' ' + (B.neckY - 2) + ' L148 ' + (B.neckY + 52) + ' M' + (150 + B.nx + 2) + ' ' + (B.neckY - 2) + ' L152 ' + (B.neckY + 52) + '" fill="none" stroke="' + LINE + '" stroke-width="1" opacity=".7"/>';
    } else if (s === 'strap') {
      o = '<path d="M138 ' + (B.neckY + 2) + ' L142 ' + (B.neckY + 34) + ' M162 ' + (B.neckY + 2) + ' L158 ' + (B.neckY + 34) + '" stroke="url(#cst)" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M138 ' + (B.neckY + 2) + ' L142 ' + (B.neckY + 34) + ' M162 ' + (B.neckY + 2) + ' L158 ' + (B.neckY + 34) + '" stroke="' + LINE + '" stroke-width="1" fill="none" opacity=".8"/>';
    } else if (s === 'sailor') {
      o = '<path d="M' + (150 - B.nx - 2) + ' ' + (B.neckY - 2) + ' L150 ' + (B.neckY + 40) + ' L' + (150 + B.nx + 2) + ' ' + (B.neckY - 2) +
        ' L' + (150 + 26) + ' ' + (B.neckY - 8) + ' L150 ' + (B.neckY + 54) + ' L' + (150 - 26) + ' ' + (B.neckY - 8) +
        ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.2"/>';
    } else if (s === 'cross') {
      o = '<path d="M' + (150 - B.nx - 2) + ' ' + (B.neckY - 2) + ' L150 ' + (B.neckY + 44) + ' L' + (150 + B.nx + 2) + ' ' + (B.neckY - 2) +
        ' L' + (150 + B.nx + 1) + ' ' + (B.neckY + 6) + ' L150 ' + (B.neckY + 56) + ' L' + (150 - B.nx - 1) + ' ' + (B.neckY + 6) +
        ' Z" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1.2"/>';
    }
    return o;
  }

  /* ---- 细节 ---- */
  function detailPath(c) {
    var hem = hemY(c);
    var hw = 35 + (c.loose ? 3 : 0);
    var out = '';
    (c.detail || []).forEach(function (d) {
      if (d === 'placket') {
        out += '<path d="M150 ' + (B.neckY + 30) + ' L150 ' + (hem - 8) + '" stroke="' + LINE + '" stroke-width="1" opacity=".55"/>';
      } else if (d === 'buttons') {
        for (var y = B.neckY + 44; y < hem - 12; y += 26) {
          out += '<circle cx="150" cy="' + y + '" r="2.2" fill="' + PAPER + '" stroke="' + LINE + '" stroke-width="1"/>';
        }
      } else if (d === 'zip') {
        out += '<path d="M150 ' + (B.neckY + 16) + ' L150 ' + (hem - 10) + '" stroke="' + LINE + '" stroke-width="1.2" stroke-dasharray="2.5 2.5" opacity=".85"/>';
      } else if (d === 'pocket') {
        var px = hw - 12;
        out += '<path d="M' + (150 - px) + ' 114 L' + (150 - px + 15) + ' 114 L' + (150 - px + 15) + ' 130 L' + (150 - px) + ' 130 Z" fill="none" stroke="' + LINE + '" stroke-width="1" opacity=".55"/>' +
          '<path d="M' + (150 + px - 15) + ' 114 L' + (150 + px) + ' 114 L' + (150 + px) + ' 130 L' + (150 + px - 15) + ' 130 Z" fill="none" stroke="' + LINE + '" stroke-width="1" opacity=".55"/>';
      } else if (d === 'belt') {
        out += '<path d="M' + (150 - B.wa - 2) + ' ' + (B.way - 8) + ' L' + (150 + B.wa + 2) + ' ' + (B.way - 8) + '" stroke="' + LINE + '" stroke-width="7" opacity=".3"/>';
      } else if (d === 'waistband') {
        out += '<path d="M' + (150 - B.wa + 3) + ' ' + (B.way - 4) + ' L' + (150 + B.wa - 3) + ' ' + (B.way - 4) + '" stroke="' + LINE + '" stroke-width="1.2" opacity=".6"/>';
      } else if (d === 'ribs') {
        out += '<path d="M' + (150 - hw + 6) + ' ' + (hem - 12) + ' L' + (150 + hw - 6) + ' ' + (hem - 12) + '" stroke="' + LINE + '" stroke-width="1" opacity=".4"/>';
      } else if (d === 'stripes') {
        out += '<path d="M136 ' + (B.neckY + 10) + ' L164 ' + (B.neckY + 10) + '" stroke="' + LINE + '" stroke-width="5" opacity=".28"/>';
      } else if (d === 'obi') {
        out += '<path d="M' + (150 - B.wa - 6) + ' ' + (B.way - 16) + ' L' + (150 + B.wa + 6) + ' ' + (B.way - 16) + '" stroke="' + LINE + '" stroke-width="26" opacity=".26"/>' +
          '<path d="M' + (150 - B.wa - 6) + ' ' + (B.way - 16) + ' L' + (150 + B.wa + 6) + ' ' + (B.way - 16) + '" stroke="' + LINE + '" stroke-width="1" opacity=".5"/>' +
          '<path d="M156 ' + (B.way - 6) + ' L162 ' + (B.way + 16) + ' L154 ' + (B.way + 18) + '" fill="none" stroke="' + LINE + '" stroke-width="1.2" opacity=".8"/>';
      } else if (d === 'pleat') {
        for (var x = -2; x <= 2; x++) {
          var xx = 150 + x * 11;
          var hemX = 150 + x * 15;
          out += '<path d="M' + xx + ' ' + (B.way + 8) + ' L' + hemX + ' ' + (hem - 4) + '" stroke="' + LINE + '" stroke-width="1" opacity=".4"/>';
        }
      } else if (d === 'strap') {
        out += '<path d="M' + (150 - 15) + ' ' + (B.way - 4) + ' L' + (150 - 21) + ' ' + (B.neckY + 16) +
          ' M' + (150 + 15) + ' ' + (B.way - 4) + ' L' + (150 + 21) + ' ' + (B.neckY + 16) +
          '" stroke="' + LINE + '" stroke-width="6" opacity=".35" stroke-linecap="round"/>';
      } else if (d === 'seam') {
        out += '<path d="M' + (150 - B.wa + 4) + ' ' + (B.ary + 6) + ' L' + (150 - B.wa + 4) + ' ' + (hemY(c) - 10) +
          ' M' + (150 + B.wa - 4) + ' ' + (B.ary + 6) + ' L' + (150 + B.wa - 4) + ' ' + (hemY(c) - 10) +
          '" stroke="' + LINE + '" stroke-width="1" stroke-dasharray="2 3" opacity=".5"/>';
      }
    });
    return out;
  }

  function render(c, pal, opt) {
    opt = opt || {};
    var idx = (pal == null ? (c.pal || 0) : pal) % PALS.length;
    var p = PALS[idx];
    var gid = 'cst' + (render._n = (render._n || 0) + 1);
    var sleeve = c.sleeve ? sleevePath(c, 1) + sleevePath(c, -1) : '';
    var body = c.shape === 'pants' || c.shape === 'shorts' ? pantsBody(c)
      : c.shape === 'skirt' ? skirtBody(c)
        : c.shape === 'dress' ? dressBody(c)
          : topBody(c);
    var collar = (c.shape === 'pants' || c.shape === 'shorts' || c.shape === 'skirt') ? '' : collarPath(c);
    var details = (c.shape === 'pants' || c.shape === 'shorts' || c.shape === 'skirt') ? detailPath(c) : detailPath(c);

    return '<svg viewBox="70 12 160 262" xmlns="http://www.w3.org/2000/svg" class="pose-svg" role="img">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0.4" y2="1">' +
      '<stop offset="0" stop-color="' + p.a + '"/><stop offset="1" stop-color="' + p.b + '"/></linearGradient></defs>' +
      (opt.noPaper ? '' : '<rect x="68" y="10" width="164" height="266" fill="' + PAPER + '"/>') +
      ghost() + sleeve + body + details + collar +
      '<ellipse cx="150" cy="268" rx="52" ry="5" fill="rgba(92,72,46,.08)"/>' +
      '</svg>';
  }

  var CATS = [
    { id: 'top', zh: '上装', en: 'Tops', ja: 'トップス' },
    { id: 'bottom', zh: '下装', en: 'Bottoms', ja: 'ボトムス' },
    { id: 'dress', zh: '连衣裙', en: 'Dresses', ja: 'ワンピース' },
    { id: 'coat', zh: '外套', en: 'Outerwear', ja: 'アウター' },
    { id: 'uniform', zh: '制服', en: 'Uniform', ja: '制服' },
    { id: 'tech', zh: '机能', en: 'Techwear', ja: 'テックウェア' },
    { id: 'trad', zh: '传统', en: 'Traditional', ja: '伝統衣装' }
  ];

  /* ---- 面料：决定配色与三语标签（对齐对标站的"材质"筛选维度） ---- */
  var MATS = {
    '棉': { nz: '棉质', en: 'cotton', ja: 'コットン', pal: 0 },
    '亚麻': { nz: '亚麻', en: 'linen', ja: 'リネン', pal: 4 },
    '针织': { nz: '针织', en: 'knit', ja: 'ニット', pal: 3 },
    '雪纺': { nz: '雪纺', en: 'chiffon', ja: 'シフォン', pal: 2 },
    '牛仔': { nz: '牛仔', en: 'denim', ja: 'デニム', pal: 1 },
    '羊毛': { nz: '羊毛', en: 'wool', ja: 'ウール', pal: 1 },
    '皮革': { nz: '皮质', en: 'leather', ja: 'レザー', pal: 4 },
    '真丝': { nz: '真丝', en: 'silk', ja: 'シルク', pal: 2 },
    '涤纶': { nz: '涤纶', en: 'polyester', ja: 'ポリエステル', pal: 1 },
    '灯芯绒': { nz: '灯芯绒', en: 'corduroy', ja: 'コーデュロイ', pal: 4 }
  };

  /* ---- 版型原型（36 个），每个再按面料展开成具体单品 ---- */
  var PROTOS = [
    { id: 'c1', cat: 'top', zh: '圆领短袖 T 恤', en: 'Crew neck tee', ja: 'クルーTシャツ', shape: 'top', len: .3, sleeve: 1, collar: 'round', detail: ['seam'], pal: 0, mats: ['棉', '亚麻', '涤纶'] },
    { id: 'c2', cat: 'top', zh: '开襟衬衫', en: 'Button shirt', ja: '開襟シャツ', shape: 'top', len: .42, sleeve: 3, collar: 'shirt', detail: ['placket', 'buttons', 'pocket'], pal: 1, mats: ['棉', '亚麻', '真丝'] },
    { id: 'c3', cat: 'top', zh: '连帽卫衣', en: 'Hoodie', ja: 'パーカー', shape: 'top', len: .38, sleeve: 3, collar: 'hood', detail: ['pocket', 'ribs'], loose: 1, pal: 2, mats: ['棉', '涤纶', '灯芯绒'] },
    { id: 'c4', cat: 'bottom', zh: '直筒长裤', en: 'Straight pants', ja: 'ストレートパンツ', shape: 'pants', len: .95, detail: [], pal: 1, mats: ['牛仔', '羊毛', '棉'] },
    { id: 'c5', cat: 'bottom', zh: '百褶短裙', en: 'Pleated skirt', ja: 'プリーツスカート', shape: 'skirt', len: .35, detail: ['pleat'], pal: 2, mats: ['涤纶', '羊毛', '真丝'] },
    { id: 'c6', cat: 'bottom', zh: '牛仔短裤', en: 'Denim shorts', ja: 'デニムショーツ', shape: 'shorts', len: .22, detail: ['pocket'], pal: 4, mats: ['牛仔', '棉'] },
    { id: 'c7', cat: 'dress', zh: '背心连衣裙', en: 'Sleeveless dress', ja: 'ノースリーブワンピ', shape: 'dress', len: .6, sleeve: 0, collar: 'round', detail: ['belt'], pal: 3, mats: ['棉', '针织', '雪纺'] },
    { id: 'c8', cat: 'dress', zh: '长袖连衣裙', en: 'Long sleeve dress', ja: '長袖ワンピース', shape: 'dress', len: .68, sleeve: 3, collar: 'stand', detail: ['waistband'], pal: 0, mats: ['雪纺', '真丝', '棉'] },
    { id: 'c9', cat: 'dress', zh: '吊带长裙', en: 'Slip dress', ja: 'キャミソールドレス', shape: 'dress', len: .78, sleeve: 0, collar: 'strap', detail: ['seam'], pal: 1, mats: ['真丝', '雪纺'] },
    { id: 'c10', cat: 'coat', zh: '单排扣风衣', en: 'Trench coat', ja: 'トレンチコート', shape: 'coat', len: .82, sleeve: 3, collar: 'lapel', detail: ['placket', 'buttons', 'belt'], loose: 1, pal: 4, mats: ['棉', '涤纶'] },
    { id: 'c11', cat: 'coat', zh: '短款夹克', en: 'Bomber jacket', ja: 'ブルゾン', shape: 'coat', len: .26, sleeve: 3, collar: 'stand', detail: ['zip', 'ribs'], loose: 1, pal: 2, mats: ['皮革', '涤纶', '牛仔'] },
    { id: 'c12', cat: 'coat', zh: '长款大衣', en: 'Long coat', ja: 'ロングコート', shape: 'coat', len: .95, sleeve: 3, collar: 'lapel', detail: ['placket', 'buttons'], loose: 1, pal: 1, mats: ['羊毛', '灯芯绒'] },
    { id: 'c13', cat: 'uniform', zh: '水手服', en: 'Sailor uniform', ja: 'セーラー服', shape: 'top', len: .34, sleeve: 2, collar: 'sailor', detail: ['seam'], pal: 0, mats: ['涤纶', '棉'] },
    { id: 'c14', cat: 'uniform', zh: '西装校服', en: 'Blazer', ja: 'ブレザー', shape: 'coat', len: .4, sleeve: 3, collar: 'lapel', detail: ['buttons', 'pocket'], pal: 1, mats: ['羊毛', '涤纶'] },
    { id: 'c15', cat: 'uniform', zh: '运动校服', en: 'Gym uniform', ja: '体操服', shape: 'top', len: .42, sleeve: 3, collar: 'stand', detail: ['zip', 'stripes'], loose: 1, pal: 3, mats: ['涤纶', '棉'] },
    { id: 'c16', cat: 'tech', zh: '机能冲锋衣', en: 'Tech shell', ja: 'テックシェル', shape: 'coat', len: .52, sleeve: 3, collar: 'hood', detail: ['zip', 'pocket'], loose: 1, ang: 34, pal: 1, mats: ['涤纶'] },
    { id: 'c17', cat: 'tech', zh: '战术背心', en: 'Tactical vest', ja: 'タクティカルベスト', shape: 'top', len: .36, sleeve: 0, collar: 'v', detail: ['pocket', 'belt'], loose: 1, pal: 4, mats: ['涤纶', '棉'] },
    { id: 'c18', cat: 'tech', zh: '连体工装', en: 'Jumpsuit', ja: 'ツナギ', shape: 'dress', len: .92, sleeve: 3, collar: 'stand', detail: ['zip', 'belt'], ang: 30, pal: 2, mats: ['棉', '牛仔', '涤纶'] },
    { id: 'c19', cat: 'trad', zh: '和服', en: 'Kimono', ja: '着物', shape: 'coat', len: .9, sleeve: 2, sw1: 17, sw2: 20, ang: 34, collar: 'v', detail: ['obi'], loose: 1, pal: 0, mats: ['真丝', '棉'] },
    { id: 'c20', cat: 'trad', zh: '汉服对襟', en: 'Hanfu', ja: '漢服', shape: 'coat', len: .95, sleeve: 2, sw1: 18, sw2: 22, ang: 32, collar: 'cross', detail: ['waistband'], loose: 1, pal: 3, mats: ['真丝', '亚麻'] },
    { id: 'c21', cat: 'trad', zh: '旗袍', en: 'Qipao', ja: 'チャイナドレス', shape: 'dress', len: .82, sleeve: 1, collar: 'stand', detail: ['placket'], pal: 2, mats: ['真丝', '棉'] },
    { id: 'c22', cat: 'bottom', zh: '阔腿裤', en: 'Wide-leg pants', ja: 'ワイドパンツ', shape: 'pants', len: .95, loose: 1, detail: [], pal: 0, mats: ['亚麻', '棉', '羊毛'] },
    { id: 'c23', cat: 'dress', zh: '学院风连衣裙', en: 'Pinafore dress', ja: 'ジャンパースカート', shape: 'dress', len: .5, sleeve: 0, collar: 'strap', detail: ['pleat', 'waistband'], pal: 4, mats: ['羊毛', '棉'] },
    { id: 'c24', cat: 'coat', zh: '针织开衫', en: 'Cardigan', ja: 'カーディガン', shape: 'coat', len: .44, sleeve: 3, collar: 'v', detail: ['buttons', 'ribs'], loose: 1, pal: 3, mats: ['针织', '羊毛'] },
    { id: 'c25', cat: 'bottom', zh: '运动短裤', en: 'Sport shorts', ja: 'スポートショーツ', shape: 'shorts', len: .28, loose: 1, detail: ['stripes'], pal: 1, mats: ['涤纶', '棉'] },
    { id: 'c26', cat: 'top', zh: '罗纹背心', en: 'Tank top', ja: 'タンクトップ', shape: 'top', len: .3, sleeve: 0, collar: 'round', detail: ['seam'], pal: 4, mats: ['针织', '棉'] },
    { id: 'c27', cat: 'top', zh: 'Polo 衫', en: 'Polo shirt', ja: 'ポロシャツ', shape: 'top', len: .36, sleeve: 1, collar: 'shirt', detail: ['placket', 'buttons'], pal: 3, mats: ['棉', '涤纶'] },
    { id: 'c28', cat: 'dress', zh: '衬衫连衣裙', en: 'Shirt dress', ja: 'シャツワンピース', shape: 'dress', len: .72, sleeve: 2, collar: 'shirt', detail: ['placket', 'buttons', 'belt'], pal: 0, mats: ['棉', '亚麻'] },
    { id: 'c29', cat: 'dress', zh: '连体泳装', en: 'One-piece swimsuit', ja: 'ワンピース水着', shape: 'dress', len: .18, sleeve: 0, collar: 'strap', detail: ['seam'], pal: 1, mats: ['涤纶'] },
    { id: 'c30', cat: 'bottom', zh: '背带裤', en: 'Overalls', ja: 'オーバーオール', shape: 'pants', len: .9, loose: 1, detail: ['strap', 'pocket'], pal: 4, mats: ['牛仔', '棉'] },
    { id: 'c31', cat: 'coat', zh: '短披风', en: 'Cape', ja: 'ケープ', shape: 'coat', len: .3, sleeve: 0, collar: 'v', detail: [], loose: 1, pal: 1, mats: ['羊毛', '灯芯绒'] },
    { id: 'c32', cat: 'dress', zh: '礼服长裙', en: 'Evening gown', ja: 'イブニングドレス', shape: 'dress', len: .95, sleeve: 0, collar: 'strap', detail: ['pleat'], pal: 2, mats: ['真丝', '雪纺'] },
    { id: 'c33', cat: 'trad', zh: '浴衣', en: 'Yukata', ja: '浴衣', shape: 'coat', len: .78, sleeve: 2, sw1: 16, sw2: 18, ang: 32, collar: 'cross', detail: ['obi'], loose: 1, pal: 0, mats: ['棉', '亚麻'] },
    { id: 'c34', cat: 'dress', zh: '针织连衣裙', en: 'Knit dress', ja: 'ニットワンピ', shape: 'dress', len: .62, sleeve: 3, collar: 'round', detail: ['ribs'], pal: 3, mats: ['针织', '羊毛'] },
    { id: 'c35', cat: 'bottom', zh: '西装长裤', en: 'Suit pants', ja: 'スーツパンツ', shape: 'pants', len: .95, detail: ['seam'], pal: 1, mats: ['羊毛', '涤纶'] },
    { id: 'c36', cat: 'top', zh: '西装马甲', en: 'Waistcoat', ja: 'ベスト', shape: 'top', len: .32, sleeve: 0, collar: 'v', detail: ['buttons', 'pocket'], pal: 4, mats: ['羊毛', '皮革'] }
  ];

  /* ---- 展开：原型 × 面料 = 单品；标签三语，可搜索 ---- */
  var ITEMS = [];
  (function () {
    var catOf = {};
    CATS.forEach(function (c) { catOf[c.id] = c; });
    PROTOS.forEach(function (p) {
      var base = {};
      Object.keys(p).forEach(function (k) { base[k] = p[k]; });
      var ct = catOf[p.cat] || { zh: '', en: '', ja: '' };
      base.tags = [p.loose ? ['宽松', 'loose', 'ゆったり'] : ['修身', 'slim', 'スリム']];
      ITEMS.push(base);
      (p.mats || []).forEach(function (mz, i) {
        var m = MATS[mz];
        if (!m) { return; }
        var v = {};
        Object.keys(base).forEach(function (k) { v[k] = base[k]; });
        v.id = p.id + 'm' + (i + 1);
        v.proto = p.id;
        v.mat = mz;
        if (p.zh.indexOf(m.nz) === 0) { return; }   // 原型名里已含该面料，不再生成同名款
        v.zh = m.nz + p.zh;
        v.en = m.en + ' ' + String(p.en || '').toLowerCase();
        v.ja = m.ja + p.ja;
        v.pal = m.pal;
        v.tags = [[mz, m.en, m.ja]].concat(base.tags);
        ITEMS.push(v);
      });
    });
    ITEMS.forEach(function (it) {
      it.tagStr = it.tags.map(function (t) { return t.join(' '); }).join(' ');
    });
  })();

  window.CostumeAtlas = {
    CATS: CATS,
    ITEMS: ITEMS,
    PROTOS: PROTOS,
    MATS: MATS,
    PALS: PALS,
    render: render
  };
})();
