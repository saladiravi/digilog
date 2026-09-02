const pool = require("../config/db");
const deviceService = require("../services/deviceService");


exports.enrollFingerprintRaw = async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ statusCode: 400, message: "user_id is required" });
  }

  try {
    const employeeResult = await pool.query(
      `SELECT employee_id, employee_name, device_user_id, enrolled FROM tbl_employee WHERE employee_id = $1`,
      [user_id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ statusCode: 404, message: "Employee not found" });
    }

    const employee = employeeResult.rows[0];

    if (employee.enrolled === true) {
      return res.status(409).json({ statusCode: 409, message: "Finger already scanned / employee already enrolled" });
    }

    if (!employee.device_user_id) {
      return res.status(400).json({
        statusCode: 400,
        message: "Employee hasn't synced to the device yet — wait for device_user_id to populate before enrolling a fingerprint",
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: `This device's firmware doesn't support remote-triggered enrollment. On the MB160 itself: Menu → User Mgmt → find PIN ${employee.device_user_id} (${employee.employee_name}) → Enroll Fingerprint. Once done, call /device/confirm-enrollment to check if the sync landed.`,
      data: { employee_id: employee.employee_id, device_user_id: employee.device_user_id },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: "Internal Server Error", error: error.message });
  }
};

// confirmEnrollment — ADMS version
// No device call — polls the DATABASE's enrolled flag, which routes/adms.js
// sets either from the device's ENROLL_BIO success report or its FINGERTMP push.
exports.confirmEnrollment = async (req, res) => {
  const { employee_id } = req.body;
  const maxAttempts = 6;
  const delayMs = 3000;

  try {
    const empResult = await pool.query("SELECT * FROM tbl_employee WHERE employee_id = $1", [employee_id]);
    if (!empResult.rows.length) {
      return res.status(404).json({ statusCode: 404, message: "Employee not found" });
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const check = await pool.query("SELECT enrolled FROM tbl_employee WHERE employee_id = $1", [employee_id]);

      if (check.rows[0].enrolled === true) {
        return res.status(200).json({ statusCode: 200, message: "Enrollment confirmed", data: check.rows[0] });
      }
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
    }

    return res.status(400).json({
      statusCode: 400,
      message: "No fingerprint confirmation yet — ask the employee to scan again, or check the device screen for errors",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: "Internal Server Error", error: error.message });
  }
};