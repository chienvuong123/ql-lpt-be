const mssql = require("mssql");
const XLSX = require("xlsx");
const connectSQL = require("../configs/sql");
const tienDoDaoTaoModel = require("../models/tienDoDaoTao.model");
const hocBuNewModel = require("../models/hocBuNew.model");
const hocBuService = require("../services/hocBu.service");
const axios = require("axios");
const { getHanhTrinhToken } = require("../services/localAuth.service");

class TienDoDaoTaoNewController {
  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu
   * Lấy danh sách học viên học bù với bộ lọc từ bảng hoc_bu_new
   */
  async getHocBuList(req, res) {
    let { ma_khoa, loai, search, text, trang_thai, page, limit } = req.query;

    // Hỗ trợ loai[] từ FE gửi lên dưới dạng mảng
    if (!loai && req.query["loai[]"]) {
      loai = req.query["loai[]"];
    }

    // Hỗ trợ trang_thai[] từ FE gửi lên dưới dạng mảng
    if (!trang_thai && req.query["trang_thai[]"]) {
      trang_thai = req.query["trang_thai[]"];
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
        search: searchQuery,
        page,
        limit
      };
      const data = await hocBuNewModel.list(filters);

      const responsePayload = {
        success: true,
        message: "Lấy danh sách học bù thành công",
        data: data
      };

      if (page && limit) {
        responsePayload.total = data.total || 0;
        responsePayload.pagination = {
          page: parseInt(page),
          limit: parseInt(limit),
          total: data.total || 0
        };
      }

      res.status(200).json(responsePayload);
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
    const { id, ma_dk, sync } = req.query;

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

      const currentMaDk = String(data.ma_dk || "").trim();
      const effectiveMaKhoaTH = data.khoa_bu_thuc_hanh || data.ma_khoa || "";

      // 1. Lấy thông tin lý thuyết từ trạng thái (Mock data siêu tốc)
      const trangThaiLT = data.trang_thai_ly_thuyet || 0;
      data.theoryInfo = {
        loai_ly_thuyet: trangThaiLT >= 2 ? 1 : 0,
        loai_het_mon: trangThaiLT >= 4 ? 1 : 0,
        ghi_chu: ""
      };

      // 2. Gọi song song API thông tin tập (Lý thuyết + Cabin), Lotus (Rubrik) và API Hành trình (DAT) + DB nội bộ
      const [tapRes, lotusRes, hanhTrinhRes, kyDatRes, regRes] = await Promise.allSettled([
        axios.get(`https://lapphuongthanh.io.vn/api/thongtintap?maDK=${currentMaDk}`, { timeout: 10000 }),
        hocBuService.getTheoryLotusDetail(currentMaDk),
        (async () => {
          const isSync = sync === 'true' || sync === true;
          const phienHocDATModel = require("../models/phienHocDAT.model");

          if (!isSync) {
            // Lấy từ DB local trước cho siêu nhanh (0ms)
            try {
              const localSessions = await phienHocDATModel.getPhienHocDATByMaDK(currentMaDk);
              if (localSessions && localSessions.length > 0) {
                return localSessions.map(s => ({
                  ThoiDiemDangNhap: s.gio_vao,
                  ThoiDiemDangXuat: s.gio_ra,
                  BienSo: s.bien_so_xe,
                  TongQuangDuong: s.tong_km,
                  TongThoiGian: s.thoi_gian,
                  HoTenGV: s.ho_ten_gv,
                  HangDaoTao: data.hang
                }));
              }
            } catch (e) {
              console.error("Cache DAT DB error:", e.message);
            }
          }

          const resToken = await getHanhTrinhToken();
          const token = resToken?.token;
          if (!token) return [];

          const offset = new Date().getTimezoneOffset();
          const localToday = new Date(Date.now() - (offset * 60 * 1000));
          const endDateStr = localToday.toISOString().split('T')[0] + "T23:59:00";

          const fetchDAT = async (useKhoa) => {
            const params = new URLSearchParams({
              ngaybatdau: "2020-01-01",
              ngayketthuc: endDateStr,
              ten: currentMaDk,
              limit: 500,
              page: 1,
            });
            if (useKhoa && effectiveMaKhoaTH) params.append("makhoahoc", effectiveMaKhoaTH);

            const response = await axios.get(`http://113.160.131.3:7782/api/HanhTrinh?${params}`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 6000 // Tối ưu giảm timeout
            });
            return response.data?.Data || [];
          };

          let sessions = await fetchDAT(true).catch(() => []);
          if (sessions.length === 0 && effectiveMaKhoaTH) {
            sessions = await fetchDAT(false).catch(() => []); // Fallback
          }

          if (sessions.length > 0) {
            phienHocDATModel.upsertPhienHocDATMany(currentMaDk, sessions, effectiveMaKhoaTH).catch(() => { });
          }

          return sessions;
        })(),
        (async () => {
          const pool = await connectSQL();
          const kyDatResult = await pool.request().input("ma_dk", mssql.VarChar, currentMaDk).query(`
             SELECT TOP 1 trang_thai as ky_dat, ghi_chu_1, ghi_chu_2 FROM ky_dat WHERE ma_dk = @ma_dk
           `);
          return kyDatResult.recordset[0] || {};
        })(),
        require("../models/vehicleRegistration.model").findByMaDkList([currentMaDk])
      ]);

      // 3. Map thông tin tập (Rubrik + Cabin)
      const cabinApi = require("../services/cabinApi.service");
      const rawCabinArray = (tapRes.status === "fulfilled" ? tapRes.value?.data?.data : []) || [];
      const cabinMap = cabinApi.buildCabinMap(rawCabinArray);
      const myCabin = cabinMap[currentMaDk] || { tong_phut: 0, so_bai_hoc: 0, bai_hoc: [] };

      const lotusData = lotusRes.status === "fulfilled" ? lotusRes.value : {};

      data.scoreByRubrik = lotusData?.scoreByRubrik || [];
      data.cabinDetails = myCabin.bai_hoc || [];
      data.cabinSummary = {
        tong_thoi_gian: myCabin.tong_phut || 0,
        tong_bai: myCabin.so_bai_hoc || 0
      };

      // 4. Map thông tin DAT
      const datSessions = hanhTrinhRes.status === "fulfilled" ? hanhTrinhRes.value : [];
      let tongKm = 0;
      let tongGiay = 0;

      data.datDetails = {
        sessions: datSessions.map(s => {
          const km = Number(s.TongQuangDuong || s.Distance || 0);
          let giay = Number(s.TongThoiGian || s.Duration || 0);
          if (giay > 0 && giay < 100) giay = Math.round(giay * 3600); // Đổi từ giờ (decimal) sang giây

          tongKm += km;
          tongGiay += giay;

          return {
            ThoiDiemDangNhap: s.ThoiDiemDangNhap,
            ThoiDiemDangXuat: s.ThoiDiemDangXuat,
            BienSo: s.BienSo || s.BienSoXe,
            TongQuangDuong: km,
            TongThoiGian: giay,
            HoTenGV: s.HoTenGV || s.ho_ten_gv,
            HangDaoTao: data.hang
          };
        })
      };

      const datH = Math.floor(tongGiay / 3600);
      const datM = Math.floor((tongGiay % 3600) / 60);
      data.datSummary = {
        tong_quang_duong: parseFloat(tongKm.toFixed(2)),
        tong_thoi_gian: `${datH}h ${datM}'`
      };

      // 5. Map DB nội bộ
      const kyDat = kyDatRes.status === "fulfilled" ? kyDatRes.value : {};
      const regList = regRes.status === "fulfilled" ? regRes.value : [];
      const regInfo = regList[0] || {};

      data.ky_dat = kyDat.ky_dat || null;
      data.ghi_chu_dat_1 = kyDat.ghi_chu_1 || null;
      data.ghi_chu_dat_2 = kyDat.ghi_chu_2 || null;
      data.xe_b1 = regInfo.xe_b1 || null;
      data.xe_b2 = regInfo.xe_b2 || null;

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
      if (normalizedLoai === "1" || normalizedLoai === "ly_thuyet") {
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
          data.trang_thai = null; // Chờ duyệt LT
          data.trang_thai_ly_thuyet = null;
        } else {
          data.trang_thai = 4; // Chờ duyệt TH
          data.trang_thai_thuc_hanh = null;
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
   * POST /api/tien-do-dao-tao-new/hoc-bu/update-status-bulk
   * Cập nhật trạng thái học bù cho nhiều bản ghi cùng lúc
   */
  async updateHocBuStatusBulk(req, res) {
    const { ids, action, khoa_bu, nguoi_update, loai_thuc_hanh, thoi_gian_xep } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Danh sách ID không hợp lệ." });
    }

    try {
      const userUpdate = nguoi_update || "admin";
      const batchSize = 100;
      let totalUpdated = 0;

      for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize);

        const batchPromises = batchIds.map(async (id) => {
          const record = await hocBuNewModel.getById(id);
          if (!record) return null;

          let updateData = {};

          if (action === "duyet") {
            if (record.trang_thai === 1) {
              updateData = { trang_thai: 2, trang_thai_ly_thuyet: 2, nguoi_duyet_ly_thuyet: userUpdate, thoi_gian_duyet_ly_thuyet: new Date() };
            } else if (record.trang_thai === 4) {
              updateData = { trang_thai: 5, trang_thai_thuc_hanh: 2, loai_thuc_hanh: loai_thuc_hanh || record.loai_thuc_hanh || "cabin", nguoi_duyet_thuc_hanh: userUpdate, thoi_gian_duyet_thuc_hanh: new Date() };
            }
          } else if (khoa_bu || action === "xep_lop") {
            if (record.trang_thai === 2) {
              updateData = { trang_thai: 3, trang_thai_ly_thuyet: 3, khoa_bu_ly_thuyet: khoa_bu, thoi_gian_xep_ly_thuyet: thoi_gian_xep ? new Date(thoi_gian_xep) : new Date() };
            } else if (record.trang_thai === 5) {
              updateData = { trang_thai: 6, trang_thai_thuc_hanh: 3, khoa_bu_thuc_hanh: khoa_bu, thoi_gian_xep_thuc_hanh: thoi_gian_xep ? new Date(thoi_gian_xep) : new Date() };
            }
          } else if (action === "hoan_thanh") {
            if (record.loai === "ly_thuyet" && record.trang_thai === 3) {
              updateData = { trang_thai: 4, trang_thai_ly_thuyet: 4 };
            } else if (record.loai === "ly_thuyet" && record.trang_thai === 6) {
              updateData = { trang_thai: 7, trang_thai_thuc_hanh: 4 };
            } else if ((record.loai === "cabin" || record.loai === "dat") && record.trang_thai === 6) {
              updateData = { trang_thai: 7, trang_thai_thuc_hanh: 4 };
            }
          }

          const directFields = [
            "trang_thai", "trang_thai_ly_thuyet", "trang_thai_thuc_hanh", "loai_thuc_hanh",
            "khoa_bu_ly_thuyet", "khoa_bu_thuc_hanh", "thoi_gian_xep_ly_thuyet", "thoi_gian_xep_thuc_hanh", "ghi_chu"
          ];

          let hasDirectUpdate = false;
          directFields.forEach(field => {
            if (req.body[field] !== undefined && req.body[field] !== null) {
              updateData[field] = req.body[field];
              hasDirectUpdate = true;
            }
          });

          if (!hasDirectUpdate && Object.keys(updateData).length === 0) {
            return null;
          }

          updateData.nguoi_update = userUpdate;
          await hocBuNewModel.update(id, updateData);
          return id;
        });

        const results = await Promise.all(batchPromises);
        totalUpdated += results.filter(r => r !== null).length;
      }

      res.status(200).json({
        success: true,
        message: `Cập nhật trạng thái thành công cho ${totalUpdated}/${ids.length} bản ghi học bù.`
      });

    } catch (error) {
      console.error("[updateHocBuStatusBulk] Error:", error);
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
    let { ma_khoa, loai, search, text, page, limit } = req.query;
    const searchQuery = search || text || undefined;

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

    // Xác định mảng trạng thái dựa trên loại
    let filterTrangThai = [1, 2, 4, 5];
    if (loai === "ly_thuyet") {
      filterTrangThai = [1, 2];
    } else if (loai === "cabin" || loai === "dat" || loai === "thuc_hanh" || loai === "thuc-hanh") {
      filterTrangThai = [4, 5];
    }

    try {
      const filters = {
        ma_khoa,
        loai,
        trang_thai: filterTrangThai,
        search: searchQuery,
        page,
        limit
      };
      const data = await hocBuNewModel.list(filters);

      const responsePayload = { success: true, data };
      if (page && limit) {
        responsePayload.total = data.total || 0;
        responsePayload.pagination = { page: parseInt(page), limit: parseInt(limit), total: data.total || 0 };
      }

      res.status(200).json(responsePayload);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/cho-duyet-ly-thuyet
   */
  async getChoDuyetLyThuyetList(req, res) {
    const { ma_khoa, search, text } = req.query;
    const searchQuery = search || text || undefined;
    try {
      const filters = {
        ma_khoa,
        trang_thai: [1, 2], // Chờ duyệt LT (1) và Đã duyệt LT (2)
        search: searchQuery
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
    let { ma_khoa, loai, loai_thuc_hanh, search, text, page, limit } = req.query;
    const searchQuery = search || text || undefined;

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
        loai_thuc_hanh,
        trang_thai: [4, 5], // Chờ duyệt TH (4) và Đã duyệt TH (5)
        search: searchQuery,
        page,
        limit
      };
      const data = await hocBuNewModel.list(filters);

      const responsePayload = { success: true, data };
      if (page && limit) {
        responsePayload.total = data.total || 0;
        responsePayload.pagination = { page: parseInt(page), limit: parseInt(limit), total: data.total || 0 };
      }

      res.status(200).json(responsePayload);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/dang-hoc-bu
   */
  async getDangHocBuList(req, res) {
    let { ma_khoa, loai, search, text, trang_thai, page, limit } = req.query;

    if (!trang_thai && req.query["trang_thai[]"]) {
      trang_thai = req.query["trang_thai[]"];
    }

    const searchQuery = search || text || undefined;

    if (loai) {
      const map = {
        "1": "ly_thuyet",
        "2": "cabin",
        "3": "dat",
      };
      loai = map[String(loai).trim().toLowerCase()] || loai;
    }

    // Parse trang_thai dynamic input (1-7) or array
    let parsedTrangThai = undefined;
    if (trang_thai) {
      if (Array.isArray(trang_thai)) {
        parsedTrangThai = trang_thai.map(Number).filter(n => !isNaN(n));
      } else if (typeof trang_thai === "string" && trang_thai.includes(",")) {
        parsedTrangThai = trang_thai.split(",").map(Number).filter(n => !isNaN(n));
      } else {
        const num = Number(trang_thai);
        if (!isNaN(num)) parsedTrangThai = num;
      }
    }

    const finalTrangThai = parsedTrangThai !== undefined ? parsedTrangThai : [3, 6];

    try {
      const filters = { ma_khoa, loai, trang_thai: finalTrangThai, search: searchQuery, page, limit };
      const data = await hocBuNewModel.list(filters);

      if (data?.length > 0) {
        // Thu thập tất cả mã khóa cần query
        const courseCodes = [...new Set(
          data.flatMap(item => [item.ma_khoa, item.khoa_bu_ly_thuyet, item.khoa_bu_thuc_hanh].filter(Boolean).map(String))
        )];

        // Query tiến độ đào tạo
        const pool = await connectSQL();
        const request = new mssql.Request(pool);
        courseCodes.forEach((c, i) => request.input(`c_${i}`, mssql.NVarChar, c));
        const inParams = courseCodes.map((_, i) => `@c_${i}`).join(",");

        // 1. Query tên khóa học từ khoa_hoc
        const courseRequest = new mssql.Request(pool);
        courseCodes.forEach((c, i) => courseRequest.input(`c_${i}`, mssql.NVarChar, c));
        const { recordset: courseList } = await courseRequest.query(`
          SELECT ma_khoa, ten_khoa FROM [dbo].[khoa_hoc]
          WHERE ma_khoa IN (${inParams})
        `);
        const courseNameMap = Object.fromEntries(
          courseList.map(c => [String(c.ma_khoa).trim(), String(c.ten_khoa).trim()])
        );

        // 2. Query tiến độ đào tạo từ tien_do_dao_tao
        const progressRequest = new mssql.Request(pool);
        courseCodes.forEach((c, i) => progressRequest.input(`c_${i}`, mssql.NVarChar, c));
        const { recordset: progressList } = await progressRequest.query(`
          SELECT * FROM [dbo].[tien_do_dao_tao]
          WHERE ma_khoa IN (${inParams})
        `);
        const progressMap = Object.fromEntries(
          progressList.map(p => [`${String(p.ma_khoa).trim()}_${Number(p.loai ?? 0)}`, p])
        );

        // Bản đồ dự phòng chỉ theo Mã khóa (Dành cho trường hợp DB lưu sai cột loai)
        const progressFallbackMap = Object.fromEntries(
          progressList.map(p => [String(p.ma_khoa).trim(), p])
        );

        const getProgress = (code, loaiNum) => {
          if (!code) return null;
          const trimmed = String(code).trim();
          // 1. Khớp chính xác loại
          const exact = progressMap[`${trimmed}_${loaiNum}`];
          if (exact) return exact;
          // 2. Fallback: Lấy bất kỳ tiến độ nào khớp mã khóa
          return progressFallbackMap[trimmed] || null;
        };

        const getCourseName = (code) => courseNameMap[String(code || "").trim()] || code;

        // Gắn tiến độ và tên khóa học vào từng bản ghi học viên
        data.forEach(item => {
          const mK = item.ma_khoa;
          const kbLT = item.khoa_bu_ly_thuyet;
          const kbTH = item.khoa_bu_thuc_hanh;

          // Khóa chính (loai = 0)
          const mainProgress = getProgress(mK, 0);
          item.khoa = {
            ten_khoa: getCourseName(mK),
            bat_dau_ly_thuyet: mainProgress?.bat_dau_ly_thuyet || null,
            ket_thuc_ly_thuyet: mainProgress?.ket_thuc_ly_thuyet || null,
            kiem_tra_het_mon: mainProgress?.kiem_tra_het_mon || null,
            bat_dau_cabin: mainProgress?.bat_dau_cabin || null,
            ket_thuc_cabin: mainProgress?.ket_thuc_cabin || null,
            bat_dau_dat: mainProgress?.bat_dau_dat || null,
            ket_thuc_dat: mainProgress?.ket_thuc_dat || null
          };

          // Khóa bù lý thuyết (loai = 1)
          const ltProgress = getProgress(kbLT, 1);
          item.khoa_bu_ly_thuyet = kbLT ? {
            ten_khoa: getCourseName(kbLT),
            bat_dau_ly_thuyet: ltProgress?.bat_dau_ly_thuyet || null,
            ket_thuc_ly_thuyet: ltProgress?.ket_thuc_ly_thuyet || null,
            kiem_tra_het_mon: ltProgress?.kiem_tra_het_mon || null
          } : null;

          // Khóa bù thực hành (loai = 2)
          const thProgress = getProgress(kbTH, 2);
          item.khoa_bu_thuc_hanh = kbTH ? {
            ten_khoa: getCourseName(kbTH),
            bat_dau_cabin: thProgress?.bat_dau_cabin || null,
            ket_thuc_cabin: thProgress?.ket_thuc_cabin || null,
            bat_dau_dat: thProgress?.bat_dau_dat || null,
            ket_thuc_dat: thProgress?.ket_thuc_dat || null
          } : null;
        });
      }

      const responsePayload = { success: true, data };
      if (page && limit) {
        responsePayload.total = data.total || 0;
        responsePayload.pagination = { page: parseInt(page), limit: parseInt(limit), total: data.total || 0 };
      }

      res.status(200).json(responsePayload);
    } catch (error) {
      console.error("[getDangHocBuList] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/tien-do-dao-tao/hoc-bu/check-hoan-thanh-ly-thuyet
   * Kiểm tra tự động hoàn thành lý thuyết học bù và cập nhật trang_thai = 4, trang_thai_ly_thuyet = 4
   */
  async checkHoanThanhLyThuyet(req, res) {
    try {
      const pool = await connectSQL();
      const request = new mssql.Request(pool);

      const query = `
        UPDATE h
        SET h.trang_thai = 4,
            h.trang_thai_ly_thuyet = 4,
            h.updated_at = GETDATE()
        FROM [dbo].[hoc_bu_new] h
        INNER JOIN [dbo].[tien_do_dao_tao] t 
          ON h.khoa_bu_ly_thuyet = t.ma_khoa 
        WHERE h.trang_thai = 3
          AND h.trang_thai_ly_thuyet = 3
          AND h.loai = 'ly_thuyet'
          AND t.ket_thuc_ly_thuyet IS NOT NULL
          AND CAST(t.ket_thuc_ly_thuyet AS DATE) <= CAST(GETDATE() AS DATE)
      `;

      const result = await request.query(query);
      const rowsAffected = result.rowsAffected[0] || 0;

      res.status(200).json({
        success: true,
        message: `Đã hoàn thành kiểm tra lý thuyết học bù. Đã cập nhật ${rowsAffected} học viên sang trạng thái lý thuyết đạt (trạng thái 4).`,
        updatedCount: rowsAffected
      });
    } catch (error) {
      console.error("[checkHoanThanhLyThuyet] Error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi kiểm tra hoàn thành lý thuyết học bù",
        error: error.message
      });
    }
  }

  /**
   * POST /api/tien-do-dao-tao-new/hoc-bu/import
   * Nhập dữ liệu học viên học bù số lượng lớn từ Excel
   */
  async importHocBuExcel(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Vui lòng cung cấp file Excel đính kèm." });
      }

      let { loai, khoa_bu, ghi_chu, nguoi_tao } = req.body;
      const actor = nguoi_tao || "admin";
      const finalNote = ghi_chu || "Import từ dữ liệu Excel";

      // 1. Xử lý chuẩn hóa 'loai' học bù
      let nLoai = String(loai || "ly_thuyet").trim().toLowerCase();
      if (["1", "ly_thuyet", "ly-thuyet"].includes(nLoai)) nLoai = "ly_thuyet";
      else if (["2", "cabin"].includes(nLoai)) nLoai = "cabin";
      else if (["3", "dat"].includes(nLoai)) nLoai = "dat";

      // 2. Parse Buffer Excel thành JSON thô để quét động
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });

      if (rawRows.length === 0) throw new Error("File excel rỗng, vui lòng kiểm tra lại nội dung.");

      // 3. Dò tìm tiêu đề (Header Row) có chứa Mã ĐK để xác định cấu trúc bảng dữ liệu
      let headIndex = -1;
      let cols = { ma_dk: -1, ho_ten: -1, ma_khoa: -1 };

      for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        const isHeader = rawRows[r].some(cell => {
          const txt = String(cell).toLowerCase();
          return txt.includes("mã đk") || txt.includes("ma dk");
        });

        if (isHeader) {
          headIndex = r;
          rawRows[r].forEach((cell, cIdx) => {
            const headerTxt = String(cell).trim().toLowerCase();
            if (headerTxt.includes("mã đk") || headerTxt.includes("ma dk")) cols.ma_dk = cIdx;
            else if (headerTxt.includes("họ tên") || headerTxt.includes("ho ten")) cols.ho_ten = cIdx;
            else if (headerTxt.includes("khóa") || headerTxt.includes("khoa")) cols.ma_khoa = cIdx;
          });
          break;
        }
      }

      if (headIndex === -1 || cols.ma_dk === -1) {
        throw new Error("Không tìm thấy dòng tiêu đề chứa cột 'Mã ĐK' trong Excel.");
      }

      // 4. Thu thập toàn bộ mã học viên
      const sheetEntries = [];
      for (let i = headIndex + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        const code = String(row[cols.ma_dk] || "").trim();
        if (!code) continue;

        sheetEntries.push({
          ma_dk: code,
          xlName: cols.ho_ten !== -1 ? String(row[cols.ho_ten] || "").trim() : "",
          xlKhoa: cols.ma_khoa !== -1 ? String(row[cols.ma_khoa] || "").trim() : ""
        });
      }

      if (sheetEntries.length === 0) {
        throw new Error("Không trích xuất được dữ liệu học viên hợp lệ nào bên dưới dòng tiêu đề.");
      }

      // 5. Batch truy vấn database để lấy thông tin Mã Khóa đầy đủ & xác thực học viên
      const codes = [...new Set(sheetEntries.map(e => e.ma_dk))];
      const pool = await connectSQL();
      const batchReq = new mssql.Request(pool);

      const codeParams = codes.map((_, i) => `@c${i}`).join(",");
      codes.forEach((c, i) => batchReq.input(`c${i}`, mssql.VarChar, c));

      const hvSet = await batchReq.query(`SELECT ma_dk, ma_khoa FROM [dbo].[hoc_vien] WHERE ma_dk IN (${codeParams})`);
      const dbRegistry = {};
      hvSet.recordset.forEach(x => { dbRegistry[String(x.ma_dk).trim()] = String(x.ma_khoa).trim(); });

      // 6. Phân bổ danh sách dữ liệu để đẩy vào DB Upsert
      const dataToUpsert = [];
      const notFoundArr = [];

      sheetEntries.forEach(entry => {
        const fullKhoa = dbRegistry[entry.ma_dk];
        if (!fullKhoa) {
          notFoundArr.push(entry.ma_dk);
        }

        let finalMaKhoa = fullKhoa || entry.xlKhoa || "IMPORTED";

        // Chuẩn hóa: Nếu mã khóa không bắt đầu bằng '30004', tự động thêm vào trước
        if (finalMaKhoa && finalMaKhoa !== "IMPORTED" && !String(finalMaKhoa).startsWith("30004")) {
          finalMaKhoa = "30004" + finalMaKhoa;
        }

        const payload = {
          ma_dk: entry.ma_dk,
          ma_khoa: finalMaKhoa,
          loai: nLoai,
          ghi_chu: finalNote,
          nguoi_tao: actor,
          nguoi_update: actor
        };

        // Gán trạng thái dựa trên pha đào tạo, mặc định NULL theo yêu cầu
        if (nLoai === "ly_thuyet") {
          payload.trang_thai = null;
          payload.trang_thai_ly_thuyet = null;
          if (khoa_bu) payload.khoa_bu_ly_thuyet = khoa_bu;
        } else {
          payload.trang_thai = null;
          payload.trang_thai_thuc_hanh = null;
          payload.loai_thuc_hanh = nLoai;
          if (khoa_bu) payload.khoa_bu_thuc_hanh = khoa_bu;
        }

        dataToUpsert.push(payload);
      });

      // 7. Tiến hành nạp hàng loạt
      const importRes = await hocBuNewModel.upsertMany(dataToUpsert);

      return res.status(200).json({
        success: true,
        message: `Xử lý file Excel thành công.`,
        stats: {
          totalUploaded: sheetEntries.length,
          savedSuccess: importRes.success,
          notFoundInSystem: notFoundArr.length
        }
      });

    } catch (err) {
      console.error("[importHocBuExcel] Unexpected error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Xảy ra lỗi máy chủ trong quá trình Import."
      });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/chi-tiet-lop-ly-thuyet/:ma_khoa_bu
   * Lấy chi tiết số học viên của 1 lớp bù lý thuyết kèm tiến độ LT
   */
  async getChiTietLopBuLyThuyet(req, res) {
    const { ma_khoa_bu } = req.params;
    try {
      if (!ma_khoa_bu) return res.status(400).json({ success: false, message: "Thiếu ma_khoa_bu" });

      const list = await hocBuNewModel.list({ khoa_bu_ly_thuyet: ma_khoa_bu, limit: 1000, page: 1 });

      // 1. Lấy thông tin tiến độ lý thuyết thực tế từ DB nội bộ (để đảm bảo chính xác 100%)
      const lopLyThuyetModel = require("../models/lopLyThuyet.model");
      const theoryRaw = await lopLyThuyetModel.getAll({ ma_dk_list: list.map(s => s.ma_dk) }).catch(() => []);
      const theoryMap = {};
      theoryRaw.forEach(t => { theoryMap[String(t.ma_dk).trim()] = t; });

      // 2. Lặp tuần tự theo từng cụm (Chunked/Batch concurrent) để không làm sập API Lotus
      const students = [];
      const batchSize = 6; 
      for (let i = 0; i < list.length; i += batchSize) {
        const chunk = list.slice(i, i + batchSize);
        const chunkResults = await Promise.all(chunk.map(async (student) => {
          const currentMaDk = String(student.ma_dk || "").trim();
          const tt = theoryMap[currentMaDk] || {};

          // Ưu tiên dữ liệu thật từ bảng trạng thái, nếu trống fallback về cờ tạm của bảng học bù
          let theoryInfo = {
            loai_ly_thuyet: tt.loai_ly_thuyet !== undefined ? Number(tt.loai_ly_thuyet) : (student.trang_thai_ly_thuyet >= 2 ? 1 : 0),
            loai_het_mon: tt.loai_het_mon !== undefined ? Number(tt.loai_het_mon) : (student.trang_thai_ly_thuyet >= 4 ? 1 : 0),
            ghi_chu: tt.ghi_chu || ""
          };

          // Gọi API ngoài an toàn hơn trong từng batch
          const lotusData = await hocBuService.getTheoryLotusDetail(currentMaDk).catch(() => null);

          return {
            ...student,
            theoryInfo,
            scoreByRubrik: lotusData?.scoreByRubrik || []
          };
        }));
        students.push(...chunkResults);
      }

      res.status(200).json({ success: true, data: students });
    } catch (e) {
      console.error("[getChiTietLopBuLyThuyet] Error:", e);
      res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * GET /api/tien-do-dao-tao-new/hoc-bu/chi-tiet-lop-thuc-hanh/:ma_khoa_bu
   * Lấy chi tiết số học viên của 1 lớp bù thực hành kèm tiến độ DAT, Cabin
   */
  async getChiTietLopBuThucHanh(req, res) {
    const { ma_khoa_bu } = req.params;
    try {
      if (!ma_khoa_bu) return res.status(400).json({ success: false, message: "Thiếu ma_khoa_bu" });

      const list = await hocBuNewModel.list({ khoa_bu_thuc_hanh: ma_khoa_bu, limit: 1000, page: 1 });
      if (list.length === 0) return res.status(200).json({ success: true, data: [] });

      // Chuẩn bị Token DAT để tái sử dụng cho vòng lặp, tránh lặp đăng nhập
      const resToken = await getHanhTrinhToken().catch(() => null);
      const token = resToken?.token;

      const cabinApi = require("../services/cabinApi.service");
      const phienHocDATModel = require("../models/phienHocDAT.model");

      const offset = new Date().getTimezoneOffset();
      const endDateStr = new Date(Date.now() - (offset * 60 * 1000)).toISOString().split('T')[0] + "T23:59:00";

      const students = await Promise.all(list.map(async (student) => {
        const currentMaDk = String(student.ma_dk || "").trim();
        const effectiveMaKhoa = student.ma_khoa || ""; // Sử dụng khóa chính để đảm bảo fetch chuẩn

        // 1. Gọi song song API Cabin và tìm DAT (Local cache)
        const [tapRes, datData] = await Promise.allSettled([
          axios.get(`https://lapphuongthanh.io.vn/api/thongtintap?maDK=${currentMaDk}`, { timeout: 8000 }),
          (async () => {
            // Thử lấy từ DB Cache trước để tối ưu tốc độ 
            try {
              const localSessions = await phienHocDATModel.getPhienHocDATByMaDK(currentMaDk);
              if (localSessions && localSessions.length > 0) {
                return localSessions.map(s => ({
                  ThoiDiemDangNhap: s.gio_vao,
                  ThoiDiemDangXuat: s.gio_ra,
                  BienSo: s.bien_so_xe,
                  TongQuangDuong: s.tong_km,
                  TongThoiGian: s.thoi_gian,
                  HoTenGV: s.ho_ten_gv,
                  HangDaoTao: student.hang
                }));
              }
            } catch (e) { console.error(`[DAT Local Error ${currentMaDk}]`, e.message); }

            // Nếu DB không có mới bắn live API
            if (!token) return [];

            const fetchDAT = async (useKhoa) => {
              const params = new URLSearchParams({
                ngaybatdau: "2020-01-01",
                ngayketthuc: endDateStr,
                ten: currentMaDk,
                limit: 500,
                page: 1,
              });
              if (useKhoa && effectiveMaKhoa) params.append("makhoahoc", effectiveMaKhoa);
              const response = await axios.get(`http://113.160.131.3:7782/api/HanhTrinh?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 8000
              });
              return response.data?.Data || [];
            };

            let sList = await fetchDAT(true).catch(() => []);
            if (sList.length === 0) sList = await fetchDAT(false).catch(() => []);

            if (sList.length > 0) {
              phienHocDATModel.upsertPhienHocDATMany(currentMaDk, sList, effectiveMaKhoa).catch(() => { });
            }
            return sList;
          })()
        ]);

        // 2. Xử lý dữ liệu Cabin
        const rawCabinArray = (tapRes.status === "fulfilled" ? tapRes.value?.data?.data : []) || [];
        const cabinMap = cabinApi.buildCabinMap(rawCabinArray);
        const myCabin = cabinMap[currentMaDk] || { tong_phut: 0, so_bai_hoc: 0, bai_hoc: [] };

        // 3. Xử lý dữ liệu DAT
        const datSessions = datData.status === "fulfilled" ? datData.value : [];
        let tongKm = 0;
        let tongGiay = 0;

        const mappedSessions = datSessions.map(s => {
          const km = Number(s.TongQuangDuong || s.Distance || 0);
          let giay = Number(s.TongThoiGian || s.Duration || 0);
          if (giay > 0 && giay < 100) giay = Math.round(giay * 3600);

          tongKm += km;
          tongGiay += giay;

          return {
            ThoiDiemDangNhap: s.ThoiDiemDangNhap || s.gio_vao,
            ThoiDiemDangXuat: s.ThoiDiemDangXuat || s.gio_ra,
            BienSo: s.BienSo || s.BienSoXe || s.bien_so_xe,
            TongQuangDuong: km,
            TongThoiGian: giay,
            HoTenGV: s.HoTenGV || s.ho_ten_gv,
            HangDaoTao: student.hang
          };
        });

        const datH = Math.floor(tongGiay / 3600);
        const datM = Math.floor((tongGiay % 3600) / 60);

        return {
          ...student,
          cabinDetails: myCabin.bai_hoc || [],
          cabinSummary: {
            tong_thoi_gian: myCabin.tong_phut || 0,
            tong_bai: myCabin.so_bai_hoc || 0
          },
          datDetails: { sessions: mappedSessions },
          datSummary: {
            tong_quang_duong: parseFloat(tongKm.toFixed(2)),
            tong_thoi_gian: `${datH}h ${datM}'`
          }
        };
      }));

      res.status(200).json({ success: true, data: students });
    } catch (e) {
      console.error("[getChiTietLopBuThucHanh] Error:", e);
      res.status(500).json({ success: false, message: e.message });
    }
  }
}

module.exports = new TienDoDaoTaoNewController();
