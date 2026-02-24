const Course = require("../models/course.model");
const CourseExcelParser = require("../utils/courseExcelParser");
const fs = require("fs");

class CourseService {
  static async importCourses(filePath, options = {}) {
    const data = CourseExcelParser.parseExcel(filePath);
    const { isValid, errors } = CourseExcelParser.validateData(data);

    if (!isValid) return { success: false, errors };

    const ops = data.map((item) => ({
      updateOne: {
        filter: { maKhoa: item.maKhoa },
        update: { $set: item },
        upsert: true,
      },
    }));

    const res = await Course.bulkWrite(ops);
    if (options.deleteAfterImport !== false && fs.existsSync(filePath))
      fs.unlinkSync(filePath);

    return {
      success: true,
      stats: {
        total: data.length,
        inserted: res.upsertedCount,
        updated: res.modifiedCount,
      },
    };
  }
}
module.exports = CourseService;
