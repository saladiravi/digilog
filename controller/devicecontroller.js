// const pool = require("../config/db");
// const deviceService = require("../services/deviceService");

 
// const resolveDevice = (body) => ({
//   device_ip: body.device_ip || process.env.DEVICE_IP,
//   device_port: body.device_port || process.env.DEVICE_PORT || 4370,
//   device_id: body.device_id || process.env.DEVICE_ID,
// });

// exports.enrollFingerprintRaw = async (req, res) => {
//   const { user_id, finger_index } = req.body;
//   const { device_ip, device_port } = resolveDevice(req.body);
 

//   if (!device_ip || !user_id) {
//     return res.status(400).json({ statusCode: 400, message: "device_ip and user_id are required" });
//   }
//   try {

//        const employeeResult = await pool.query(
//       `SELECT employee_id, enrolled FROM tbl_employee WHERE employee_id = $1`,
//       [user_id]
//     );

//     if (employeeResult.rows.length === 0) {
//       return res.status(404).json({ statusCode: 404, message: "Employee not found" });
//     }

//     if (employeeResult.rows[0].enrolled === true) {
//       return res.status(409).json({ statusCode: 409, message: "Finger already scanned / employee already enrolled" });
//     }
//     await deviceService.startRemoteEnroll(device_ip, device_port, user_id, finger_index || 0);
//     return res.status(200).json({ statusCode: 200, message: "Device in enroll mode — ask employee to place finger 3x" });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ statusCode: 500, message: "Internal Server Error", error: error.message });
//   }
// };

// exports.confirmEnrollment = async (req, res) => {
//   const { employee_id, finger_index } = req.body;
//   const { device_ip, device_port } = resolveDevice(req.body);
//   const maxAttempts = 6;
//   const delayMs = 3000;

//   try {
//     const empResult = await pool.query("SELECT * FROM tbl_employee WHERE employee_id = $1", [employee_id]);
//     if (!empResult.rows.length) return res.status(404).json({ statusCode: 404, message: "Employee not found" });

//     for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//       const check = await deviceService.checkFingerprintExists(
//         device_ip, device_port, Number(employee_id), Number(finger_index) || 0
//       );

//       if (check.exists) {
//         const updated = await pool.query(
//           "UPDATE tbl_employee SET enrolled = true WHERE employee_id = $1 RETURNING *",
//           [employee_id]
//         );
//         return res.status(200).json({ statusCode: 200, message: "Enrollment confirmed", data: updated.rows[0] });
//       }
//       if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
//     }

//     return res.status(400).json({ statusCode: 400, message: "No fingerprint detected yet — ask employee to scan again" });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ statusCode: 500, message: "Internal Server Error", error: error.message });
//   }
// };


const pool = require("../config/db");
const deviceService = require("../services/deviceService");

// enrollFingerprintRaw — ADMS version
// Queues an ENROLL_BIO command. The device picks it up on its next poll,
// puts itself into fingerprint-scan mode for this PIN, and reports back
// automatically once the person scans (or times out after RETRY attempts).
exports.enrollFingerprintRaw = async (req, res) => {
  const { user_id, finger_index } = req.body;

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

    await pool.query(
      `INSERT INTO tbl_device_commands (device_sn, command, status) VALUES ($1, $2, 'pending')`,
      [
        process.env.DEVICE_SERIAL,
        `ENROLL_BIO TYPE=1 NO=${finger_index || 0} PIN=${employee.device_user_id} RETRY=3 OVERWRITE=1`,
      ]
    );

    return res.status(200).json({
      statusCode: 200,
      message: "Enroll command queued — device will enter fingerprint scan mode within its next check-in (~15-30s). Ask the employee to place their finger 3x when it does.",
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