/**
 * @see https://github.com/mysqljs/mysql
 * @see https://github.com/mysqljs/mysql#pooling-connections (related to the pool)
 */

const util = require('util');
const mysql = require('mysql');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    supportBigNumbers: true
});

// Ping database to check for common exception errors.
pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed.')
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Database has too many connections.')
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('Database connection was refused.')
        }
    }

    if (connection) connection.release()

    return
});

// Promisify for Node.js async/await.
pool.query = util.promisify(pool.query);
pool.getConnection = util.promisify(pool.getConnection);

pool.createConnection = async function() {
    let conn = await pool.getConnection();
    conn.query = util.promisify(conn.query);

    conn.beginTransaction = util.promisify(conn.beginTransaction);
    conn.commit = util.promisify(conn.commit);
    conn.rollback = util.promisify(conn.rollback);
    return conn;
}

module.exports = pool;
