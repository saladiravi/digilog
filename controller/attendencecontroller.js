// const pool = require('../config/db');
// const deviceService=require('../services/deviceService')
// // READ — raw scan history
// exports.getAttendanceLogs = async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT a.log_id, e.employee_name, a.punch_time, a.verify_mode
//        FROM tbl_attendance_log a
//        LEFT JOIN tbl_employee e ON a.employee_id = e.employee_id
//        ORDER BY a.punch_time DESC
//        LIMIT 100`
//     );
//     return res.status(200).json({ statusCode: 200, data: result.rows });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ statusCode: 500, message: 'Internal Server Error' });
//   }
// };

// // READ — daily summary (punch in / punch out / late / absent)
// exports.getDailyAttendanceReport = async (req, res) => {
//   const { date } = req.query;
//   const targetDate = date || new Date().toISOString().split('T')[0];

//   try {
//     await syncAttendanceFromDevice(); // pull latest from device before showing the report

//     const result = await pool.query(
//       `SELECT
//          e.employee_id, e.employee_name, d.department_name,
//          a.punch_in, a.punch_out, a.status, a.is_late
//        FROM tbl_employee e
//        LEFT JOIN tbl_daily_attendance a
//          ON e.employee_id = a.employee_id AND a.attendance_date = $1
//        LEFT JOIN tbl_department d ON e.department_id = d.department_id
//        WHERE LOWER(e.status) = 'active'
//        ORDER BY e.employee_name`,
//       [targetDate]
//     );

//     return res.status(200).json({ statusCode: 200, date: targetDate, data: result.rows });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
//   }
// };

// // once-a-day batch — this genuinely can't be event-driven, absence has no "event" to listen for
// exports.markAbsentees = async (req, res) => {
//   const { date } = req.body;
//   const targetDate = date || new Date().toISOString().split('T')[0];

//   try {
//     const result = await pool.query(
//       `INSERT INTO tbl_daily_attendance (employee_id, attendance_date, status)
//        SELECT employee_id, $1, 'Absent'
//        FROM tbl_employee
//        WHERE LOWER(status) = 'active' AND enrolled = true
//        AND employee_id NOT IN (
//          SELECT employee_id FROM tbl_daily_attendance WHERE attendance_date = $1
//        )
//        RETURNING *`,
//       [targetDate]
//     );

//     return res.status(200).json({
//       statusCode: 200,
//       message: 'Absentees marked',
//       count: result.rows.length,
//       data: result.rows,
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
//   }
// };





 

// async function updateDailySummary(employeeId, punchTime) {
//   if (!employeeId) return;

//   // Get every punch for this employee on this date, in order
//   const punchesResult = await pool.query(
//     `SELECT punch_time
//      FROM tbl_attendance_log
//      WHERE employee_id = $1 AND DATE(punch_time) = DATE($2)
//      ORDER BY punch_time ASC`,
//     [employeeId, punchTime]
//   );

//   const punches = punchesResult.rows.map(r => r.punch_time);
//   if (punches.length === 0) return;

//   const officeStart = process.env.OFFICE_START_TIME || '09:30:00';

//   // Pair punches alternately: 1st=IN, 2nd=OUT, 3rd=IN, 4th=OUT, ...
//   const rows = [];
//   for (let i = 0; i < punches.length; i += 2) {
//     const punchIn = punches[i];
//     const punchOut = punches[i + 1] || null; // null = still punched in, no OUT yet

//     const isLate = new Date(punchIn).toTimeString().slice(0, 8) > officeStart;
//     const status = isLate ? 'Late' : 'Present';

//     rows.push({ punchIn, punchOut, status, isLate });
//   }

//   // Clear out today's rows for this employee, then reinsert fresh (one row per pair)
//   await pool.query(
//     `DELETE FROM tbl_daily_attendance
//      WHERE employee_id = $1 AND attendance_date = DATE($2)`,
//     [employeeId, punchTime]
//   );

//   for (const row of rows) {
//     await pool.query(
//       `INSERT INTO tbl_daily_attendance
//         (employee_id, attendance_date, punch_in, punch_out, status, is_late)
//        VALUES ($1, DATE($2), $3, $4, $5, $6)`,
//       [employeeId, punchTime, row.punchIn, row.punchOut, row.status, row.isLate]
//     );
//   }
// }

// async function syncAttendanceFromDevice() {
//   const device_ip = process.env.DEVICE_IP;
//   const device_port = process.env.DEVICE_PORT || 4370;
//   const device_id = process.env.DEVICE_ID;

//   const logs = await deviceService.getDeviceAttendance(device_ip, device_port);
//   let inserted = 0;

//   for (const log of logs) {
//     const empResult = await pool.query(
//       'SELECT employee_id FROM tbl_employee WHERE device_user_id = $1',
//       [String(log.deviceUserId)]
//     );
//     const employee = empResult.rows[0] || null;

//     const insertResult = await pool.query(
//       `INSERT INTO tbl_attendance_log (employee_id, device_user_id, device_id, punch_time, verify_mode)
//        VALUES ($1, $2, $3, $4, $5)
//        ON CONFLICT (device_user_id, punch_time, device_id) DO NOTHING
//        RETURNING *`,
//       [employee?.employee_id || null, String(log.deviceUserId), device_id, log.recordTime, log.verifyMode || null]
//     );

//     if (insertResult.rows.length) {
//       inserted++;
//       await updateDailySummary(employee?.employee_id, log.recordTime);
//     }
//   }

//   console.log(`✅ Sync complete — ${inserted} new record(s)`);
//   return inserted;
// }


// exports.getMonthlyAttendanceByEmployee = async (req, res) => {
//   const { employee_id } = req.params;

//   try {
//     await syncAttendanceFromDevice(); // pull latest from device before reading

//     const empCheck = await pool.query('SELECT * FROM tbl_employee WHERE employee_id = $1', [employee_id]);
//     if (!empCheck.rows.length) {
//       return res.status(404).json({ statusCode: 404, message: 'Employee not found' });
//     }

//     const result = await pool.query(
//       `SELECT
//          attendance_date, punch_in, punch_out, status, is_late
//        FROM tbl_daily_attendance
//        WHERE employee_id = $1
//          AND date_trunc('month', attendance_date) = date_trunc('month', CURRENT_DATE)
//        ORDER BY attendance_date ASC`,
//       [employee_id]
//     );

//     // quick summary counts, handy for a dashboard card
//     const summary = {
//       present: result.rows.filter(r => r.status === 'Present').length,
//       late: result.rows.filter(r => r.status === 'Late').length,
//       absent: result.rows.filter(r => r.status === 'Absent').length,
//       total_marked_days: result.rows.length,
//     };

//     return res.status(200).json({
//       statusCode: 200,
//       employee_id: Number(employee_id),
//       employee_name: empCheck.rows[0].employee_name,
//       month: new Date().toISOString().slice(0, 7), // e.g. "2026-08"
//       summary,
//       data: result.rows,
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
//   }
// };


const pool = require('../config/db');

// READ — raw scan history
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

// READ — daily summary (punch in / punch out / late / absent)
// NOTE: no more syncAttendanceFromDevice() call here — with ADMS, punches
// arrive continuously as pushes (see routes/adms.js), so tbl_daily_attendance
// is already up to date by the time this is read. Nothing to pull anymore.
exports.getDailyAttendanceReport = async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `SELECT
         e.employee_id, e.employee_name, d.department_name,
         a.punch_in, a.punch_out, a.status, a.is_late
       FROM tbl_employee e
       LEFT JOIN tbl_daily_attendance a
         ON e.employee_id = a.employee_id AND a.attendance_date = $1
       LEFT JOIN tbl_department d ON e.department_id = d.department_id
       WHERE LOWER(e.status) = 'active'
       ORDER BY e.employee_name`,
      [targetDate]
    );

    return res.status(200).json({ statusCode: 200, date: targetDate, data: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

// once-a-day batch — unchanged, this was never device-dependent
exports.markAbsentees = async (req, res) => {
  const { date } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `INSERT INTO tbl_daily_attendance (employee_id, attendance_date, status)
       SELECT employee_id, $1, 'Absent'
       FROM tbl_employee
       WHERE LOWER(status) = 'active' AND enrolled = true
       AND employee_id NOT IN (
         SELECT employee_id FROM tbl_daily_attendance WHERE attendance_date = $1
       )
       RETURNING *`,
      [targetDate]
    );

    return res.status(200).json({
      statusCode: 200,
      message: 'Absentees marked',
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};

// Unchanged logic, moved here as a standalone exported function so
// routes/adms.js can call it right after inserting a fresh punch —
// this replaces syncAttendanceFromDevice() as the trigger point.
exports.updateDailySummary = async function updateDailySummary(employeeId, punchTime) {
  if (!employeeId) return;

  const punchesResult = await pool.query(
    `SELECT punch_time
     FROM tbl_attendance_log
     WHERE employee_id = $1 AND DATE(punch_time) = DATE($2)
     ORDER BY punch_time ASC`,
    [employeeId, punchTime]
  );

  const punches = punchesResult.rows.map(r => r.punch_time);
  if (punches.length === 0) return;

  const officeStart = process.env.OFFICE_START_TIME || '09:30:00';

  const rows = [];
  for (let i = 0; i < punches.length; i += 2) {
    const punchIn = punches[i];
    const punchOut = punches[i + 1] || null;

    const isLate = new Date(punchIn).toTimeString().slice(0, 8) > officeStart;
    const status = isLate ? 'Late' : 'Present';

    rows.push({ punchIn, punchOut, status, isLate });
  }

  await pool.query(
    `DELETE FROM tbl_daily_attendance
     WHERE employee_id = $1 AND attendance_date = DATE($2)`,
    [employeeId, punchTime]
  );

  for (const row of rows) {
    await pool.query(
      `INSERT INTO tbl_daily_attendance
        (employee_id, attendance_date, punch_in, punch_out, status, is_late)
       VALUES ($1, DATE($2), $3, $4, $5, $6)`,
      [employeeId, punchTime, row.punchIn, row.punchOut, row.status, row.isLate]
    );
  }
};

// NOTE: no more syncAttendanceFromDevice() call — same reasoning as above
exports.getMonthlyAttendanceByEmployee = async (req, res) => {
  const { employee_id } = req.params;

  try {
    const empCheck = await pool.query('SELECT * FROM tbl_employee WHERE employee_id = $1', [employee_id]);
    if (!empCheck.rows.length) {
      return res.status(404).json({ statusCode: 404, message: 'Employee not found' });
    }

    const result = await pool.query(
      `SELECT
         attendance_date, punch_in, punch_out, status, is_late
       FROM tbl_daily_attendance
       WHERE employee_id = $1
         AND date_trunc('month', attendance_date) = date_trunc('month', CURRENT_DATE)
       ORDER BY attendance_date ASC`,
      [employee_id]
    );

    const summary = {
      present: result.rows.filter(r => r.status === 'Present').length,
      late: result.rows.filter(r => r.status === 'Late').length,
      absent: result.rows.filter(r => r.status === 'Absent').length,
      total_marked_days: result.rows.length,
    };

    return res.status(200).json({
      statusCode: 200,
      employee_id: Number(employee_id),
      employee_name: empCheck.rows[0].employee_name,
      month: new Date().toISOString().slice(0, 7),
      summary,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', error: error.message });
  }
};