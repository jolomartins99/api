const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');
const general = require('../services/general');
const users = require('../services/users');
const errors = require('../errors/errors');

router.get('/:search',
    [
        check("search", "Please provide some string to search.").exists()
    ],
    async function(req, res, next) {
        let status, json;
        let searchArray = req.params.search.split(" ");
        try {
            let db = req.app.get('database');

            // get all users searched
            let usersName = await searchByName(db, searchArray);
            let usersTags = await searchByTags(db, searchArray);
            let allUsers = usersName;
            for (let i = 0, len = usersTags.length, initialSize = allUsers.length; i < len; i++) allUsers[initialSize + i] = usersTags[i];

            // get what the searchInfo for second query is
            // will contain all the ids of the allUsers variable
            // and the property 'type_user' = 'mentor' because he only searches for mentors
            // (and it's important to get tags)
            let searchInfo = {};
            let searchInfoUsersId = [];
            for (let i = 0, len = allUsers.length; i < len; i++) {
                if (allUsers[i].hasOwnProperty('id')) searchInfoUsersId.push(allUsers[i]['id']);
            }
            searchInfo['id'] = searchInfoUsersId;
            searchInfo['type_user'] = 'mentor';
            // necessary to not change the original array in parameters
            retrievedInfo = users.availableFields.slice();
            retrievedInfo = users.getSecureFieldsToReturn(retrievedInfo);

            let response = await users.get(db, searchInfo, retrievedInfo);
            json = general.getJsonToResponse(response.result, errors.OK);
            status = 200;
        } catch (err) {
            console.log(err);
            let error = general.treatError(err);
            status = error.status;
            json = error.json;
        }

        res.status(status).json(json);
    }
);

async function searchByName(db, searchArray) {
    let searchArrayAux = [];
    let query = "SELECT users.id FROM users WHERE users.type_user = 'mentor' AND ";
    let i = 0;
    for (let len = searchArray.length; i < len; i++) {
        query += "users.name LIKE ? OR ";
        searchArrayAux.push('%' + searchArray[i].toLowerCase() + '%');
    }
    if (i != 0) query = query.slice(0, -4);
    return (await db.query(query, searchArrayAux));
}

async function searchByTags(db, searchArray) {
    let query = "SELECT users.id FROM users, users_tags, tags WHERE users.type_user = 'mentor' " +
        "AND users.id = users_tags.user_id AND tags.id = users_tags.tag_id AND tags.tag IN (";
    let i = 0;
    for (let len = searchArray.length; i < len; i++) {
        query += "?,";
        searchArray[i] = searchArray[i].toLowerCase();
    }
    if (i != 0) query = query.slice(0, -1);
    query += ')';
    return (await db.query(query, searchArray));
}

module.exports = router;
