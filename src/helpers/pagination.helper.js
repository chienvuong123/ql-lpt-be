const parsePagination = (page, limit) => {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

const formatPagination = (total, page, limit) => {
    return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

const toLikeParam = (value) => `%${value || ''}%`;
// Bỏ toLikeParam cũ, dùng helper mới
const toStartsWithParam = (value) => value ? `${value}%` : '%';
const toExactParam = (value) => value || null;

module.exports = { parsePagination, formatPagination, toLikeParam, toStartsWithParam, toExactParam };