const BaseModel = require("./base.model");

class ListXeVaGiaoVien extends BaseModel {
    constructor(data = {}) {
        super();
        this.id = data.id || null;
        this.maDk = data.ma_dk || '';
        this.giaoVien = data.giao_vien || '';
        this.khoa = data.khoa || '';
        this.xeB1 = data.xe_b1 || '';
        this.xeB2 = data.xe_b2 || '';
    }
}

module.exports = ListXeVaGiaoVien;