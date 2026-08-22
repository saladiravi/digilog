// controller/devicecontroller.js
const pool = require('../config/db');
const deviceService = require('../services/deviceService');
 

exports.getRawAttendance = async (req, res) => {
  const { device_ip, device_port } = req.body;
  try {
    const logs = await deviceService.getDeviceAttendance(device_ip, device_port || 4370);
    return res.status(200).json({
      statusCode: 200,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};
// Step 1: create a user slot on the device (employee then scans finger physically on MB160)
exports.enrollEmployee = async (req, res) => {
  const { employee_id, device_ip, device_port } = req.body;

  try {
    const empResult = await pool.query(
      'SELECT * FROM tbl_employees WHERE employee_id = $1',
      [employee_id]
    );
    if (empResult.rows.length === 0) {
      return res.status(404).json({ statusCode: 404, message: 'Employee not found' });
    }
    const employee = empResult.rows[0];
    const uid = employee_id; // use employee_id as the device uid, keep it simple

    await deviceService.createDeviceUser(
      device_ip, device_port || 4370, uid, String(employee_id), employee.employee_name
    );

    await pool.query(
      'UPDATE tbl_employees SET device_user_id = $1 WHERE employee_id = $2',
      [String(uid), employee_id]
    );

    return res.status(200).json({
      statusCode: 200,
      message: 'User created on device. Ask employee to scan finger on the MB160 now.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error' });
  }
};

// Step 2: after they've scanned finger at the device, mark as enrolled
exports.confirmEnrollment = async (req, res) => {
  const { employee_id, device_ip, device_port } = req.body;
  try {
    const users = await deviceService.getDeviceUsers(device_ip, device_port || 4370);
    const found = users.find(u => u.userId === String(employee_id));

    if (!found) {
      return res.status(404).json({ statusCode: 404, message: 'User not found on device yet' });
    }

    await pool.query(
      'UPDATE tbl_employees SET enrolled = true WHERE employee_id = $1',
      [employee_id]
    );

    return res.status(200).json({ statusCode: 200, message: 'Enrollment confirmed', data: found });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error' });
  }
};

// Step 3: pull attendance logs from device and store in DB
exports.syncAttendance = async (req, res) => {
  const { device_id, device_ip, device_port } = req.body;
  try {
    const logs = await deviceService.getDeviceAttendance(device_ip, device_port || 4370);

    let inserted = 0;
    for (const log of logs) {
      const empResult = await pool.query(
        'SELECT employee_id FROM tbl_employees WHERE device_user_id = $1',
        [String(log.userId)]
      );
      const employeeId = empResult.rows[0]?.employee_id || null;

      const result = await pool.query(
        `INSERT INTO tbl_attendance_log (employee_id, device_user_id, device_id, punch_time, verify_mode)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_user_id, punch_time, device_id) DO NOTHING
         RETURNING *`,
        [employeeId, String(log.userId), device_id, log.timestamp, log.verifyMode || null]
      );
      if (result.rows.length) inserted++;
    }

    return res.status(200).json({
      statusCode: 200,
      message: 'Attendance synced',
      totalPulled: logs.length,
      newRecords: inserted,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error' });
  }
};

// Get attendance logs from your DB (for frontend later / Postman test now)
exports.getAttendanceLogs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.log_id, e.employee_name, a.punch_time, a.verify_mode
       FROM tbl_attendance_log a
       LEFT JOIN tbl_employees e ON a.employee_id = e.employee_id
       ORDER BY a.punch_time DESC
       LIMIT 100`
    );
    return res.status(200).json({ statusCode: 200, data: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error' });
  }
};


 
// Add user directly on device, no DB involved
exports.addDeviceUserRaw = async (req, res) => {
  const { device_ip, device_port, user_sn, user_id, name, password } = req.body;

  if (!device_ip || !user_sn || !user_id || !name) {
    return res.status(400).json({
      statusCode: 400,
      message: 'device_ip, user_sn, user_id, and name are required',
    });
  }

  try {
    await deviceService.createDeviceUser(
      device_ip,
      device_port || 4370,
      user_sn,
      user_id,
      name,
      password || ''
    );

    return res.status(200).json({
      statusCode: 200,
      message: 'User created directly on device',
      data: { user_sn, user_id, name },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

 

// Get raw user list from device (to verify add-user worked)
exports.getRawUsers = async (req, res) => {
  const { device_ip, device_port } = req.body;
  try {
    const zk = await deviceService.connectDevice(device_ip, device_port || 4370);
    const users = await zk.getUsers();
    await zk.disconnect();
    return res.status(200).json({ statusCode: 200, count: users.data.length, data: users.data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};


exports.enrollFingerprintRaw = async (req, res) => {
  const { device_ip, device_port, user_id, finger_index } = req.body;

  if (!device_ip || !user_id) {
    return res.status(400).json({
      statusCode: 400,
      message: 'device_ip and user_id are required',
    });
  }

  try {
    await deviceService.startRemoteEnroll(
      device_ip,
      device_port || 4370,
      user_id,
      finger_index || 0
    );

    return res.status(200).json({
      statusCode: 200,
      message: 'Device is now in enroll mode — ask employee to place finger 3x on the MB160.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};



exports.checkFingerprintRaw = async (req, res) => {
  const { device_ip, device_port, user_sn, finger_index } = req.body;
  try {
    const result = await deviceService.checkFingerprintExists(device_ip, device_port || 4370, user_sn, finger_index || 0);
    return res.status(200).json({ statusCode: 200, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};


 
exports.addEmployeeWithDevice = async (req, res) => {
  const {
    employee_name,
    department_id,
    designation,
    mobile_number,
    status,
    device_ip,
    device_port,
  } = req.body;

  if (!employee_name || !device_ip) {
    return res.status(400).json({
      statusCode: 400,
      message: 'employee_name and device_ip are required',
    });
  }

  let insertedEmployee = null;

  try {
    // Step 1: insert full employee record
    const empResult = await pool.query(
      `INSERT INTO tbl_employee
        (employee_name, department_id, designation, mobile_number, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [employee_name, department_id, designation, mobile_number, status || 'active']
    );
    insertedEmployee = empResult.rows[0];
    const employeeId = insertedEmployee.employee_id;

    // Step 2: create matching user on the device
    await deviceService.createDeviceUser(
      device_ip,
      device_port || 4370,
      employeeId,
      String(employeeId),
      employee_name
    );

    // Step 3: link device_user_id back on the employee row
    const updateResult = await pool.query(
      `UPDATE tbl_employee
       SET device_user_id = $1
       WHERE employee_id = $2
       RETURNING *`,
      [String(employeeId), employeeId]
    );

    return res.status(201).json({
      statusCode: 201,
      message: 'Employee added to DB and created on device',
      data: updateResult.rows[0],
    });

  } catch (error) {
    console.error(error);
    if (insertedEmployee) {
      await pool.query('DELETE FROM tbl_employee WHERE employee_id = $1', [insertedEmployee.employee_id])
        .catch(err => console.error('Rollback failed:', err));
    }
    return res.status(500).json({
      statusCode: 500,
      message: 'Failed to add employee — rolled back',
      error: error.message,
    });
  }
};