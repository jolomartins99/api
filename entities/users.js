const bcrypt = require('bcryptjs');
const md5 = require('crypto-js/md5');
const moment = require('moment');
const errors = require('../errors/errors');

const users = new Object();

/**
 * create a new user
 *
 * @param db - a connection to db
 * @param info - an array with the necessary info to populate
 *               the user
 *
 * @return result = {
 *    result: {
 *        "email": "bob.test@gmail.com",
 *        "name": "Bob",
 *        "token": "tokenTest",
 *        "dateEnd": some date (like users.getDateEnd()),
 *    }
 * }
 *
 * NOTE: throws errors (@see entities/errors/errors.js)
 */
users.create = async function(db, info) {
    let result = {};
    try {
        // password hashing
        let salt = bcrypt.genSaltSync(10);
        let hash = bcrypt.hashSync(info.password, salt);
        let dateEnd = users.getDateEnd();
        // anything goes for the first parameter
        let token = users.getToken(salt);

        await db.query('INSERT INTO users (email, name, password, type_user, token, token_date_end)' +
            ' VALUES (?, ?, ?, ?, ?, ?)', [
                info.email,
                info.name,
                hash,
                info.type_user,
                token,
                dateEnd
            ]
        );

        result.result = {
            "email": info.email,
            "name": info.name,
            "token": token,
            "dateEnd": dateEnd
        };
        result.error = errors.OK;
    } catch (error) {
        // any of the possibilities means that the email is duplicated
        if (error.code === 'ER_DUP_ENTRY' || error.errno == 1062) {
            throw errors.getError(errors.DUPLICATED_EMAIL);
        } else {
            throw errors.getError(errors.UNDEFINED_PROBLEM);
        }
    }

    return result;
}

/**
 * get info related to the user
 *
 * @param db - is an object that allows to make db.query(query)
 *             (can be the database object or a connection object)
 * @param searchInfo - info used to find what user (or users) is to
 *                     retrieve information. It's a object with the keys
 *                     with the name of the field and the entry should be
 *                     the value of what will be searched
 *                     is used in: 'WHERE ' + searchInfo
 *                     example: givenInfo = {'email': 'test@test.com'}
 * @param retrievedInfo (optional) - array with info fields about the user (or users)
 *                                   that is pretended to send as a result
 *                                   is used in: 'SELECT ' + retrievedInfo
 *                                   example: retrievedInfo = ['id', 'name']
 *
 * @return an object with the fields given in requiredInfo filled or
 *         if requiredInfo is undefined all fields will be retrieved
 *         example: result = {
 *                      result: result from the database,
 *                      error: error code
 *                  }
 *
 * NOTE: throws errors (@see entities/errors/errors.js)
 */
users.get = async function(db, searchInfo, retrievedInfo) {
    let query = 'SELECT ', parameters = [], result = {};
    let i = 0;
    if (retrievedInfo) {
        for (let len = retrievedInfo.length; i < len; i++) {
            if (i+1 == len) query += retrievedInfo[i];
            else query += retrievedInfo[i] + ', ';
        }
    } else query += '*';

    query += ' FROM users';
    i = 0;
    for (let key in searchInfo) {
        if (i == 0) query += ' WHERE';
        i++;
        if (searchInfo.hasOwnProperty(key)) {
            query += ' ' + key + ' = ? AND';
            parameters.push(searchInfo[key]);
        }
    }
    if (i != 0) query = query.slice(0, -4);

    try {
        result.result = await db.query(query, parameters);
        result.error = errors.OK;
    } catch (error) {
        throw errors.getError(errors.DATABASE_ERROR, error.sqlState);
    }
    return result;
}

/**
 * set info related to the user (persist it to the database)
 *
 * @param db - is an object that allows to make db.query(query)
 *             (can be the database object or a connection object)
 * @param searchInfo - info used to find what user (or users) is to
 *                     update information. It's a object with the keys
 *                     with the name of the field and the entry should be
 *                     the value of what will be searched
 *                     is used in: 'WHERE ' + searchInfo
 *                     example: givenInfo = {'email': 'test@test.com'}
 * @param updatedInfo (optional) - an object with the keys with the name of
 *                                 the field to be updated and the entry is the
 *                                 value of the update to make
 *                                 is used in: 'SET ' + updatedInfo
 *                                 example: updatedInfo = {'token': 'tokenTest'}
 *
 * NOTE: throws errors (@see entities/errors/errors.js)
 */
users.set = async function(db, searchInfo, updatedInfo) {
    let query = 'UPDATE users SET ', parameters = [], result = {};
    let i = 0;
    for (let key in updatedInfo) {
        i++;
        if (updatedInfo.hasOwnProperty(key)) {
            query += key + ' = ?, ';
            parameters.push(updatedInfo[key]);
        }
    }
    if (i != 0) query = query.slice(0, -2);

    i = 0;
    for (let key in searchInfo) {
        if (i == 0) query += ' WHERE';
        i++;
        if (searchInfo.hasOwnProperty(key)) {
            query += ' ' + key + ' = ? AND';
            parameters.push(searchInfo[key]);
        }
    }
    if (i != 0) query = query.slice(0, -4);

    try {
        result.result = await db.query(query, parameters);
        result.error = errors.OK;
    } catch (error) {
        throw errors.getError(errors.DATABASE_ERROR, error.sqlState);
    }
    if (result.result.length) throw errors.getError(errors.NOT_FOUND);
}

users.delete = async function() {

}

users.login = async function() {

}

/**
 * verify a given password with an hash
 *
 * @param password
 * @param hash
 *
 * @return boolean (true if the hash corresponds to the hash)
 */
users.verifyPassword = function(password, hash) {
    return bcrypt.compareSync(password, hash);
}

/**
 * get a new token formed with an id and a time
 *
 * @param id - id on which the token is based
 *
 * @return a new token
 */
users.getToken = function(id) {
    let time = users.getDateEnd();
    return md5(id + time).toString();
}

/**
 * get a new dateEnd (used for time limit for the token)
 *
 * @param currentTimestamp
 *
 * @return a date in 'YYYY-MM-DD hh:mm:ss' format
 *
 * @see https://momentjs.com/docs/#year-month-and-day-tokens (important for the date format)
 *
 * NOTE: 31*24*60*60*1000 = 2678400000 - 31 days in milliseconds
 */
users.getDateEnd = function(currentTimestamp) {
    if (!currentTimestamp) currentTimestamp = Date.now();
    currentTimestamp += 2678400000;
    return moment(currentTimestamp).utc().format('YYYY-MM-DD hh:mm:ss');
}

/**
 * get a current date
 *
 * @return a date in 'YYYY-MM-DD hh:mm:ss' format
 */
users.getCurrentDate = function() {
    return moment(Date.now()).utc().format('YYYY-MM-DD hh:mm:ss');
}

module.exports = users;
