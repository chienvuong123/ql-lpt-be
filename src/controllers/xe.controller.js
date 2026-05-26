const fs = require("fs");
const path = require("path");
const xeService = require("../services/xe.service");
const responseHelper = require("../helpers/response.helper");
const { uploadToCloudinary } = require("../helpers/cloudinary.helper");

const saveVehicleImage = async (file) => {
    if (!file) return null;
    
    // Upload buffer directly to Cloudinary and get secure URL
    const result = await uploadToCloudinary(file.buffer, "quan_ly_be/xe");
    return result.secure_url;
}

const getListXe = async (req, res, next) => {
    const messageSuccess = "Lấy danh sách xe thành công!";
    try {
        const { search, ten_xe, nam_san_xuat, page, limit } = req.query;
        
        // Merge frontend search filters (ten_xe, nam_san_xuat) into backend search parameter
        let effectiveSearch = search;
        if (!effectiveSearch) {
            if (ten_xe) {
                effectiveSearch = ten_xe;
            } else if (nam_san_xuat) {
                effectiveSearch = nam_san_xuat;
            }
        }

        const { data, pagination } = await xeService.getListXe(effectiveSearch, page, limit);

        return responseHelper.pagination(res, data, pagination, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const createXe = async (req, res, next) => {
    const messageSuccess = "Thêm mới xe thành công!";
    try {
        if (req.files && req.files.length > 0) {
            const imageFile = req.files.find(f => f.fieldname === "file" || f.fieldname === "anh" || f.fieldname === "anh_xe_tap_lai") || req.files[0];
            if (imageFile) {
                req.body.anh_xe_tap_lai = await saveVehicleImage(imageFile);
            }
        }
        const resultId = await xeService.createXe(req.body);
        return responseHelper.success(res, { id: resultId }, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const editXe = async (req, res, next) => {
    const messageSuccess = "Cập nhật thông tin xe thành công!";
    try {
        const { id } = req.params;
        if (req.files && req.files.length > 0) {
            const imageFile = req.files.find(f => f.fieldname === "file" || f.fieldname === "anh" || f.fieldname === "anh_xe_tap_lai") || req.files[0];
            if (imageFile) {
                req.body.anh_xe_tap_lai = await saveVehicleImage(imageFile);
            }
        }
        await xeService.editXe(id, req.body);
        return responseHelper.success(res, null, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const importExcel = async (req, res, next) => {
    const messageSuccess = "Import dữ liệu xe thành công!";
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn tệp Excel để nhập!"
            });
        }
        
        const result = await xeService.importFromExcel(req.file.buffer);
        return responseHelper.success(res, result, messageSuccess);
    } catch (error) {
        next(error);
    }
}

const deleteXe = async (req, res, next) => {
    const messageSuccess = "Xóa xe thành công!";
    try {
        const { id } = req.params;
        await xeService.deleteXe(id);
        return responseHelper.success(res, null, messageSuccess);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getListXe,
    createXe,
    editXe,
    importExcel,
    deleteXe
};
