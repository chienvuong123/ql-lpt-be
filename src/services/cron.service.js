const cron = require("node-cron");
const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const hocBuService = require("./hocBu.service");

class CronService {
  init() {
    console.log("[CronService] Đang khởi tạo các tác vụ tự động...");

    // Chạy vào 01:00 AM mỗi ngày
    cron.schedule("0 1 * * *", async () => {
      console.log(`[CronService] [${new Date().toLocaleString()}] Bắt đầu quy trình quét tự động...`);
      
      try {
        // 1. Quét LÝ THUYẾT
        const theoryExpired = await tienDoDaoTaoModel.getTheoryExpiredYesterday();
        if (theoryExpired.length > 0) {
          console.log(`[CronService] Tìm thấy ${theoryExpired.length} khóa hết hạn Lý thuyết: ${theoryExpired.join(", ")}`);
          for (const mk of theoryExpired) {
            await hocBuService.checkAndMoveTheory(mk);
          }
        }

        // 2. Quét CABIN
        const cabinExpired = await tienDoDaoTaoModel.getCabinExpiredYesterday();
        if (cabinExpired.length > 0) {
          console.log(`[CronService] Tìm thấy ${cabinExpired.length} khóa hết hạn Cabin: ${cabinExpired.join(", ")}`);
          for (const mk of cabinExpired) {
            await hocBuService.checkAndMoveCabin(mk);
          }
        }

        if (theoryExpired.length === 0 && cabinExpired.length === 0) {
          console.log("[CronService] Không có khóa nào hết hạn hôm qua.");
        }
        
      } catch (error) {
        console.error("[CronService] Lỗi nghiêm trọng trong tác vụ quét tự động:", error.message);
      }
    });

    console.log("[CronService] Tác vụ quét tự động đã được lên lịch (01:00 mỗi ngày).");
  }
}

module.exports = new CronService();
