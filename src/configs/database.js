const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
  } catch (error) {
    process.exit(1);
  }
};

// Đóng kết nối khi tắt app
process.on("SIGINT", () => mongoose.connection.close(() => process.exit(0)));

module.exports = connectDB;
