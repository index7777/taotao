/* ============================================================
   前台 POS 邏輯
   ============================================================ */
const DB = window.MikuDB;
const CFG = window.MIKU_POS_CONFIG;
let CATS=[], MENU=[], TABLES=[], ORDERS=[], WAIT=[], DISCOUNTS=[];
let curCat=null;
let wParty=2;
let ctx = { mode:"dine", table_id:null, order_id:null, draft:[] };  // 當前點餐情境
const twDateC = ()=> new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});

const pill=U.$("#modePill");
pill.textContent = window.MIKU_LIVE ? "線上模式" : "示範模式";
pill.className = "pill " + (window.MIKU_LIVE?"live":"demo");

/* ---------- 語音 / 提示音 ---------- */
let VOICE=false, _ac=null, _firstLoad=true;
const seenOrders=new Set();
const seenReq=new Set();
function beep(){ try{ _ac=_ac||new (window.AudioContext||window.webkitAudioContext)(); const o=_ac.createOscillator(),g=_ac.createGain(); o.connect(g); g.connect(_ac.destination); o.type="sine"; o.frequency.value=880; g.gain.value=0.08; o.start(); o.stop(_ac.currentTime+0.18);}catch(_){} }
function speakNow(text){ try{ beep(); const u=new SpeechSynthesisUtterance(text); u.lang="zh-TW"; u.rate=1; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch(_){} }
function speak(text){ if(VOICE) speakNow(text); }
function successChime(){ try{ _ac=_ac||new (window.AudioContext||window.webkitAudioContext)(); const t0=_ac.currentTime; [[784,0],[1046,0.10],[1318,0.20]].forEach(([f,dt])=>{ const o=_ac.createOscillator(),g=_ac.createGain(); o.connect(g); g.connect(_ac.destination); o.type="sine"; o.frequency.value=f; g.gain.setValueAtTime(0.0001,t0+dt); g.gain.exponentialRampToValueAtTime(0.15,t0+dt+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+dt+0.22); o.start(t0+dt); o.stop(t0+dt+0.24); }); }catch(_){} }
U.$("#voiceBtn").onclick=()=>{
  VOICE=!VOICE;
  const b=U.$("#voiceBtn");
  b.textContent = VOICE?"🔊 通知語音：開":"🔊 通知語音：關";
  b.style.background = VOICE? "var(--ok)" : "rgba(255,255,255,.16)";
  if(VOICE){ try{ speechSynthesis.resume(); }catch(_){} speakNow("通知語音已開啟"); }
};
function tLabel(id){ return (TABLES.find(t=>t.id===id)||{}).label||""; }
function owhere(o){ return o.mode==="take" ? `外帶 ${o.number} 號` : `第 ${tLabel(o.table_id)} 桌`; }
function detectNewOrders(){
  const first=_firstLoad;
  ORDERS.forEach(o=>{
    // 客人(某桌)送出訂單 → 前台播報「已完成點餐」
    if(!seenOrders.has(o.id)){
      seenOrders.add(o.id);
      if(!first && (o.source==="qr"||o.source==="line")) speak(`${owhere(o)} 已完成點餐`);
    }
    // 客人在訂單頁按「我要買單」→ 前台播報「請協助結帳」
    if(o.checkout_requested && o.status!=="paid" && !seenReq.has(o.id)){
      seenReq.add(o.id);
      if(!first) speak(`請協助 ${owhere(o)} 進行結帳`);
    }
  });
  _firstLoad=false;
}

/* ---------- 分頁切換 ---------- */
U.$$(".tabs button").forEach(b=>b.onclick=()=>showView(b.dataset.v));
function showView(v){
  U.$$(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.v===v));
  U.$$(".view").forEach(s=>s.classList.toggle("active", s.id==="v-"+v));
  if(v==="seats") renderSeats();
  if(v==="orders") renderOrders();
  if(v==="wait") renderWait();
}
U.$("#backSeats").onclick=()=>showView("seats");
U.$("#takeoutBtn").onclick=()=>openTakeout();
U.$("#mergeBtn").onclick=()=>openMergeModal();

/* ---------- 載入與即時更新 ---------- */
async function loadAll(){
  let SET;
  [CATS, MENU, TABLES, ORDERS, SET, WAIT, DISCOUNTS] = await Promise.all([
    DB.getCategories(), DB.getMenu(), DB.getTables(), DB.getOrders(), DB.getSettings(), DB.getWaitlist(), DB.getDiscounts()
  ]);
  U.applySettings(SET);
  curCat = curCat || (CATS[0] && CATS[0].id);
  detectNewOrders();
  renderSeats(); renderOrders(); updateBadge(); updateWaitBadge();
  if(U.$("#v-order").classList.contains("active")){ renderCats(); renderMenu(); renderTicket(); }
  if(U.$("#v-wait").classList.contains("active")) renderWait();
}
(async()=>{ await DB.init(); DB.on("*", ()=>loadAll()); await loadAll(); setInterval(renderSeats, 30000); })();

/* ---------- 候位 ---------- */
function todayWaiting(){ const d=twDateC(); return WAIT.filter(w=>(w.day||"")===d && w.status==="waiting").sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); }
function updateWaitBadge(){ const n=todayWaiting().length; const b=U.$("#waitBadge"); if(!b) return; b.textContent=n; b.classList.toggle("hidden", n===0); }
function renderWait(){
  const pb=U.$("#wParty"); if(pb){ pb.innerHTML=""; [1,2,3,4,5,6,8].forEach(n=>{ const b=U.el(`<button class="${n===wParty?'active':''}">${n} 人</button>`); b.onclick=()=>{ wParty=n; renderWait(); }; pb.appendChild(b); }); }
  const waiting=todayWaiting();
  U.$("#waitCount").textContent=waiting.length;
  const box=U.$("#waitList");
  box.innerHTML = waiting.length ? "" : '<div class="empty">目前無候位</div>';
  waiting.forEach((w,i)=>{
    const tm=(U.twTime(w.created_at).split(" ")[1])||"";
    const row=U.el(`<div class="wrow2">
      <div class="num">${w.number}</div>
      <div class="meta"><b>第 ${i+1} 組</b><small>${w.name||""} · ${w.party_size}人${w.phone?(" · "+w.phone):""} · ${tm}</small></div>
      <button class="btn primary sm seat">已完成帶位</button>
    </div>`);
    row.querySelector(".seat").onclick=async()=>{ await DB.updateWait(w.id,{status:"seated"}); U.toast("已帶位 ✓"); };
    box.appendChild(row);
  });
}
U.$("#wAdd").onclick=async()=>{
  const name=U.$("#wName").value.trim();
  if(!name){ U.toast("請填寫姓名"); return; }
  const w=await DB.addWait({ name, phone:U.$("#wPhone").value.trim(), party_size:wParty });
  U.$("#wName").value=""; U.$("#wPhone").value=""; wParty=2;
  U.toast(`已取號：${w.number}`);
  if(VOICE) speakNow(`候位編號 ${w.number.split('').join(' ')}`);
};

/* ============================================================
   座位視圖 — 依實際店內平面圖
   座標為百分比 (容器比例 ≈ 寬:高 = 1:1.08)
   ============================================================ */
const SEAT_POS = {
  // 吧台單人席 (右側緊鄰吧台，由上而下 5→1)
  T5:{l:33.7,t:44.2,w:9.5,h:6.8}, T4:{l:33.7,t:52.2,w:9.5,h:6.8},
  T3:{l:33.7,t:60.0,w:9.5,h:6.8}, T2:{l:33.7,t:67.8,w:9.5,h:6.8},
  T1:{l:33.7,t:75.6,w:9.5,h:6.8},
  // 四人桌 (右排，由上而下 10→6)
  T10:{l:59.5,t:9.2,w:17.4,h:10.7}, T9:{l:59.5,t:24.3,w:17.4,h:10.7},
  T8:{l:59.5,t:39.3,w:17.4,h:10.7}, T7:{l:59.5,t:53.9,w:17.4,h:10.7},
  T6:{l:59.5,t:68.9,w:17.4,h:10.7}
};
const FIXTURES = [
  {cls:"",      txt:"餐具、調味料及免費湯品", l:45.3,t:1.9, w:35.8,h:5.0, fs:11},
  {cls:"bar",   txt:"吧台", l:24.2,t:42.7,w:7.4, h:40.3},
  {cls:"",      txt:"櫃台", l:10.0,t:85.0,w:22.6,h:8.3},
  {cls:"toilet",txt:"廁所", l:24.2,t:18.5,w:18.9,h:5.5},
  {cls:"door",  txt:"入口", l:44.7,t:88.5,w:10.5,h:5.5}
];

function renderSeats(){
  const fp=U.$("#floorPlan"); if(!fp) return;
  fp.innerHTML='<div class="fp-inner" id="fpInner"></div>';
  const inner=U.$("#fpInner");
  FIXTURES.forEach(f=>{
    inner.appendChild(U.el(`<div class="fixture ${f.cls}" style="left:${f.l}%;top:${f.t}%;width:${f.w}%;height:${f.h}%;${f.fs?`font-size:${f.fs}px`:""}">${f.txt}</div>`));
  });
  // 併桌連接線 (SVG 疊層)
  const groups={}; TABLES.forEach(t=>{ if(t.merge_group){ (groups[t.merge_group]=groups[t.merge_group]||[]).push(t); } });
  if(Object.keys(groups).length){
    const NS="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(NS,"svg");
    svg.setAttribute("viewBox","0 0 100 100"); svg.setAttribute("preserveAspectRatio","none");
    svg.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1";
    Object.values(groups).forEach(mem=>{
      const pts=mem.map(t=>SEAT_POS[t.id]).filter(Boolean).map(p=>({x:p.l+p.w/2,y:p.t+p.h/2}));
      for(let i=0;i<pts.length-1;i++){ const ln=document.createElementNS(NS,"line");
        ln.setAttribute("x1",pts[i].x);ln.setAttribute("y1",pts[i].y);ln.setAttribute("x2",pts[i+1].x);ln.setAttribute("y2",pts[i+1].y);
        ln.setAttribute("stroke","#EC4899");ln.setAttribute("stroke-width","0.9");ln.setAttribute("stroke-dasharray","2 1.4");ln.setAttribute("stroke-linecap","round");
        svg.appendChild(ln); }
    });
    inner.appendChild(svg);
  }
  TABLES.forEach(t=>{
    const p=SEAT_POS[t.id]; if(!p) return;
    const remain = t.status==="occupied" ? Math.max(0, CFG.AVG_DINING_MINUTES - U.minutesSince(t.seated_at)) : null;
    const cap = t.zone==="bar" ? "單人" : t.seats+"人";
    const seat=U.el(`<div class="fseat ${t.status} ${t.merge_group?'merged':''}" style="left:${p.l}%;top:${p.t}%;width:${p.w}%;height:${p.h}%;${t.merge_group?'z-index:2':''}">
      ${t.merge_group?'<span class="mbadge">併位中</span>':''}
      <span class="lbl">${t.label}</span><span class="cap">${cap}</span>
      ${remain!==null?`<span class="rt">⏱${remain}′</span>`:""}
    </div>`);
    seat.onclick=()=>openOrder(t);
    inner.appendChild(seat);
  });
  U.$("#freeCount").textContent=TABLES.filter(t=>t.status==="free").length;
  U.$("#busyCount").textContent=TABLES.filter(t=>t.status==="occupied").length;
  renderReserveHint(TABLES);
}

/* 用餐時段分析：判斷現在是否可開放預訂 (任務7會再強化) */
function renderReserveHint(dine){
  const box=U.$("#reserveHint"); if(!box) return;
  const free=dine.filter(t=>t.status==="free");
  const soon=dine.filter(t=>t.status==="occupied" &&
    (CFG.AVG_DINING_MINUTES-U.minutesSince(t.seated_at))<=20);
  const avail = free.length + soon.length;
  let html;
  if(avail>=1){
    const when = free.length ? "現在" : `約 ${Math.max(...soon.map(t=>Math.max(0,CFG.AVG_DINING_MINUTES-U.minutesSince(t.seated_at))))} 分鐘內`;
    html=`<div class="card" style="border-left:5px solid var(--ok)">
      <b style="color:var(--ok)">✅ 可開放預訂</b><br>
      目前空位 ${free.length} 桌，另有 ${soon.length} 桌即將結束用餐。建議 ${when} 可接受現場帶位或預訂。</div>`;
  } else {
    const next=Math.min(...dine.filter(t=>t.status==="occupied").map(t=>Math.max(0,CFG.AVG_DINING_MINUTES-U.minutesSince(t.seated_at))));
    html=`<div class="card" style="border-left:5px solid var(--warn)">
      <b style="color:#b9791f">⏳ 暫無空桌</b><br>
      預估最快約 ${isFinite(next)?next:CFG.AVG_DINING_MINUTES} 分鐘後有桌可翻。建議預訂時間設在此之後並預留 ${CFG.RESERVATION_BUFFER_MIN} 分緩衝。</div>`;
  }
  box.innerHTML=html;
}

/* ============================================================
   併桌
   ============================================================ */
function groupMembers(gid){ return TABLES.filter(t=>t.merge_group===gid).sort((a,b)=>(+a.label)-(+b.label)); }
function primaryOf(t){ if(!t.merge_group) return t; const mem=groupMembers(t.merge_group); return mem.find(x=>x.order_id)||mem[0]||t; }
function mergeLabel(gid){ return groupMembers(gid).map(t=>t.label).join("+"); }
function openMergeModal(){
  const dine=TABLES.filter(t=>t.zone!=="take");
  const checks=dine.map(t=>`<label style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:var(--text);margin:0 12px 10px 0">
    <input type="checkbox" data-mt="${t.id}" ${t.merge_group?'disabled':''} style="width:auto">${t.label}${t.zone==='bar'?'(單)':''}${t.merge_group?'（已併）':''}</label>`).join("");
  const groups={}; TABLES.forEach(t=>{ if(t.merge_group) (groups[t.merge_group]=groups[t.merge_group]||[]).push(t); });
  const existing=Object.keys(groups).map(g=>`<div class="mrow"><div class="nm" style="flex:1"><b>併桌 ${mergeLabel(g)}</b><small>${(groups[g][0].merge_party||'')}人</small></div><button class="btn ghost sm un" data-g="${g}" style="color:var(--danger)">解除</button></div>`).join("");
  const m=U.modal("併桌設定",`
    <label>勾選要合併的桌次 (2 桌以上)</label>
    <div style="padding:8px 0 4px">${checks}</div>
    <div class="field"><label>合併後總人數</label><input type="number" id="mgParty" value="4" min="1"></div>
    ${existing?`<hr style="border:none;border-top:1px dashed var(--miku-line);margin:12px 0"><label>目前併桌</label>${existing}`:''}`,
    `<button class="btn ghost cancel">取消</button><button class="btn primary save">確認併桌</button>`);
  m.el.querySelector(".cancel").onclick=m.close;
  m.el.querySelectorAll(".un").forEach(b=>b.onclick=async()=>{ await DB.unmergeGroup(b.dataset.g); U.toast("已解除併桌"); m.close(); });
  m.el.querySelector(".save").onclick=async()=>{
    const ids=Array.from(m.el.querySelectorAll("[data-mt]")).filter(x=>x.checked).map(x=>x.dataset.mt);
    if(ids.length<2){ U.toast("請至少勾選 2 桌"); return; }
    await DB.mergeTables(ids, +m.el.querySelector("#mgParty").value||ids.length);
    m.close(); U.toast("已併桌 ✓");
  };
}

/* ============================================================
   點餐情境
   ============================================================ */
function openOrder(t){
  const p = t.merge_group ? primaryOf(t) : t;
  ctx={ mode:"dine", table_id:p.id, order_id:p.order_id||null, draft:[], merge_group:t.merge_group||null };
  if(t.merge_group){
    const lbl=mergeLabel(t.merge_group);
    U.$("#orderTitle").textContent=`併桌 ${lbl} · ${t.merge_party||''}人`;
    U.$("#ticketTitle").textContent=`併桌 ${lbl}`;
  } else {
    const kind = t.zone==="bar" ? "吧台單人席" : `${t.seats} 人桌`;
    U.$("#orderTitle").textContent=`${t.label} 號 · ${kind}`;
    U.$("#ticketTitle").textContent=`${t.label} 號`;
  }
  showView("order"); renderCats(); renderMenu(); renderTicket();
}
// TODO(後續): 外帶單之後串接 UberEats / Foodpanda 外送平台訂單匯入
function openTakeout(){
  ctx={ mode:"take", table_id:null, order_id:null, draft:[] };
  U.$("#orderTitle").textContent="外帶";
  U.$("#ticketTitle").textContent="外帶單";
  showView("order"); renderCats(); renderMenu(); renderTicket();
}

function renderCats(){
  const bar=U.$("#catBar"); bar.innerHTML="";
  CATS.forEach(c=>{
    const b=U.el(`<button class="${c.id===curCat?'active':''}">${I18N.itemName(c)}</button>`);
    b.onclick=()=>{ curCat=c.id; renderCats(); renderMenu(); };
    bar.appendChild(b);
  });
}
function renderMenu(){
  const grid=U.$("#menuGrid"); grid.innerHTML="";
  MENU.filter(i=>i.cat===curCat).forEach(it=>{
    const off=!it.available;
    const card=U.el(`<div class="mcard ${off?'off':''}">
      ${U.thumb(it)}
      <h4>${I18N.itemName(it)}</h4>
      <div class="price">${U.priceLabel(it)}</div>
      ${off?'<span class="tag off">暫停供應</span>':''}
    </div>`);
    if(!off) card.onclick=()=>addToDraft(it);
    grid.appendChild(card);
  });
  if(!grid.children.length) grid.innerHTML='<div class="empty"><div class="big">🍽️</div>此分類沒有品項</div>';
}

function addToDraft(it){
  const unit=(U.settings&&U.settings.weight_unit)||"斤";
  if(it.price_type==="weight"){
    U.weightModal(it, unit, ({price,label})=>{
      ctx.draft.push({ item_id:it.id, name:I18N.itemName(it), price, qty:1, note:label||"" });
      renderTicket();
    });
    return;
  }
  if(it.price_type==="piece"){
    U.pieceModal(it, ({price,label})=>{
      ctx.draft.push({ item_id:it.id, name:I18N.itemName(it)+(label?(" ("+label+")"):""), price, qty:1, note:"" });
      renderTicket();
    });
    return;
  }
  const ex=ctx.draft.find(d=>d.item_id===it.id && !d.note);
  if(ex) ex.qty++;
  else ctx.draft.push({ item_id:it.id, name:I18N.itemName(it), price:it.price, qty:1, note:"" });
  renderTicket();
}

function activeOrder(){ return ORDERS.find(o=>o.id===ctx.order_id); }

function renderTicket(){
  const box=U.$("#ticketItems"); box.innerHTML="";
  const ao=activeOrder();
  // 已送出的明細
  if(ao && ao.items && ao.items.length){
    ao.items.forEach(li=>{
      box.appendChild(U.el(`<div class="ti" style="opacity:.7">
        <div class="nm">${li.name}<small>已送出 ×${li.qty}${li.note?' · '+li.note:''}</small></div>
        <div>${U.money(li.price*li.qty)}</div></div>`));
    });
  }
  // 草稿 (本次加點) — 每項可加備註
  ctx.draft.forEach((d,idx)=>{
    const row=U.el(`<div class="ti" style="flex-wrap:wrap">
      <div class="nm">${d.name}<small>${U.money(d.price)}</small></div>
      <div class="stepper">
        <button data-a="dec">−</button><b>${d.qty}</b><button data-a="inc">＋</button>
      </div>
      <input class="dnote" style="flex-basis:100%;margin-top:6px;font-size:13px;padding:7px 10px" value="${(d.note||'').replace(/"/g,'&quot;')}" placeholder="備註，例如：不要蔥">
    </div>`);
    row.querySelector('[data-a=inc]').onclick=()=>{ d.qty++; renderTicket(); };
    row.querySelector('[data-a=dec]').onclick=()=>{ d.qty--; if(d.qty<=0) ctx.draft.splice(idx,1); renderTicket(); };
    row.querySelector('.dnote').oninput=(e)=>{ d.note=e.target.value; };
    box.appendChild(row);
  });
  if(!box.children.length) box.innerHTML='<div class="empty" style="padding:24px"><div class="big">🛒</div>點選左側菜單加入</div>';

  // 金額
  const sentSub = ao ? (ao.items||[]).reduce((s,l)=>s+l.price*l.qty,0) : 0;
  const draftSub = ctx.draft.reduce((s,d)=>s+d.price*d.qty,0);
  const sub = sentSub + draftSub;
  const rate = ctx.mode==="dine" ? (CFG.SERVICE_CHARGE_RATE||0) : 0;
  const svc = Math.round(sub*rate);
  const total = sub+svc;
  U.$("#ticketSum").innerHTML=`
    <div class="sumrow"><span>${I18N.t('subtotal')}</span><span>${U.money(sub)}</span></div>
    ${rate?`<div class="sumrow"><span>${I18N.t('service')} ${rate*100}%</span><span>${U.money(svc)}</span></div>`:''}
    <div class="sumrow total"><span>${I18N.t('total')}</span><span>${U.money(total)}</span></div>`;

  // 動作
  const act=U.$("#ticketAct"); act.innerHTML="";
  if(ctx.draft.length){
    const b=U.el(`<button class="btn primary block lg">${ao?'送出加點':I18N.t('order_now')}</button>`);
    b.onclick=sendDraft; act.appendChild(b);
  }
  if(ao){
    // 訂單狀態(待確認/製作中/已上菜)在「訂單」分頁操作，這裡不重複
    const co=U.el(`<button class="btn pink block lg">💳 結帳 ${U.money(total)}</button>`);
    co.onclick=()=>checkout(ao, total, sub, svc);
    act.appendChild(co);
  }
}

async function sendDraft(){
  if(!ctx.draft.length) return;
  const ao=activeOrder();
  if(ao){
    await DB.addItems(ao.id, ctx.draft.map(d=>({...d})));
    U.toast("已加點 ✓");
  } else {
    const sub=ctx.draft.reduce((s,d)=>s+d.price*d.qty,0);
    const rate=ctx.mode==="dine"?(CFG.SERVICE_CHARGE_RATE||0):0;
    const mg=ctx.merge_group||null;
    const o=await DB.createOrder({
      mode:ctx.mode, table_id:ctx.table_id, source:"pos",
      items:ctx.draft.map(d=>({...d})), status:"pending",
      merge_group:mg, merged_label: mg?mergeLabel(mg):null,
      party: mg?((TABLES.find(t=>t.merge_group===mg)||{}).merge_party||null):null,
      subtotal:sub, service:Math.round(sub*rate), total:Math.round(sub*(1+rate))
    });
    ctx.order_id=o.id;
    U.toast(ctx.mode==="take"?`外帶單 #${o.number} 已建立`:"訂單已送出 ✓");
  }
  ctx.draft=[];
  await loadAll();
  if(ctx.mode==="take") showView("orders");
}

const PAY_LABELS={cash:"現金",card:"信用卡",linepay:"LINE Pay",jkopay:"街口支付"};
function checkout(order, total0, sub, svc){
  let disc=null;   // {name,type,value} 套用中的折扣
  const m=U.modal("結帳", `<div id="coBody"></div>`,
    `<div id="coFoot" style="display:flex;gap:10px;flex-wrap:wrap;width:100%"></div>`);
  function calc(){ let amt=0; if(disc){ amt = disc.type==="percent" ? Math.round(sub*disc.value/100) : Math.min(disc.value, sub+svc); } return { amt, total:Math.max(0, sub+svc-amt) }; }
  function render(){
    const {amt,total}=calc();
    m.el.querySelector("#coBody").innerHTML=`
      <div class="sumrow"><span>${I18N.t('subtotal')}</span><span>${U.money(sub)}</span></div>
      ${svc?`<div class="sumrow"><span>${I18N.t('service')}</span><span>${U.money(svc)}</span></div>`:''}
      ${disc?`<div class="sumrow" style="color:var(--miku-pink-d)"><span>折扣 (${disc.name})</span><span>− ${U.money(amt)}</span></div>`:''}
      <div class="sumrow total" style="margin:8px 0 16px"><span>應收</span><span>${U.money(total)}</span></div>
      <label>選擇付款方式 (僅記錄，未接金流/發票機)</label>
      <div class="grid" style="grid-template-columns:1fr 1fr">${(CFG.PAYMENT_METHODS||["cash"]).map(p=>`<button class="btn ghost lg pay" data-p="${p}" style="justify-content:flex-start">${PAY_LABELS[p]||p}</button>`).join("")}</div>`;
    m.el.querySelector("#coFoot").innerHTML=`<button class="btn deep" id="discBtn">🎟️ 折扣${disc?'：'+disc.name:''}</button>${disc?'<button class="btn ghost" id="discClr">移除</button>':''}`;
    m.el.querySelector("#discBtn").onclick=pickDiscount;
    const clr=m.el.querySelector("#discClr"); if(clr) clr.onclick=()=>{ disc=null; render(); };
    m.el.querySelectorAll(".pay").forEach(b=>b.onclick=()=>{
      const {amt,total}=calc();
      const dinfo = disc ? { name:disc.name, amount:amt } : null;
      m.close();
      if(b.dataset.p==="cash") cashModal(order,total,sub,svc,dinfo);
      else confirmPay(order,b.dataset.p,sub,svc,total,dinfo);
    });
  }
  function pickDiscount(){
    const list=(DISCOUNTS||[]).filter(d=>d.active!==false);
    if(!list.length){ U.toast("尚未設定折扣 (後台 → 優惠折扣)"); return; }
    const body=list.map(d=>`<div class="opt-row" data-id="${d.id}">${d.name}<span class="op">${d.type==='percent'?d.value+'%':U.money(d.value)}</span></div>`).join("");
    const mm=U.modal("選擇折扣", body, `<button class="btn ghost" id="dx">取消</button>`);
    mm.el.querySelector("#dx").onclick=mm.close;
    mm.el.querySelectorAll(".opt-row").forEach(r=>r.onclick=()=>{ disc=list.find(x=>x.id===r.dataset.id)||null; mm.close(); render(); });
  }
  render();
}

/* 現金結帳：計算機鍵盤 + 找零 */
function cashModal(order,total,sub,svc,dinfo){
  const cur=CFG.CURRENCY||"NT$";
  let received="";
  const m=U.modal("現金結帳",`
    <div class="sumrow total" style="font-size:20px"><span>應收現金</span><span>${U.money(total)}</span></div>
    <label style="margin-top:10px">收取現金</label>
    <div id="recv" style="font-size:28px;font-weight:800;text-align:right;padding:10px 14px;border:1.5px solid var(--miku-line);border-radius:10px">${cur}0</div>
    <div class="sumrow total" style="margin-top:8px"><span>找零</span><span id="change">${U.money(0)}</span></div>
    <div class="keypad" id="keypad"></div>`,
    `<button class="btn primary block lg" id="cashDone" disabled>完成</button>`);
  const kp=m.el.querySelector("#keypad");
  ["1","2","3","4","5","6","7","8","9","00","0","⌫"].forEach(k=>{
    const b=U.el(`<button class="key">${k}</button>`); b.onclick=()=>press(k); kp.appendChild(b);
  });
  function press(k){
    if(k==="⌫") received=received.slice(0,-1);
    else { received=(received+k).replace(/^0+(?=\d)/,""); if(received.length>7) received=received.slice(0,7); }
    const r=+received||0;
    m.el.querySelector("#recv").textContent=cur+r.toLocaleString();
    m.el.querySelector("#change").textContent=U.money(Math.max(0,r-total));
    m.el.querySelector("#cashDone").disabled = r<total;
  }
  m.el.querySelector("#cashDone").onclick=()=>{ const r=+received||0; successChime(); m.close(); finalizePay(order,"cash",sub,svc,total,{received:r,change:r-total},dinfo); };
}

/* 其他支付：二次確認 */
function confirmPay(order,method,sub,svc,total,dinfo){
  const m=U.modal("確認付款",
    `<p style="font-size:15px;line-height:1.8">請確認以 <b>${PAY_LABELS[method]||method}</b> 收款
     <b style="color:var(--miku-pink-d)">${U.money(total)}</b>，金額無誤且已完成支付？</p>`,
    `<button class="btn ghost" id="c0">取消</button><button class="btn primary" id="c1">確認</button>`);
  m.el.querySelector("#c0").onclick=m.close;
  m.el.querySelector("#c1").onclick=()=>{ m.close(); finalizePay(order,method,sub,svc,total,null,dinfo); };
}

async function finalizePay(order,method,sub,svc,total,cash,dinfo){
  const patch={ status:"paid", pay_method:method, subtotal:sub, service:svc, total, paid_at:new Date().toISOString(), checkout_requested:false };
  if(cash){ patch.cash_received=cash.received; patch.cash_change=cash.change; }
  if(dinfo){ patch.discount_name=dinfo.name; patch.discount_amount=dinfo.amount; }
  await DB.updateOrder(order.id, patch);
  // 併桌結帳後：解除併桌並釋出所有併桌座位
  if(order.merge_group){ const mem=TABLES.filter(t=>t.merge_group===order.merge_group); await DB.unmergeGroup(order.merge_group); for(const t of mem) await DB.setTableStatus(t.id,"free"); }
  U.toast(cash ? `已結帳 ✓ 找零 ${U.money(cash.change)}` : "已結帳 ✓ 桌位釋出");
  ctx={mode:"dine",table_id:null,order_id:null,draft:[]};
  showView("seats");
}

/* ============================================================
   進行中訂單 (出單/KDS 概念)
   ============================================================ */
function renderOrders(){
  const box=U.$("#ordersList"); if(!box) return;
  const active=ORDERS.filter(o=>o.status!=="paid")
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  box.innerHTML="";
  if(!active.length){ box.innerHTML='<div class="empty"><div class="big">🎉</div>目前沒有進行中的訂單</div>'; return; }
  active.forEach(o=>{
    const where = o.merged_label ? `併桌 ${o.merged_label}` : (o.mode==="take" ? `外帶 #${o.number}` : `${(TABLES.find(t=>t.id===o.table_id)||{}).label||'?'} 號桌`);
    const items=(o.items||[]).map(l=>`${l.name}×${l.qty}${l.note?`<span style="color:var(--miku-pink-d)">（${l.note}）</span>`:''}`).join("、");
    const mins=U.minutesSince(o.created_at);
    const row=U.el(`<div class="ordrow" ${o.checkout_requested?'style="border:2px solid var(--miku-pink)"':''}>
      <div class="meta">
        <b>${where}</b> ${U.statusTag(o.status)} ${o.checkout_requested?'<span class="tag pink">🔔 客人請求結帳</span>':''} <small style="display:inline;color:var(--text-soft)">· ${mins} 分前 · ${o.source==='qr'?'📱掃碼':o.source==='line'?'LINE':'店員'}</small>
        <small>${items}</small>
        ${o.note?`<small style="color:var(--miku-pink-d)">＊整單備註：${o.note}</small>`:''}
      </div>
      <div class="seg">
        <button data-s="cooking" class="${o.status==='cooking'?'active':''}">製作</button>
        <button data-s="served" class="${o.status==='served'?'active':''}">上菜</button>
      </div>
      <button class="btn pink sm payb">結帳</button>
    </div>`);
    row.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>DB.updateOrder(o.id,{status:b.dataset.s}));
    row.querySelector(".payb").onclick=()=>{
      const sub=(o.items||[]).reduce((s,l)=>s+l.price*l.qty,0);
      const rate=o.mode==="dine"?(CFG.SERVICE_CHARGE_RATE||0):0;
      const svc=Math.round(sub*rate);
      checkout(o, sub+svc, sub, svc);
    };
    box.appendChild(row);
  });
}
function updateBadge(){
  const n=ORDERS.filter(o=>o.status==="pending"||o.status==="cooking").length;
  const b=U.$("#ordBadge"); if(!b) return;
  b.textContent=n; b.classList.toggle("hidden", n===0);
}
