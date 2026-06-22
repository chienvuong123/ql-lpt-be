const googleSheetModel = require("../src/models/googleSheet.model");

async function checkInList() {
  try {
    const result = await googleSheetModel.getUnassignedStudents2026({ limit: 100000 });
    console.log("Total returned:", result.total);
    console.log("Data length:", result.data.length);
    
    const found = result.data.find(h => h.cccd === "030096003630");
    if (found) {
      console.log("Found student in returned list:", found);
    } else {
      console.log("Student with CCCD 030096003630 was NOT found in the returned list.");
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkInList();
