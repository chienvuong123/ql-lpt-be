export function normalizeStatusTime(item) {
  if (!item) return {};
  const data = { ...item };
  const raw = data.thoi_gian_thay_doi_trang_thai;
  if (!raw) {
    data.status_updated_at = null;
    data.status_updated_at_local = null;
    return data;
  }

  const dt = new Date(raw);
  data.status_updated_at = dt.toISOString();
  data.status_updated_at_local = `${dt.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
  })} GMT+7`;
  return data;
}
