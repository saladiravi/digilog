const ZKLib = require("node-zklib");
const pool = require("../config/db");

let reconnectTimer = null;

async function updateDailySummary(employeeId, punchTime) {
  if (!employeeId) return;

  const result = await pool.query(
    `SELECT MIN(punch_time) AS first_punch, MAX(punch_time) AS last_punch
     FROM tbl_attendance_log
     WHERE employee_id = $1 AND DATE(punch_time) = DATE($2)`,
    [employeeId, punchTime],
  );

  const { first_punch, last_punch } = result.rows[0];
  if (!first_punch) return;

  const officeStart = process.env.OFFICE_START_TIME || "09:30:00";
  const punchInTimeOnly = new Date(first_punch).toTimeString().slice(0, 8);
  const isLate = punchInTimeOnly > officeStart;
  const status = isLate ? "Late" : "Present";

  await pool.query(
    `INSERT INTO tbl_daily_attendance (employee_id, attendance_date, punch_in, punch_out, status, is_late)
     VALUES ($1, DATE($2), $3, $4, $5, $6)
     ON CONFLICT (employee_id, attendance_date)
     DO UPDATE SET punch_in = $3, punch_out = $4, status = $5, is_late = $6`,
    [employeeId, punchTime, first_punch, last_punch, status, isLate],
  );
}

// async function startAttendanceListener(io, deviceId, ip, port = 4370) {
//   const zk = new ZKLib(ip, port, 10000, 4000);
//   await zk.createSocket();  // ← if this line fails/times out, nothing below it ever runs

//   console.log(`🟢 Listening for live attendance on ${ip}:${port}...`);

//   zk.getRealTimeLogs(async (data) => {   // <---- THIS is the function you were looking for
//     console.log('📥 Punch detected:', data);

//     const deviceUserId = String(data.deviceUserId ?? data.userId);
//     const punchTime = data.recordTime ?? data.attTime;

//     try {
//       const empResult = await pool.query(
//         'SELECT employee_id, employee_name FROM tbl_employee WHERE device_user_id = $1',
//         [deviceUserId]
//       );
//       const employee = empResult.rows[0] || null;

//       const insertResult = await pool.query(
//         `INSERT INTO tbl_attendance_log (employee_id, device_user_id, device_id, punch_time, verify_mode)
//          VALUES ($1, $2, $3, $4, $5)
//          ON CONFLICT (device_user_id, punch_time, device_id) DO NOTHING
//          RETURNING *`,
//         [employee?.employee_id || null, deviceUserId, deviceId, punchTime, null]
//       );

//       if (insertResult.rows.length) {
//         const payload = {
//           employee_id: employee?.employee_id || null,
//           employee_name: employee?.employee_name || 'Unknown',
//           punch_time: punchTime,
//         };
//         console.log('✅ Saved + emitting:', payload);
//         io.emit('attendance:live', payload);
//       }
//     } catch (err) {
//       console.error('❌ Error saving live punch:', err.message);
//     }
//   });

//   // NEW — without this, a single disconnect kills the listener permanently and silently
//   zk.zklibTcp.socket.on('close', () => {
//     console.log('🔴 Realtime socket closed — reconnecting in 3s...');
//     setTimeout(() => startAttendanceListener(io, deviceId, ip, port), 3000);
//   });

//   zk.zklibTcp.socket.on('error', (err) => {
//     const msg = err?.err?.message || err?.message || String(err);
//     console.log('⚠️ Realtime socket error:', msg);
//   });

//   activeListener = zk;
//   return zk;
// }


async function startAttendanceListener(io, deviceId, ip, port = 4370) {
  const zk = new ZKLib(ip, port, 10000, 4000);

  try {
    await zk.createSocket();
  } catch (err) {
    console.error(`⚠️ Could not connect to device at ${ip}:${port} — ${err.message}. Retrying in 5s...`);
    setTimeout(() => startAttendanceListener(io, deviceId, ip, port), 5000);
    return; // stop here — nothing below is safe to run without a socket
  }

  console.log(`🟢 Listening for live attendance on ${ip}:${port}...`);
  zk.getRealTimeLogs(async (data) => { /* unchanged */ });

  zk.zklibTcp.socket.on('close', () => {
    console.log('🔴 Realtime socket closed — reconnecting in 3s...');
    setTimeout(() => startAttendanceListener(io, deviceId, ip, port), 3000);
  });

  zk.zklibTcp.socket.on('error', (err) => {
    console.log('⚠️ Realtime socket error:', err?.err?.message || err?.message || err);
  });
}
module.exports = { startAttendanceListener };
