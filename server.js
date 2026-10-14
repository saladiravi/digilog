require('dotenv').config();
const express = require("express");
const path = require("path");
const cors = require("cors");

const departmentroutes = require('./routes/departmentroutes');
const employeeroutes = require('./routes/employeeroutes');
const deviceroutes = require('./routes/deviceroutes');
const userroutes = require('./routes/userroutes');
const attendenceroutes = require('./routes/attendenceroutes');
const dashbboardroutes = require('./routes/dashboardsroutes');
const admsRoutes = require('./routes/adms');
const shiftroutes = require('./routes/shiftsroutes');
const leaveroutes = require('./routes/leaveroutes');
const eventroutes = require('./routes/eventroutes');
const expenditures = require('./routes/expenditureroutes');



const app = express();

app.get("/", (_, res) => {
  return res.status(200).json({
    status: true,
    statusCode: 200,
    message: " Server is up and running",
    data: null
  })
})

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use(cors());


app.use('/department', departmentroutes);
app.use('/employee', employeeroutes);
app.use('/device', deviceroutes);
app.use('/user', userroutes);
app.use('/attendence', attendenceroutes);
app.use('/dashboard', dashbboardroutes);
app.use(admsRoutes);
app.use('/shift', shiftroutes);
app.use('/leave', leaveroutes);
app.use('/event', eventroutes);
app.use('/expenditure', expenditures);

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});


app.listen(5000, "0.0.0.0", () => {
  console.log("Server is running on port 5000");
});
