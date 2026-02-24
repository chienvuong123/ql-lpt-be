const Student = require("../models/student.model");
const StudentExcelParser = require("../utils/studentExcelParser");
const fs = require("fs");
const StudentXmlParser = require("../utils/studentXmlParser");
const { convertJp2ToPng } = require("../utils/convertBase64");

class StudentService {
  static async importStudents(filePath, options = {}) {
    try {
      const data = StudentExcelParser.parseExcel(filePath);
      if (!data.length) throw new Error("File rỗng");

      const { isValid, errors } = StudentExcelParser.validateData(data);
      if (!isValid) return { success: false, errors };

      const ops = data.map((item) => ({
        updateOne: {
          filter: { maDangKy: item.maDangKy },
          update: { $set: { ...item, updatedAt: new Date() } },
          upsert: true,
        },
      }));

      const res = await Student.bulkWrite(ops, { ordered: false });

      if (options.deleteAfterImport !== false && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return {
        success: true,
        stats: {
          total: data.length,
          inserted: res.upsertedCount,
          updated: res.modifiedCount,
        },
      };
    } catch (e) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw e;
    }
  }

  static async importAdditionalDataFromXml(filePath, options = {}) {
    try {
      const xmlData = await StudentXmlParser.parseXml(filePath);
      if (!xmlData.length) throw new Error("File XML rỗng hoặc sai định dạng");

      const processedData = await Promise.all(
        xmlData.map(async (item) => {
          const convertedImage = await convertJp2ToPng(item.anhChanDung);

          return {
            ...item,
            anhChanDung: convertedImage,
          };
        }),
      );

      const ops = processedData.map((item) => ({
        updateOne: {
          filter: { maDangKy: item.maDangKy },
          // Chỉ cập nhật các trường mới từ XML, không đè lên dữ liệu điểm từ Excel
          update: {
            $set: {
              anhChanDung: item.anhChanDung,
              khoaHoc: item.khoaHoc,
              updatedAt: new Date(),
            },
          },
          upsert: false, // Không tự tạo mới nếu Excel chưa có
        },
      }));

      const res = await Student.bulkWrite(ops, { ordered: false });

      if (options.deleteAfterImport !== false && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return {
        success: true,
        stats: {
          totalInXml: xmlData.length,
          updated: res.modifiedCount,
        },
      };
    } catch (e) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw e;
    }
  }
}

module.exports = StudentService;
