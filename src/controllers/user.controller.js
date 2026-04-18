const User = require("../models/user.model");

async function getAllUsers(req, res) {
  try {
    const users = await User.getAll();
    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

async function getUserById(req, res) {
  try {
    const user = await User.getById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

async function createUser(req, res) {
  try {
    const { username, email, password, ho_ten, role_id } = req.body;
    if (!username || !password || !ho_ten || !role_id) {
      return res.status(400).json({
        success: false,
        message: "All fields except email are required",
      });
    }

    // Validation email
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Email không đúng định dạng",
        });
      }
    }

    // Validation password
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }
    const specialCharRegex = /[\W_]/;
    if (!specialCharRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu phải chứa ít nhất một ký tự đặc biệt",
      });
    }

    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    const id = await User.create({ username, email, password, ho_ten, role_id });
    const newUser = await User.getById(id);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: newUser,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

async function updateUser(req, res) {
  try {
    const { email, password } = req.body;

    // Validation email nếu có thay đổi
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Email không đúng định dạng",
        });
      }
    }

    // Validation password nếu có thay đổi
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu phải có ít nhất 6 ký tự",
        });
      }
      const specialCharRegex = /[\W_]/;
      if (!specialCharRegex.test(password)) {
        return res.status(400).json({
          success: false,
          message: "Mật khẩu phải chứa ít nhất một ký tự đặc biệt",
        });
      }
    }

    await User.update(req.params.id, req.body);
    const updatedUser = await User.getById(req.params.id);
    res.json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

async function deleteUser(req, res) {
  try {
    await User.remove(req.params.id);
    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
