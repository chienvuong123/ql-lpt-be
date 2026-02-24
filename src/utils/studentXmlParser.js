const xml2js = require("xml2js");
const fs = require("fs");

class StudentXmlParser {
  static async parseXml(filePath) {
    const xmlData = fs.readFileSync(filePath, "utf-8");
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);

    // Truy cập theo cấu trúc JSON mày gửi
    const baoCao = result.BAO_CAO1;
    const infoKhoaHoc = baoCao.DATA.KHOA_HOC;
    const danhSachHocVien = baoCao.DATA.NGUOI_LXS.NGUOI_LX;

    // Chuẩn hóa thông tin khóa học
    const khoaHocGlobal = {
      maKhoaHoc: infoKhoaHoc.MA_KHOA_HOC,
      tenKhoaHoc: infoKhoaHoc.TEN_KHOA_HOC,
      hangDaoTao: infoKhoaHoc.MA_HANG_DAO_TAO,
      ngayKhaiGiang: new Date(infoKhoaHoc.NGAY_KHAI_GIANG),
      ngayBeGiang: new Date(infoKhoaHoc.NGAY_BE_GIANG),
      tenCsdt: infoKhoaHoc.TEN_CSDT,
    };

    // Nếu chỉ có 1 học viên, xml2js để dạng object, cần ép về array
    const studentsArray = Array.isArray(danhSachHocVien)
      ? danhSachHocVien
      : [danhSachHocVien];

    return studentsArray.map((hv) => ({
      maDangKy: hv.MA_DK,
      anhChanDung: hv.HO_SO?.ANH_CHAN_DUNG || "",
      khoaHoc: khoaHocGlobal,
    }));
  }
}

module.exports = StudentXmlParser;
