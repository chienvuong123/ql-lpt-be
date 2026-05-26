const BaseModel = require("./base.model");

class UyQuyen extends BaseModel {
    constructor(data = {}) {
        super();
        this.id = data.id || null;
        this.bien_so_xe = data.bien_so_xe || data.bien_kiem_soat || '';
        this.nguoi_ky_hd = data.nguoi_ky_hd || '';
        this.scccd_hd = data.scccd_hd || '';
        this.ngay_cap_cc_hd = data.ngay_cap_cc_hd || null;
        this.noi_cap_hd = data.noi_cap_hd || '';
        this.dia_chi_nguoi_ky = data.dia_chi_nguoi_ky || '';
        this.chu_xe = data.chu_xe || '';
        this.dia_chi_chu_xe = data.dia_chi_chu_xe || '';
        this.thoi_han_uy_quyen = data.thoi_han_uy_quyen || '';
        this.created_at = data.created_at || null;
        this.updated_at = data.updated_at || null;
    }
}

module.exports = UyQuyen;
