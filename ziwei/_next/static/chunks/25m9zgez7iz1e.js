(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,57229,e=>{"use strict";var t=e.i(43476),a=e.i(71645),r=e.i(53163),n=e.i(46932),l=e.i(88653),i=e.i(29016);let s=function(){for(var e,t,a=0,r="",n=arguments.length;a<n;a++)(e=arguments[a])&&(t=function e(t){var a,r,n="";if("string"==typeof t||"number"==typeof t)n+=t;else if("object"==typeof t)if(Array.isArray(t)){var l=t.length;for(a=0;a<l;a++)t[a]&&(r=e(t[a]))&&(n&&(n+=" "),n+=r)}else for(r in t)t[r]&&(n&&(n+=" "),n+=r);return n}(e))&&(r&&(r+=" "),r+=t);return r},o={禄:"text-emerald-400 bg-emerald-500/10 border-emerald-500/30",权:"text-blue-400 bg-blue-500/10 border-blue-500/30",科:"text-yellow-400 bg-yellow-500/10 border-yellow-500/30",忌:"text-red-400 bg-red-500/10 border-red-500/30"},c=({siHua:e,overlay:a,label:r,onClick:n})=>(0,t.jsxs)("span",{className:s("inline-flex items-center text-[8px] px-1 rounded-full border leading-none py-px font-bold ml-1 flex-shrink-0",o[e],a&&"border-dashed opacity-80",n&&"cursor-pointer hover:opacity-100"),onClick:n,children:[a&&r&&(0,t.jsx)("span",{className:"mr-px opacity-70",children:r}),e]});function d({palace:e,onClick:a,onStarClick:r,isSelected:l,isSanFang:o,delay:x=0,overlayStarSiHua:p,overlayLabel:u,onSiHuaClick:m}){let{branch:f,stem:h,name:g,stars:y,daXianAge:b,isCurrentDaXian:v,isMingGong:j,isShenGong:N}=e,k=`${i.p[h]}${i.F[f]}`,w=y.filter(e=>"major"===e.type),$=y.filter(e=>"lucky"===e.type),H=y.filter(e=>"sha"===e.type),C=y.filter(e=>"minor"===e.type);return(0,t.jsxs)(n.f.div,{initial:{opacity:0,scale:.92},animate:{opacity:1,scale:1},transition:{duration:.35,delay:x,ease:"easeOut"},onClick:a,className:"relative flex flex-col p-1.5 cursor-pointer transition-all duration-200 h-full",style:{minHeight:"90px",background:v?"rgba(147,51,234,0.08)":l?"rgba(37,99,235,0.18)":o?"rgba(37,99,235,0.09)":j?"rgba(212,168,67,0.04)":"var(--t-bg)",boxShadow:v?"inset 3px 0 0 rgba(147,51,234,0.5)":l?"inset 0 0 0 1.5px rgba(37,99,235,0.7)":o?"inset 0 0 0 1px rgba(37,99,235,0.4)":"none"},children:[b&&(0,t.jsxs)("div",{className:s("absolute top-1 right-1 text-[9px] font-mono tabular-nums",v?"text-purple-400":""),style:v?void 0:{color:"var(--t-faint)",opacity:.75},children:[b[0],"–",b[1]]}),(0,t.jsxs)("div",{className:"flex items-center gap-1 mb-0.5 pr-8",children:[(0,t.jsx)("span",{className:s("text-[10px] font-medium tracking-wide",j?"text-amber-500":N?"text-sky-500":""),style:j||N?void 0:{color:"var(--t-faint)"},children:g}),j&&(0,t.jsx)("span",{className:"text-[7px] text-amber-500/80 border border-amber-500/30 px-0.5 rounded leading-tight",children:"命"}),N&&(0,t.jsx)("span",{className:"text-[7px] text-sky-500/80 border border-sky-500/30 px-0.5 rounded leading-tight",children:"身"})]}),(0,t.jsx)("div",{className:"text-[9px] font-mono mb-1",style:{color:"var(--t-faint)",opacity:.75},children:k}),(0,t.jsxs)("div",{className:"flex flex-col gap-0.5 flex-1",children:[0===w.length&&(0,t.jsx)("span",{className:"text-[10px] italic",style:{color:"var(--t-faint)",opacity:.6},children:"空宫"}),w.map(e=>{let a=p?.[e.name];return(0,t.jsxs)("div",{className:"flex items-center",onClick:t=>{t.stopPropagation(),r?.(e)},children:[(0,t.jsx)("span",{className:s("text-[13px] leading-tight font-bold tracking-tight cursor-pointer hover:brightness-125 transition-all","bright"===e.brightness?"text-amber-300":"dim"===e.brightness?"text-amber-700/80":"text-amber-500"),children:e.name}),e.siHua&&(0,t.jsx)(c,{siHua:e.siHua}),a&&(0,t.jsx)(c,{siHua:a,overlay:!0,label:u,onClick:t=>{t.stopPropagation(),m?.(e.name,a)}})]},e.name)})]}),$.length>0&&(0,t.jsx)("div",{className:"flex flex-wrap gap-x-1 mt-0.5",children:$.map(e=>{let a=p?.[e.name];return(0,t.jsxs)("span",{className:"inline-flex items-center text-[9px] text-sky-500/70 leading-tight",children:[e.name,e.siHua&&(0,t.jsx)(c,{siHua:e.siHua}),a&&(0,t.jsx)(c,{siHua:a,overlay:!0,label:u,onClick:t=>{t.stopPropagation(),m?.(e.name,a)}})]},e.name)})}),H.length>0&&(0,t.jsx)("div",{className:"flex flex-wrap gap-x-1",children:H.map(e=>(0,t.jsxs)("span",{className:"text-[9px] text-red-500/60 leading-tight",children:[e.name,e.siHua&&(0,t.jsx)(c,{siHua:e.siHua})]},e.name))}),C.length>0&&(0,t.jsx)("div",{className:"flex flex-wrap gap-x-1",children:C.map(e=>(0,t.jsxs)("span",{className:"text-[9px] leading-tight",style:{color:"var(--t-faint)",opacity:.75},children:[e.name,e.brightnessRaw?`[${e.brightnessRaw}]`:"",e.siHua&&(0,t.jsx)(c,{siHua:e.siHua})]},e.name))})]})}function x(e){return((e-4)%10+10)%10}function p(e){let t=i.a[e];return t?{[t[0]]:"禄",[t[1]]:"权",[t[2]]:"科",[t[3]]:"忌"}:{}}let u={禄:"#4ade80",权:"#60a5fa",科:"#facc15",忌:"#f87171"};function m({chart:e,view:a,liunianYear:r,onViewChange:l,onYearChange:s}){let o=e.daXians[e.currentDaXianIndex],c=(()=>{if("mingpan"===a)return null;if("daxian"===a&&o){let t=e.palaces.find(e=>e.branch===o.palaceBranch);if(!t)return null;let a=t.stem;return{stemName:i.p[a],overlay:p(a)}}if("liunian"===a){let e=x(r);return{stemName:i.p[e],overlay:p(e)}}return null})();return(0,t.jsxs)("div",{className:"mb-3",children:[(0,t.jsxs)("div",{className:"flex items-center rounded-xl p-1 gap-1",style:{background:"var(--t-surface)",border:"1px solid var(--t-border)"},children:[(0,t.jsx)(f,{active:"mingpan"===a,onClick:()=>l("mingpan"),children:"本命"}),(0,t.jsx)(f,{active:"daxian"===a,onClick:()=>l("daxian"),children:o?`大限 ${o.startAge}–${o.endAge}`:"大限"}),(0,t.jsxs)("div",{className:"relative flex-1 flex items-center justify-center rounded-lg py-1.5 gap-1 transition-all duration-200",style:{background:"liunian"===a?"rgba(212,168,67,0.12)":"transparent",border:"liunian"===a?"1px solid rgba(212,168,67,0.25)":"1px solid transparent"},children:[(0,t.jsx)("button",{onClick:()=>l("liunian"),className:"text-[10px] font-medium flex-1 text-center",style:{color:"liunian"===a?"var(--t-gold)":"var(--t-faint)"},children:"流年"}),(0,t.jsxs)("div",{className:"flex items-center gap-0.5",children:[(0,t.jsx)("button",{onClick:e=>{e.stopPropagation(),s(r-1),"liunian"!==a&&l("liunian")},className:"text-[9px] w-4 h-4 flex items-center justify-center rounded",style:{color:"var(--t-faint)"},children:"‹"}),(0,t.jsx)("span",{className:"text-[10px] font-mono min-w-[28px] text-center cursor-pointer",style:{color:"liunian"===a?"var(--t-gold)":"var(--t-faint)"},onClick:()=>l("liunian"),children:r}),(0,t.jsx)("button",{onClick:e=>{e.stopPropagation(),s(r+1),"liunian"!==a&&l("liunian")},className:"text-[9px] w-4 h-4 flex items-center justify-center rounded",style:{color:"var(--t-faint)"},children:"›"})]})]})]}),c&&(0,t.jsxs)(n.f.div,{initial:{opacity:0,y:-4},animate:{opacity:1,y:0},transition:{duration:.2},className:"flex items-center gap-2 mt-1.5 px-1 flex-wrap",children:[(0,t.jsxs)("span",{className:"text-[9px]",style:{color:"var(--t-faint)"},children:["daxian"===a?"大限":`${r}`,"·",c.stemName,"年四化："]}),["禄","权","科","忌"].map(e=>{let a=Object.keys(c.overlay).find(t=>c.overlay[t]===e);return a?(0,t.jsxs)("span",{className:"text-[9px] font-medium",style:{color:u[e]},children:[a,"化",e]},e):null})]})]})}function f({active:e,onClick:a,children:r}){return(0,t.jsx)("button",{onClick:a,className:"flex-1 py-1.5 text-[10px] font-medium rounded-lg transition-all duration-200",style:{background:e?"rgba(212,168,67,0.12)":"transparent",color:e?"var(--t-gold)":"var(--t-faint)",border:e?"1px solid rgba(212,168,67,0.25)":"1px solid transparent"},children:r})}let h={5:[1,1],6:[1,2],7:[1,3],8:[1,4],4:[2,1],9:[2,4],3:[3,1],10:[3,4],2:[4,1],1:[4,2],0:[4,3],11:[4,4]},g={5:[12.5,12.5],6:[37.5,12.5],7:[62.5,12.5],8:[87.5,12.5],4:[12.5,37.5],9:[87.5,37.5],3:[12.5,62.5],10:[87.5,62.5],2:[12.5,87.5],1:[37.5,87.5],0:[62.5,87.5],11:[87.5,87.5]},y=[5,6,7,8,9,10,11,0,1,2,3,4];function b({chart:e,onStarSelect:r,onPalaceSelect:s,onSiHuaClick:o}){let c,u,f,v,j,N,[k,w]=(0,a.useState)(null),[$,H]=(0,a.useState)("mingpan"),[C,S]=(0,a.useState)(new Date().getFullYear()),D={};e.palaces.forEach(e=>{D[e.branch]=e});let R=e.daXians[e.currentDaXianIndex],E=(()=>{if("daxian"===$&&R){let t=e.palaces.find(e=>e.branch===R.palaceBranch);if(t)return p(t.stem)}return"liunian"===$?p(x(C)):{}})(),I="daxian"===$?"限":"liunian"===$?"年":void 0,T=null!==k?[k,(k+6)%12,(k+4)%12,(k+8)%12]:null,A=T?new Set(T):null;return(0,t.jsxs)("div",{className:"w-full select-none",children:[(0,t.jsx)(m,{chart:e,view:$,liunianYear:C,onViewChange:H,onYearChange:S}),(0,t.jsxs)(n.f.div,{initial:{opacity:0,y:-8},animate:{opacity:1,y:0},className:"text-center mb-3",children:[(0,t.jsx)("div",{className:"text-[10px] tracking-[0.5em] uppercase mb-1",style:{color:"var(--t-faint)"},children:"Zi Wei Dou Shu"}),(0,t.jsxs)("h2",{className:"text-sm tracking-[0.25em] font-medium",style:{color:"var(--t-gold)"},children:[e.birthInfo.name?`${e.birthInfo.name} \xb7 `:"","紫微斗数命盘"]})]}),(0,t.jsxs)("div",{className:"grid rounded-xl overflow-hidden relative",style:{gridTemplateColumns:"repeat(4, 1fr)",gridTemplateRows:"repeat(4, auto)",gap:"1px",background:"var(--t-border)",border:"1px solid var(--t-border)",boxShadow:"0 4px 32px rgba(0,0,0,0.15)"},children:[y.map((e,a)=>{let[n,l]=h[e],i=D[e];return i?(0,t.jsx)("div",{style:{gridRow:n,gridColumn:l,background:"var(--t-bg)"},children:(0,t.jsx)(d,{palace:i,onClick:()=>(e=>{if(w(t=>t===e?null:e),k!==e){let t=D[e];t&&s?.(t)}})(e),onStarClick:e=>r?.(e,i),isSelected:k===e,isSanFang:!!(A?.has(e)&&k!==e),delay:.04*a,overlayStarSiHua:Object.keys(E).length>0?E:void 0,overlayLabel:I,onSiHuaClick:(e,t)=>o?.(e,t,$)})},e):null}),(0,t.jsxs)(n.f.div,{initial:{opacity:0,scale:.95},animate:{opacity:1,scale:1},transition:{delay:.5},className:"flex flex-col items-center justify-center p-4 gap-3",style:{gridRow:"2 / 4",gridColumn:"2 / 4",background:"var(--t-bg)"},children:[(0,t.jsx)("div",{className:"text-5xl select-none leading-none",style:{color:"var(--t-gold)",opacity:.12,filter:"drop-shadow(0 0 12px rgba(180,120,30,0.15))"},children:"☯"}),(0,t.jsxs)("div",{className:"text-center space-y-1",children:[(0,t.jsx)("div",{className:"text-[9px] tracking-[0.3em] font-medium",style:{color:"var(--t-gold)"},children:"紫微斗数"}),(0,t.jsxs)("div",{className:"text-[10px] space-y-0.5",style:{color:"var(--t-faint)"},children:[(0,t.jsxs)("div",{children:["命宫 ",(0,t.jsx)("span",{style:{color:"var(--t-gold)",opacity:.7},children:i.F[e.mingGongBranch]})]}),(0,t.jsxs)("div",{children:["身宫 ",(0,t.jsx)("span",{className:"text-sky-500/70",children:i.F[e.shenGongBranch]})]}),(0,t.jsx)("div",{className:"text-[9px]",style:{color:"var(--t-gold)",opacity:.75},children:e.wuxingJuName})]})]}),e.currentDaXianIndex>=0&&(c=e.daXians[e.currentDaXianIndex],(0,t.jsxs)("div",{className:"border border-purple-500/30 rounded-lg px-3 py-1.5 text-center",style:{background:"rgba(147,51,234,0.06)"},children:[(0,t.jsx)("div",{className:"text-[8px] text-purple-500/80 mb-0.5 tracking-wider",children:"当前大限"}),(0,t.jsxs)("div",{className:"text-[12px] text-purple-400 font-medium tabular-nums",children:[c.startAge,"–",c.endAge,"岁"]}),(0,t.jsx)("div",{className:"text-[9px] text-purple-500/60",children:c.palaceName})]})),(0,t.jsxs)("div",{className:"text-[8px] text-center leading-relaxed font-mono",style:{color:"var(--t-faint)",opacity:.75},children:[e.lunarInfo.lunarYear,"·",e.lunarInfo.isLeapMonth?"闰":"",e.lunarInfo.lunarMonth,"·",e.lunarInfo.lunarDay]})]}),(0,t.jsx)(l.f,{children:null!==T&&(0,t.jsx)(n.f.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:.3},className:"pointer-events-none",style:{position:"absolute",inset:0,zIndex:20},children:(0,t.jsx)("svg",{width:"100%",height:"100%",xmlns:"http://www.w3.org/2000/svg",style:{display:"block"},children:(u=g[T[0]],f=g[T[1]],v=g[T[2]],j=g[T[3]],N="rgba(37,99,235,0.55)",(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("line",{x1:`${u[0]}%`,y1:`${u[1]}%`,x2:`${f[0]}%`,y2:`${f[1]}%`,stroke:N,strokeWidth:"1.5",strokeDasharray:"6,5",strokeLinecap:"round"}),(0,t.jsx)("line",{x1:`${u[0]}%`,y1:`${u[1]}%`,x2:`${v[0]}%`,y2:`${v[1]}%`,stroke:N,strokeWidth:"1.5",strokeDasharray:"6,5",strokeLinecap:"round"}),(0,t.jsx)("line",{x1:`${v[0]}%`,y1:`${v[1]}%`,x2:`${j[0]}%`,y2:`${j[1]}%`,stroke:N,strokeWidth:"1.5",strokeDasharray:"6,5",strokeLinecap:"round"}),(0,t.jsx)("line",{x1:`${j[0]}%`,y1:`${j[1]}%`,x2:`${u[0]}%`,y2:`${u[1]}%`,stroke:N,strokeWidth:"1.5",strokeDasharray:"6,5",strokeLinecap:"round"}),[u,f,v,j].map((e,a)=>(0,t.jsx)("circle",{cx:`${e[0]}%`,cy:`${e[1]}%`,r:"3",fill:0===a?"rgba(37,99,235,0.8)":"rgba(37,99,235,0.45)"},a))]}))})},`sf-${k}`)})]}),(0,t.jsxs)(n.f.div,{initial:{opacity:0},animate:{opacity:1},transition:{delay:.7},className:"mt-3 flex items-center justify-center gap-2 text-[9px] flex-wrap",children:[[{h:"化禄",c:"text-emerald-500 border-emerald-500/30"},{h:"化权",c:"text-blue-500 border-blue-500/30"},{h:"化科",c:"text-yellow-500 border-yellow-500/30"},{h:"化忌",c:"text-red-500 border-red-500/30"}].map(({h:e,c:a})=>(0,t.jsx)("span",{className:`border px-1.5 py-0.5 rounded-full font-medium ${a}`,children:e},e)),(0,t.jsx)("span",{className:"px-1.5 py-0.5 rounded-full",style:{color:"var(--t-faint)",border:"1px solid var(--t-border)"},children:"点击宫位看三方四正"})]})]})}let v=[{key:"overview",label:"命格"},{key:"love",label:"感情"},{key:"career",label:"事业"},{key:"wealth",label:"财运"},{key:"health",label:"健康"},{key:"personality",label:"性格"}],j={overview:`请生成命格总览，按以下结构输出：

**【命格定性】**
用一句话概括这个命盘的核心格局与命主气质。

**【主星解读】**
命宫主星的核心特质，引用倪海厦原话或观点。

**【三方四正】**
财、官、迁三宫的联动分析及整体格局。

**【当前大限】**
当下大限运势方向与最值得关注的事项。

**【优势与注意】**
命盘天赋优势，以及需要注意的风险或功课。`,love:`请深度分析感情婚姻运，按以下结构输出：

**【感情格局】**
一句话定性感情命格。

**【夫妻宫分析】**
夫妻宫主星、四化，以及倪海厦体系的具体解读。

**【三方联动】**
相关宫位对感情的影响。

**【当前大限感情运】**
当下10年感情走向与关键节点。

**【实际建议】**
具体可行的感情建议。`,career:`请深度分析事业运，按以下结构输出：

**【事业格局】**
一句话定性事业命格，宜任职或宜创业。

**【官禄宫分析】**
官禄宫主星、四化，以及倪师对这种配置的判断。

**【财帛宫联动】**
财运与事业的关系，财路来源分析。

**【当前大限事业运】**
当下10年事业走向。

**【实际建议】**
适合的方向、行业与策略。`,wealth:`请深度分析财运，按以下结构输出：

**【财运格局】**
一句话定性财运模式，是主动财还是被动财。

**【财帛宫分析】**
财帛宫主星、四化，财富来源与流动模式。

**【田宅宫（财库）】**
积蓄能力与不动产运势分析。

**【当前大限财运】**
当下财运走向与注意事项。

**【理财建议】**
具体的财务建议。`,health:`请分析健康运势，按以下结构输出：

**【疾厄宫主星】**
疾厄宫星曜与健康含义。

**【主要风险】**
结合倪海厦子午流注理论，分析主要健康隐患与需关注的部位。

**【大限健康走势】**
当下健康趋势与关键时间段。

**【预防建议】**
具体注意事项与养生方向。`,personality:`请深度解析性格特质，按以下结构输出：

**【命宫主星性格】**
命宫主星的核心性格特质，引用倪师原话。

**【三方性格综合】**
财、官、迁三宫对性格的影响，全貌描绘。

**【人际关系模式】**
与他人互动方式、待人处世风格。

**【优势与人生课题】**
天赋优势，以及需要面对的人生功课。`},N={命宫:"自我、性格、先天格局",兄弟宫:"兄弟关系、合伙人",夫妻宫:"感情关系、婚姻状态",子女宫:"子女缘分、下属关系",财帛宫:"财运来源、收入方式",疾厄宫:"身体健康、意外",迁移宫:"外出机遇、人际格局",交友宫:"朋友圈、贵人、小人",官禄宫:"事业成就、社会地位",田宅宫:"不动产、家庭环境",福德宫:"精神享受、内心福分",父母宫:"父母关系、文书契约"};function k({text:e,streaming:a}){let r=e.split("\n");return(0,t.jsxs)("div",{className:"space-y-0.5",children:[r.map((e,a)=>{let r=e.match(/^\*\*【(.+?)】\*\*$/);if(r)return(0,t.jsx)("div",{className:"pt-3 pb-0.5 first:pt-0",children:(0,t.jsxs)("span",{className:"text-[11px] font-semibold tracking-wide",style:{color:"var(--t-gold)"},children:["【",r[1],"】"]})},a);if(""===e.trim())return(0,t.jsx)("div",{className:"h-1"},a);let n=e.split(/\*\*(.+?)\*\*/);return(0,t.jsx)("div",{className:"text-[11px] leading-relaxed",style:{color:"var(--t-text2)"},children:n.map((e,a)=>a%2==0?e:(0,t.jsx)("strong",{className:"font-medium",style:{color:"var(--t-text)"},children:e},a))},a)}),a&&(0,t.jsx)("span",{className:"inline-block w-1.5 h-3 ml-0.5 animate-pulse rounded-sm align-middle",style:{background:"var(--t-gold)",opacity:.6}})]})}function w({chart:e,selectedPalace:r,selectedSiHua:i}){let[s,o]=(0,a.useState)([]),[c,d]=(0,a.useState)(""),[x,p]=(0,a.useState)(!1),[u,m]=(0,a.useState)("overview"),f=(0,a.useRef)([]),h=(0,a.useRef)(!1),g=(0,a.useRef)(!1),y=(0,a.useRef)(void 0),b=(0,a.useRef)(void 0),$=(0,a.useRef)(null);(0,a.useEffect)(()=>{f.current=s},[s]),(0,a.useEffect)(()=>{h.current=x},[x]),(0,a.useEffect)(()=>{$.current&&($.current.scrollTop=$.current.scrollHeight)},[s]),(0,a.useEffect)(()=>{g.current||(g.current=!0,C(j.overview,!0))},[]),(0,a.useEffect)(()=>{if(!r||r.branch===y.current)return;y.current=r.branch;let e=r.stars.filter(e=>"major"===e.type),t=e.length>0?e.map(e=>`${e.name}${e.siHua?"化"+e.siHua:""}`).join("、"):"空宫（借对宫）",a=N[r.name]??"";C(`请重点分析【${r.name}】（主管：${a}），该宫主星为${t}，按以下结构输出：

**【宫位定性】**
${r.name}在命盘中的意义，以及这种星曜配置的整体判断。

**【主星解读】**
主星在此宫的倪海厦体系解读，引用具体观点。

**【三方四正联动】**
三方四正宫位对此宫的影响。

**【实际建议】**
基于此宫的具体建议。`,!0)},[r]),(0,a.useEffect)(()=>{if(!i)return;let t=`${i.starName}-${i.siHua}-${i.view}`;if(t===b.current)return;b.current=t;let a=e.palaces.find(e=>e.stars.some(e=>e.name===i.starName)),r=a?.name??"未知宫位",n="daxian"===i.view?"大限":"流年";C(`请分析【${n}${i.starName}化${i.siHua}】的飞化影响，按以下结构输出：

**【化${i.siHua}基本含义】**
化${i.siHua}在倪海厦体系中的核心含义，以及${i.starName}化${i.siHua}的特殊含义。

**【落宫影响】**
${i.starName}化${i.siHua}落在【${r}】，该宫主管的领域受到何种影响，倪师如何解读。

**【三方四正飞化路径】**
化${i.siHua}入${r}后，对其三方四正（对宫、两个三合宫）的联动影响。

**【当前运势影响】**
在${n}时间维度下，此化${i.siHua}对命主近期运势的具体影响。

**【实际建议】**
基于此四化的具体可操作建议。`,!0)},[i]);let H=async t=>{try{let a=await fetch("/api/interpret",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chart:e,messages:t})});if(404===a.status)throw Error("api-missing");if(!a.ok)throw Error("请求失败");if(!a.body)throw Error("无响应流");let r=a.body.getReader(),n=new TextDecoder,l="";for(o(e=>[...e,{role:"assistant",content:""}]);;){let{done:e,value:t}=await r.read();if(e)break;for(let e of n.decode(t,{stream:!0}).split("\n")){if(!e.startsWith("data: "))continue;let t=e.slice(6);if("[DONE]"===t)break;try{let e=JSON.parse(t).delta?.text??"";l+=e,o(e=>{let t=[...e];return t[t.length-1]={role:"assistant",content:l},t})}catch{}}}}catch(t){let e=t instanceof Error&&"api-missing"===t.message;o(t=>[...t,{role:"assistant",content:e?"开源版不含 AI 解读接口（/api/interpret），需要你自己实现后才能用，详见 README「快速开始」。排盘本身不需要任何 API Key。":"解读失败，请稍后重试。"}])}finally{p(!1),h.current=!1}},C=(e,t=!1)=>{if(!e.trim()||h.current)return;h.current=!0,p(!0);let a={role:"user",content:e,hidden:t},r=[...f.current,a].map(e=>({role:e.role,content:e.content}));o(e=>[...e,a]),d(""),H(r)},S=()=>{C(c)};return(0,t.jsxs)("div",{className:"flex flex-col h-[min(44rem,80dvh)] min-h-0 min-w-0 rounded-xl overflow-hidden card-glass",children:[(0,t.jsx)("div",{className:"flex-shrink-0 px-2 pt-2.5 pb-2",style:{borderBottom:"1px solid var(--t-border)"},children:(0,t.jsx)("div",{className:"grid grid-cols-6 gap-1",children:v.map(e=>{let a=u===e.key;return(0,t.jsx)("button",{onClick:()=>{var t;return t=e.key,void(!h.current&&(m(t),C(j[t],!0)))},disabled:x,className:"py-1.5 text-[10px] font-medium rounded-lg transition-all duration-150 disabled:opacity-40",style:{background:a?"rgba(212,168,67,0.12)":"transparent",border:`1px solid ${a?"rgba(212,168,67,0.3)":"var(--t-border)"}`,color:a?"var(--t-gold)":"var(--t-faint)"},children:e.label},e.key)})})}),(0,t.jsxs)("div",{ref:$,className:"flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0",children:[0===s.length&&(0,t.jsxs)("div",{className:"flex flex-col items-center justify-center h-full text-center",children:[(0,t.jsx)("div",{className:"text-4xl mb-3",style:{color:"var(--t-gold)",opacity:.1},children:"✦"}),(0,t.jsx)("p",{className:"text-[10px] animate-pulse",style:{color:"var(--t-faint)"},children:"命格解读生成中…"})]}),(0,t.jsx)(l.f,{initial:!1,children:s.map((e,a)=>{if("user"===e.role&&e.hidden)return null;if("user"===e.role)return(0,t.jsx)(n.f.div,{initial:{opacity:0,y:6},animate:{opacity:1,y:0},className:"flex justify-end",children:(0,t.jsx)("div",{className:"max-w-[85%] rounded-xl px-3 py-2 text-[11px]",style:{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.18)",color:"var(--t-gold)"},children:e.content})},a);let r=a===s.length-1;return(0,t.jsxs)(n.f.div,{initial:{opacity:0,y:6},animate:{opacity:1,y:0},children:[(0,t.jsxs)("div",{className:"text-[9px] tracking-widest mb-2 flex items-center gap-1.5",style:{color:"var(--t-faint)"},children:[(0,t.jsx)("span",{style:{color:"var(--t-gold)",opacity:.4},children:"✦"}),"命理解读"]}),(0,t.jsx)(k,{text:e.content,streaming:x&&r})]},a)})})]}),(0,t.jsx)("div",{className:"flex-shrink-0 px-3 pb-3 pt-2",style:{borderTop:"1px solid var(--t-border)"},children:(0,t.jsxs)("div",{className:"flex gap-2",children:[(0,t.jsx)("input",{type:"text",value:c,onChange:e=>d(e.target.value),onKeyDown:e=>"Enter"===e.key&&!e.shiftKey&&S(),placeholder:"继续追问，如：今年适合换工作吗？",disabled:x,className:"flex-1 rounded-lg px-3 py-2 text-[11px] focus:outline-none transition-colors",style:{background:"var(--t-card)",border:"1px solid var(--t-border)",color:"var(--t-text)"}}),(0,t.jsx)("button",{onClick:S,disabled:x||!c.trim(),className:"px-3 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed",style:{background:"rgba(212,168,67,0.15)",border:"1px solid rgba(212,168,67,0.25)",color:"var(--t-gold)"},children:x?"…":"追问"})]})})]})}var $=e.i(53632);e.s(["default",0,function(){let[e,n]=(0,a.useState)(null),[l,i]=(0,a.useState)(null);return e?(0,t.jsxs)("main",{style:{maxWidth:1280,margin:"0 auto",padding:"24px 16px"},children:[(0,t.jsx)("button",{type:"button",onClick:()=>{n(null),i(null)},style:{marginBottom:16,padding:"6px 14px",cursor:"pointer",border:"1px solid #ccc",borderRadius:8,background:"transparent"},children:"← 重新起盘"}),(0,t.jsxs)("div",{className:"grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]",style:{gap:20,marginTop:16,alignItems:"start"},children:[(0,t.jsx)(b,{chart:e,onPalaceSelect:i}),(0,t.jsx)(w,{chart:e,selectedPalace:l})]})]}):(0,t.jsxs)("main",{style:{maxWidth:720,margin:"0 auto",padding:"48px 20px"},children:[(0,t.jsx)("h1",{style:{fontSize:28,fontWeight:700,marginBottom:8},children:"紫微斗数排盘"}),(0,t.jsxs)("p",{style:{color:"#888",marginBottom:32,fontSize:14,lineHeight:1.7},children:["输入出生年月日时，开源排盘引擎即时生成命盘。",(0,t.jsx)("br",{}),"（本页为引擎 Demo，完整商业版界面不在开源范围；排盘内核完全开放。）"]}),(0,t.jsx)(r.f,{onSubmit:e=>n((0,$.f)(e))})]})}],57229)}]);