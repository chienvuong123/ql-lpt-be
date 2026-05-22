const BaseModel = require("./base.model");

class ListXeVaGiaoVien extends BaseModel {
    constructor(data = {}) {
        super();
        this.id = data.id || null;
        this.ma_dk = data.ma_dk || '';
        this.giao_vien = data.giao_vien || '';
        this.khoa = data.khoa || '';
        this.xeB1 = data.xe_b1 || '';
        this.xeB2 = data.xe_b2 || '';
        this.ho_ten = data.ho_ten || '';
        this.anh = data.anh || '';
        this.ngay_sinh = data.ngay_sinh || '';
        this.hang = data.hang || '';
        this.gioi_tinh = data.gioi_tinh || '';
        this.cccd = data.cccd || '';
    }
}

module.exports = ListXeVaGiaoVien;