const express = require('express');
const router = express.Router();
const shiftController = require('../controller/shiftscontroller');
const { verifyToken } = require('../middleware/authMiddleware');

router.post("/addshifts", shiftController.addShift);

router.get("/getshifts", shiftController.getShifts);

router.get("/shifts/:id", shiftController.getShiftById);

router.put("/updateshifts/:id", shiftController.updateShift);

router.delete("/deleteshifts/:id", shiftController.deleteShift);


module.exports=router