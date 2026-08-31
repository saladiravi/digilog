const jwt = require("jsonwebtoken");
require("dotenv").config();

const jwt_secret = process.env.JWT_SECRET;

// 🔐 Verify JWT Token
exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      statusCode: 401,
      message: "Access denied. Unauthorized.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, jwt_secret);
    req.user = decoded; // Attach decoded user to request
    next();
  } catch (error) {
    return res.status(401).json({
      statusCode: 401,
      message: "Invalid or expired token",
    });
  }
};
