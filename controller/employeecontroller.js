const pool = require("../config/db");
const deviceService = require("../services/deviceService");

 
const resolveDevice = (body) => ({
  device_ip: body.device_ip || process.env.DEVICE_IP,
  device_port: body.device_port || process.env.DEVICE_PORT || 4370,
  device_id: body.device_id || process.env.DEVICE_ID,
});

exports.addEmployeeWithDevice = async (req, res) => {
  const { employee_name, department_id, designation, mobile_number, status } = req.body;

  if (!employee_name || !department_id) {
    return res.status(400).json({ statusCode: 400, message: "employee name and department are required" });
  }

  let insertedEmployee = null;
  try {
    const empResult = await pool.query(
      `INSERT INTO tbl_employee (employee_name, department_id, designation, mobile_number, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [employee_name, department_id, designation, mobile_number, status || "Active"]
    );
    insertedEmployee = empResult.rows[0];
    const employeeId = insertedEmployee.employee_id;

    // NOTE: this used to call deviceService.createDeviceUser() directly over TCP (node-zklib),
    // which required AWS to reach the device's LAN IP — impossible without a VPN/tunnel.
    // Now we queue the command instead. The device (via ADMS) polls /iclock/getrequest.aspx
    // and picks this up on its own, then reports success back via /iclock/devicecmd.aspx.
    await pool.query(
      `INSERT INTO tbl_device_commands (device_sn, command, status)
       VALUES ($1, $2, 'pending')`,
      [
        process.env.DEVICE_SERIAL,
        `DATA UPDATE USERINFO PIN=${employeeId}\tName=${employee_name}\tPri=0`,
      ]
    ); 

    // device_user_id is set once devicecmd.aspx confirms the write succeeded — see routes/adms.js
    return res.status(202).json({
      statusCode: 202,
      message: "Employee saved — queued for device sync (device will pick it up on its next check-in)",
      data: insertedEmployee,
    });
  } catch (error) {
    console.error(error);
    if (insertedEmployee) {
      await pool.query("DELETE FROM tbl_employee WHERE employee_id = $1", [insertedEmployee.employee_id]).catch(() => {});
    }
    return res.status(500).json({ statusCode: 500, message: "Failed — rolled back", error: error.message });
  }
};

exports.editEmployeeWithDevice = async (req, res) => {
  const { employee_id } = req.params;
  const { employee_name, department_id, designation, mobile_number, status } = req.body;

  try {
    const existing = await pool.query("SELECT * FROM tbl_employee WHERE employee_id = $1", [employee_id]);
    if (!existing.rows.length) return res.status(404).json({ statusCode: 404, message: "Employee not found" });

    const updated = await pool.query(
      `UPDATE tbl_employee
       SET employee_name = $1, department_id = $2, designation = $3, mobile_number = $4, status = $5
       WHERE employee_id = $6 RETURNING *`,
      [employee_name, department_id, designation, mobile_number, status, employee_id]
    );

    // Queue the update instead of calling deviceService.createDeviceUser() directly.
    // Only bother syncing to the device if this employee actually has a device_user_id
    // (i.e. was already synced once) — otherwise there's nothing on the device to update yet.
    if (existing.rows[0].device_user_id) {
      await pool.query(
        `INSERT INTO tbl_device_commands (device_sn, command, status) VALUES ($1, $2, 'pending')`,
        [
          process.env.DEVICE_SERIAL,
          `DATA UPDATE USERINFO PIN=${existing.rows[0].device_user_id}\tName=${employee_name}\tPri=0`,
        ]
      );
    }

    return res.status(200).json({
      statusCode: 200,
      message: existing.rows[0].device_user_id
        ? "Employee updated — device sync queued"
        : "Employee updated (not yet synced to device, so nothing queued)",
      data: updated.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: "Internal Server Error", error: error.message });
  }
};

exports.deleteEmployeeWithDevice = async (req, res) => {
  const { employee_id } = req.params;

  try {
    const existing = await pool.query("SELECT * FROM tbl_employee WHERE employee_id = $1", [employee_id]);
    if (!existing.rows.length) return res.status(404).json({ statusCode: 404, message: "Employee not found" });

    // Queue the delete instead of calling deviceService.deleteDeviceUser() directly.
    if (existing.rows[0].device_user_id) {
      await pool.query(
        `INSERT INTO tbl_device_commands (device_sn, command, status) VALUES ($1, $2, 'pending')`,
        [process.env.DEVICE_SERIAL, `DATA DELETE USERINFO PIN=${existing.rows[0].device_user_id}`]
      );
    }

    // NOTE: this deletes the employee row immediately, before the device confirms
    // the delete happened. If you'd rather wait for confirmation first, this needs
    // to become a soft-delete (a status flag) that only hard-deletes once
    // devicecmd.aspx reports success — happy to build that version if you prefer it.
    await pool.query("DELETE FROM tbl_employee WHERE employee_id = $1", [employee_id]);

    return res.status(200).json({
      statusCode: 200,
      message: existing.rows[0].device_user_id
        ? "Employee deleted — device removal queued"
        : "Employee deleted (was never synced to device, nothing to queue)",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ statusCode: 500, message: "Internal Server Error", error: error.message });
  }
};







exports.getEmployeeDashboardCounts = async (req, res) => {
  try {
    const countQuery = `
      SELECT
        COUNT(*) AS total_employees,
        COUNT(CASE WHEN LOWER(status) = 'active' THEN 1 END) AS active_employees,
        COUNT(CASE WHEN LOWER(status) = 'inactive' THEN 1 END) AS inactive_employees,
        COUNT(CASE WHEN enrolled = true THEN 1 END) AS fp_registered,
        COUNT(CASE WHEN enrolled = false THEN 1 END) AS fp_not_registered
      FROM tbl_employee;
    `;

    const employeeQuery = `
      SELECT
        e.employee_id, e.employee_name, e.department_id, d.department_name,
        e.designation, e.mobile_number, e.status, e.device_user_id,
        CASE WHEN e.enrolled = true THEN 'Registered' ELSE 'Not Registered' END AS fingerprint_status
      FROM tbl_employee e
      LEFT JOIN tbl_department d ON e.department_id = d.department_id
      ORDER BY e.employee_id DESC;
    `;

    const countResult = await pool.query(countQuery);
    const employeeResult = await pool.query(employeeQuery);
    const countData = countResult.rows[0];

    return res.status(200).json({
      statusCode: 200,
      message: "Employee dashboard details fetched successfully",
      counts: {
        total_employees: Number(countData.total_employees),
        active_employees: Number(countData.active_employees),
        inactive_employees: Number(countData.inactive_employees),
        fp_registered: Number(countData.fp_registered),
        fp_not_registered: Number(countData.fp_not_registered),
      },
      employees: employeeResult.rows,
    });
  } catch (error) {
    console.error("Get Employee Dashboard Counts Error:", error);
    return res.status(500).json({ statusCode: 500, message: "Internal server error", error: error.message });
  }
};