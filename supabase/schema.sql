-- ============================================================
-- TaoTao POS — Supabase 資料庫 Schema
-- 在 Supabase 專案的 SQL Editor 貼上並執行。
-- 多語言欄位以 JSONB 儲存：{ "zh":"", "ja":"", "en":"", "ko":"", "vi":"" }
-- ============================================================

-- 分類
create table if not exists categories (
  id   text primary key,
  sort int  not null default 0,
  name jsonb not null            -- 多語言名稱
);

-- 菜單品項
create table if not exists menu_items (
  id        text primary key,
  cat       text references categories(id) on delete set null,
  price     numeric not null default 0,
  emoji     text,
  photo     text,                -- Supabase Storage 公開網址或 dataURL
  available boolean not null default true,   -- 是否販售 (後台即時開關)
  name      jsonb not null,      -- 多語言名稱
  "desc"    jsonb,               -- 多語言敘述
  price_type text not null default 'fixed',  -- fixed / weight / piece
  unit_price numeric default 0,  -- weight 類型：每單位(斤)價，0=現場秤重
  options    jsonb,              -- piece 類型：[{"label":"一顆","price":50}]
  updated_at timestamptz default now()
);

-- 桌位 / 座位
create table if not exists tables (
  id        text primary key,    -- 例: T1
  label     text not null,       -- 顯示桌號
  zone      text not null default 'dine',  -- dine=桌邊, take=外帶/快餐
  seats     int  not null default 2,
  status    text not null default 'free',  -- free / occupied / reserved
  order_id  text,
  seated_at timestamptz,
  merge_group text,                        -- 併桌群組 id (同組視為同一桌)
  merge_party int                          -- 併桌總人數
);

-- 訂單 (items 以 JSONB 陣列儲存明細，簡化結構)
-- items 範例: [{ "item_id":"m1","name":"...","price":260,"qty":2,"note":"" }]
create table if not exists orders (
  id          text primary key default ('o' || replace(gen_random_uuid()::text,'-','')),
  number      int,
  mode        text not null default 'dine',   -- dine / take
  table_id    text references tables(id) on delete set null,
  party       int,                            -- 人數 (QR 點餐填寫)
  merge_group text,                            -- 併桌群組
  merged_label text,                           -- 併桌座位 例 "3+5"
  source      text not null default 'pos',    -- pos / qr / line
  items       jsonb not null default '[]',
  status      text not null default 'pending', -- pending/cooking/served/paid
  note        text,
  subtotal    numeric default 0,
  service     numeric default 0,
  total       numeric default 0,
  pay_method  text,                            -- cash/card/linepay/jkopay
  cash_received numeric,                        -- 現金結帳：收取金額
  cash_change   numeric,                        -- 現金結帳：找零
  discount_name text,                           -- 套用的折扣名稱
  discount_amount numeric default 0,            -- 折扣金額
  checkout_requested boolean default false,     -- 客人按「我要買單」
  checkout_requested_at timestamptz,
  created_at  timestamptz default now(),
  paid_at     timestamptz
);

-- 訂位 (含 LINE 來源欄位，供日後 bot 寫入)
create table if not exists reservations (
  id          text primary key default ('r' || replace(gen_random_uuid()::text,'-','')),
  name        text,
  phone       text,
  party_size  int not null default 2,
  reserve_at  timestamptz not null,
  table_id    text references tables(id) on delete set null,
  status      text not null default 'booked',  -- booked/confirmed/seated/cancelled/no_show
  source      text not null default 'manual',  -- manual / web / line
  line_user_id text,
  tables      jsonb,                            -- 安排桌次/併桌 (桌 id 陣列)
  note        text,
  created_at  timestamptz default now()
);

-- 店家營運設定 (單列 id=1，全部於後台編輯)
create table if not exists settings (
  id   int primary key default 1,
  data jsonb not null
);

-- 菜單看板照片 (後台上傳，顯示於訂位頁菜單分頁)
create table if not exists menu_photos (
  id    text primary key default ('mp' || replace(gen_random_uuid()::text,'-','')),
  url   text not null,
  title text,
  "desc" text,
  sort  int default 0
);

-- 候位 (每日四位數流水號)
create table if not exists waitlist (
  id         text primary key default ('w' || replace(gen_random_uuid()::text,'-','')),
  number     text,           -- 四位數編號
  day        text,           -- 當日日期 YYYY-MM-DD (台灣)，每日重算
  name       text,
  phone      text,
  party_size int default 1,
  status     text not null default 'waiting',  -- waiting / seated / cancelled
  created_at timestamptz default now()
);
create index if not exists idx_wait_day on waitlist(day, status);

-- 自訂折扣 (結帳時套用)
create table if not exists discounts (
  id     text primary key default ('d' || replace(gen_random_uuid()::text,'-','')),
  name   text not null,
  type   text not null default 'percent',  -- percent / amount
  value  numeric not null default 0,
  active boolean default true
);

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created on orders(created_at);
create index if not exists idx_res_time on reservations(reserve_at);

-- ============================================================
-- Realtime：讓前台/後台/客人端即時連動
-- ============================================================
alter publication supabase_realtime add table menu_items;
alter publication supabase_realtime add table tables;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table settings;
alter publication supabase_realtime add table menu_photos;
alter publication supabase_realtime add table waitlist;
alter publication supabase_realtime add table discounts;

-- ============================================================
-- RLS — 示範用：開放匿名讀寫，方便快速上線。
-- ★ 正式上線務必收緊：讀menu開放，寫入需登入員工帳號。
-- ============================================================
alter table categories  enable row level security;
alter table menu_items  enable row level security;
alter table tables      enable row level security;
alter table orders      enable row level security;
alter table reservations enable row level security;
alter table settings    enable row level security;
alter table menu_photos enable row level security;
alter table waitlist    enable row level security;
alter table discounts   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categories','menu_items','tables','orders','reservations','settings','menu_photos','waitlist','discounts']
  loop
    execute format('drop policy if exists "anon_all_%1$s" on %1$s;', t);
    execute format('create policy "anon_all_%1$s" on %1$s for all using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================
-- 種子資料
-- ============================================================
insert into categories (id,sort,name) values
 ('c1',1,'{"zh":"主廚推薦","ja":"おすすめ","en":"Chef''s Pick","ko":"셰프 추천","vi":"Đầu bếp đề xuất"}'),
 ('c2',2,'{"zh":"生魚片","ja":"刺身","en":"Sashimi","ko":"사시미","vi":"Cá sống (Sashimi)"}'),
 ('c3',3,'{"zh":"海鮮丼飯","ja":"海鮮丼","en":"Seafood Bowls","ko":"해산물 덮밥","vi":"Cơm hải sản"}'),
 ('c4',4,'{"zh":"定食","ja":"定食","en":"Set Meals","ko":"정식","vi":"Suất ăn set"}'),
 ('c5',5,'{"zh":"湯品","ja":"汁物","en":"Soups","ko":"국물","vi":"Món canh"}'),
 ('c6',6,'{"zh":"飲品","ja":"ドリンク","en":"Drinks","ko":"음료","vi":"Đồ uống"}')
on conflict (id) do nothing;

insert into menu_items (id,cat,price,available,name,"desc") values
 ('m1','c1',380,true,'{"zh":"綜合生魚片 (5種)","ja":"刺身盛り合わせ","en":"Assorted Sashimi (5 kinds)","ko":"모듬 사시미 (5종)","vi":"Sashimi thập cẩm (5 loại)"}','{"zh":"每日嚴選五種當令鮮魚","ja":"毎日厳選の鮮魚5種","en":"Five daily-selected fresh fish","ko":"매일 엄선한 제철 생선 5종","vi":"5 loại cá tươi chọn mỗi ngày"}'),
 ('m2','c1',280,true,'{"zh":"鮭魚親子丼","ja":"サーモンといくらの親子丼","en":"Salmon & Roe Bowl","ko":"연어 이쿠라 덮밥","vi":"Cơm cá hồi & trứng cá hồi"}','{"zh":"鮭魚與鮭魚卵雙重享受","ja":"サーモンといくらの贅沢","en":"Salmon topped with salmon roe","ko":"연어와 연어알의 조화","vi":"Cá hồi phủ trứng cá hồi"}'),
 ('m3','c2',220,true,'{"zh":"鮭魚生魚片","ja":"サーモン刺身","en":"Salmon Sashimi","ko":"연어 사시미","vi":"Sashimi cá hồi"}','{"zh":"挪威空運鮭魚","ja":"ノルウェー産サーモン","en":"Air-flown Norwegian salmon","ko":"노르웨이산 연어","vi":"Cá hồi Na Uy"}'),
 ('m4','c2',260,true,'{"zh":"鮪魚生魚片","ja":"マグロ刺身","en":"Tuna Sashimi","ko":"참치 사시미","vi":"Sashimi cá ngừ"}','{"zh":"鮮甜赤身","ja":"赤身の旨み","en":"Lean, sweet red tuna","ko":"담백한 붉은 살","vi":"Thịt nạc cá ngừ ngọt"}'),
 ('m5','c2',200,true,'{"zh":"旗魚生魚片","ja":"カジキ刺身","en":"Swordfish Sashimi","ko":"황새치 사시미","vi":"Sashimi cá kiếm"}','{"zh":"口感緊實","ja":"締まった食感","en":"Firm texture","ko":"탱탱한 식감","vi":"Thịt săn chắc"}'),
 ('m6','c2',240,false,'{"zh":"北海道甜蝦","ja":"甘えび","en":"Sweet Shrimp (Amaebi)","ko":"단새우","vi":"Tôm ngọt Hokkaido"}','{"zh":"入口即化的鮮甜","ja":"とろける甘さ","en":"Melts in your mouth","ko":"입에서 살살 녹는 단맛","vi":"Tan ngay trong miệng"}'),
 ('m7','c3',320,true,'{"zh":"海鮮散壽司丼","ja":"海鮮ちらし丼","en":"Kaisen Chirashi Bowl","ko":"해산물 지라시 덮밥","vi":"Cơm chirashi hải sản"}','{"zh":"多種海鮮鋪滿醋飯","ja":"彩り海鮮たっぷり","en":"Assorted seafood over sushi rice","ko":"모듬 해산물 듬뿍","vi":"Hải sản phủ đầy cơm giấm"}'),
 ('m8','c3',280,true,'{"zh":"厚切鮪魚丼","ja":"マグロ丼","en":"Tuna Rice Bowl","ko":"참치 덮밥","vi":"Cơm cá ngừ"}','{"zh":"厚切赤身鮪魚","ja":"厚切りマグロ","en":"Thick-cut tuna","ko":"두툼한 참치","vi":"Cá ngừ cắt dày"}'),
 ('m9','c3',300,true,'{"zh":"炙燒鮭魚丼","ja":"炙りサーモン丼","en":"Seared Salmon Bowl","ko":"불향 연어 덮밥","vi":"Cơm cá hồi áp chảo"}','{"zh":"表面炙烤更添香氣","ja":"香ばしい炙り","en":"Lightly seared, aromatic","ko":"겉을 살짝 구워 고소함","vi":"Áp chảo thơm lừng"}'),
 ('m10','c4',260,true,'{"zh":"鹽烤鯖魚定食","ja":"塩さば定食","en":"Grilled Mackerel Set","ko":"고등어 소금구이 정식","vi":"Set cá thu nướng muối"}','{"zh":"附白飯、味噌湯、小菜","ja":"ご飯・味噌汁・小鉢付き","en":"With rice, miso soup & sides","ko":"밥·미소국·반찬 포함","vi":"Kèm cơm, canh miso, món phụ"}'),
 ('m11','c4',300,true,'{"zh":"味噌鯛魚定食","ja":"鯛の味噌焼き定食","en":"Miso Sea Bream Set","ko":"도미 미소구이 정식","vi":"Set cá tráp miso"}','{"zh":"味噌醃烤鯛魚","ja":"鯛の味噌漬け焼き","en":"Miso-marinated grilled sea bream","ko":"미소 양념 도미구이","vi":"Cá tráp ướp miso nướng"}'),
 ('m12','c4',280,true,'{"zh":"綜合炸物定食","ja":"天ぷら定食","en":"Mixed Tempura Set","ko":"모듬 튀김 정식","vi":"Set tempura thập cẩm"}','{"zh":"海鮮與蔬菜天婦羅","ja":"海鮮と野菜の天ぷら","en":"Seafood & vegetable tempura","ko":"해산물·야채 튀김","vi":"Tempura hải sản & rau"}'),
 ('m13','c5',80,true,'{"zh":"味噌魚湯","ja":"魚のあら味噌汁","en":"Miso Fish Soup","ko":"생선 미소국","vi":"Canh miso cá"}','{"zh":"鮮魚熬煮湯頭","ja":"魚の旨み","en":"Simmered with fresh fish","ko":"생선 우린 국물","vi":"Ninh từ cá tươi"}'),
 ('m14','c5',90,true,'{"zh":"蛤蜊湯","ja":"あさり汁","en":"Clam Soup","ko":"바지락국","vi":"Canh nghêu"}','{"zh":"清甜蛤蜊","ja":"あさりの旨み","en":"Sweet clam broth","ko":"시원한 바지락","vi":"Nước nghêu ngọt thanh"}'),
 ('m15','c5',100,true,'{"zh":"海鮮味噌湯","ja":"海鮮味噌汁","en":"Seafood Miso Soup","ko":"해산물 미소국","vi":"Canh miso hải sản"}','{"zh":"多種海鮮料","ja":"海鮮たっぷり","en":"Loaded with seafood","ko":"해산물 가득","vi":"Đầy ắp hải sản"}'),
 ('m16','c6',40,true,'{"zh":"綠茶","ja":"緑茶","en":"Green Tea","ko":"녹차","vi":"Trà xanh"}','{"zh":"無糖","ja":"無糖","en":"Unsweetened","ko":"무가당","vi":"Không đường"}'),
 ('m17','c6',40,true,'{"zh":"麥茶","ja":"麦茶","en":"Barley Tea","ko":"보리차","vi":"Trà lúa mạch"}','{"zh":"冰涼解膩","ja":"冷たい麦茶","en":"Chilled & refreshing","ko":"시원한 보리차","vi":"Mát, giải ngấy"}'),
 ('m18','c6',60,true,'{"zh":"彈珠汽水","ja":"ラムネ","en":"Ramune Soda","ko":"라무네","vi":"Soda Ramune"}','{"zh":"日式碳酸飲料","ja":"日本のラムネ","en":"Japanese marble soda","ko":"일본식 탄산음료","vi":"Nước ngọt có ga kiểu Nhật"}')
on conflict (id) do nothing;

-- 1-5 吧台單人席、6-10 四人桌 (依實際平面圖)
insert into tables (id,label,zone,seats,status) values
 ('T1','1','bar',1,'free'),('T2','2','bar',1,'free'),
 ('T3','3','bar',1,'free'),('T4','4','bar',1,'free'),
 ('T5','5','bar',1,'free'),
 ('T6','6','dine',4,'free'),('T7','7','dine',4,'free'),
 ('T8','8','dine',4,'free'),('T9','9','dine',4,'free'),
 ('T10','10','dine',4,'free')
on conflict (id) do nothing;

-- 店家設定種子 (錦西店)
insert into settings (id,data) values (1, '{
  "name":"濤濤鮮魚舖","branch":"錦西店","phone":"02 2550 1404",
  "address":"台北市大同區錦西街82號","hours":"11:30–23:00","closed":"週一、週二公休",
  "fb":"https://www.facebook.com/Howdon82/",
  "ig":"https://www.instagram.com/taotaofish_82/reels/",
  "threads":"https://www.threads.com/@taotaofish_82",
  "open_time":"11:30","close_time":"23:00","closed_days":[1,2],
  "map_query":"濤濤鮮魚舖 台北市大同區錦西街82號",
  "service_rate":0,"payments":["cash","linepay","jkopay","card"],
  "avg_dining_min":75,"reservation_buffer_min":15,"accept_reservation":true,
  "multilang":true,"weight_unit":"斤","gemini_key":"","gemini_model":"gemini-2.0-flash"
}') on conflict (id) do nothing;

-- 自訂折扣種子
insert into discounts (id,name,type,value,active) values
 ('d1','老客戶優惠','percent',10,true),
 ('d2','折抵 50 元','amount',50,true)
on conflict (id) do nothing;

-- ============================================================
-- Storage：菜單照片 (在 Supabase Dashboard > Storage 建立)
--   1. 建立 bucket 名稱 menu，設為 Public
--   2. 後台上傳照片即會存到此 bucket
-- ============================================================
