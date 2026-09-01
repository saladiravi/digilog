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

// Resolve device details
const resolveDevice = (body) => ({
  device_ip: body.device_ip || process.env.DEVICE_IP,
  device_port: body.device_port || process.env.DEVICE_PORT || 4370,
  device_id: body.device_id || process.env.DEVICE_ID,
});

// ======================================================
// START FINGERPRINT ENROLLMENT
// POST /api/employee/enroll-fingerprint
// ======================================================
exports.enrollFingerprintRaw = async (req, res) => {
  const { user_id, finger_index = 0 } = req.body;

  const {
    device_ip,
    device_port,
    device_id,
  } = resolveDevice(req.body);

  if (!user_id) {
    return res.status(400).json({
      statusCode: 400,
      message: "user_id is required",
    });
  }

  if (!device_id) {
    return res.status(400).json({
      statusCode: 400,
      message: "device_id is required",
    });
  }

  try {
    // --------------------------------------------------
    // 1. Check employee
    // --------------------------------------------------
    const employeeResult = await pool.query(
      `
      SELECT 
        employee_id,
        employee_name,
        device_user_id,
        enrolled
      FROM tbl_employee
      WHERE employee_id = $1
      `,
      [user_id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: "Employee not found",
      });
    }

    const employee = employeeResult.rows[0];

    // --------------------------------------------------
    // 2. Already enrolled?
    // --------------------------------------------------
    if (employee.enrolled === true) {
      return res.status(409).json({
        statusCode: 409,
        message: "Fingerprint already enrolled for this employee",
        data: employee,
      });
    }

    // --------------------------------------------------
    // 3. Device PIN
    //
    // If device_user_id exists, use it.
    // Otherwise use employee_id.
    // --------------------------------------------------
    const deviceUserId = employee.device_user_id || employee.employee_id;

    // --------------------------------------------------
    // 4. Check if another enrollment command is pending
    // --------------------------------------------------
    const pendingCommand = await pool.query(
      `
      SELECT id, command, status
      FROM tbl_device_commands
      WHERE device_sn = $1
        AND status IN ('pending', 'sent')
        AND command LIKE $2
      ORDER BY id DESC
      LIMIT 1
      `,
      [
        device_id,
        `%PIN=${deviceUserId}%`,
      ]
    );

    if (pendingCommand.rows.length > 0) {
      return res.status(409).json({
        statusCode: 409,
        message: "Fingerprint enrollment is already in progress",
        command_id: pendingCommand.rows[0].id,
      });
    }

    // --------------------------------------------------
    // 5. Create ADMS enrollment command
    // --------------------------------------------------
    //
    // ZKTeco ADMS command:
    //
    // C:ID:ENROLL_FP PIN=123	FID=0
    //
    // Depending on your firmware, the exact command
    // format may need to be adjusted.
    //
    const command = `C:${deviceUserId}:ENROLL_FP PIN=${deviceUserId}\tFID=${Number(
      finger_index
    )}`;

    const commandResult = await pool.query(
      `
      INSERT INTO tbl_device_commands
      (
        device_sn,
        command,
        status
      )
      VALUES
      (
        $1,
        $2,
        'pending'
      )
      RETURNING *
      `,
      [device_id, command]
    );

    const savedCommand = commandResult.rows[0];

    // --------------------------------------------------
    // 6. Return immediately
    // --------------------------------------------------
    return res.status(200).json({
      statusCode: 200,
      message: "Fingerprint enrollment command created",
      data: {
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        device_user_id: deviceUserId,
        finger_index: Number(finger_index),
        command_id: savedCommand.id,
        status: "pending",
        instruction: "Ask employee to place the same finger 3 times on the device",
      },
    });
  } catch (error) {
    console.error("[ENROLL FINGERPRINT ERROR]", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


// ======================================================
// CONFIRM FINGERPRINT ENROLLMENT
// POST /api/employee/confirm-enrollment
// ======================================================
exports.confirmEnrollment = async (req, res) => {
  const {
    employee_id,
    finger_index = 0,
    command_id,
  } = req.body;

  const {
    device_id,
  } = resolveDevice(req.body);

  if (!employee_id) {
    return res.status(400).json({
      statusCode: 400,
      message: "employee_id is required",
    });
  }

  if (!device_id) {
    return res.status(400).json({
      statusCode: 400,
      message: "device_id is required",
    });
  }

  try {
    // --------------------------------------------------
    // 1. Get employee
    // --------------------------------------------------
    const empResult = await pool.query(
      `
      SELECT *
      FROM tbl_employee
      WHERE employee_id = $1
      `,
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: "Employee not found",
      });
    }

    const employee = empResult.rows[0];

    // --------------------------------------------------
    // 2. Already enrolled
    // --------------------------------------------------
    if (employee.enrolled === true) {
      return res.status(200).json({
        statusCode: 200,
        message: "Fingerprint already enrolled",
        data: employee,
      });
    }

    // --------------------------------------------------
    // 3. Find enrollment command
    // --------------------------------------------------
    let commandResult;

    if (command_id) {
      commandResult = await pool.query(
        `
        SELECT *
        FROM tbl_device_commands
        WHERE id = $1
          AND device_sn = $2
        `,
        [command_id, device_id]
      );
    } else {
      const deviceUserId =
        employee.device_user_id || employee.employee_id;

      commandResult = await pool.query(
        `
        SELECT *
        FROM tbl_device_commands
        WHERE device_sn = $1
          AND command LIKE $2
        ORDER BY id DESC
        LIMIT 1
        `,
        [
          device_id,
          `%PIN=${deviceUserId}%`,
        ]
      );
    }

    if (commandResult.rows.length === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: "Enrollment command not found",
      });
    }

    const command = commandResult.rows[0];

    // --------------------------------------------------
    // 4. Check command status
    // --------------------------------------------------

    if (command.status === "pending") {
      return res.status(202).json({
        statusCode: 202,
        message: "Enrollment command is waiting for the device",
        data: {
          command_id: command.id,
          status: "pending",
        },
      });
    }

    if (command.status === "sent") {
      return res.status(202).json({
        statusCode: 202,
        message: "Enrollment command sent to device. Waiting for fingerprint enrollment",
        data: {
          command_id: command.id,
          status: "sent",
        },
      });
    }

    // --------------------------------------------------
    // 5. Device successfully executed command
    // --------------------------------------------------

    if (command.status === "success") {
      const updated = await pool.query(
        `
        UPDATE tbl_employee
        SET enrolled = true
        WHERE employee_id = $1
        RETURNING *
        `,
        [employee_id]
      );

      return res.status(200).json({
        statusCode: 200,
        message: "Fingerprint enrollment confirmed successfully",
        data: {
          employee: updated.rows[0],
          command_id: command.id,
          finger_index: Number(finger_index),
          status: "success",
        },
      });
    }

    // --------------------------------------------------
    // 6. Device reported failure
    // --------------------------------------------------

    if (command.status === "failed") {
      return res.status(400).json({
        statusCode: 400,
        message: "Fingerprint enrollment failed on device",
        data: {
          command_id: command.id,
          status: "failed",
        },
      });
    }

    return res.status(400).json({
      statusCode: 400,
      message: "Unknown enrollment status",
      data: {
        command_id: command.id,
        status: command.status,
      },
    });

  } catch (error) {
    console.error("[CONFIRM ENROLLMENT ERROR]", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};