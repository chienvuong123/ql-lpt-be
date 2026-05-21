class BaseModel {
    static formatList(recordset) {
        if (!Array.isArray(recordset)) return [];
        return recordset.map(row => new this(row));
    }

    static formatOne(row) {
        if (!row) return null;
        return new this(row);
    }

    toCleanObject() { // Bỏ các field null/undefined trước khi insert/update
        return Object.fromEntries(
            Object.entries(this).filter(([_, v]) => v !== null && v !== undefined && v !== '')
        );
    }

    toSqlParams() { // Tách field và value để dùng trong query
        const obj = this.toCleanObject();
        const fields = Object.keys(obj);
        const values = Object.values(obj);

        return { fields, values };
    }
}

module.exports = BaseModel;