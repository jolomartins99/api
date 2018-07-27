const bcrypt = require('bcryptjs');
const md5 = require('crypto-js/md5');
const moment = require('moment');
const errors = require('../errors/errors');

const users = new Object();

// list of all user fields available
// you must be very careful to prevent the sending of the password
// and other delicate information to the user (client-side)
users.availableFields = [
    'id',
    'email',
    'name',
    'password',
    'type_user',
    'bio',
    'role',
    'location',
    'homepage',
    'company',
    'tags',
    'date_start',
    'token',
    'token_date_end',
];

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
 *         if requiredInfo is undefined all fields will be retrieved (except password)
 *         example: result = {
 *                      result: result from the database,
 *                      error: error code
 *                  }
 *
 * NOTE: throws errors (@see entities/errors/errors.js)
 *       IMPORTANT: the result.result returned has always the token and token_date_end
 */
users.get = async function(db, searchInfo, retrievedInfo) {
    let query = 'SELECT ', parameters = [], result = {};
    let i = 0;
    if (!retrievedInfo) retrievedInfo = users.availableFields;
    query += 'token, token_date_end, ';
    for (let len = retrievedInfo.length; i < len; i++) {
        //if (retrievedInfo[i] == 'password') continue; // only allows our app to access password
        query += 'IFNULL(' + retrievedInfo[i] + ', "") as ' + retrievedInfo[i] + ', ';
    }
    if (i != 0) query = query.slice(0, -2);

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
        let response = await db.query(query, parameters);
        for (let index in response) {
            for (let key in response[index]) {
                if (response[index].hasOwnProperty(key)
                && response[index][key] instanceof Buffer) {
                    let buffer = new Buffer(response[index][key]);
                    response[index][key] = buffer.toString();
                }
            }
        }
        result.result = response;
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
            if (key == 'password') updatedInfo[key] = bcrypt.hashSync(updatedInfo[key], bcrypt.genSaltSync(10));
            if (key == 'tags') updatedInfo[key] = JSON.stringify(updatedInfo[key]);
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
 * verify a given token
 *
 * @param db
 * @param token
 *
 * @return object with id, token and token_date_end of the user
 */
users.verifyToken = async function(db, token) {
    let response = await users.get(db, {'token': token}, ['id', 'token', 'token_date_end']);
    if (response.result.length == 0 || response.result.length > 1
    || moment(users.getCurrentDate()).isAfter(response.result[0].token_date_end)) {
        throw getError(errors.NOT_LOGGED_IN);
    }
    return response.result[0];
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

/**
 * get fields variable with only secure fields
 * for another words, remove dangerous fields from POST/PUT variables
 * like id, token, token_date_end and others that can be useful
 *
 * @param fields - POST/PUT variables (object)
 *
 * @return fields object already treated
 */
users.getSecureFieldsToSave = function(fields) {
    if (fields.hasOwnProperty('id')) delete fields.id;
    if (fields.hasOwnProperty('type_user')) delete fields.type_user;
    if (fields.hasOwnProperty('token')) delete fields.token;
    if (fields.hasOwnProperty('token_date_end')) delete fields.token_date_end;
    return removeExtraFields(fields, true);
}

/**
 * get fields variable with only secure fields to return to the user
 * for another words, remove dangerous fields from GET variables
 * like id, password and others that can be useful
 *
 * @param fields - GET variables (array)
 *
 * @return fields array already treated
 */
users.getSecureFieldsToReturn = function(fields) {
    let index;
    if ((index = fields.indexOf('id')) != -1) fields.splice(index, 1);
    if ((index = fields.indexOf('password')) != -1) fields.splice(index, 1);
    return removeExtraFields(fields, false);
}

/**
 * will remove all the fields submitted that the user table doesn't have
 *
 * @param fields
 *
 * @return fields object already treated
 */
function removeExtraFields(fields, isObject = true) {
    if (isObject) {
        for (let key in fields) {
            if (fields.hasOwnProperty(key) && users.availableFields.indexOf(key) == -1) {
                delete fields[key];
            }
        }
    } else {
        for (let i = 0, len = fields.length; i < len; i++) {
            if (users.availableFields.indexOf(fields[i]) == -1) fields.splice(index, 1);
        }
    }
    return fields;
}

/**
 * Token Management
 */

/**
 * fetches user id using token
 * 
 * @param db - DB connection
 * @param token - User token
 * 
 * @return userID - User ID 
 */

users.getUserId = async function (db, token) {
    let query = "SELECT id FROM users WHERE token = ?";

    // let's do the query
    let response = await db.query(query, token)
    return response[0].id;
}


/**
 * saves mentor google calendar token and refresh token
 * 
 * @param db - A connection to db
 * @param token - User token
 * @param googleTokens - An object with the google calendar tokens to save
 * 
 * @returns status - OK if save operation took place successfully
 * 
 */

users.saveTokens = async function (db, token, googleTokens) {
    let id = await users.getUserId(db, token);

    let rowExists = await db.query("SELECT EXISTS(SELECT 1 FROM users_gtokens WHERE user_id = ?)", id);
    for (let index in rowExists) {
        for (let key in rowExists[index]) {
            rowExists = rowExists[index][key];
        }
    }

    if (rowExists) {
        // UPDATE tokens
        let params = [googleTokens.access_token, googleTokens.refresh_token, id];
        let result = await db.query("UPDATE users_gtokens SET access_token = ?, refresh_token = ? WHERE user_id = ?", params);
    } else {
        // INSERT tokens
        let query = "INSERT INTO users_gtokens (user_id, access_token, refresh_token) VALUES (?,?,?)",
            parameters = [id, googleTokens.access_token, googleTokens.refresh_token];

        let result = await db.query(query, parameters);
    }
}

/**
 * retrieves google calendar token & refresh tokens
 * 
 * @param db - DB connection
 * @param token - User token
 * 
 * @returns googleToken - Google calendar token used to access APIs 
 */

users.getTokens = async function (db, token) {
    let result = {},
        query = "SELECT access_token, refresh_token FROM users_gtokens WHERE user_id = ?"

    let id = await users.getUserId(db, token)
    try {
        let response = await db.query(query, id)
        for (let index in response) {
            for (let key in response[index]) {
                if (response[index].hasOwnProperty(key)
                    && response[index][key] instanceof Buffer) {
                    let buffer = new Buffer(response[index][key]);
                    response[index][key] = buffer.toString();
                }
            }
        }
        result.result = response;
        result.error = errors.OK;
    } catch (err) {
        throw errors.getError(errors.DATABASE_ERROR, error.sqlState);
    }

    return result;
}

module.exports = users;
