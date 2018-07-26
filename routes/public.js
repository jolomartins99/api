const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const bcrypt = require('bcryptjs');
const md5 = require('crypto-js/md5');
const moment = require('moment');

/* POST signup page. */
router.post('/signup',
    [
        // Check validity
        check("name", "Give a name").exists(),
        check("email", "Give an email").exists(),
        check("email", "Invalid email").isEmail(),
        check("password", "Give a password").exists(),
        check("password", "Invalid password").isLength({ min: 4 }),
        check("passwordConfirmation", "You have to repeat your password").exists(),
        check("passwordConfirmation", "The confirmation password must be the same as the password")
            .custom((value, { req }) => value === req.body.password ),
        check("type", "The type is not in the possible types").isIn(possibleTypes)
    ],
    function(req, res, next) {
        try {
            validationResult(req).throw();

            // password hashing
            let salt = bcrypt.genSaltSync(10);
            let hash = bcrypt.hashSync(req.body.password, salt);

            let db = req.app.get('database');
            db.query('INSERT INTO users (email, name, password, type)' +
                ' VALUES (?, ?, ?, ?)', [
                    req.body.email,
                    req.body.name,
                    hash,
                    req.body.type,
                ],
                function(error, result) {
                    if (!error) {
                        res.status(201).json({
                            "email": req.body.email,
                            "name": req.body.name,
                            "message": "User created."
                        });
                    } else {
                        // can compare with error.errno = 1062 or error.sqlState = 23000
                        // it means that the email is duplicated
                        if (error.code === 'ER_DUP_ENTRY') {
                            res.status(409).json({
                                "message": "Email already used."
                            });
                        } else {
                            res.status(503).json({
                                "message": "There was a problem. Please try again later."
                            });
                        }
                    }
                }
            );
        } catch (err) {
            // unprocessable entity
            res.status(422).json({
                "errors": err.mapped(),
                "message": "Please pay attention to the notices presented."
            });
        }
    }
);

/* POST login page. */
router.post('/login',
    [
        check("email", "Give an email").exists(),
        check("email", "Invalid email").isEmail(),
        check("password", "Give a password").exists()
    ],
    function(req, res, next) {
        try {
            validationResult(req).throw();

            let db = req.app.get('database');
            db.getConnection(function(err, connection) {
                if (!err) {
                    connection.query('SELECT id, password FROM users' +
                        ' WHERE email = ?', [
                            req.body.email,
                        ],
                        function(error, result, fields) {
                            
                            if (!error) {
                                switch (result.length) {
                                    case 0:
                                        connection.release();
                                        res.status(404).json({
                                            "message": "There is no account with that email and password."
                                        });
                                        break;
                                    case 1:
                                        // verifies if the given password is valid for this user
                                        if (!bcrypt.compareSync(req.body.password, result[0]['password'])) {
                                            connection.release();
                                            res.status(404).json({
                                                "message": "There is no account with that email and password."
                                            });
                                        }

                                        let userId = result[0]['id'];
                                        connection.query('SELECT token, date_end FROM tokens' +
                                            ' WHERE user_id = ?', [
                                                userId,
                                            ],
                                            function(error, result) {
                                                if (!error) {
                                                    let currentTimestamp = Date.now();
                                                    // parameters save the parameters that will
                                                    // be given to the query
                                                    let query, parameters;

                                                    if (result.length < 2) {
                                                        let token = result[0]['token'];
                                                        let currentDateEnd = result[0]['date_end'];
                                                        let newDateEnd = getDateEnd();
                                                        // if there is a current token for the user and current dateEnd
                                                        if (token && currentDateEnd) {
                                                            // it means that the token is not valid anymore
                                                            if (currentDateEnd < currentTimestamp) {
                                                                query = 'UPDATE tokens SET token = ?, date_end = ?' +
                                                                    ' WHERE user_id = ?';
                                                                token = getToken(userId, currentTimestamp);
                                                                parameters = [
                                                                    token,
                                                                    newDateEnd,
                                                                    userId
                                                                ];
                                                            } else {
                                                                // here the token that is in db is valid
                                                                // but the time has to be updated
                                                                query = 'UPDATE tokens SET date_end = ?' +
                                                                    ' WHERE user_id = ?';
                                                                parameters = [
                                                                    newDateEnd,
                                                                    userId
                                                                ];
                                                            }
                                                        } else {
                                                            query = 'INSERT INTO tokens (token, date_end)' +
                                                                ' VALUES (?, ?)';
                                                            token = getToken(userId, currentTimestamp);
                                                            parameters = [
                                                                token,
                                                                newDateEnd
                                                            ];
                                                        }
                                                        connection.query(query, parameters,
                                                            function(error, result) {
                                                                connection.release();
                                                                if (!error) {
                                                                    res.status(200).json({
                                                                        "token": token,
                                                                        "dateEnd": newDateEnd,
                                                                        "message": "Successful login."
                                                                    });
                                                                } else {
                                                                    res.status(500).json({
                                                                        "message": "Something went wrong. Please reload the page and try again."
                                                                    });
                                                                }
                                                            }
                                                        );
                                                    }
                                                    // never should get here because it means that was
                                                    // 2 tokens for the same person, scenario that should be impossible
                                                    else {
                                                        connection.release();
                                                        res.status(500).json({
                                                            "message": "Please contact the support team and describe to them what happened."
                                                        });
                                                    }
                                                } else {
                                                    connection.release();
                                                    res.status(500).json({
                                                        "message": "Something went wrong. Please reload the page and try again."
                                                    });
                                                }
                                            }
                                        );
                                        break;
                                    // never should get here because it means that
                                    // there is an email that is duplicated for the type
                                    // submitted by post
                                    default:
                                        connection.release();
                                        res.status(500).json({
                                            "message": "An error occurred. Please contact the support team."
                                        });
                                }
                            } else {
                                connection.release();
                                res.status(500).json({
                                    "message": "Something went wrong. Please reload the page and try again."
                                });
                            }
                        }
                    );
                } else {
                    res.status(500).json({
                        "message": "Something went wrong. Please reload the page and try again."
                    });
                }
            });
        } catch (err) {
            // unprocessable entity
            res.status(422).json({
                "errors": err.mapped(),
                "message": "Please pay attention to the notices presented."
            });
        }
    }
);

/**
 * get a new token formed with an id and a time
 *
 * @param id - id on which the token is based
 * @param time (optional) - necessary for the token to never be the same
 */
function getToken(id, time) {
    if (!time) time = Date.now();
    return md5(id + time);
}

/**
 * get a new dateEnd (used for time limit for the token)
 *
 * @param currentTimestamp
 *
 * @see https://momentjs.com/docs/#year-month-and-day-tokens (important for the date format)
 *
 * NOTE: 31*24*60*60*1000 = 2678400000 - 31 days in milliseconds
 */
function getDateEnd(currentTimestamp) {
    if (!currentTimestamp) currentTimestamp = Date.now();
    currentTimestamp += 2678400000;
    return moment(currentTimestamp).utc().format('YYYY-MM-DD hh:mm:ss');
}

module.exports = router;
