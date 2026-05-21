
const responseHelper = {
    success: (res, data, message = "Success", statusCode = 200) => {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
        });
    },
    error: (res, error, message = "Error", statusCode = 500) => {
        return res.status(statusCode).json({
            success: false,
            message,
            error: error.message,
        });
    },
    pagination: (res, data, pagination, message = "Success", statusCode = 200) => {
        return res.status(statusCode).json({
            success: true,
            message,
            data: data,
            pagination,
        });
    },
};

module.exports = responseHelper;