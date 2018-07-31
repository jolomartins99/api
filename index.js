// load the environment variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const logger = require('morgan');
const createError = require('http-errors');
const bcrypt = require('bcryptjs');
const database = require('./database/database');
const cors = require('cors')

const usersRouter = require('./routes/users');
const profileRouter = require('./routes/profile');
const searchRouter = require('./routes/search');
// const teamRouter = require('./routes/team');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())
app.set('database', database);

const port = process.env.PORT || 8080;

app.use('/users', usersRouter);
app.use('/profile', profileRouter);
app.use('/search', searchRouter);
// app.use('/team', teamRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.json({
        message: err.message,
        error: err
    });
});

// module.exports = app;
app.listen(port, () => console.log('API listening on port ' + port + '!'));
module.exports = app;
