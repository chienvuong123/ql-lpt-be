const cabinService = require("../services/cabin.service");

async function getDanhSachDatCabin(req, res) {
  try {
    const data = await cabinService.getDanhSachDatCabin(req.query);
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("[getDanhSachDatCabin]", err);
    return res.status(500).json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getDanhSachHocVienCabin(req, res) {
  try {
    const data = await cabinService.getDanhSachHocVienCabin(req.params.enrolmentPlanIid, req.query);
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("[getDanhSachHocVienCabin]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function upsertCabinNote(req, res) {
  try {
    const data = await cabinService.upsertCabinNote(req.body);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[upsertCabinNote]", err);
    const status = err.message === "Thieu ma_dk" ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
}

async function saveLichPhanBo(req, res) {
  try {
    const { week_key, assignments } = req.body;
    await cabinService.saveLichPhanBo(week_key, assignments);
    return res.json({ success: true, message: "Luu lich thanh cong" });
  } catch (err) {
    console.error("[saveLichPhanBo]", err.message);
    const status = err.message === "Thieu week_key" ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
}

async function getLichPhanBo(req, res) {
  try {
    const data = await cabinService.getLichPhanBo(req.query.week_key);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[getLichPhanBo]", err.message);
    const status = err.message === "Thieu week_key" ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
}

async function updateLichNote(req, res) {
  try {
    const { id } = req.params;
    const { ghi_chu } = req.body;
    await cabinService.updateLichNote(id, ghi_chu);
    return res.json({ success: true, message: "Cap nhat ghi chu thanh cong" });
  } catch (err) {
    console.error("[updateLichNote]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function checkOnlineStatus(req, res) {
  try {
    const data = await cabinService.checkOnlineStatus(req.body);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[checkOnlineStatus]", err);
    const isBadReq = err.message.includes("Thiếu dữ liệu") || err.message.includes("Định dạng");
    return res.status(isBadReq ? 400 : 500).json({ success: false, message: err.message });
  }
}

async function getThongKeCabinKhoa(req, res) {
  try {
    const data = await cabinService.getThongKeCabinKhoa(req.query.ma_khoa);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("[getThongKeCabinKhoa]", err.message);
    const status = err.message.includes("Thiếu") ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
}

module.exports = {
  getDanhSachDatCabin,
  getDanhSachHocVienCabin,
  upsertCabinNote,
  saveLichPhanBo,
  getLichPhanBo,
  updateLichNote,
  checkOnlineStatus,
  getThongKeCabinKhoa,
};
