const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');
const general = require('../services/general');
const users = require('../services/users');
const errors = require('../errors/errors');

const possibleUsers = ['user', 'mentor'];

/**
 * create a new user
 *
 * @param name (post variable)
 * @param email (post variable)
 * @param password (post variable)
 * @param passwordConfirmation (post variable)
 * @param type_user (post variable)
 */
router.post('/',
    [
        // Check validity
        check("name", "Give a name.").exists(),
        check("email", "Give an email.").exists(),
        check("email", "Invalid email.").isEmail(),
        check("password", "Give a password.").exists(),
        check("password", "Invalid password.").isLength({ min: 4 }),
        check("passwordConfirmation", "You have to repeat your password.").exists(),
        check("passwordConfirmation", "The confirmation password must be the same as the password.")
            .custom((value, { req }) => value === req.body.password ),
        check("type_user", "The type is not in the possible types.").isIn(possibleUsers)
    ],
    async function (req, res, next) {
        let status, json, conn;
        try {
            validationResult(req).throw();
            let db = req.app.get('database');
            conn = await db.createConnection();
            await conn.beginTransaction();
            let response = await users.create(conn, req.body);
            await conn.commit();
            conn.release();

            status = 201;
            json = general.getJsonToResponse(response.result, errors.OK);
            /*json = response.result;
            json.error = errors.OK;*/
        } catch (err) {
            let error = general.treatError(err);
            status = error.status;
            json = error.json;
        }
        res.status(status).json(json);
    }
);

/**
 * make a new login with the given info
 *
 * @param (post variable) email
 * @param (post variable) password
 * @param (post variable) type_user
 */
router.post('/login', [
        check("email", "Give an email").exists(),
        check("email", "Invalid email").isEmail(),
        check("password", "Give a password").exists(),
        check("type_user", "The type is not in the possible types").isIn(possibleUsers)
    ],
    async function(req, res, next) {
        let status, json, token, dateEnd = users.getDateEnd(), conn;
        try {
            validationResult(req).throw();

            let db = req.app.get('database');
            conn = await db.createConnection();
            await conn.beginTransaction();
            let response = await users.get(conn, {'email': req.body.email, 'type_user': req.body.type_user}, ['id', 'password', 'type_user', 'token', 'token_date_end']);
            // verify if there is a user with this email and with this password
            if (response.result.length == 0 || !users.verifyPassword(req.body.password, response.result[0]['password'])) {
                throw errors.getError(errors.NOT_FOUND);
            }
            // this if means that there is several users with the same email
            // now the email field is a UNIQUE KEY and it's impossible to go through
            // this if, but just for the case
            else if (response.result.length > 1) throw errors.getError(errors.CONTACT_SUPPORT);

            response = response.result[0];
            token = response['token'];
            let date = users.getCurrentDate();
            if (moment(date).isAfter(response['token_date_end'])) token = users.getToken(response['id']);
            await users.set(conn, {'id': response['id'], 'type_user': response['type_user']}, {'token': token, 'token_date_end': dateEnd});
            let user = await general.getUserByIdAndTypeUser(conn, response['id'], response['type_user']);
            await conn.commit();
            conn.release();

            status = 200;
            json = general.getJsonToResponse(user, errors.OK);
            /*json = {
                    'email': req.body.email,
                    'token': token,
                    'token_date_end': dateEnd,
                };
            json.error = errors.OK;*/
        } catch (err) {
            if (conn) {
                conn.rollback();
                conn.release();
            }
            let error = general.treatError(err);
            status = error.status;
            json = error.json;
        }

        res.status(status).json(json);
    }
);

/**
 * retrieve a user with the given token
 * token has to be valid
 * maybe the 2nd parameter (array to check) is unnecessary, but it's better
 * practice the way it's done (I think)
 *
 * @param token (get variable) - token that will validate the user
 */
router.get('/:token',
    [
        check("token", "Give a token.").exists()
    ],
    async function (req, res, next) {
        let status, json, conn;
        try {
            validationResult(req).throw();
            let db = req.app.get('database');
            conn = await db.createConnection();
            await conn.beginTransaction();
            let result = await users.verifyToken(conn, req.params.token);
            let id = result['id'], typeUser = result['type_user'];
            let user = await general.getUserByIdAndTypeUser(conn, id, typeUser);
            await conn.commit();
            conn.release();

            status = 200;
            json = general.getJsonToResponse(user, errors.OK);
            /*json = user;
            json.error = errors.OK;*/
        } catch (err) {
            if (conn) {
                conn.rollback();
                conn.release();
            }
            let error = general.treatError(err);
            status = error.status;
            json = error.json;
        }

        res.status(status).json(json);
    }
);

/**
 * update a user with the given token
 * token has to be valid
 *
 * @param token (get variable) - token that will validate the user
 * @param all other fields in req.body (post variables)
 */
router.put('/:token',
    [
        check("token", "Give a token.").exists()
    ],
    async function (req, res, next) {
        let status, json, conn;
        try {
            validationResult(req).throw();
            let db = req.app.get('database');
            conn = await db.createConnection();
            await conn.beginTransaction();
            let result = await users.verifyToken(db, req.params.token);
            let id = result['id'], typeUser = result['type_user'];
            let toSet = users.getSecureFieldsToSave(req.body);
            await users.set(conn, {'id': id, 'type_user': typeUser}, toSet);
            let user = await general.getUserByIdAndTypeUser(conn, id, typeUser);
            await conn.commit();
            conn.release();
            
            status = 200;
            json = general.getJsonToResponse(user, errors.OK);
            /*json = user;
            json.error = errors.OK;*/
        } catch (err) {
            if (conn) {
                await conn.rollback();
                conn.release();
            }
            let error = general.treatError(err);
            status = error.status;
            json = error.json;
        }

        res.status(status).json(json);
    }
);

/**
 * delete a user with the given token
 * token has to be valid
 */
router.delete('/:token',
    [
        check("token", "Give a token.").exists()
    ],
    function (req, res, next) {

    }
);

module.exports = router;
