// const mongoose = require("mongoose");

// const courseSchema = new mongoose.Schema(
//   {
//     maKhoa: {
//       type: String,
//       required: true,
//       unique: true,
//       trim: true,
//       uppercase: true,
//     },
//     tenKhoa: { type: String, required: true, trim: true },
//     donViToChuc: { type: String, trim: true },
//     lopHoc: { type: Number, default: 0 },
//     luotCuDiHoc: { type: Number, default: 0 },
//     soLuotDat: { type: Number, default: 0 },
//     ngayBatDau: { type: Date },
//     ngayKetThuc: { type: Date },
//     trangThai: { type: String, default: "" },
//     nguoiTao: { type: String },
//   },
//   { timestamps: true },
// );

// courseSchema.index({ maKhoa: 1 });
// module.exports = mongoose.model("Course", courseSchema);
