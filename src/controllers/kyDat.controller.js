const model = require("../models/kyDAT.model");
const { paginate } = require("../utils/paginate");
const ExcelJS = require("exceljs");

const ALLOWED_FIELDS = [
  "ten_hoc_vien",
  "ngay_sinh",
  "khoa_hoc",
  "ma_khoa",
  "hang_dao_tao",
  "gv_dat",
  "anh",
  "can_cuoc",
  "trang_thai",
  "ghi_chu_1",
  "ghi_chu_2",
];

async function luuDatKy(req, res) {
  try {
    const { maDk } = req.params;
    const fields = req.body;
    const updatedBy = req.headers["x-user"] || null;

    if (!maDk) {
      return res.status(400).json({ success: false, message: "Thieu ma_dk" });
    }

    const invalidFields = Object.keys(fields).filter(
      (f) => !ALLOWED_FIELDS.includes(f),
    );
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Field khong hop le: ${invalidFields.join(", ")}`,
        allowedFields: ALLOWED_FIELDS,
      });
    }

    if (fields.ngay_sinh) {
      const parsed = new Date(fields.ngay_sinh);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "ngay_sinh khong dung dinh dang (YYYY-MM-DD)",
        });
      }
    }

    const data = await model.upsert(maDk, fields, updatedBy);
    return res.json({ success: true, message: "Luu thanh cong", data });
  } catch (err) {
    console.error("[luuDatKy]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getDanhSach(req, res) {
  try {
    const { maKhoa, keyword, page, limit } = req.query;
    const data = await model.getAll({ maKhoa, keyword });

    const { data: pagedData, pagination } = paginate(data, page, limit);

    return res.json({ success: true, pagination, data: pagedData });
  } catch (err) {
    console.error("[getDanhSach]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function getChiTiet(req, res) {
  try {
    const { maDk } = req.params;
    const data = await model.getByMaDk(maDk);
    return res.json({ success: true, data: data || {} });
  } catch (err) {
    console.error("[getChiTiet]", err);
    return res
      .status(500)
      .json({ success: false, message: "Loi server", error: err.message });
  }
}

async function exportDanhSachKyDat(req, res) {
  try {
    const { ma_khoa, ten_hoc_vien } = req.query;

    const rows = await model.exportKyDat({ ma_khoa, ten_hoc_vien });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Danh sách ký DAT");

    const headerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A3C5E" },
    };
    const headerFont = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
      name: "Arial",
    };
    const headerAlignment = { horizontal: "center", vertical: "middle" };

    const columns = [
      { header: "#", key: "stt", width: 6 },
      { header: "Mã học viên", key: "ma_dk", width: 28 },
      { header: "Họ tên", key: "ten_hoc_vien", width: 24 },
      { header: "Căn cước công dân", key: "can_cuoc", width: 22 },
      { header: "Ngày sinh", key: "ngay_sinh", width: 14 },
      { header: "Khóa học", key: "khoa_hoc", width: 14 },
      { header: "Hạng đào tạo", key: "hang_dao_tao", width: 14 },
      { header: "GV DAT", key: "gv_dat", width: 20 },
      { header: "Ký DAT", key: "trang_thai", width: 12 },
      { header: "Thời gian ký DAT", key: "updated_at", width: 22 },
    ];

    sheet.columns = columns;

    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = headerAlignment;
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });

    rows.forEach((row, index) => {
      const dataRow = sheet.addRow({
        stt: row.stt,
        ma_dk: row.ma_dk,
        ten_hoc_vien: row.ten_hoc_vien || "",
        can_cuoc: row.can_cuoc || "",
        ngay_sinh: row.ngay_sinh || "",
        khoa_hoc: row.khoa_hoc || "",
        hang_dao_tao: row.hang_dao_tao || "",
        gv_dat: row.gv_dat || "-",
        trang_thai: row.trang_thai === "da_ky" ? "Đã ký" : row.trang_thai || "",
        updated_at: row.updated_at
          ? new Date(row.updated_at).toLocaleString("vi-VN")
          : "",
      });

      dataRow.height = 22;
      const bgColor = index % 2 === 0 ? "FFFFFFFF" : "FFF0F4F8";

      dataRow.eachCell((cell) => {
        cell.font = { size: 10, name: "Arial" };
        cell.alignment = { vertical: "middle" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: bgColor },
        };
        cell.border = {
          top: { style: "hair", color: { argb: "FFCCCCCC" } },
          bottom: { style: "hair", color: { argb: "FFCCCCCC" } },
          left: { style: "hair", color: { argb: "FFCCCCCC" } },
          right: { style: "hair", color: { argb: "FFCCCCCC" } },
        };
      });

      ["stt", "ngay_sinh", "khoa_hoc", "hang_dao_tao", "trang_thai"].forEach(
        (key) => {
          const colIndex = columns.findIndex((c) => c.key === key) + 1;
          dataRow.getCell(colIndex).alignment = {
            horizontal: "center",
            vertical: "middle",
          };
        },
      );

      if (row.trang_thai === "da_ky") {
        dataRow.getCell(9).font = {
          size: 10,
          name: "Arial",
          bold: true,
          color: { argb: "FF16A34A" },
        };
      }
    });

    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="danh-sach-ky-dat-${Date.now()}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[exportDanhSachKyDat]", err);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi export", error: err.message });
  }
}

module.exports = { luuDatKy, getDanhSach, getChiTiet, exportDanhSachKyDat };
