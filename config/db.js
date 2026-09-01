require('dotenv').config();
const Pool = require("pg").Pool;

const pool = new Pool({  
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, 
  },  
});

// ✅ SET TIMEZONE TO IST
pool.on('connect', async (client) => {
  try {
    await client.query("SET TIME ZONE 'Asia/Kolkata'");
  } catch (err) {
    console.error("Error setting timezone", err);
  }
});

console.log("Database URL:", process.env.DATABASE_URL);

module.exports = pool;