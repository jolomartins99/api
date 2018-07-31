const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');
const general = require('../services/general');
const users = require('../services/users');
const errors = require('../errors/errors');

const possibleUsers = ['user', 'mentor'];

/**
 * retrieve a user with the given user type and user key
 *
 * @param token (get variable) - token that will validate the user
 * @param search_key (get variable) - search key of the user searched
 */
router.get('/:search_key',
    [
        check("search_key", "Give a user key.").exists(),
        //check("token", "Give a token.").exists()
    ],
    async function (req, res, next) {
        let status, json;
        try {
            validationResult(req).throw();
            let db = req.app.get('database');
            // let result = await users.verifyToken(db, req.params.token);
            // let id = result['id'], typeUser = result['type_user'];
            let researchedUser = await general.getUserByKeyAndTypeUser(db, req.params.search_key, 'mentor');
            status = 200;
            json = general.getJsonToResponse(researchedUser, errors.OK);
        } catch (err) {
            let error = general.treatError(err);
            status = error.status;
            json = error.json;
        }

        res.status(status).json(json);
    }
);

module.exports = router;
