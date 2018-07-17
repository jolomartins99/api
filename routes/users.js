const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');
const users = require('../entities/users');
const errors = require('../errors/errors');

const possibleUsers = ['user', 'mentor'];

router.get('/ping', function (req, res, next) {
    res.status(200).send('pong')
});

/* create a new user */
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

        res.status(status).json(json);
    }
);

router.post('/login', [
        check("email", "Give an email").exists(),
        check("email", "Invalid email").isEmail(),
        check("password", "Give a password").exists(),
        check("type_user", "The type is not in the possible types").isIn(possibleUsers)
    ],
    async function(req, res, next) {
        let status, json, token, dateEnd = users.getDateEnd();
        try {
            validationResult(req).throw();

            let db = req.app.get('database');
            //let connection = await db.getConnection();
            let response = await users.get(db, {'email': req.body.email, 'type_user': req.body.type_user}, ['id', 'password', 'token', 'token_date_end']);
            // in case of the users.get retrieve a code error but not an exception
            if (response.error != errors.OK) throw getErrors(response.code);
            // verify if there is a user with this email and with this password
            if (response.result.length == 0 || !users.verifyPassword(req.body.password, response.result[0]['password'])) {
                throw errors.getError(errors.NOT_FOUND);
            }
            // this if means that there is several users with the same email
            // now the email field is a UNIQUE KEY and it's impossible to go through
            // this if, but just for the case
            else if (response.result.length > 1) throw errors.getError(errors.CONTACT_SUPPORT);
            else {
                response = response.result[0];
                token = response['token'];
                let date = users.getCurrentDate();
                if (moment(date).isAfter(response['token_date_end'])) token = users.getToken(response['id']);
                await users.set(db, {'id': response['id']}, {'token': token, 'token_date_end': dateEnd});
            }
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

        res.status(status).json(json);
    }
);

/**
 * retrieve a user with the given token
 * token has to be valid
 */
router.get('/:token',
    [
        check("token", "Give a token.").exists()
    ],
    async function (req, res, next) {

    }
);

/**
 * update a user with the given token
 * token has to be valid
 */
router.put('/:token',
    [
        check("token", "Give a token.").exists()
    ],
    function (req, res, next) {

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

router.post('/public',
    [
        check("token", "Provide a token").exists(),
    ],
    function(req, res, next) {
        try {
            validationResult(req).throw();
        } catch (err) {
            // unprocessable entity
            res.status(422).json({
                "errors": err.mapped(),
                "message": "Please pay attention to the notices presented."
            });
        }
    }
);

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

module.exports = router;
