const { getHocVienTheoKhoa, callWithRetry } = require("../src/services/lotusApi.service");

async function test() {
  try {
    const enrolmentPlanIid = "33405846";
    const data = await callWithRetry((auth) =>
      getHocVienTheoKhoa(enrolmentPlanIid, { page: 1, items_per_page: 10 }, auth)
    );

    const students = data?.result || [];
    console.log("Total students fetched:", students.length);
    
    if (students.length > 0) {
      console.log("Keys of student object:", Object.keys(students[0]));
      console.log("Sample student (user object keys):", Object.keys(students[0].user || {}));
      console.log("Full sample student (first 1):", JSON.stringify(students[0], null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
