const express = require("express");
const path = require("path");
const cors = require("cors");

const departmentroutes=require('./routes/departmentroutes');
const employeeroutes=require('./routes/employeeroutes');
const deviceroutes=require('./routes/deviceroutes');
const userroutes=require('./routes/userroutes');


const app = express();

app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); 
app.use(express.json());
app.use(cors()); 


app.use('/department',departmentroutes);
app.use('/employee',employeeroutes);
app.use('/device', deviceroutes);
app.use('/user',userroutes);


app.listen(5000, () => {
    console.log("Server is running on port 5000");
});
