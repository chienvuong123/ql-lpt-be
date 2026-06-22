const axios = require("axios");

async function test() {
  try {
    const res = await axios.get("http://localhost:8000/api/google-sheet/hoc-vien-list-db", {
      params: { page: 1, limit: 5 }
    });
    console.log("Success! Data from local database:");
    console.log(JSON.stringify(res.data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Failed to fetch database data:", err.message);
    if (err.response) {
      console.error(err.response.data);
    }
    process.exit(1);
  }
}

test();
