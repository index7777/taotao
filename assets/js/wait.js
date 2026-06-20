/* ============================================================
   候位看板 (公開頁) — 僅顯示順序與編號，自動刷新
   ============================================================ */
const DB = window.MikuDB;
const twDate = ()=> new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});

async function render(){
  const all = await DB.getWaitlist();
  const today = twDate();
  const waiting = all.filter(w=> (w.day||"")===today && w.status==="waiting")
                     .sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
  const s = await DB.getSettings();
  U.$("#sName").textContent = (s.name||"") + (s.branch?(" · "+s.branch):"");
  U.$("#cnt").textContent = waiting.length;
  const box = U.$("#wlist");
  if(!waiting.length){ box.innerHTML='<div class="empty"><div class="big">🎉</div>目前無人候位，歡迎入座</div>'; }
  else {
    box.innerHTML = waiting.map((w,i)=>`
      <div class="wrow ${i===0?'next':''}">
        <div class="ord">${i+1}</div>
        <div class="num">${w.number}</div>
        ${i===0?'<span class="tagnext">即將入座</span>':''}
      </div>`).join("");
  }
  U.$("#upd").textContent = "更新時間 "+new Date().toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
}

(async()=>{
  await DB.init();
  DB.on("waitlist", render);
  await render();
  setInterval(render, 10000);   // 固定每 10 秒刷新
})();
