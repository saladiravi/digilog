const pool=require('../config/db');


exports.addevent = async (req, res) => {
    const {
        event_title,
        event_type,
        event_date,
        description,
        event_time
    } = req.body;

    try {
        const event = await pool.query(
            `INSERT INTO tbl_event
            (event_title, event_type, event_date, description, event_time)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [
                event_title,
                event_type,
                event_date,
                description,
                event_time
            ]
        );

        return res.status(200).json({
            statusCode: 200,
            message: 'Event Added Successfully',
            event: event.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};


exports.getevents = async (req, res) => {
    try {
        const events = await pool.query(
            `SELECT *
             FROM tbl_event
             ORDER BY event_date ASC, event_time ASC`
        );

        return res.status(200).json({
            statusCode: 200,
            message: 'Data Fetched Successfully',
            events: events.rows
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};


 
exports.deleteevent = async (req, res) => {
    const { event_id } = req.query;

    try {
        const event = await pool.query(
            `DELETE FROM tbl_event
             WHERE event_id = $1
             RETURNING *`,
            [event_id]
        );

        if (event.rowCount === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: 'Event Not Found'
            });
        }

        return res.status(200).json({
            statusCode: 200,
            message: 'Event Deleted Successfully',
            event: event.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error'
        });
    }
};
 