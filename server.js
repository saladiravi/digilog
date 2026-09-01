require('dotenv').config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const cron = require('node-cron');
const { syncAttendanceFromDevice } = require('./controller/attendencecontroller');


const departmentroutes=require('./routes/departmentroutes');
const employeeroutes=require('./routes/employeeroutes');
const deviceroutes=require('./routes/deviceroutes');
const userroutes=require('./routes/userroutes');
const attendenceroutes=require('./routes/attendenceroutes');
const dashbboardroutes=require('./routes/dashboardsroutes');
const admsRoutes = require('./routes/adms');

const app = express();
 
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); 
app.use(express.json());
app.use(cors()); 


app.use('/department',departmentroutes);
app.use('/employee',employeeroutes);
app.use('/device', deviceroutes);
app.use('/user',userroutes);
app.use('/attendence',attendenceroutes);
app.use('/dashboard',dashbboardroutes);
app.use(admsRoutes);

cron.schedule('0 12 * * *', () => {
  console.log('⏰ Running scheduled sync — 12:00 PM');
  syncAttendanceFromDevice().catch(err => console.error('Cron sync failed:', err.message));
});

// 8:00 PM (night)
cron.schedule('0 20 * * *', () => {
  console.log('⏰ Running scheduled sync — 8:00 PM');
  syncAttendanceFromDevice().catch(err => console.error('Cron sync failed:', err.message));
});

app.listen(5000, "0.0.0.0", () => {
  console.log("Server is running on port 5000");
  
});
