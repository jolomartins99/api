const express = require('express');
const { check, validationResult } = require('express-validator/check');
const router = express.Router();
const moment = require('moment');

const mentors = require('../services/mentors')
const errors = require('../errors/errors');


/**
 * save mentor acess token
 * 
 */

router.post('/token/:token', [
  check('access_token', 'Give an access token').exists(),
  check('refresh_token', 'Give a refresh token').exists()
],
  async function (req, res, next) {
    let status, json;
    try {
      validationResult(req).throw();

      let response = await mentors.saveTokens(req.app.get("database"), req.params.token , req.body);
    } catch (err) {
      console.log(err)
    }
  }
);

module.exports = router