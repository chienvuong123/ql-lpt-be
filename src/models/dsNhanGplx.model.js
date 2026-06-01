const BaseModel = require("./base.model");

class DsNhanGplx extends BaseModel {
    constructor(data) {
        super();
        this.id = data.id;
        this.ho_ten = data.ho_ten;
        this.ngay_sinh = data.ngay_sinh;
        this.so_gplx = data.so_gplx;
        this.dia_chi = data.dia_chi;
        this.da_nhan = data.da_nhan !== undefined && data.da_nhan !== null ? (data.da_nhan === true || data.da_nhan === 1 || data.da_nhan === '1') : false;
        this.ngay_nhan = data.ngay_nhan || null;
        this.nguoi_nhan = data.nguoi_nhan || null;
        this.ky_nhan = data.ky_nhan || null;
        this.ghi_chu = data.ghi_chu || null;
        this.dau_moi = data.dau_moi || null;
        this.ngay_thi = data.ngay_thi || null;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }
}

module.exports = DsNhanGplx;
