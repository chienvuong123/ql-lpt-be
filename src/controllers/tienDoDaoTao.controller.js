const service = require("../services/tienDoDaoTao.service");
const responseHelper = require("../helpers/response.helper");
const cronService = require("../services/cron.service");

const getTienDoDaoTao = async (req, res, next) => {
    const message = "Lấy danh sách tiến độ đào tạo thành công!";
    try {
        const { ma_khoa } = req.query;
        const data = await service.getTienDoDaoTao({ ma_khoa });
        return responseHelper.success(res, data, message);
    } catch (error) {
        next(error);
    }
};

const getChiTietDaoTao = async (req, res, next) => {
    const message = "Lấy chi tiết tiến độ đào tạo thành công!";
    try {
        const ma_khoa = req.query.ma_khoa || req.params.ma_khoa;
        const { page, limit, search, giao_vien, forceSync } = req.query;
        if (!ma_khoa) {
            return res.status(400).json({ success: false, message: "Thiếu tham số ma_khoa" });
        }
        
        // Default forceSync to true unless explicitly requested as false
        const parsedForceSync = forceSync === "false" ? false : true;

        const { data, pagination } = await service.getChiTietDaoTao(ma_khoa, { 
            page, 
            limit, 
            search, 
            giao_vien,
            forceSync: parsedForceSync 
        });
        return responseHelper.pagination(res, data, pagination, message);
    } catch (error) {
        next(error);
    }
};

const moveFailedTheoryToHocBu = async (req, res, next) => {
    const message = "Chạy kiểm tra lý thuyết trượt thành công!";
    try {
        const { ma_khoa } = req.body;
        if (!ma_khoa) {
            return res.status(400).json({ success: false, message: "Thiếu tham số ma_khoa" });
        }
        const result = await cronService.checkAndMoveTheory(ma_khoa);
        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

const moveFailedCabinToHocBu = async (req, res, next) => {
    const message = "Chạy kiểm tra cabin trượt thành công!";
    try {
        const { ma_khoa } = req.body;
        if (!ma_khoa) {
            return res.status(400).json({ success: false, message: "Thiếu tham số ma_khoa" });
        }
        const result = await cronService.checkAndMoveCabin(ma_khoa);
        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

const moveFailedDatToHocBu = async (req, res, next) => {
    const message = "Chạy kiểm tra DAT trượt thành công!";
    try {
        const { ma_khoa } = req.body;
        if (!ma_khoa) {
            return res.status(400).json({ success: false, message: "Thiếu tham số ma_khoa" });
        }
        const result = await cronService.checkAndMoveDat(ma_khoa);
        return responseHelper.success(res, result, message);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTienDoDaoTao,
    getChiTietDaoTao,
    moveFailedTheoryToHocBu,
    moveFailedCabinToHocBu,
    moveFailedDatToHocBu,
};
