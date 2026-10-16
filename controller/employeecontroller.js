const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const deviceService = require("../services/deviceService");


const resolveDevice = (body) => ({
  device_ip: body.device_ip || process.env.DEVICE_IP,
  device_port: body.device_port || process.env.DEVICE_PORT || 4370,
  device_id: body.device_id || process.env.DEVICE_ID,
});

exports.addEmployeeWithDevice = async (req, res) => {
  const {
    employee_name,
    password,
    role,
    date_of_birth,
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
    travel_allowance,
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
    password,
    date_of_birth,
    department_id,
    email,
    emp_code,
    mobile_number,
    joining_date,
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

  const employeeRole = role === undefined || role === null || role === ""
    ? "Employee"
    : typeof role === "string"
      ? role.trim()
      : "";

  if (!employeeRole) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid role is required",
    });
  }

  const stringFields = {
    employee_name,
    email,
    emp_code,
    mobile_number,
    account_holder_name,
    bank_name,
    account_number,
    ifsc_code,
  };

  for (const [field, value] of Object.entries(stringFields)) {
    if (typeof value !== "string" || !value.trim()) {
      return res.status(400).json({
        statusCode: 400,
        message: `Valid ${field} is required`,
      });
    }
  }

  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      statusCode: 400,
      message: "Password must be at least 8 characters long"
    });
  }

  if (
    typeof department_id !== "number" &&
    !(typeof department_id === "string" && /^\d+$/.test(department_id))
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid department ID is required",
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

  const cleaned = {
    employee_name: employee_name.trim(),
    email: email.trim().toLowerCase(),
    emp_code: emp_code.trim(),
    mobile_number: mobile_number.trim(),
    account_holder_name: account_holder_name.trim(),
    bank_name: bank_name.trim(),
    account_number: account_number.trim(),
    ifsc_code: ifsc_code.trim().toUpperCase(),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid email is required",
    });
  }

  if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(cleaned.ifsc_code)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid IFSC code is required",
    });
  }

  if (
    typeof joining_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(joining_date) ||
    !Number.isFinite(Date.parse(`${joining_date}T00:00:00Z`)) ||
    new Date(`${joining_date}T00:00:00Z`).toISOString().slice(0, 10) !==
    joining_date
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid joining date in YYYY-MM-DD format is required",
    });
  }

  if (
    effective_date !== undefined &&
    effective_date !== null &&
    effective_date !== "" &&
    (
      typeof effective_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(effective_date) ||
      !Number.isFinite(Date.parse(`${effective_date}T00:00:00Z`)) ||
      new Date(`${effective_date}T00:00:00Z`).toISOString().slice(0, 10) !==
      effective_date
    )
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid effective date in YYYY-MM-DD format is required",
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

  const salaryFields = {
    basic_salary,
    hra: hra ?? 0,
    other_allowances: other_allowances ?? 0,
    travel_allowance: travel_allowance ?? 0,
    pf_deduction: pf_deduction ?? 0,
    professional_tax: professional_tax ?? 0,
    other_deductions: other_deductions ?? 0,
  };

  for (const [field, value] of Object.entries(salaryFields)) {
    if (
      (typeof value !== "number" &&
        !(typeof value === "string" && value.trim() !== "")) ||
      !Number.isFinite(Number(value)) ||
      Number(value) < 0
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: `Valid non-negative ${field} is required`,
      });
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const grossSalary =
    Number(salaryFields.basic_salary) +
    Number(salaryFields.hra) +
    Number(salaryFields.other_allowances) +
    Number(salaryFields.travel_allowance);

  const totalDeductions =
    Number(salaryFields.pf_deduction) +
    Number(salaryFields.professional_tax) +
    Number(salaryFields.other_deductions);

  const netSalary = grossSalary - totalDeductions;
  const annualCtc = grossSalary * 12;

  if (
    !Number.isFinite(grossSalary) ||
    !Number.isFinite(totalDeductions) ||
    !Number.isFinite(annualCtc) ||
    !Number.isFinite(netSalary) ||
    netSalary < 0
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Invalid salary values or total deductions exceed gross salary",
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
      [
        cleaned.email,
        cleaned.emp_code,
        cleaned.mobile_number,
      ]
    );

    if (existingEmployee.rowCount > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        statusCode: 409,
        message:
          "Employee with this email, employee code, or mobile number already exists",
      });
    }

    const departmentResult = await client.query(
      `SELECT department_id
       FROM tbl_department
       WHERE department_id = $1`,
      [Number(department_id)]
    );

    if (departmentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        statusCode: 404,
        message: `Department with ID ${department_id} not found`,
      });
    }

    const empResult = await client.query(
      `INSERT INTO tbl_employee (
        employee_name,
        date_of_birth,
        department_id,
        designation,
        mobile_number,
        status,
        email,
        emp_code,
        joining_date,
        password,
        role
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        cleaned.employee_name,
        date_of_birth,
        Number(department_id),
        typeof designation === "string" ? designation.trim() || null : null,
        cleaned.mobile_number,
        status || "Active",
        cleaned.email,
        cleaned.emp_code,
        joining_date,
        hashedPassword,
        employeeRole,
      ]
    );

    const insertedEmployee = empResult.rows[0];
    const employeeId = insertedEmployee.employee_id;

    await client.query(
      `INSERT INTO tbl_employee_salary (
        employee_id,
        basic_salary,
        annual_ctc,
        hra,
        other_allowances,
        travel_allowance,
        pf_deduction,
        professional_tax,
        other_deductions,
        gross_salary,
        total_deductions,
        net_salary,
        effective_date
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        COALESCE($13::date, CURRENT_DATE)
      )`,
      [
        employeeId,
        Number(salaryFields.basic_salary),
        annualCtc,
        Number(salaryFields.hra),
        Number(salaryFields.other_allowances),
        Number(salaryFields.travel_allowance),
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
      `INSERT INTO tbl_employee_bank_details (
        employee_id,
        account_holder_name,
        bank_name,
        account_number,
        ifsc_code,
        branch_name
      )
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        employeeId,
        cleaned.account_holder_name,
        cleaned.bank_name,
        cleaned.account_number,
        cleaned.ifsc_code,
        typeof branch_name === "string" ? branch_name.trim() || null : null,
      ]
    );

    await client.query(
      `INSERT INTO tbl_device_commands (
        device_sn,
        command,
        status
      )
      VALUES ($1, $2, 'pending')`,
      [
        process.env.DEVICE_SERIAL,
        `DATA UPDATE USERINFO PIN = ${employeeId} \tName = ${cleaned.employee_name} \tPri = 0`,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(202).json({
      success: true,
      statusCode: 202,
      message:
        "Employee, salary and bank details saved. Device synchronization queued.",
      data: {
        employee: insertedEmployee,
        salary: {
          basic_salary: Number(salaryFields.basic_salary),
          hra: Number(salaryFields.hra),
          other_allowances: Number(salaryFields.other_allowances),
          travel_allowance: Number(salaryFields.travel_allowance),
          pf_deduction: Number(salaryFields.pf_deduction),
          professional_tax: Number(salaryFields.professional_tax),
          other_deductions: Number(salaryFields.other_deductions),
          gross_salary: grossSalary,
          total_deductions: totalDeductions,
          net_salary: netSalary,
          annual_ctc: annualCtc,
        },
        bank_details: {
          account_holder_name: account_holder_name.trim(),
          bank_name: bank_name.trim(),
          account_number: account_number.trim(),
          ifsc_code: ifsc_code.trim().toUpperCase(),
          branch_name: branch_name?.trim() || null,
        },
      },
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => { });
    }

    console.error("Add Employee With Device Error:", error);

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Failed to create employee with salary and bank details",
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
    date_of_birth,
    department_id,
    designation,
    joining_date,
    relieving_date,
    mobile_number,
    status,
    email,
    emp_code,
    password,
    role,
  } = req.body;

  let client;
  let transactionStarted = false;

  if (typeof employee_id !== "string" || !/^[1-9]\d*$/.test(employee_id)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid employee ID is required",
    });
  }

  const requiredFields = {
    employee_name,
    date_of_birth,
    department_id,
    designation,
    joining_date,
    mobile_number,
    status,
    email,
    emp_code,
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

  const stringFields = {
    employee_name,
    designation,
    mobile_number,
    email,
    emp_code,
  };

  for (const [field, value] of Object.entries(stringFields)) {
    if (typeof value !== "string" || !value.trim()) {
      return res.status(400).json({
        statusCode: 400,
        message: `Valid ${field} is required`,
      });
    }
  }

  const cleaned = {
    employee_name: employee_name.trim(),
    designation: designation.trim(),
    mobile_number: mobile_number.trim(),
    email: email.trim().toLowerCase(),
    emp_code: emp_code.trim(),
  };

  const employeeRole =
    role === undefined ||
      role === null ||
      (typeof role === "string" && !role.trim())
      ? "Employee"
      : typeof role === "string"
        ? role.trim()
        : null;

  if (!employeeRole) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid role is required",
    });
  }

  if (
    typeof department_id !== "number" &&
    !(typeof department_id === "string" && /^\d+$/.test(department_id))
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid department ID is required",
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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid email address is required",
    });
  }

  if (!["Active", "Inactive"].includes(status)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Status must be Active or Inactive",
    });
  }

  const isValidDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

  if (!isValidDate(date_of_birth)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid date of birth in YYYY-MM-DD format is required",
    });
  }

  if (!isValidDate(joining_date)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid joining date in YYYY-MM-DD format is required",
    });
  }

  if (
    relieving_date !== undefined &&
    relieving_date !== null &&
    relieving_date !== "" &&
    !isValidDate(relieving_date)
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Valid relieving date in YYYY-MM-DD format is required",
    });
  }

  if (
    relieving_date &&
    relieving_date < joining_date
  ) {
    return res.status(400).json({
      statusCode: 400,
      message: "Relieving date cannot be before joining date",
    });
  }

  let hashedPassword = null;

  if (password !== undefined && password !== null && password !== "") {
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        statusCode: 400,
        message: "Password must be at least 8 characters long",
      });
    }

    hashedPassword = await bcrypt.hash(password, 12);
  }

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const existing = await client.query(
      `SELECT employee_id
       FROM tbl_employee
       WHERE employee_id = $1
       FOR UPDATE`,
      [Number(employee_id)]
    );

    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        statusCode: 404,
        message: `Employee with ID ${employee_id} not found`,
      });
    }

    const departmentResult = await client.query(
      `SELECT department_id
       FROM tbl_department
       WHERE department_id = $1`,
      [Number(department_id)]
    );

    if (departmentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        statusCode: 404,
        message: `Department with ID ${department_id} not found`,
      });
    }

    const duplicate = await client.query(
      `SELECT employee_id
       FROM tbl_employee
       WHERE employee_id <> $1
         AND (
           LOWER(email) = LOWER($2)
           OR emp_code = $3
           OR mobile_number = $4
         )
       LIMIT 1`,
      [
        Number(employee_id),
        cleaned.email,
        cleaned.emp_code,
        cleaned.mobile_number,
      ]
    );

    if (duplicate.rowCount > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        statusCode: 409,
        message:
          "Another employee with this email, employee code, or mobile number already exists",
      });
    }

    const updatedEmployeeResult = await client.query(
      `UPDATE tbl_employee
      SET employee_name = $1,
          date_of_birth = $2,
          department_id = $3,
          designation = $4,
          joining_date = $5,
          relieving_date = $6,
          mobile_number = $7,
          status = $8,
          email = $9,
          emp_code = $10,
          role = $11,
          password = COALESCE($12, password)
      WHERE employee_id = $13
      RETURNING employee_id, employee_name, date_of_birth,
                department_id, designation, joining_date,
                relieving_date, mobile_number, status, email,
                emp_code, role`,
      [
        cleaned.employee_name,
        date_of_birth,
        Number(department_id),
        cleaned.designation,
        joining_date,
        relieving_date || null,
        cleaned.mobile_number,
        status,
        cleaned.email,
        cleaned.emp_code,
        employeeRole,
        hashedPassword,
        Number(employee_id),
      ]
    );

    const deviceResult = await client.query(
      `SELECT device_user_id
      FROM tbl_employee
      WHERE employee_id = $1`,
      [Number(employee_id)]
    );

    const deviceUserId = deviceResult.rows[0].device_user_id;

    if (deviceUserId) {
      if (!process.env.DEVICE_SERIAL) {
        throw new Error("DEVICE_SERIAL is not configured");
      }

      await client.query(
        `INSERT INTO tbl_device_commands (
          device_sn,
          command,
          status
        )
        VALUES ($1, $2, 'pending')`,
        [
          process.env.DEVICE_SERIAL,
          `DATA UPDATE USERINFO PIN = ${deviceUserId} \tName = ${cleaned.employee_name} \tPri = 0`,
        ]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Employee details updated successfully",
      data: {
        employee: updatedEmployeeResult.rows[0],
      },
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch((rollbackError) => {
        console.error("Employee update rollback error:", rollbackError);
      });
    }

    console.error("Edit Employee Error:", error);

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Failed to update employee details",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};


exports.updateEmployeeBankDetails = async (req, res) => {
  const { employee_id } = req.params;
  const {
    account_holder_name,
    bank_name,
    account_number,
    ifsc_code,
    branch_name,
  } = req.body;

  try {
    if (!/^[1-9]\d*$/.test(employee_id)) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    const requiredFields = {
      account_holder_name,
      bank_name,
      account_number,
      ifsc_code,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (typeof value !== "string" || !value.trim()) {
        return res.status(400).json({
          statusCode: 400,
          message: `${field} is required`,
        });
      }
    }

    if (
      branch_name !== undefined &&
      branch_name !== null &&
      typeof branch_name !== "string"
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid branch name is required",
      });
    }

    if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc_code.trim())) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid IFSC code is required",
      });
    }

    const employee = await pool.query(
      `SELECT employee_id
       FROM tbl_employee
       WHERE employee_id = $1`,
      [Number(employee_id)]
    );

    if (employee.rowCount === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: `Employee with ID ${employee_id} not found`,
      });
    }

    const result = await pool.query(
      `UPDATE tbl_employee_bank_details
       SET account_holder_name = $1,
           bank_name = $2,
           account_number = $3,
           ifsc_code = $4,
           branch_name = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $6
       RETURNING *`,
      [
        account_holder_name.trim(),
        bank_name.trim(),
        account_number.trim(),
        ifsc_code.trim().toUpperCase(),
        branch_name?.trim() || null,
        Number(employee_id),
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: `Bank details not found for employee ID ${employee_id}`,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Employee bank details updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update Employee Bank Details Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
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

    if (typeof employee_id !== "string" || !/^[1-9]\d*$/.test(employee_id)) {
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
        e.joining_date,
        CASE
          WHEN e.enrolled = true THEN 'Registered'
          ELSE 'Not Registered'
        END AS fingerprint_status,
        CASE
          WHEN s.salary_id IS NULL THEN NULL
          ELSE json_build_object(
            'salary_id', s.salary_id,
            'basic_salary', s.basic_salary,
            'annual_ctc', s.annual_ctc,
            'hra', s.hra,
            'other_allowances', s.other_allowances,
            'pf_deduction', s.pf_deduction,
            'professional_tax', s.professional_tax,
            'other_deductions', s.other_deductions,
            'gross_salary', s.gross_salary,
            'total_deductions', s.total_deductions,
            'net_salary', s.net_salary,
            'effective_date', s.effective_date
          )
        END AS salary,
        CASE
          WHEN b.employee_id IS NULL THEN NULL
          ELSE json_build_object(
            'account_holder_name', b.account_holder_name,
            'bank_name', b.bank_name,
            'account_number', b.account_number,
            'ifsc_code', b.ifsc_code,
            'branch_name', b.branch_name
          )
        END AS bank_details
      FROM tbl_employee e
      LEFT JOIN tbl_department d
        ON d.department_id = e.department_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM tbl_employee_salary es
        WHERE es.employee_id = e.employee_id
        ORDER BY es.effective_date DESC, es.salary_id DESC
        LIMIT 1
      ) s ON TRUE
      LEFT JOIN tbl_employee_bank_details b
        ON b.employee_id = e.employee_id
      WHERE e.employee_id = $1;
    `;

    const result = await pool.query(employeeQuery, [Number(employee_id)]);

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
        e.designation, e.mobile_number, e.status, e.joining_date,e.device_user_id,e.email,e.emp_code,
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


exports.getEmployeeSalaryDetailsByMonth = async (req, res) => {
  const { month } = req.query;

  try {
    if (
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid month is required in YYYY-MM format",
      });
    }

    const selectedMonth = month.trim();
    const salaryMonth = `${selectedMonth}-01`;

    const result = await pool.query(
      `WITH working_dates AS (
        SELECT d.day::date AS work_date
        FROM generate_series(
          $1::date,
          ($1::date + INTERVAL '1 month - 1 day')::date,
          INTERVAL '1 day'
        ) AS d(day)
        WHERE EXTRACT(ISODOW FROM d.day) <> 7
          AND NOT EXISTS (
            SELECT 1
            FROM tbl_event ev
            WHERE ev.event_date = d.day::date
              AND LOWER(TRIM(ev.event_type)) = 'holiday'
          )
      ),
      month_working_days AS (
        SELECT COUNT(*)::int AS working_days
        FROM working_dates
      ),
      attendance_per_day AS (
        SELECT
          a.employee_id,
          a.attendance_date,
          MAX(
            CASE
              WHEN LOWER(TRIM(a.status)) IN ('present', 'late') THEN 1
              ELSE 0
            END
          ) AS day_value,
          BOOL_OR(
            COALESCE(a.is_late, FALSE)
            OR LOWER(TRIM(a.status)) = 'late'
          ) AS is_late_day
        FROM tbl_daily_attendance a
        INNER JOIN working_dates w
          ON w.work_date = a.attendance_date
        GROUP BY a.employee_id, a.attendance_date
      ),
      attendance_summary AS (
        SELECT
          employee_id,
          SUM(day_value)::numeric AS days_present,
          COUNT(*) FILTER (WHERE is_late_day)::int AS late_days
        FROM attendance_per_day
        GROUP BY employee_id
      ),
      leave_per_day AS (
        SELECT
          l.employee_id,
          w.work_date,
          MAX(
            CASE
              WHEN l.from_date = l.to_date
                AND l.duration ~ '^[0-9]+([.][0-9]+)?$'
              THEN LEAST(l.duration::numeric, 1)
              ELSE 1
            END
          ) AS day_value
        FROM tbl_leaves l
        INNER JOIN working_dates w
          ON w.work_date BETWEEN l.from_date AND l.to_date
        WHERE LOWER(TRIM(l.status)) = 'approved'
        GROUP BY l.employee_id, w.work_date
      ),
      leave_summary AS (
        SELECT
          lpd.employee_id,
          SUM(
            GREATEST(
              LEAST(
                lpd.day_value,
                1 - COALESCE(apd.day_value, 0)
              ),
              0
            )
          ) AS leaves_taken
        FROM leave_per_day lpd
        LEFT JOIN attendance_per_day apd
          ON apd.employee_id = lpd.employee_id
          AND apd.attendance_date = lpd.work_date
        GROUP BY lpd.employee_id
      ),
      employee_salary AS (
        SELECT DISTINCT ON (es.employee_id)
          es.employee_id,
          es.basic_salary,
          es.hra,
          es.other_allowances,
          es.travel_allowance,
          es.pf_deduction,
          es.professional_tax,
          es.other_deductions,
          es.gross_salary,
          es.total_deductions,
          es.net_salary,
          es.annual_ctc
        FROM tbl_employee_salary es
        WHERE es.effective_date < (
          $1::date + INTERVAL '1 month'
        )
        ORDER BY
          es.employee_id,
          es.effective_date DESC,
          es.salary_id DESC
      )
      SELECT
        e.employee_id,
        e.employee_name,
        e.emp_code,
        d.department_name,
        sp.payment_id,
        COALESCE(wd.working_days, 0)::int AS working_days,
        COALESCE(att.days_present, 0)::float AS present_days,
        COALESCE(ls.leaves_taken, 0)::float AS leaves_taken,
        GREATEST(
          12 - COALESCE(ls.leaves_taken, 0),
          0
        )::float AS balance_left,
        GREATEST(
          COALESCE(wd.working_days, 0)
          - COALESCE(att.days_present, 0)
          - COALESCE(ls.leaves_taken, 0),
          0
        )::float AS lop_days,
        COALESCE(
          NULLIF(es.annual_ctc, 0),
          es.gross_salary * 12,
          0
        )::float AS annual_ctc,
        COALESCE(
          NULLIF(es.annual_ctc, 0) / 12,
          es.gross_salary,
          0
        )::float AS monthly_ctc,
        COALESCE(
          sp.deductions,
          es.total_deductions,
          0
        )::float AS deduction,
        COALESCE(
          sp.net_amount,
          es.net_salary,
          0
        )::float AS net_amount,
        UPPER(TRIM(COALESCE(sp.status, 'PENDING'))) AS salary_status,
        TO_CHAR(sp.paid_on, 'YYYY-MM-DD') AS paid_on
      FROM tbl_employee e
      CROSS JOIN month_working_days wd
      LEFT JOIN tbl_salary_payment sp
        ON sp.employee_id = e.employee_id
        AND sp.salary_month = $1::date
      LEFT JOIN employee_salary es
        ON es.employee_id = e.employee_id
      LEFT JOIN attendance_summary att
        ON att.employee_id = e.employee_id
      LEFT JOIN leave_summary ls
        ON ls.employee_id = e.employee_id
      LEFT JOIN tbl_department d
        ON d.department_id = e.department_id
      WHERE e.status = 'Active'
      ORDER BY e.employee_id`,
      [salaryMonth]
    );

    const statisticsResult = await pool.query(
      `SELECT
        COUNT(*)::int AS total_employees,
        COALESCE(
          SUM(
            CASE
              WHEN UPPER(TRIM(COALESCE(sp.status, 'PENDING'))) = 'PAID'
              THEN COALESCE(sp.net_amount, es.net_salary, 0)
              ELSE 0
            END
          ),
          0
        )::numeric AS net_payroll,
        COALESCE(
          SUM(
            CASE
              WHEN UPPER(TRIM(COALESCE(sp.status, 'PENDING'))) = 'PAID'
              THEN COALESCE(sp.deductions, es.total_deductions, 0)
              ELSE 0
            END
          ),
          0
        )::numeric AS lop_deductions,
        COUNT(*) FILTER (
          WHERE UPPER(TRIM(COALESCE(sp.status, 'PENDING'))) = 'PENDING'
        )::int AS pending_payments
      FROM tbl_employee e
      LEFT JOIN tbl_salary_payment sp
        ON sp.employee_id = e.employee_id
        AND sp.salary_month = $1::date
      LEFT JOIN LATERAL (
        SELECT
          es.net_salary,
          es.total_deductions
        FROM tbl_employee_salary es
        WHERE es.employee_id = e.employee_id
          AND es.effective_date < (
            $1::date + INTERVAL '1 month'
          )
        ORDER BY es.effective_date DESC, es.salary_id DESC
        LIMIT 1
      ) es ON TRUE
      WHERE e.status = 'Active'`,
      [salaryMonth]
    );

    const summary = result.rows.reduce(
      (acc, row) => {
        acc.total_employees += 1;

        if (row.salary_status === "PAID") {
          acc.paid += 1;
        } else if (row.salary_status === "PENDING") {
          acc.pending += 1;
        } else if (row.salary_status === "HOLD") {
          acc.hold += 1;
        }

        return acc;
      },
      {
        total_employees: 0,
        paid: 0,
        pending: 0,
        hold: 0,
      }
    );

    const statistics = statisticsResult.rows[0];

    return res.status(200).json({
      statusCode: 200,
      message: "Employee salary details fetched successfully",
      month: selectedMonth,
      working_days: result.rows[0]?.working_days ?? 0,
      summary,
      statistics: {
        total_employees: Number(statistics.total_employees),
        net_payroll: Number(statistics.net_payroll),
        lop_deductions: Number(statistics.lop_deductions),
        pending_payments: Number(statistics.pending_payments),
      },
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Employee Salary Details By Month Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
  }
};

exports.creditEmployeeSalary = async (req, res) => {
  const { employee_id } = req.params;
  const { month } = req.body; // format: YYYY-MM, e.g. 2026-10

  try {
    if (!/^[1-9]\d*$/.test(employee_id)) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    if (
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid month is required in YYYY-MM format",
      });
    }

    const salaryMonth = `${month.trim()}-01`;

    const employee = await pool.query(
      `SELECT employee_id
       FROM tbl_employee
       WHERE employee_id = $1
         AND status = 'Active'`,
      [Number(employee_id)]
    );

    if (employee.rowCount === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: `Active employee with ID ${employee_id} not found`,
      });
    }

    const result = await pool.query(
      `WITH working_dates AS(
                                SELECT d.day:: date AS work_date
         FROM generate_series(
                                  $1:: date,
                                  ($1:: date + INTERVAL '1 month - 1 day'):: date,
                                INTERVAL '1 day'
                              ) AS d(day)
         WHERE EXTRACT(ISODOW FROM d.day) <> 7
           AND NOT EXISTS(
                                SELECT 1
               FROM tbl_event ev
               WHERE ev.event_date = d.day:: date
                 AND LOWER(TRIM(ev.event_type)) = 'holiday'
                              )
       ),
       month_working_days AS(
                                SELECT COUNT(*):: numeric AS total_working_days
         FROM working_dates
                              ),
  attendance_summary AS(
    SELECT COALESCE(SUM(
      CASE
                    WHEN LOWER(TRIM(a.status)) = 'present' THEN 1
                    WHEN LOWER(TRIM(a.status)) IN('half day', 'half-day', 'halfday') THEN 0.5
                    ELSE 0
                  END
    ), 0) AS present_days
         FROM tbl_daily_attendance a
         JOIN working_dates w ON w.work_date = a.attendance_date
         WHERE a.employee_id = $2
  ),
    calc AS(
      SELECT e.employee_id,
      wd.total_working_days AS working_days,
      att.present_days AS days_present,
      e.gross_salary AS gross_amount,
      ROUND(
        e.gross_salary / NULLIF(wd.total_working_days, 0)
        * GREATEST(wd.total_working_days - att.present_days, 0),
        2
      ) AS deductions
         FROM tbl_employee e
         CROSS JOIN month_working_days wd
         CROSS JOIN attendance_summary att
         WHERE e.employee_id = $2
    )
       INSERT INTO tbl_salary_payment
  (employee_id, salary_month, working_days, days_present,
    gross_amount, deductions, net_amount, status, paid_on)
       SELECT employee_id,
  $1:: date,
    working_days,
    days_present,
    gross_amount,
    COALESCE(deductions, 0),
    gross_amount - COALESCE(deductions, 0),
    'PAID',
    CURRENT_DATE
       FROM calc
       ON CONFLICT(employee_id, salary_month)
       DO UPDATE SET status = 'PAID',
  paid_on = CURRENT_DATE
         WHERE tbl_salary_payment.status <> 'PAID'
       RETURNING payment_id,
  employee_id,
  TO_CHAR(salary_month, 'YYYY-MM-DD') AS salary_month,
    working_days,
    days_present,
    gross_amount,
    deductions,
    net_amount,
    status,
    TO_CHAR(paid_on, 'YYYY-MM-DD') AS paid_on`,
      [salaryMonth, Number(employee_id)]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        statusCode: 409,
        message: `Salary for ${month.trim()} is already paid for employee ID ${employee_id} `,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Employee salary credited successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Credit Employee Salary Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
  }
};

exports.getEmployeeSalaryDetails = async (req, res) => {
  const { employee_id, month } = req.query;

  try {
    if (
      typeof employee_id !== "string" ||
      !/^[1-9]\d*$/.test(employee_id.trim())
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    if (
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid month is required in YYYY-MM format",
      });
    }

    const employeeId = Number(employee_id.trim());
    const selectedMonth = month.trim();
    const salaryMonth = `${selectedMonth}-01`;

    const result = await pool.query(
      `WITH working_dates AS (
    SELECT d.day::date AS work_date
    FROM generate_series(
      $2::date,
      ($2::date + INTERVAL '1 month - 1 day')::date,
      INTERVAL '1 day'
    ) AS d(day)
    WHERE EXTRACT(ISODOW FROM d.day) <> 7
      AND NOT EXISTS (
        SELECT 1
        FROM tbl_event ev
        WHERE ev.event_date = d.day::date
          AND LOWER(TRIM(ev.event_type)) = 'holiday'
      )
  ),
  working_summary AS (
    SELECT COUNT(*)::int AS working_days
    FROM working_dates
  ),
  attendance_per_day AS (
    SELECT
      a.employee_id,
      a.attendance_date,
      MAX(
        CASE
          WHEN LOWER(TRIM(a.status)) IN ('present', 'late')
          THEN 1
          ELSE 0
        END
      ) AS present_value
    FROM tbl_daily_attendance a
    INNER JOIN working_dates wd
      ON wd.work_date = a.attendance_date
    WHERE a.employee_id = $1
    GROUP BY a.employee_id, a.attendance_date
  ),
  attendance_summary AS (
    SELECT
      COALESCE(SUM(present_value), 0)::numeric AS present_days
    FROM attendance_per_day
  ),
  leave_per_day AS (
    SELECT
      l.employee_id,
      wd.work_date,
      MAX(
        CASE
          WHEN l.from_date = l.to_date
            AND l.duration ~ '^[0-9]+([.][0-9]+)?$'
          THEN LEAST(l.duration::numeric, 1)
          ELSE 1
        END
      ) AS leave_value
    FROM tbl_leaves l
    INNER JOIN working_dates wd
      ON wd.work_date BETWEEN l.from_date AND l.to_date
    WHERE l.employee_id = $1
      AND LOWER(TRIM(l.status)) = 'approved'
    GROUP BY l.employee_id, wd.work_date
  ),
  leave_summary AS (
    SELECT
      COALESCE(
        SUM(
          GREATEST(
            LEAST(
              lpd.leave_value,
              1 - COALESCE(apd.present_value, 0)
            ),
            0
          )
        ),
        0
      )::numeric AS leaves_taken
    FROM leave_per_day lpd
    LEFT JOIN attendance_per_day apd
      ON apd.employee_id = lpd.employee_id
      AND apd.attendance_date = lpd.work_date
  ),
  yearly_leave_per_day AS (
    SELECT
      l.employee_id,
      wd.work_date,
      MAX(
        CASE
          WHEN l.from_date = l.to_date
            AND l.duration ~ '^[0-9]+([.][0-9]+)?$'
          THEN LEAST(l.duration::numeric, 1)
          ELSE 1
        END
      ) AS leave_value
    FROM tbl_leaves l
    INNER JOIN generate_series(
      make_date(
        CASE
          WHEN EXTRACT(MONTH FROM $2::date) >= 4
          THEN EXTRACT(YEAR FROM $2::date)::int
          ELSE EXTRACT(YEAR FROM $2::date)::int - 1
        END,
        4,
        1
      ),
      ($2::date + INTERVAL '1 month - 1 day')::date,
      INTERVAL '1 day'
    ) AS wd(work_date)
      ON wd.work_date BETWEEN l.from_date AND l.to_date
    WHERE l.employee_id = $1
      AND LOWER(TRIM(l.status)) = 'approved'
      AND EXTRACT(ISODOW FROM wd.work_date) <> 7
      AND NOT EXISTS (
        SELECT 1
        FROM tbl_event ev
        WHERE ev.event_date = wd.work_date
          AND LOWER(TRIM(ev.event_type)) = 'holiday'
      )
    GROUP BY l.employee_id, wd.work_date
  ),
  yearly_leave_summary AS (
    SELECT
      COALESCE(
        SUM(
          GREATEST(
            LEAST(
              ylp.leave_value,
              1 - COALESCE(apd.present_value, 0)
            ),
            0
          )
        ),
        0
      )::numeric AS yearly_leaves_taken
    FROM yearly_leave_per_day ylp
    LEFT JOIN attendance_per_day apd
      ON apd.employee_id = ylp.employee_id
      AND apd.attendance_date = ylp.work_date
  ),
  employee_salary AS (
    SELECT
      es.employee_id,
      es.annual_ctc,
      es.gross_salary,
      es.net_salary,
      es.total_deductions
    FROM tbl_employee_salary es
    WHERE es.employee_id = $1
      AND es.effective_date < (
        $2::date + INTERVAL '1 month'
      )
    ORDER BY es.effective_date DESC, es.salary_id DESC
    LIMIT 1
  )
  SELECT
    e.employee_id,
    e.employee_name,
    e.emp_code,
    TO_CHAR($2::date, 'YYYY-MM') AS month,
    COALESCE(es.net_salary, 0)::numeric AS net_salary,
    COALESCE(
      NULLIF(es.annual_ctc, 0),
      es.gross_salary * 12,
      0
    )::numeric AS annual_ctc,
    COALESCE(ws.working_days, 0)::int AS working_days,
    att.present_days::float AS present_days,
    GREATEST(
      ws.working_days - att.present_days,
      0
    )::float AS absent_days,
    ls.leaves_taken::float AS leaves_taken,
    GREATEST(
      12 - yls.yearly_leaves_taken,
      0
    )::float AS paid_leave_available,
    GREATEST(
      ws.working_days - att.present_days - ls.leaves_taken,
      0
    )::float AS lop_days_before_hr
  FROM tbl_employee e
  CROSS JOIN working_summary ws
  CROSS JOIN attendance_summary att
  CROSS JOIN leave_summary ls
  CROSS JOIN yearly_leave_summary yls
  LEFT JOIN employee_salary es
    ON es.employee_id = e.employee_id
  WHERE e.employee_id = $1
    AND e.status = 'Active'`,
      [employeeId, salaryMonth]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: `Active employee with ID ${employeeId} not found`,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Employee salary details fetched successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get Employee Salary Details Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
  }
};