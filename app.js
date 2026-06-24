const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
require('express-async-errors');

const connectSQL = require("./src/configs/sql");
const hocvienCheckRoute = require("./src/routes/hocviencheck.route");
const checkDataRoute = require("./src/routes/checkData.routes");
const lopLyThuyetRoute = require("./src/routes/lopLyThuyet.routes");
const phienHocDAT = require("./src/routes/phienHocDAT.routes");
const phienHocDuyet = require("./src/routes/phienHocDuyet.routes");
const hocVienDuyet = require("./src/routes/hocVienDuyet.routes");
const kyDAT = require("./src/routes/kyDat.routes");
const cabinRoute = require("./src/routes/cabin.routes");
const evaluateHanhTrinh = require("./src/routes/evaluate.routes");
const kiemTraToanKhoa = require("./src/routes/kiemTraToanKhoa.routes");
const kiemTraTotNghiep = require("./src/routes/kiemTraTotNghiep.routes");
const syncRoute = require("./src/routes/sync.routes");
const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const googleSheetRoute = require("./src/routes/googleSheet.routes");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
// Bypass body parser for GET/DELETE requests that mistakenly include a Content-Type header with an empty body
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "DELETE") {
    delete req.headers["content-type"];
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/hoc-vien", hocvienCheckRoute);
app.use("/api/check-data-student", checkDataRoute);
app.use("/api/hoc-vien-lop-ly-thuyet", lopLyThuyetRoute);
app.use("/api/phien-hoc-dat", phienHocDAT);
app.use("/api/phien-hoc-duyet", phienHocDuyet);
app.use("/api/hoc-vien-duyet", hocVienDuyet);
app.use("/api/ky-dat", kyDAT);
app.use("/api/cabin", cabinRoute);
app.use("/api/ly-thuyet", require("./src/routes/hocVienLyThuyet.route"));
app.use("/api", require("./src/routes/log.routes"));
app.use("/api", evaluateHanhTrinh);
app.use("/api/kiem-tra", kiemTraToanKhoa);
app.use("/api/kiem-tra-tot-nghiep", kiemTraTotNghiep);
app.use("/api/sync", syncRoute);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/google-sheet", googleSheetRoute);
app.use("/api/ke-toan", require("./src/routes/keToan.routes"));
app.use("/api/tien-do-dao-tao", require("./src/routes/tienDoDaoTao.routes"));
app.use("/api/tien-do-dao-tao", require("./src/routes/hocbu.routes"));
app.use("/api/student-detail", require("./src/routes/studentDetail.routes"));
app.use("/api/check-configs", require("./src/routes/checkConfig.routes"));
app.use("/api/forbidden-zones", require("./src/routes/forbiddenZone.routes"));
app.use("/api/xe-giao-vien", require("./src/routes/checktrungxegiaovien.routes"));
app.use("/api/xe", require("./src/routes/xe.routes"));
app.use("/api/uy-quyen", require("./src/routes/uyquyen.routes"));
app.use("/api/hoc-vien", require("./src/routes/hocvien.routes"));
app.use("/api/ds-nhan-gplx", require("./src/routes/dsNhanGplx.routes"));
app.use("/api/backup", require("./src/routes/backup.routes"));

// ─── Danh sách API ───────────────────────────────────────────
app.get("/", (req, res) => {
  const endpoints = [];

  app._router.stack.forEach((middleware) => {
    if (middleware.name === "router") {
      let basePath = middleware.regexp.source
        .replace("\\/?(?=\\/|$)", "")
        .replace("^\\", "")
        .replace(/\\/g, "");

      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).join(", ").toUpperCase();
          const fullPath = (basePath + handler.route.path).replace(/\/+/g, "/");
          endpoints.push(`${methods} ${fullPath}`);
        }
      });
    }
  });

  res.json({ status: "OK", total: endpoints.length, endpoints });
});

// ─── 404 ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Error handler ───────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// ─── Start Server ─────────────────────────────────────────────
async function startServer() {
  try {
    await connectSQL();
    console.log("✅ Database ready");

    // Initialize/verify backup database structure
    const backupRepository = require("./src/repositories/backup.repository");
    await backupRepository.initializeBackupDatabase();

    const cronService = require("./src/services/cron.service");
    cronService.init();

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Server failed to start:", err.message);
    process.exit(1);
  }
}

startServer();