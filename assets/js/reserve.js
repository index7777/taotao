/* ============================================================
   線上訂位頁 — 分頁(訂位/店家資訊/菜單/關於我們)
   月曆選日(三個月內、過去/公休灰色)、30 分時段、菜單與後台連動、地圖置底
   ============================================================ */
const DB = window.MikuDB;
const CFG = window.MIKU_POS_CONFIG;
let SET = {}, CATS=[], MENU=[], MENU_PHOTOS=[];
let party = 2;
const WK = ["日","一","二","三","四","五","六"];
const SLOGAN = "用心挑選每日最新鮮的魚貨，主打高品質生魚片，\n就是為了那一口入口即化的感動。\n我們在這裡，用海味說故事。";

const today = new Date(); today.setHours(0,0,0,0);
const maxDate = new Date(today); maxDate.setMonth(maxDate.getMonth()+3);  // 三個月內
let viewY = today.getFullYear(), viewM = today.getMonth();
let selDate = null, selTime = null;

const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toMin=t=>{ const [h,m]=(t||"0:0").split(":").map(Number); return h*60+m; };

/* 分頁切換 */
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".tabview").forEach(s=>s.classList.toggle("active", s.id==="t-"+b.dataset.t));
});

(async()=>{
  await DB.init();
  [SET, CATS, MENU, MENU_PHOTOS] = await Promise.all([DB.getSettings(), DB.getCategories(), DB.getMenu(), DB.getMenuPhotos()]);
  U.applySettings(SET);
  DB.on("*", async()=>{ [SET,CATS,MENU,MENU_PHOTOS]=await Promise.all([DB.getSettings(),DB.getCategories(),DB.getMenu(),DB.getMenuPhotos()]); U.applySettings(SET); renderAll(); });
  renderAll();
})();

function renderAll(){ renderHero(); renderInfo(); renderMenu(); renderMap(); renderBookingState(); renderParty(); renderCalendar(); }

function renderHero(){
  U.$("#sName").textContent = (SET.name||"") + (SET.branch?(" · "+SET.branch):"");
  U.$("#sSub").textContent = "線上訂位";
  const FB=`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M13.5 22v-8H16l.5-3h-3V9.2c0-.9.3-1.4 1.6-1.4H16.6V5.1C16.3 5 15.3 4.9 14.2 4.9c-2.3 0-3.7 1.4-3.7 3.9V11H8v3h2.5v8z"/></svg>`;
  const IG=`<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none"/></svg>`;
  const TH=`<span style="font-weight:800;font-size:16px">@</span>`;
  const sic=(h,svg)=> h?`<a class="sic" href="${h}" target="_blank" rel="noopener" aria-label="社群">${svg}</a>`:"";
  U.$("#sSocial").innerHTML = sic(SET.fb,FB)+sic(SET.ig,IG)+sic(SET.threads,TH);
}

function renderInfo(){
  const closedTxt=(SET.closed_days&&SET.closed_days.length)?("每週"+SET.closed_days.map(d=>WK[d]).join("、")+"公休"):(SET.closed||"");
  U.$("#storeInfo").innerHTML=`
    <div class="info-row"><span class="k">地址</span><span>${SET.address||"-"}</span></div>
    <div class="info-row"><span class="k">電話</span><span><a href="tel:${(SET.phone||'').replace(/\s/g,'')}" style="color:var(--miku-teal-d);font-weight:700">${SET.phone||"-"}</a></span></div>
    <div class="info-row"><span class="k">營業</span><span>${SET.open_time||"-"}${SET.open_time?(" – "+SET.close_time):""}</span></div>
    <div class="info-row closed"><span class="k" style="color:inherit">公休</span><span>${closedTxt||"-"}</span></div>`;
}

function renderAbout(){ U.$("#aboutSlogan").textContent = SLOGAN; }

function renderMap(){
  const q=encodeURIComponent(SET.map_query||SET.address||SET.name||"");
  U.$("#map").src=`https://www.google.com/maps?q=${q}&output=embed`;
  U.$("#navBtn").href=`https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

/* ---------- 菜單分頁 (與後台連動，售完同步) ---------- */
function renderMenu(){
  // 上傳的菜單照片看板
  const pbox=U.$("#menuPhotos");
  pbox.innerHTML = MENU_PHOTOS.length ? MENU_PHOTOS.map(p=>`
    <div class="mphoto"><img src="${p.url}" alt="${p.title||''}">
      ${(p.title||p.desc)?`<div class="cap">${p.title?`<b>${p.title}</b>`:""}${p.desc?`<p>${p.desc}</p>`:""}</div>`:""}
    </div>`).join("") : "";
  // 即時菜單列表
  const list=U.$("#menuList"); list.innerHTML="";
  CATS.forEach(c=>{
    const items=MENU.filter(i=>i.cat===c.id);
    if(!items.length) return;
    list.appendChild(U.el(`<div class="m-cat">${I18N.itemName(c)}</div>`));
    items.forEach(it=>{
      const off=!it.available;
      list.appendChild(U.el(`<div class="m-item ${off?'off':''}">
        ${U.thumb(it,70)}
        <div class="info">
          <h4>${I18N.itemName(it)}</h4>
          <p>${I18N.itemDesc(it)||""}</p>
          <div class="pr">${off?'<span class="tag off">已售完</span>':U.priceLabel(it)}</div>
        </div></div>`));
    });
  });
  if(!MENU_PHOTOS.length && !list.children.length) list.innerHTML='<div class="empty"><div class="big">🍽️</div>菜單準備中</div>';
}

/* ---------- 訂位狀態 / 月曆 / 時段 ---------- */
function renderBookingState(){
  const n=U.$("#resNotice");
  if(SET.accept_reservation===false){
    n.innerHTML=`<div class="notice bad">本店目前未開放線上訂位，請來電 ${SET.phone||""} 洽詢。</div>`;
    U.$("#resForm").style.display="none"; return;
  }
  U.$("#resForm").style.display="";
  n.innerHTML=`<div class="notice warn">公休日與非營業時段無法訂位（營業 ${SET.open_time||""}–${SET.close_time||""}）。</div>`;
}

function renderParty(){
  const pb=U.$("#r_party"); if(!pb) return; pb.innerHTML="";
  [1,2,3,4,5,6,8].forEach(n=>{ const b=U.el(`<button class="${n===party?'active':''}">${n} 人</button>`); b.onclick=()=>{ party=n; renderParty(); }; pb.appendChild(b); });
}

function canPrev(){ return (viewY>today.getFullYear())||(viewY===today.getFullYear()&&viewM>today.getMonth()); }
function canNext(){ return (viewY<maxDate.getFullYear())||(viewY===maxDate.getFullYear()&&viewM<maxDate.getMonth()); }
U.$("#calPrev").onclick=()=>{ if(!canPrev())return; viewM--; if(viewM<0){viewM=11;viewY--;} renderCalendar(); };
U.$("#calNext").onclick=()=>{ if(!canNext())return; viewM++; if(viewM>11){viewM=0;viewY++;} renderCalendar(); };

function dayState(d){
  // return 'ok' | 'off'
  if(d<today || d>maxDate) return "off";
  if((SET.closed_days||[]).includes(d.getDay())) return "off";
  return "ok";
}
function renderCalendar(){
  U.$("#calTitle").textContent=`${viewY} 年 ${viewM+1} 月`;
  U.$("#calPrev").disabled=!canPrev(); U.$("#calNext").disabled=!canNext();
  const grid=U.$("#calGrid"); grid.innerHTML="";
  WK.forEach(w=>grid.appendChild(U.el(`<div class="cal-dow">${w}</div>`)));
  const first=new Date(viewY,viewM,1); const startDow=first.getDay();
  const days=new Date(viewY,viewM+1,0).getDate();
  for(let i=0;i<startDow;i++) grid.appendChild(U.el('<div class="cal-day empty"></div>'));
  for(let day=1;day<=days;day++){
    const d=new Date(viewY,viewM,day); d.setHours(0,0,0,0);
    const st=dayState(d); const key=ymd(d);
    const cell=U.el(`<div class="cal-day ${st==='off'?'off':''} ${selDate===key?'sel':''}">${day}</div>`);
    if(st==="ok") cell.onclick=()=>{ selDate=key; selTime=null; renderCalendar(); renderSlots(); U.$("#afterDate").classList.remove("hidden"); U.$("#afterDate").scrollIntoView({behavior:"smooth",block:"nearest"}); };
    grid.appendChild(cell);
  }
}

function renderSlots(){
  const box=U.$("#slots"); box.innerHTML="";
  const open=toMin(SET.open_time||"11:30"), close=toMin(SET.close_time||"23:00");
  const isToday = selDate===ymd(today);
  const nowMin = new Date().getHours()*60+new Date().getMinutes();
  let any=false;
  for(let t=open;t<=close;t+=30){
    if(isToday && t<=nowMin+15) continue;       // 今天只開放現在之後
    const label=`${pad(Math.floor(t/60))}:${pad(t%60)}`;
    const b=U.el(`<button class="slot ${selTime===label?'sel':''}">${label}</button>`);
    b.onclick=()=>{ selTime=label; renderSlots(); };
    box.appendChild(b); any=true;
  }
  if(!any) box.innerHTML='<div class="hint">本日已無可訂時段，請改選其他日期。</div>';
}

U.$("#r_submit").onclick=submit;
function validate(){
  if(!selDate) return "請先選擇日期";
  if(!selTime) return "請選擇時間";
  if(!U.$("#r_name").value.trim()) return "請填寫姓名";
  if(!U.$("#r_phone").value.trim()) return "請填寫電話";
  const dt=new Date(`${selDate}T${selTime}`);
  if(isNaN(dt)||dt.getTime()<Date.now()) return "此時段已過，請重新選擇";
  if((SET.closed_days||[]).includes(dt.getDay())) return `每週${WK[dt.getDay()]}為公休日`;
  const cur=dt.getHours()*60+dt.getMinutes();
  if(cur<toMin(SET.open_time||"0:0")||cur>toMin(SET.close_time||"23:59")) return "非營業時段";
  return null;
}
async function submit(){
  const err=validate(); if(err){ U.toast(err); return; }
  const btn=U.$("#r_submit"); btn.disabled=true; btn.textContent="送出中…";
  const r=await DB.createReservation({
    name:U.$("#r_name").value.trim(), phone:U.$("#r_phone").value.trim(),
    party_size:party, reserve_at:new Date(`${selDate}T${selTime}`).toISOString(),
    note:U.$("#r_note").value.trim(), status:"booked", source:"web"
  });
  btn.disabled=false; btn.textContent="送出訂位";
  const lineBtn = SET.line_url
    ? `<a class="btn block lg" style="background:#06C755;color:#fff;margin-top:12px" href="${SET.line_url}" target="_blank" rel="noopener">加入 LINE 好友，接收訂位通知與最新消息</a>`
    : `<p style="color:var(--text-soft);font-size:13px;margin-top:12px">我們會盡快與您確認，如需更改請來電 ${SET.phone||""}。</p>`;
  const m=U.modal("訂位已送出 ✓",`
    <div style="text-align:center">
      <div style="font-size:46px">📅</div>
      <p style="font-size:15px;color:var(--text)">感謝您的訂位，我們已收到：</p>
      <div style="text-align:left;background:var(--miku-light);border-radius:12px;padding:14px;line-height:2">
        <div><b>姓名</b>　${r.name}</div>
        <div><b>電話</b>　${r.phone}</div>
        <div><b>人數</b>　${r.party_size} 人</div>
        <div><b>時間</b>　${U.twTime(r.reserve_at)}</div>
        ${r.note?`<div><b>備註</b>　${r.note}</div>`:""}
      </div>
      ${lineBtn}
    </div>`,
    `<button class="btn ghost" id="okBtn">完成</button>`);
  m.el.querySelector("#okBtn").onclick=()=>{ m.close(); U.$("#r_name").value=""; U.$("#r_phone").value=""; U.$("#r_note").value=""; selTime=null; renderSlots(); };
}
