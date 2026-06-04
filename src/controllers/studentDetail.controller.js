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

  /**
   * POST /api/student-detail/sync-batch
   * Trích xuất danh sách khóa học và chạy đồng bộ ngầm chịu tải an toàn
   */
  async syncBatchCourses(req, res) {
    try {
      const { plans } = req.body;
      if (!Array.isArray(plans) || plans.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Tham số 'plans' phải là một mảng không rỗng."
        });
      }

      // Khởi động tiến trình chạy ngầm
      studentDetailService.startBatchSync(plans).catch((err) => {
        console.error("[syncBatchCourses] Background Batch Sync Failed:", err.message);
      });

      return res.status(202).json({
        success: true,
        message: "Tiến trình đồng bộ học viên hàng loạt đã được khởi động chạy ngầm với độ giãn cách an toàn từ 5-10 giây."
      });
    } catch (error) {
      console.error("[syncBatchCourses] Error:", error.message);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi khởi tạo đồng bộ hàng loạt",
        error: error.message
      });
    }
  }
}

module.exports = new StudentDetailController();
