// Script 1 lần: chạy trên server nào thì tạo trên DB của server đó (dùng .env cục bộ).
//
// Chạy: node scripts/tao-tai-khoan-ke-toan.js <username> <mat_khau>
//   vd:  node scripts/tao-tai-khoan-ke-toan.js ketoan "MatKhau@cuaBan"
//   (mật khẩu ≥ 6 ký tự, có ít nhất 1 ký tự đặc biệt — không ghi mật khẩu vào code)
//
// Làm 2 việc (chạy lại nhiều lần không sao):
// 1. Thêm vai trò "ke_toan" (Phòng kế toán) vào bảng roles nếu chưa có — FE dùng role_id 9.
// 2. Tạo tài khoản kế toán chỉ có quyền xem/sửa màn /ke-toan (mọi màn khác tắt).
const fs = require("fs");
const path = require("path");
const connectSQL = require("../src/configs/sql");
const userModel = require("../src/models/user.model");

const ROLE_ID = 9;
const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 6 || !/[^A-Za-z0-9]/.test(password)) {
  console.error('Cách dùng: node scripts/tao-tai-khoan-ke-toan.js <username> <mat_khau>  (mật khẩu ≥ 6 ký tự, có ký tự đặc biệt)');
  process.exit(1);
}

// Lấy danh sách route từ cây phân quyền bên FE (nếu có), để quyền lưu đủ mọi màn = tắt
function allRoutes() {
  const fe = path.resolve(__dirname, "../../quan_ly_fe/src/util/permission.js");
  try {
    const src = fs.readFileSync(fe, "utf8");
    const tree = src.slice(0, src.indexOf("export const flattenTreeTemplate"));
    return [...new Set([...tree.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]))];
  } catch {
    return ["/ke-toan"];
  }
}

(async () => {
  const pool = await connectSQL();

  const role = await pool.request().query(`SELECT id, name FROM roles WHERE id = ${ROLE_ID}`);
  if (!role.recordset.length) {
    await pool.request().query(`
      SET IDENTITY_INSERT roles ON;
      INSERT INTO roles (id, name, description, is_active, created_at) VALUES (${ROLE_ID}, N'ke_toan', N'Phòng kế toán', 1, GETDATE());
      SET IDENTITY_INSERT roles OFF;`);
    console.log(`Đã thêm vai trò ${ROLE_ID} - Phòng kế toán`);
  } else if (role.recordset[0].name !== "ke_toan") {
    throw new Error(`roles.id = ${ROLE_ID} đã được dùng cho "${role.recordset[0].name}" — sửa ROLE_ID ở FE và script trước khi chạy`);
  } else {
    console.log(`Vai trò ${ROLE_ID} - Phòng kế toán đã có`);
  }

  if (await userModel.findByUsername(username)) {
    console.log(`Tài khoản "${username}" đã tồn tại — không tạo lại`);
    process.exit(0);
  }

  const permissions = allRoutes().map((route) => ({ route, view: route === "/ke-toan", edit: route === "/ke-toan" }));
  if (!permissions.some((p) => p.route === "/ke-toan")) permissions.push({ route: "/ke-toan", view: true, edit: true });

  const id = await userModel.create({ username, password, ho_ten: "Phòng Kế toán", role_id: ROLE_ID, permissions });
  console.log(`Đã tạo tài khoản "${username}" (id ${id}) — chỉ vào được màn Kế toán`);
  process.exit(0);
})().catch((e) => {
  console.error("Lỗi:", e.message);
  process.exit(1);
});
