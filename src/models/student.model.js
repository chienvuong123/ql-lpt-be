const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    stt: { type: Number },
    maDangKy: { type: String, required: true, unique: true, index: true },
    ma: { type: String },
    ten: { type: String, required: true },
    gioiTinh: { type: String },
    ngaySinh: { type: Date },
    trangThaiDat: { type: String },
    anhChanDung: { type: String },
    thoiGianDat: { type: String, default: "" },
    ghiChu: { type: String, default: "" },
    lanCuoiDangNhap: { type: Date },
    thoiGianDaHocHomNay: { type: String, default: "00:00" },

    khoaHoc: {
      maKhoaHoc: { type: String },
      tenKhoaHoc: { type: String },
      hangDaoTao: { type: String },
      ngayKhaiGiang: { type: Date },
      ngayBeGiang: { type: Date },
      tenCsdt: { type: String },
    },

    kyThuatLaiXe: {
      diem: { type: Number, default: 0 },
      trangThaiDat: { type: String, default: "Chưa đạt" },
    },

    cauTaoSuaChua: {
      diem: { type: Number, default: 0 },
      trangThaiDat: { type: String, default: "Chưa đạt" },
    },

    daoDucVHGT: {
      diem: { type: Number, default: 0 },
      trangThaiDat: { type: String, default: "Chưa đạt" },
    },

    phapLuatGT08: {
      pl1: {
        diem: { type: Number, default: 0 },
        trangThaiDat: { type: String, default: "Chưa đạt" },
      },
      pl2: {
        diem: { type: Number, default: 0 },
        trangThaiDat: { type: String, default: "Chưa đạt" },
      },
      pl3: {
        diem: { type: Number, default: 0 },
        trangThaiDat: { type: String, default: "Chưa đạt" },
      },

      tongOnTap: {
        diem: { type: Number, default: 0 },
        trangThaiDat: { type: String, default: "Chưa đạt" },
      },
    },

    moPhong: {
      diem: { type: Number, default: 0 },
      trangThaiDat: { type: String, default: "Chưa đạt" },
    },
  },
  {
    timestamps: true,
    collection: "students",
  },
);

studentSchema.index({ maDangKy: 1 });
studentSchema.index({ ten: 1 });
studentSchema.index({ trangThaiDat: 1 });

const Student = mongoose.model("Student", studentSchema);

module.exports = Student;
