/* ============================================================
   QR 客人自助點餐
   網址帶 ?table=T3 指定桌號；無桌號則視為外帶自取
   ============================================================ */
const DB = window.MikuDB;
const CFG = window.MIKU_POS_CONFIG;
const params = new URLSearchParams(location.search);
const TABLE_ID = params.get("table");
let CATS=[], MENU=[], TABLES=[];
let cart=[];           // [{item_id,name,price,qty,note}]
let curCat=null;
let myOrderId=null;    // 此裝置最後送出的訂單，用於追蹤狀態
let selectedTableId = TABLE_ID || null;  // 桌號 (QR 帶入或客人選擇，送出前可改)
let partySize = 2;     // 人數 (單人席自動為 1)
let orderNoteVal="";   // 整單備註
let searchQ="";        // 菜色搜尋
const SLOGAN="用心挑選每日最新鮮的魚貨，主打高品質生魚片，\n就是為了那一口入口即化的感動。\n我們在這裡，用海味說故事。";

/* 此裝置的點餐記錄 (存本機) */
function myOrders(){ try{ return JSON.parse(localStorage.getItem("taotao.myorders"))||[]; }catch(_){ return []; } }
function pushMyOrder(id){ const a=myOrders(); a.unshift(id); localStorage.setItem("taotao.myorders", JSON.stringify(a.slice(0,50))); }

/* 語言切換 */
function renderLangs(){
  const box=U.$("#langSwitch"); box.innerHTML="";
  I18N.langs.forEach(l=>{
    const b=U.el(`<button class="${I18N.cur===l.code?'active':''}">${l.label}</button>`);
    b.onclick=()=>{ I18N.set(l.code); };
    box.appendChild(b);
  });
}
window.addEventListener("langchange", ()=>{ renderLangs(); renderTexts(); renderCats(); renderList(); renderCartBar(); });

function renderTexts(){
  const s=U.settings||{};
  const sn=U.$("#storeName"); if(sn) sn.textContent=(s.name||CFG.RESTAURANT_NAME||"")+(s.branch?(" · "+s.branch):"");
  const sl=U.$("#slogan"); if(sl) sl.textContent=SLOGAN;
  renderHeaderInfo();
  const db=U.$("#dineBtn"); if(db) db.onclick=openTableModal;
  const tb=U.$("#takeBtn"); if(tb) tb.onclick=()=>{ selectedTableId=null; partySize=1; updateModeSeg(); };
  const hb=U.$("#histBtn"); if(hb){ hb.textContent=I18N.t('history'); hb.onclick=openHistory; }
  updateModeSeg();
}
function updateModeSeg(){
  const db=U.$("#dineBtn"), tb=U.$("#takeBtn"); if(!db||!tb) return;
  if(selectedTableId){
    const t=TABLES.find(x=>x.id===selectedTableId)||{};
    db.textContent=`店內 ${t.label||''}`+(t.zone==="bar"?"·單人":("·"+partySize+"人"));
    db.classList.add("active"); tb.classList.remove("active");
  } else {
    db.textContent=I18N.t('dine_in'); db.classList.remove("active"); tb.classList.add("active");
  }
}

async function load(){
  let SET;
  [CATS, MENU, TABLES, SET] = await Promise.all([DB.getCategories(), DB.getMenu(), DB.getTables(), DB.getSettings()]);
  U.applySettings(SET);
  applyMultilang(SET);
  const ct=TABLES.find(x=>x.id===selectedTableId); if(ct && ct.zone==="bar") partySize=1;
  curCat = curCat || (CATS[0]&&CATS[0].id);
  renderTexts(); renderCats(); renderList(); renderCartBar();
  if(myOrderId) refreshMyOrder();
}
function applyMultilang(s){
  const box=U.$("#langSwitch");
  if(s && s.multilang===false){ if(box) box.style.display="none"; if(I18N.cur!=="zh") I18N.cur="zh"; }
  else if(box){ box.style.display=""; }
}

/* 版頭店家資訊 + 社群 icon (不重複店名) */
function renderHeaderInfo(){
  const s=U.settings||{};
  const meta=U.$("#storeMeta");
  if(meta) meta.innerHTML=`
    📍 ${s.address||""}<br>
    ☎ <a href="tel:${(s.phone||'').replace(/\s/g,'')}">${s.phone||""}</a>　🕒 ${s.hours||((s.open_time||"")+"–"+(s.close_time||""))}　${s.closed||""}`;
  const soc=U.$("#storeSocial"); if(!soc) return;
  const FB=`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M13.5 22v-8H16l.5-3h-3V9.2c0-.9.3-1.4 1.6-1.4H16.6V5.1C16.3 5 15.3 4.9 14.2 4.9c-2.3 0-3.7 1.4-3.7 3.9V11H8v3h2.5v8z"/></svg>`;
  const IG=`<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none"/></svg>`;
  const TH=`<span style="font-weight:800;font-size:16px">@</span>`;
  const sic=(href,svg)=> href?`<a class="sic" href="${href}" target="_blank" rel="noopener" aria-label="社群連結">${svg}</a>`:"";
  soc.innerHTML=`${sic(s.fb,FB)}${sic(s.ig,IG)}${sic(s.threads,TH)}`;
}

/* 選座位 + 人數 (單人席不顯示人數) */
function openTableModal(){
  const dineTables=TABLES.filter(t=>t.zone!=="take");
  const tableOpts=`<option value="">${I18N.t('takeout')}</option>`+
    dineTables.map(t=>`<option value="${t.id}" ${t.id===selectedTableId?'selected':''}>${I18N.t('table')} ${t.label}${t.zone==='bar'?'（單人席）':'（'+t.seats+'人桌）'}</option>`).join("");
  const m=U.modal("選擇座位 / 人數",`
    <div class="field"><label>${I18N.t('table')}</label><select id="tSel">${tableOpts}</select></div>
    <div class="field" id="partyField"><label>人數</label><select id="pSel"></select></div>`,
    `<button class="btn ghost" id="tCancel">${I18N.t('cancel')}</button><button class="btn primary" id="tOk">${I18N.t('confirm')}</button>`);
  const fill=()=>{
    const t=TABLES.find(x=>x.id===m.el.querySelector("#tSel").value);
    const pf=m.el.querySelector("#partyField");
    if(t && t.zone==="bar"){ pf.style.display="none"; }
    else{
      pf.style.display="";
      const max=t?Math.max(t.seats,8):8; const ps=m.el.querySelector("#pSel"); ps.innerHTML="";
      for(let i=1;i<=max;i++) ps.innerHTML+=`<option value="${i}" ${i===partySize?'selected':''}>${i} 人</option>`;
    }
  };
  m.el.querySelector("#tSel").onchange=fill; fill();
  m.el.querySelector("#tCancel").onclick=m.close;
  m.el.querySelector("#tOk").onclick=()=>{
    const tid=m.el.querySelector("#tSel").value; selectedTableId=tid||null;
    const t=TABLES.find(x=>x.id===tid);
    partySize=(t&&t.zone==="bar")?1:(+m.el.querySelector("#pSel").value||partySize);
    updateModeSeg(); m.close();
    if(cart.length) openCart();
  };
}

/* 點餐記錄 (台灣時間 / 明細 / 金額 / 加總) */
function openHistory(){
  DB.getOrders().then(all=>{
    const ids=myOrders();
    const mine=ids.map(id=>all.find(o=>o.id===id)).filter(Boolean);
    let body;
    if(!mine.length) body=`<div class="empty"><div class="big">🧾</div>尚無點餐記錄</div>`;
    else{
      let grand=0;
      body=mine.map(o=>{
        const amt=o.total||o.subtotal||0; grand+=amt;
        const items=(o.items||[]).map(l=>`<div style="display:flex;justify-content:space-between;font-size:14px"><span>${l.name} ×${l.qty}${l.note?` <small style="color:var(--miku-pink-d)">(${l.note})</small>`:''}</span><span>${U.money(l.price*l.qty)}</span></div>`).join("");
        const where=o.mode==='take'?(I18N.t('takeout')+' #'+(o.number||'')):(I18N.t('table')+' '+((TABLES.find(t=>t.id===o.table_id)||{}).label||''));
        return `<div style="border:1px solid var(--miku-line);border-radius:12px;padding:12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="color:var(--miku-deep)">${where}</b>${U.statusTag(o.status)}</div>
          <div style="font-size:12px;color:var(--text-soft);margin-bottom:8px">${U.twTime(o.created_at)}</div>
          ${items}
          <div class="sumrow total" style="margin-top:6px"><span>${I18N.t('total')}</span><span>${U.money(amt)}</span></div>
          ${o.status!=='paid' ? `<button class="btn pink sm hreq" data-id="${o.id}" style="margin-top:8px;width:100%" ${o.checkout_requested?'disabled':''}>${o.checkout_requested?I18N.t('req_done'):I18N.t('req_checkout')}</button>` : ''}
        </div>`;
      }).join("")+`<div class="sumrow total" style="font-size:18px;border-top:2px solid var(--miku-deep);padding-top:10px;margin-top:4px"><span>累計消費</span><span>${U.money(grand)}</span></div>`;
    }
    const mm=U.modal("點餐記錄", body, `<button class="btn primary" id="hClose">關閉</button>`);
    mm.el.querySelector("#hClose").onclick=mm.close;
    mm.el.querySelectorAll(".hreq").forEach(b=>b.onclick=async()=>{
      b.disabled=true; b.textContent=I18N.t('req_done');
      await DB.updateOrder(b.dataset.id,{checkout_requested:true, checkout_requested_at:new Date().toISOString()});
      U.toast("已通知服務人員 ✓");
    });
  });
}
(async()=>{ await DB.init(); renderLangs(); DB.on("*", load); await load(); })();

function renderCats(){
  const bar=U.$("#catbar"); bar.innerHTML="";
  CATS.forEach(c=>{
    const b=U.el(`<button class="${c.id===curCat?'active':''}">${I18N.itemName(c)}</button>`);
    b.onclick=()=>{ curCat=c.id; renderCats(); renderList(); };
    bar.appendChild(b);
  });
}
function matchItem(it){
  const q=searchQ; if(!q) return true;
  const n=it.name||{}, d=it.desc||{};
  return [n.zh,n.en,n.ja,n.ko,n.vi,d.zh].filter(Boolean).join(" ").toLowerCase().includes(q);
}
function renderList(){
  const list=U.$("#list"); list.innerHTML="";
  let items;
  if(searchQ){ items=MENU.filter(matchItem); list.appendChild(U.el(`<div class="cat-title">搜尋結果</div>`)); }
  else { const cat=CATS.find(c=>c.id===curCat); if(cat) list.appendChild(U.el(`<div class="cat-title">${I18N.itemName(cat)}</div>`)); items=MENU.filter(i=>i.cat===curCat); }
  items.forEach(it=>{
    const off=!it.available;
    const row=U.el(`<div class="row-item ${off?'off':''}">
      ${U.thumb(it,84)}
      <div class="info">
        <h3>${I18N.itemName(it)}</h3>
        <p>${I18N.itemDesc(it)}</p>
        <div class="b">
          <span class="price">${U.priceLabel(it)}</span>
          <span class="spacer"></span>
          ${off?`<span class="tag off">${I18N.t('sold_out')}</span>`:`<button class="addbtn">＋</button>`}
        </div>
      </div></div>`);
    if(!off) row.querySelector(".addbtn").onclick=()=>addToCart(it);
    list.appendChild(row);
  });
  if(searchQ && !items.length) list.innerHTML='<div class="empty"><div class="big">🔍</div>找不到符合的菜色</div>';
}

function addToCart(it){
  const unit=(U.settings&&U.settings.weight_unit)||"斤";
  if(it.price_type==="weight"){
    U.weightModal(it, unit, ({price,label})=>{
      cart.push({item_id:it.id,name:I18N.itemName(it),price,qty:1,note:label||""});
      U.toast("＋ "+I18N.itemName(it)); renderCartBar();
    });
    return;
  }
  if(it.price_type==="piece"){
    U.pieceModal(it, ({price,label})=>{
      cart.push({item_id:it.id,name:I18N.itemName(it)+(label?(" ("+label+")"):""),price,qty:1,note:""});
      U.toast("＋ "+I18N.itemName(it)); renderCartBar();
    });
    return;
  }
  const ex=cart.find(c=>c.item_id===it.id && !c.note);
  if(ex) ex.qty++; else cart.push({item_id:it.id,name:I18N.itemName(it),price:it.price,qty:1,note:""});
  U.toast("＋ "+I18N.itemName(it));
  renderCartBar();
}
function cartCount(){ return cart.reduce((s,c)=>s+c.qty,0); }
function cartSub(){ return cart.reduce((s,c)=>s+c.price*c.qty,0); }

function renderCartBar(){
  const bar=U.$("#cartbar");
  if(!cart.length){ bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  U.$("#cartCount").textContent=`🛒 ${cartCount()} ${I18N.t('qty')}`;
  U.$("#cartTotal").textContent=U.money(cartSub());
}
U.$("#openCart").onclick=openCart;
U.$("#orderSearch").oninput=(e)=>{ searchQ=(e.target.value||"").trim().toLowerCase(); renderList(); };

function tableSummary(){
  if(!selectedTableId) return I18N.t('takeout');
  const t=TABLES.find(x=>x.id===selectedTableId)||{};
  return `${I18N.t('table')} ${t.label||''}`+(t.zone==='bar'?' · 單人':(' · '+partySize+'人'));
}
function openCart(){
  const rate = selectedTableId ? (CFG.SERVICE_CHARGE_RATE||0) : 0;
  const sub=cartSub(), svc=Math.round(sub*rate), total=sub+svc;
  const rows=cart.map((c,i)=>`<div class="citem">
      <div class="citem-top">
        <div style="flex:1">${c.name}<br><small style="color:var(--text-soft)">${U.money(c.price)}</small></div>
        <div class="stepper"><button data-a="dec" data-i="${i}">−</button><b>${c.qty}</b><button data-a="inc" data-i="${i}">＋</button></div>
      </div>
      <input class="citem-note" data-note="${i}" value="${(c.note||'').replace(/"/g,'&quot;')}" placeholder="${I18N.t('item_note_ph')}">
    </div>`).join("");
  const m=U.modal(I18N.t("cart"), `
    <div class="field"><label>${I18N.t('table')}</label>
      <div style="display:flex;align-items:center;gap:10px">
        <div id="tSummary" style="font-weight:700;color:var(--miku-deep)">${tableSummary()}</div>
        <button type="button" class="btn ghost sm" id="changeTable">更改</button>
      </div></div>
    <div id="cartRows">${rows||`<div class="empty">${I18N.t('empty_cart')}</div>`}</div>
    <div class="field" style="margin-top:10px"><label>${I18N.t('order_note')}</label><textarea id="orderNote" rows="2" placeholder="${I18N.t('item_note_ph')}">${(orderNoteVal||'').replace(/</g,'&lt;')}</textarea></div>
    <div class="tsum" style="border-top:1px dashed var(--miku-line);margin-top:8px;padding-top:10px">
      <div class="sumrow"><span>${I18N.t('subtotal')}</span><span>${U.money(sub)}</span></div>
      ${rate?`<div class="sumrow"><span>${I18N.t('service')} ${rate*100}%</span><span>${U.money(svc)}</span></div>`:''}
      <div class="sumrow total"><span>${I18N.t('total')}</span><span>${U.money(total)}</span></div>
    </div>`,
    `<button class="btn ghost" id="moreBtn">${I18N.t('add_more')}</button>
     <button class="btn pink" id="placeBtn" ${cart.length?'':'disabled'}>${I18N.t('order_now')}</button>`);

  m.el.querySelector("#changeTable").onclick=()=>{
    orderNoteVal=m.el.querySelector("#orderNote").value;
    m.close(); openTableModal();   // 改完桌號後重新打開購物車
  };
  m.el.querySelectorAll("[data-note]").forEach(inp=>inp.oninput=()=>{ cart[+inp.dataset.note].note=inp.value; });
  m.el.querySelector("#orderNote").oninput=(e)=>{ orderNoteVal=e.target.value; };
  m.el.querySelectorAll(".stepper button").forEach(b=>b.onclick=()=>{
    const i=+b.dataset.i; if(b.dataset.a==="inc") cart[i].qty++; else { cart[i].qty--; if(cart[i].qty<=0) cart.splice(i,1); }
    orderNoteVal=m.el.querySelector("#orderNote").value;
    m.close(); renderCartBar(); if(cart.length) openCart();
  });
  m.el.querySelector("#moreBtn").onclick=m.close;
  const pb=m.el.querySelector("#placeBtn");
  if(pb) pb.onclick=async()=>{ orderNoteVal=m.el.querySelector("#orderNote").value; await placeOrder(sub,svc,total); m.close(); };
}

async function placeOrder(sub,svc,total){
  // 併桌：任一桌 QR 進來都歸同一筆 (導向主桌、記錄合併座位)
  let tableId=selectedTableId, mg=null, mlabel=null;
  if(tableId){ const t=TABLES.find(x=>x.id===tableId);
    if(t && t.merge_group){ mg=t.merge_group;
      const mem=TABLES.filter(x=>x.merge_group===mg).sort((a,b)=>(+a.label)-(+b.label));
      tableId=(mem.find(x=>x.order_id)||mem[0]||t).id; mlabel=mem.map(x=>x.label).join("+"); } }
  const o=await DB.createOrder({
    mode: tableId?"dine":"take", table_id:tableId, source:"qr",
    items:cart.map(c=>({item_id:c.item_id,name:c.name,price:c.price,qty:c.qty,note:c.note||""})),
    status:"pending", note:(orderNoteVal||"").trim(), party: tableId?partySize:null,
    merge_group:mg, merged_label:mlabel,
    subtotal:sub, service:svc, total
  });
  myOrderId=o.id; pushMyOrder(o.id); cart=[]; orderNoteVal=""; renderCartBar();
  showMyOrder(o);
}

function refreshMyOrder(){
  DB.getOrders().then(os=>{ const o=os.find(x=>x.id===myOrderId); if(o) showMyOrder(o,true); });
}
function showMyOrder(o, silent){
  // 已有面板則更新，否則開新 modal
  let panel=U.$("#myOrderPanel");
  const items=(o.items||[]).map(l=>`<div class="ti" style="padding:6px 0;display:flex"><div style="flex:1">${l.name} ×${l.qty}${l.note?`<br><small style="color:var(--miku-pink-d)">＊${l.note}</small>`:''}</div><div>${U.money(l.price*l.qty)}</div></div>`).join("");
  const body=`<div style="text-align:center;margin-bottom:12px">
      <div style="font-size:40px">✅</div>
      <b style="font-size:18px;color:var(--miku-deep)">${I18N.t('order_sent')}</b><br>
      <span class="tag teal" style="margin-top:6px">${o.mode==='take'?I18N.t('takeout')+' #'+o.number:I18N.t('table')+' '+((TABLES.find(t=>t.id===o.table_id)||{}).label||'')}</span>
    </div>
    <label>${I18N.t('status')}</label><div style="margin-bottom:10px">${U.statusTag(o.status)}</div>
    <label>${I18N.t('your_order')}</label>${items}
    ${o.note?`<div style="margin-top:8px"><label>${I18N.t('order_note')}</label><div style="color:var(--miku-pink-d)">${o.note}</div></div>`:''}
    <div class="sumrow total" style="margin-top:8px"><span>${I18N.t('total')}</span><span>${U.money(o.total||o.subtotal)}</span></div>
    ${o.status!=='paid' ? `<button class="btn pink block lg" id="payReq" style="margin-top:14px" ${o.checkout_requested?'disabled':''}>${o.checkout_requested?I18N.t('req_done'):I18N.t('req_checkout')}</button>` : ''}`;
  function bindReq(root){
    const pr=root.querySelector("#payReq"); if(!pr) return;
    pr.onclick=async()=>{ pr.disabled=true; pr.textContent=I18N.t('req_done');
      await DB.updateOrder(o.id,{checkout_requested:true, checkout_requested_at:new Date().toISOString()});
      U.toast("已通知服務人員 ✓"); };
  }
  if(panel && silent){ panel.querySelector(".body").innerHTML=body; bindReq(panel); return; }
  if(panel) panel.remove();
  const m=U.modal(I18N.t("your_order"), body,
    `<button class="btn ghost" id="moreOrder">${I18N.t('add_more')}</button>`);
  m.el.id="myOrderPanel";
  m.el.querySelector("#moreOrder").onclick=m.close;
  bindReq(m.el);
}
