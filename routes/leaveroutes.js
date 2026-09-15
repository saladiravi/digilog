const express=require('express');
const router=express.Router();
const leavecontroller=require('../controller/leavescontroller');

 
router.post('/applyleave', leavecontroller.applyleave);

router.get('/getleaves', leavecontroller.getleaves);

router.get('/getleavesbyemployee', leavecontroller.getleavesbyemployee);

router.put('/leavestatus', leavecontroller.approvelleave);
 



module.exports=router
