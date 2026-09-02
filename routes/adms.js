const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { updateDailySummary } = require('../controller/attendencecontroller');

// Device check-in / handshake
router.get('/iclock/cdata.aspx', async (req, res) => {
  const { SN, options } = req.query;
  console.log(`[ADMS] Handshake from SN=${SN}, options=${options}`);
  res.set('Content-Type', 'text/plain');
  res.send('OK');
});

// Device pushes attendance punches, or fingerprint templates after enrollment completes
router.post('/iclock/cdata.aspx', express.text({ type: '*/*' }), async (req, res) => {
  const { SN, table } = req.query;
  console.log(`[ADMS] Data push from SN=${SN}, table=${table}, body=${req.body}`);

  if (table === 'ATTLOG' && req.body) {
    const lines = req.body.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const [deviceUserId, punchTime, status, verifyMode] = line.split('\t');
      try {
        // deviceUserId (PIN) equals employee_id directly, since we set
        // PIN=${employeeId} when we queued DATA UPDATE USERINFO originally.
        const empResult = await pool.query(
          'SELECT employee_id FROM tbl_employee WHERE device_user_id = $1',
          [deviceUserId]
        );
        const employeeId = empResult.rows[0]?.employee_id || null;

        const insertResult = await pool.query(
          `INSERT INTO tbl_attendance_log (employee_id, device_user_id, device_id, device_sn, punch_time, verify_mode)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (device_user_id, punch_time, device_id) DO NOTHING
           RETURNING *`,
          [employeeId, deviceUserId, process.env.DEVICE_ID, SN, punchTime, verifyMode || null]
        );

        if (insertResult.rows.length && employeeId) {
          await updateDailySummary(employeeId, punchTime);
        }
      } catch (err) {
        console.error('[ADMS] Failed to insert attendance row:', err.message, line);
      }
    }
  }

  if (table === 'FINGERTMP' && req.body) {
    const lines = req.body.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const devicePin = line.split('\t')[0];
      console.log(`[ADMS] Fingerprint template received for PIN=${devicePin}`);
      try {
        await pool.query(`UPDATE tbl_employee SET enrolled = true WHERE device_user_id = $1`, [devicePin]);
      } catch (err) {
        console.error('[ADMS] Failed to mark employee enrolled from FINGERTMP push:', err.message, line);
      }
    }
  }

  res.set('Content-Type', 'text/plain');
  res.send('OK');
});

// Device polls for pending commands (user sync, enroll trigger, etc.)
router.get('/iclock/getrequest.aspx', async (req, res) => {
  const { SN } = req.query;
  res.set('Content-Type', 'text/plain');

  const result = await pool.query(
    `SELECT * FROM tbl_device_commands WHERE device_sn = $1 AND status = 'pending' ORDER BY id ASC LIMIT 1`,
    [SN]
  );

  if (result.rows.length === 0) {
    return res.send('OK');
  }

  const cmd = result.rows[0];
  await pool.query(`UPDATE tbl_device_commands SET status = 'sent' WHERE id = $1`, [cmd.id]);
  console.log(`[ADMS] Sent command ${cmd.id} to SN=${SN}: ${cmd.command}`);
  res.send(`C:${cmd.id}:${cmd.command}`);
});

// Device reports the result of an executed command.
// Real ADMS firmware responds like: ID=395&Return=0&CMD=ENROLL_BIO
// (CMD tells us what kind of command this was; Return=0 means success)
router.post('/iclock/devicecmd.aspx', express.text({ type: '*/*' }), async (req, res) => {
  const { SN } = req.query;
  console.log(`[ADMS] Command result from SN=${SN}: ${req.body}`);

  const match = req.body.match(/ID=(\d+)&Return=(-?\d+)/);
  if (match) {
    const [, id, ret] = match;
    const success = ret === '0';
    await pool.query(`UPDATE tbl_device_commands SET status = $1 WHERE id = $2`, [success ? 'success' : 'failed', id]);

    if (success) {
      const cmdRow = await pool.query(`SELECT * FROM tbl_device_commands WHERE id = $1`, [id]);
      const commandText = cmdRow.rows[0]?.command || '';

      if (commandText.startsWith('DATA UPDATE USERINFO')) {
        const pinMatch = commandText.match(/PIN=(\d+)/);
        if (pinMatch) {
          await pool.query(`UPDATE tbl_employee SET device_user_id = $1 WHERE employee_id = $1`, [pinMatch[1]]);
        }
      }

      if (commandText.startsWith('ENROLL_BIO')) {
        const pinMatch = commandText.match(/PIN=(\d+)/);
        if (pinMatch) {
          await pool.query(`UPDATE tbl_employee SET enrolled = true WHERE device_user_id = $1`, [pinMatch[1]]);
          console.log(`[ADMS] Enrollment confirmed via devicecmd for PIN=${pinMatch[1]}`);
        }
      }

      if (commandText.startsWith('DATA DELETE USERINFO')) {
        const pinMatch = commandText.match(/PIN=(\d+)/);
        console.log(`[ADMS] Device-side delete confirmed for PIN=${pinMatch?.[1]} (employee row was already removed from DB when this was queued)`);
      }
    }
  }

  res.set('Content-Type', 'text/plain');
  res.send('OK');
});

module.exports = router;