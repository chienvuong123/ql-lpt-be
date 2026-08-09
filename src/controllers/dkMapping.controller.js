const dkMappingService = require("../services/dkMapping.service");

// POST /api/dk-mapping/sync-tu-hoc-vien-th
// Mặc định (không truyền apply=true) chỉ PREVIEW danh sách thay đổi, KHÔNG ghi DB.
// Truyền ?apply=true để thực sự cascade update ma_dk trên toàn bộ bảng liên quan.
async function syncMaDkFromHocVienTH(req, res) {
  try {
    const apply = String(req.query.apply || "").toLowerCase() === "true";
    const result = apply
      ? await dkMappingService.applyMaDkSync()
      : await dkMappingService.previewMaDkSync();

    return res.status(200).json({
      success: true,
      mode: apply ? "apply" : "preview",
      ...result,
    });
  } catch (err) {
    console.error("[DkMappingController] syncMaDkFromHocVienTH error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Đồng bộ ma_dk thất bại.",
      error: err.message,
    });
  }
}

module.exports = { syncMaDkFromHocVienTH };
