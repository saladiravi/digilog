// routes/deviceroutes.js
const express = require('express');
const router = express.Router();
const deviceController = require('../controller/devicecontroller');

router.post('/enroll', deviceController.enrollEmployee);
router.post('/confirm-enrollment', deviceController.confirmEnrollment);
router.post('/sync-attendance', deviceController.syncAttendance);
router.get('/attendance-logs', deviceController.getAttendanceLogs);
router.post('/attendance-raw', deviceController.getRawAttendance);

router.post('/add-user', deviceController.addDeviceUserRaw);
 
router.post('/users-raw', deviceController.getRawUsers);

router.post('/enroll-finger', deviceController.enrollFingerprintRaw);
router.post('/check-fingerprint', deviceController.checkFingerprintRaw);
router.post('/addemployeewithdevice', deviceController.addEmployeeWithDevice);


module.exports = router;