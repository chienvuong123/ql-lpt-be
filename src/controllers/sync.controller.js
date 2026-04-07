const syncService = require("../services/sync.service");

class SyncController {
  /**
   * POST /api/sync/courses
   * Sync all enrolment plans from Lotus
   */
  async syncCourses(req, res) {
    try {
      const count = await syncService.syncCourses();
      res.status(200).json({
        success: true,
        message: `Đã đồng bộ ${count} khóa học từ Lotus LMS.`,
        data: { count }
      });
    } catch (err) {
      console.error("[SyncController] syncCourses error:", err);
      res.status(500).json({ 
        success: false, 
        message: "Lỗi đồng bộ danh sách khóa học", 
        error: err.message 
      });
    }
  }

  /**
   * POST /api/sync/students
   * Body: { enrolmentPlanIid: Number | Array }
   * Sync students for one or multiple enrolment plans
   */
  async syncStudents(req, res) {
    const { enrolmentPlanIid } = req.body;

    if (!enrolmentPlanIid) {
      return res.status(400).json({ 
        success: false, 
        message: "Thiếu enrolmentPlanIid (IID khóa học)" 
      });
    }

    try {
      // Chuyển đổi sang mảng nếu chỉ là 1 ID
      const ids = Array.isArray(enrolmentPlanIid) ? enrolmentPlanIid : [enrolmentPlanIid];
      
      const result = await syncService.syncStudents(ids);
      
      res.status(200).json({
        success: true,
        message: `Đã hoàn tất đồng bộ ${result.success}/${result.totalCourses} khóa học.`,
        data: result
      });
    } catch (err) {
      console.error("[SyncController] syncStudents error:", err);
      res.status(500).json({ 
        success: false, 
        message: "Lỗi đồng bộ danh sách học viên", 
        error: err.message 
      });
    }
  }
}

module.exports = new SyncController();
