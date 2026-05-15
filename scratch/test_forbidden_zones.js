const axios = require("axios");

async function runTest() {
  try {
    console.log("1. Testing POST /api/forbidden-zones...");
    const postRes = await axios.post("http://localhost:8000/api/forbidden-zones", {
      name: "Ngã tư Hàng Xanh TEST",
      lat: 10.80069,
      lng: 106.71332,
      radius_m: 120,
      description: "Test Vùng Cấm"
    });
    console.log("POST Success! Returned:", postRes.data);
    
    const createdId = postRes.data.data.id;
    
    console.log("2. Testing GET /api/forbidden-zones...");
    const getRes = await axios.get("http://localhost:8000/api/forbidden-zones");
    console.log("GET Success! Data Length:", getRes.data.data.length);
    
    console.log("3. Testing PUT /api/forbidden-zones/:id...");
    const putRes = await axios.put(`http://localhost:8000/api/forbidden-zones/${createdId}`, {
      radius_m: 200,
      description: "Updated radius to 200m"
    });
    console.log("PUT Success! Updated data:", putRes.data);
    
    console.log("4. Testing DELETE /api/forbidden-zones/:id...");
    const deleteRes = await axios.delete(`http://localhost:8000/api/forbidden-zones/${createdId}`);
    console.log("DELETE Success!", deleteRes.data);
    
    console.log("\nALL TESTS PASSED PERFECTLY! 🔥");
  } catch (err) {
    if (err.response) {
      console.error("API Status Error:", err.response.status);
      console.error("API Message:", err.response.data);
    } else {
      console.error("Network/General Error:", err.message);
    }
  }
  process.exit(0);
}

runTest();
