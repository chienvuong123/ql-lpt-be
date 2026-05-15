const ForbiddenZoneModel = require("../models/forbiddenZone.model");

const getZones = async (req, res) => {
  try {
    const list = await ForbiddenZoneModel.getAll();
    
    // Format database Bit results to JS Booleans
    const formatted = list.map(item => ({
      ...item,
      enabled: item.enabled === true || item.enabled === 1
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error("[getZones]", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message,
    });
  }
};

const createZone = async (req, res) => {
  try {
    const { name, lat, lng, radius_m, enabled, description, created_by } = req.body;

    if (!name || lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin bắt buộc: name, lat, lng",
      });
    }

    const newRecord = await ForbiddenZoneModel.create({
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius_m: radius_m != null ? parseFloat(radius_m) : 100,
      enabled: enabled != null ? (enabled ? 1 : 0) : 1,
      description,
      created_by,
    });

    return res.status(201).json({
      success: true,
      message: "Tạo vùng cấm thành công",
      data: {
        ...newRecord,
        enabled: newRecord.enabled === true || newRecord.enabled === 1
      },
    });
  } catch (err) {
    console.error("[createZone]", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message,
    });
  }
};

const updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, lat, lng, radius_m, enabled, description } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Thiếu id" });
    }

    const updatedRecord = await ForbiddenZoneModel.update(Number(id), {
      name,
      lat: lat != null ? parseFloat(lat) : undefined,
      lng: lng != null ? parseFloat(lng) : undefined,
      radius_m: radius_m != null ? parseFloat(radius_m) : undefined,
      enabled: enabled != null ? (enabled ? 1 : 0) : undefined,
      description,
    });

    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy vùng cấm cần cập nhật",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật vùng cấm thành công",
      data: {
        ...updatedRecord,
        enabled: updatedRecord.enabled === true || updatedRecord.enabled === 1
      },
    });
  } catch (err) {
    console.error("[updateZone]", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message,
    });
  }
};

const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Thiếu id" });
    }

    const success = await ForbiddenZoneModel.remove(Number(id));

    if (!success) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy vùng cấm cần xóa",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Xóa vùng cấm thành công",
    });
  } catch (err) {
    console.error("[deleteZone]", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: err.message,
    });
  }
};

module.exports = {
  getZones,
  createZone,
  updateZone,
  deleteZone,
};
