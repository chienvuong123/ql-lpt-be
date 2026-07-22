const BaseModel = require("./base.model");

class GoogleSheetA1 extends BaseModel {
    constructor(data) {
        super();
        this.id = data.id;
        this.ma_phieu = data.ma_phieu;
        this.ho_ten = data.ho_ten;
        this.ngay_sinh = data.ngay_sinh;
        this.cccd = data.cccd;
        this.dien_thoai = data.dien_thoai;
        this.dia_chi = data.dia_chi;
        this.dau_moi = data.dau_moi;
        this.hang = data.hang;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }
}

module.exports = GoogleSheetA1;
