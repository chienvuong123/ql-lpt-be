const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const connectDB = require("./src/configs/database");
const connectSQL = require("./src/configs/sql");
const hocvienCheckRoute = require("./src/routes/hocviencheck.route");
const checkDataRoute = require("./src/routes/checkData.routes");
const lopLyThuyetRoute = require("./src/routes/lopLyThuyet.routes");
const phienHocDAT = require("./src/routes/phienHocDAT.routes");
const kyDAT = require("./src/routes/kyDat.routes");
const cabinRoute = require("./src/routes/cabin.routes");
const evaluateHanhTrinh = require("./src/routes/evaluate.routes");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

connectDB();
connectSQL();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Đăng ký Routes
app.use("/api/hoc-vien", hocvienCheckRoute);
app.use("/api/check-data-student", checkDataRoute);
app.use("/api/hoc-vien-lop-ly-thuyet", lopLyThuyetRoute);
app.use("/api/phien-hoc-dat", phienHocDAT);
app.use("/api/ky-dat", kyDAT);
app.use("/api/cabin", cabinRoute);
app.use("/api/ly-thuyet", require("./src/routes/hocVienLyThuyet.route"));
app.use("/api", require("./src/routes/log.routes"));
app.use("/api", evaluateHanhTrinh);

// Tự động quét và hiển thị danh sách API sạch đẹp
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
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods)
            .join(", ")
            .toUpperCase();

          // 2. Gộp lại và xử lý dấu // nếu có
          const fullPath = (basePath + path).replace(/\/+/g, "/");
          endpoints.push(`${methods} ${fullPath}`);
        }
      });
    }
  });

  res.json({
    status: "OK",
    total: endpoints.length,
    endpoints: endpoints,
  });
});
// Xử lý lỗi chung
app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

app.listen(PORT, HOST, () => console.log(`🚀 Server: http://${HOST}:${PORT}`));
