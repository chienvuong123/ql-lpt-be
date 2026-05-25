const axios = require("axios");

const BASE_URL = "http://localhost:8000/api/check-configs";

async function runTests() {
  try {
    console.log("--- 1. Testing GET /api/check-configs initial ---");
    let res = await axios.get(BASE_URL);
    console.log("GET Response Keys:", Object.keys(res.data.data));

    console.log("\n--- 2. Testing POST /api/check-configs with numeric value (14) ---");
    const testKey1 = "checkTestPhienNghi_14";
    const postPayload1 = {
      checkKey: testKey1,
      enabled: true,
      startDate: null,
      description: "Thử nghiệm phiên dừng nghỉ 14 phút",
      value: 14
    };
    res = await axios.post(BASE_URL, postPayload1);
    console.log("POST 1 Status:", res.status);
    console.log("POST 1 Response:", res.data);

    console.log("\n--- 3. Testing POST /api/check-configs with string value ('20phut') ---");
    const testKey2 = "checkTestPhienNghi_20phut";
    const postPayload2 = {
      checkKey: testKey2,
      enabled: true,
      startDate: null,
      description: "Thử nghiệm phiên dừng nghỉ 20 phút",
      value: "20phut"
    };
    res = await axios.post(BASE_URL, postPayload2);
    console.log("POST 2 Status:", res.status);
    console.log("POST 2 Response:", res.data);

    console.log("\n--- 4. Testing GET /api/check-configs to verify dynamic values ---");
    res = await axios.get(BASE_URL);
    const data = res.data.data;
    console.log(`Value for '${testKey1}':`, data[testKey1]);
    console.log(`Value for '${testKey2}':`, data[testKey2]);

    if (data[testKey1] && data[testKey1].value === 14) {
      console.log("✅ Success: Numeric value 14 parsed correctly as a Number!");
    } else {
      console.error("❌ Error: Numeric value mismatch", data[testKey1]);
    }

    if (data[testKey2] && data[testKey2].value === "20phut") {
      console.log("✅ Success: String value '20phut' parsed correctly as a String!");
    } else {
      console.error("❌ Error: String value mismatch", data[testKey2]);
    }

    console.log("\n--- 5. Testing PUT /api/check-configs to update value ---");
    const updatePayload = {
      [testKey1]: {
        enabled: true,
        startDate: "2026-06-01",
        value: 25
      }
    };
    res = await axios.put(BASE_URL, updatePayload);
    console.log("PUT Status:", res.status);
    console.log("PUT Response:", res.data);

    console.log("\n--- 6. Testing GET /api/check-configs to verify the updated value ---");
    res = await axios.get(BASE_URL);
    const updatedData = res.data.data;
    console.log(`Updated Value for '${testKey1}':`, updatedData[testKey1]);

    if (updatedData[testKey1] && updatedData[testKey1].value === 25) {
      console.log("✅ Success: Value updated to 25 and parsed correctly!");
    } else {
      console.error("❌ Error: Updated value mismatch", updatedData[testKey1]);
    }

    console.log("\n--- Tests completed! ---");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err.response ? err.response.data : err.message);
    process.exit(1);
  }
}

runTests();
