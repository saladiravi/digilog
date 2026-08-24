const express = require('express');
const router = express.Router();
const usercontroller=require('../controller/usercontroller');


router.post('/register',usercontroller.registerAdmin);
router.post('/login',usercontroller.loginAdmin);


module.exports=router