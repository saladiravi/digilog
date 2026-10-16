const express = require('express');
const router = express.Router();
const employeeController = require('../controller/employeecontroller');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken)

router.post('/addemployeewithdevice', employeeController.addEmployeeWithDevice);
router.post("/:employee_id/salary/credit", employeeController.creditEmployeeSalary);
// body: { "month": "2026-10" }
router.put('/edit-employee-with-device/:employee_id', employeeController.editEmployeeWithDevice);
router.delete('/delete-employee-with-device/:employee_id', employeeController.deleteEmployeeWithDevice);
router.get('/getEmployees', employeeController.getEmployeeDashboardCounts);
router.get("/list", employeeController.getEmployeeIdAndName);
router.get("/salary-details", employeeController.getEmployeesSalaryDetailsByMonth);
router.get("/:employee_id/salary-payments", employeeController.getEmployeeSalaryPayments);
router.get("/salary-payments/:payment_id", employeeController.getEmployeeSalaryPaymentById);

router.get("/salaries/details", employeeController.getEmployeeSalaryDetailsByMonth);
router.get("/:employee_id", employeeController.getEmployeeById);
router.put("/:employee_id/financial-details", employeeController.updateEmployeeBankDetails);

module.exports = router;