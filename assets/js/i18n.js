/* ============================================================
   多語言 i18n — 中(zh) 日(ja) 英(en) 韓(ko) 越(vi)
   ============================================================ */
window.I18N = {
  langs: [
    { code: "zh", label: "中文" },
    { code: "ja", label: "日本語" },
    { code: "en", label: "English" },
    { code: "ko", label: "한국어" },
    { code: "vi", label: "Tiếng Việt" }
  ],
  dict: {
    menu:        { zh:"菜單", ja:"メニュー", en:"Menu", ko:"메뉴", vi:"Thực đơn" },
    cart:        { zh:"購物車", ja:"カート", en:"Cart", ko:"장바구니", vi:"Giỏ hàng" },
    add:         { zh:"加入", ja:"追加", en:"Add", ko:"담기", vi:"Thêm" },
    order_now:   { zh:"送出訂單", ja:"注文する", en:"Place Order", ko:"주문하기", vi:"Đặt món" },
    total:       { zh:"合計", ja:"合計", en:"Total", ko:"합계", vi:"Tổng cộng" },
    subtotal:    { zh:"小計", ja:"小計", en:"Subtotal", ko:"소계", vi:"Tạm tính" },
    service:     { zh:"服務費", ja:"サービス料", en:"Service", ko:"봉사료", vi:"Phí phục vụ" },
    qty:         { zh:"數量", ja:"数量", en:"Qty", ko:"수량", vi:"SL" },
    sold_out:    { zh:"暫停供應", ja:"完売", en:"Sold out", ko:"품절", vi:"Hết hàng" },
    table:       { zh:"桌號", ja:"テーブル", en:"Table", ko:"테이블", vi:"Bàn" },
    note:        { zh:"備註", ja:"備考", en:"Note", ko:"메모", vi:"Ghi chú" },
    empty_cart:  { zh:"購物車是空的", ja:"カートが空です", en:"Your cart is empty", ko:"장바구니가 비어 있습니다", vi:"Giỏ hàng trống" },
    order_sent:  { zh:"訂單已送出！", ja:"注文を送信しました！", en:"Order placed!", ko:"주문이 접수되었습니다!", vi:"Đã đặt món!" },
    your_order:  { zh:"您的訂單", ja:"ご注文内容", en:"Your Order", ko:"주문 내역", vi:"Đơn của bạn" },
    status:      { zh:"狀態", ja:"状態", en:"Status", ko:"상태", vi:"Trạng thái" },
    st_pending:  { zh:"待確認", ja:"確認待ち", en:"Pending", ko:"확인 대기", vi:"Chờ xác nhận" },
    st_cooking:  { zh:"製作中", ja:"調理中", en:"Preparing", ko:"조리 중", vi:"Đang chế biến" },
    st_served:   { zh:"已上菜", ja:"提供済み", en:"Served", ko:"제공 완료", vi:"Đã phục vụ" },
    st_paid:     { zh:"已結帳", ja:"会計済み", en:"Paid", ko:"결제 완료", vi:"Đã thanh toán" },
    welcome:     { zh:"歡迎光臨", ja:"いらっしゃいませ", en:"Welcome", ko:"환영합니다", vi:"Chào mừng" },
    scan_hint:   { zh:"瀏覽菜單並直接點餐", ja:"メニューを見て注文できます", en:"Browse the menu and order", ko:"메뉴를 보고 주문하세요", vi:"Xem thực đơn và đặt món" },
    add_more:    { zh:"繼續點餐", ja:"追加注文", en:"Add more", ko:"더 담기", vi:"Đặt thêm" },
    confirm:     { zh:"確認", ja:"確認", en:"Confirm", ko:"확인", vi:"Xác nhận" },
    cancel:      { zh:"取消", ja:"キャンセル", en:"Cancel", ko:"취소", vi:"Hủy" },
    call_staff:  { zh:"呼叫服務人員", ja:"スタッフを呼ぶ", en:"Call staff", ko:"직원 호출", vi:"Gọi nhân viên" },
    takeout:     { zh:"外帶", ja:"テイクアウト", en:"Takeout", ko:"포장", vi:"Mang đi" },
    dine_in:     { zh:"店內用餐", ja:"店内", en:"Dine-in", ko:"매장", vi:"Tại quán" },
    history:     { zh:"點餐記錄", ja:"注文履歴", en:"History", ko:"주문내역", vi:"Lịch sử" },
    order_note:  { zh:"整單備註", ja:"注文メモ", en:"Order note", ko:"주문 메모", vi:"Ghi chú đơn" },
    item_note_ph:{ zh:"備註，例如：不要蔥", ja:"例：ねぎ抜き", en:"e.g. no scallion", ko:"예: 파 빼주세요", vi:"vd: không hành" },
    pick_table:  { zh:"請選擇您的桌號", ja:"テーブルをお選びください", en:"Please select your table", ko:"테이블을 선택하세요", vi:"Vui lòng chọn bàn" },
    req_checkout:{ zh:"我要買單（請服務人員結帳）", ja:"会計をお願いする", en:"Request checkout", ko:"결제 요청", vi:"Yêu cầu thanh toán" },
    req_done:    { zh:"已通知服務人員，請稍候", ja:"スタッフに通知しました", en:"Staff notified, please wait", ko:"직원에게 알렸습니다", vi:"Đã báo nhân viên" }
  },
  cur: "zh",
  t(key){ const e = this.dict[key]; return e ? (e[this.cur] || e.zh) : key; },
  /* 取得菜單品項在地化名稱 / 敘述 */
  itemName(it){ return (it.name && (it.name[this.cur] || it.name.zh)) || it.name_zh || it.title || ""; },
  itemDesc(it){ return (it.desc && (it.desc[this.cur] || it.desc.zh)) || it.desc_zh || ""; },
  set(code){ this.cur = code; window.dispatchEvent(new CustomEvent("langchange",{detail:code})); }
};
