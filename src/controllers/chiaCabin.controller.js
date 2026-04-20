const cabinModel = require("../models/cabin.model");
const cabinApiService = require("../services/cabinApi.service");
const { CA_HOC_CONFIG } = require("../constants/caHoc");

const normalizeMaDk = (val) => String(val || "").replace(/[^\d]/g, "");

const isMaDkMatch = (val1, val2) => {
  if (!val1 || !val2) return false;
  return normalizeMaDk(val1) === normalizeMaDk(val2);
};

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

    // 4. Tự động kiểm tra các ca trong quá khứ và cập nhật so_lan_chia
    // Lấy danh sách ma_dk để truy vấn lịch
    const maDkList = students.map(s => s.ma_dk);
    const pastAssignments = await cabinModel.getPastAssignments(maDkList);
    
    const missedIds = [];
    const missedMap = {}; // Để cập nhật nhanh vào local object bên dưới

    if (pastAssignments.length > 0) {
      pastAssignments.forEach(asm => {
        // Tìm thông tin học tập hiện tại của học viên này trong cabinMap
        // Vì ma_dk trong cabinMap đến từ API, nên ta cần dùng isMaDkMatch
        const studentMaDkFromApi = Object.keys(cabinMap).find(k => isMaDkMatch(k, asm.ma_dk));
        const session = studentMaDkFromApi ? cabinMap[studentMaDkFromApi] : { tong_thoi_gian: 0, so_bai_hoc: 0 };
        
        const status = cabinApiService.getCabinStatus(session.tong_thoi_gian, session.so_bai_hoc);

        // Nếu trạng thái hiện tại vẫn là "chua_dat" (chưa đủ 150p và 8 bài)
        // Mà đã có lịch trong quá khứ -> Đánh dấu là cần chia lại (so_lan_chia = 2)
        if (status !== 'dat') {
          missedIds.push(asm.id);
          missedMap[asm.ma_dk] = 2;
        }
      });

      // Cập nhật Database hàng loạt
      if (missedIds.length > 0) {
        await cabinModel.updateSoLanChiaBatch(missedIds, 2);
        console.log(`[getDanhSachCabinSQL] Đã tự động tăng so_lan_chia cho ${missedIds.length} ca chưa đạt.`);
      }
    }

    // 5. Merge và format
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
        ma_khoa_api: s.code, // IID

        // Tracking info
        so_lan_chia: missedMap[s.ma_dk] || s.so_lan_chia || 0,
        is_makeup: s.is_makeup || false
      };
    }).filter(s => {
      const phut = s.phut_cabin || 0;
      // Trả về nếu:
      // 1. Chưa đủ 150 phút (ở đây là <= 140)
      // 2. HOẶC (số lần chia > 1 và không phải là học bù)
      return (phut <= 140) || (s.so_lan_chia > 1 && !s.is_makeup);
    });

    return res.json({ success: true, total: data.length, data });
  } catch (err) {
    console.error("[getDanhSachCabinSQL] Lỗi:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getDanhSachCabinSQL };
