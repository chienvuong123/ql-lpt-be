// const Student = require("../models/student.model");
// const StudentService = require("../services/student.service"); // Đổi tên cho đúng StudentService

// class StudentController {
//   static async getAll(req, res) {
//     try {
//       const { search, maKhoaHoc, cccd } = req.query;
//       const query = {};

//       if (search) {
//         const reg = new RegExp(search, "i");
//         query.$or = [{ maDangKy: reg }, { ten: reg }, { ma: reg }];
//       }

//       if (maKhoaHoc) {
//         query["khoaHoc.maKhoaHoc"] = maKhoaHoc;
//       }

//       if (cccd) {
//         query.ma = cccd;
//       }

//       const data = await Student.find(query).sort({ createdAt: -1 });

//       res.json({
//         success: true,
//         count: data.length,
//         data,
//       });
//     } catch (e) {
//       res.status(500).json({ success: false, error: e.message });
//     }
//   }

//   static async importStudents(req, res) {
//     try {
//       const excelFile = req.files["excelFile"]
//         ? req.files["excelFile"][0]
//         : null;
//       const xmlFile = req.files["xmlFile"] ? req.files["xmlFile"][0] : null;

//       if (!excelFile && !xmlFile) {
//         return res.status(400).json({
//           success: false,
//           message: "Cần ít nhất 1 file Excel hoặc XML",
//         });
//       }

//       let results = { excel: null, xml: null };

//       if (excelFile) {
//         results.excel = await StudentService.importStudents(excelFile.path);
//       }

//       if (xmlFile) {
//         results.xml = await StudentService.importAdditionalDataFromXml(
//           xmlFile.path,
//         );
//       }

//       res.json({ success: true, results });
//     } catch (e) {
//       res.status(500).json({ success: false, error: e.message });
//     }
//   }
// }

// module.exports = StudentController;
