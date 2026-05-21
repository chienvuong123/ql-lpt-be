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

module.exports = { parsePagination, formatPagination, toLikeParam };