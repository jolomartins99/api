const errors = require('../errors/errors');

const mentors = new Object();

/**
 * fetches mentor id using token
 * 
 * @param db - DB connection
 * @param token - mentor token
 * 
 * @return mentorID - mentor ID 
 */

mentors.getMentorId = async function(db, token) {
  let query = "SELECT id FROM users WHERE token = ?";
  
  // let's do the query
  let response = await db.query(query, token)
  return response[0].id;
}

/**
 * saves mentor google calendar token and refresh token
 * 
 * @param db - a connection to db
 * @param token - mentor token
 * @param googleTokens - an object with the google calendar tokens to save
 * 
 * @returns status - OK if save operation took place successfully
 * 
 */

mentors.saveTokens = async function(db, token, googleTokens) {
  let id = await mentors.getMentorId(db, token);

  let rowExists = await db.query("SELECT EXISTS(SELECT 1 FROM mentors_calendar WHERE mentor_id = ?)", id);
  for(let index in rowExists) {
    for(let key in rowExists[index]) {
      rowExists = rowExists[index][key];
    }
  }

  if(rowExists) {
    // UPDATE tokens
    let params = [googleTokens.access_token, googleTokens.refresh_token, id];
    let result = await db.query("UPDATE mentors_calendar SET access_token = ?, refresh_token = ? WHERE mentor_id = ?", params);
  } else {
    // INSERT tokens
    let query = "INSERT INTO mentors_calendar (mentor_id, access_token, refresh_token) VALUES (?,?,?)",
        parameters = [id, googleTokens.access_token, googleTokens.refresh_token];
    
    let result = await db.query(query, parameters);
  }
}

/**
 * retrieves google calendar token & refresh tokens
 * 
 * @param db - DB connection
 * @param token - mentor token
 * 
 * @returns googleToken - google calendar token used to access APIs 
 */

mentors.getTokens = async function (db, token) {
  let result = {},
      query = "SELECT access_token, refresh_token FROM mentors_calendar WHERE mentor_id = ?"
  
  let id = await mentors.getMentorId(db, token)
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
    /*
    if(result[0] != undefined) {
      json = {
        access_token: result[0]["access_token"],
        refresh_token: result[0]["refresh_token"]
      }
    }*/
  } catch(err) {
    throw errors.getError(errors.DATABASE_ERROR, error.sqlState);
  }

  return result;
}

module.exports = mentors;