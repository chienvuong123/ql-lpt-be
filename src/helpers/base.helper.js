buildSetClause = (req, data) => {
    const setParts = [];
    for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
            req.input(key, value);
            setParts.push(`${key} = @${key}`);
        }
    }
    return setParts.join(', ');
}

module.exports = {
    buildSetClause
};