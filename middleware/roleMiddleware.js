exports.allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        statusCode: 403,
        message: "Forbidden: You do not have permission",
      });
    }
    next();
  };
};
