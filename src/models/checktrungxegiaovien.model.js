
class CheckTrungXeGvModel {
    constructor(data = {}) {
        this.id = data.id || null;
        this.maDk = data.ma_dk || '';
        this.giaoVien = data.giao_vien || '';
        this.khoa = data.khoa || '';
        this.ngayDangKy = data.ngay_dang_ky || null;
    }

    // Định nghĩa tĩnh để format mảng dữ liệu từ SQL trả về
    static formatList(recordset) {
        if (!Array.isArray(recordset)) return [];
        return recordset.map(row => new CheckTrungXeGvModel(row));
    }
}

module.exports = CheckTrungXeGvModel;