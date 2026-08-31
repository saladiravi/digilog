const express = require('express');
const routes = express.Router();
const attendancercontroller = require('../controller/attendencecontroller');

routes.get('/attendance-logs', attendancercontroller.getAttendanceLogs);
routes.get('/daily-attendance', attendancercontroller.getDailyAttendanceReport);
routes.post('/mark-absentees', attendancercontroller.markAbsentees);
routes.get('/monthlyattendance/:employee_id', attendancercontroller.getMonthlyAttendanceByEmployee);
module.exports = routes;
