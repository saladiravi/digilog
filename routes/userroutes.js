const express = require('express');
const router = express.Router();
const usercontroller=require('../controller/usercontroller');


router.post('/register',usercontroller.registerAdmin);
router.post('/login',usercontroller.loginAdmin);
router.post('/loginemployee',usercontroller.employeeLogin);


module.exports=router