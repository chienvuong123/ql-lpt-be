const cabinModel = require("../models/cabin.model");
const cabinApiService = require("../services/cabinApi.service");

// Simple In-Memory Cache for External API Results
const cabinApiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

const getDanhSachCabinSQL = async (req, res) => {
  try {
    const { khoa, hoTen } = req.query;

    // 1. Lấy danh sách từ SQL (đã join các bảng)
    const students = await cabinModel.getCabinStudentListSQL({ maKhoa: khoa, hoTen });

    if (students.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    // 2. Lấy kết quả học tập từ API để có tổng thời gian
    // Để tối ưu, ta sử dụng in-memory cache để tránh gọi API trùng lặp cho cùng một khóa
    const uniqueKhoas = [...new Set(students.map(s => s.ma_khoa))];
    const now = Date.now();

    const allSessionResults = await Promise.all(
      uniqueKhoas.map(k => {
        const cached = cabinApiCache.get(k);
        if (cached && (now - cached.timestamp < CACHE_TTL)) {
          return cached.data;
        }
        
        // Fetch new data and update cache
        return cabinApiService.getDanhSachKetQuaCabin({ khoa: k })
          .then(r => {
            const data = r?.data || [];
            cabinApiCache.set(k, { data, timestamp: Date.now() });
            return data;
          })
          .catch(err => {
            console.warn(`[getDanhSachCabinSQL] Lỗi gọi API khóa ${k}:`, err.message);
            // Nếu có dữ liệu cũ trong cache thì dùng tạm, không thì trả về mảng rỗng
            return cached ? cached.data : [];
          });
      })
    );
    
    const flatResults = allSessionResults.flat();
    const cabinMap = cabinApiService.buildCabinMap(flatResults);

    // 3. Merge và format
    const data = students.map(s => {
      const session = cabinMap[s.ma_dk] || { tong_thoi_gian: 0, so_bai_hoc: 0 };
      const tongPhut = Math.round(session.tong_thoi_gian / 60);

      return {
        ma_dk: s.ma_dk,
        ma_khoa: s.ma_khoa,
        khoa_hoc: s.ten_khoa,
        ho_ten: s.ho_ten,
        cccd: s.cccd,
        nam_sinh: s.ngay_sinh ? new Date(s.ngay_sinh).getFullYear() : null,
        gioi_tinh: s.gioi_tinh,
        hang_xe: s.ten_khoa?.match(/K\d+B01/i) ? "B1" : "B2",

        giao_vien: s.giao_vien,
        xe_b1: s.xe_b1,
        xe_b2: s.xe_b2,

        loai_ly_thuyet: s.loai_ly_thuyet,
        loai_het_mon: s.loai_het_mon,
        dat_cabin: s.dat_cabin,
        ghi_chu: s.ghi_chu,

        // Dữ liệu từ cabin API
        phut_cabin: tongPhut > 0 ? tongPhut : 0,
        tong_thoi_gian: session.tong_thoi_gian,
        so_bai_hoc: session.so_bai_hoc || 0,
        bai_hoc: session.bai_hoc || [],
        trang_thai_cabin: cabinApiService.getCabinStatus(session.tong_thoi_gian, session.so_bai_hoc),

        // Dữ liệu từ tiến độ đào tạo
        bat_dau_cabin: s.bat_dau_cabin,
        ket_thuc_cabin: s.ket_thuc_cabin,
        ngay_khai_giang: s.ngay_khai_giang,
        ma_khoa_api: s.code // IID
      };
    }).filter(s => {
      const phut = s.phut_cabin || 0;
      return phut <= 140; // Lấy phut_cabin = 0 hoặc <= 140 phút
    });

    return res.json({ success: true, total: data.length, data });
  } catch (err) {
    console.error("[getDanhSachCabinSQL] Lỗi:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getDanhSachCabinSQL };
