const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');

const mentors = require('../services/mentors')
const errors = require('../errors/errors');


/**
 * save mentor google access & refresh token
 * 
 */

router.post('/token/:token', [
  check("token", "Give a token").exists(),
  check('access_token', 'Give an access token').exists(),
  check('refresh_token', 'Give a refresh token').exists()
],
  async function (req, res, next) {
    let status, json;
    try {
      //validationResult(req).throw();

      let response = await mentors.saveTokens(req.app.get("database"), req.params.token , req.body);

      res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0");
      res.status(200).send();
    } catch (err) {
      console.log(err)
    }
  }
);

/**
 * retrieves mentor google access & refresh token
 */

router.get("/token/:token",
  [
    check("token", "Give a token").exists()
  ],
  async function (req, res, next) {
    let status, json = {};
    try {
      let response = await mentors.getTokens(req.app.get("database"), req.params.token)
      json = response.result[0]
    } catch (err) {
      let error = treatError(err);
      status = error.status;
      json = error.json;
    }

    res.setHeader("Cache-Control", "no-store, must-revalidate, no-cache, max-age=0")
    res.status(200).send(json)
  }
);

module.exports = router