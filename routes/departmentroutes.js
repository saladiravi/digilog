const express = require('express');
const routes = express.Router();
const departmentcontroller = require('../controller/departmentcontroller');

 
routes.post('/adddepartment', departmentcontroller.adddepartment);
routes.get('/getdepartments', departmentcontroller.getdepartments);
routes.get('/getdepartment/:department_id', departmentcontroller.getdepartmentbyid);
routes.put('/updatedepartment/:department_id', departmentcontroller.updatedepartment);
routes.delete('/deletedepartment/:department_id', departmentcontroller.deletedepartment);

module.exports = routes;