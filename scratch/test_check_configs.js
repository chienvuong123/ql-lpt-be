const axios = require("axios");

const BASE_URL = "http://localhost:8000/api/check-configs";

async function runTests() {
  try {
    console.log("--- Testing GET /api/check-configs ---");
    let res = await axios.get(BASE_URL);
    console.log("GET Status:", res.status);
    console.log("GET Response Data:", JSON.stringify(res.data, null, 2));

    console.log("\n--- Testing PUT /api/check-configs ---");
    const updatePayload = {
      checkNghiGiuaPhien: { enabled: false, startDate: "2025-06-01" },
      checkSaiXe: { enabled: true, startDate: null }
    };
    res = await axios.put(BASE_URL, updatePayload);
    console.log("PUT Status:", res.status);
    console.log("PUT Response Data:", res.data);

    console.log("\n--- Testing GET /api/check-configs after update ---");
    res = await axios.get(BASE_URL);
    console.log("GET Response Data:", JSON.stringify(res.data, null, 2));

    console.log("\n--- Testing POST /api/check-configs ---");
    const postPayload = {
      checkKey: "checkVuotDen",
      enabled: true,
      startDate: null,
      description: "Kiểm tra vượt đèn đỏ"
    };
    res = await axios.post(BASE_URL, postPayload);
    console.log("POST Status:", res.status);
    console.log("POST Response Data:", res.data);

    console.log("\n--- Testing GET /api/check-configs after creation ---");
    res = await axios.get(BASE_URL);
    console.log("GET Response Data:", JSON.stringify(res.data, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err.response ? err.response.data : err.message);
    process.exit(1);
  }
}

runTests();
