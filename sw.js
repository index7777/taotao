/* Service Worker — 網路優先 (network-first)
   線上時一律取最新檔案，離線時才用快取，避免更新後載入舊版造成錯誤。 */
const CACHE = "taotao-pos-v4";
const SHELL = [
  "./","./index.html",
  "./pos/index.html","./admin/index.html","./order/index.html","./reserve/index.html","./wait/index.html",
  "./assets/css/theme.css",
  "./assets/js/config.js","./assets/js/i18n.js","./assets/js/db.js",
  "./assets/js/util.js","./assets/js/pos.js","./assets/js/admin.js","./assets/js/order.js","./assets/js/reserve.js","./assets/js/wait.js",
  "./assets/icon-192.png","./manifest.webmanifest"
];
self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("activate", (e)=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e)=>{
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // 外部請求(Supabase 等)走網路
  if (e.request.method !== "GET") return;
  // 網路優先：先抓最新，存入快取；離線才用快取備援
  e.respondWith(
    fetch(e.request).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(()=> caches.match(e.request))
  );
});
