const pool = require("../config/db");
const deviceService = require("../services/deviceService");


const resolveDevice = (body) => ({
  device_ip: body.device_ip || process.env.DEVICE_IP,
  device_port: body.device_port || process.env.DEVICE_PORT || 4370,
  device_id: body.device_id || process.env.DEVICE_ID,
});

exports.addEmployeeWithDevice = async (req, res) => {
  const {
    employee_name,
    department_id,
    designation,
    mobile_number,
    status,
    email,
    emp_code,
    joining_date,
    basic_salary,
    hra,
    other_allowances,
    pf_deduction,
    professional_tax,
    other_deductions,
    effective_date,
    account_holder_name,
    bank_name,
    account_number,
    ifsc_code,
    branch_name,
  } = req.body;

  const requiredFields = {
    employee_name,
    department_id,
    email,
    emp_code,
    basic_salary,
    account_holder_name,
    bank_name,
    account_number,
    ifsc_code,
  };

  for (const [field, value] of Object.entries(requiredFields)) {
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: `${field} is required`,
      });
    }
  }

  if (
    typeof employee_name !== "string" ||
    typeof email !== "string" ||
    typeof emp_code !== "string" ||
    typeof account_holder_name !== "string" ||
    typeof bank_name !== "string" ||
    typeof account_number !== "string" ||
    typeof ifsc_code !== "string"
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Invalid employee or bank details",
    });
  }

  if (
    !Number.isSafeInteger(Number(department_id)) ||
    Number(department_id) <= 0
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid department ID is required",
    });
  }

  const salaryFields = {
    basic_salary,
    hra: hra ?? 0,
    other_allowances: other_allowances ?? 0,
    pf_deduction: pf_deduction ?? 0,
    professional_tax: professional_tax ?? 0,
    other_deductions: other_deductions ?? 0,
  };

  for (const [field, value] of Object.entries(salaryFields)) {
    if (
      typeof value !== "number" &&
      !(typeof value === "string" && value.trim() !== "")
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: `Valid ${field} is required`,
      });
    }

    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      return res.status(400).json({
        statusCode: 400,
        message: `${field} must be a non - negative number`,
      });
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid email is required",
    });
  }

  if (
    typeof joining_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(joining_date) ||
    !Number.isFinite(Date.parse(`${joining_date}T00:00:00Z`)) ||
    new Date(`${joining_date}T00:00:00Z`).toISOString().slice(0, 10) !== joining_date
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid joining date in YYYY-MM-DD format is required",
    });
  }

  if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc_code.trim())) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid IFSC code is required",
    });
  }

  if (
    status !== undefined &&
    !["Active", "Inactive"].includes(status)
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid employee status is required",
    });
  }

  const grossSalary =
    Number(salaryFields.basic_salary) +
    Number(salaryFields.hra) +
    Number(salaryFields.other_allowances);

  const totalDeductions =
    Number(salaryFields.pf_deduction) +
    Number(salaryFields.professional_tax) +
    Number(salaryFields.other_deductions);

  const netSalary = grossSalary - totalDeductions;

  if (!Number.isFinite(netSalary) || netSalary < 0) {
    return res.status(400).json({
      statusCode: 400,
      message: "Total deductions cannot exceed gross salary",
    });
  }

  if (!process.env.DEVICE_SERIAL) {
    return res.status(500).json({
      statusCode: 500,
      message: "Attendance device serial is not configured",
    });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const existingEmployee = await client.query(
      `SELECT employee_id
   FROM tbl_employee
   WHERE LOWER(email) = LOWER($1)
      OR emp_code = $2
      OR mobile_number = $3
   LIMIT 1`,
      [email.trim(), emp_code.trim(), mobile_number.trim()]
    );

    if (existingEmployee.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        statusCode: 409,
        message: "Employee with this email, employee code, or mobile number already exists",
      });
    }

    const empResult = await client.query(
      `INSERT INTO tbl_employee (
        employee_name,
        department_id,
        designation,
        mobile_number,
        status,
        email,
        emp_code,
        joining_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        employee_name.trim(),
        Number(department_id),
        designation?.trim() || null,
        mobile_number?.trim() || null,
        status || "Active",
        email.trim().toLowerCase(),
        emp_code.trim(),
        joining_date,
      ]
    );

    const insertedEmployee = empResult.rows[0];
    const employeeId = insertedEmployee.employee_id;

    await client.query(
      `INSERT INTO tbl_employee_salary(
          employee_id,
          basic_salary,
          hra,
          other_allowances,
          pf_deduction,
          professional_tax,
          other_deductions,
          gross_salary,
          total_deductions,
          net_salary,
          effective_date
        )
        VALUES(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          COALESCE($11:: date, CURRENT_DATE)
        )`,
      [
        employeeId,
        Number(salaryFields.basic_salary),
        Number(salaryFields.hra),
        Number(salaryFields.other_allowances),
        Number(salaryFields.pf_deduction),
        Number(salaryFields.professional_tax),
        Number(salaryFields.other_deductions),
        grossSalary,
        totalDeductions,
        netSalary,
        effective_date || null,
      ]
    );

    await client.query(
      `INSERT INTO tbl_employee_bank_details(
        employee_id,
        account_holder_name,
        bank_name,
        account_number,
        ifsc_code,
        branch_name
      )
      VALUES($1, $2, $3, $4, $5, $6)`,
      [
        employeeId,
        account_holder_name.trim(),
        bank_name.trim(),
        account_number.trim(),
        ifsc_code.trim().toUpperCase(),
        branch_name?.trim() || null,
      ]
    );

    await client.query(
      `INSERT INTO tbl_device_commands(
        device_sn,
        command,
        status
      )
      VALUES($1, $2, 'pending')`,
      [
        process.env.DEVICE_SERIAL,
        `DATA UPDATE USERINFO PIN = ${employeeId} \tName = ${employee_name.trim()} \tPri = 0`,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(202).json({
      statusCode: 202,
      message:
        "Employee, salary and bank details saved. Device synchronization queued.",
      data: {
        employee: insertedEmployee,
        salary: {
          basic_salary: Number(salaryFields.basic_salary),
          hra: Number(salaryFields.hra),
          other_allowances: Number(salaryFields.other_allowances),
          pf_deduction: Number(salaryFields.pf_deduction),
          professional_tax: Number(salaryFields.professional_tax),
          other_deductions: Number(salaryFields.other_deductions),
          gross_salary: grossSalary,
          total_deductions: totalDeductions,
          net_salary: netSalary,
        },
      },
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => { });
    }

    console.error(error);

    return res.status(500).json({
      statusCode: 500,
      message: "Failed to create employee with salary and bank details",
      error: error.message,
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};


exports.editEmployeeWithDevice = async (req, res) => {
  const { employee_id } = req.params;
  const {
    employee_name,
    department_id,
    designation,
    mobile_number,
    status,
    email,
    emp_code,
  } = req.body;

  try {
    if (!/^[1-9]\d*$/.test(employee_id)) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    const existing = await pool.query(
      "SELECT * FROM tbl_employee WHERE employee_id = $1",
      [employee_id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        statusCode: 404,
        message: `Employee with ID ${employee_id} not found`,
      });
    }

    const cleanedEmail = typeof email === "string" ? email.trim() : "";
    const cleanedEmpCode = typeof emp_code === "string" ? emp_code.trim() : "";
    const cleanedMobileNumber =
      typeof mobile_number === "string" ? mobile_number.trim() : "";

    const duplicate = await pool.query(
      `SELECT employee_id
       FROM tbl_employee
       WHERE employee_id <> $1
         AND (
           LOWER(email) = LOWER($2)
           OR emp_code = $3
           OR mobile_number = $4
         )
       LIMIT 1`,
      [employee_id, cleanedEmail, cleanedEmpCode, cleanedMobileNumber]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        statusCode: 409,
        message:
          "Another employee with this email, employee code, or mobile number already exists",
      });
    }

    const updated = await pool.query(
      `UPDATE tbl_employee
       SET employee_name = $1,
           department_id = $2,
           designation = $3,
           mobile_number = $4,
           status = $5,
           email = $6,
           emp_code = $7
       WHERE employee_id = $8
       RETURNING *`,
      [
        typeof employee_name === "string" ? employee_name.trim() : employee_name,
        department_id,
        designation,
        cleanedMobileNumber,
        status,
        cleanedEmail,
        cleanedEmpCode,
        employee_id,
      ]
    );

    if (existing.rows[0].device_user_id) {
      await pool.query(
        `INSERT INTO tbl_device_commands (device_sn, command, status)
         VALUES ($1, $2, 'pending')`,
        [
          process.env.DEVICE_SERIAL,
          `DATA UPDATE USERINFO PIN=${existing.rows[0].device_user_id}\tName=${typeof employee_name === "string" ? employee_name.trim() : employee_name}\tPri=0`,
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
    return res.status(500).json({
      statusCode: 500,
      message: "Internal Server Error",
      error: error.message,
    });
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



exports.getEmployeeById = async (req, res) => {
  try {
    const { employee_id } = req.params;

    if (!/^[1-9]\d*$/.test(employee_id)) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    const employeeQuery = `
      SELECT
        e.employee_id,
        e.employee_name,
        e.department_id,
        d.department_name,
        e.designation,
        e.mobile_number,
        e.status,
        e.device_user_id,
        e.email,
        e.emp_code,
        CASE
          WHEN e.enrolled = true THEN 'Registered'
          ELSE 'Not Registered'
        END AS fingerprint_status
      FROM tbl_employee e
      LEFT JOIN tbl_department d
        ON e.department_id = d.department_id
      WHERE e.employee_id = $1;
    `;

    const result = await pool.query(employeeQuery, [employee_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: `Employee with ID ${employee_id} not found`,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Employee details fetched successfully",
      employee: result.rows[0],
    });
  } catch (error) {
    console.error("Get Employee By ID Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
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
        e.designation, e.mobile_number, e.status, e.device_user_id,e.email,e.emp_code,
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