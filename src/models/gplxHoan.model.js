const BaseModel = require("./base.model");

class GplxHoan extends BaseModel {
    constructor(data) {
        super();
        this.id = data.id;
        this.so_gplx = data.so_gplx;
        this.ho_ten = data.ho_ten;
        this.ngay_sinh = data.ngay_sinh;
        this.hang = data.hang;
        this.ngay_cap = data.ngay_cap;
        this.thoi_han = data.thoi_han;
        this.dia_chi = data.dia_chi;
        this.ngay_nhan_buu_dien = data.ngay_nhan_buu_dien;
        this.trang_thai = data.trang_thai;
        this.ngay_nhap_kho = data.ngay_nhap_kho;
        this.ngay_xuat_kho = data.ngay_xuat_kho;
        this.dau_moi = data.dau_moi;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }
}

module.exports = GplxHoan;
