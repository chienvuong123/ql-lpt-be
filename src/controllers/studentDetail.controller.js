const studentDetailService = require("../services/studentDetail.service");
const { callWithRetry } = require("../services/lotusApi.service");

class StudentDetailController {
  /**
   * POST /api/student-detail/tien-do-hoan-thanh
   * Proxy API Lotus để lấy tiến độ hoàn thành chi tiết
   */
  async getTienDoHoanThanh(req, res) {
    try {
      // Gộp tham số để linh hoạt Postman/Frontend
      const combinedParams = { ...req.query, ...req.body };

      // Sử dụng callWithRetry từ lotusApi.service để tự động refresh token hệ thống
      const data = await callWithRetry(async (auth) => {
        return await studentDetailService.getStudentProgressInEnrolmentPlan(combinedParams, auth);
      });

      res.status(200).json(data);
    } catch (error) {
      console.error("[getTienDoHoanThanh] Error:", error.message);
      res.status(error.response?.status || 500).json(
        error.response?.data || {
          success: false,
          message: "Lỗi hệ thống khi lấy chi tiết tiến độ Lotus",
          error: error.message,
        }
      );
    }
  }

  /**
   * POST /api/student-detail/score-by-rubric
   * Proxy API Lotus để lấy điểm chi tiết theo rubric
   */
  async getUserScoreByRubric(req, res) {
    try {
      const combinedParams = { ...req.query, ...req.body };

      const data = await callWithRetry(async (auth) => {
        return await studentDetailService.getUserScoreByRubric(combinedParams, auth);
      });

      res.status(200).json(data);
    } catch (error) {
      console.error("[getUserScoreByRubric] Error:", error.message);
      res.status(error.response?.status || 500).json(
        error.response?.data || {
          success: false,
          message: "Lỗi hệ thống khi lấy điểm rubric từ Lotus",
          error: error.message,
        }
      );
    }
  }
}

module.exports = new StudentDetailController();
