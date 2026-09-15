const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const authmiddleware = require("../middleware/authMiddleware");
const jwt = require("jsonwebtoken");

require("dotenv").config();

exports.registerAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        statusCode: 400,
        message: "Email and password are required",
      });
    }

    // Check existing admin
    const existingAdmin = await pool.query(
      `SELECT admin_id
             FROM tbl_admin
             WHERE email = $1`,
      [email],
    );

    if (existingAdmin.rows.length > 0) {
      return res.status(409).json({
        statusCode: 409,
        message: "Admin already exists with this email",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert admin
    const result = await pool.query(
      `INSERT INTO tbl_admin (email, password)
             VALUES ($1, $2)
             RETURNING admin_id, email`,
      [email, hashedPassword],
    );

    return res.status(201).json({
      statusCode: 201,
      message: "Admin registered successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Admin Register Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
  }
};

exports.loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        statusCode: 400,
        message: "Email and password are required",
      });
    }

    // Find admin
    const result = await pool.query(
      `SELECT admin_id, email, password,role
             FROM tbl_admin
             WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: "Admin not found",
      });
    }

    const admin = result.rows[0];

    // Compare password
    const isPasswordMatch = await bcrypt.compare(password, admin.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid email or password",
      });
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        admin_id: admin.admin_id,
        email: admin.email,
      },
      process.env.JWT_SECRET, // ✅ reads from .env
      {
        expiresIn: "1d",
      },
    );

    // Login response
    return res.status(200).json({
      statusCode: 200,
      message: "Login successful",
      data: {
        admin_id: admin.admin_id,
        email: admin.email,
        role:admin.role,
        token: token,
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
  }
};


exports.employeeLogin = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({
        statusCode: 400,
        message: "Email is required"
      });
    }

    const result = await pool.query(
      `SELECT 
        employee_id,
        employee_name,
        enrolled,
        role,
        email,
        status
       FROM tbl_employee
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: "Employee not found"
      });
    }

    const employee = result.rows[0];

    // Check employee status
    if (employee.status.toLowerCase() !== "active") {
      return res.status(403).json({
        statusCode: 403,
        message: "Employee account is inactive"
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        employee_id: employee.employee_id,
        email: employee.email,
        role: employee.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d"
      }
    );

    return res.status(200).json({
      statusCode: 200,
      message: "Login successfully",
      token,
      employee
    });

  } catch (error) {
    console.error("Employee Login Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error"
    });
  }
};