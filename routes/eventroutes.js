const express=require('express');
const router= express.Router();
const eventcontroller=require('../controller/eventcontroller');

router.post('/addevent', eventcontroller.addevent); 
router.get('/getevents', eventcontroller.getevents);
router.delete('/deleteevent', eventcontroller.deleteevent);



module.exports=router