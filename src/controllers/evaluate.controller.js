const axios = require("axios");
const http = require("http");
const {
  callWithRetry,
  getHocVienTheoKhoa,
} = require("../services/lotusApi.service");
const {
  getHanhTrinhToken,
  invalidateHanhTrinhToken,
} = require("../services/localAuth.service");
const { computeSummary, evaluate } = require("../utils/evaluate");
const {
  computeSummary: computeSummaryDK,
  evaluate: evaluateDK,
} = require("../utils/dieuKienKiemTra");

const HANH_TRINH_BASE = "http://113.160.131.3:7782";
const LOCAL_BASE = "http://192.168.1.69:8000";

// ── Connection pool riêng cho HanhTrinh API ───────────────────────────────────
// Mặc định Node chỉ giữ 5 socket → bottleneck khi gọi 500 request song song
const hanhTrinhAgent = new http.Agent({
  keepAlive: true, // tái dùng TCP connection, tránh TCP handshake mỗi lần
  maxSockets: 100, // tối đa 100 socket song song tới cùng 1 host
  maxFreeSockets: 20, // giữ 20 socket rảnh cho request tiếp theo
  timeout: 15000,
});

const hanhTrinhAxios = axios.create({
  baseURL: HANH_TRINH_BASE,
  httpAgent: hanhTrinhAgent,
  timeout: 15000,
});

const today = new Date().toISOString().split("T")[0];

// ── Semaphore concurrency: chạy tối đa N task cùng lúc liên tục ──────────────
// Khác với batch: không cần chờ cả batch xong mới chạy tiếp
// Worker ngay lập tức nhận task mới khi hoàn thành task cũ
function withConcurrencyLimit(tasks, limit) {
  return new Promise((resolve) => {
    const results = new Array(tasks.length);
    let started = 0;
    let completed = 0;

    if (tasks.length === 0) return resolve(results);

    function runNext() {
      if (started >= tasks.length) return;
      const idx = started++;
      tasks[idx]()
        .then((result) => {
          results[idx] = result;
        })
        .catch((err) => {
          results[idx] = { status: "error", message: err.message };
        })
        .finally(() => {
          completed++;
          if (completed === tasks.length) {
            resolve(results);
          } else {
            runNext(); // worker này xong → nhận task mới ngay
          }
        });
    }

    for (let i = 0; i < Math.min(limit, tasks.length); i++) {
      runNext();
    }
  });
}

// Lấy toàn bộ danh sách check-data-student một lần
async function getAllStudentCheckData() {
  try {
    const response = await axios.get(`${LOCAL_BASE}/api/check-data-student`, {
      params: { limit: 10000, page: 1 },
    });
    const list =
      response.data?.data || response.data?.result || response.data || [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error("[getAllStudentCheckData]", err.message);
    return [];
  }
}

// Build Map O(1) — thay vì Array.find() O(n) gọi 500 lần = O(n²)
function buildStudentCheckMap(checkDataList) {
  const map = new Map();
  checkDataList.forEach((s) => {
    if (s.maDangKy) map.set(s.maDangKy, s);
  });
  return map;
}

async function fetchAndEvaluate(
  { maDK, maKhoaHoc, planIid, student },
  { ngaybatdau, endDate },
  studentCheckMap,
) {
  try {
    const { token } = await getHanhTrinhToken();

    const params = new URLSearchParams({
      ngaybatdau,
      ngayketthuc: endDate,
      ten: maDK,
      makhoahoc: maKhoaHoc,
      limit: 20,
      page: 1,
    });

    const response = await hanhTrinhAxios.get(`/api/HanhTrinh?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const dataSource = response.data?.Data || [];

    if (dataSource.length === 0) {
      return {
        maDK,
        maKhoaHoc,
        planIid,
        hoTen:
          student?.user?.name ||
          student?.name ||
          studentCheckMap.get(maDK)?.hoVaTen,
        hangDaoTao: "B.01",
        studentInfo: null,
        summary: null,
        status: "no_data",
        errors: [],
        warnings: [],
        totalSessions: 0,
        message: "Chưa có thông tin phiên học",
      };
    }

    const hangDaoTao = dataSource[0]?.HangDaoTao || "B.01";

    const summary = computeSummary(dataSource, hangDaoTao);
    const evalHanhTrinh = evaluate(summary, dataSource);

    const studentInfo = studentCheckMap.get(maDK) || null;
    const summaryDK = computeSummaryDK(dataSource);
    const evalDK = evaluateDK(summaryDK, dataSource, studentInfo);

    const allErrors = [...evalHanhTrinh.errors, ...evalDK.errors];
    const allWarnings = [...evalHanhTrinh.warnings, ...evalDK.warnings];
    const finalStatus = allErrors.length === 0 ? "pass" : "fail";

    const errorSummary =
      allErrors.length > 0 ? allErrors.map((e) => e.message).join(" | ") : null;

    return {
      maDK,
      maKhoaHoc,
      planIid,
      hoTen: student?.user?.name || student?.name || studentInfo?.hoVaTen,
      hangDaoTao,
      // ── Thông tin giảng viên & xe (lấy từ phiên học thực tế) ──
      giaoVien: dataSource[0]?.HoTenGV || null,
      bienSoXe1: studentInfo?.xeB1 || null,
      bienSoXe2: studentInfo?.xeB2 || null,
      studentInfo: studentInfo
        ? {
            giaoVien: studentInfo.giaoVien,
            xeB1: studentInfo.xeB1,
            xeB2: studentInfo.xeB2,
            khoaHoc: studentInfo.khoaHoc,
          }
        : null,
      summary: {
        // ── Thời gian (giờ) ──
        tongThoiGianGio: +summary.tongThoiGianGio.toFixed(2),
        thoiGianBanNgayGio: +summary.thoiGianBanNgayGio.toFixed(2),
        thoiGianBanDemGio: +summary.thoiGianBanDemGio.toFixed(2),
        thoiGianTuDongGio: +summary.thoiGianTuDongGio.toFixed(2),
        // ── Quãng đường (km) ──
        tongQuangDuong: +summary.tongQuangDuong.toFixed(2),
        quangDuongBanNgay: +summary.quangDuongBanNgay.toFixed(2),
        quangDuongBanDem: +summary.quangDuongBanDem.toFixed(2),
        quangDuongTuDong: +summary.quangDuongTuDong.toFixed(2),
      },
      errorSummary,
      status: finalStatus,
      errors: allErrors,
      warnings: allWarnings,
      totalSessions: dataSource.length,
    };
  } catch (err) {
    if (err?.response?.status === 401) {
      invalidateHanhTrinhToken();
    }
    return {
      maDK,
      maKhoaHoc,
      planIid,
      status: "error",
      message: err.message,
    };
  }
}

async function evaluateHanhTrinh(req, res) {
  const startTime = Date.now();

  try {
    let {
      enrolmentPlanIids,
      ngaybatdau = "2020-01-01",
      ngayketthuc,
      maKhoaHoc,
    } = req.body;

    if (!enrolmentPlanIids) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu enrolmentPlanIids" });
    }

    if (!Array.isArray(enrolmentPlanIids))
      enrolmentPlanIids = [enrolmentPlanIids];
    enrolmentPlanIids = enrolmentPlanIids.map(String);

    if (enrolmentPlanIids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu enrolmentPlanIids" });
    }

    if (
      !Array.isArray(maKhoaHoc) ||
      maKhoaHoc.length !== enrolmentPlanIids.length
    ) {
      return res.status(400).json({
        success: false,
        message: "maKhoaHoc phải là mảng có số phần tử bằng enrolmentPlanIids",
      });
    }

    const planToKhoaHocMap = {};
    enrolmentPlanIids.forEach((planIid, idx) => {
      planToKhoaHocMap[planIid] = maKhoaHoc[idx];
    });

    const endDate = ngayketthuc || new Date().toISOString().slice(0, 19);

    // 1. Song song hoàn toàn: check-data-student + tất cả lớp học cùng lúc
    const [checkDataList, ...membersPerPlan] = await Promise.all([
      getAllStudentCheckData(),
      ...enrolmentPlanIids.map((planIid) =>
        callWithRetry((auth) => getHocVienTheoKhoa(planIid, {}, auth))
          .then((data) => ({
            planIid,
            members: Array.isArray(data?.result) ? data.result : [],
          }))
          .catch((err) => {
            console.error(`[getHocVien] planIid=${planIid}`, err.message);
            return { planIid, members: [] };
          }),
      ),
    ]);

    console.log(
      `[evaluateHanhTrinh] checkDataList: ${checkDataList.length} records`,
    );

    // O(1) lookup thay vì O(n) find
    const studentCheckMap = buildStudentCheckMap(checkDataList);

    const allStudents = [];
    membersPerPlan.forEach(({ planIid, members }) => {
      console.log(
        `[getHocVien] planIid=${planIid} => ${members.length} học viên`,
      );
      members.forEach((m) => {
        const maDK = m?.user?.admission_code;
        if (maDK) {
          allStudents.push({
            maDK,
            maKhoaHoc: planToKhoaHocMap[planIid],
            planIid,
            student: m,
          });
        }
      });
    });

    console.log(`[evaluateHanhTrinh] Tổng học viên: ${allStudents.length}`);

    // 2. Chạy tất cả với semaphore concurrency (không batch tuần tự)
    // 500 học viên × ~50ms/request ÷ 80 workers ≈ ~3-4s thay vì 30s
    const CONCURRENCY = 80;
    const tasks = allStudents.map(
      (s) => () =>
        fetchAndEvaluate(s, { ngaybatdau, endDate }, studentCheckMap),
    );

    console.log(
      `[evaluateHanhTrinh] Chạy ${tasks.length} tasks, concurrency=${CONCURRENCY}`,
    );
    const results = await withConcurrencyLimit(tasks, CONCURRENCY);

    // 3. Tổng hợp
    const summary = {
      total: results.length,
      pass: results.filter((r) => r.status === "pass").length,
      fail: results.filter((r) => r.status === "fail").length,
      error: results.filter((r) => r.status === "error").length,
      no_data: results.filter((r) => r.status === "no_data").length,
      notFound: results.filter((r) => !r.studentInfo).length,
      thoiGianXuLyMs: Date.now() - startTime,
    };

    console.log(`[evaluateHanhTrinh] Xong trong ${summary.thoiGianXuLyMs}ms`);
    return res.json({ success: true, summary, data: results });
  } catch (err) {
    console.error("[evaluateHanhTrinh]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { evaluateHanhTrinh };
