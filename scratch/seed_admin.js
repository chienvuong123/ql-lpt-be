const User = require("../src/models/user.model");
const bcrypt = require("bcryptjs");

async function seedAdmin() {
  try {
    const username = "admin";
    const existing = await User.findByUsername(username);
    if (!existing) {
      console.log("Creating default admin user...");
      await User.create({
        username: "admin",
        password: "admin_password", // User should change this
        ho_ten: "Administrator",
        role_id: 1, // 'admin' role
      });
      console.log("Admin user created: admin / admin_password");
    } else {
      console.log("Admin user already exists.");
    }
    process.exit(0);
  } catch (err) {
    console.error("Error seeding admin:", err);
    process.exit(1);
  }
}

seedAdmin();
