const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const hocBuNewModel = require("../models/hocBuNew.model");

class TienDoDaoTaoNewController {
  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu
   * Lấy danh sách học viên học bù với bộ lọc từ bảng hoc_bu_new
   */
  async getHocBuList(req, res) {
    let { ma_khoa, loai, search, text, trang_thai } = req.query;

    // Hỗ trợ loai[] từ FE gửi lên dưới dạng mảng
    if (!loai && req.query["loai[]"]) {
      loai = req.query["loai[]"];
    }

    const searchQuery = search || text || undefined;

    // Ánh xạ các giá trị dạng số (1, 2, 3) sang dạng chuỗi tương ứng của hoc_bu_new ('ly_thuyet', 'cabin', 'dat')
    let mappedLoai = undefined;
    if (loai) {
      const convertSingleLoai = (val) => {
        const str = String(val).trim().toLowerCase();
        if (str === "1" || str === "ly_thuyet" || str === "ly-thuyet") return "ly_thuyet";
        if (str === "2" || str === "cabin") return "cabin";
        if (str === "3" || str === "dat") return "dat";
        return str;
      };

      if (Array.isArray(loai)) {
        mappedLoai = loai.map(convertSingleLoai);
      } else if (typeof loai === "string" && loai.includes(",")) {
        mappedLoai = loai.split(",").map(convertSingleLoai);
      } else {
        mappedLoai = convertSingleLoai(loai);
      }
    }

    let parsedTrangThai = undefined;
    if (trang_thai) {
      if (Array.isArray(trang_thai)) {
        parsedTrangThai = trang_thai.map(Number).filter(n => !isNaN(n));
      } else if (typeof trang_thai === "string" && trang_thai.includes(",")) {
        parsedTrangThai = trang_thai.split(",").map(Number).filter(n => !isNaN(n));
      } else {
        parsedTrangThai = Number(trang_thai);
      }
    }

    try {
      const filters = {
        ma_khoa,
        loai: mappedLoai,
        trang_thai: parsedTrangThai,
        search: searchQuery
      };
      const data = await hocBuNewModel.list(filters);
      res.status(200).json({
        success: true,
        message: "Lấy danh sách học bù thành công",
        data: data
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
   * GET /api/tien-do-dao-tao-new/hoc-bu/detail
   * Lấy dữ liệu chi tiết tiến độ của 1 học viên từ bảng hoc_bu_new
   */
  async getHocBuDetail(req, res) {
    const { id, ma_dk } = req.query;

    try {
      let data;
      if (id) {
        data = await hocBuNewModel.getById(id);
      } else if (ma_dk) {
        const list = await hocBuNewModel.list({ search: ma_dk });
        data = list.find(item => item.ma_dk === ma_dk);
      }

      if (!data) {
        return res.status(404).json({ success: false, message: "Không tìm thấy chi tiết đơn học bù" });
      }

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
   * POST /api/tien-do-dao-tao-new/hoc-bu
   * Thêm 1 học viên vào danh sách học bù (hoặc cập nhật nếu trùng ma_dk)
   */
  async addStudentToHocBu(req, res) {
    const { ma_dk, ma_khoa, loai, ghi_chu, trang_thai, nguoi_tao } = req.body;
    if (!ma_dk || !ma_khoa || !loai) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc (ma_dk, ma_khoa, loai)" });
    }

    try {
      // Chuẩn hóa loai từ Front-end (1, 2, 3 sang chuỗi chữ)
      let normalizedLoai = String(loai).trim().toLowerCase();
      if (normalizedLoai === "1" || normalizedLoai === "ly_thuyet" || normalizedLoai === "ly-thuyet") {
        normalizedLoai = "ly_thuyet";
      } else if (normalizedLoai === "2" || normalizedLoai === "cabin") {
        normalizedLoai = "cabin";
      } else if (normalizedLoai === "3" || normalizedLoai === "dat") {
        normalizedLoai = "dat";
      }

      // Nhận diện trạng thái gửi từ body nếu có, tránh bị null
      let parsedTrangThai = undefined;
      if (trang_thai !== undefined && trang_thai !== null && String(trang_thai).trim() !== '') {
        parsedTrangThai = Number(trang_thai);
      }

      const data = {
        ma_dk,
        ma_khoa,
        loai: normalizedLoai,
        ghi_chu: ghi_chu || "Đăng ký học bù thủ công",
        nguoi_tao: nguoi_tao || "admin"
      };

      if (parsedTrangThai !== undefined && !isNaN(parsedTrangThai)) {
        data.trang_thai = parsedTrangThai;
        if (parsedTrangThai === 1) {
          data.trang_thai_ly_thuyet = 1;
        } else if (parsedTrangThai === 4) {
          data.trang_thai_thuc_hanh = 1;
          data.loai_thuc_hanh = normalizedLoai;
        }
      } else {
        if (normalizedLoai === "ly_thuyet") {
          data.trang_thai = 1; // Chờ duyệt LT
          data.trang_thai_ly_thuyet = 1;
        } else {
          data.trang_thai = 4; // Chờ duyệt TH
          data.trang_thai_thuc_hanh = 1;
          data.loai_thuc_hanh = normalizedLoai;
        }
      }

      const id = await hocBuNewModel.create(data);

      res.status(200).json({
        success: true,
        message: "Đã lưu học viên vào danh sách học bù mới",
        id
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
   * POST /api/tien-do-dao-tao-new/hoc-bu/update-status
   * Cập nhật trạng thái của bản ghi học bù sử dụng Logic State Machine cải tiến
   */
  async updateHocBuStatus(req, res) {
    const { id, action, khoa_bu, thoi_gian_xep, nguoi_update, loai_thuc_hanh } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Thiếu ID bản ghi học bù" });
    }

    try {
      const record = await hocBuNewModel.getById(id);
      if (!record) {
        return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi học bù" });
      }

      let updateData = {};
      const userUpdate = nguoi_update || "admin";

      // 1. DUYỆT (Nếu action === 'duyet')
      if (action === "duyet") {
        if (record.trang_thai === 1) {
          updateData = {
            trang_thai: 2,
            trang_thai_ly_thuyet: 2,
            nguoi_duyet_ly_thuyet: userUpdate,
            thoi_gian_duyet_ly_thuyet: new Date()
          };
        } else if (record.trang_thai === 4) {
          updateData = {
            trang_thai: 5,
            trang_thai_thuc_hanh: 2,
            loai_thuc_hanh: loai_thuc_hanh || record.loai_thuc_hanh || "cabin",
            nguoi_duyet_thuc_hanh: userUpdate,
            thoi_gian_duyet_thuc_hanh: new Date()
          };
        }
      }
      // 2. XẾP LỚP (Nếu có khoa_bu hoặc action === "xep_lop")
      else if (khoa_bu || action === "xep_lop") {
        if (record.trang_thai === 2) {
          updateData = {
            trang_thai: 3,
            trang_thai_ly_thuyet: 3,
            khoa_bu_ly_thuyet: khoa_bu,
            thoi_gian_xep_ly_thuyet: thoi_gian_xep ? new Date(thoi_gian_xep) : new Date()
          };
        } else if (record.trang_thai === 5) {
          updateData = {
            trang_thai: 6,
            trang_thai_thuc_hanh: 3,
            khoa_bu_thuc_hanh: khoa_bu,
            thoi_gian_xep_thuc_hanh: thoi_gian_xep ? new Date(thoi_gian_xep) : new Date()
          };
        }
      }
      // 3. HOÀN THÀNH (Nếu action === 'hoan_thanh')
      else if (action === "hoan_thanh") {
        if (record.loai === "ly_thuyet" && record.trang_thai === 3) {
          updateData = {
            trang_thai: 4,
            trang_thai_ly_thuyet: 4
          };
        } else if (record.loai === "ly_thuyet" && record.trang_thai === 6) {
          updateData = {
            trang_thai: 7,
            trang_thai_thuc_hanh: 4
          };
        } else if ((record.loai === "cabin" || record.loai === "dat") && record.trang_thai === 6) {
          updateData = {
            trang_thai: 7,
            trang_thai_thuc_hanh: 4
          };
        }
      }

      // Nhận diện các trường truyền trực tiếp từ req.body (để hỗ trợ luồng cập nhật thủ công từ FE cũ)
      const directFields = [
        "trang_thai", 
        "trang_thai_ly_thuyet", 
        "trang_thai_thuc_hanh", 
        "loai_thuc_hanh", 
        "khoa_bu_ly_thuyet", 
        "khoa_bu_thuc_hanh", 
        "thoi_gian_xep_ly_thuyet", 
        "thoi_gian_xep_thuc_hanh",
        "ghi_chu"
      ];

      let hasDirectUpdate = false;
      directFields.forEach(field => {
        if (req.body[field] !== undefined && req.body[field] !== null) {
          updateData[field] = req.body[field];
          hasDirectUpdate = true;
        }
      });

      if (!hasDirectUpdate && Object.keys(updateData).length === 0) {
        return res.status(400).json({ success: false, message: "Không xác định được hành động cập nhật phù hợp với trạng thái hiện tại" });
      }

      updateData.nguoi_update = userUpdate;
      await hocBuNewModel.update(id, updateData);

      res.status(200).json({
        success: true,
        message: "Cập nhật trạng thái học bù thành công",
        data: updateData
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new
   */
  async getTienDoDaoTao(req, res) {
    const { ma_khoa } = req.query;
    try {
      const data = await tienDoDaoTaoModel.getAll({ ma_khoa });
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/cho-duyet
   */
  async getChoDuyetHocBuList(req, res) {
    let { ma_khoa, loai, search } = req.query;
    
    // Chuẩn hóa loai từ FE (hỗ trợ cả số 1, 2, 3 và chữ)
    if (loai) {
      const convertSingleLoai = (val) => {
        const str = String(val).trim().toLowerCase();
        if (str === "1" || str === "ly_thuyet" || str === "ly-thuyet") return "ly_thuyet";
        if (str === "2" || str === "cabin") return "cabin";
        if (str === "3" || str === "dat") return "dat";
        return str;
      };
      loai = convertSingleLoai(loai);
    }

    try {
      const filters = {
        ma_khoa,
        loai,
        trang_thai: [1, 4], // Chờ duyệt LT hoặc Chờ duyệt TH
        search
      };
      const data = await hocBuNewModel.list(filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/cho-duyet-ly-thuyet
   */
  async getChoDuyetLyThuyetList(req, res) {
    const { ma_khoa, search } = req.query;
    try {
      const filters = {
        ma_khoa,
        trang_thai: [1], // Chờ duyệt LT
        search
      };
      const data = await hocBuNewModel.list(filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/cho-duyet-thuc-hanh
   */
  async getChoDuyetThucHanhList(req, res) {
    const { ma_khoa, search } = req.query;
    try {
      const filters = {
        ma_khoa,
        trang_thai: [4], // Chờ duyệt TH
        search
      };
      const data = await hocBuNewModel.list(filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/dang-hoc-bu
   */
  async getDangHocBuList(req, res) {
    let { ma_khoa, loai, search } = req.query;
    
    // Chuẩn hóa loai từ FE (hỗ trợ cả số 1, 2, 3 và chữ)
    if (loai) {
      const convertSingleLoai = (val) => {
        const str = String(val).trim().toLowerCase();
        if (str === "1" || str === "ly_thuyet" || str === "ly-thuyet") return "ly_thuyet";
        if (str === "2" || str === "cabin") return "cabin";
        if (str === "3" || str === "dat") return "dat";
        return str;
      };
      loai = convertSingleLoai(loai);
    }

    try {
      const filters = {
        ma_khoa,
        loai,
        trang_thai: [3, 6], // Đang học LT hoặc Đang học TH
        search
      };
      const data = await hocBuNewModel.list(filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new TienDoDaoTaoNewController();
