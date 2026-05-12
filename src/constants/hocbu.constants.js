const LOAI_MAP = {
    "1": "ly_thuyet", "ly_thuyet": "ly_thuyet", "ly-thuyet": "ly_thuyet",
    "2": "cabin", "cabin": "cabin",
    "3": "dat", "dat": "dat",
};

const TRANG_THAI_GROUPS = {
    CHO_DUYET_LT: [1, 2],
    CHO_DUYET_TH: [4, 5],
    CHO_DUYET_ALL: [1, 2, 4, 5],
    DANG_HOC_BU: [3, 6],
};

const STATE_TRANSITIONS = {
    duyet: {
        1: (actor) => ({ trang_thai: 2, trang_thai_ly_thuyet: 2, nguoi_duyet_ly_thuyet: actor, thoi_gian_duyet_ly_thuyet: new Date() }),
        4: (actor, extra) => ({ trang_thai: 5, trang_thai_thuc_hanh: 2, loai_thuc_hanh: extra.loai_thuc_hanh || "cabin", nguoi_duyet_thuc_hanh: actor, thoi_gian_duyet_thuc_hanh: new Date() }),
    },
    xep_lop: {
        2: (_, extra) => ({ trang_thai: 3, trang_thai_ly_thuyet: 3, khoa_bu_ly_thuyet: extra.khoa_bu, thoi_gian_xep_ly_thuyet: extra.thoi_gian_xep ? new Date(extra.thoi_gian_xep) : new Date() }),
        5: (_, extra) => ({ trang_thai: 6, trang_thai_thuc_hanh: 3, khoa_bu_thuc_hanh: extra.khoa_bu, thoi_gian_xep_thuc_hanh: extra.thoi_gian_xep ? new Date(extra.thoi_gian_xep) : new Date() }),
    },
    hoan_thanh: {
        3: (_, { loai }) => loai === "ly_thuyet" ? { trang_thai: 4, trang_thai_ly_thuyet: 4 } : null,
        6: () => ({ trang_thai: 7, trang_thai_thuc_hanh: 4 }),
    },
};

const DIRECT_UPDATE_FIELDS = [
    "trang_thai", "trang_thai_ly_thuyet", "trang_thai_thuc_hanh", "loai_thuc_hanh",
    "khoa_bu_ly_thuyet", "khoa_bu_thuc_hanh", "thoi_gian_xep_ly_thuyet", "thoi_gian_xep_thuc_hanh", "ghi_chu",
];

module.exports = { LOAI_MAP, TRANG_THAI_GROUPS, STATE_TRANSITIONS, DIRECT_UPDATE_FIELDS };