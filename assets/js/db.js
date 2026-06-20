/* ============================================================
   資料層 — 雙模式
   • 線上模式 (live): 連到 Supabase，支援多裝置 Realtime 同步
   • 示範模式 (demo): 瀏覽器本機儲存 + BroadcastChannel 跨分頁即時連動
   兩種模式對外提供相同 API，App 端不需修改。
   ============================================================ */
(function () {
  const CFG = window.MIKU_POS_CONFIG || {};
  const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  /* ---------- 種子資料 (示範模式 & 初次建庫參考) ---------- */
  const SEED_CATEGORIES = [
    { id: "c1", sort: 1, name: { zh:"生魚片", ja:"刺身", en:"Sashimi", ko:"사시미", vi:"Cá sống (Sashimi)" } },
    { id: "c2", sort: 2, name: { zh:"海鮮單點", ja:"海鮮単品", en:"Seafood à la carte", ko:"해산물 단품", vi:"Hải sản gọi món" } },
    { id: "c3", sort: 3, name: { zh:"綜合拼盤", ja:"盛り合わせ", en:"Assorted Platters", ko:"모듬 모음", vi:"Khay thập cẩm" } },
    { id: "c4", sort: 4, name: { zh:"炸物・丼飯", ja:"揚げ物・丼", en:"Fried & Rice Bowls", ko:"튀김·덮밥", vi:"Đồ chiên & Cơm" } },
    { id: "c5", sort: 5, name: { zh:"飲品", ja:"ドリンク", en:"Drinks", ko:"음료", vi:"Đồ uống" } }
  ];
  const m = (zh,ja,en,ko,vi)=>({zh,ja,en,ko,vi});
  const W=(id,name)=>({ id, cat:"c1", price:0, available:true, photo:null, price_type:"weight", unit_price:0,
    name, desc:m("本店生魚片依秤重計價","量り売り","Priced by weight","무게로 계산","Tính theo cân") });
  const F=(id,cat,price,name)=>({ id, cat, price, available:true, photo:null, price_type:"fixed", name, desc:{} });
  const SEED_ITEMS = [
    // 生魚片 (依秤重計價：可輸入金額或依重量×單價)
    W("m1", m("鮭魚","サーモン","Salmon","연어","Cá hồi")),
    W("m2", m("鮭魚肚","サーモン腹身","Salmon Belly","연어 뱃살","Bụng cá hồi")),
    W("m3", m("鮪魚","マグロ","Tuna","참치","Cá ngừ")),
    W("m4", m("旗魚","カジキ","Swordfish","황새치","Cá kiếm")),
    W("m5", m("稻燒鰹魚","藁焼き鰹","Straw-seared Bonito","가다랑어 짚불구이","Cá ngừ vằn nướng rơm")),
    W("m6", m("日本青甘","ハマチ","Yellowtail (Hamachi)","방어","Cá cam Nhật")),
    W("m7", m("澎湖海鱺","コビア","Cobia (Penghu)","코비아","Cá bớp Bành Hồ")),
    W("m8", m("日本海膽","うに","Sea Urchin (Uni)","성게알","Nhím biển")),
    // 海鮮單點 (選項計價)
    { id:"m9", cat:"c2", price:0, available:true, photo:null, price_type:"piece",
      options:[{label:"一顆",price:50},{label:"任選五顆",price:200}],
      name:m("干貝 / 天使蝦 / 生蠔","ホタテ / 甘えび / 牡蠣","Scallop / Sweet Shrimp / Oyster","관자 / 새우 / 굴","Sò điệp / Tôm / Hàu"), desc:{} },
    { id:"m10", cat:"c2", price:0, available:true, photo:null, price_type:"piece",
      options:[{label:"一尾",price:40},{label:"任選三尾",price:100}],
      name:m("甜蝦 / 花枝","甘えび / イカ","Sweet Shrimp / Squid","단새우 / 오징어","Tôm ngọt / Mực"), desc:{} },
    { id:"m11", cat:"c2", price:0, available:true, photo:null, price_type:"piece",
      options:[{label:"半條",price:100},{label:"一條",price:180}],
      name:m("櫻花尾「黃金魚」","桜尾「黄金魚」","Sakura Golden Fish","사쿠라 황금어","Cá vàng sakura"), desc:{} },
    // 綜合拼盤 (固定價)
    F("m12","c3",200, m("綜合拼盤 (小)","盛り合わせ(小)","Assorted Platter (S)","모듬 (소)","Khay thập cẩm (nhỏ)")),
    F("m13","c3",300, m("綜合拼盤 (大)","盛り合わせ(大)","Assorted Platter (L)","모듬 (대)","Khay thập cẩm (lớn)")),
    F("m14","c3",200, m("烤鮭魚頭","焼きサーモンかぶと","Grilled Salmon Head","연어 머리 구이","Đầu cá hồi nướng")),
    // 炸物・丼飯 (固定價)
    F("m15","c4",130, m("月見牛丼","月見牛丼","Tsukimi Beef Bowl","츠키미 규동","Cơm bò trứng")),
    F("m16","c4",130, m("日式炸豬排丼","カツ丼","Katsu Pork Bowl","돈카츠 덮밥","Cơm heo chiên xù")),
    F("m17","c4",130, m("挪威鯖魚丼","サバ丼","Norwegian Mackerel Bowl","고등어 덮밥","Cơm cá thu")),
    F("m18","c4",140, m("炸竹莢魚丼","アジフライ丼","Fried Horse Mackerel Bowl","전갱이 튀김 덮밥","Cơm cá nục chiên")),
    F("m19","c4",100, m("明太子烤山藥","明太子の山芋焼き","Mentaiko Grilled Yam","명란 마구이","Khoai mỡ nướng mentaiko")),
    F("m20","c4",100, m("炸薯條","フライドポテト","French Fries","감자튀김","Khoai tây chiên")),
    F("m21","c4",100, m("揚出豆腐","揚げ出し豆腐","Agedashi Tofu","아게다시 두부","Đậu hũ chiên")),
    F("m22","c4",150, m("可樂餅 (2個)","コロッケ2個","Croquette (2pc)","고로케 2개","Korokke (2 cái)")),
    F("m23","c4",100, m("帶殼炸蝦 (2隻)","殻付きえびフライ2尾","Fried Shrimp (2pc)","새우튀김 2마리","Tôm chiên (2 con)")),
    F("m24","c4",100, m("烤大白蝦 (3隻)","白えび焼き3尾","Grilled Prawn (3pc)","대하구이 3마리","Tôm nướng (3 con)")),
    F("m25","c4",130, m("溫玉明太子烏龍麵","温玉明太子うどん","Mentaiko Udon w/ Egg","온천란 명란 우동","Udon mentaiko trứng")),
    F("m26","c4",80,  m("豆皮烏龍湯麵","きつねうどん","Tofu-skin Udon","유부 우동","Udon đậu hũ")),
    // 飲品
    F("m27","c5",40, m("綠茶","緑茶","Green Tea","녹차","Trà xanh")),
    F("m28","c5",40, m("麥茶","麦茶","Barley Tea","보리차","Trà lúa mạch")),
    F("m29","c5",60, m("彈珠汽水","ラムネ","Ramune Soda","라무네","Soda Ramune"))
  ];
  // 座位：1-5 吧台單人席(bar)、6-10 四人桌(dine)，依實際平面圖
  const SEED_TABLES = [
    { id:"T1", label:"1", zone:"bar",  seats:1, status:"free", order_id:null, seated_at:null },
    { id:"T2", label:"2", zone:"bar",  seats:1, status:"free", order_id:null, seated_at:null },
    { id:"T3", label:"3", zone:"bar",  seats:1, status:"free", order_id:null, seated_at:null },
    { id:"T4", label:"4", zone:"bar",  seats:1, status:"free", order_id:null, seated_at:null },
    { id:"T5", label:"5", zone:"bar",  seats:1, status:"free", order_id:null, seated_at:null },
    { id:"T6", label:"6", zone:"dine", seats:4, status:"free", order_id:null, seated_at:null },
    { id:"T7", label:"7", zone:"dine", seats:4, status:"free", order_id:null, seated_at:null },
    { id:"T8", label:"8", zone:"dine", seats:4, status:"free", order_id:null, seated_at:null },
    { id:"T9", label:"9", zone:"dine", seats:4, status:"free", order_id:null, seated_at:null },
    { id:"T10",label:"10",zone:"dine", seats:4, status:"free", order_id:null, seated_at:null }
  ];

  // 店家營運設定 (全部於後台編輯，存於資料庫)
  const DEFAULT_SETTINGS = {
    name:"濤濤鮮魚舖",
    branch:"錦西店",
    phone:"02 2550 1404",
    address:"台北市大同區錦西街82號",
    hours:"11:30–23:00",
    closed:"週一、週二公休",
    open_time:"11:30",              // 營業開始 (訂位時段驗證)
    close_time:"23:00",             // 營業結束
    closed_days:[1,2],              // 公休星期 (0=日,1=一,…,6=六)
    map_query:"濤濤鮮魚舖 台北市大同區錦西街82號",  // Google Map 查詢字串
    fb:"https://www.facebook.com/Howdon82/",
    ig:"https://www.instagram.com/taotaofish_82/reels/",
    threads:"https://www.threads.com/@taotaofish_82",
    service_rate:0,                 // 服務費比例 (0 = 不收)
    payments:["cash","linepay","jkopay","card"],
    avg_dining_min:75,              // 平均用餐時間 (分) — 座位/訂位分析用
    reservation_buffer_min:15,      // 訂位緩衝
    accept_reservation:true,        // 是否接受訂位
    multilang:true,                 // 線上菜單是否提供五國語言切換
    weight_unit:"斤",               // 生魚片計重單位 (可改「克」「兩」等)
    line_url:"",                    // LINE@ 加好友連結 (訂位後引導)
    gemini_key:"",                  // Gemini API 金鑰 (後台填寫，供一鍵翻譯)
    gemini_model:"gemini-2.0-flash" // 翻譯模型
  };

  const KEYS = { cat:"miku.categories", item:"miku.items", tbl:"miku.tables", ord:"miku.orders", res:"miku.reservations", set:"miku.settings", mp:"miku.menuphotos", wait:"miku.waitlist", disc:"miku.discounts" };
  const twDate = ()=> new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}); // YYYY-MM-DD (台灣)
  const uid = (p)=> p + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

  /* ============================================================
     示範後端 (localStorage + BroadcastChannel)
     ============================================================ */
  function DemoBackend(){
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("miku-pos") : null;
    const listeners = {};
    const read  = (k,def)=>{ try{ const v=JSON.parse(localStorage.getItem(k)); return v??def; }catch(_){ return def; } };
    const write = (k,v)=> localStorage.setItem(k, JSON.stringify(v));

    const SEED_VERSION="2026-06-19-taotao-realmenu";  // 改版時更新此字串會自動重載示範菜單
    function seedIfEmpty(){
      const fresh = localStorage.getItem("miku.seedver")!==SEED_VERSION;
      // 菜單/分類/座位：版本變更時自動重載 (示範用)
      if(fresh || !localStorage.getItem(KEYS.cat)) write(KEYS.cat, SEED_CATEGORIES);
      if(fresh || !localStorage.getItem(KEYS.item)) write(KEYS.item, SEED_ITEMS);
      if(fresh || !localStorage.getItem(KEYS.tbl)) write(KEYS.tbl, SEED_TABLES);
      // 訂單/訂位/設定/菜單照片：僅在不存在時建立 (保留使用者資料)
      if(!localStorage.getItem(KEYS.ord)) write(KEYS.ord, []);
      if(!localStorage.getItem(KEYS.res)) write(KEYS.res, []);
      if(!localStorage.getItem(KEYS.set)) write(KEYS.set, DEFAULT_SETTINGS);
      if(!localStorage.getItem(KEYS.mp)) write(KEYS.mp, []);
      if(!localStorage.getItem(KEYS.wait)) write(KEYS.wait, []);
      if(!localStorage.getItem(KEYS.disc)) write(KEYS.disc, [
        { id:"d1", name:"老客戶優惠", type:"percent", value:10, active:true },
        { id:"d2", name:"折抵 50 元", type:"amount", value:50, active:true }
      ]);
      localStorage.setItem("miku.seedver", SEED_VERSION);
    }
    function emit(topic){
      (listeners[topic]||[]).forEach(cb=>cb());
      (listeners["*"]||[]).forEach(cb=>cb(topic));
      if(bc) bc.postMessage({topic});
    }
    if(bc) bc.onmessage = (e)=>{
      const tp = e.data && e.data.topic;
      (listeners[tp]||[]).forEach(cb=>cb());
      (listeners["*"]||[]).forEach(cb=>cb(tp));
    };
    // 跨分頁 storage 事件 (備援，當 BroadcastChannel 不可用)
    window.addEventListener("storage",(e)=>{
      const map = {[KEYS.cat]:"categories",[KEYS.item]:"items",[KEYS.tbl]:"tables",[KEYS.ord]:"orders",[KEYS.res]:"reservations"};
      const tp = map[e.key]; if(tp){ (listeners[tp]||[]).forEach(cb=>cb()); (listeners["*"]||[]).forEach(cb=>cb(tp)); }
    });

    return {
      mode:"demo",
      async init(){ seedIfEmpty(); },
      on(topic, cb){ (listeners[topic]=listeners[topic]||[]).push(cb); },

      async getCategories(){ return read(KEYS.cat,[]).slice().sort((a,b)=>a.sort-b.sort); },
      async getMenu(){ return read(KEYS.item,[]); },
      async getTables(){ return read(KEYS.tbl,[]); },
      async getOrders(){ return read(KEYS.ord,[]); },
      async getReservations(){ return read(KEYS.res,[]); },
      async getSettings(){ return Object.assign({}, DEFAULT_SETTINGS, read(KEYS.set,{})); },
      async saveSettings(patch){ const s=Object.assign({}, DEFAULT_SETTINGS, read(KEYS.set,{}), patch); write(KEYS.set, s); emit("settings"); return s; },
      async getMenuPhotos(){ return read(KEYS.mp,[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0)); },
      async saveMenuPhoto(p){ const a=read(KEYS.mp,[]); if(p.id){ const i=a.findIndex(x=>x.id===p.id); if(i>=0) a[i]={...a[i],...p}; else a.push(p); } else { p.id=uid("mp"); p.sort=a.length+1; a.push(p); } write(KEYS.mp,a); emit("menuphotos"); return p; },
      async deleteMenuPhoto(id){ write(KEYS.mp, read(KEYS.mp,[]).filter(x=>x.id!==id)); emit("menuphotos"); },
      async getWaitlist(){ return read(KEYS.wait,[]); },
      async addWait(w){ const a=read(KEYS.wait,[]); const d=twDate();
        const next=a.filter(x=>x.day===d).reduce((mx,x)=>Math.max(mx,+x.number||0),0)+1;
        w.id=uid("w"); w.number=String(next).padStart(4,"0"); w.day=d; w.status="waiting"; w.created_at=new Date().toISOString();
        a.push(w); write(KEYS.wait,a); emit("waitlist"); return w; },
      async updateWait(id,patch){ const a=read(KEYS.wait,[]); const w=a.find(x=>x.id===id); if(w){ Object.assign(w,patch); write(KEYS.wait,a); emit("waitlist"); } return w; },
      async getDiscounts(){ return read(KEYS.disc,[]); },
      async saveDiscount(d){ const a=read(KEYS.disc,[]); if(d.id){ const i=a.findIndex(x=>x.id===d.id); if(i>=0) a[i]={...a[i],...d}; else a.push(d); } else { d.id=uid("d"); a.push(d); } write(KEYS.disc,a); emit("discounts"); return d; },
      async deleteDiscount(id){ write(KEYS.disc, read(KEYS.disc,[]).filter(x=>x.id!==id)); emit("discounts"); },

      async saveMenuItem(it){
        const items = read(KEYS.item,[]);
        if(it.id){ const i=items.findIndex(x=>x.id===it.id); if(i>=0) items[i]={...items[i],...it}; else items.push(it); }
        else { it.id=uid("m"); items.push(it); }
        write(KEYS.item, items); emit("items"); return it;
      },
      async toggleItem(id, available){
        const items = read(KEYS.item,[]); const i=items.findIndex(x=>x.id===id);
        if(i>=0){ items[i].available=available; write(KEYS.item,items); emit("items"); }
      },
      async deleteMenuItem(id){
        write(KEYS.item, read(KEYS.item,[]).filter(x=>x.id!==id)); emit("items");
      },
      async saveCategory(c){
        const cats=read(KEYS.cat,[]); if(c.id){const i=cats.findIndex(x=>x.id===c.id); if(i>=0)cats[i]={...cats[i],...c}; else cats.push(c);} else {c.id=uid("c"); c.sort=cats.length+1; cats.push(c);}
        write(KEYS.cat,cats); emit("categories"); return c;
      },

      async createOrder(o){
        const orders = read(KEYS.ord,[]);
        o.id = uid("o"); o.created_at = new Date().toISOString(); o.status = o.status||"pending";
        o.number = (orders.length%999)+1;
        orders.push(o); write(KEYS.ord, orders);
        if(o.table_id){ // 連動桌位
          const tbls=read(KEYS.tbl,[]); const t=tbls.find(x=>x.id===o.table_id);
          if(t){ t.status="occupied"; t.order_id=o.id; t.seated_at=t.seated_at||o.created_at; write(KEYS.tbl,tbls); emit("tables"); }
        }
        emit("orders"); return o;
      },
      async addItems(orderId, newItems){
        const orders=read(KEYS.ord,[]); const o=orders.find(x=>x.id===orderId); if(!o) return;
        o.items = o.items.concat(newItems); o.status = o.status==="paid"?"pending":o.status;
        write(KEYS.ord, orders); emit("orders"); return o;
      },
      async updateOrder(orderId, patch){
        const orders=read(KEYS.ord,[]); const o=orders.find(x=>x.id===orderId); if(!o) return;
        Object.assign(o, patch); write(KEYS.ord, orders); emit("orders");
        if(patch.status==="paid" && o.table_id){
          const tbls=read(KEYS.tbl,[]); const t=tbls.find(x=>x.id===o.table_id);
          if(t){ t.status="free"; t.order_id=null; t.seated_at=null; write(KEYS.tbl,tbls); emit("tables"); }
        }
        return o;
      },
      async setTableStatus(tableId, status){
        const tbls=read(KEYS.tbl,[]); const t=tbls.find(x=>x.id===tableId);
        if(t){ t.status=status; if(status==="free"){t.order_id=null;t.seated_at=null;} else if(!t.seated_at){t.seated_at=new Date().toISOString();}
          write(KEYS.tbl,tbls); emit("tables"); }
      },
      async mergeTables(ids, party){ const tbls=read(KEYS.tbl,[]); const gid="g"+Date.now().toString(36);
        tbls.forEach(t=>{ if(ids.includes(t.id)){ t.merge_group=gid; t.merge_party=party; } }); write(KEYS.tbl,tbls); emit("tables"); return gid; },
      async unmergeGroup(gid){ const tbls=read(KEYS.tbl,[]); tbls.forEach(t=>{ if(t.merge_group===gid){ t.merge_group=null; t.merge_party=null; } }); write(KEYS.tbl,tbls); emit("tables"); },
      async createReservation(r){
        const res=read(KEYS.res,[]); r.id=uid("r"); r.created_at=new Date().toISOString(); r.source=r.source||"manual"; r.status=r.status||"booked";
        res.push(r); write(KEYS.res,res); emit("reservations"); return r;
      },
      async updateReservation(id,patch){ const res=read(KEYS.res,[]); const r=res.find(x=>x.id===id); if(r){ Object.assign(r,patch); write(KEYS.res,res); emit("reservations"); } return r; },
      async deleteReservation(id){ write(KEYS.res, read(KEYS.res,[]).filter(x=>x.id!==id)); emit("reservations"); },
      async resetDemo(){ Object.values(KEYS).forEach(k=>localStorage.removeItem(k)); seedIfEmpty();
        ["categories","items","tables","orders","reservations"].forEach(emit); }
    };
  }

  /* ============================================================
     線上後端 (Supabase) — 對應同一組 API
     需先在 Supabase 執行 supabase/schema.sql 建表。
     ============================================================ */
  function LiveBackend(){
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const listeners = {};
    const fire = (tp)=>{ (listeners[tp]||[]).forEach(cb=>cb()); (listeners["*"]||[]).forEach(cb=>cb(tp)); };
    function sub(table, topic){
      sb.channel("rt-"+table).on("postgres_changes",{event:"*",schema:"public",table},()=>fire(topic)).subscribe();
    }
    return {
      mode:"live",
      async init(){ ["categories","menu_items","tables","orders","reservations","settings","menu_photos","waitlist","discounts"]
        .forEach((t,i)=>sub(t,["categories","items","tables","orders","reservations","settings","menuphotos","waitlist","discounts"][i])); },
      on(topic,cb){ (listeners[topic]=listeners[topic]||[]).push(cb); },

      async getCategories(){ const {data}=await sb.from("categories").select("*").order("sort"); return data||[]; },
      async getMenu(){ const {data}=await sb.from("menu_items").select("*"); return data||[]; },
      async getTables(){ const {data}=await sb.from("tables").select("*").order("label"); return data||[]; },
      async getOrders(){ const {data}=await sb.from("orders").select("*").order("created_at",{ascending:false}); return data||[]; },
      async getReservations(){ const {data}=await sb.from("reservations").select("*"); return data||[]; },
      async getSettings(){ const {data}=await sb.from("settings").select("data").eq("id",1).single(); return Object.assign({}, DEFAULT_SETTINGS, (data&&data.data)||{}); },
      async saveSettings(patch){ const cur=await this.getSettings(); const s=Object.assign({}, cur, patch);
        await sb.from("settings").upsert({id:1,data:s}); return s; },
      async getMenuPhotos(){ const {data}=await sb.from("menu_photos").select("*").order("sort"); return data||[]; },
      async saveMenuPhoto(p){ const {data}=await sb.from("menu_photos").upsert(p).select().single(); return data; },
      async deleteMenuPhoto(id){ await sb.from("menu_photos").delete().eq("id",id); },
      async getWaitlist(){ const {data}=await sb.from("waitlist").select("*").order("created_at"); return data||[]; },
      async addWait(w){ const d=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});
        const {data:today}=await sb.from("waitlist").select("number").eq("day",d);
        const next=(today||[]).reduce((mx,x)=>Math.max(mx,+x.number||0),0)+1;
        w.number=String(next).padStart(4,"0"); w.day=d; w.status="waiting";
        const {data}=await sb.from("waitlist").insert(w).select().single(); return data; },
      async updateWait(id,patch){ const {data}=await sb.from("waitlist").update(patch).eq("id",id).select().single(); return data; },
      async getDiscounts(){ const {data}=await sb.from("discounts").select("*"); return data||[]; },
      async saveDiscount(d){ const {data}=await sb.from("discounts").upsert(d).select().single(); return data; },
      async deleteDiscount(id){ await sb.from("discounts").delete().eq("id",id); },

      async saveMenuItem(it){ const {data}=await sb.from("menu_items").upsert(it).select().single(); return data; },
      async toggleItem(id,a){ await sb.from("menu_items").update({available:a}).eq("id",id); },
      async deleteMenuItem(id){ await sb.from("menu_items").delete().eq("id",id); },
      async saveCategory(c){ const {data}=await sb.from("categories").upsert(c).select().single(); return data; },

      async createOrder(o){ const {data}=await sb.from("orders").insert(o).select().single();
        if(o.table_id) await sb.from("tables").update({status:"occupied",order_id:data.id,seated_at:new Date().toISOString()}).eq("id",o.table_id);
        return data; },
      async addItems(orderId,newItems){ const {data:o}=await sb.from("orders").select("items").eq("id",orderId).single();
        await sb.from("orders").update({items:(o.items||[]).concat(newItems)}).eq("id",orderId); },
      async updateOrder(orderId,patch){ const {data}=await sb.from("orders").update(patch).eq("id",orderId).select().single();
        if(patch.status==="paid" && data && data.table_id) await sb.from("tables").update({status:"free",order_id:null,seated_at:null}).eq("id",data.table_id);
        return data; },
      async setTableStatus(tableId,status){ const patch={status}; if(status==="free"){patch.order_id=null;patch.seated_at=null;} else patch.seated_at=new Date().toISOString();
        await sb.from("tables").update(patch).eq("id",tableId); },
      async mergeTables(ids,party){ const gid="g"+Date.now().toString(36); await sb.from("tables").update({merge_group:gid,merge_party:party}).in("id",ids); return gid; },
      async unmergeGroup(gid){ await sb.from("tables").update({merge_group:null,merge_party:null}).eq("merge_group",gid); },
      async createReservation(r){ const {data}=await sb.from("reservations").insert(r).select().single(); return data; },
      async updateReservation(id,patch){ const {data}=await sb.from("reservations").update(patch).eq("id",id).select().single(); return data; },
      async deleteReservation(id){ await sb.from("reservations").delete().eq("id",id); },
      async resetDemo(){ alert("線上模式不支援重置示範資料"); },
      _sb: sb
    };
  }

  // 對外暴露
  window.MikuDB = LIVE ? LiveBackend() : DemoBackend();
  window.MIKU_LIVE = LIVE;
  window.MIKU_SEED = { SEED_CATEGORIES, SEED_ITEMS, SEED_TABLES };
})();
