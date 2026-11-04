/* 姿态图鉴（Pose Atlas）— 人台线稿由本模块实时生成矢量图，不使用任何第三方图片素材 */
(function () {
  'use strict';

  /* ================= 四元数 ================= */
  function qAx(ax, ay, az, deg) {
    var a = deg * Math.PI / 360, s = Math.sin(a);
    return [Math.cos(a), ax * s, ay * s, az * s];
  }
  function qMul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
  }
  function qRot(q, v) {
    var w = q[0], x = q[1], y = q[2], z = q[3];
    var tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx)
    ];
  }
  function qx(d) { return qAx(1, 0, 0, -d); }   // 正数 = 向前抬
  function qy(d) { return qAx(0, 1, 0, d); }
  function qz(d) { return qAx(0, 0, 1, d); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

  /* ================= 身体比例（cm，脚底 y=0） ================= */
  var BODY = { pelvis: 100, low: 13, up: 17, neck: 11, head: 12, headR: 9.8 };

  var VIEW = { w: 300, h: 300, cx: 150, base: 288, s: 1.5 };

  function proj(p, yaw, pitch, opt) {
    var Y = yaw * Math.PI / 180, P = pitch * Math.PI / 180;
    var x1 = p[0] * Math.cos(Y) + p[2] * Math.sin(Y);
    var z1 = -p[0] * Math.sin(Y) + p[2] * Math.cos(Y);
    var y2 = p[1] * Math.cos(P) - z1 * Math.sin(P);
    var z2 = p[1] * Math.sin(P) + z1 * Math.cos(P);
    var s = VIEW.s * (opt.zoom || 1);
    return { x: VIEW.cx + x1 * s, y: VIEW.base - y2 * s - (opt.shift || 0), z: z2 };
  }

  function build(p, off) {
    var segs = [];
    var r = p.r || [0, 0, 0];
    var root = qMul(qy(p.yaw || 0), qMul(qz(r[2] || 0), qx(r[0] || 0)));
    var pelvis = [(p.x || 0) + (off || 0), BODY.pelvis + (p.y || 0), 0];
    function seg(a, b, ra, rb) { segs.push({ a: a, b: b, ra: ra, rb: rb }); }

    var sp = p.sp || [0, 0, 0];
    var qB = qMul(qy(sp[1]), qMul(qz(sp[2]), qx(sp[0])));
    var wUp = qMul(root, qB);

    var chest = add(pelvis, qRot(wUp, [0, BODY.low + BODY.up, 0]));
    seg(pelvis, chest, 12.6, 14.2);          // 躯干整块，避免一节一节的接缝
    segs.push({ joint: pelvis, r: 9.6 });    // 胯部球关节

    var nk = p.nk || [0, 0];
    var wNeck = qMul(wUp, qMul(qy(nk[1] || 0), qx(nk[0] || 0)));
    var neckTop = add(chest, qRot(wNeck, [0, BODY.neck, 0]));
    seg(chest, neckTop, 5.0, 4.4);
    segs.push({ joint: chest, r: 6.4 });
    var headC = add(neckTop, qRot(wNeck, [0, BODY.head, 0]));
    segs.push({ head: headC, r: BODY.headR });

    [['L', 1], ['R', -1]].forEach(function (it) {
      var side = it[0], sg = it[1];
      var a = p['a' + side] || [0, 6, 0, 6];
      var wArm = qMul(wUp, qMul(qy((a[2] || 0) * sg), qMul(qz((a[1] || 0) * sg), qx(a[0] || 0))));
      var sh = add(chest, qRot(wUp, [15.5 * sg, -2, 0]));
      var el = add(sh, qRot(wArm, [0, -29, 0]));
      var wFore = qMul(wArm, qx(a[3] || 0));
      var wr = add(el, qRot(wFore, [0, -26, 0]));
      var hd = add(wr, qRot(wFore, [0, -8, 0]));
      seg(add(chest, qRot(wUp, [5 * sg, 0, 0])), sh, 5.2, 5.8);
      seg(sh, el, 5.0, 4.3);
      seg(el, wr, 4.3, 3.4);
      seg(wr, hd, 3.0, 2.3);
      segs.push({ joint: sh, r: 5.6 });
      segs.push({ joint: el, r: 4.3 });

      var l = p['l' + side] || [0, 2, 0, 2, 0];
      var wLeg = qMul(root, qMul(qy((l[2] || 0) * sg), qMul(qz((l[1] || 0) * sg), qx(l[0] || 0))));
      var hip = add(pelvis, qRot(root, [7.8 * sg, -4, 0]));
      var kn = add(hip, qRot(wLeg, [0, -46, 0]));
      var wShin = qMul(wLeg, qx(-(l[3] || 0)));
      var an = add(kn, qRot(wShin, [0, -43, 0]));
      var wFoot = qMul(wShin, qx(l[4] || 0));
      var toe = add(an, qRot(wFoot, [0, -2, 12]));
      seg(hip, kn, 7.6, 6.0);
      seg(kn, an, 6.0, 4.0);
      seg(an, toe, 3.6, 2.8);
      segs.push({ joint: kn, r: 5.9 });
      segs.push({ joint: an, r: 3.9 });
    });
    return segs;
  }

  function f(n) { return Math.round(n * 10) / 10; }
  function capPath(a, b, ra, rb) {
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var nx = -dy / L, ny = dx / L;
    var p1 = [a.x + nx * ra, a.y + ny * ra], p2 = [a.x - nx * ra, a.y - ny * ra];
    var p3 = [b.x - nx * rb, b.y - ny * rb], p4 = [b.x + nx * rb, b.y + ny * rb];
    return 'M' + f(p1[0]) + ' ' + f(p1[1]) +
      'A' + f(ra) + ' ' + f(ra) + ' 0 1 0 ' + f(p2[0]) + ' ' + f(p2[1]) +
      'L' + f(p3[0]) + ' ' + f(p3[1]) +
      'A' + f(rb) + ' ' + f(rb) + ' 0 1 0 ' + f(p4[0]) + ' ' + f(p4[1]) + 'Z';
  }

  function render(pose, opts) {
    opts = opts || {};
    var yaw = opts.yaw == null ? 0 : opts.yaw;
    var pitch = opts.pitch == null ? -7 : opts.pitch;
    var opt = { zoom: (pose.z || 1) * (opts.zoom || 1), shift: pose.shift || 0 };
    var segs = build(pose, 0);
    if (pose.duo) { segs = segs.concat(build(pose.duo, 0)); }

    var items = segs.map(function (s) {
      if (s.head) {
        var hc = proj(s.head, yaw, pitch, opt);
        return { kind: 'head', c: hc, r: s.r * VIEW.s * opt.zoom, z: hc.z };
      }
      if (s.joint) {
        var jc = proj(s.joint, yaw, pitch, opt);
        return { kind: 'joint', c: jc, r: s.r * VIEW.s * opt.zoom, z: jc.z + 0.4 };
      }
      var a = proj(s.a, yaw, pitch, opt), b = proj(s.b, yaw, pitch, opt);
      return {
        kind: 'seg', a: a, b: b,
        ra: s.ra * VIEW.s * opt.zoom, rb: s.rb * VIEW.s * opt.zoom,
        z: (a.z + b.z) / 2
      };
    }).sort(function (m, n) { return m.z - n.z; });

    var gid = 'pg' + (render._n = (render._n || 0) + 1);
    var body = 'url(#' + gid + ')', line = '#b7a48c', sw = 1.3;
    var out = items.map(function (it) {
      if (it.kind === 'head') {
        return '<circle cx="' + f(it.c.x) + '" cy="' + f(it.c.y) + '" r="' + f(it.r) +
          '" fill="' + body + '" stroke="' + line + '" stroke-width="' + sw + '"/>' +
          '<path d="M' + f(it.c.x - it.r * 0.62) + ' ' + f(it.c.y - it.r * 0.34) +
          'Q' + f(it.c.x) + ' ' + f(it.c.y - it.r * 0.86) + ' ' + f(it.c.x + it.r * 0.62) + ' ' + f(it.c.y - it.r * 0.34) +
          '" fill="none" stroke="' + line + '" stroke-width="1" opacity=".4"/>';
      }
      if (it.kind === 'joint') {
        return '<circle cx="' + f(it.c.x) + '" cy="' + f(it.c.y) + '" r="' + f(it.r * 0.94) +
          '" fill="#efe3cf" stroke="' + line + '" stroke-width="1" opacity=".9"/>';
      }
      return '<path d="' + capPath(it.a, it.b, it.ra, it.rb) + '" fill="' + body +
        '" stroke="' + line + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
    }).join('');

    var defs = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0.35" y2="1">' +
      '<stop offset="0" stop-color="#fdf8ee"/><stop offset="1" stop-color="#eee2cd"/></linearGradient></defs>';

    // 地面投影
    var ground = proj([pose.x || 0, 0.4, 0], yaw, pitch, opt);
    var shadow = '<ellipse cx="' + f(ground.x) + '" cy="' + f(ground.y) + '" rx="' + f(34 * opt.zoom) +
      '" ry="' + f(7 * opt.zoom) + '" fill="rgba(92,72,46,.10)"/>';

    return '<svg viewBox="0 0 ' + VIEW.w + ' ' + VIEW.h + '" xmlns="http://www.w3.org/2000/svg" ' +
      'class="pose-svg" role="img">' + defs +
      (opts.paper ? '<rect width="100%" height="100%" fill="' + opts.paper + '"/>' : '') +
      shadow + out + '</svg>';
  }

  /* ================= 姿态数据 ================= */
  var CATS = [
    { id: 'stand', zh: '站姿', en: 'Standing', ja: '立ち' },
    { id: 'sit', zh: '坐姿', en: 'Sitting', ja: '座り' },
    { id: 'lie', zh: '卧姿', en: 'Lying', ja: '寝そべり' },
    { id: 'move', zh: '动态', en: 'Motion', ja: '動き' },
    { id: 'action', zh: '战斗', en: 'Combat', ja: '戦闘' },
    { id: 'stretch', zh: '伸展', en: 'Stretch', ja: 'ストレッチ' },
    { id: 'half', zh: '半身', en: 'Half body', ja: '半身' },
    { id: 'duo', zh: '双人', en: 'Duo', ja: '二人' }
  ];

  var POSES = [
    { id: 'st1', cat: 'stand', zh: '自然站姿', en: 'Relaxed stand', ja: '自然な立ち姿',
      sp: [0, 0, 0], nk: [0, 0], aL: [0, 6, 0, 6], aR: [0, 6, 0, 6], lL: [0, 2, 0, 2, 0], lR: [0, 2, 0, 2, 0] },
    { id: 'st2', cat: 'stand', zh: '单手插兜', en: 'Hand in pocket', ja: '片手をポケットに',
      sp: [0, -6, 2], nk: [0, 6], aL: [12, 14, 0, 74], aR: [0, 7, 0, 8],
      lL: [0, 3, 0, 2, 0], lR: [-4, 5, 0, 4, 0] },
    { id: 'st3', cat: 'stand', zh: '抱臂而立', en: 'Arms crossed', ja: '腕組み',
      sp: [2, 0, 0], nk: [2, 0], aL: [22, 12, 0, 122], aR: [22, 12, 0, 122],
      lL: [0, 3, 0, 2, 0], lR: [0, 4, 0, 3, 0] },
    { id: 'st4', cat: 'stand', zh: '回眸站立', en: 'Look back', ja: '振り返り',
      yaw: 18, sp: [0, -14, 0], nk: [0, 28], aL: [-8, 8, 0, 12], aR: [6, 6, 0, 20],
      lL: [-6, 2, 0, 3, 0], lR: [4, 3, 0, 2, 0] },
    { id: 'st5', cat: 'stand', zh: '双手抱头', en: 'Hands behind head', ja: '頭の後ろで手を組む',
      sp: [-2, 0, 0], nk: [4, 0], aL: [168, 26, 0, 96], aR: [168, 26, 0, 96],
      lL: [2, 3, 0, 2, 0], lR: [-2, 4, 0, 3, 0] },
    { id: 'st6', cat: 'stand', zh: '指挥棒站姿', en: 'Pointing forward', ja: '指差し',
      sp: [0, 8, 0], nk: [0, -8], aL: [92, 8, 0, 4], aR: [0, 8, 0, 10],
      lL: [6, 3, 0, 3, 0], lR: [-6, 4, 0, 4, 0] },

    { id: 'si1', cam: 38, cat: 'sit', zh: '椅上正坐', en: 'Seated upright', ja: '椅子に座る', y: -50,
      sp: [4, 0, 0], nk: [2, 0], aL: [10, 8, 0, 52], aR: [10, 8, 0, 52],
      lL: [86, 5, 0, 92, 0], lR: [86, 5, 0, 92, 0] },
    { id: 'si2', cam: 40, cat: 'sit', zh: '翘腿而坐', en: 'Crossed legs', ja: '脚を組む', y: -50,
      sp: [2, 6, 2], nk: [0, -6], aL: [12, 10, 0, 60], aR: [16, 26, 0, 92],
      lL: [88, 8, 0, 92, 0], lR: [94, -22, 0, 78, 0] },
    { id: 'si3', cam: 34, cat: 'sit', zh: '抱膝坐地', en: 'Knees hugged', ja: '膝を抱える', y: -56,
      sp: [18, 0, 0], nk: [12, 0], aL: [72, 16, 0, 104], aR: [72, 16, 0, 104],
      lL: [104, 12, 0, 132, 0], lR: [104, 12, 0, 132, 0] },
    { id: 'si4', cam: 52, cat: 'sit', zh: '侧坐撑地', en: 'Side sit', ja: '横向き座り', y: -52, r: [0, 0, 0],
      sp: [-6, 26, 0], nk: [0, -18], aL: [10, 34, 0, 18], aR: [24, 18, 0, 34],
      lL: [72, 30, 0, 44, 0], lR: [64, 10, 0, 96, 0] },
    { id: 'si5', cam: 46, cat: 'sit', zh: '前倾坐姿', en: 'Lean forward', ja: '前かがみ', y: -50,
      sp: [26, 0, 0], nk: [-6, 0], aL: [54, 10, 0, 44], aR: [54, 10, 0, 44],
      lL: [86, 5, 0, 94, 0], lR: [86, 5, 0, 94, 0] },

    { id: 'li1', cam: 68, cat: 'lie', zh: '侧卧', en: 'Side lying', ja: '横向きに寝る', y: -86, r: [0, 0, 84],
      sp: [6, 0, 8], nk: [0, 0], aL: [16, 44, 0, 36], aR: [-10, 20, 0, 22],
      lL: [18, 6, 0, 34, 0], lR: [-8, 4, 0, 26, 0] },
    { id: 'li2', cam: 74, cat: 'lie', zh: '仰卧抬手', en: 'Supine reach', ja: '仰向けで手を伸ばす', y: -88, r: [-88, 0, 0],
      sp: [-6, 0, 0], nk: [-10, 0], aL: [24, 30, 0, 14], aR: [24, 30, 0, 14],
      lL: [4, 6, 0, 6, 0], lR: [4, 6, 0, 6, 0] },
    { id: 'li3', cam: 70, cat: 'lie', zh: '俯卧抬头', en: 'Prone lift', ja: 'うつ伏せ', y: -86, r: [86, 0, 0],
      sp: [-16, 0, 0], nk: [-26, 0], aL: [40, 26, 0, 72], aR: [40, 26, 0, 72],
      lL: [-6, 5, 0, 10, 0], lR: [-6, 5, 0, 10, 0] },

    { id: 'mo1', cat: 'move', zh: '行走', en: 'Walking', ja: '歩く',
      sp: [2, 4, 0], nk: [0, -4], aL: [-22, 6, 0, 26], aR: [26, 6, 0, 30],
      lL: [26, 3, 0, 8, 0], lR: [-20, 3, 0, 26, -8] },
    { id: 'mo2', cat: 'move', zh: '奔跑', en: 'Running', ja: '走る', y: 2,
      sp: [10, 8, 0], nk: [-6, -6], aL: [-44, 10, 0, 76], aR: [52, 10, 0, 84],
      lL: [52, 4, 0, 22, 0], lR: [-38, 4, 0, 72, -14] },
    { id: 'mo3', cat: 'move', zh: '跳跃', en: 'Jump', ja: 'ジャンプ', y: 12,
      sp: [-4, 0, 0], nk: [-8, 0], aL: [150, 14, 0, 16], aR: [150, 14, 0, 16],
      lL: [26, 8, 0, 54, 0], lR: [16, 8, 0, 42, 0] },
    { id: 'mo4', cat: 'move', zh: '转身', en: 'Turn around', ja: '振り向きざま',
      yaw: 26, sp: [4, -18, 0], nk: [0, 34], aL: [-34, 22, 0, 40], aR: [40, 8, 0, 26],
      lL: [10, 6, 0, 14, 0], lR: [-14, 8, 0, 30, 0] },
    { id: 'mo5', cat: 'move', zh: '下蹲', en: 'Crouch', ja: 'しゃがむ', y: -34,
      sp: [24, 0, 0], nk: [-16, 0], aL: [52, 12, 0, 64], aR: [52, 12, 0, 52],
      lL: [96, 10, 0, 132, -22], lR: [96, 10, 0, 132, -22] },

    { id: 'ac1', cat: 'action', zh: '直拳', en: 'Straight punch', ja: 'ストレート',
      yaw: -22, sp: [4, -22, 0], nk: [0, 16], aL: [88, 6, 0, 6], aR: [34, 10, 0, 96],
      lL: [24, 4, 0, 16, 0], lR: [-18, 6, 0, 34, 0] },
    { id: 'ac2', cat: 'action', zh: '持剑站立', en: 'Sword stance', ja: '剣を構える',
      sp: [2, 12, 0], nk: [0, -12], aL: [62, 18, 0, 66], aR: [58, 20, 0, 72],
      lL: [30, 10, 0, 26, 0], lR: [-16, 12, 0, 34, 0] },
    { id: 'ac3', cat: 'action', zh: '蓄力下劈', en: 'Overhead swing', ja: '振りかぶり',
      sp: [-8, -14, 0], nk: [-6, 12], aL: [168, 12, 0, 24], aR: [164, 14, 0, 28],
      lL: [16, 8, 0, 18, 0], lR: [-12, 10, 0, 26, 0] },
    { id: 'ac4', cat: 'action', zh: '射击姿态', en: 'Aiming', ja: '狙う',
      yaw: -12, sp: [0, -16, 0], nk: [0, 14], aL: [94, 10, 0, 4], aR: [80, 18, 0, 46],
      lL: [12, 8, 0, 12, 0], lR: [-10, 10, 0, 24, 0] },
    { id: 'ac5', cat: 'action', zh: '闪避侧身', en: 'Dodge', ja: '回避', yaw: 24,
      sp: [12, 22, 6], nk: [-8, -20], aL: [-40, 40, 0, 60], aR: [66, 24, 0, 88],
      lL: [44, 16, 0, 62, 0], lR: [-20, 10, 0, 40, 0] },

    { id: 'sr1', cat: 'stretch', zh: '举手伸懒腰', en: 'Morning stretch', ja: '背伸び',
      sp: [-8, 0, 0], nk: [-12, 0], aL: [168, 20, 0, 10], aR: [168, 20, 0, 10],
      lL: [0, 3, 0, 2, 0], lR: [0, 3, 0, 2, 0] },
    { id: 'sr2', cat: 'stretch', zh: '体前屈', en: 'Forward fold', ja: '前屈',
      sp: [78, 0, 0], nk: [-16, 0], aL: [20, 14, 0, 6], aR: [20, 14, 0, 6],
      lL: [6, 4, 0, 4, 0], lR: [6, 4, 0, 4, 0] },
    { id: 'sr3', cat: 'stretch', zh: '侧弯伸展', en: 'Side bend', ja: '側屈',
      sp: [0, 0, 20], nk: [0, 0], aL: [172, 20, 0, 12], aR: [176, 46, 0, 10],
      lL: [4, 6, 0, 2, 0], lR: [0, 10, 0, 4, 0] },
    { id: 'sr4', cat: 'stretch', zh: '弓步压腿', en: 'Lunge stretch', ja: 'ランジ',
      sp: [10, 0, 0], nk: [-4, 0], aL: [150, 30, 0, 60], aR: [150, 30, 0, 60],
      lL: [58, 8, 0, 76, -10], lR: [-42, 8, 0, 14, 6] },
    { id: 'sr5', cat: 'stretch', zh: '舒展双臂', en: 'Open arms', ja: '腕を広げる',
      sp: [-4, 0, 0], nk: [-6, 0], aL: [8, 92, 0, 10], aR: [8, 92, 0, 10],
      lL: [0, 6, 0, 4, 0], lR: [0, 6, 0, 4, 0] },

    { id: 'hf1', cat: 'half', zh: '半身正面', en: 'Half front', ja: '半身・正面', z: 1.86, shift: -178,
      sp: [0, 0, 0], nk: [2, 0], aL: [8, 10, 0, 24], aR: [8, 10, 0, 24],
      lL: [0, 3, 0, 2, 0], lR: [0, 3, 0, 2, 0] },
    { id: 'hf2', cat: 'half', zh: '半身侧脸', en: 'Half profile', ja: '半身・横顔', z: 1.86, shift: -178, yaw: 42,
      sp: [2, -8, 0], nk: [0, 26], aL: [10, 8, 0, 20], aR: [4, 10, 0, 34],
      lL: [0, 3, 0, 2, 0], lR: [0, 3, 0, 2, 0] },
    { id: 'hf3', cat: 'half', zh: '半身托腮', en: 'Chin rest', ja: '頬杖', z: 1.86, shift: -178,
      sp: [4, 6, 2], nk: [4, -6], aL: [52, 16, 0, 128], aR: [16, 8, 0, 30],
      lL: [0, 3, 0, 2, 0], lR: [0, 3, 0, 2, 0] },

    { id: 'du1', cam: 24, cat: 'duo', zh: '并肩而立', en: 'Standing together', ja: '並んで立つ',
      x: -20, sp: [0, 0, 0], nk: [0, 0], aL: [0, 7, 0, 8], aR: [0, 5, 0, 6],
      lL: [0, 3, 0, 2, 0], lR: [0, 3, 0, 2, 0],
      duo: { x: 22, zh: '', sp: [0, -10, 0], nk: [0, 12], aL: [6, 8, 0, 18], aR: [0, 6, 0, 6], lL: [0, 3, 0, 2, 0], lR: [0, 3, 0, 2, 0] } },
    { id: 'du2', cam: 12, cat: 'duo', zh: '背靠背', en: 'Back to back', ja: '背中合わせ',
      x: -22, yaw: 34, sp: [0, 8, 0], nk: [0, -16], aL: [8, 10, 0, 26], aR: [0, 6, 0, 10],
      lL: [4, 3, 0, 4, 0], lR: [-4, 3, 0, 6, 0],
      duo: { x: 20, yaw: -34, sp: [0, -8, 0], nk: [0, 22], aL: [-8, 10, 0, 20], aR: [4, 6, 0, 12], lL: [-4, 3, 0, 6, 0], lR: [4, 3, 0, 4, 0] } },
    { id: 'du3', cam: 20, cat: 'duo', zh: '一坐一立', en: 'One sits', ja: '一人座る',
      x: -22, sp: [0, 6, 0], nk: [0, -6], aL: [0, 7, 0, 10], aR: [10, 6, 0, 24],
      lL: [0, 3, 0, 2, 0], lR: [-6, 4, 0, 6, 0],
      duo: { x: 24, y: -50, sp: [4, -10, 0], nk: [0, 12], aL: [12, 10, 0, 56], aR: [12, 10, 0, 56], lL: [86, 5, 0, 92, 0], lR: [86, 5, 0, 92, 0] } }
  ];

  /* ================= 镜像扩展：左右对称生成另一套 ================= */
  function sameArr(a, b) {
    if (!a || !b) { return !a && !b; }
    for (var i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) { return false; } }
    return true;
  }
  function mirrorOf(p) {
    if (p.duo && !sameArr(p.aL, p.aR)) { return null; }
    if (sameArr(p.aL, p.aR) && sameArr(p.lL, p.lR) && !p.yaw && !(p.sp && p.sp[1]) && !(p.nk && p.nk[1])) { return null; }
    var m = {};
    Object.keys(p).forEach(function (k) { m[k] = p[k]; });
    m.id = p.id + 'm';
    m.aL = p.aR; m.aR = p.aL;
    m.lL = p.lR; m.lR = p.lL;
    m.yaw = -(p.yaw || 0);
    m.sp = [(p.sp && p.sp[0]) || 0, -((p.sp && p.sp[1]) || 0), -((p.sp && p.sp[2]) || 0)];
    m.nk = [(p.nk && p.nk[0]) || 0, -((p.nk && p.nk[1]) || 0)];
    m.x = -(p.x || 0);
    m.mirror = true;
    if (p.duo) {
      var d = {};
      Object.keys(p.duo).forEach(function (k) { d[k] = p.duo[k]; });
      d.yaw = -(p.duo.yaw || 0);
      d.sp = [(p.duo.sp && p.duo.sp[0]) || 0, -((p.duo.sp && p.duo.sp[1]) || 0), -((p.duo.sp && p.duo.sp[2]) || 0)];
      d.nk = [(p.duo.nk && p.duo.nk[0]) || 0, -((p.duo.nk && p.duo.nk[1]) || 0)];
      var t = d.aL; d.aL = d.aR; d.aR = t;
      t = d.lL; d.lL = d.lR; d.lR = t;
      d.x = -(p.duo.x || 0);
      m.duo = d;
    }
    return m;
  }
  var ALL = [];
  POSES.forEach(function (p) {
    ALL.push(p);
    var m = mirrorOf(p);
    if (m) { ALL.push(m); }
  });

  /* ================= 提示词 / 导出 ================= */
  function promptOf(p) {
    return 'full body pose reference, ' + String(p.en).toLowerCase() +
      ', wooden mannequin / artist dummy, plain seamless background, natural anatomy, ' +
      '7.5 heads proportion, even soft lighting, front and 3/4 view, ' +
      'use as pose control reference for character illustration';
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('资源加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureLib(globalName, path) {
    if (window[globalName]) { return Promise.resolve(window[globalName]); }
    return loadScript(path).then(function () { return window[globalName]; });
  }
  function svgToBlob(svg) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = 900; c.height = 900;
        var g = c.getContext('2d');
        g.fillStyle = '#fdfaf3'; g.fillRect(0, 0, 900, 900);
        g.drawImage(img, 0, 0, 900, 900);
        c.toBlob(function (b) { if (b) { res(b); } else { rej(new Error('导出失败')); } }, 'image/png');
      };
      img.onerror = function () { rej(new Error('矢量图解析失败')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 3000);
  }

  /* ================= 模块 UI ================= */
  var VIEWS = [
    { yaw: 0, zh: '正面', en: 'Front' },
    { yaw: 36, zh: '前侧', en: '3/4' },
    { yaw: 90, zh: '侧面', en: 'Side' },
    { yaw: 144, zh: '后侧', en: 'Back 3/4' },
    { yaw: 180, zh: '背面', en: 'Back' }
  ];
  var STORE_KEY = 'pose-atlas-v1';
  var S = { lang: 'zh', tab: 'pose', cat: 'all', q: '', stage: 'list', cur: null, view: 0, pal: 0, fav: {}, sel: {}, fuse: null, fuseTab: '' };
  var app = null, booted = false;

  function C() { return window.CostumeAtlas || { CATS: [], ITEMS: [], PALS: [], render: function () { return ''; } }; }
  function isCostume() { return S.tab === 'costume'; }
  function curCats() { return isCostume() ? C().CATS : CATS; }
  function curItems() { return isCostume() ? C().ITEMS : ALL; }
  function findItem(id) {
    var i;
    for (i = 0; i < ALL.length; i++) { if (ALL[i].id === id) { return { type: 'pose', d: ALL[i] }; } }
    var cs = C().ITEMS;
    for (i = 0; i < cs.length; i++) { if (cs[i].id === id) { return { type: 'costume', d: cs[i] }; } }
    return null;
  }
  function isGarm(p) { return !!p.shape; }
  function itemSvg(p, opt) {
    if (isGarm(p)) { return C().render(p, opt && opt.pal != null ? opt.pal : (S.pal || 0)); }
    return render(p, opt || { yaw: p.cam || 0 });
  }

  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      S.lang = raw.lang === 'en' || raw.lang === 'ja' ? raw.lang : 'zh';
      S.fav = raw.fav || {};
    } catch (e) { }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ lang: S.lang, fav: S.fav })); } catch (e) { }
  }
  function nameOf(p) {
    var n = p[S.lang] || p.zh;
    if (!p.mirror) { return n; }
    return n + (S.lang === 'zh' ? '（镜像）' : S.lang === 'ja' ? '（反転）' : ' (mirror)');
  }
  function altOf(p) { return S.lang === 'zh' ? p.en : p.zh; }
  function catLabel(c) { return c[S.lang] || c.zh; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function filtered() {
    var src = curItems();
    var arr = src.filter(function (p) { return S.cat === 'all' || p.cat === S.cat; });
    var q = (S.q || '').trim();
    if (!q) { return arr; }
    if (window.Fuse) {
      if (!S.fuse || S.fuseTab !== S.tab) {
        S.fuse = new window.Fuse(src, { keys: ['zh', 'en', 'ja'], threshold: 0.4, ignoreLocation: true });
        S.fuseTab = S.tab;
      }
      var hit = {};
      S.fuse.search(q).forEach(function (r) { hit[r.item.id] = 1; });
      return arr.filter(function (p) { return hit[p.id]; });
    }
    var low = q.toLowerCase();
    return arr.filter(function (p) {
      return (p.zh + p.en + p.ja).toLowerCase().indexOf(low) >= 0;
    });
  }

  function cardHtml(p) {
    var on = S.sel[p.id] ? ' on' : '';
    return '<div class="pose-card' + on + '" data-card="' + p.id + '">' +
      '<button class="pose-open" data-open="' + p.id + '" aria-label="' + esc(nameOf(p)) + '">' +
        '<div class="pose-thumb">' + itemSvg(p) + '</div>' +
      '</button>' +
      (S.fav[p.id] ? '<span class="pose-star">★</span>' : '') +
      '<label class="pose-ck" title="选中"><input type="checkbox" data-sel="' + p.id + '"' + (S.sel[p.id] ? ' checked' : '') + '></label>' +
      '<div class="pose-meta">' +
        '<div class="pose-name">' + esc(nameOf(p)) + '</div>' +
        '<div class="pose-sub">' + esc(altOf(p)) + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderList() {
    S.stage = 'list';
    S.cur = null;
    var arr = filtered();
    var selCount = Object.keys(S.sel).length;
    app.innerHTML = '';
    app.appendChild(el(
      '<div class="pose-wrap">' +
        '<div class="pose-tools">' +
          '<input class="pose-search" id="poseSearch" type="search" autocomplete="off" placeholder="' + (isCostume() ? '搜衣装，例如 衬衫 / 裙 / coat' : '搜姿态，例如 坐 / 奔跑 / jumping') + '" value="' + esc(S.q) + '">' +
          '<div class="pose-lang" role="group" aria-label="语言">' +
            ['zh', 'en', 'ja'].map(function (k) {
              return '<button class="pose-lang-btn' + (S.lang === k ? ' on' : '') + '" data-lang="' + k + '">' +
                (k === 'zh' ? '中' : k === 'en' ? 'EN' : '日') + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="pose-tabs">' +
          '<button class="pose-tab' + (S.tab === 'pose' ? ' on' : '') + '" data-tab="pose">姿态 <i>' + ALL.length + '</i></button>' +
          '<button class="pose-tab' + (S.tab === 'costume' ? ' on' : '') + '" data-tab="costume">衣装 <i>' + C().ITEMS.length + '</i></button>' +
        '</div>' +
        '<div class="pose-chips">' +
          '<button class="pose-chip' + (S.cat === 'all' ? ' on' : '') + '" data-cat="all">全部 <i>' + curItems().length + '</i></button>' +
          curCats().map(function (c) {
            var n = curItems().filter(function (p) { return p.cat === c.id; }).length;
            return '<button class="pose-chip' + (S.cat === c.id ? ' on' : '') + '" data-cat="' + c.id + '">' +
              esc(catLabel(c)) + ' <i>' + n + '</i></button>';
          }).join('') +
        '</div>' +
        '<div class="pose-count" id="poseCount">' + arr.length + (isCostume()
          ? ' 套衣装 · 每套 5 种配色 · 平面裁剪线稿，可无限放大'
          : ' 组姿态 · 每组 5 个视角 · 线稿可无限放大') + '</div>' +
        '<div class="pose-grid' + (isCostume() ? ' pose-grid-garm' : '') + '" id="poseGrid">' +
          (arr.length ? arr.map(cardHtml).join('') : '<div class="pose-empty">没找到' + (isCostume() ? '这套衣装' : '这个姿态') + '，换个词试试</div>') +
        '</div>' +
        '<div class="pose-bar' + (selCount ? ' on' : '') + '" id="poseBar">' +
          '<span class="pose-bar-t">已选 <b>' + selCount + '</b> ' + (isCostume() ? '套' : '组') + '</span>' +
          '<button class="pose-mini" id="poseZip">打包 ZIP</button>' +
          '<button class="pose-mini" id="poseBoard">拼参考板</button>' +
          '<button class="pose-mini ghost" id="poseClear">清空</button>' +
        '</div>' +
        '<div class="pose-note">' + (isCostume()
          ? '衣装按平面裁剪画法生成（衣身 / 袖窿 / 侧缝 / 领型 / 裆弯），底下一层虚线是人体参照；每套 5 种配色，点开可下载 SVG / PNG、复制提示词。'
          : '线稿由本页实时生成的矢量人台渲染，不含任何第三方图片素材；每组都有 5 个视角，点开可看大图、下载 SVG / PNG、复制生图提示词。') + '</div>' +
      '</div>'
    ));
    bindList();
  }

  function bindList() {
    var input = document.getElementById('poseSearch');
    var timer = 0;
    input.oninput = function () {
      S.q = input.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var keep = S.q;
        renderList();
        var i2 = document.getElementById('poseSearch');
        if (i2) { i2.value = keep; i2.focus(); }
      }, 220);
    };
    Array.prototype.forEach.call(app.querySelectorAll('[data-tab]'), function (b) {
      b.onclick = function () {
        if (S.tab === b.dataset.tab) { return; }
        S.tab = b.dataset.tab;
        S.cat = 'all';
        S.q = '';
        S.fuse = null;
        renderList();
        var m0 = document.getElementById('appMain');
        if (m0) { m0.scrollTop = 0; }
      };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-lang]'), function (b) {
      b.onclick = function () { S.lang = b.dataset.lang; saveState(); renderList(); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-cat]'), function (b) {
      b.onclick = function () {
        S.cat = b.dataset.cat;
        renderList();
        var m = document.getElementById('appMain');
        if (m) { m.scrollTop = 0; }
      };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { openDetail(b.dataset.open); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-sel]'), function (cb) {
      cb.onchange = function () {
        if (cb.checked) { S.sel[cb.dataset.sel] = 1; } else { delete S.sel[cb.dataset.sel]; }
        var card = cb.closest('.pose-card');
        if (card) { card.classList.toggle('on', cb.checked); }
        var n = Object.keys(S.sel).length;
        var bar = document.getElementById('poseBar');
        if (bar) {
          bar.classList.toggle('on', !!n);
          var t = bar.querySelector('.pose-bar-t');
          if (t) { t.innerHTML = '已选 <b>' + n + '</b> ' + (isCostume() ? '套' : '组'); }
        }
      };
    });
    var zipBtn = document.getElementById('poseZip');
    if (zipBtn) { zipBtn.onclick = exportZip; }
    var boardBtn = document.getElementById('poseBoard');
    if (boardBtn) { boardBtn.onclick = exportBoard; }
    var clearBtn = document.getElementById('poseClear');
    if (clearBtn) {
      clearBtn.onclick = function () {
        S.sel = {};
        renderList();
      };
    }
  }

  function openDetail(id) {
    var it = findItem(id);
    if (!it) { return; }
    if (it.type === 'costume') { openGarm(it.d); return; }
    var p = it.d;
    S.stage = 'detail';
    S.cur = id;
    S.view = 0;
    var cat = PoseAtlas.catOf(p.cat);
    app.innerHTML = '';
    app.appendChild(el(
      '<div class="pose-wrap pose-wrap-detail">' +
        '<button class="pose-back" id="poseBack">← 返回列表</button>' +
        '<div class="pose-stage" id="poseStage">' + render(p, { yaw: VIEWS[S.view].yaw }) + '</div>' +
        '<div class="pose-views" id="poseViews">' +
          VIEWS.map(function (v, i) {
            return '<button class="pose-view' + (i === S.view ? ' on' : '') + '" data-view="' + i + '">' +
              render(p, { yaw: v.yaw, zoom: 0.62 }) + '<span>' + v.zh + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="pose-info">' +
          '<div class="pose-info-name">' + esc(nameOf(p)) + '</div>' +
          '<div class="pose-info-sub">' + esc(p.zh) + ' · ' + esc(p.en) + (S.lang === 'ja' ? '' : ' · ' + esc(p.ja)) + '</div>' +
          '<div class="pose-info-tags"><span>' + esc(catLabel(cat)) + '</span><span>5 视角</span><span>矢量线稿</span>' +
            (p.mirror ? '<span>镜像变体</span>' : '') + '</div>' +
        '</div>' +
        '<div class="pose-acts">' +
          '<button class="pose-btn primary" id="posePng">下载 PNG</button>' +
          '<button class="pose-btn" id="poseSvg">下载 SVG</button>' +
          '<button class="pose-btn" id="posePrompt">复制提示词</button>' +
          '<button class="pose-btn' + (S.fav[id] ? ' fav' : '') + '" id="poseFav">' + (S.fav[id] ? '★ 已收藏' : '☆ 收藏') + '</button>' +
        '</div>' +
        '<div class="pose-nav-row">' +
          '<button class="pose-mini ghost" id="posePrev">← 上一个</button>' +
          '<span class="pose-hint">键盘 ← → 换姿态 · 1-5 换视角</span>' +
          '<button class="pose-mini ghost" id="poseNext">下一个 →</button>' +
        '</div>' +
      '</div>'
    ));
    document.getElementById('poseBack').onclick = function () { renderList(); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-view]'), function (b) {
      b.onclick = function () {
        S.view = +b.dataset.view;
        document.getElementById('poseStage').innerHTML = render(p, { yaw: VIEWS[S.view].yaw });
        Array.prototype.forEach.call(app.querySelectorAll('.pose-view'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      };
    });
    document.getElementById('posePng').onclick = function () {
      svgToBlob(render(p, { yaw: VIEWS[S.view].yaw, paper: '#fdfaf3' }))
        .then(function (b) { saveBlob(b, 'pose-' + p.id + '-v' + (S.view + 1) + '.png'); toast('PNG 已开始下载'); })
        .catch(function (e) { toast(e.message); });
    };
    document.getElementById('poseSvg').onclick = function () {
      var svg = render(p, { yaw: VIEWS[S.view].yaw, paper: '#fdfaf3' })
        .replace('<svg ', '<svg width="900" height="900" ');
      saveBlob(new Blob([svg], { type: 'image/svg+xml' }), 'pose-' + p.id + '-v' + (S.view + 1) + '.svg');
      toast('SVG 已开始下载');
    };
    document.getElementById('posePrompt').onclick = function () {
      copyText(promptOf(p));
    };
    var favBtn = document.getElementById('poseFav');
    favBtn.onclick = function () {
      if (S.fav[id]) { delete S.fav[id]; } else { S.fav[id] = 1; }
      saveState();
      favBtn.classList.toggle('fav', !!S.fav[id]);
      favBtn.textContent = S.fav[id] ? '★ 已收藏' : '☆ 收藏';
    };
    document.getElementById('posePrev').onclick = function () { step(-1); };
    document.getElementById('poseNext').onclick = function () { step(1); };
    var m = document.getElementById('appMain');
    if (m) { m.scrollTop = 0; }
  }

  /* ---- 衣装详情：大图 + 5 配色 ---- */
  function garmPrompt(g) {
    return 'flat lay garment design, ' + String(g.en).toLowerCase() +
      ', front view, technical fashion line art, clean seams and panels, ' +
      'plain background, symmetrical, high detail, use as costume reference for character illustration';
  }

  function openGarm(g) {
    S.stage = 'detail';
    S.cur = g.id;
    S.pal = 0;
    var cat = null, cs = C().CATS;
    for (var i = 0; i < cs.length; i++) { if (cs[i].id === g.cat) { cat = cs[i]; } }
    var pals = C().PALS;
    app.innerHTML = '';
    app.appendChild(el(
      '<div class="pose-wrap pose-wrap-detail">' +
        '<button class="pose-back" id="poseBack">← 返回列表</button>' +
        '<div class="pose-stage pose-stage-garm" id="poseStage">' + C().render(g, S.pal, { noPaper: true }) + '</div>' +
        '<div class="pose-views" id="poseViews">' +
          pals.map(function (p, i) {
            return '<button class="pose-view' + (i === S.pal ? ' on' : '') + '" data-pal="' + i + '">' +
              C().render(g, i) + '<span>' + p.zh + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="pose-info">' +
          '<div class="pose-info-name">' + esc(nameOf(g)) + '</div>' +
          '<div class="pose-info-sub">' + esc(g.zh) + ' · ' + esc(g.en) + (S.lang === 'ja' ? '' : ' · ' + esc(g.ja)) + '</div>' +
          '<div class="pose-info-tags"><span>' + esc(catLabel(cat || { zh: '' })) + '</span><span>5 配色</span><span>平面裁剪</span><span>矢量线稿</span></div>' +
        '</div>' +
        '<div class="pose-acts">' +
          '<button class="pose-btn primary" id="posePng">下载 PNG</button>' +
          '<button class="pose-btn" id="poseSvg">下载 SVG</button>' +
          '<button class="pose-btn" id="posePrompt">复制提示词</button>' +
          '<button class="pose-btn' + (S.fav[g.id] ? ' fav' : '') + '" id="poseFav">' + (S.fav[g.id] ? '★ 已收藏' : '☆ 收藏') + '</button>' +
        '</div>' +
        '<div class="pose-nav-row">' +
          '<button class="pose-mini ghost" id="posePrev">← 上一个</button>' +
          '<span class="pose-hint">键盘 ← → 换衣装 · 1-5 换配色</span>' +
          '<button class="pose-mini ghost" id="poseNext">下一个 →</button>' +
        '</div>' +
      '</div>'
    ));
    document.getElementById('poseBack').onclick = function () { renderList(); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-pal]'), function (b) {
      b.onclick = function () {
        S.pal = +b.dataset.pal;
        document.getElementById('poseStage').innerHTML = C().render(g, S.pal, { noPaper: true });
        Array.prototype.forEach.call(app.querySelectorAll('.pose-view'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      };
    });
    document.getElementById('posePng').onclick = function () {
      svgToBlob(C().render(g, S.pal))
        .then(function (b) { saveBlob(b, 'costume-' + g.id + '-p' + (S.pal + 1) + '.png'); toast('PNG 已开始下载'); })
        .catch(function (e) { toast(e.message); });
    };
    document.getElementById('poseSvg').onclick = function () {
      var svg = C().render(g, S.pal).replace('<svg ', '<svg width="900" height="900" ');
      saveBlob(new Blob([svg], { type: 'image/svg+xml' }), 'costume-' + g.id + '-p' + (S.pal + 1) + '.svg');
      toast('SVG 已开始下载');
    };
    document.getElementById('posePrompt').onclick = function () { copyText(garmPrompt(g)); };
    var favBtn = document.getElementById('poseFav');
    favBtn.onclick = function () {
      if (S.fav[g.id]) { delete S.fav[g.id]; } else { S.fav[g.id] = 1; }
      saveState();
      favBtn.classList.toggle('fav', !!S.fav[g.id]);
      favBtn.textContent = S.fav[g.id] ? '★ 已收藏' : '☆ 收藏';
    };
    document.getElementById('posePrev').onclick = function () { step(-1); };
    document.getElementById('poseNext').onclick = function () { step(1); };
    var m = document.getElementById('appMain');
    if (m) { m.scrollTop = 0; }
  }

  function step(dir) {
    var arr = filtered();
    if (!arr.length) { return; }
    var i = 0;
    for (var k = 0; k < arr.length; k++) { if (arr[k].id === S.cur) { i = k; break; } }
    var next = (i + dir + arr.length) % arr.length;
    openDetail(arr[next].id);
  }

  function copyText(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('提示词已复制'); }
    catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  function exportZip() {
    var ids = Object.keys(S.sel);
    if (!ids.length) { return; }
    toast('正在生成 ZIP…');
    ensureLib('JSZip', 'assets/vendor/jszip.min.js').then(function (JSZip) {
      var zip = new JSZip();
      var nPose = 0, nGarm = 0;
      ids.forEach(function (id) {
        var it = findItem(id);
        if (!it) { return; }
        if (it.type === 'costume') {
          nGarm++;
          var pals = C().PALS;
          pals.forEach(function (pl, pi) {
            var svg = C().render(it.d, pi).replace('<svg ', '<svg width="900" height="900" ');
            zip.file('costume/' + it.d.id + '-p' + (pi + 1) + '-' + ('01234'.charAt(pi)) + '.svg', svg);
          });
          return;
        }
        nPose++;
        VIEWS.forEach(function (v, vi) {
          var svg = render(it.d, { yaw: v.yaw, paper: '#fdfaf3' }).replace('<svg ', '<svg width="900" height="900" ');
          zip.file('pose/' + it.d.id + '-v' + (vi + 1) + '-' + v.en.toLowerCase().replace(/[^a-z0-9]/g, '') + '.svg', svg);
        });
      });
      zip.file('README.txt', 'Pose Atlas 姿态 · 衣装图鉴（矢量线稿，可无损放大）\n' +
        '由 think-workbench 实时生成，不含第三方图片素材，可自由用于个人创作。\n' +
        '姿态：每组 5 个视角（front / 3-4 / side / back-3-4 / back），在 pose/ 目录。\n' +
        '衣装：每套 5 种配色（p1~p5），在 costume/ 目录。\n' +
        '本次导出：姿态 ' + nPose + ' 组，衣装 ' + nGarm + ' 套。\n');
      return zip.generateAsync({ type: 'blob' });
    }).then(function (blob) {
      saveBlob(blob, 'pose-atlas-' + ids.length + '.zip');
      toast('ZIP 已开始下载');
    }).catch(function (e) { toast(e.message); });
  }

  function exportBoard() {
    var ids = Object.keys(S.sel);
    if (!ids.length) { return; }
    toast('正在拼参考板…');
    ensureLib('html2canvas', 'assets/vendor/html2canvas.min.js').then(function (h2c) {
      var items = ids.map(function (id) { var it = findItem(id); return it ? it.d : null; }).filter(Boolean);
      var board = el('<div class="pose-board"><div class="pose-board-h">Pose Atlas · ' + items.length + ' 项参考</div>' +
        '<div class="pose-board-grid">' +
        items.map(function (p) {
          return '<div class="pose-board-cell">' + itemSvg(p, { yaw: 0 }) +
            '<div class="pose-board-n">' + esc(nameOf(p)) + '<i>' + esc(p.en) + '</i></div></div>';
        }).join('') + '</div>' +
        '<div class="pose-board-f">think-workbench · pose reference sheet</div></div>');
      board.style.position = 'fixed';
      board.style.left = '-99999px';
      board.style.top = '0';
      document.body.appendChild(board);
      return h2c(board, { backgroundColor: '#f6efe2', scale: 2, useCORS: true })
        .then(function (canvas) {
          canvas.toBlob(function (b) { saveBlob(b, 'pose-board-' + items.length + '.png'); toast('参考板已开始下载'); }, 'image/png');
        })
        .then(function () { board.remove(); });
    }).catch(function (e) { toast(e.message); });
  }

  function toast(msg) {
    var t = document.getElementById('poseToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'poseToast';
      t.className = 'pose-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  document.addEventListener('keydown', function (e) {
    if (!app || !app.offsetParent || S.stage !== 'detail') { return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') { return; }
    if (e.key === 'ArrowLeft') { step(-1); }
    else if (e.key === 'ArrowRight') { step(1); }
    else if (e.key >= '1' && e.key <= '5') {
      var b = app.querySelector('[' + (isCostume() ? 'data-pal' : 'data-view') + '="' + (+e.key - 1) + '"]');
      if (b) { b.click(); }
    }
  });

  window.PoseAtlas = {
    CATS: CATS,
    POSES: ALL,
    render: render,
    promptOf: promptOf,
    catOf: function (id) {
      for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === id) { return CATS[i]; } }
      return null;
    },
    list: function () { return filtered(); }
  };

  window.__poseView = function () {
    app = document.getElementById('poseApp');
    if (!app) { return; }
    if (!booted) {
      booted = true;
      loadState();
      ensureLib('fuse.js', 'assets/vendor/fuse.min.js').catch(function () { });
    }
    if (S.stage === 'detail' && S.cur) {
      openDetail(S.cur);
    } else {
      renderList();
    }
  };
})();
