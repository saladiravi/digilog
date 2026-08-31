// routes/deviceroutes.js
const express = require('express');
const router = express.Router();
const deviceController = require('../controller/devicecontroller');
 

router.post('/enroll-finger', deviceController.enrollFingerprintRaw);
router.post('/confirm-enrollment', deviceController.confirmEnrollment);


module.exports = router;