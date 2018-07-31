const bcrypt = require('bcryptjs');
const md5 = require('crypto-js/md5');
const moment = require('moment');
const errors = require('../errors/errors');
const { tr, slugify } = require('transliteration') ;

const users = new Object();

// list of all user fields available
// you must be very careful to prevent the sending of the password
// and other delicate information to the user (client-side)
users.availableFields = [
    'id',
    'email',
    'name',
    'password',
    'search_key',
    'picture_hash',
    'bio',
    'role',
    'location',
    'homepage',
    'company',
    'type_user',
    'date_start',
    'token',
    'token_date_end',
    'tags', // is a different table
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
 *        "token_date_end": some date (like users.getDateEnd()),
 *    }
 * }
 *
 * NOTE: throws errors (@see entities/errors/errors.js)
 */
users.create = async function(db, info) {
    let result = {}, conn;
    try {
        // password hashing
        let salt = bcrypt.genSaltSync(10);
        let hash = bcrypt.hashSync(info.password, salt);
        let dateEnd = users.getDateEnd();
        // anything goes for the first parameter
        let token = users.getToken(salt);
        conn = await db.createConnection();
        await conn.beginTransaction();

        let searchKey = slugify(info.name);
        // remove hifens from searchKey variable
        searchKey = searchKey.replace(/-/g, "");
        let query = 'SELECT users.id FROM users WHERE users.search_key LIKE ?';
        let response = await conn.query(query, [searchKey + '%']);
        let len;
        searchKey += ((len = response.length) != 0 ? len : '');

        await conn.query('INSERT INTO users (email, name, password, search_key, picture_hash, type_user, token, token_date_end)' +
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                info.email,
                info.name,
                hash,
                searchKey,
                info.picture_hash,
                info.type_user,
                token,
                dateEnd
            ]
        );

        await conn.commit();
        conn.release();

        result.result = {
            "email": info.email,
            "name": info.name,
            "search_key": searchKey,
            "token": token,
            "token_date_end": dateEnd
        };
    } catch (error) {
        if (conn) {
            conn.rollback();
            conn.release();
        }
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
 *                                   example: retrievedInfo = ['email', 'name']
 *
 * @return an object with the fields given in requiredInfo filled or
 *         if requiredInfo is undefined all fields will be retrieved (except password)
 *         example: result = {
 *                      result: result from the database,
 *                      error: error code
 *                  }
 *
 * NOTE: throws errors (@see entities/errors/errors.js)
 *       IMPORTANT: the result.result returned has always the id, token and token_date_end
 *
 * NOTE: anytime that you wants tags, you have to provide in the searchInfo
 *       the type_user property as a 'mentor'
 */
users.get = async function(db, searchInfo, retrievedInfo) {
    let query = 'SELECT ', parameters = [], result = {};
    let i = 0, hasTags = false;
    // copy users.availableFields to retrievedInfo if retrievedInfo is not defined
    if (!retrievedInfo) retrievedInfo = users.availableFields.slice();
    query += 'users.id, users.type_user, users.token, users.token_date_end, ';
    for (let len = retrievedInfo.length; i < len; i++) {
        //if (retrievedInfo[i] == 'password') continue; // only allows our app to access password
        if (retrievedInfo[i] == 'tags') {
            if (searchInfo['type_user'] == 'mentor') {
                hasTags = true;
            }
            continue;
        }
        query += 'IFNULL(users.' + retrievedInfo[i] + ', "") as ' + retrievedInfo[i] + ', ';
    }
    if (i != 0) query = query.slice(0, -2);

    query += ' FROM users';
    i = 0;
    for (let key in searchInfo) {
        if (i == 0) {
            query += ' WHERE';
        }
        if (key != 'tags') {
            i++;
            if (searchInfo.hasOwnProperty(key)) {
                // search for a property but with several values to that property
                if (searchInfo[key].constructor === Array) {
                    let arrayFromKey = searchInfo[key];
                    query += ' users.' + key + ' IN (';
                    for (let i = 0, len = arrayFromKey.length; i < len; i++) {
                        query += '?,';
                        parameters.push(arrayFromKey[i]);
                    }
                    query = query.slice(0, -1) + ') AND';
                }
                // search for a property with one single value
                else {
                    query += ' users.' + key + ' = ? AND';
                    parameters.push(searchInfo[key]);
                }
            }
        }
    }
    if (i != 0) query = query.slice(0, -4);

    try {
        let response = await db.query(query, parameters);
        let lenResponse = response.length;
        if (lenResponse) {
            let tags = {};
            if (hasTags) {
                parameters = [];
                query = 'SELECT users_tags.user_id, tags.tag FROM tags, users_tags ' +
                    'WHERE tags.id = users_tags.tag_id AND users_tags.user_id IN (';
                for (let i = 0, len = response.length; i < len; i++) {
                    if (response[i].hasOwnProperty('id')) {
                        query += '?,';
                        parameters.push(response[i]['id']);
                    }
                }
                query = query.slice(0, -1) + ')';
                let result = await db.query(query, parameters);
                for (let i = 0, len = result.length; i < len; i++) {
                    if (tags.hasOwnProperty(result[i]['user_id'])) tags[result[i]['user_id']].push(result[i]['tag']);
                    else tags[result[i]['user_id']] = [result[i]['tag']];
                }
                for (let i = 0, len = response.length; i < len; i++) {
                    response[i].tags = (tags[response[i]['id']] ? tags[response[i]['id']] : []);
                }
            }

            for (let index in response) {
                for (let key in response[index]) {
                    if (response[index].hasOwnProperty(key)
                    && response[index][key] instanceof Buffer) {
                        let buffer = new Buffer(response[index][key]);
                        response[index][key] = buffer.toString();
                    }
                }
            }
        }

        result.result = response;
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
    let query = 'UPDATE users SET ', parameters = [], result = {},
    hasTags = false, hasName = false, toUpdate = false;
    let i = 0;
    for (let key in updatedInfo) {
        i++;
        if (updatedInfo.hasOwnProperty(key)) {
            if (key == 'tags') {
                hasTags = true;
                continue;
            }

            if (key == 'id' || hasTags) continue;
            toUpdate = true;
            if (key == 'name') hasName = true;
            query += 'users.' + key + ' = ?, ';
            if (key == 'password') updatedInfo[key] = bcrypt.hashSync(updatedInfo[key], bcrypt.genSaltSync(10));
            parameters.push(updatedInfo[key]);
        }
    }
    if (i != 0) query = query.slice(0, -2);

    i = 0;
    for (let key in searchInfo) {
        if (i == 0) query += ' WHERE';
        i++;
        if (searchInfo.hasOwnProperty(key)) {
            query += ' users.' + key + ' = ? AND';
            parameters.push(searchInfo[key]);
        }
    }
    if (i != 0) query = query.slice(0, -4);

    try {
        if (toUpdate) result.result = await db.query(query, parameters);
        if (searchInfo['type_user'] == 'mentor' && hasTags) await saveTags(db, searchInfo['id'], updatedInfo['tags']);
    } catch (error) {
        throw errors.getError(errors.DATABASE_ERROR);
    }
    return result;
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
 * @return object with id, type_user, token and token_date_end of the user
 */
users.verifyToken = async function(db, token) {
    let response = await users.get(db, {'token': token}, ['id', 'type_user', 'token', 'token_date_end']);
    if (response.result.length == 0 || response.result.length > 1
    || moment(users.getCurrentDate()).isAfter(response.result[0].token_date_end)) {
        throw errors.getError(errors.NOT_LOGGED_IN);
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
    if ((index = fields.indexOf('type_user')) != -1) fields.splice(index, 1);
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
            if (fields.hasOwnProperty(key) && !users.availableFields.includes(key)) {
                delete fields[key];
            }
        }
    } else {
        for (let len = fields.length, i = len - 1; i >= 0; i--) {
            if (!users.availableFields.includes(fields[i])) {
                fields.splice(i, 1);
            }
        }
    }
    return fields;
}

/**
 * save all the tags in tags array in db and delete the others that was
 * associated to this user (with userId), but that aren't anymore
 *
 * @param db
 * @param userId
 * @param tags - array with the tags to save
 */
async function saveTags(db, userId, tags) {
    if (tags == []) return;

    query = 'INSERT IGNORE INTO tags (tag) VALUES ';
    for (let len = tags.length, i = 0; i < len; i++) {
        query += '(?),';
    }
    query = query.slice(0, -1);
    await db.query(query, tags);

    query = 'SELECT id FROM tags WHERE tag IN (';
    for (let i = 0, len = tags.length; i < len; i++) query += '?,';
    query = query.slice(0, -1) + ')';
    let result = await db.query(query, tags);

    let parameters = [];
    query = 'INSERT IGNORE INTO users_tags (user_id, tag_id) VALUES ';
    for (let len = result.length, i = 0; i < len; i++) {
        query += '(?, ?),';
        parameters.push(userId, result[i]['id']);
    }
    query = query.slice(0, -1);
    await db.query(query, parameters);

    parameters = [userId];
    query = 'SELECT users_tags.id FROM users_tags, tags WHERE users_tags.user_id = ? '+
        'AND users_tags.tag_id = tags.id AND tags.tag NOT IN (';
    for (let i = 0, len = tags.length; i < len; i++) {
        query += '?,';
        parameters.push(tags[i]);
    }
    query = query.slice(0, -1) + ')';
    result = await db.query(query, parameters);

    parameters = [];
    query = 'DELETE FROM users_tags WHERE id IN (';
    if (result.length) {
        for (let i = 0, len = result.length; i < len; i++) {
            query += '?,';
            parameters.push(result[i]['id']);
        }
        query = query.slice(0, -1) + ')';
        await db.query(query, parameters);
    }
}

module.exports = users;
