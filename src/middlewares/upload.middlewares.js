const multer = require("multer");

const ALLOWED_EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
];

const upload = multer({
  storage: multer.memoryStorage(), // lưu buffer trong RAM, không ghi disk
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_EXCEL_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file Excel (.xlsx, .xls)"));
    }
  },
});

const uploadSingle = upload.single("file");

module.exports = uploadSingle;
