const pool=require('../config/db');


 
exports.applyleave = async (req, res) => {
    const {
        employee_id,
        from_date,
        to_date,
        leave_type,
        duration,
        description
    } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO tbl_leaves
            (employee_id, from_date, to_date, leave_type, duration, description, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                employee_id,
                from_date,
                to_date,
                leave_type,
                duration,
                description,
                'Pending'
            ]
        );

        return res.status(200).json({
            statusCode: 200,
            message: 'Leave applied successfully',
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
 


 
exports.approvelleave = async (req, res) => {
    const { leave_id, status } = req.query;

    try {
        // Validate status
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({
                statusCode: 400,
                message: 'Status must be Approved or Rejected'
            });
        }

        const result = await pool.query(
            `UPDATE tbl_leaves
             SET status = $1
             WHERE leave_id = $2
             RETURNING *`,
            [status, leave_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: 'Leave request not found'
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: `Leave ${status.toLowerCase()} successfully`,
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
 



 
exports.getleavesbyemployee = async (req, res) => {
    const { employee_id } = req.query;

    try {
        // Check employee exists
        const employee = await pool.query(
            `SELECT employee_id
             FROM tbl_employee
             WHERE employee_id = $1`,
            [employee_id]
        );

        if (employee.rowCount === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: 'Employee Not Found'
            });
        }

        // Leave counts
        const dashboardcount = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'Approved') AS consumed_leaves,
                COUNT(*) FILTER (WHERE status = 'Pending') AS pending_requests
             FROM tbl_leaves
             WHERE employee_id = $1`,
            [employee_id]
        );

        const consumedLeaves =
            parseInt(dashboardcount.rows[0].consumed_leaves) || 0;

        const pendingRequests =
            parseInt(dashboardcount.rows[0].pending_requests) || 0;

        // Total leaves assigned to employee
        const totalLeaves = 12;

        // Available leaves
        const availableLeaves = totalLeaves - consumedLeaves;

        // Employee leave history
        const leave = await pool.query(
            `SELECT *
             FROM tbl_leaves
             WHERE employee_id = $1
             ORDER BY from_date DESC`,
            [employee_id]
        );

        return res.status(200).json({
            statusCode: 200,
            message: 'Leaves Fetched Successfully',

            dashboard: {
                total_leaves: totalLeaves,
                available_leaves: availableLeaves,
                pending_requests: pendingRequests,
                consumed_leaves: consumedLeaves
            },

            leaves: leave.rows
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};
 



 
exports.getleaves = async (req, res) => {
    try {

        // -----------------------------
        // Dashboard Counts
        // -----------------------------
        const countQuery = `
            SELECT 
                COUNT(*) AS total_requests,

                COUNT(*) FILTER (
                    WHERE tl.status = 'Pending'
                ) AS pending_approvals,

                COUNT(*) FILTER (
                    WHERE tl.status = 'Approved'
                ) AS approved_leaves,

                COUNT(*) FILTER (
                    WHERE tl.status = 'Rejected'
                ) AS rejected_leaves

            FROM tbl_leaves tl
        `;

        const countResult = await pool.query(countQuery);


        // -----------------------------
        // Leave Details
        // -----------------------------
        const leaveQuery = `
            SELECT 
                tl.leave_id,
                tl.employee_id,

                te.employee_name,
                te.emp_code,
                te.department_id,

                tl.leave_type,
                tl.duration,
                tl.from_date,
                tl.to_date,
                tl.description,
                tl.status,
                tl.created_at

            FROM tbl_leaves tl

            INNER JOIN tbl_employee te
                ON tl.employee_id = te.employee_id

            ORDER BY tl.created_at DESC
        `;

        const leaveResult = await pool.query(leaveQuery);


        // -----------------------------
        // Response
        // -----------------------------
        return res.status(200).json({
            statusCode: 200,
            message: 'Leave data fetched successfully',

            dashboard: {
                total_requests:
                    parseInt(countResult.rows[0].total_requests) || 0,

                pending_approvals:
                    parseInt(countResult.rows[0].pending_approvals) || 0,

                approved_leaves:
                    parseInt(countResult.rows[0].approved_leaves) || 0,

                rejected_leaves:
                    parseInt(countResult.rows[0].rejected_leaves) || 0
            },

            leaves: leaveResult.rows
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};
 


