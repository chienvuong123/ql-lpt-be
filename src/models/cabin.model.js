const repository = require("../repositories/cabin.repository");

// Legacy fallback: redirecting all model calls to repository layer
module.exports = repository;
