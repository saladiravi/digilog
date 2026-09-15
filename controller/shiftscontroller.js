const pool=require('../config/db');

exports.addShift = async (req, res) => {
    const { shift_type, start_time, end_time } = req.body;

    try {
        const query = `
            INSERT INTO tbl_shifts (shift_type, start_time, end_time)
            VALUES ($1, $2, $3)
            RETURNING *
        `;

        const result = await pool.query(query, [
            shift_type,
            start_time,
            end_time
        ]);

        return res.status(201).json({
            statusCode: 201,
            message: "Shift added successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal Server Error"
        });
    }
};


exports.getShifts = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *
            FROM tbl_shifts
            ORDER BY shift_id DESC
        `);

        return res.status(200).json({
            statusCode: 200,
            message: "Shifts fetched successfully",
            data: result.rows
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal Server Error"
        });
    }
};


exports.getShiftById = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT * FROM tbl_shifts WHERE shift_id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: "Shift not found"
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: "Shift fetched successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal Server Error"
        });
    }
};

exports.updateShift = async (req, res) => {
    const { id } = req.params;
    const { shift_type, start_time, end_time } = req.body;

    try {
        const result = await pool.query(
            `
            UPDATE tbl_shifts
            SET shift_type = $1,
                start_time = $2,
                end_time = $3
            WHERE shift_id = $4
            RETURNING *
            `,
            [shift_type, start_time, end_time, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: "Shift not found"
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: "Shift updated successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal Server Error"
        });
    }
};


exports.deleteShift = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `
            DELETE FROM tbl_shifts
            WHERE shift_id = $1
            RETURNING *
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: "Shift not found"
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: "Shift deleted successfully"
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal Server Error"
        });
    }
};