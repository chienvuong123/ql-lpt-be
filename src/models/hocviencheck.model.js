"use strict";

const mongoose = require("mongoose");

const hocvienCheckSchema = new mongoose.Schema(
  {
    maHocVien: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    dat_confirmed: {
      type: Boolean,
      default: false,
    },
    internal_note: {
      type: String,
      default: null,
      trim: true,
    },
    public_note: {
      type: String,
      default: null,
      trim: true,
    },
    createdBy: {
      type: String,
      default: null,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // tự thêm createdAt, updatedAt
    collection: "hocvien_checks",
  },
);

module.exports = mongoose.model("HocVienCheck", hocvienCheckSchema);
