const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const hocBuService = require("../services/hocBu.service");
const hocBuModel = require("../models/hocBu.model");

class TienDoDaoTaoController {
  /**
   * GET /api/tien-do-dao-tao/hoc-bu
   * Lấy danh sách học viên học bù với bộ lọc
   */
  async getHocBuList(req, res) {
    const { ma_khoa, loai, search, sync } = req.query;

    try {
      const data = await hocBuService.getHocBuListDetailed({ ma_khoa, loai, search, sync });
      res.status(200).json({
        success: true,
        message: "Lấy danh sách học bù thành công",
        data: data.students,
        course: data.course
      });
    } catch (error) {
      console.error("[getHocBuList] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy danh sách học bù",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/detail
   * Lấy dữ liệu chi tiết tiến độ (LT, Cabin, DAT) của 1 học viên
   */
  async getHocBuDetail(req, res) {
    const { ma_dk, sync } = req.query;
    if (!ma_dk) {
      return res.status(400).json({ success: false, message: "Thiếu ma_dk" });
    }

    try {
      const data = await hocBuService.getStudentProgressDetail(ma_dk, sync === 'true' || sync === true);
      res.status(200).json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error("[getHocBuDetail] Error:", error.message);
      res.status(500).json({
        success: false,
        message: error.message || "Lỗi hệ thống khi lấy chi tiết học viên",
      });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/hoc-bu
   * Thêm 1 học viên vào danh sách học bù
   */
  async addStudentToHocBu(req, res) {
    const { ma_dk, ma_khoa, loai, ghi_chu, trang_thai, nguoi_tao, trang_thai_hoc_bu } = req.body;
    if (!ma_dk || !ma_khoa || !loai) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc (ma_dk, ma_khoa, loai)" });
    }

    try {
      const students = [{
        ma_dk,
        ma_khoa,
        loai,
        ghi_chu: ghi_chu || "Đăng ký học bù thủ công",
        trang_thai,
        nguoi_tao,
        trang_thai_hoc_bu
      }];
      const result = await hocBuModel.moveToHocBu(students);

      res.status(200).json({
        success: true,
        message: "Đã thêm học viên vào danh sách học bù",
        count: result
      });
    } catch (error) {
      console.error("[addStudentToHocBu] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi thêm học viên vào danh sách học bù",
        error: error.message
      });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/hoc-bu/update-status
   * Cập nhật trạng thái của bản ghi học bù
   */
  async updateHocBuStatus(req, res) {
    const { id, trang_thai, nguoi_update, trang_thai_hoc_bu, khoa_bu, thoi_gian_xep, trang_thai_duyet } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Thiếu ID bản ghi học bù" });
    }

    try {
      const result = await hocBuModel.updateHocBu(id, {
        trang_thai,
        nguoi_update,
        trang_thai_hoc_bu,
        khoa_bu,
        thoi_gian_xep,
        trang_thai_duyet
      });

      if (result > 0) {
        res.status(200).json({
          success: true,
          message: "Cập nhật trạng thái học bù thành công"
        });
      } else {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy bản ghi học bù để cập nhật"
        });
      }
    } catch (error) {
      console.error("[updateHocBuStatus] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi cập nhật trạng thái học bù",
        error: error.message
      });
    }
  }

  /**
   * GET /api/tien-do-dao-tao
   * Lấy danh sách tiến độ đào tạo
   */
  async getTienDoDaoTao(req, res) {
    const { ma_khoa } = req.query;

    try {
      const data = await tienDoDaoTaoModel.getAll({ ma_khoa });
      res.status(200).json({
        success: true,
        message: "Lấy dữ liệu tiến độ đào tạo thành công",
        data: data,
      });
    } catch (error) {
      console.error("[TienDoDaoTaoController] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy dữ liệu tiến độ đào tạo",
        error: error.message,
      });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/move-failed-theory-to-hoc-bu
   * Kiểm tra và chuyển học viên chưa đạt LÝ THUYẾT vào học bù (Thủ công)
   */
  async moveFailedTheoryToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });

    try {
      const result = await hocBuService.checkAndMoveTheory(ma_khoa);
      res.status(200).json({ success: true, message: `Học bù Lý thuyết: Đã chuyển ${result.movedCount} học viên.`, data: result });
    } catch (error) {
      console.error("[moveFailedTheoryToHocBu] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/theory
   */
  async getTheoryProgress(req, res) {
    const { ma_dk, ma_khoa } = req.query;
    try {
      const data = await hocBuService.getTheoryProgress(ma_dk, ma_khoa);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/theory-detail
   */
  async getTheoryLotusDetail(req, res) {
    const { ma_dk } = req.query;
    if (!ma_dk) return res.status(400).json({ success: false, message: "Thiếu ma_dk cho chi tiết Lotus" });

    try {
      const data = await hocBuService.getTheoryLotusDetail(ma_dk);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/cabin
   */
  async getCabinProgress(req, res) {
    console.log("[getCabinProgress]", req.query);
    const { ma_dk, ma_khoa } = req.query;
    try {
      const data = await hocBuService.getCabinProgress(ma_dk, ma_khoa);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/dat
   */
  async getDatProgress(req, res) {
    const { ma_dk, ma_khoa, sync } = req.query;
    try {
      const data = await hocBuService.getDatProgress(ma_dk, ma_khoa, sync === 'true' || sync === true);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/move-failed-cabin-to-hoc-bu
   * Kiểm tra và chuyển học viên chưa đạt CABIN vào học bù (Thủ công)
   */
  async moveFailedCabinToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });

    try {
      const result = await hocBuService.checkAndMoveCabin(ma_khoa);
      res.json({ success: true, message: `Học bù Cabin: Đã chuyển ${result.movedCount} học viên.`, data: result });
    } catch (err) {
      console.error("[moveFailedCabinToHocBu]", err.message);
      res.status(500).json({ success: false, message: "Lỗi server", error: err.message });
    }
  }

  async moveFailedDatToHocBu(req, res) {
    const { ma_khoa } = req.body;
    if (!ma_khoa) return res.status(400).json({ success: false, message: "Thiếu ma_khoa" });

    try {
      const result = await hocBuService.checkAndMoveDat(ma_khoa);
      res.json({ success: true, message: `Học bù DAT: Đã chuyển ${result.movedCount} học viên.`, data: result });
    } catch (err) {
      console.error("[moveFailedDatToHocBu]", err.message);
      res.status(500).json({ success: false, message: "Lỗi server", error: err.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/cho-duyet
   * Lấy danh sách học viên học bù đang ở trang_thai 2, 3 với các bộ lọc mới
   */
  async getChoDuyetHocBuList(req, res) {
    let { ma_khoa, loai, search, sync, trang_thai, trang_thai_hoc_bu, theory_status } = req.query;

    // Hỗ trợ các thư viện frontend sử dụng định dạng mảng (loai[], trang_thai[])
    if (!loai && req.query["loai[]"]) loai = req.query["loai[]"];
    if (!trang_thai && req.query["trang_thai[]"]) trang_thai = req.query["trang_thai[]"];
    if (!trang_thai_hoc_bu && req.query["trang_thai_hoc_bu[]"]) trang_thai_hoc_bu = req.query["trang_thai_hoc_bu[]"];

    // Phân tích loai
    let loaiFilter = undefined;
    if (loai) {
      if (Array.isArray(loai)) {
        loaiFilter = loai.map(Number);
      } else {
        const l = String(loai).toLowerCase().trim();
        if (l === "ly_thuyet" || l === "ly-thuyet") {
          loaiFilter = [1];
        } else if (l === "thuc_hanh" || l === "thuc-hanh") {
          loaiFilter = [2, 3];
        } else if (l === "cabin") {
          loaiFilter = [2];
        } else if (l === "dat") {
          loaiFilter = [3];
        } else if (l.includes(",")) {
          loaiFilter = l.split(",").map(Number);
        } else {
          loaiFilter = [Number(l)];
        }
      }
    }

    // Phân tích trang_thai
    let trangThaiFilter = [2, 3];
    if (trang_thai) {
      if (Array.isArray(trang_thai)) {
        trangThaiFilter = trang_thai.map(Number);
      } else if (typeof trang_thai === "string" && trang_thai.includes(",")) {
        trangThaiFilter = trang_thai.split(",").map(Number);
      } else {
        trangThaiFilter = [Number(trang_thai)];
      }
    }

    // Phân tích trang_thai_hoc_bu
    let trangThaiHocBuFilter = undefined;
    if (trang_thai_hoc_bu) {
      if (Array.isArray(trang_thai_hoc_bu)) {
        trangThaiHocBuFilter = trang_thai_hoc_bu.map(Number);
      } else if (typeof trang_thai_hoc_bu === "string" && trang_thai_hoc_bu.includes(",")) {
        trangThaiHocBuFilter = trang_thai_hoc_bu.split(",").map(Number);
      } else {
        trangThaiHocBuFilter = [Number(trang_thai_hoc_bu)];
      }
    }

    try {
      const isThucHanhScreen = loaiFilter && (loaiFilter.includes(2) || loaiFilter.includes(3) || (trangThaiHocBuFilter && trangThaiHocBuFilter.includes(1) && trangThaiHocBuFilter.includes(2)));
      const queryLoai = isThucHanhScreen ? [1, 2, 3] : loaiFilter;

      const data = await hocBuService.getHocBuListDetailed({
        ma_khoa,
        loai: queryLoai,
        search,
        sync,
        trang_thai: trangThaiFilter,
        trang_thai_hoc_bu: trangThaiHocBuFilter,
        exclude_loai_1: queryLoai ? false : true,
        chua_xep: false
      });

      let finalStudents = data.students || [];

      // Lọc theo trạng thái đạt lý thuyết nếu có yêu cầu từ FE
      if (theory_status === "passed") {
        finalStudents = finalStudents.filter(student => {
          const theoryInfo = student.detail?.theoryInfo;
          const passedTheoryOnline = theoryInfo && theoryInfo.loai_ly_thuyet && theoryInfo.loai_het_mon;
          return passedTheoryOnline;
        });
      } else if (theory_status === "not_passed") {
        finalStudents = finalStudents.filter(student => {
          const theoryInfo = student.detail?.theoryInfo;
          const passedTheoryOnline = theoryInfo && theoryInfo.loai_ly_thuyet && theoryInfo.loai_het_mon;
          return !passedTheoryOnline;
        });
      }

      // Vẫn giữ lọc động theo đúng các loại được chọn ở checkbox FE
      if (loaiFilter && loaiFilter.length > 0) {
        finalStudents = finalStudents.filter(student => {
          const sLoai = student.loai ?? student.student?.loai;
          const chuyenThucHanh = student.chuyen_thuc_hanh ?? student.student?.chuyen_thuc_hanh;
          const theoryInfo = student.detail?.theoryInfo;
          const passedTheoryOnline = theoryInfo && theoryInfo.loai_ly_thuyet && theoryInfo.loai_het_mon;

          if (Number(sLoai) === 1) {
            // Chỉ giữ học viên loại 1 đã đạt lý thuyết hoặc đã chuyển thực hành
            const isEligible = passedTheoryOnline || Number(chuyenThucHanh) === 2 || Number(chuyenThucHanh) === 3;
            if (!isEligible) return false;

            const hasPracticeInFilter = loaiFilter.includes(2) || loaiFilter.includes(3);

            // Trường hợp 1: Trên màn hình thực hành (loaiFilter có 2 hoặc 3, và có cả 1)
            if (hasPracticeInFilter) {
              // Bắt buộc phải có khoa_bu và thoi_gian_xep mới hiển thị bên thực hành
              const hasSchedule = student.khoa_bu && student.thoi_gian_xep;
              if (!hasSchedule) return false;

              if (loaiFilter.includes(1) && !loaiFilter.includes(2) && !loaiFilter.includes(3)) {
                return true;
              }
              if (loaiFilter.includes(2) && (passedTheoryOnline || Number(chuyenThucHanh) === 2)) {
                return true;
              }
              if (loaiFilter.includes(3) && (passedTheoryOnline || Number(chuyenThucHanh) === 3)) {
                return true;
              }
              return false;
            }

            // Trường hợp 2: Chỉ xem màn hình lý thuyết (loaiFilter chỉ có 1)
            // Ẩn những học viên đã đạt lý thuyết hoặc đã chuyển thực hành
            if (loaiFilter.includes(1) && !hasPracticeInFilter) {
              if (passedTheoryOnline || Number(chuyenThucHanh) === 2 || Number(chuyenThucHanh) === 3) {
                return false;
              }
              return true;
            }
          }

          return loaiFilter.includes(sLoai);
        });
      }

      // Lọc bỏ học viên đã có khoa_bu và thoi_gian_xep trừ khi cabin & dat đều bằng false
      finalStudents = finalStudents.filter(student => {
        const hasSchedule = student.khoa_bu && student.thoi_gian_xep;

        if (hasSchedule) {
          const isCabinApproved = student.trang_thai_duyet && student.trang_thai_duyet[1] === true;
          const isDatApproved = student.trang_thai_duyet && student.trang_thai_duyet[2] === true;

          // Nếu cả cabin và dat đều false (chưa được duyệt) thì vẫn hiển thị
          if (!isCabinApproved && !isDatApproved) {
            return true;
          }
          return false;
        }

        return true;
      });

      res.status(200).json({
        success: true,
        message: "Lấy danh sách học viên thành công",
        data: finalStudents,
        course: data.course
      });
    } catch (error) {
      console.error("[getChoDuyetHocBuList] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy danh sách học viên",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/cho-duyet-ly-thuyet
   * Danh sách chờ lý thuyết: hiển thị tất cả trường hợp đang chờ duyệt đạt và chưa đạt lý thuyết
   */
  async getChoDuyetLyThuyetList(req, res) {
    let { ma_khoa, search, sync, trang_thai, trang_thai_hoc_bu } = req.query;

    if (!trang_thai && req.query["trang_thai[]"]) trang_thai = req.query["trang_thai[]"];
    if (!trang_thai_hoc_bu && req.query["trang_thai_hoc_bu[]"]) trang_thai_hoc_bu = req.query["trang_thai_hoc_bu[]"];

    // Phân tích trang_thai
    let trangThaiFilter = [2, 3];
    if (trang_thai) {
      if (Array.isArray(trang_thai)) {
        trangThaiFilter = trang_thai.map(Number);
      } else if (typeof trang_thai === "string" && trang_thai.includes(",")) {
        trangThaiFilter = trang_thai.split(",").map(Number);
      } else {
        trangThaiFilter = [Number(trang_thai)];
      }
    }

    // Phân tích trang_thai_hoc_bu
    let trangThaiHocBuFilter = undefined;
    if (trang_thai_hoc_bu) {
      if (Array.isArray(trang_thai_hoc_bu)) {
        trangThaiHocBuFilter = trang_thai_hoc_bu.map(Number);
      } else if (typeof trang_thai_hoc_bu === "string" && trang_thai_hoc_bu.includes(",")) {
        trangThaiHocBuFilter = trang_thai_hoc_bu.split(",").map(Number);
      } else {
        trangThaiHocBuFilter = [Number(trang_thai_hoc_bu)];
      }
    }

    try {
      const data = await hocBuService.getHocBuListDetailed({
        ma_khoa,
        loai: [1],
        search,
        sync,
        trang_thai: trangThaiFilter,
        trang_thai_hoc_bu: trangThaiHocBuFilter,
        exclude_loai_1: false,
        chua_xep: false
      });

      const finalStudents = data.students || [];

      res.status(200).json({
        success: true,
        message: "Lấy danh sách chờ duyệt lý thuyết thành công",
        data: finalStudents,
        course: data.course
      });
    } catch (error) {
      console.error("[getChoDuyetLyThuyetList] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy danh sách chờ duyệt lý thuyết",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/cho-duyet-thuc-hanh
   * Danh sách chờ duyệt thực hành: gồm loại 2, 3 và loại 1 đạt lý thuyết
   */
  async getChoDuyetThucHanhList(req, res) {
    let { ma_khoa, loai, search, sync, trang_thai, trang_thai_hoc_bu } = req.query;

    if (!loai && req.query["loai[]"]) loai = req.query["loai[]"];
    if (!trang_thai && req.query["trang_thai[]"]) trang_thai = req.query["trang_thai[]"];
    if (!trang_thai_hoc_bu && req.query["trang_thai_hoc_bu[]"]) trang_thai_hoc_bu = req.query["trang_thai_hoc_bu[]"];

    // Phân tích loai
    let loaiFilter = [1, 2, 3];
    if (loai) {
      if (Array.isArray(loai)) {
        loaiFilter = loai.map(Number);
      } else {
        const l = String(loai).toLowerCase().trim();
        if (l === "thuc_hanh" || l === "thuc-hanh") {
          loaiFilter = [2, 3];
        } else if (l === "cabin") {
          loaiFilter = [2];
        } else if (l === "dat") {
          loaiFilter = [3];
        } else if (l.includes(",")) {
          loaiFilter = l.split(",").map(Number);
        } else {
          loaiFilter = [Number(l)];
        }
      }
    }

    // Phân tích trang_thai
    let trangThaiFilter = [2, 3];
    if (trang_thai) {
      if (Array.isArray(trang_thai)) {
        trangThaiFilter = trang_thai.map(Number);
      } else if (typeof trang_thai === "string" && trang_thai.includes(",")) {
        trangThaiFilter = trang_thai.split(",").map(Number);
      } else {
        trangThaiFilter = [Number(trang_thai)];
      }
    }

    // Phân tích trang_thai_hoc_bu
    let trangThaiHocBuFilter = undefined;
    if (trang_thai_hoc_bu) {
      if (Array.isArray(trang_thai_hoc_bu)) {
        trangThaiHocBuFilter = trang_thai_hoc_bu.map(Number);
      } else if (typeof trang_thai_hoc_bu === "string" && trang_thai_hoc_bu.includes(",")) {
        trangThaiHocBuFilter = trang_thai_hoc_bu.split(",").map(Number);
      } else {
        trangThaiHocBuFilter = [Number(trang_thai_hoc_bu)];
      }
    }

    try {
      // Để hiển thị được cả loại 1 đạt lý thuyết, chúng ta lấy [1, 2, 3] từ database
      const data = await hocBuService.getHocBuListDetailed({
        ma_khoa,
        loai: [1, 2, 3],
        search,
        sync,
        trang_thai: trangThaiFilter,
        trang_thai_hoc_bu: trangThaiHocBuFilter,
        exclude_loai_1: false,
        chua_xep: false
      });

      let finalStudents = data.students || [];

      // Lọc thông minh theo loaiFilter
      finalStudents = finalStudents.filter(student => {
        const sLoai = student.loai ?? student.student?.loai;
        const chuyenThucHanh = student.chuyen_thuc_hanh ?? student.student?.chuyen_thuc_hanh;
        const theoryInfo = student.detail?.theoryInfo;
        const passedTheoryOnline = theoryInfo && theoryInfo.loai_ly_thuyet && theoryInfo.loai_het_mon;

        if (Number(sLoai) === 1) {
          // Chỉ giữ học viên loại 1 đã đạt lý thuyết hoặc đã chuyển thực hành
          const isEligible = passedTheoryOnline || Number(chuyenThucHanh) === 2 || Number(chuyenThucHanh) === 3;
          if (!isEligible) return false;

          // Học viên loai 1 bắt buộc phải có khoa_bu và thoi_gian_xep mới được hiển thị bên danh sách thực hành
          const hasSchedule = student.khoa_bu && student.thoi_gian_xep;
          if (!hasSchedule) return false;

          // Nếu chỉ lọc riêng Lý thuyết đạt trong màn thực hành (loaiFilter chỉ chứa 1)
          if (loaiFilter.includes(1) && !loaiFilter.includes(2) && !loaiFilter.includes(3)) {
            return true;
          }

          if (loaiFilter.includes(2) && (passedTheoryOnline || Number(chuyenThucHanh) === 2)) {
            return true;
          }
          if (loaiFilter.includes(3) && (passedTheoryOnline || Number(chuyenThucHanh) === 3)) {
            return true;
          }
          return false;
        }

        return loaiFilter.includes(sLoai);
      });

      // Lọc bỏ học viên đã có khoa_bu và thoi_gian_xep trừ khi cabin & dat đều bằng false
      finalStudents = finalStudents.filter(student => {
        const hasSchedule = student.khoa_bu && student.thoi_gian_xep;

        if (hasSchedule) {
          const isCabinApproved = student.trang_thai_duyet && student.trang_thai_duyet[1] === true;
          const isDatApproved = student.trang_thai_duyet && student.trang_thai_duyet[2] === true;

          if (!isCabinApproved && !isDatApproved) {
            return true;
          }
          return false;
        }

        return true;
      });

      res.status(200).json({
        success: true,
        message: "Lấy danh sách chờ duyệt thực hành thành công",
        data: finalStudents,
        course: data.course,
        tienDoKhoaBu: data.tienDoKhoaBu
      });
    } catch (error) {
      console.error("[getChoDuyetThucHanhList] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy danh sách chờ duyệt thực hành",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/tien-do-dao-tao/hoc-bu/dang-hoc-bu
   * Lấy danh sách học viên đang học bù (đã có khoa_bu và thoi_gian_xep)
   */
  async getDangHocBuList(req, res) {
    let { ma_khoa, loai, search, sync, trang_thai, trang_thai_hoc_bu } = req.query;

    // Phân tích loai
    let loaiFilter = undefined;
    if (loai) {
      const l = String(loai).toLowerCase().trim();
      if (l === "ly_thuyet" || l === "ly-thuyet") {
        loaiFilter = [1];
      } else if (l === "thuc_hanh" || l === "thuc-hanh") {
        loaiFilter = [2, 3];
      } else if (l === "cabin") {
        loaiFilter = [2];
      } else if (l === "dat") {
        loaiFilter = [3];
      } else if (l.includes(',')) {
        loaiFilter = l.split(',').map(Number);
      } else {
        loaiFilter = [Number(l)];
      }
    }

    // Phân tích trang_thai
    let trangThaiFilter = undefined;
    if (trang_thai) {
      if (typeof trang_thai === 'string' && trang_thai.includes(',')) {
        trangThaiFilter = trang_thai.split(',').map(Number);
      } else {
        trangThaiFilter = [Number(trang_thai)];
      }
    }

    // Phân tích trang_thai_hoc_bu
    let trangThaiHocBuFilter = undefined;
    if (trang_thai_hoc_bu) {
      if (typeof trang_thai_hoc_bu === 'string' && trang_thai_hoc_bu.includes(',')) {
        trangThaiHocBuFilter = trang_thai_hoc_bu.split(',').map(Number);
      } else {
        trangThaiHocBuFilter = [Number(trang_thai_hoc_bu)];
      }
    }

    try {
      const isThucHanhScreen = loaiFilter && (loaiFilter.includes(2) || loaiFilter.includes(3));
      const queryLoai = isThucHanhScreen ? [1, 2, 3] : loaiFilter;

      const data = await hocBuService.getHocBuListDetailed({
        ma_khoa,
        loai: queryLoai,
        search,
        sync,
        trang_thai: trangThaiFilter,
        trang_thai_hoc_bu: trangThaiHocBuFilter,
        is_dang_hoc_bu: true
      });

      let finalStudents = data.students || [];

      // Lọc động theo đúng các loại được chọn ở FE
      if (loaiFilter && loaiFilter.length > 0) {
        finalStudents = finalStudents.filter(student => {
          const sLoai = student.loai ?? student.student?.loai;
          const chuyenThucHanh = student.chuyen_thuc_hanh ?? student.student?.chuyen_thuc_hanh;
          const theoryInfo = student.detail?.theoryInfo;
          const passedTheoryOnline = theoryInfo && theoryInfo.loai_ly_thuyet && theoryInfo.loai_het_mon;

          if (Number(sLoai) === 1) {
            // Trường hợp 1: Trên màn hình thực hành (loaiFilter có 2 hoặc 3, và có cả 1)
            // Chỉ hiện những học viên loại 1 đã đạt lý thuyết hoặc đã chuyển thực hành
            const hasPracticeInFilter = loaiFilter.includes(2) || loaiFilter.includes(3);
            if (hasPracticeInFilter) {
              if (loaiFilter.includes(2) && (passedTheoryOnline || Number(chuyenThucHanh) === 2)) {
                return true;
              }
              if (loaiFilter.includes(3) && (passedTheoryOnline || Number(chuyenThucHanh) === 3)) {
                return true;
              }
              return false; // Loại bỏ các học viên loại 1 chưa đạt lý thuyết
            }

            // Trường hợp 2: Chỉ xem màn hình lý thuyết (loaiFilter chỉ có 1)
            // Ẩn những học viên đã đạt lý thuyết hoặc đã chuyển thực hành
            if (loaiFilter.includes(1) && !hasPracticeInFilter) {
              if (passedTheoryOnline || Number(chuyenThucHanh) === 2 || Number(chuyenThucHanh) === 3) {
                return false;
              }
              return true;
            }
          }

          return loaiFilter.includes(sLoai);
        });
      }

      res.status(200).json({
        success: true,
        message: "Lấy danh sách học viên đang học bù thành công",
        data: finalStudents,
        course: data.course,
        tienDoKhoaBu: data.tienDoKhoaBu
      });
    } catch (error) {
      console.error("[getDangHocBuList] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi lấy danh sách học viên đang học bù",
        error: error.message,
      });
    }
  }
}
module.exports = new TienDoDaoTaoController();
