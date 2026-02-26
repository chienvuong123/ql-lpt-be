const mongoose = require("mongoose");

const checkDataSchema = new mongoose.Schema(
  {
    stt: { type: Number },
    maDangKy: { type: String, trim: true },
    khoaHoc: { type: String, trim: true },
    hoVaTen: { type: String, trim: true },
    ngaySinh: { type: Date },
    gioiTinh: { type: String, trim: true },
    soCMND: { type: String, trim: true },
    diaChiThuongTru: { type: String, trim: true },
    ngayNhap: { type: Date },
    giaoVien: { type: String, trim: true },
    xeB2: { type: String, trim: true },
    xeB1: { type: String, trim: true },
    ghiChu: { type: String, trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CheckDataSchema", checkDataSchema);
