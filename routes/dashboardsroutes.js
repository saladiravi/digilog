const express = require('express');
const routes = express.Router();
const dashboardcontroller = require('../controller/dashboardcontroller');
  

routes.get('/getdashboard', dashboardcontroller.getDashboardData);
routes.get('/reports', dashboardcontroller.getAttendanceReport);
routes.get('/attendencehistory',dashboardcontroller.getAttendanceTable);



module.exports=routes