const { getCabinStudentListSQL } = require("../src/models/cabin.model");

async function testQuery() {
    try {
        console.log("Testing getCabinStudentListSQL...");
        const result = await getCabinStudentListSQL({ maKhoa: 'K26', hoTen: 'Nguyễn' });
        console.log(`Success! Found ${result.length} students.`);
    } catch (err) {
        console.error("Query failed:", err.message);
        process.exit(1);
    }
}

testQuery();
