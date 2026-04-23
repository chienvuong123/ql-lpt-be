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

  /**
   * POST /api/student-detail/camera-snapshot
   * Proxy API Lotus để lấy danh sách ảnh chụp camera
   */
  async getCameraSnapshot(req, res) {
    try {
      const combinedParams = { ...req.query, ...req.body };

      const data = await callWithRetry(async (auth) => {
        return await studentDetailService.getCameraSnapshot(combinedParams, auth);
      });

      res.status(200).json(data);
    } catch (error) {
      console.error("[getCameraSnapshot] Error:", error.message);
      res.status(error.response?.status || 500).json(
        error.response?.data || {
          success: false,
          message: "Lỗi hệ thống khi lấy ảnh camera từ Lotus",
          error: error.message,
        }
      );
    }
  }

  /**
   * POST /api/student-detail/time-tracking
   * Proxy API Lotus để lấy danh sách lịch sử học tập
   */
  async getTimeTrackingLog(req, res) {
    try {
      const combinedParams = { ...req.query, ...req.body };

      const data = await callWithRetry(async (auth) => {
        return await studentDetailService.getTimeTrackingLog(combinedParams, auth);
      });

      res.status(200).json(data);
    } catch (error) {
      console.error("[getTimeTrackingLog] Error:", error.message);
      res.status(error.response?.status || 500).json(
        error.response?.data || {
          success: false,
          message: "Lỗi hệ thống khi lấy lịch sử học tập từ Lotus",
          error: error.message,
        }
      );
    }
  }

  /**
   * POST /api/student-detail/learning-time
   * Proxy API Lotus để lấy danh sách thời gian học tập chi tiết
   */
  async getLearningTimeTracking(req, res) {
    try {
      const combinedParams = { ...req.query, ...req.body };

      const data = await callWithRetry(async (auth) => {
        return await studentDetailService.getLearningTimeTracking(combinedParams, auth);
      });

      res.status(200).json(data);
    } catch (error) {
      console.error("[getLearningTimeTracking] Error:", error.message);
      res.status(error.response?.status || 500).json(
        error.response?.data || {
          success: false,
          message: "Lỗi hệ thống khi lấy thời gian học tập từ Lotus",
          error: error.message,
        }
      );
    }
  }

  /**
   * POST /api/student-detail/detail-learning-time
   * Proxy API Lotus để lấy chi tiết thời gian học tập của một môn học
   */
  async getDetailLearningTime(req, res) {
    try {
      const combinedParams = { ...req.query, ...req.body };

      const data = await callWithRetry(async (auth) => {
        return await studentDetailService.getDetailLearningTime(combinedParams, auth);
      });

      res.status(200).json(data);
    } catch (error) {
      console.error("[getDetailLearningTime] Error:", error.message);
      res.status(error.response?.status || 500).json(
        error.response?.data || {
          success: false,
          message: "Lỗi hệ thống khi lấy chi tiết thời gian học từ Lotus",
          error: error.message,
        }
      );
    }
  }
}

module.exports = new StudentDetailController();
