const { normalizeStatusTime } = require("../helpers/time.helper");
const model = require("../models/cabin.model");

async function getDanhSachDatCabin(req, res) {
  try {
    const { maKhoa, tenKhoa, hoTen, page, limit } = req.query;
    const result = await model.getDatCabin({
      maKhoa,
      tenKhoa,
      hoTen,
      page,
      limit,
    });
    const totalPages = Math.ceil(result.total / result.limit);

    return res.json({
      success: true,
      pagination: {
        total: result.total,
        totalPages,
        page: result.page,
        limit: result.limit,
        hasNext: result.page < totalPages,
        hasPrev: result.page > 1,
      },
      filter: {
        maKhoa: maKhoa || null,
        tenKhoa: tenKhoa || null,
        hoTen: hoTen || null,
      },
      data: result.data.map(normalizeStatusTime),
    });
  } catch (err) {
    console.error("[getDanhSachDatCabin]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

module.exports = {
  getDanhSachDatCabin,
};
