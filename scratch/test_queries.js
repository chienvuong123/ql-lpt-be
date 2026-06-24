const googleSheetModel = require("../src/models/googleSheet.model");
const keToanModel = require("../src/models/keToan.model");
const mssql = require("mssql");

async function testQueries() {
  try {
    console.log("Testing googleSheetModel.getAllData...");
    const sheetData = await googleSheetModel.getAllData({ page: 1, limit: 2 });
    console.log("googleSheetModel.getAllData result count:", sheetData.data.length);
    if (sheetData.data.length > 0) {
      const student = sheetData.data[0];
      console.log("Sample Student fields:", {
        cccd: student.cccd,
        ten_hoc_vien: student.ten_hoc_vien,
        hang: student.hang,
        loai: student.loai,
        ma_ke_toan: student.ma_ke_toan,
        ma_tinh_tien: student.ma_tinh_tien,
        hoc_phi: student.hoc_phi
      });
    }

    console.log("\nTesting keToanModel.getDanhSach...");
    const keToanData = await keToanModel.getDanhSach({ page: 1, limit: 2 });
    console.log("keToanModel.getDanhSach result count:", keToanData.data.length);
    if (keToanData.data.length > 0) {
      const ktStudent = keToanData.data[0];
      console.log("Sample KeToan Student fields:", {
        cccd: ktStudent.cccd,
        ten_hoc_vien: ktStudent.ten_hoc_vien,
        ma_ke_toan: ktStudent.ma_ke_toan,
        ma_tinh_tien: ktStudent.ma_tinh_tien,
        hoc_phi: ktStudent.hoc_phi
      });
    }

    console.log("\nTesting keToanModel.getBaoCao...");
    const reportData = await keToanModel.getBaoCao();
    console.log("keToanModel.getBaoCao result:", {
      tong_phai_thu: reportData.tong_phai_thu,
      tong_thuc_thu: reportData.tong_thuc_thu,
      tong_con_lai: reportData.tong_con_lai
    });

    console.log("\nAll tests completed successfully!");
  } catch (error) {
    console.error("Test failed with error:", error);
  } finally {
    await mssql.close();
  }
}

testQueries();
