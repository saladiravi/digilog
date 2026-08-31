const pool = require('../config/db');

 
exports.adddepartment = async (req, res) => {
    const { department_name, department_head } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO tbl_department 
            (department_name, department_head) 
            VALUES ($1, $2)
            RETURNING *`,
            [department_name, department_head]
        );

        return res.status(201).json({
            statusCode: 201,
            message: 'Department added successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};


 
exports.getdepartments = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM tbl_department
             ORDER BY department_id DESC`
        );

        return res.status(200).json({
            statusCode: 200,
            message: 'Departments fetched successfully',
            data: result.rows
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};


 
exports.getdepartmentbyid = async (req, res) => {
    const { department_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT * FROM tbl_department
             WHERE department_id = $1`,
            [department_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: 'Department not found'
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: 'Department fetched successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};


 
exports.updatedepartment = async (req, res) => {
    const { department_id } = req.params;
    const { department_name, department_head } = req.body;

    try {
        const result = await pool.query(
            `UPDATE tbl_department
             SET department_name = $1,
                 department_head = $2
             WHERE department_id = $3
             RETURNING *`,
            [department_name, department_head, department_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: 'Department not found'
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: 'Department updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};


 
exports.deletedepartment = async (req, res) => {
    const { department_id } = req.params;

    try {
        const result = await pool.query(
            `DELETE FROM tbl_department
             WHERE department_id = $1
             RETURNING *`,
            [department_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: 'Department not found'
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: 'Department deleted successfully'
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};


 
exports.getDepartmentEmployeeCounts = async (req, res) => {
  try {
    const query = `
      SELECT
        d.department_id,
        d.department_name,
        d.department_head,
        COUNT(e.employee_id) AS total_employees,

        COUNT(
          CASE
            WHEN LOWER(e.status) = 'Active' THEN 1
          END
        ) AS active_employees,

        COUNT(
          CASE
            WHEN e.enrolled = true THEN 1
          END
        ) AS fingerprint_registered

      FROM tbl_department d

      LEFT JOIN tbl_employee e
        ON e.department_id = d.department_id

      GROUP BY
        d.department_id,
        d.department_name

      ORDER BY d.department_id DESC;
    `;

    const result = await pool.query(query);

    return res.status(200).json({
      statusCode: 200,
      message: "Department employee counts fetched successfully",
      data: result.rows
    });

  } catch (error) {
    console.error("Get department employee counts error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Failed to fetch department employee counts",
      error: error.message
    });
  }
};


exports.getEmployeesByDepartment = async (req, res) => {
  try {
    const { department_id } = req.params;

    const query = `
      SELECT
        e.*
      FROM tbl_employee e
      WHERE e.department_id = $1
      ORDER BY e.employee_id DESC
    `;

    const result = await pool.query(query, [department_id]);

    return res.status(200).json({
      success: true,
      message: "Employees fetched successfully",
      department_id: Number(department_id),
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    console.error("Get employees by department error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
      error: error.message
    });
  }
};