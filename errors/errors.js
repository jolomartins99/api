/**
 * in this file, we have all possible errors given by this API
 */

var errors = new Object();

/**
 * all possible errors
 */
errors.OK = 0;
errors.UNDEFINED_PROBLEM = 1;
errors.DUPLICATED_EMAIL = 2;
// anytime that a DATABASE_ERROR is declared, the result should
// contain a field "details" that contains the error.sqlState
// error.sqlState - code that gives the info about what happened in db
errors.DATABASE_ERROR = 3;
errors.NOT_FOUND = 4;
errors.CONTACT_SUPPORT = 5;
errors.NOT_LOGGED_IN = 6;

/**
 * all possible messages organized by code
 */
errors.messages = {};
errors.messages[errors.OK] = "OK.";
errors.messages[errors.UNDEFINED_PROBLEM] = "Something went wrong.";
errors.messages[errors.DUPLICATED_EMAIL] = "Email already used.";
errors.messages[errors.DATABASE_ERROR] = "There was a problem. Please try again later.";
errors.messages[errors.NOT_FOUND] = "The entity was not found."; // "There is no account with that email and password."
errors.messages[errors.CONTACT_SUPPORT] = "Please contact the support and explain what happened.";
errors.messages[errors.NOT_LOGGED_IN] = "Please log in again.";

/**
 * all possible status organized by code
 */
errors.status = {};
errors.status[errors.OK] = 200;
errors.status[errors.UNDEFINED_PROBLEM] = 500; // maybe 503
errors.status[errors.DUPLICATED_EMAIL] = 409;
errors.status[errors.DATABASE_ERROR] = 500;
errors.status[errors.NOT_FOUND] = 404;
errors.status[errors.CONTACT_SUPPORT] = 500;
errors.status[errors.NOT_LOGGED_IN] = 404;

/**
 * the error returned by this function will be always the same:
 * error = {
 *    "message": "some text..." (corresponding to the code),
 *    "details": if necessary,
 *    "code": any code of the above,
 *    "status": status corresponding to the code
 * }
 *
 * @param code - error code (one of the above)
 * @param details - when code and message is insufficient, you should
 *                  send some details
 */
errors.getError = function(code, details) {
    let error = {}; error.error = {};
    error.error["message"] = errors.messages[code];
    (details ? error.error["details"] = details : null);
    error.error["code"] = code;
    error.status = errors.status[code];
    return error;
}

module.exports = errors;
