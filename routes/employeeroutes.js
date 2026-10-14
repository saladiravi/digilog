const express = require('express');
const router = express.Router();
const employeeController = require('../controller/employeecontroller');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken)

router.post('/addemployeewithdevice', employeeController.addEmployeeWithDevice);
router.put('/edit-employee-with-device/:employee_id', employeeController.editEmployeeWithDevice);
router.delete('/delete-employee-with-device/:employee_id', employeeController.deleteEmployeeWithDevice);
router.get('/getEmployees', employeeController.getEmployeeDashboardCounts);
router.get("/:employee_id", employeeController.getEmployeeById);
router.put("/:employee_id/bank-details", employeeController.updateEmployeeBankDetails);


module.exports = router;