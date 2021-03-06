const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');
const users = require('./users');
const errors = require('../errors/errors');

const general = new Object();

general.getJsonToResponse = function(result = {}, error = errors.OK) {
    return {
        'result': result,
        'error': error
    };
}

/**
 * get a user by his id and will get all the parameters that was passed
 *
 * @param db
 * @param id
 * @param typeUser
 * @param parameters (optional) - is what fields will be retrieve by the function
 *                                pre-defined as users.availableFields
 *
 * @return user - with the given parameters
 */
general.getUserByIdAndTypeUser = async function(db, id, typeUser, parameters = users.availableFields) {
    // necessary to not change the original array in parameters
    parameters = parameters.slice();
    parameters = users.getSecureFieldsToReturn(parameters);
    let response = await users.get(db, {'id': id, 'type_user': typeUser}, parameters);
    if (response.result.length == 0) throw errors.getError(errors.NOT_FOUND);
    let user = response.result[0];
    user.token_date_end = moment(user.token_date_end).utc().format('YYYY-MM-DD hh:mm:ss');
    return user;
}

/**
 * get a user by his key and by his type of user
 *
 * @param db
 * @param searchKey
 * @param typeUser
 * @param parameters (optional) - is what fields will be retrieve by the function
 *                                pre-defined as users.availableFields
 *
 * @return user - with the given parameters
 */
general.getUserByKeyAndTypeUser = async function(db, searchKey, typeUser, parameters = users.availableFields) {
    // necessary to not change the original array in parameters
    parameters = parameters.slice();
    parameters = users.getSecureFieldsToReturn(parameters);
    let response = await users.get(db, {'type_user': typeUser, 'search_key': searchKey}, parameters);
    if (response.result.length == 0) throw errors.getError(errors.NOT_FOUND);
    let user = response.result[0];
    user.token_date_end = moment(user.token_date_end).utc().format('YYYY-MM-DD hh:mm:ss');
    return user;
}

/**
 * gets an error and return the response that the api should
 * retrieve to the client
 *
 * @param error
 *
 * @return the response that should be retrieved in the end of call to the API
 */
general.treatError = function(error) {
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

module.exports = general;
