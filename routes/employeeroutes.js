const express = require('express');
const router = express.Router();
const employeeController = require('../controller/employeecontroller');

router.post('/add-employee-with-device', employeeController.addEmployeeWithDevice);
router.put('/edit-employee-with-device/:employee_id', employeeController.editEmployeeWithDevice);
router.delete('/delete-employee-with-device/:employee_id', employeeController.deleteEmployeeWithDevice);
router.post('/enroll-finger', employeeController.enrollFingerprintRaw);
router.post('/confirm-enrollment', employeeController.confirmEnrollment);
router.post('/sync-attendance', employeeController.syncAttendance);
router.get('/attendance-logs', employeeController.getAttendanceLogs);

module.exports = router;