const { Pool } = require('pg');
const pool = new Pool({
    user: 'digilog_db_ravq_user',
    host: 'dpg-da4ni7on74is73e520cg-a', // Adjust if connecting to a remote server
    database: 'digilog_db_ravq',
    password: 'iNlv365NeGQO7nubpHyfNK8zbjV2N7jm',
    port: 5432,  
});
pool.query('SET TIMEZONE = \'Asia/Kolkata\';')
  .then(() => console.log('Timezone set to Asia/Kolkata'))
  .catch((err) => console.error('Error setting timezone', err));

module.exports=pool