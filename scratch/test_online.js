
const axios = require('axios');

async function testCheckOnline() {
  const url = 'http://localhost:8000/api/cabin/check-online';
  const payload = {
    maDkList: ["30004-20240502160058287"], // Sample from user
    startTime: "2024-08-26T15:00:00.000Z",
    endTime: "2024-08-26T17:00:00.000Z"
  };

  try {
    const response = await axios.post(url, payload);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

testCheckOnline();
