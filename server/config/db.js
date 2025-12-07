const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); 

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'cinelibri_db',
    password: process.env.DB_PASSWORD || '1315',
    port: process.env.DB_PORT || 5432,
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Veritabanı Bağlantı Hatası!', err.stack);
    }
    console.log('PostgreSQL veritabanına başarılı bir şekilde bağlandı.');
    release();
});

module.exports = pool;