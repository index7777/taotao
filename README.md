# TaoTao POS — 餐飲點餐系統 (HTML PWA)

以 Hatsune Miku V6 配色發想的餐飲業點餐系統。純前端 PWA + Supabase 後端，可部署到 Vercel。
支援**桌邊服務**與**快餐外帶**、**QR 自助點餐**、**多語言菜單 (中日英韓越)**、**即時座位連動**、**菜單照片更新**、**結帳**、**後台即時上下架**與**營運報表**。

> LINE@ bot 訂位辨識為最後階段，已預留資料欄位 (`reservations.source / line_user_id`)，尚未串接。

---

## 兩種運作模式

| 模式 | 條件 | 行為 |
|------|------|------|
| **示範模式** | 未填 Supabase 金鑰 | 資料存在瀏覽器；**同一台裝置不同分頁即時連動**。適合先試用。 |
| **線上模式** | 已填 Supabase 金鑰 | 真正**跨裝置即時同步** (店員平板＋客人手機＋廚房)。 |

切換方式：編輯 `assets/js/config.js`，填入 `SUPABASE_URL` 與 `SUPABASE_ANON_KEY` 即自動進入線上模式。

---

## 先在本機試用 (示範模式)

PWA 需透過 http(s) 開啟 (不能直接雙擊檔案)。任選一種：

```bash
# Python
python -m http.server 5173
# 或 Node
npx serve .
```

瀏覽器開 `http://localhost:5173/` 進入首頁，三個入口：

- 🧾 **前台 POS** `/pos/` — 點選座位 → 點餐 → 送單 → 結帳；底部分頁可看「進行中訂單」。
- ⚙️ **後台管理** `/admin/` — 菜單管理 (新增/編輯/照片/即時開關)、營運報表、設定。
- 📱 **QR 客人點餐** `/order/?table=T3` — 模擬客人掃 3 號桌 QR。

**體驗即時連動**：開兩個分頁，一個前台、一個 `/order/?table=T3`，在客人端送單，前台「訂單」分頁與座位狀態會立即更新。

---

## 部署到正式環境 (Supabase + Vercel + GitHub)

### 1. 建立 Supabase 後端
1. 到 <https://supabase.com> 建立專案。
2. 左側 **SQL Editor** → 貼上 `supabase/schema.sql` 全部內容 → Run。會建立資料表、Realtime、種子資料。
3. **Storage** → 新增 bucket 名稱 `menu`，設為 **Public** (存菜單照片)。
4. **Project Settings → API** → 複製 `Project URL` 與 `anon public` key。
5. 把兩個值填進 `assets/js/config.js`。

### 2. 推上 GitHub
```bash
cd Pos
git init
git add .
git commit -m "TaoTao POS 初版"
git branch -M main
git remote add origin https://github.com/<你的帳號>/miku-pos.git
git push -u origin main
```

### 3. 部署到 Vercel
1. 到 <https://vercel.com> → New Project → 匯入剛剛的 GitHub repo。
2. Framework Preset 選 **Other** (這是純靜態站，不需 build)。
3. Deploy。完成後會得到網址，例如 `https://miku-pos.vercel.app`。

> ⚠️ 安全提醒：`config.js` 內的 anon key 會公開在前端 (這是 Supabase 設計上允許的)，但目前 `schema.sql` 的 RLS 為「開放匿名讀寫」方便快速上線。**正式營運前**請收緊 RLS：菜單開放讀取、寫入/結帳改為需員工登入。

### 4. 產生桌上 QR Code
每桌 QR 指向：`https://你的網域/order/?table=T3` (T1、T2…依桌號)。
可用任何 QR 產生器或之後加進後台。

---

## 你提到、但目前以「預留 / 模擬」處理的項目

- **LINE@ bot 訂位辨識**：資料表已備妥 `reservations`，含 `source='line'`、`line_user_id`。串接需另建後端 webhook (LINE Messaging API)，屬最後階段。
- **發票機 / 金流**：結帳目前**只記錄付款方式** (現金/卡/LINE Pay/街口)，未接發票機與金流，符合你的需求。
- **庫存控管**：依需求暫不實作；以「即時開關品項」替代。

## 建議的後續強化 (對應規劃討論)
廚房出單機 (ESC/POS)、員工角色權限登入、併桌/分帳、會員集點、台灣電子發票 (綠界/ECPay)、多分店、菜單翻譯人工校對流程。

---

## 檔案結構
```
Pos/
├─ index.html            首頁 / 角色入口
├─ manifest.webmanifest  PWA 設定
├─ sw.js                 Service Worker (離線快取)
├─ vercel.json           Vercel 設定
├─ supabase/schema.sql   後端建表 SQL
├─ pos/index.html        前台 POS
├─ admin/index.html      後台管理
├─ order/index.html      QR 客人點餐
└─ assets/
   ├─ icon.svg
   ├─ css/theme.css      Miku 配色主題
   └─ js/
      ├─ config.js       ★ 填 Supabase 金鑰處
      ├─ i18n.js         多語言字典 (中日英韓越)
      ├─ db.js           資料層 (示範/線上雙模式)
      ├─ util.js         共用工具
      ├─ pos.js          前台邏輯
      ├─ admin.js        後台邏輯
      └─ order.js        客人點餐邏輯
```
