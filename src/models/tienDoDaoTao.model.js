const BaseModel = require("./base.model");

class TienDoDaoTao extends BaseModel {
    constructor(data = {}) {
        super();
        this.id = data.id || null;
        this.ma_khoa = data.ma_khoa || '';
        this.ten_khoa = data.ten_khoa || '';
        this.loai = data.loai || 0;
        this.bat_dau_ly_thuyet = data.bat_dau_ly_thuyet || null;
        this.ket_thuc_ly_thuyet = data.ket_thuc_ly_thuyet || null;
        this.bat_dau_cabin = data.bat_dau_cabin || null;
        this.ket_thuc_cabin = data.ket_thuc_cabin || null;
        this.bat_dau_dat = data.bat_dau_dat || null;
        this.ket_thuc_dat = data.ket_thuc_dat || null;
        this.status = data.status || 0;
        this.updated_at = data.updated_at || null;
        this.created_at = data.created_at || null;
    }
}

module.exports = TienDoDaoTao;
