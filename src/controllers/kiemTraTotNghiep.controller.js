const service = require("../services/kiemTraTotNghiep.service");
const ExcelJS = require("exceljs");

async function getAll(req, res) {
  try {
    const query = {
      filterType: req.query.filterType,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    };
    const data = await service.getAllStudents(query);
    res.json({ success: true, total: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function importExcel(req, res) {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }
  try {
    const apiRes = await fetch('http://192.168.1.69:8000/api/ly-thuyet/lop-hoc');
    const apiData = await apiRes.json();
    const classes = apiData.data || [];

    const result = await service.importFromExcel(req.file.buffer, classes);
    res.json({ success: true, message: "Import completed", ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function exportReport(req, res) {
  try {
    const query = {
      filterType: req.query.filterType,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    };
    const data = await service.getReportData(query);
    res.json({ success: true, total: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function exportExcelFile(req, res) {
  try {
    const query = {
      filterType: req.query.filterType,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    };
    const data = await service.getReportData(query);

    // Đặt mặc định tên header lớn nhất chứa toàn bộ các môn học là "Lý thuyết online"
    let bangTongHopName = "Lý thuyết online";

    const aoa = [];
    // Row 1
    aoa.push([
      "Mã ĐK", "Tên học viên", "Ngày sinh", "Căn cước", "Mã khóa", "Tổng km DAT", "Tổng thời gian DAT", "Tổng thời gian Cabin", "Số bài Cabin",
      bangTongHopName, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
    ]);
    // Row 2
    aoa.push([
      "", "", "", "", "", "", "", "", "",
      "Kỹ thuật lái xe", "", "Cấu tạo sửa chữa", "", "Đạo đức, VHGT, PCCC", "", "Pháp luật GTĐB", "", "", "", "", "", "", "", "Mô phỏng", ""
    ]);
    // Row 3
    aoa.push([
      "", "", "", "", "", "", "", "", "",
      "", "", "", "", "", "", "PL1 - Luật trật tự, ATGT", "", "PL2 - Biển báo", "", "PL3 - Xử lý THGT", "", "Tổng ôn tập", "", "", ""
    ]);
    // Row 4
    aoa.push([
      "", "", "", "", "", "", "", "", "",
      "Điểm", "Trạng thái đạt", "Điểm", "Trạng thái đạt", "Điểm", "Trạng thái đạt",
      "Điểm", "Trạng thái đạt", "Điểm", "Trạng thái đạt", "Điểm", "Trạng thái đạt", "Điểm", "Trạng thái đạt",
      "Điểm", "Trạng thái đạt"
    ]);

    // Data Rows
    const topics = [
      "Kỹ thuật lái xe", "Cấu tạo sửa chữa", "Đạo đức", "PL1", "PL2", "PL3", "Tổng ôn tập", "Mô phỏng"
    ];

    data.forEach(d => {
      const row = [
        d.ma_dk, d.ho_ten, d.ngay_sinh, d.can_cuoc, d.ma_khoa, d.ht_tong_quang_duong, d.ht_tong_thoi_gian, d.cabin_tong_thoi_gian, d.cabin_so_bai_hoc
      ];

      const ltMap = {};
      (d.chi_tiet_ly_thuyet || []).forEach(lt => {
        const match = topics.find(t => lt.name && lt.name.includes(t));
        if (match) {
          ltMap[match] = lt;
        }
      });

      topics.forEach(t => {
        const item = ltMap[t];
        if (item) {
          row.push(item.score);
          row.push(Number(item.passed) === 1 || item.passed === true ? "Đạt" : "Chưa đạt");
        } else {
          row.push(0);
          row.push("Chưa đạt");
        }
      });

      aoa.push(row);
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("KetQuaTotNghiep");

    worksheet.addRows(aoa);

    // Cấu hình Merge Cột/Hàng
    // Cột cơ bản gộp dọc 4 dòng
    for (let c = 1; c <= 9; c++) {
      worksheet.mergeCells(1, c, 4, c);
    }
    // Header Cấp 1
    worksheet.mergeCells(1, 10, 1, 25);
    
    // Cấp 2 ngang + dọc (Kỹ thuật, Cấu tạo, Đạo đức, Mô phỏng)
    worksheet.mergeCells(2, 10, 3, 11);
    worksheet.mergeCells(2, 12, 3, 13);
    worksheet.mergeCells(2, 14, 3, 15);
    worksheet.mergeCells(2, 24, 3, 25);
    
    // Cấp 2 Pháp luật GTĐB (Chỉ ngang)
    worksheet.mergeCells(2, 16, 2, 23);
    
    // Cấp 3 Các nhóm PL (Ngang)
    worksheet.mergeCells(3, 16, 3, 17);
    worksheet.mergeCells(3, 18, 3, 19);
    worksheet.mergeCells(3, 20, 3, 21);
    worksheet.mergeCells(3, 22, 3, 23);

    // Style cho tất cả các ô
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (rowNumber <= 4) {
          cell.font = { bold: true };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle' };
        }
      });
    });

    // Chỉnh độ rộng cột cơ bản
    worksheet.columns.forEach((column, i) => {
      if (i < 9) column.width = 15;
      else column.width = 12;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Disposition', 'attachment; filename="KetQuaTotNghiep.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAll, importExcel, exportReport, exportExcelFile };
