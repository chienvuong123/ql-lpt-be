const axios = require("axios");
const { getToken, invalidateToken } = require("./lotusAuth.service");

const LOTUS_BASE = "https://staging-api.lotuslms.com";
const ORG_ID = "22197961";
const RUBRIC_IID = "28113712";

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
  params.append("_sand_use_internal_network", 0);
  params.append("allow_cache_api_cdn", 1);
  params.append("_sand_get_total", 0);
  params.append("text", searchParams.text || "");

  params.append("_sand_session_id", authInfo.sessionId);
  params.append("_sand_token", authInfo.token);
  params.append("_sand_uid", authInfo.uid);
  params.append("_sand_uiid", authInfo.iid);

  const url = `${LOTUS_BASE}/enrolment-plan/search?${params.toString()}`;

  const response = await axios.post(url);
  return response.data;
}

// Lấy danh sách học viên theo lớp
async function getHocVienTheoKhoa(
  enrolmentPlanIid,
  extraParams = {},
  authInfo,
) {
  const data = new URLSearchParams();

  data.append("_sand_get_total", 0);
  data.append("user_organizations[0]", ORG_ID);
  data.append("include_sub_organizations", 1);
  data.append("include_items_that_not_under_of_organization", 0);
  data.append("show_items_that_not_under_of_organization", 0);
  data.append("include_items_that_not_in_any_organization", 0);
  data.append("statuses[0]", "activated");
  data.append("requireOrganization", 1);
  data.append("includeRootOrganizations", 1);
  data.append("getOnlyOrganizationWhereUserHasPermission", 1);
  data.append("enrolment_plan_iid", enrolmentPlanIid);
  data.append("rubric_iid", RUBRIC_IID);
  data.append("get_note", 1);
  data.append("submit", 1);
  data.append("page", extraParams.page || 1);
  data.append("items_per_page", 150);

  if (extraParams.text) data.append("text", extraParams.text);

  const expands = [
    "user.positions",
    "last_login_info",
    "today_gained_kpi_time",
    "user.phongbans",
    "relations_with_groups.relations.r",
  ];
  expands.forEach((v, i) => data.append(`_sand_expand[${i}]`, v));

  data.append("_sand_ajax", 1);
  data.append("_sand_platform", 3);
  data.append("_sand_readmin", 1);
  data.append("_sand_is_wan", false);
  data.append("_sand_domain", "lapphuongthanh");
  data.append(
    "_sand_web_url",
    `https://lapphuongthanh.huelms.com/admin/enrolment-plan/${enrolmentPlanIid}/members`,
  );
  data.append("_sand_session_id", authInfo.sessionId);
  data.append("_sand_token", authInfo.token);
  data.append("_sand_uiid", authInfo.iid);
  data.append("_sand_uid", authInfo.id);

  const response = await axios.post(
    `${LOTUS_BASE}/api/v2/enrolment-plan/search-members`,
    data,
  );
  return response.data;
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
