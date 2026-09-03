const pool = require('../config/db');

exports.getDashboardData = async (req, res) => {
    try {
        const [
            totalResult,
            presentResult,
            lateResult,
            weeklyResult,
            deptStrengthResult,
            punchActivityResult,
            deptOverviewResult
        ] = await Promise.all([
            // Total active employees
            pool.query(`SELECT COUNT(*) AS total FROM tbl_employee WHERE status = 'Active'`),

            // Present today
            pool.query(
                `SELECT COUNT(DISTINCT employee_id) AS present
                 FROM tbl_daily_attendance
                 WHERE attendance_date = CURRENT_DATE`
            ),

            // Late today
            pool.query(
                `SELECT COUNT(DISTINCT employee_id) AS late
                 FROM tbl_daily_attendance
                 WHERE attendance_date = CURRENT_DATE AND is_late = true`
            ),

            // Weekly trend (last 7 days)
            pool.query(
                `SELECT
                    attendance_date,
                    COUNT(DISTINCT employee_id) FILTER (WHERE is_late = true) AS late,
                    COUNT(DISTINCT employee_id) AS present
                 FROM tbl_daily_attendance
                 WHERE attendance_date >= CURRENT_DATE - INTERVAL '6 days'
                   AND attendance_date <= CURRENT_DATE
                 GROUP BY attendance_date
                 ORDER BY attendance_date ASC`
            ),

            // Department-wise strength
            pool.query(
                `SELECT d.department_id, d.department_name AS department_name,
                        COUNT(e.employee_id) AS employee_count
                 FROM tbl_department d
                 LEFT JOIN tbl_employee e
                   ON e.department_id = d.department_id AND e.status = 'Active'
                 GROUP BY d.department_id, d.department_name
                 ORDER BY employee_count DESC`
            ),

            // Today's punch activity (live feed)
            pool.query(
                `SELECT e.employee_id, e.employee_name, d.department_name AS department_name,
                        a.punch_in, a.is_late
                 FROM tbl_daily_attendance a
                 JOIN tbl_employee e ON e.employee_id = a.employee_id
                 JOIN tbl_department d ON d.department_id = e.department_id
                 WHERE a.attendance_date = CURRENT_DATE
                 ORDER BY a.punch_in DESC
                 LIMIT 10`
            ),

            // Departments overview (head + count)
            pool.query(
                `SELECT d.department_id, d.department_name AS department_name, d.department_head,
                        COUNT(e.employee_id) AS employee_count
                 FROM tbl_department d
                 LEFT JOIN tbl_employee e
                   ON e.department_id = d.department_id AND e.status = 'Active'
                 GROUP BY d.department_id, d.department_name, d.department_head
                 ORDER BY d.department_name ASC`
            )
        ]);

        // ── Summary cards ──
        const total = parseInt(totalResult.rows[0].total, 10);
        const present = parseInt(presentResult.rows[0].present, 10);
        const late = parseInt(lateResult.rows[0].late, 10);
        const absent = total - present;

        // ── Weekly trend: fill all 7 days even if some have zero data ──
        const trendMap = {};
        weeklyResult.rows.forEach(row => {
            const dateKey = row.attendance_date.toISOString().split('T')[0];
            trendMap[dateKey] = {
                present: parseInt(row.present, 10),
                late: parseInt(row.late, 10)
            };
        });

        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            const dayData = trendMap[dateKey] || { present: 0, late: 0 };

            weeklyTrend.push({
                date: dateKey,
                day: d.toLocaleDateString('en-US', { weekday: 'short' }),
                present: dayData.present,
                late: dayData.late,
                absent: total - dayData.present
            });
        }

        // ── Department strength ──
        const departmentStrength = deptStrengthResult.rows.map(row => ({
            department: row.department_name,
            count: parseInt(row.employee_count, 10)
        }));

        // ── Punch activity ──
        const punchActivity = punchActivityResult.rows.map(row => {
            const initials = row.employee_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

            return {
                employeeId: row.employee_id,
                employeeName: row.employee_name,
                initials,
                department: row.department_name,
                punchInTime: new Date(row.punch_in).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }),
                status: row.is_late ? 'Late' : 'On Time'
            };
        });

        // ── Departments overview ──
        const departmentsOverview = deptOverviewResult.rows.map(row => ({
            departmentId: row.department_id,
            departmentName: row.department_name,
            head: row.head_name,
            employeeCount: parseInt(row.employee_count, 10)
        }));

        return res.status(200).json({
            statusCode: 200,
            data: {
                summary: {
                    totalEmployees: total,
                    presentToday: present,
                    absentToday: absent < 0 ? 0 : absent,
                    lateArrivals: late
                },
                weeklyTrend,
                departmentStrength,
                punchActivity,
                departmentsOverview
            }
        });

    } catch (error) {
        console.error('Dashboard Data Error:', error);
        return res.status(500).json({ statusCode: 500, message: 'Internal server error' });
    }
};



 
exports.getAttendanceReport = async (req, res) => {
    try {
        const {
            date,            // 'YYYY-MM-DD' — single day filter
            month,           // 'YYYY-MM' — whole month filter
            employee_id,     // filter by specific employee
            search           // employee name search
        } = req.query;

        // ── Resolve date range ──
        let startDate, endDate;

        if (date) {
            startDate = date;
            endDate = date;
        } else if (month) {
            startDate = `${month}-01`;
            const [y, m] = month.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
        } else {
            const today = new Date().toISOString().split('T')[0];
            startDate = today;
            endDate = today;
        }

        // const totalDays =
        //     (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
let totalDays =
    (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;

// Do not count future days as absent
const today = new Date().toISOString().split('T')[0];

if (endDate > today) {
    const effectiveEndDate = today;

    if (startDate <= effectiveEndDate) {
        totalDays =
            (new Date(effectiveEndDate) - new Date(startDate)) /
                (1000 * 60 * 60 * 24) +
            1;
    } else {
        totalDays = 0;
    }
}
        // ── Employee-only filters (employee_id, search) — used standalone, no date params ──
        const employeeFilters = [`e.status = 'Active'`];
        const employeeParams = [];
        let empParamIndex = 1;

        if (employee_id) {
            employeeFilters.push(`e.employee_id = $${empParamIndex}`);
            employeeParams.push(employee_id);
            empParamIndex++;
        }

        if (search) {
            employeeFilters.push(`e.employee_name ILIKE $${empParamIndex}`);
            employeeParams.push(`%${search}%`);
            empParamIndex++;
        }

        const employeeWhere = employeeFilters.join(' AND ');

        // ── Filters again but offset by 2, for queries that ALSO take $1/$2 as date range ──
        const employeeFiltersWithDate = [`e.status = 'Active'`];
        const dateAndEmployeeParams = [startDate, endDate];
        let combinedIndex = 3;

        if (employee_id) {
            employeeFiltersWithDate.push(`e.employee_id = $${combinedIndex}`);
            dateAndEmployeeParams.push(employee_id);
            combinedIndex++;
        }

        if (search) {
            employeeFiltersWithDate.push(`e.employee_name ILIKE $${combinedIndex}`);
            dateAndEmployeeParams.push(`%${search}%`);
            combinedIndex++;
        }

        const employeeWhereWithDate = employeeFiltersWithDate.join(' AND ');

        // ── Summary cards (Present / Absent / Late / Total Hours) ──
        const summaryQuery = `
            WITH day_agg AS (
                SELECT
                    a.employee_id,
                    a.attendance_date,
                    MIN(a.punch_in) AS first_in,
                    SUM(
                        CASE WHEN a.punch_out IS NOT NULL
                             THEN EXTRACT(EPOCH FROM (a.punch_out - a.punch_in)) / 3600.0
                             ELSE 0 END
                    ) AS hours
                FROM tbl_daily_attendance a
                JOIN tbl_employee e ON e.employee_id = a.employee_id
                WHERE a.attendance_date BETWEEN $1 AND $2
                  AND ${employeeWhereWithDate}
                GROUP BY a.employee_id, a.attendance_date
            )
            SELECT
                COUNT(*) AS present_days,
                COUNT(*) FILTER (
                    WHERE first_in::time > '09:30:00'::time
                ) AS late_days,
                COALESCE(SUM(hours), 0) AS total_hours
            FROM day_agg
        `;

        const summaryResult = await pool.query(summaryQuery, dateAndEmployeeParams);
        const presentDays = parseInt(summaryResult.rows[0].present_days, 10);
        const lateDays = parseInt(summaryResult.rows[0].late_days, 10);
        const totalHours = parseFloat(summaryResult.rows[0].total_hours);

        // ── Total active employees matching filters (no date params needed) ──
        const totalEmployeesResult = await pool.query(
            `SELECT COUNT(*) AS cnt FROM tbl_employee e WHERE ${employeeWhere}`,
            employeeParams
        );
        const totalEmployees = parseInt(totalEmployeesResult.rows[0].cnt, 10);
        const totalPossibleDays = totalEmployees * totalDays;
        const absentDays = totalPossibleDays - presentDays;

        // ── Per-employee table (no pagination — frontend handles it) ──
        const tableQuery = `
            WITH day_agg AS (
                SELECT
                    a.employee_id,
                    a.attendance_date,
                    MIN(a.punch_in) AS first_in,
                    SUM(
                        CASE WHEN a.punch_out IS NOT NULL
                             THEN EXTRACT(EPOCH FROM (a.punch_out - a.punch_in)) / 3600.0
                             ELSE 0 END
                    ) AS hours
                FROM tbl_daily_attendance a
                WHERE a.attendance_date BETWEEN $1 AND $2
                GROUP BY a.employee_id, a.attendance_date
            ),
            per_employee AS (
                SELECT
                    e.employee_id,
                    e.employee_name,
                    d.department_name,
                    COUNT(da.attendance_date) AS present,
                    COUNT(da.attendance_date) FILTER (
                        WHERE da.first_in::time > '09:30:00'::time
                    ) AS late,
                    COALESCE(SUM(da.hours), 0) AS hours
                FROM tbl_employee e
                JOIN tbl_department d ON d.department_id = e.department_id
                LEFT JOIN day_agg da ON da.employee_id = e.employee_id
                WHERE ${employeeWhereWithDate}
                GROUP BY e.employee_id, e.employee_name, d.department_name
            )
            SELECT *,
                   (${totalDays} - present) AS absent
            FROM per_employee
            ORDER BY employee_name ASC
        `;

        const tableResult = await pool.query(tableQuery, dateAndEmployeeParams);

        const employees = tableResult.rows.map(row => {
            const initials = row.employee_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

            const absent = parseInt(row.absent, 10);

            return {
                employeeId: row.employee_id,
                employeeName: row.employee_name,
                initials,
                department: row.department_name,
                present: parseInt(row.present, 10),
                late: parseInt(row.late, 10),
                absent: absent < 0 ? 0 : absent,
                hours: parseFloat(row.hours).toFixed(1)
            };
        });

        return res.status(200).json({
            statusCode: 200,
            data: {
                filters: { startDate, endDate, employee_id: employee_id || null, search: search || null },
                summary: {
                    present: presentDays,
                    absent: absentDays < 0 ? 0 : absentDays,
                    late: lateDays,
                    totalWorkingHours: totalHours.toFixed(1)
                },
                employees
            }
        });

    } catch (error) {
        console.error('Attendance Report Error:', error);
        return res.status(500).json({ statusCode: 500, message: 'Internal server error' });
    }
};


exports.getAttendanceTable = async (req, res) => {
  try {
    const { search, status, from_date, to_date, employee_id } = req.query;

    // default to today if no date range given at all
    const today = new Date().toISOString().split('T')[0];
    const startDate = from_date || today;
    const endDate = to_date || today;

    const filters = [`e.status = 'Active'`, `a.attendance_date BETWEEN $1 AND $2`];
    const params = [startDate, endDate];
    let idx = 3;

    if (employee_id) {
      filters.push(`e.employee_id = $${idx}`);
      params.push(employee_id);
      idx++;
    }

    if (search) {
      filters.push(`e.employee_name ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }

    if (status) {
      filters.push(`a.status = $${idx}`);
      params.push(status); // 'Present' | 'Late' | 'Absent'
      idx++;
    }

    const query = `
      SELECT
        a.attendance_date,
        e.employee_id,
        e.employee_name,
        d.department_name,
        a.punch_in,
        a.punch_out,
        a.status,
        CASE
          WHEN a.punch_in IS NOT NULL AND a.punch_out IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a.punch_out - a.punch_in)) / 3600.0
          ELSE 0
        END AS working_hours
      FROM tbl_daily_attendance a
      JOIN tbl_employee e ON e.employee_id = a.employee_id
      LEFT JOIN tbl_department d ON d.department_id = e.department_id
      WHERE ${filters.join(' AND ')}
      ORDER BY a.attendance_date DESC, e.employee_name ASC
    `;

    const result = await pool.query(query, params);

    const rows = result.rows.map(row => {
      const initials = row.employee_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      const hours = parseFloat(row.working_hours) || 0;
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);

      return {
        date: row.attendance_date,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        initials,
        department: row.department_name,
        punchIn: row.punch_in,
        punchOut: row.punch_out,
        workingHours: `${h}h ${String(m).padStart(2, '0')}m`,
        status: row.status,
      };
    });

    return res.status(200).json({
      statusCode: 200,
      filters: { startDate, endDate, search: search || null, status: status || null, employee_id: employee_id || null },
      data: rows,
    });
  } catch (error) {
    console.error('Attendance Table Error:', error);
    return res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
};