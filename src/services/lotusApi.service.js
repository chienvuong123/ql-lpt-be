const axios = require("axios");
const { getToken, invalidateToken, generateSandTokens } = require("./lotusAuth.service");

const LOTUS_BASE = "https://staging-api.lotuslms.com";
const ORG_ID = "22197961";
const RUBRIC_IID = "27958750";

function isTokenExpiredResponse(data) {
  return (
    data?.message === "token_invalid" ||
    data?.err_code === 402 ||
    data?.is_guest === true
  );
}

// Lấy danh sách lớp học lý thuyết
async function getLopHocLyThuyet(searchParams = {}, authInfo) {
  const params = new URLSearchParams();

  ["created", "approved", "ready_to_execute", "executed"].forEach((s) =>
    params.append("status[]", s),
  );
  params.append("organizations[]", "22197961");
  [
    "organizations",
    "academic_categories",
    "training_plan_iid",
    "program",
    "learning_stats",
  ].forEach((e) => params.append("_sand_expand[]", e));
  params.append("include_sub_organizations", 1);
  params.append("include_items_from_ancestor_organizations", 1);
  params.append("submit", 1);
  params.append("items_per_page", searchParams.items_per_page || 200);
  params.append("page", searchParams.page || 1);
  params.append("_sand_ajax", 1);
  params.append("_sand_platform", 3);
  params.append("_sand_readmin", 1);
  params.append("_sand_is_wan", false);
  params.append("_sand_ga_sessionToken", "");
  params.append("_sand_ga_browserToken", "");
  params.append("_sand_domain", "lapphuongthanh");
  params.append("_sand_masked", "");
  params.append("allow_cache_api_cdn", 1);
  params.append("_sand_get_total", 0);
  
  if (searchParams.text) {
    params.append("text", searchParams.text);
  }

  params.append("_sand_session_id", authInfo.sessionId);
  params.append("_sand_client_sync_token", "n:692ebb9e9c2a6ddfb98063a0");
  params.append("lang", "vn");
  params.append("_sand_user_agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36");

  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid);
  const bodyParams = new URLSearchParams();
  bodyParams.append("_sand_web_url", "https://lapphuongthanh.huelms.com/admin/enrolment-plan");
  bodyParams.append("_sand_device_uuid", "26aaca1b-7137-4cbc-810e-13daf412f718");
  bodyParams.append("_sand_token", authInfo.token);
  bodyParams.append("_sand_uiid", authInfo.iid);
  bodyParams.append("_sand_ri", sand_ri);
  bodyParams.append("_sand_rit", sand_rit);
  bodyParams.append("_sand_uid", authInfo.id || authInfo.uid);

  const url = `${LOTUS_BASE}/enrolment-plan/search?${params.toString()}`;

  try {
    const response = await axios.post(url, bodyParams, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error(`[getLopHocLyThuyet] Error:`, error.message);
    if (error.response) {
      console.error(`[getLopHocLyThuyet] Response error status: ${error.response.status}`);
      console.error(`[getLopHocLyThuyet] Response error data:`, error.response.data);
    }
    throw error;
  }
}

const _courseCache = new Map();

// Lấy danh sách học viên theo lớp (Có tích hợp Smart Cache 2 phút & SQL Server Backup)
async function getHocVienTheoKhoa(
  enrolmentPlanIid,
  extraParams = {},
  authInfo,
) {
  const isForceBackup = extraParams.from_backup === true || extraParams.from_backup === "true";
  
  // 1. If explicit backup read requested
  if (isForceBackup) {
    const backupRepository = require("../repositories/backup.repository");
    const localData = await backupRepository.getHocVienKhoa(enrolmentPlanIid, extraParams.text || "");
    return {
      success: true,
      total: localData.length,
      result: localData.map(mapBackupToLotusStudent),
      _is_backup: true,
    };
  }

  // 2. RAM Cache Check
  const cacheKey = `${enrolmentPlanIid}_${extraParams.page || 1}_${extraParams.text || ""}`;
  const cachedEntry = _courseCache.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.ts < 120000)) {
    return cachedEntry.data;
  }

  // 3. Prepare query parameters for Lotus LMS API
  const params = new URLSearchParams();
  params.append("_sand_get_total", 0);
  params.append("user_organizations[0]", ORG_ID);
  params.append("include_sub_organizations", 1);
  params.append("include_items_that_not_under_of_organization", 0);
  params.append("show_items_that_not_under_of_organization", 0);
  params.append("include_items_that_not_in_any_organization", 0);
  params.append("statuses[0]", "activated");
  params.append("requireOrganization", 1);
  params.append("includeRootOrganizations", 1);
  params.append("getOnlyOrganizationWhereUserHasPermission", 1);
  params.append("enrolment_plan_iid", enrolmentPlanIid);
  params.append("rubric_iid", extraParams.rubric_iid || RUBRIC_IID);
  
  if (extraParams.text) {
    params.append("text", extraParams.text);
  }

  const expands = [
    "user.positions",
    "last_login_info",
    "today_gained_kpi_time",
    "user.phongbans",
    "relations_with_groups.relations.r",
  ];
  expands.forEach((v, i) => params.append(`_sand_expand[${i}]`, v));

  params.append("get_note", 1);
  params.append("submit", 1);
  params.append("page", extraParams.page || 1);
  params.append("items_per_page", extraParams.items_per_page || 300);
  params.append("_sand_ajax", 1);
  params.append("_sand_platform", 3);
  params.append("_sand_readmin", 1);
  params.append("_sand_is_wan", false);
  params.append("_sand_ga_sessionToken", "");
  params.append("_sand_ga_browserToken", "");
  params.append("_sand_domain", "lapphuongthanh");
  params.append("_sand_masked", "");
  
  params.append("_sand_web_url", `https://lapphuongthanh.huelms.com/admin/enrolment-plan/${enrolmentPlanIid}/members`);
  params.append("_sand_device_uuid", "56a5c298-9e07-4674-8ed1-052225b3f806");
  params.append("_sand_session_id", authInfo.sessionId);
  params.append("allow_cache_api_cdn", 1);
  params.append("_sand_client_sync_token", "n:c1da8692600039400000e000");
  
  params.append("_sand_token", authInfo.token);
  params.append("_sand_uiid", authInfo.iid);
  params.append("_sand_uid", authInfo.id || authInfo.uid);
  params.append("lang", "vn");

  const { sand_ri, sand_rit } = generateSandTokens(authInfo.iid);
  params.append("_sand_ri", sand_ri);
  params.append("_sand_rit", sand_rit);

  console.log(`[getHocVienTheoKhoa] Requesting: ${LOTUS_BASE}/api/v2/enrolment-plan/search-members (Plan IID: ${enrolmentPlanIid})`);

  try {
    const response = await axios.post(
      `${LOTUS_BASE}/api/v2/enrolment-plan/search-members?${params.toString()}`,
      null,
      { timeout: 10000 }
    );

    console.log(`[getHocVienTheoKhoa] Success! Received data. Total items: ${response.data?.result?.length || 0}`);

    if (response.data?.result) {
      _courseCache.set(cacheKey, { ts: Date.now(), data: response.data });
      
      // Asynchronously trigger SQL Server DB cache backup
      const backupService = require("./backup.service");
      backupService.backupHocVienTheoKhoa(enrolmentPlanIid, response.data.result).catch((e) => {
        console.error("[getHocVienTheoKhoa] DB Cache Backup Failed:", e.message);
      });
    }

    return response.data;
  } catch (error) {
    console.warn(`[getHocVienTheoKhoa] API Call Failed: ${error.message}. Querying local backup as fallback...`);
    
    // Auto fallback to local SQL Server Cache Backup if available
    const backupRepository = require("../repositories/backup.repository");
    const localData = await backupRepository.getHocVienKhoa(enrolmentPlanIid, extraParams.text || "");
    if (localData && localData.length > 0) {
      return {
        success: true,
        total: localData.length,
        result: localData.map(mapBackupToLotusStudent),
        _is_backup: true,
      };
    }
    
    throw error;
  }
}

// Mapper helper to translate SQL backup structure back to original Lotus LMS object structure
function mapBackupToLotusStudent(s) {
  return {
    id: s.ma_dk,
    user: {
      iid: s.user_iid,
      name: s.ho_ten,
      first_name: s.first_name,
      last_name: s.last_name,
      avatar: s.avatar,
      birthday: s.birthday,
      birth_year: s.birth_year,
      sex: s.sex,
      identification_card: s.identification_card,
      identification_card_date: s.identification_card_date,
      identification_card_place: s.identification_card_place,
      nationality: s.nationality,
      organization_name: s.organization_name,
      school: s.school,
      status: s.user_status,
      admission_code: s.ma_dk,
    },
    last_login_info: s.last_login_ts ? { ts: s.last_login_ts, device: s.last_login_device } : null,
    learning_progress: {
      item_iid: s.item_iid,
      total_hour_learned: s.total_hour_learned ? parseFloat(s.total_hour_learned) : 0,
      progress: s.progress ? parseFloat(s.progress) : 0,
      passed: s.passed === 1 || s.passed === true,
      learned: s.learned === 1 || s.learned === true,
      score_by_rubrik: (() => {
        if (!s.score_by_rubrik) return [];
        try {
          const parsed = JSON.parse(s.score_by_rubrik);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && typeof parsed === "object") {
            const arr = parsed.score_by_rubrik || parsed.score_by_rubric;
            if (Array.isArray(arr)) return arr;
          }
          return [];
        } catch (e) {
          return [];
        }
      })(),
    }
  };
}

// Wrapper tự động retry khi token hết hạn
async function callWithRetry(apiFn) {
  let auth = await getToken();
  let result = await apiFn(auth);

  if (isTokenExpiredResponse(result)) {
    console.log("[LotusApi] Token hết hạn, đang đăng nhập lại...");
    invalidateToken();
    auth = await getToken(); // login lại
    result = await apiFn(auth); // retry 1 lần
  }

  return result;
}

module.exports = {
  getLopHocLyThuyet,
  getHocVienTheoKhoa,
  callWithRetry,
};
