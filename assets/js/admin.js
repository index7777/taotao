/* ============================================================
   後台管理：菜單 / 照片 / 即時開關 / 報表 / 設定
   ============================================================ */
const DB = window.MikuDB;
const CFG = window.MIKU_POS_CONFIG;
let CATS=[], MENU=[], ORDERS=[], SETTINGS={}, MENU_PHOTOS=[], DISCOUNTS=[], RESV=[], TABLES=[];

const pill=U.$("#modePill");
pill.textContent = window.MIKU_LIVE ? "線上模式" : "示範模式";
pill.className = "pill " + (window.MIKU_LIVE?"live":"demo");

U.$$(".subtabs button").forEach(b=>b.onclick=()=>{
  U.$$(".subtabs button").forEach(x=>x.classList.toggle("active",x===b));
  U.$$(".view").forEach(s=>s.classList.toggle("active", s.id==="v-"+b.dataset.v));
  if(b.dataset.v==="report") renderReport();
  if(b.dataset.v==="settings") renderSettings();
  if(b.dataset.v==="board") renderBoard();
  if(b.dataset.v==="promo") renderPromo();
  if(b.dataset.v==="resv") renderResv();
});

async function load(){
  [CATS, MENU, ORDERS, SETTINGS, MENU_PHOTOS, DISCOUNTS, RESV, TABLES] = await Promise.all([DB.getCategories(), DB.getMenu(), DB.getOrders(), DB.getSettings(), DB.getMenuPhotos(), DB.getDiscounts(), DB.getReservations(), DB.getTables()]);
  U.applySettings(SETTINGS);
  renderMenu();
  if(U.$("#v-report").classList.contains("active")) renderReport();
  if(U.$("#v-settings").classList.contains("active")) renderSettings();
  if(U.$("#v-board").classList.contains("active")) renderBoard();
  if(U.$("#v-promo").classList.contains("active")) renderPromo();
  if(U.$("#v-resv").classList.contains("active")) renderResv();
}
(async()=>{ await DB.init(); DB.on("*", load); await load(); })();

/* ---------------- 菜單管理 ---------------- */
let menuQuery="";
function itemMatch(it){
  if(!menuQuery) return true;
  const n=it.name||{};
  return [n.zh,n.en,n.ja,n.ko,n.vi].filter(Boolean).join(" ").toLowerCase().includes(menuQuery);
}
function renderMenu(){
  const box=U.$("#menuList"); box.innerHTML="";
  CATS.forEach(c=>{
    const items=MENU.filter(i=>i.cat===c.id && itemMatch(i));
    if(menuQuery && !items.length) return;   // 搜尋時隱藏無結果分類
    const block=U.el(`<div class="catblock"><h3>${I18N.itemName(c)} <span class="tag grey">${items.length}</span>
      <button class="btn ghost sm catedit" style="margin-left:8px">改名 / 翻譯</button></h3></div>`);
    block.querySelector(".catedit").onclick=()=>editCategory(c);
    items.forEach(it=>{
      const row=U.el(`<div class="mrow">
        ${U.thumb(it,54)}
        <div class="nm"><b>${it.name.zh}</b><small>${it.name.en||""} · ${it.name.ja||""}</small></div>
        <span class="price">${U.priceLabel(it)}</span>
        <span class="tag ${it.available?'ok':'off'}">${it.available?'販售中':'暫停供應'}</span>
        <button class="btn ghost sm edit">編輯</button>
        <label class="switch"><input type="checkbox" ${it.available?'checked':''}><span class="slider"></span></label>
      </div>`);
      row.querySelector("input").onchange=(e)=>{ DB.toggleItem(it.id, e.target.checked); U.toast(e.target.checked?"已上架":"已暫停供應"); };
      row.querySelector(".edit").onclick=()=>editItem(it);
      block.appendChild(row);
    });
    if(!menuQuery && !items.length) block.appendChild(U.el('<div class="empty" style="padding:14px">此分類尚無品項</div>'));
    box.appendChild(block);
  });
  if(menuQuery && !box.children.length) box.innerHTML='<div class="empty"><div class="big">🔍</div>找不到符合的菜色</div>';
}

U.$("#addItem").onclick=()=>editItem(null);
U.$("#addCat").onclick=()=>editCategory(null);
U.$("#aiAll").onclick=()=>aiTranslateAll();
U.$("#menuSearch").oninput=(e)=>{ menuQuery=(e.target.value||"").trim().toLowerCase(); renderMenu(); };

function editCategory(cat){
  const isNew=!cat; cat=cat||{name:{}};
  const m=U.modal(isNew?"新增分類":"分類改名 / 翻譯",
    `<div class="langgrid">${I18N.langs.map(l=>{
      const ref=l.code!=="zh"?`<div class="zhref" data-ref="c"></div>`:"";
      const tag=l.code!=="zh"?' <span class="reftag">繁中對照</span>':"";
      return `<div class="field"><label>名稱 (${l.label})${tag}</label><input data-l="${l.code}" value="${attr((cat.name||{})[l.code]||'')}">${ref}</div>`;
    }).join("")}</div>`,
    `<button class="btn deep sm" id="aiCat" style="margin-right:auto">AI 翻譯</button>
     <button class="btn ghost cancel">取消</button><button class="btn primary save">儲存</button>`);
  const syncRef=()=>{ const z=(m.el.querySelector('[data-l="zh"]').value||"").trim();
    m.el.querySelectorAll('.zhref[data-ref="c"]').forEach(e=>e.textContent=z?("繁中："+z):"（請先填中文）"); };
  m.el.querySelector('[data-l="zh"]').addEventListener("input",syncRef); syncRef();
  m.el.querySelector("#aiCat").onclick=()=>aiTranslateCategory(m.el);
  m.el.querySelector(".cancel").onclick=m.close;
  m.el.querySelector(".save").onclick=async()=>{
    const name={}; m.el.querySelectorAll("[data-l]").forEach(i=>{ if(i.value.trim()) name[i.dataset.l]=i.value.trim(); });
    if(!name.zh){ U.toast("請至少填中文"); return; }
    const payload = isNew
      ? { id:"c"+Date.now().toString(36), sort:(CATS.length+1), name }
      : { id:cat.id, sort:cat.sort, name };
    await DB.saveCategory(payload); m.close(); U.toast(isNew?"分類已新增":"分類已更新");
  };
}
async function aiTranslateCategory(modalEl){
  const zh=(modalEl.querySelector('[data-l="zh"]').value||"").trim();
  if(!zh){ U.toast("請先填寫中文名稱"); return; }
  const btn=modalEl.querySelector("#aiCat"); btn.disabled=true; btn.textContent="翻譯中…";
  try{
    const r=await geminiCall([{id:"x",zh_name:zh,zh_desc:""}]); const o=r[0]||{};
    ["ja","en","ko","vi"].forEach(l=>{ const i=modalEl.querySelector(`[data-l="${l}"]`); if(i&&o.name&&o.name[l]) i.value=o.name[l]; });
    U.toast("翻譯完成，確認後請按儲存");
  }catch(e){ aiError(e); }
  finally{ btn.disabled=false; btn.textContent="AI 翻譯"; }
}

function editItem(it){
  const isNew=!it;
  it = it || { name:{}, desc:{}, price:0, available:true, cat:(CATS[0]&&CATS[0].id), photo:null };
  let photo=it.photo;
  const catOpts=CATS.map(c=>`<option value="${c.id}" ${c.id===it.cat?'selected':''}>${I18N.itemName(c)}</option>`).join("");
  // 多語言欄位：非中文者顯示繁中對照
  const langField=(kind,it)=> I18N.langs.map(l=>{
    const v=((kind==="n"?it.name:it.desc)||{})[l.code]||"";
    const ref = l.code!=="zh" ? `<div class="zhref" data-ref="${kind}"></div>` : "";
    const tag = l.code!=="zh" ? ` <span class="reftag">繁中對照</span>` : "";
    return `<div class="field"><label>${l.label}${tag}</label><input data-${kind}="${l.code}" value="${attr(v)}">${ref}</div>`;
  }).join("");
  const m=U.modal(isNew?"新增品項":"編輯品項", `
    <div class="photo-prev" id="prev" style="${photo?`background-image:url('${photo}')`:''}">${photo?'':'<span>照片準備中</span>'}</div>
    <div class="field"><label>菜單照片 (上傳後自動壓縮；無照片則顯示「照片準備中」)</label><input type="file" accept="image/*" id="photo"></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>分類</label><select id="cat">${catOpts}</select></div>
      <div class="field"><label>計價方式</label><select id="ptype">
        <option value="fixed">固定價</option>
        <option value="weight">秤重計價 (生魚片)</option>
        <option value="piece">單點選項</option>
      </select></div>
    </div>
    <div id="priceArea"></div>
    <hr style="border:none;border-top:1px dashed var(--miku-line);margin:14px 0">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <b style="color:var(--miku-deep)">名稱 (多語言)</b>
      <button type="button" class="btn deep sm" id="aiItem" style="margin-left:auto">AI 翻譯此品項 (中→其他)</button>
    </div>
    <div class="langgrid">${langField("n",it)}</div>
    <b style="color:var(--miku-deep)">敘述 (多語言，可留白)</b>
    <div class="langgrid" style="margin-top:8px">${langField("d",it)}</div>`,
    `${isNew?'':'<button class="btn ghost del" style="margin-right:auto;color:var(--danger)">刪除</button>'}
     <button class="btn ghost cancel">取消</button><button class="btn primary save">儲存</button>`);

  // 繁中對照即時同步
  function syncZhRef(){
    const zn=(m.el.querySelector('[data-n="zh"]').value||"").trim();
    const zdEl=m.el.querySelector('[data-d="zh"]'); const zd=zdEl?(zdEl.value||"").trim():"";
    m.el.querySelectorAll('.zhref[data-ref="n"]').forEach(e=>e.textContent= zn?("繁中："+zn):"（請先填中文）");
    m.el.querySelectorAll('.zhref[data-ref="d"]').forEach(e=>e.textContent= zd?("繁中："+zd):"");
  }
  m.el.querySelector('[data-n="zh"]').addEventListener("input",syncZhRef);
  const zd0=m.el.querySelector('[data-d="zh"]'); if(zd0) zd0.addEventListener("input",syncZhRef);
  syncZhRef();

  m.el.querySelector("#aiItem").onclick=()=>aiTranslateItem(m.el);

  // 計價方式：固定價 / 秤重 / 單點選項
  m.el.querySelector("#ptype").value = it.price_type || "fixed";
  let opts=(it.options||[]).map(o=>({label:o.label,price:o.price}));
  const wunit=(U.settings&&U.settings.weight_unit)||"斤";
  function renderOpts(){
    const list=m.el.querySelector("#optList"); if(!list) return; list.innerHTML="";
    opts.forEach((o,i)=>{
      const row=U.el(`<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <input data-ol="${i}" value="${attr(o.label||'')}" placeholder="標籤，如 一顆" style="flex:2">
        <input data-op="${i}" type="number" value="${o.price||''}" placeholder="價格" style="flex:1">
        <button type="button" class="btn ghost sm" data-orm="${i}" style="color:var(--danger)">刪</button>
      </div>`);
      row.querySelector(`[data-ol="${i}"]`).oninput=e=>opts[i].label=e.target.value;
      row.querySelector(`[data-op="${i}"]`).oninput=e=>opts[i].price=+e.target.value||0;
      row.querySelector(`[data-orm="${i}"]`).onclick=()=>{ opts.splice(i,1); renderOpts(); };
      list.appendChild(row);
    });
  }
  function renderPriceArea(){
    const t=m.el.querySelector("#ptype").value;
    const box=m.el.querySelector("#priceArea");
    if(t==="weight"){
      box.innerHTML=`<div class="field"><label>每${wunit}單價 (可留白＝現場秤重)</label><input type="number" id="unitPrice" value="${it.unit_price||''}" placeholder="留白＝點餐時直接輸入金額"></div>`;
    } else if(t==="piece"){
      box.innerHTML=`<label>選項 (例如 一顆 / 任選五顆)</label><div id="optList"></div>
        <button type="button" class="btn ghost sm" id="addOpt">＋ 新增選項</button>`;
      renderOpts();
      m.el.querySelector("#addOpt").onclick=()=>{ opts.push({label:"",price:0}); renderOpts(); };
    } else {
      box.innerHTML=`<div class="field"><label>價格</label><input type="number" id="price" value="${it.price||0}"></div>`;
    }
  }
  m.el.querySelector("#ptype").onchange=renderPriceArea;
  renderPriceArea();

  m.el.querySelector("#photo").onchange=async(e)=>{
    const f=e.target.files[0]; if(!f) return;
    photo=await compressImage(f);
    const pv=m.el.querySelector("#prev"); pv.style.backgroundImage=`url('${photo}')`; pv.innerHTML="";
  };
  m.el.querySelector(".cancel").onclick=m.close;
  const del=m.el.querySelector(".del");
  if(del) del.onclick=async()=>{ if(confirm("確定刪除此品項？")){ await DB.deleteMenuItem(it.id); m.close(); U.toast("已刪除"); } };
  m.el.querySelector(".save").onclick=async()=>{
    const name={},desc={};
    m.el.querySelectorAll("[data-n]").forEach(i=>{ if(i.value.trim()) name[i.dataset.n]=i.value.trim(); });
    m.el.querySelectorAll("[data-d]").forEach(i=>{ if(i.value.trim()) desc[i.dataset.d]=i.value.trim(); });
    if(!name.zh){ U.toast("請填寫中文名稱"); return; }
    let finalPhoto=photo;
    if(photo && window.MIKU_LIVE && photo.startsWith("data:")){
      finalPhoto = await uploadPhoto(photo) || photo;
    }
    const t=m.el.querySelector("#ptype").value;
    const payload={ ...(it.id?{id:it.id}:{}), cat:m.el.querySelector("#cat").value,
      available:it.available!==false, name, desc, photo:finalPhoto, price_type:t };
    if(t==="weight"){ payload.price=0; payload.unit_price=+m.el.querySelector("#unitPrice").value||0; payload.options=null; }
    else if(t==="piece"){ payload.price=0; payload.unit_price=0; payload.options=opts.filter(o=>o.label&&o.price>0); }
    else { payload.price=+m.el.querySelector("#price").value||0; payload.unit_price=0; payload.options=null; }
    await DB.saveMenuItem(payload); m.close(); U.toast("已儲存");
  };
}

/* ---------------- Gemini AI 翻譯 ---------------- */
async function geminiCall(items){
  const key=((SETTINGS&&SETTINGS.gemini_key)||"").trim();
  if(!key) throw new Error("NO_KEY");
  const model=((SETTINGS&&SETTINGS.gemini_model)||"gemini-2.0-flash").trim();
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const prompt="你是台灣海鮮日式料理餐廳的專業菜單翻譯。請把以下以繁體中文(zh)提供的菜名與敘述，翻成日文(ja)、英文(en)、韓文(ko)、越南文(vi)。要自然、道地、能引起食慾，保留料理專有名詞。只回傳 JSON 陣列，每個元素格式："+
    '{"id":"","name":{"ja":"","en":"","ko":"","vi":""},"desc":{"ja":"","en":"","ko":"","vi":""}}'+
    "。若某項沒有敘述，desc 各語言請給空字串。資料如下：\n"+JSON.stringify(items);
  const body={ contents:[{parts:[{text:prompt}]}], generationConfig:{ responseMimeType:"application/json", temperature:0.3 } };
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok){ const t=await res.text(); throw new Error("API "+res.status+"："+t.slice(0,160)); }
  const data=await res.json();
  const txt=(((data.candidates||[])[0]||{}).content||{}).parts;
  const raw=(txt&&txt[0]&&txt[0].text)||"[]";
  return JSON.parse(raw);
}
function aiError(e){
  if(e&&e.message==="NO_KEY") U.toast("請先到「設定」填入 Gemini API 金鑰");
  else { console.warn(e); U.toast("翻譯失敗："+((e&&e.message)||"").slice(0,70)); }
}
async function aiTranslateItem(modalEl){
  const zhName=(modalEl.querySelector('[data-n="zh"]').value||"").trim();
  const zdEl=modalEl.querySelector('[data-d="zh"]'); const zhDesc=zdEl?(zdEl.value||"").trim():"";
  if(!zhName){ U.toast("請先填寫中文名稱"); return; }
  const btn=modalEl.querySelector("#aiItem"); btn.disabled=true; btn.textContent="翻譯中…";
  try{
    const r=await geminiCall([{id:"x",zh_name:zhName,zh_desc:zhDesc}]);
    const o=r[0]||{};
    ["ja","en","ko","vi"].forEach(l=>{
      const ni=modalEl.querySelector(`[data-n="${l}"]`); if(ni && o.name && o.name[l]) ni.value=o.name[l];
      const di=modalEl.querySelector(`[data-d="${l}"]`); if(di && o.desc && o.desc[l]) di.value=o.desc[l];
    });
    U.toast("翻譯完成，確認後請按儲存");
  }catch(e){ aiError(e); }
  finally{ btn.disabled=false; btn.textContent="AI 翻譯此品項 (中→其他)"; }
}
async function aiTranslateAll(){
  if(!((SETTINGS&&SETTINGS.gemini_key)||"").trim()){ U.toast("請先到「設定」填入 Gemini API 金鑰"); return; }
  // 客人前台會看到的欄位 = 分類名稱 + 品項名稱 + 品項敘述
  const catItems=CATS.filter(c=>c.name&&c.name.zh).map(c=>({id:"CAT_"+c.id, zh_name:c.name.zh, zh_desc:""}));
  const menuItems=MENU.filter(i=>i.name&&i.name.zh).map(i=>({id:i.id, zh_name:i.name.zh, zh_desc:(i.desc&&i.desc.zh)||""}));
  const all=catItems.concat(menuItems);
  if(!all.length){ U.toast("沒有可翻譯的內容"); return; }
  if(!confirm(`將以中文為來源，用 AI 重新翻譯前台可見的 ${CATS.length} 個分類與 ${menuItems.length} 個品項（日/英/韓/越）並覆蓋，確定？`)) return;
  const btn=U.$("#aiAll"); if(btn){ btn.disabled=true; btn.textContent="翻譯中…"; }
  try{
    const out=[];
    for(let i=0;i<all.length;i+=10){ const part=await geminiCall(all.slice(i,i+10)); out.push.apply(out,part); }
    const map={}; out.forEach(o=>{ if(o&&o.id) map[o.id]=o; });
    let n=0;
    // 套用分類
    for(const c of CATS){
      const o=map["CAT_"+c.id]; if(!o) continue;
      const name=Object.assign({}, c.name);
      ["ja","en","ko","vi"].forEach(l=>{ if(o.name&&o.name[l]) name[l]=o.name[l]; });
      await DB.saveCategory({ id:c.id, sort:c.sort, name }); n++;
    }
    // 套用品項
    for(const it of MENU){
      const o=map[it.id]; if(!o) continue;
      const name=Object.assign({}, it.name); const desc=Object.assign({}, it.desc||{});
      ["ja","en","ko","vi"].forEach(l=>{ if(o.name&&o.name[l]) name[l]=o.name[l]; if(o.desc&&o.desc[l]) desc[l]=o.desc[l]; });
      await DB.saveMenuItem({ id:it.id, cat:it.cat, price:it.price, available:it.available, photo:it.photo, name, desc });
      n++;
    }
    U.toast(`已用 AI 翻譯並更新 ${n} 項（含分類）`);
  }catch(e){ aiError(e); }
  finally{ if(btn){ btn.disabled=false; btn.textContent="一鍵 AI 翻譯全菜單"; } }
}

/* 圖片壓縮：縮到最長邊 720px 的 JPEG dataURL */
function compressImage(file){
  return new Promise(res=>{
    const img=new Image(); const fr=new FileReader();
    fr.onload=()=>{ img.onload=()=>{
      const max=720; let {width:w,height:h}=img;
      if(w>h && w>max){ h=h*max/w; w=max; } else if(h>max){ w=w*max/h; h=max; }
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      res(cv.toDataURL("image/jpeg",0.82));
    }; img.src=fr.result; };
    fr.readAsDataURL(file);
  });
}
/* 線上模式：上傳照片到 Supabase Storage (bucket: menu) */
async function uploadPhoto(dataURL){
  try{
    const sb=DB._sb; if(!sb) return null;
    const blob=await (await fetch(dataURL)).blob();
    const name=`item_${Date.now()}.jpg`;
    const { error }=await sb.storage.from("menu").upload(name, blob, { contentType:"image/jpeg", upsert:true });
    if(error){ console.warn(error); return null; }
    return sb.storage.from("menu").getPublicUrl(name).data.publicUrl;
  }catch(e){ console.warn(e); return null; }
}

/* ---------------- 菜單看板 (上傳給訂位頁顯示的整份菜單照片) ---------------- */
function renderBoard(){
  const box=U.$("#boardList"); if(!box) return; box.innerHTML="";
  if(!MENU_PHOTOS.length){ box.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="big">🖼️</div>尚未上傳菜單照片，點「上傳菜單照片」新增</div>'; return; }
  MENU_PHOTOS.forEach(p=>{
    const card=U.el(`<div class="card" style="padding:10px">
      <div style="width:100%;height:150px;border-radius:10px;background:var(--miku-light) url('${p.url}') center/cover no-repeat;margin-bottom:8px"></div>
      <b style="color:var(--miku-deep)">${p.title||'(未命名)'}</b>
      <div style="color:var(--text-soft);font-size:13px;margin:4px 0 8px;line-height:1.5">${p.desc||''}</div>
      <div style="display:flex;gap:8px"><button class="btn ghost sm e">編輯</button><button class="btn ghost sm d" style="color:var(--danger)">刪除</button></div>
    </div>`);
    card.querySelector(".e").onclick=()=>editPhoto(p);
    card.querySelector(".d").onclick=async()=>{ if(confirm("刪除這張菜單照片？")){ await DB.deleteMenuPhoto(p.id); U.toast("已刪除"); } };
    box.appendChild(card);
  });
}
function editPhoto(p){
  const isNew=!p; p=p||{title:"",desc:"",url:""};
  let url=p.url;
  const m=U.modal(isNew?"上傳菜單照片":"編輯菜單照片",`
    <div class="photo-prev" id="pp" style="${url?`background-image:url('${url}')`:''}">${url?'':'<span>選擇照片</span>'}</div>
    <div class="field"><label>照片</label><input type="file" accept="image/*" id="pf"></div>
    <div class="field"><label>標題</label><input id="pt" value="${attr(p.title||'')}"></div>
    <div class="field"><label>說明文字</label><textarea id="pd" rows="2">${(p.desc||'').replace(/</g,'&lt;')}</textarea></div>`,
    `<button class="btn ghost cancel">取消</button><button class="btn primary save">儲存</button>`);
  m.el.querySelector("#pf").onchange=async(e)=>{ const f=e.target.files[0]; if(!f) return; url=await compressImage(f); const pv=m.el.querySelector("#pp"); pv.style.backgroundImage=`url('${url}')`; pv.innerHTML=""; };
  m.el.querySelector(".cancel").onclick=m.close;
  m.el.querySelector(".save").onclick=async()=>{
    if(!url){ U.toast("請先選擇照片"); return; }
    let finalUrl=url;
    if(url.startsWith("data:") && window.MIKU_LIVE) finalUrl=await uploadPhoto(url)||url;
    await DB.saveMenuPhoto({ ...(p.id?{id:p.id}:{}), url:finalUrl, title:m.el.querySelector("#pt").value.trim(), desc:m.el.querySelector("#pd").value.trim() });
    m.close(); U.toast("已儲存");
  };
}
U.$("#addPhoto").onclick=()=>editPhoto(null);

/* ---------------- 優惠折扣 ---------------- */
function discLabel(d){ return d.type==="percent" ? (d.value+"% 折扣") : ("折抵 "+U.money(d.value)); }
function renderPromo(){
  const box=U.$("#discList"); if(!box) return; box.innerHTML="";
  if(!DISCOUNTS.length){ box.innerHTML='<div class="empty"><div class="big">🎟️</div>尚無折扣，點「新增折扣」建立</div>'; return; }
  DISCOUNTS.forEach(d=>{
    const row=U.el(`<div class="mrow">
      <div class="nm"><b>${d.name}</b><small>${discLabel(d)}</small></div>
      <span class="tag ${d.active!==false?'ok':'off'}">${d.active!==false?'啟用中':'已停用'}</span>
      <button class="btn ghost sm edit">編輯</button>
      <label class="switch"><input type="checkbox" ${d.active!==false?'checked':''}><span class="slider"></span></label>
    </div>`);
    row.querySelector("input").onchange=async(e)=>{ await DB.saveDiscount({id:d.id,active:e.target.checked}); U.toast(e.target.checked?"已啟用":"已停用"); };
    row.querySelector(".edit").onclick=()=>editDiscount(d);
    box.appendChild(row);
  });
}
function editDiscount(d){
  const isNew=!d; d=d||{name:"",type:"percent",value:0,active:true};
  const m=U.modal(isNew?"新增折扣":"編輯折扣",`
    <div class="field"><label>折扣名稱 (例如：老客戶優惠)</label><input id="dName" value="${attr(d.name||'')}"></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>類型</label><select id="dType">
        <option value="percent" ${d.type==='percent'?'selected':''}>百分比 (%)</option>
        <option value="amount" ${d.type==='amount'?'selected':''}>固定金額</option>
      </select></div>
      <div class="field"><label>數值</label><input type="number" id="dValue" value="${d.value||0}"></div>
    </div>`,
    `${isNew?'':'<button class="btn ghost del" style="margin-right:auto;color:var(--danger)">刪除</button>'}
     <button class="btn ghost cancel">取消</button><button class="btn primary save">儲存</button>`);
  m.el.querySelector(".cancel").onclick=m.close;
  const del=m.el.querySelector(".del");
  if(del) del.onclick=async()=>{ if(confirm("刪除此折扣？")){ await DB.deleteDiscount(d.id); m.close(); U.toast("已刪除"); } };
  m.el.querySelector(".save").onclick=async()=>{
    const name=m.el.querySelector("#dName").value.trim();
    if(!name){ U.toast("請輸入名稱"); return; }
    await DB.saveDiscount({ ...(d.id?{id:d.id}:{}), name, type:m.el.querySelector("#dType").value, value:+m.el.querySelector("#dValue").value||0, active:d.active!==false });
    m.close(); U.toast("已儲存");
  };
}
U.$("#addDisc").onclick=()=>editDiscount(null);

/* ---------------- 訂位管理 ---------------- */
let resvFilter="";
function resvStatusTag(s){ const m={booked:["warn","待確認"],confirmed:["ok","已確認"],seated:["teal","已入座"],cancelled:["off","已取消"],no_show:["off","未到"]}; const [c,t]=m[s]||["grey",s]; return `<span class="tag ${c}">${t}</span>`; }
function rDay(r){ try{ return new Date(r.reserve_at).toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}); }catch(_){ return ""; } }
function tablesLabel(r){ const ids=(r.tables&&r.tables.length)?r.tables:(r.table_id?[r.table_id]:[]); if(!ids.length) return "未排桌"; return "桌 "+ids.map(id=>(TABLES.find(t=>t.id===id)||{}).label||id).join("+"); }
function renderResv(){
  const box=U.$("#resvList"); if(!box) return; box.innerHTML="";
  let list=RESV.slice().sort((a,b)=>new Date(a.reserve_at)-new Date(b.reserve_at));
  if(resvFilter) list=list.filter(r=>rDay(r)===resvFilter);
  if(!list.length){ box.innerHTML='<div class="empty"><div class="big">📅</div>沒有訂位資料</div>'; return; }
  list.forEach(r=>{
    const row=U.el(`<div class="mrow" style="flex-wrap:wrap">
      <div class="nm" style="flex:1;min-width:160px">
        <b>${r.name||"(未填)"}</b> ${resvStatusTag(r.status)}
        <small>${U.twTime(r.reserve_at)} · ${r.party_size||1}人 · ${tablesLabel(r)}${r.phone?(" · "+r.phone):""}${r.source==='web'?' · 線上':''}</small>
        ${r.note?`<small style="color:var(--miku-pink-d)">＊${r.note}</small>`:''}
      </div>
      <button class="btn ghost sm e">編輯</button>
      ${r.status!=="confirmed"?'<button class="btn primary sm ok">確認</button>':''}
      ${r.status!=="cancelled"?'<button class="btn ghost sm cx" style="color:var(--danger)">取消</button>':''}
    </div>`);
    row.querySelector(".e").onclick=()=>editReservation(r);
    const ok=row.querySelector(".ok"); if(ok) ok.onclick=async()=>{ await DB.updateReservation(r.id,{status:"confirmed"}); U.toast("已確認"); };
    const cx=row.querySelector(".cx"); if(cx) cx.onclick=async()=>{ if(confirm("取消這筆訂位？")){ await DB.updateReservation(r.id,{status:"cancelled"}); U.toast("已取消"); } };
    box.appendChild(row);
  });
}
function editReservation(r){
  const isNew=!r; r=r||{name:"",phone:"",party_size:2,reserve_at:"",note:"",tables:[],status:"booked"};
  const dt=r.reserve_at?new Date(r.reserve_at):null;
  const dval=dt?dt.toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}):"";
  const tval=dt?dt.toLocaleTimeString("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit"}):(SETTINGS.open_time||"11:30");
  const sel=new Set((r.tables&&r.tables.length)?r.tables:(r.table_id?[r.table_id]:[]));
  const dineTables=TABLES.filter(t=>t.zone!=="take");
  const tableChecks=dineTables.map(t=>`<label style="display:inline-flex;align-items:center;gap:5px;font-weight:600;color:var(--text);margin:0 12px 8px 0"><input type="checkbox" data-tb="${t.id}" ${sel.has(t.id)?'checked':''} style="width:auto">${t.label}${t.zone==='bar'?'(單)':''}</label>`).join("");
  const m=U.modal(isNew?"新增訂位":"編輯訂位",`
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>姓名</label><input id="rvName" value="${attr(r.name||'')}"></div>
      <div class="field"><label>電話</label><input id="rvPhone" value="${attr(r.phone||'')}"></div>
      <div class="field"><label>日期</label><input type="date" id="rvDate" value="${dval}"></div>
      <div class="field"><label>時間</label><input type="time" id="rvTime" value="${tval}"></div>
    </div>
    <div class="field"><label>人數</label><input type="number" id="rvParty" value="${r.party_size||2}" min="1"></div>
    <div class="field"><label>安排桌次 / 併桌 (可多選)</label><div style="padding-top:6px">${tableChecks||"（無桌位）"}</div></div>
    <div class="field"><label>備註</label><input id="rvNote" value="${attr(r.note||'')}"></div>`,
    `${isNew?'':'<button class="btn ghost del" style="margin-right:auto;color:var(--danger)">刪除</button>'}
     <button class="btn ghost cancel">取消</button><button class="btn primary save">儲存</button>`);
  m.el.querySelector(".cancel").onclick=m.close;
  const del=m.el.querySelector(".del"); if(del) del.onclick=async()=>{ if(confirm("刪除這筆訂位？")){ await DB.deleteReservation(r.id); m.close(); U.toast("已刪除"); } };
  m.el.querySelector(".save").onclick=async()=>{
    const name=m.el.querySelector("#rvName").value.trim();
    const date=m.el.querySelector("#rvDate").value, time=m.el.querySelector("#rvTime").value;
    if(!name){ U.toast("請填寫姓名"); return; }
    if(!date||!time){ U.toast("請選擇日期與時間"); return; }
    const tables=Array.from(m.el.querySelectorAll("[data-tb]")).filter(x=>x.checked).map(x=>x.dataset.tb);
    const payload={ name, phone:m.el.querySelector("#rvPhone").value.trim(), party_size:+m.el.querySelector("#rvParty").value||1,
      reserve_at:new Date(`${date}T${time}`).toISOString(), note:m.el.querySelector("#rvNote").value.trim(),
      tables, table_id:tables[0]||null };
    if(isNew){ payload.status="confirmed"; payload.source="manual"; await DB.createReservation(payload); }
    else { await DB.updateReservation(r.id, payload); }
    m.close(); U.toast("已儲存");
  };
}
U.$("#addResv").onclick=()=>editReservation(null);
U.$("#resvDate").onchange=(e)=>{ resvFilter=e.target.value; renderResv(); };
U.$("#resvClear").onclick=()=>{ resvFilter=""; U.$("#resvDate").value=""; renderResv(); };

/* ---------------- 報表 ---------------- */
function renderReport(){
  const todayStr=new Date().toLocaleDateString("zh-TW");
  U.$("#today").textContent=todayStr;
  const start=new Date(); start.setHours(0,0,0,0);
  const paid=ORDERS.filter(o=>o.status==="paid" && new Date(o.paid_at||o.created_at)>=start);
  const allToday=ORDERS.filter(o=>new Date(o.created_at)>=start);
  const revenue=paid.reduce((s,o)=>s+(o.total||o.subtotal||0),0);
  const avg=paid.length?Math.round(revenue/paid.length):0;

  U.$("#statGrid").innerHTML=`
    ${stat("營業額", U.money(revenue))}
    ${stat("已結帳單數", paid.length)}
    ${stat("客單價", U.money(avg))}
    ${stat("今日總訂單", allToday.length)}`;

  // 熱銷
  const tally={};
  paid.forEach(o=>(o.items||[]).forEach(l=>{ tally[l.name]=(tally[l.name]||0)+l.qty; }));
  const top=Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxQ=top.length?top[0][1]:1;
  U.$("#topSellers").innerHTML = top.length ? top.map(([n,q])=>bar(n,q,maxQ,q+" 份")).join("")
    : '<div class="empty">今日尚無結帳資料</div>';

  // 時段
  const hours={};
  allToday.forEach(o=>{ const h=new Date(o.created_at).getHours(); hours[h]=(hours[h]||0)+1; });
  const hk=Object.keys(hours).map(Number).sort((a,b)=>a-b);
  const maxH=Math.max(1,...Object.values(hours));
  U.$("#hourly").innerHTML = hk.length ? hk.map(h=>bar(`${h}:00–${h+1}:00`, hours[h], maxH, hours[h]+" 單")).join("")
    : '<div class="empty">今日尚無訂單</div>';
}
const stat=(k,v)=>`<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
const bar=(lbl,val,max,txt)=>`<div class="bar-row"><div class="lbl">${lbl}</div>
  <div class="bar-track"><div class="bar-fill" style="width:${Math.max(6,val/max*100)}%"></div></div>
  <div class="val">${txt}</div></div>`;

/* ---------------- 店家設定 (可編輯，存於資料庫) ---------------- */
const PAY_LABELS={cash:"現金",card:"信用卡",linepay:"LINE Pay",jkopay:"街口支付"};
function renderSettings(){
  const s=SETTINGS||{};
  const c=U.$("#settingsCard");
  const payChecks=Object.keys(PAY_LABELS).map(p=>`
    <label style="display:inline-flex;align-items:center;gap:6px;font-weight:600;margin-right:14px;color:var(--text)">
      <input type="checkbox" data-pay="${p}" ${(s.payments||[]).includes(p)?'checked':''} style="width:auto"> ${PAY_LABELS[p]}
    </label>`).join("");
  c.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <h3 style="margin:0;color:var(--miku-deep)">店家設定</h3>
      <span class="tag ${window.MIKU_LIVE?'ok':'warn'}">${window.MIKU_LIVE?'線上 Supabase':'示範 本機'}</span>
    </div>

    <b style="color:var(--miku-deep)">基本資料</b>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 4px">
      <div class="field"><label>店名</label><input id="s_name" value="${attr(s.name)}"></div>
      <div class="field"><label>分店</label><input id="s_branch" value="${attr(s.branch)}"></div>
      <div class="field"><label>電話</label><input id="s_phone" value="${attr(s.phone)}"></div>
      <div class="field"><label>營業時間</label><input id="s_hours" value="${attr(s.hours)}"></div>
    </div>
    <div class="field"><label>地址</label><input id="s_address" value="${attr(s.address)}"></div>
    <div class="field"><label>公休 / 備註</label><input id="s_closed" value="${attr(s.closed)}"></div>

    <b style="color:var(--miku-deep)">社群連結</b>
    <div class="grid" style="grid-template-columns:1fr;gap:8px;margin:8px 0 4px">
      <div class="field" style="margin:0"><label>Facebook</label><input id="s_fb" value="${attr(s.fb)}"></div>
      <div class="field" style="margin:0"><label>Instagram</label><input id="s_ig" value="${attr(s.ig)}"></div>
      <div class="field" style="margin:0"><label>Threads</label><input id="s_threads" value="${attr(s.threads)}"></div>
      <div class="field"><label>LINE 加好友連結 (訂位後引導)</label><input id="s_line" value="${attr(s.line_url)}" placeholder="https://line.me/R/ti/p/@你的ID"></div>
    </div>

    <b style="color:var(--miku-deep)">結帳與付款</b>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 4px">
      <div class="field"><label>服務費比例 (%)</label><input type="number" id="s_service" min="0" max="100" value="${(s.service_rate||0)*100}"></div>
      <div class="field"><label>付款方式 (僅記錄)</label><div style="padding-top:8px">${payChecks}</div></div>
    </div>

    <b style="color:var(--miku-deep)">座位 / 訂位</b>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 4px">
      <div class="field"><label>平均用餐時間 (分)</label><input type="number" id="s_dining" value="${s.avg_dining_min||75}"></div>
      <div class="field"><label>訂位緩衝 (分)</label><input type="number" id="s_buffer" value="${s.reservation_buffer_min||15}"></div>
    </div>
    <div class="field"><label>生魚片計重單位 (可改克/兩)</label><input id="s_wunit" value="${attr(s.weight_unit||'斤')}" placeholder="斤"></div>
    <label style="display:inline-flex;align-items:center;gap:8px;font-weight:700;color:var(--text);margin-right:18px">
      <input type="checkbox" id="s_accept" ${s.accept_reservation!==false?'checked':''} style="width:auto"> 接受訂位
    </label>
    <label style="display:inline-flex;align-items:center;gap:8px;font-weight:700;color:var(--text)">
      <input type="checkbox" id="s_multi" ${s.multilang!==false?'checked':''} style="width:auto"> 線上菜單提供五國語言
    </label>

    <b style="color:var(--miku-deep)">營業時段與地圖 (訂位頁使用)</b>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 4px">
      <div class="field"><label>營業開始</label><input type="time" id="s_open" value="${attr(s.open_time||'11:30')}"></div>
      <div class="field"><label>營業結束</label><input type="time" id="s_close" value="${attr(s.close_time||'23:00')}"></div>
    </div>
    <div class="field"><label>公休日 (勾選；訂位頁將禁止這幾天)</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:6px">
        ${["日","一","二","三","四","五","六"].map((d,i)=>`<label style="display:inline-flex;gap:5px;align-items:center;font-weight:600;color:var(--text)"><input type="checkbox" data-day="${i}" ${(s.closed_days||[]).includes(i)?'checked':''} style="width:auto">週${d}</label>`).join("")}
      </div>
    </div>
    <div class="field"><label>Google Map 查詢字串 / 地址 (導航用)</label><input id="s_map" value="${attr(s.map_query||s.address||'')}"></div>

    <div style="display:flex;gap:10px;margin-top:18px;align-items:center;flex-wrap:wrap">
      <button class="btn primary lg" id="saveSettings">儲存設定</button>
      ${window.MIKU_LIVE?'':'<button class="btn ghost" id="resetBtn" style="color:var(--danger)">重置示範資料</button>'}
    </div>
    <p style="color:var(--text-soft);font-size:13px;margin-top:12px">設定即時套用到前台與客人點餐頁。${window.MIKU_LIVE?'已同步到所有裝置。':''}</p>`;

  c.querySelector("#saveSettings").onclick=async()=>{
    const val=id=>c.querySelector("#"+id).value.trim();
    const payments=Array.from(c.querySelectorAll("[data-pay]")).filter(x=>x.checked).map(x=>x.dataset.pay);
    const patch={
      name:val("s_name"), branch:val("s_branch"), phone:val("s_phone"), hours:val("s_hours"),
      address:val("s_address"), closed:val("s_closed"),
      fb:val("s_fb"), ig:val("s_ig"), threads:val("s_threads"),
      service_rate:(+val("s_service")||0)/100,
      payments: payments.length?payments:["cash"],
      avg_dining_min:+val("s_dining")||75,
      reservation_buffer_min:+val("s_buffer")||15,
      accept_reservation:c.querySelector("#s_accept").checked,
      multilang:c.querySelector("#s_multi").checked,
      open_time:val("s_open")||"11:30",
      close_time:val("s_close")||"23:00",
      closed_days:Array.from(c.querySelectorAll("[data-day]")).filter(x=>x.checked).map(x=>+x.dataset.day),
      map_query:val("s_map"),
      weight_unit:val("s_wunit")||"斤",
      line_url:val("s_line")
    };
    SETTINGS=await DB.saveSettings(patch);
    U.applySettings(SETTINGS);
    U.toast("設定已儲存 ✓");
  };
  const r=c.querySelector("#resetBtn");
  if(r) r.onclick=async()=>{ if(confirm("重置所有示範資料 (菜單/訂單/座位/設定)？")){ await DB.resetDemo(); U.toast("已重置"); location.reload(); } };
}
function attr(v){ return (v==null?"":String(v)).replace(/"/g,"&quot;"); }
