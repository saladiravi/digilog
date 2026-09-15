const pool = require("../config/db");

// CREATE EXPENDITURE
exports.addExpenditure = async (req, res) => {
    const { title, amount, payment_method, date, purpose } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO tbl_expenditure
            (title, amount, payment_method, date, purpose)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [title, amount, payment_method, date, purpose]
        );

        return res.status(201).json({
            statusCode: 201,
            message: "Expenditure added successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal server error"
        });
    }
};


// GET ALL EXPENDITURES
exports.getExpenditures = async (req, res) => {

    try {
        const result = await pool.query(
            `SELECT *
             FROM tbl_expenditure
             ORDER BY expenditure_id DESC`
        );

        return res.status(200).json({
            statusCode: 200,
            message: "Expenditures fetched successfully",
            data: result.rows
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal server error"
        });
    }
};


// GET SINGLE EXPENDITURE
exports.getExpenditureById = async (req, res) => {

    const { expenditure_id } = req.params;

    try {
        const result = await pool.query(
            `SELECT *
             FROM tbl_expenditure
             WHERE expenditure_id = $1`,
            [expenditure_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: "Expenditure not found"
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: "Expenditure fetched successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal server error"
        });
    }
};


// UPDATE EXPENDITURE
exports.updateExpenditure = async (req, res) => {

    const { expenditure_id } = req.params;
    const { title, amount, payment_method, date, purpose } = req.body;

    try {
        const result = await pool.query(
            `UPDATE tbl_expenditure
             SET title = $1,
                 amount = $2,
                 payment_method = $3,
                 date = $4,
                 purpose = $5
             WHERE expenditure_id = $6
             RETURNING *`,
            [title, amount, payment_method, date, purpose, expenditure_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: "Expenditure not found"
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: "Expenditure updated successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal server error"
        });
    }
};


// DELETE EXPENDITURE
exports.deleteExpenditure = async (req, res) => {

    const { expenditure_id } = req.params;

    try {
        const result = await pool.query(
            `DELETE FROM tbl_expenditure
             WHERE expenditure_id = $1
             RETURNING *`,
            [expenditure_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: "Expenditure not found"
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: "Expenditure deleted successfully"
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: "Internal server error"
        });
    }
};