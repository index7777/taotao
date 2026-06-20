/* 共用工具 */
window.U = {
  cfg: window.MIKU_POS_CONFIG || {},
  settings: {},
  /* 把後台店家設定套用到執行階段 (供 pos/order 既有的 cfg.* 引用直接使用) */
  applySettings(s){
    if(!s) return;
    this.settings = s;
    const c = this.cfg;
    if(s.service_rate!=null) c.SERVICE_CHARGE_RATE = +s.service_rate;
    if(s.avg_dining_min!=null) c.AVG_DINING_MINUTES = +s.avg_dining_min;
    if(s.reservation_buffer_min!=null) c.RESERVATION_BUFFER_MIN = +s.reservation_buffer_min;
    if(Array.isArray(s.payments)) c.PAYMENT_METHODS = s.payments;
    if(s.name) c.RESTAURANT_NAME = s.name + (s.branch ? (" · "+s.branch) : "");
  },
  money(n){ return (this.cfg.CURRENCY||"NT$") + Math.round(n).toLocaleString(); },
  /* 菜單顯示價格標籤 (固定價/秤重/單點選項) */
  priceLabel(it){
    if(it.price_type==="weight") return "秤重計價";
    if(it.price_type==="piece"){ const ps=(it.options||[]).map(o=>o.price); return ps.length?(this.money(Math.min(...ps))+" 起"):"—"; }
    return this.money(it.price);
  },
  el(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; },
  $(s,r){ return (r||document).querySelector(s); },
  $$(s,r){ return Array.from((r||document).querySelectorAll(s)); },
  toast(msg){
    let w=this.$(".toast-wrap"); if(!w){ w=this.el('<div class="toast-wrap"></div>'); document.body.appendChild(w); }
    const t=this.el(`<div class="toast">${msg}</div>`); w.appendChild(t);
    setTimeout(()=>{ t.style.opacity="0"; setTimeout(()=>t.remove(),250); }, 2200);
  },
  modal(title, bodyHtml, footHtml){
    const bg=this.el(`<div class="modal-bg"><div class="modal">
      <div class="head">${title}<button class="x">&times;</button></div>
      <div class="body">${bodyHtml}</div>
      ${footHtml?`<div class="foot">${footHtml}</div>`:""}
    </div></div>`);
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector(".x").onclick=close;
    bg.onclick=(e)=>{ if(e.target===bg) close(); };
    return { el:bg, close };
  },
  // 菜單品項縮圖：有照片用照片，否則顯示「實體照片準備中」浮水印
  thumb(it, size){
    size = size||64;
    if(it.photo) return `<div class="thumb" style="width:${size}px;height:${size}px;background-image:url('${it.photo}')"></div>`;
    return `<div class="thumb ph" style="width:${size}px;height:${size}px"><span>照片準備中</span></div>`;
  },
  statusTag(s){
    const map={pending:["warn","st_pending"],cooking:["teal","st_cooking"],served:["ok","st_served"],paid:["grey","st_paid"]};
    const [cls,key]=map[s]||["grey",s];
    return `<span class="tag ${cls}">${window.I18N?I18N.t(key):s}</span>`;
  },
  minutesSince(iso){ if(!iso) return 0; return Math.floor((Date.now()-new Date(iso).getTime())/60000); },
  /* 台灣時間格式 */
  twTime(iso){ try{ return new Date(iso).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}); }catch(_){ return iso||""; } },

  /* 計重品項點餐：直接輸入金額 或 依重量×單價 二擇一 */
  weightModal(it, unit, cb){
    const cur=this.cfg.CURRENCY||"NT$";
    const nm=window.I18N?I18N.itemName(it):((it.name&&it.name.zh)||"");
    const m=this.modal(nm+" — 計重", `
      <div class="seg" style="margin-bottom:14px">
        <button data-m="amount" class="active">直接輸入金額</button>
        <button data-m="weight">依重量(${unit})計價</button>
      </div>
      <div id="amtBox">
        <div class="field"><label>金額 (${cur})</label><input id="wAmt" type="number" inputmode="numeric" placeholder="例如 200"></div>
        <p style="color:var(--text-soft);font-size:12px;margin:0">現場秤重後輸入金額；可重複加入不同部位 (例如鮭魚 200 + 鮭魚肚 100)。</p>
      </div>
      <div id="wtBox" class="hidden">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>重量 (${unit})</label><input id="wQty" type="number" step="0.05" placeholder="0.5"></div>
          <div class="field"><label>每${unit}單價</label><input id="wUP" type="number" value="${it.unit_price||''}" placeholder="單價"></div>
        </div>
        <div class="sumrow total"><span>小計</span><span id="wCalc">${cur}0</span></div>
      </div>`,
      `<button class="btn ghost" id="wC">取消</button><button class="btn primary" id="wOk">加入</button>`);
    let mode="amount";
    const seg=m.el.querySelectorAll(".seg button");
    seg.forEach(b=>b.onclick=()=>{ mode=b.dataset.m; seg.forEach(x=>x.classList.toggle("active",x===b));
      m.el.querySelector("#amtBox").classList.toggle("hidden",mode!=="amount");
      m.el.querySelector("#wtBox").classList.toggle("hidden",mode!=="weight"); });
    const calc=()=>{ const q=+m.el.querySelector("#wQty").value||0, up=+m.el.querySelector("#wUP").value||0;
      m.el.querySelector("#wCalc").textContent=cur+Math.round(q*up).toLocaleString(); };
    m.el.querySelector("#wQty").oninput=calc; m.el.querySelector("#wUP").oninput=calc;
    m.el.querySelector("#wC").onclick=m.close;
    m.el.querySelector("#wOk").onclick=()=>{
      let price=0,label="";
      if(mode==="amount"){ price=Math.round(+m.el.querySelector("#wAmt").value||0); label=""; }
      else { const q=+m.el.querySelector("#wQty").value||0, up=+m.el.querySelector("#wUP").value||0;
        price=Math.round(q*up); label=q?(q+unit+(up?(" ×"+cur+up):"")):""; }
      if(price<=0){ this.toast("請輸入金額"); return; }
      cb({price,label}); m.close();
    };
  },

  /* 單點選項 (一顆/五顆…) */
  pieceModal(it, cb){
    const cur=this.cfg.CURRENCY||"NT$";
    const nm=window.I18N?I18N.itemName(it):((it.name&&it.name.zh)||"");
    const opts=(it.options||[]).map((o,i)=>`<div class="opt-row" data-i="${i}">${o.label}<span class="op">${cur}${o.price}</span></div>`).join("");
    const m=this.modal(nm, opts||'<div class="empty">尚未設定選項</div>');
    m.el.querySelectorAll(".opt-row").forEach(r=>r.onclick=()=>{
      const o=(it.options||[])[+r.dataset.i]; cb({price:o.price,label:o.label}); m.close();
    });
  }
};
