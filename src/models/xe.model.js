const BaseModel = require("./base.model");

class Xe extends BaseModel {
    constructor(data = {}) {
        super();
        this.id = data.id || null;
        this.bien_so_xe = data.bien_so_xe || data.bien_so || '';
        this.bien_so = data.bien_so_xe || data.bien_so || '';

        this.nhan_hieu = data.nhan_hieu || data.ten_xe || '';
        this.ten_xe = data.nhan_hieu || data.ten_xe || '';

        this.so_dang_ky_xe = data.so_dang_ky_xe || '';
        this.mau_sac = data.mau_sac || '';
        this.so_gpxtl = data.so_gpxtl || '';
        this.nam_san_xuat = data.nam_san_xuat || null;
        this.ngay_cap_gpxtl = data.ngay_cap_gpxtl || null;
        this.ngay_het_han_gpxtl = data.ngay_het_han_gpxtl || null;
        this.ngay_cap_gcn_kiem_dinh = data.ngay_cap_gcn_kiem_dinh || null;
        this.ngay_het_han_gcn_kiem_dinh = data.ngay_het_han_gcn_kiem_dinh || null;
        this.co_quan_cap_gpxtl = data.co_quan_cap_gpxtl || '';
        this.so_huu = data.so_huu || '';
        this.hang_xe_tap_lai = data.hang_xe_tap_lai || '';
        this.so_khung = data.so_khung || '';
        this.so_may = data.so_may || '';
        this.loai_xe = data.loai_xe || '';
        this.anh_xe_tap_lai = data.anh_xe_tap_lai || '';
        this.ghi_chu = data.ghi_chu || '';
        this.created_at = data.created_at || null;
        this.updated_at = data.updated_at || null;
    }
}

module.exports = Xe;
