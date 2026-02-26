// const Course = require("../models/course.model");
// const CourseService = require("../services/course.service");

// class CourseController {
//   static async getAll(req, res) {
//     try {
//       const {
//         page = 1,
//         limit = 10,
//         search,
//         trangThai,
//         sortBy = "ngayBatDau",
//         sortOrder = "desc",
//       } = req.query;
//       const query = {};

//       if (search) {
//         const reg = new RegExp(search, "i");
//         query.$or = [{ maKhoa: reg }, { tenKhoa: reg }, { donViToChuc: reg }];
//       }
//       if (trangThai && trangThai !== "all")
//         query.trangThai = new RegExp(`^${trangThai}$`, "i");

//       const [data, total] = await Promise.all([
//         Course.find(query)
//           .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
//           .skip((page - 1) * limit)
//           .limit(Number(limit)),
//         Course.countDocuments(query),
//       ]);

//       res.json({
//         success: true,
//         data,
//         pagination: {
//           total,
//           page: Number(page),
//           limit: Number(limit),
//           pages: Math.ceil(total / limit),
//         },
//       });
//     } catch (e) {
//       res.status(500).json({ success: false, error: e.message });
//     }
//   }

//   static async getById(req, res) {
//     try {
//       const data = await Course.findById(req.params.id);
//       data
//         ? res.json({ success: true, data })
//         : res.status(404).json({ success: false, message: "Not found" });
//     } catch (e) {
//       res.status(500).json({ success: false, error: e.message });
//     }
//   }

//   static async importCourses(req, res) {
//     try {
//       if (!req.file)
//         return res.status(400).json({ success: false, message: "No file" });
//       const result = await CourseService.importCourses(req.file.path, req.body);
//       res.json(result);
//     } catch (e) {
//       res.status(500).json({ success: false, error: e.message });
//     }
//   }

//   static async getCourseOptions(req, res) {
//     try {
//       const data = await Course.find({}, "maKhoa tenKhoa").sort({ tenKhoa: 1 });
//       res.json({ success: true, data });
//     } catch (e) {
//       res.status(500).json({ success: false, error: e.message });
//     }
//   }
// }
// module.exports = CourseController;
