// routes/adms.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // matches your actual project structure

// Device check-in / handshake
// GET /iclock/cdata.aspx?SN=...&options=all&language=69&pushver=2.4.1
router.get('/iclock/cdata.aspx', async (req, res) => {
  const { SN, options } = req.query;
  console.log(`[ADMS] Handshake from SN=${SN}, options=${options}`);

  // Real-world ZKTeco/eSSL firmware expects a plain "OK" here — an elaborate
  // config-string response can cause some firmware to get stuck retrying the
  // handshake and never progress to polling /iclock/getrequest.aspx.
  res.set('Content-Type', 'text/plain');
  res.send('OK');
});

// Device pushes attendance punches / operation logs
// POST /iclock/cdata.aspx?SN=...&table=ATTLOG
router.post('/iclock/cdata.aspx', express.text({ type: '*/*' }), async (req, res) => {
  const { SN, table } = req.query;
  console.log(`[ADMS] Data push from SN=${SN}, table=${table}`);

  if (table === 'ATTLOG' && req.body) {
    const lines = req.body.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      // Typical format: PIN\tTimestamp\tStatus\tVerify\t...
      const parts = line.split('\t');
      const [deviceUserId, punchTime, status, verifyMode] = parts;
      try {
        await pool.query(
          `INSERT INTO tbl_attendance (device_user_id, punch_time, status, verify_mode, device_sn)
           VALUES ($1, $2, $3, $4, $5)`,
          [deviceUserId, punchTime, status, verifyMode, SN]
        );
      } catch (err) {
        console.error('[ADMS] Failed to insert attendance row:', err.message, line);
      }
    }
  }
  res.set('Content-Type', 'text/plain');
  res.send('OK');
});

// Device polls for pending commands (e.g. create-user)
// GET /iclock/getrequest.aspx?SN=...
router.get('/iclock/getrequest.aspx', async (req, res) => {
  const { SN } = req.query;
  res.set('Content-Type', 'text/plain');

  const result = await pool.query(
    `SELECT * FROM tbl_device_commands
     WHERE device_sn = $1 AND status = 'pending'
     ORDER BY id ASC LIMIT 1`,
    [SN]
  );

  if (result.rows.length === 0) {
    return res.send('OK');
  }

  const cmd = result.rows[0];
  await pool.query(`UPDATE tbl_device_commands SET status = 'sent' WHERE id = $1`, [cmd.id]);

  res.send(`C:${cmd.id}:${cmd.command}`);
});

// Device reports the result of an executed command
// POST /iclock/devicecmd.aspx?SN=...
// router.post('/iclock/devicecmd.aspx', express.text({ type: '*/*' }), async (req, res) => {
//   const { SN } = req.query;
//   console.log(`[ADMS] Command result from SN=${SN}: ${req.body}`);

//   const match = req.body.match(/ID=(\d+)&Return=(-?\d+)/);
//   if (match) {
//     const [, id, ret] = match;
//     const success = ret === '0';
//     await pool.query(
//       `UPDATE tbl_device_commands SET status = $1 WHERE id = $2`,
//       [success ? 'success' : 'failed', id]
//     );

//     if (success) {
//       // Look up which employee this command was for and mark them synced
//       const cmdRow = await pool.query(`SELECT * FROM tbl_device_commands WHERE id = $1`, [id]);
//       const pinMatch = cmdRow.rows[0]?.command.match(/PIN=(\d+)/);
//       if (pinMatch) {
//         await pool.query(
//           `UPDATE tbl_employee SET device_user_id = $1 WHERE employee_id = $1`,
//           [pinMatch[1]]
//         );
//       }
//     }
//   }
//   res.set('Content-Type', 'text/plain');
//   res.send('OK');
// });


router.post(
  '/iclock/devicecmd.aspx',
  express.text({ type: '*/*' }),
  async (req, res) => {

    const { SN } = req.query;

    console.log(
      `[ADMS] Command result from SN=${SN}: ${req.body}`
    );

    try {

      const match = req.body.match(/ID=(\d+)&Return=(-?\d+)/);

      if (match) {

        const [, id, ret] = match;

        const success = ret === '0';

        // ----------------------------------------------
        // Update command status
        // ----------------------------------------------

        await pool.query(
          `
          UPDATE tbl_device_commands
          SET status = $1
          WHERE id = $2
          `,
          [
            success ? 'success' : 'failed',
            id
          ]
        );

        // ----------------------------------------------
        // Get command
        // ----------------------------------------------

        const cmdRow = await pool.query(
          `
          SELECT *
          FROM tbl_device_commands
          WHERE id = $1
          `,
          [id]
        );

        if (cmdRow.rows.length > 0) {

          const command = cmdRow.rows[0].command;

          console.log(
            `[ADMS] Command ${id} result=${ret}`
          );

          // --------------------------------------------
          // Fingerprint enrollment command
          // --------------------------------------------

          if (
            success &&
            command.includes('ENROLL_FP')
          ) {

            const pinMatch = command.match(
              /PIN=(\d+)/
            );

            if (pinMatch) {

              const deviceUserId = pinMatch[1];

              console.log(
                `[ADMS] Fingerprint enrollment successful for PIN=${deviceUserId}`
              );

              // Find employee using device_user_id
              const employeeResult = await pool.query(
                `
                SELECT employee_id
                FROM tbl_employee
                WHERE device_user_id = $1
                   OR employee_id::text = $1
                LIMIT 1
                `,
                [deviceUserId]
              );

              if (employeeResult.rows.length > 0) {

                await pool.query(
                  `
                  UPDATE tbl_employee
                  SET enrolled = true
                  WHERE employee_id = $1
                  `,
                  [employeeResult.rows[0].employee_id]
                );

                console.log(
                  `[ADMS] Employee ${employeeResult.rows[0].employee_id} marked enrolled=true`
                );
              }
            }
          }

          // --------------------------------------------
          // Other commands
          // --------------------------------------------

          if (
            success &&
            command.includes('C:') &&
            !command.includes('ENROLL_FP')
          ) {

            const pinMatch = command.match(
              /PIN=(\d+)/
            );

            if (pinMatch) {

              const deviceUserId = pinMatch[1];

              await pool.query(
                `
                UPDATE tbl_employee
                SET device_user_id = $1
                WHERE employee_id::text = $1
                `,
                [deviceUserId]
              );
            }
          }
        }
      }

      res.set('Content-Type', 'text/plain');
      res.send('OK');

    } catch (error) {

      console.error(
        '[ADMS] devicecmd error:',
        error
      );

      res.set('Content-Type', 'text/plain');
      res.send('OK');
    }
  }
);
module.exports = router;