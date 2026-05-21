const BaseModel = require("./base.model");

class HocVien extends BaseModel {
    constructor(data) {
        super();
        this.ho_ten = data.ho_ten;
        this.ma_dk = data.ma_dk;
        this.cccd = data.cccd;
        this.ma_khoa = data.ma_khoa;
        this.anh = data.anh;
        this.hang = data.hang;
        this.gioi_tinh = data.gioi_tinh;
        this.ngay_sinh = data.ngay_sinh;
    }
}

module.exports = HocVien;