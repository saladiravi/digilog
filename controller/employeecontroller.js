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

    const { password, ...employeeWithoutPassword } = insertedEmployee;

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
        employee: employeeWithoutPassword,
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
    basic_salary,
    hra,
    other_allowances,
    travel_allowance,
    pf_deduction,
    professional_tax,
    other_deductions,
    effective_date,
  } = req.body || {};

  let client;

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

    const employeeId = Number(employee_id.trim());

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

    if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc_code.trim())) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid IFSC code is required",
      });
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

    const salaryFields = {
      basic_salary,
      hra,
      other_allowances,
      travel_allowance,
      pf_deduction,
      professional_tax,
      other_deductions,
    };

    for (const [field, value] of Object.entries(salaryFields)) {
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && !value.trim()) ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0
      ) {
        return res.status(400).json({
          statusCode: 400,
          message: `Valid ${field} is required`,
        });
      }
    }

    if (
      typeof effective_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(effective_date) ||
      !Number.isFinite(Date.parse(effective_date)) ||
      new Date(effective_date).toISOString().slice(0, 10) !== effective_date
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Valid effective date in YYYY-MM-DD format is required",
      });
    }

    const salary = Object.fromEntries(
      Object.entries(salaryFields).map(([field, value]) => [
        field,
        Number(value),
      ])
    );

    const gross_salary =
      salary.basic_salary +
      salary.hra +
      salary.other_allowances +
      salary.travel_allowance;

    const total_deductions =
      salary.pf_deduction +
      salary.professional_tax +
      salary.other_deductions;

    const net_salary = gross_salary - total_deductions;

    if (net_salary < 0) {
      return res.status(400).json({
        statusCode: 400,
        message: "Total deductions cannot exceed gross salary",
      });
    }

    const annual_ctc = gross_salary * 12;

    client = await pool.connect();
    await client.query("BEGIN");

    const employeeResult = await client.query(
      `SELECT employee_id
       FROM tbl_employee
       WHERE employee_id = $1`,
      [employeeId]
    );

    if (employeeResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        statusCode: 404,
        message: `Employee with ID ${employeeId} not found`,
      });
    }

    const existingBankResult = await client.query(
      `SELECT employee_id
       FROM tbl_employee_bank_details
       WHERE employee_id = $1
       FOR UPDATE`,
      [employeeId]
    );

    let bankResult;

    if (existingBankResult.rowCount > 0) {
      bankResult = await client.query(
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
          employeeId,
        ]
      );
    } else {
      bankResult = await client.query(
        `INSERT INTO tbl_employee_bank_details (
           employee_id,
           account_holder_name,
           bank_name,
           account_number,
           ifsc_code,
           branch_name
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          employeeId,
          account_holder_name.trim(),
          bank_name.trim(),
          account_number.trim(),
          ifsc_code.trim().toUpperCase(),
          branch_name?.trim() || null,
        ]
      );
    }

    const existingSalaryResult = await client.query(
      `SELECT salary_id
       FROM tbl_employee_salary
       WHERE employee_id = $1
       ORDER BY effective_date DESC, salary_id DESC
       LIMIT 1
       FOR UPDATE`,
      [employeeId]
    );

    let salaryResult;

    const salaryValues = [
      salary.basic_salary,
      salary.hra,
      salary.other_allowances,
      salary.travel_allowance,
      salary.pf_deduction,
      salary.professional_tax,
      salary.other_deductions,
      gross_salary,
      total_deductions,
      net_salary,
      annual_ctc,
      effective_date,
      employeeId,
    ];

    if (existingSalaryResult.rowCount > 0) {
      salaryResult = await client.query(
        `UPDATE tbl_employee_salary
      SET basic_salary = $1,
          hra = $2,
          other_allowances = $3,
          travel_allowance = $4,
          pf_deduction = $5,
          professional_tax = $6,
          other_deductions = $7,
          gross_salary = $8,
          total_deductions = $9,
          net_salary = $10,
          annual_ctc = $11,
          effective_date = $12
      WHERE salary_id = $13
      RETURNING *`,
        [
          salary.basic_salary,
          salary.hra,
          salary.other_allowances,
          salary.travel_allowance,
          salary.pf_deduction,
          salary.professional_tax,
          salary.other_deductions,
          gross_salary,
          total_deductions,
          net_salary,
          annual_ctc,
          effective_date,
          existingSalaryResult.rows[0].salary_id,
        ]
      );
    } else {
      salaryResult = await client.query(
        `INSERT INTO tbl_employee_salary (
           employee_id,
           basic_salary,
           hra,
           other_allowances,
           travel_allowance,
           pf_deduction,
           professional_tax,
           other_deductions,
           gross_salary,
           total_deductions,
           net_salary,
           annual_ctc,
           effective_date
         )
         VALUES (
           $13, $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12
         )
         RETURNING *`,
        salaryValues
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      statusCode: 200,
      message: "Employee bank and salary details saved successfully",
      data: {
        bank_details: bankResult.rows[0],
        salary_details: salaryResult.rows[0],
      },
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => { });
    }

    console.error("Update Employee Bank and Salary Details Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
  } finally {
    if (client) {
      client.release();
    }
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
        e.designation, e.mobile_number, e.status, e.joining_date,e.device_user_id,e.email,e.emp_code, e.relieving_date,
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

exports.getEmployeeIdAndName = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT employee_id, employee_name
       FROM tbl_employee
       ORDER BY employee_id DESC`
    );

    return res.status(200).json({
      statusCode: 200,
      message: "Employee list fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Employee ID and Name Error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
    });
  }
};

exports.getEmployeesSalaryDetailsByMonth = async (req, res) => {
  const { month } = req.query;

  try {
    if (
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid month is required in YYYY-MM format",
      });
    }

    const selectedMonth = month.trim();
    const salaryMonth = `${selectedMonth}-01`;
    const leaveEntitlement = yearlyLeaveEntitlement(selectedMonth);

    const result = await pool.query(
      `WITH working_dates AS (
        SELECT d.day::date AS work_date
        FROM generate_series(
          $1::date,
          LEAST(
            ($1::date + INTERVAL '1 month - 1 day')::date,
            CURRENT_DATE
          ),
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
          a.attendance_date::date AS attendance_date,
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
          ON w.work_date = a.attendance_date::date
        GROUP BY a.employee_id, a.attendance_date::date
      ),
      attendance_summary AS (
        SELECT
          employee_id,
          SUM(day_value)::numeric AS days_present,
          COUNT(*) FILTER (WHERE is_late_day)::int AS late_days
        FROM attendance_per_day
        GROUP BY employee_id
      ),
      leave_summary AS (
        SELECT
          l.employee_id,
          SUM(
            CASE
              WHEN l.duration::text ~ '^[0-9]+([.][0-9]+)?$'
              THEN
                l.duration::numeric
                * (
                    LEAST(
                      l.to_date::date,
                      ($1::date + INTERVAL '1 month - 1 day')::date,
                      CURRENT_DATE
                    )
                    - GREATEST(l.from_date::date, $1::date)
                    + 1
                  )::numeric
                / NULLIF(
                    l.to_date::date - l.from_date::date + 1,
                    0
                  )
              ELSE 0
            END
          ) AS leaves_taken
        FROM tbl_leaves l
        WHERE LOWER(TRIM(l.status)) = 'approved'
          AND l.from_date::date <= LEAST(
            ($1::date + INTERVAL '1 month - 1 day')::date,
            CURRENT_DATE
          )
          AND l.to_date::date >= $1::date
        GROUP BY l.employee_id
      ),
      financial_year_leaves AS (
        SELECT
          l.employee_id,
          SUM(
            CASE
              WHEN l.duration::text ~ '^[0-9]+([.][0-9]+)?$'
              THEN
                l.duration::numeric
                * (
                    LEAST(
                      l.to_date::date,
                      LEAST(
                        ($1::date + INTERVAL '1 month - 1 day')::date,
                        CURRENT_DATE
                      )
                    )
                    - GREATEST(
                      l.from_date::date,
                      make_date(
                        EXTRACT(YEAR FROM $1::date)::int
                        - CASE
                            WHEN EXTRACT(MONTH FROM $1::date) < 4 THEN 1
                            ELSE 0
                          END,
                        4,
                        1
                      )
                    )
                    + 1
                  )::numeric
                / NULLIF(
                    l.to_date::date - l.from_date::date + 1,
                    0
                  )
              ELSE 0
            END
          ) AS total_leaves_taken
        FROM tbl_leaves l
        WHERE LOWER(TRIM(l.status)) = 'approved'
          AND l.from_date::date <= LEAST(
            ($1::date + INTERVAL '1 month - 1 day')::date,
            CURRENT_DATE
          )
          AND l.to_date::date >= make_date(
            EXTRACT(YEAR FROM $1::date)::int
            - CASE
                WHEN EXTRACT(MONTH FROM $1::date) < 4 THEN 1
                ELSE 0
              END,
            4,
            1
          )
        GROUP BY l.employee_id
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
        GREATEST(
          COALESCE(wd.working_days, 0)
          - COALESCE(att.days_present, 0),
          0
        )::float AS absent_days,
        COALESCE(
          sp.leaves_taken,
          ls.leaves_taken,
          0
        )::float AS leaves_taken,
        COALESCE(
          fyl.total_leaves_taken,
          0
        )::float AS total_leaves_taken,
        COALESCE(
          sp.available_leaves,
          GREATEST(
            $2::numeric - COALESCE(fyl.total_leaves_taken, 0),
            0
          )
        )::float AS available_leaves,
        GREATEST(
          COALESCE(wd.working_days, 0)
          - COALESCE(att.days_present, 0)
          - GREATEST(
              $2::numeric - COALESCE(fyl.total_leaves_taken, 0),
              0
            ),
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
      LEFT JOIN financial_year_leaves fyl
        ON fyl.employee_id = e.employee_id
      LEFT JOIN tbl_department d
        ON d.department_id = e.department_id
      WHERE e.status = 'Active'
      ORDER BY e.employee_id`,
      [salaryMonth, leaveEntitlement]
    );

    const summary = result.rows.reduce(
      (acc, row) => {
        acc.total_employees += 1;

        if (row.salary_status === "PAID") {
          acc.paid += 1;
        } else if (row.salary_status === "PENDING") {
          acc.pending_payments += 1;
        }

        acc.net_payroll += Number(row.net_amount || 0);
        acc.lop_deductions += Number(row.deduction || 0);

        return acc;
      },
      {
        total_employees: 0,
        paid: 0,
        net_payroll: 0,
        lop_deductions: 0,
        pending_payments: 0,
      }
    );

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Employee salary details fetched successfully",
      month: selectedMonth,
      statistics: {
        total_employees: summary.total_employees,
        paid: summary.paid,
        pending_payments: summary.pending_payments,
        net_payroll: Number(summary.net_payroll.toFixed(2)),
        lop_deductions: Number(summary.lop_deductions.toFixed(2)),
      },
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Employee Salary Details By Month Error:", error);

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal server error",
    });
  }
};




exports.creditEmployeeSalary = async (req, res) => {
  const { employee_id } = req.params;
  const {
    salary_month,
    working_days,
    days_present,
    lop_days,
    gross_amount,
    deductions = 0,
    hr_reason = null,
    paid_on = new Date().toISOString().slice(0, 10),
  } = req.body;

  try {
    if (!/^[1-9]\d*$/.test(employee_id || "")) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    if (
      !salary_month ||
      !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(salary_month)
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid salary month in YYYY-MM-01 format is required",
      });
    }

    if (
      working_days == null ||
      days_present == null ||
      lop_days == null ||
      gross_amount == null ||
      !Number.isInteger(Number(working_days)) ||
      !Number.isInteger(Number(days_present)) ||
      !Number.isInteger(Number(lop_days)) ||
      !Number.isFinite(Number(gross_amount)) ||
      !Number.isFinite(Number(deductions)) ||
      Number(working_days) <= 0 ||
      Number(days_present) < 0 ||
      Number(lop_days) < 0 ||
      Number(days_present) > Number(working_days) ||
      Number(lop_days) > Number(working_days) ||
      Number(days_present) + Number(lop_days) > Number(working_days) ||
      Number(gross_amount) < 0 ||
      Number(deductions) < 0 ||
      Number(deductions) > Number(gross_amount)
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid salary, attendance and LOP details are required",
      });
    }

    if (
      hr_reason !== null &&
      (typeof hr_reason !== "string" || hr_reason.trim().length > 500)
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "HR reason must be a string with a maximum of 500 characters",
      });
    }

    if (
      !paid_on ||
      !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(paid_on) ||
      !Number.isFinite(Date.parse(`${paid_on}T00:00:00Z`)) ||
      new Date(`${paid_on}T00:00:00Z`).toISOString().slice(0, 10) !== paid_on
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid paid date in YYYY-MM-DD format is required",
      });
    }

    const employeeId = Number(employee_id);
    const workingDays = Number(working_days);
    const daysPresent = Number(days_present);
    const lopDays = Number(lop_days);
    const grossAmount = Number(Number(gross_amount).toFixed(2));
    const deductionAmount = Number(Number(deductions).toFixed(2));
    const netAmount = Number((grossAmount - deductionAmount).toFixed(2));
    const hrReason = hr_reason === null ? null : hr_reason.trim() || null;

    const employeeResult = await pool.query(
      `SELECT employee_id
       FROM tbl_employee
       WHERE employee_id = $1`,
      [employeeId]
    );

    if (employeeResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: `Employee with ID ${employeeId} not found`,
      });
    }

    const salaryResult = await pool.query(
      `SELECT annual_ctc
       FROM tbl_employee_salary
       WHERE employee_id = $1
         AND effective_date <= $2::date
       ORDER BY effective_date DESC
       LIMIT 1`,
      [employeeId, salary_month]
    );

    if (
      salaryResult.rowCount === 0 ||
      salaryResult.rows[0].annual_ctc == null
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: `Annual CTC not found for employee ID ${employeeId} for the selected salary month`,
      });
    }

    const annualCtc = Number(salaryResult.rows[0].annual_ctc);

    const result = await pool.query(
      `INSERT INTO tbl_salary_payment (
        employee_id,
        salary_month,
        working_days,
        days_present,
        lop_days,
        annual_ctc,
        gross_amount,
        deductions,
        net_amount,
        hr_reason,
        status,
        paid_on
      )
      VALUES (
        $1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, 'PAID', $11
      )
      RETURNING *`,
      [
        employeeId,
        salary_month,
        workingDays,
        daysPresent,
        lopDays,
        annualCtc,
        grossAmount,
        deductionAmount,
        netAmount,
        hrReason,
        paid_on,
      ]
    );

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Employee salary credited successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error crediting employee salary:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        statusCode: 409,
        message: `Salary payment already exists for employee ID ${employee_id} for the selected month`,
      });
    }

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal server error",
    });
  }
};




const yearlyLeaveEntitlement = (selectedMonth) => {
  const [year, month] = selectedMonth.split("-").map(Number);
  const financialYearStartYear = month < 4 ? year - 1 : year;

  const monthsElapsed =
    (year - financialYearStartYear) * 12 + month - 3;

  return Math.max(0, Math.min(monthsElapsed, 12));
};



exports.getEmployeeSalaryDetailsByMonth = async (req, res) => {
  const { employee_id, month } = req.query;

  try {
    if (!/^[1-9]\d*$/.test(employee_id || "")) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid month in YYYY-MM format is required",
      });
    }

    const employeeId = Number(employee_id);
    const salaryMonth = `${month}-01`;

    const employeeResult = await pool.query(
      `SELECT employee_id, employee_name, joining_date
       FROM tbl_employee
       WHERE employee_id = $1
         AND status = 'Active'`,
      [employeeId]
    );

    if (employeeResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: `Employee with ID ${employeeId} not found`,
      });
    }

    const employee = employeeResult.rows[0];

    if (
      employee.joining_date &&
      new Date(employee.joining_date) >= new Date(`${month}-01T00:00:00`)
    ) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Selected month must be after the employee's joining date",
      });
    }

    const [
      workingDaysResult,
      presentDaysResult,
      leavesResult,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS working_days
        FROM generate_series(
          $1::date,
          LEAST(
            ($1::date + INTERVAL '1 month - 1 day')::date,
            CURRENT_DATE
          ),
          INTERVAL '1 day'
        ) AS d(day)
        WHERE EXTRACT(ISODOW FROM d.day) <> 7
          AND NOT EXISTS (
            SELECT 1
            FROM tbl_event ev
            WHERE ev.event_date = d.day::date
              AND LOWER(TRIM(ev.event_type)) = 'holiday'
          )`,
        [salaryMonth]
      ),

      pool.query(
        `SELECT COUNT(DISTINCT attendance_date)::int AS present_days
         FROM tbl_daily_attendance
         WHERE employee_id = $1
           AND attendance_date >= $2::date
           AND attendance_date < ($2::date + INTERVAL '1 month')
           AND status IN ('Present', 'Late')`,
        [employeeId, salaryMonth]
      ),

      pool.query(
        `SELECT COALESCE(
           SUM(
             CASE
               WHEN from_date::date >= $2::date
                AND to_date::date < ($2::date + INTERVAL '1 month')
               THEN duration::numeric
               ELSE
                 duration::numeric
                 * (
                   LEAST(
                     to_date::date,
                     ($2::date + INTERVAL '1 month - 1 day')::date
                   )
                   - GREATEST(from_date::date, $2::date)
                   + 1
                 )
                 / (to_date::date - from_date::date + 1)
             END
           ),
           0
         ) AS leaves_taken
         FROM tbl_leaves
         WHERE employee_id = $1
           AND status = 'Approved'
           AND from_date::date < ($2::date + INTERVAL '1 month')
           AND to_date::date >= $2::date`,
        [employeeId, salaryMonth]
      ),
    ]);

    const TotalLeavesResult = await pool.query(
      `SELECT COALESCE(
     SUM(
       duration::numeric
       * (
           LEAST(
             to_date::date,
             LEAST(
               ($1::date + INTERVAL '1 month - 1 day')::date,
               CURRENT_DATE
             )
           )
           - GREATEST(
               from_date::date,
               make_date(
                 EXTRACT(YEAR FROM $1::date)::int
                   - CASE
                       WHEN EXTRACT(MONTH FROM $1::date) < 4 THEN 1
                       ELSE 0
                     END,
                 4,
                 1
               )
             )
           + 1
         )::numeric
       / NULLIF((to_date::date - from_date::date + 1), 0)
     ),
     0
   ) AS leaves_taken
   FROM tbl_leaves
   WHERE employee_id = $2
     AND status = 'Approved'
     AND from_date::date <= LEAST(
       ($1::date + INTERVAL '1 month - 1 day')::date,
       CURRENT_DATE
     )
     AND to_date::date >= make_date(
       EXTRACT(YEAR FROM $1::date)::int
         - CASE
             WHEN EXTRACT(MONTH FROM $1::date) < 4 THEN 1
             ELSE 0
           END,
       4,
       1
     )`,
      [salaryMonth, employeeId]
    );

    const salaryResult = await pool.query(
      `SELECT gross_salary, annual_ctc
      FROM tbl_employee_salary
      WHERE employee_id = $1
      ORDER BY effective_date DESC, salary_id DESC
      LIMIT 1`,
      [employeeId]
    );

    const currentCtc = salaryResult.rowCount
      ? Number(salaryResult.rows[0].gross_salary)
      : 0;

    const annualCtc = salaryResult.rowCount
      ? Number(salaryResult.rows[0].annual_ctc)
      : 0;

    const totalLeavesTaken = Number(TotalLeavesResult.rows[0].leaves_taken);

    const leaveEntitlement = yearlyLeaveEntitlement(month);


    const workingDays = workingDaysResult.rows[0].working_days;
    const presentDays = presentDaysResult.rows[0].present_days;
    const leavesTaken = Number(leavesResult.rows[0].leaves_taken);
    const absentDays = Math.max(workingDays - presentDays, 0);

    const lopDaysBeforeHR = Math.max(
      absentDays - Math.max(leaveEntitlement - leavesTaken, 0),
      0
    );

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Employee attendance details retrieved successfully",
      data: {
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        month,
        current_ctc: currentCtc,
        annual_ctc: annualCtc,
        working_days: workingDays,
        present_days: presentDays,
        absent_days: absentDays,
        leaves_taken: leavesTaken,
        total_leaves_taken: totalLeavesTaken,
        available_leaves: 12 - totalLeavesTaken,
        lop_days_before_hr: lopDaysBeforeHR
      },
    });
  } catch (error) {
    console.error("Error fetching employee salary details:", error);

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal server error",
    });
  }
};



exports.getEmployeeSalaryPayments = async (req, res) => {
  const { employee_id } = req.params;

  try {
    if (!/^[1-9]\d*$/.test(employee_id || "")) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid employee ID is required",
      });
    }

    const employeeId = Number(employee_id);

    const employeeResult = await pool.query(
      `SELECT employee_id, employee_name, emp_code
       FROM tbl_employee
       WHERE employee_id = $1`,
      [employeeId]
    );

    if (employeeResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: `Employee with ID ${employeeId} not found`,
      });
    }

    const result = await pool.query(
      `SELECT
         payment_id,
         employee_id,
         TO_CHAR(salary_month, 'YYYY-MM') AS salary_month,
         working_days,
         days_present,
         leaves_taken,
         available_leaves,
         lop_days,
         annual_ctc,
         gross_amount,
         deductions,
         net_amount,
         status,
         hr_reason,
         TO_CHAR(paid_on, 'YYYY-MM-DD') AS paid_on
       FROM tbl_salary_payment
       WHERE employee_id = $1
       ORDER BY salary_month DESC`,
      [employeeId]
    );

    const statistics = {
      net_salary: result.rows.reduce(
        (total, payment) => total + Number(payment.net_amount || 0),
        0
      ),
      paid_leaves: result.rows.reduce(
        (total, payment) => total + Number(payment.leaves_taken || 0),
        0
      ),
      lop_days: result.rows.reduce(
        (total, payment) => total + Number(payment.lop_days || 0),
        0
      ),
      deductions: result.rows.reduce(
        (total, payment) => total + Number(payment.deductions || 0),
        0
      ),
    };

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Employee salary payment details fetched successfully",
      data: {
        employee: employeeResult.rows[0],
        statistics,
        total_payments: result.rowCount,
        payments: result.rows,
      },
    });
  } catch (error) {
    console.error("Get Employee Salary Payments Error:", error);

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal server error",
    });
  }
};




exports.getEmployeeSalaryPaymentById = async (req, res) => {
  const { payment_id } = req.params;

  try {
    if (!/^[1-9]\d*$/.test(payment_id || "")) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Valid payment ID is required",
      });
    }

    const paymentId = Number(payment_id);

    const result = await pool.query(
      `SELECT
         sp.payment_id,
         sp.employee_id,
         e.employee_name,
         e.emp_code,
         e.email,
         e.mobile_number,

         TO_CHAR(sp.salary_month, 'YYYY-MM') AS salary_month,
         sp.working_days,
         sp.days_present,
         sp.leaves_taken,
         sp.available_leaves,
         sp.lop_days,
         sp.annual_ctc,
         sp.gross_amount,
         sp.deductions,
         sp.net_amount,
         sp.status,
         sp.hr_reason,
         TO_CHAR(sp.paid_on, 'YYYY-MM-DD') AS paid_on,

         (
           SELECT json_build_object(
             'account_holder_name', b.account_holder_name,
             'bank_name', b.bank_name,
             'account_number', b.account_number,
             'ifsc_code', b.ifsc_code,
             'branch_name', b.branch_name
           )
           FROM tbl_employee_bank_details b
           WHERE b.employee_id = e.employee_id
           LIMIT 1
         ) AS bank_details,

         (
           SELECT json_build_object(
             'basic_salary', s.basic_salary,
             'hra', s.hra,
             'other_allowances', s.other_allowances,
             'pf', s.pf_deduction,
             'travel_allowance', s.travel_allowance,
             'professional_tax', s.professional_tax,
             'other_deductions', s.other_deductions,
             'gross_salary', s.gross_salary,
             'total_deductions', s.total_deductions,
             'net_salary', s.net_salary,
             'annual_ctc', s.annual_ctc,
             'effective_date', TO_CHAR(s.effective_date, 'YYYY-MM-DD')
           )
           FROM tbl_employee_salary s
           WHERE s.employee_id = e.employee_id
             AND s.effective_date <= sp.salary_month
           ORDER BY s.effective_date DESC
           LIMIT 1
         ) AS salary_details

       FROM tbl_salary_payment sp
       JOIN tbl_employee e
         ON e.employee_id = sp.employee_id
       WHERE sp.payment_id = $1`,
      [paymentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: `Salary payment with ID ${paymentId} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Employee salary payment details fetched successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get Employee Salary Payment By ID Error:", error);

    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal server error",
    });
  }
};

