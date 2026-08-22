const pool = require('../config/db');
const deviceService = require('../services/deviceService');
 
exports.addEmployeeWithDevice = async (req, res) => {
  const { employee_name, department_id, designation, mobile_number, status, device_ip, device_port } = req.body;

  if (!employee_name || !device_ip) {
    return res.status(400).json({ statusCode: 400, message: 'employee_name and device_ip are required' });
  }

  let insertedEmployee = null;
  try {
    const empResult = await pool.query(
      `INSERT INTO tbl_employee (employee_name, department_id, designation, mobile_number, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [employee_name, department_id, designation, mobile_number, status || 'active']
    );
    insertedEmployee = empResult.rows[0];
    const employeeId = insertedEmployee.employee_id;

    await deviceService.createDeviceUser(device_ip, device_port || 4370, employeeId, String(employeeId), employee_name);

    const updated = await pool.query(
      'UPDATE tbl_employee SET device_user_id = $1 WHERE employee_id = $2 RETURNING *',
      [String(employeeId), employeeId]
    );

    return res.status(201).json({ statusCode: 201, message: 'Employee added to DB and device', data: updated.rows[0] });
  } catch (error) {
    console.error(error);
    if (insertedEmployee) {
      await pool.query('DELETE FROM tbl_employee WHERE employee_id = $1', [insertedEmployee.employee_id]).catch(() => {});
    }
    return res.status(500).json({ statusCode: 500, message: 'Failed — rolled back', error: error.message });
  }
};

// EDIT — update DB record + re-sync name on device
exports.editEmployeeWithDevice = async (req, res) => {
  const { employee_id } = req.params;
  const { employee_name, department_id, designation, mobile_number, status, device_ip, device_port } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM tbl_employee WHERE employee_id = $1', [employee_id]);
    if (!existing.rows.length) return res.status(404).json({ statusCode: 404, message: 'Employee not found' });

    const updated = await pool.query(
      `UPDATE tbl_employee
       SET employee_name = $1, department_id = $2, designation = $3, mobile_number = $4, status = $5
       WHERE employee_id = $6 RETURNING *`,
      [employee_name, department_id, designation, mobile_number, status, employee_id]
    );

    // re-write the name on the device too, so both stay in sync
    if (device_ip) {
      await deviceService.createDeviceUser(
        device_ip, device_port || 4370, employee_id, String(employee_id), employee_name
      );
    }

    return res.status(200).json({ statusCode: 200, message: 'Employee updated in DB and device', data: updated.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

// DELETE — remove from DB + device
exports.deleteEmployeeWithDevice = async (req, res) => {
  const { employee_id } = req.params;
  const { device_ip, device_port } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM tbl_employee WHERE employee_id = $1', [employee_id]);
    if (!existing.rows.length) return res.status(404).json({ statusCode: 404, message: 'Employee not found' });

    if (device_ip) {
      await deviceService.deleteDeviceUser(device_ip, device_port || 4370, employee_id);
    }

    await pool.query('DELETE FROM tbl_employee WHERE employee_id = $1', [employee_id]);

    return res.status(200).json({ statusCode: 200, message: 'Employee deleted from DB and device' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

// ENROLL — trigger device scan mode
exports.enrollFingerprintRaw = async (req, res) => {
  const { device_ip, device_port, user_id, finger_index } = req.body;
  if (!device_ip || !user_id) {
    return res.status(400).json({ statusCode: 400, message: 'device_ip and user_id are required' });
  }
  try {
    await deviceService.startRemoteEnroll(device_ip, device_port || 4370, user_id, finger_index || 0);
    return res.status(200).json({ statusCode: 200, message: 'Device in enroll mode — ask employee to place finger 3x' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

// CONFIRM — check template exists, flip enrolled=true in DB
exports.confirmEnrollment = async (req, res) => {
  const { employee_id, device_ip, device_port, finger_index } = req.body;
  try {
    const empResult = await pool.query('SELECT * FROM tbl_employee WHERE employee_id = $1', [employee_id]);
    if (!empResult.rows.length) return res.status(404).json({ statusCode: 404, message: 'Employee not found' });

    const check = await deviceService.checkFingerprintExists(device_ip, device_port || 4370, employee_id, finger_index || 0);
    if (!check.exists) {
      return res.status(400).json({ statusCode: 400, message: 'No fingerprint found yet — ask employee to scan again' });
    }

    const updated = await pool.query('UPDATE tbl_employee SET enrolled = true WHERE employee_id = $1 RETURNING *', [employee_id]);
    return res.status(200).json({ statusCode: 200, message: 'Enrollment confirmed', data: updated.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

// SYNC — pull attendance from device, save new records to DB
exports.syncAttendance = async (req, res) => {
  const { device_id, device_ip, device_port } = req.body;
  if (!device_id || !device_ip) {
    return res.status(400).json({ statusCode: 400, message: 'device_id and device_ip are required' });
  }
  try {
    const logs = await deviceService.getDeviceAttendance(device_ip, device_port || 4370);
    let inserted = 0;
    const results = [];

    for (const log of logs) {
      const empResult = await pool.query(
        'SELECT employee_id, employee_name FROM tbl_employee WHERE device_user_id = $1',
        [String(log.deviceUserId)]
      );
      const employee = empResult.rows[0] || null;

      const insertResult = await pool.query(
        `INSERT INTO tbl_attendance_log (employee_id, device_user_id, device_id, punch_time, verify_mode)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_user_id, punch_time, device_id) DO NOTHING
         RETURNING *`,
        [employee?.employee_id || null, String(log.deviceUserId), device_id, log.recordTime, log.verifyMode || null]
      );

      if (insertResult.rows.length) {
        inserted++;
        results.push({ employee_name: employee?.employee_name || 'Unknown', punch_time: log.recordTime });
      }
    }

    return res.status(200).json({ statusCode: 200, message: 'Attendance synced', totalPulled: logs.length, newRecords: inserted, data: results });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

// READ — attendance logs from DB (post-sync)
exports.getAttendanceLogs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.log_id, e.employee_name, a.punch_time, a.verify_mode
       FROM tbl_attendance_log a
       LEFT JOIN tbl_employee e ON a.employee_id = e.employee_id
       ORDER BY a.punch_time DESC
       LIMIT 100`
    );
    return res.status(200).json({ statusCode: 200, data: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error' });
  }
};