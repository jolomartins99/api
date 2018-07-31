const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');
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
        let status, json;
        try {
            validationResult(req).throw();
            let response = await users.create(req.app.get('database'), req.body);
            status = 201;
            json = response.result;
            json.error = response.error;
        } catch (err) {
            let error = treatError(err);
            status = error.status;
            json = error.json;
        }

        res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0");
        res.status(status).json(json);
    }
);

/**
 * make a new login with the given info
 *
 * @param (post variable) email
 * @param (post variable) password
 * @param (post variable) type_user
 * @param other post variables (req.body)
 */
router.post('/login', [
        check("email", "Give an email").exists(),
        check("email", "Invalid email").isEmail(),
        check("password", "Give a password").exists()
    ],
    async function(req, res, next) {
        let status, json, token, dateEnd = users.getDateEnd();
        try {
            validationResult(req).throw();

            let db = req.app.get('database');
            //let connection = await db.getConnection();
            let response = await users.get(db, {'email': req.body.email}, ['id', 'password', 'token', 'token_date_end', 'type_user']);
            // in case of the users.get retrieve a code error but not an exception
            if (response.error != errors.OK) throw getErrors(response.code);
            // verify if there is a user with this email and with this password
            else if (response.result.length == 0 || !users.verifyPassword(req.body.password, response.result[0]['password'])) {
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
            await users.set(db, {'id': response['id']}, {'token': token, 'token_date_end': dateEnd});
            status = 200;
            json = {
                'email': req.body.email,
                'token': token,
                'dateEnd': dateEnd,
                'error': errors.OK
            };
        } catch (err) {
            let error = treatError(err);
            status = error.status;
            json = error.json;
        }

        res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0");
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
 * @param all other fields in req.body (post variables)
 */
router.get('/:token',
    [
        check("token", "Give a token.").exists()
    ],
    async function (req, res, next) {
        let status, json;
        try {
            validationResult(req).throw();
            let db = req.app.get('database');
            let id = (await users.verifyToken(db, req.params.token))['id'];
            let user = await getUserById(db, id);
            status = 200;
            json = user;
        } catch (err) {
            let error = treatError(err);
            status = error.status;
            json = error.json;
        }

        res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0");
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
        let status, json;
        try {
            validationResult(req).throw();
            let db = req.app.get('database');
            let id = (await users.verifyToken(db, req.params.token))['id'];
            let toSet = users.getSecureFieldsToSave(req.body);
            await users.set(db, {'id': id}, toSet);
            let user = await getUserById(db, id);
            status = 200;
            json = user;
        } catch (err) {
            let error = treatError(err);
            status = error.status;
            json = error.json;
        }

        res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0");
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

async function getUserById(db, id, parameters = users.availableFields) {
    // necessary to not change the original array in parameters
    parameters = parameters.slice();
    parameters = users.getSecureFieldsToReturn(parameters);
    let response = await users.get(db, {'id': id}, parameters);
    if (response.error != errors.OK) throw getErrors(response.code);
    else if (response.result.length == 0) throw errors.getError(errors.NOT_FOUND);
    let user = response.result[0];
    user.token_date_end = moment(user.token_date_end).utc().format('YYYY-MM-DD hh:mm:ss');
    return user;
}

function treatError(error) {
    let newError = {};
    // if err.mapped, it's a unprocessable entity
    if (error.mapped) {
        newError.status = 422;
        newError.json = {
            "error": error.mapped(),
            "message": "Please check the posted variables."
        };
    }
    // errors generated by us
    else if (error.error) {
        newError.status = error.status;
        newError.json = error.error;
    } else {
        error = errors.getError(errors.UNDEFINED_PROBLEM);
        newError.status = error.status;
        newError.json = error.error;
    }

    return newError;
}

router.get('/mentors/:search_key', [
    check('search_key', 'Give a search key').exists()
], async function(req, res, next) {
    let status, json;
    try {
        let response = await users.get(req.app.get('database'), {'search_key': req.params.search_key}, ['name', 'picture_hash', 'role', 'company', 'bio', 'tags'])
        
        status = 200;
        json = response.result[0];
    } catch(err) {
        let error = treatError(err)
        stuats = error.status;
        json = error.json;
    }

    res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0");
    res.status(200).send(json);
});

/**
 * save user google access & refresh token
 * 
 */

router.post('/token/:token', [
    check("token", "Give a token").exists(),
    check('access_token', 'Give an access token').exists(),
    check('refresh_token', 'Give a refresh token').exists(),
    check('expiration', 'Give an expiration date').exists()
],
    async function (req, res, next) {
        let status, json;
        try {
            //validationResult(req).throw();

            await users.saveTokens(req.app.get("database"), req.params.token, req.body);
            status = 200
            json = {}
        } catch (err) {
            let error = treatError(err);
            status = error.status;
            json = error.json;
        }

        res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0");
        res.status(200).send(json);
    }
);

/**
 * retrieves user google access & refresh token
 */

router.get("/token/:token",
    [
        check("token", "Give a token").exists()
    ],
    async function (req, res, next) {
        let status, json = {};
        try {
            let response = await users.getTokens(req.app.get("database"), req.params.token)
            json = response.result[0]
            if(!response.result[0]) {
                status = 404;
                json = {};
            }
        } catch (err) {
            let error = treatError(err);
            status = error.status;
            json = error.json;
        }

        res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0")
        res.status(200).send(json)
    }
);

module.exports = router;
