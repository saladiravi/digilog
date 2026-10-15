require('dotenv').config();
const Pool = require("pg").Pool;

const { types } = require("pg");

// 1082 = DATE type OID
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
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