const axios = require('axios');
const express = require("express");
const bodyParser = require("body-parser");
const dayModule = require(__dirname + "/dayModule.js");             // using the concept of "module.exports", it is now set to return a function
const sqlite3 = require('sqlite3').verbose();
const oneDay = 1000 * 60 * 60 * 24;

const app = express();                                              // instantiates express as "app"
const cookieParser = require("cookie-parser");
const sessions = require('express-session');
app.set('view engine', 'ejs');

app.use(express.static("public"));                                  // sets the "public" folder as the root to look for static files (like css and images) - http://expressjs.com/en/starter/static-files.html#serving-static-files-in-express
app.use(bodyParser.urlencoded({extended:true}));                    // The extended option allows to choose between parsing the URL-encoded data with the querystring library (when false) or the qs library (when true) - https://www.npmjs.com/package/body-parser
// https://www.sqlitetutorial.net/sqlite-nodejs/

// https://www.section.io/engineering-education/session-management-in-nodejs-using-expressjs-and-express-session/
app.use(sessions({
    secret: "SecretKeyqqqqq!!!!!ppppp-----",
    saveUninitialized:true,
    cookie: { maxAge: oneDay },
    resave: false 
}));
app.use(cookieParser());

var session;

// This code receives data from the pages index.ejs, login.ejs and change_pw.ejs. As a rule, two stringified arrays
// are received via post method from a form. One with data about the user's location and time, in order to get or
// refresh (on the DB) information about the weather via OPENMETEO API; the other depends on how the user interacted
// with the page. The data received will be processed and then inserted into the DB (SQLite). The DB is called
// "clients" and it has two tables: "clients" and "tasks":
// > The CLIENTS TABLE stores information about the user:
//      id, username, "real" name, password hash, password_changes, the previous password hash, failed login
//      attempts, successful login attempts and a 5 min timer if too many (5+) failed login attempts occur;
// > The TASKS TABLE stores information that the user will interact with or will be used in this application often:
//      id, username, "real" name, notes, routines, projects, weather, timestamp of request, GMT, GMT (iana),
//      timezone, latitude, longitude, celsius or fahrenheit, option to show weather in simplified layout


// opens DB and resolves its handler when requested by a function, to perform a set of operations...
async function openDb(in_caller = false){
    return new Promise ((resolve, reject) => {
        let db = new sqlite3.Database('./db/clients.db3', sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                console.log(`Error connecting to the database called by ${in_caller}:`,err.message)
                reject(err.message);
            } else{
                console.log(`DB - CONNECTED (called from function: ${in_caller})`)
                resolve(db)
            }
        });
    })
};

// ... and to be closed after they're done
function closeDb(db, in_caller = false) {
    db.close((err) => {
        if (err) {
            console.log(`Error closing the database connection called by ${in_caller}:`,err.message)
        } else{
            console.log(`DB - CLOSED (called from function: ${in_caller})`)
        }
    })
};

// resolves the user's id if username and password hash provided by the function caller are equals to those of stored in DB
async function checkLogin(in_username, in_p = false){
    console.log('||| CCC ||| checkLogin(' + in_username,in_p + ')');
    let db;
    try{
        db = await openDb('checkLogin');
        if (in_p){
            // that means the user is actually trying to log in and provided a valid username and password (that was already hashed by this app)
            return new Promise((resolve,reject) => {
                db.all('SELECT * FROM clients WHERE (user, pw_hash) = (?,?)', [in_username,in_p], (err, rows) => {
                    if (err){
                        console.log('Error while SELECT * FROM clients:', err.message);
                        resolve([false,db])
                    } else{
                        try{
                            let id = rows[0]['id'];
                            resolve([id,db])   
                        } catch (err){
                            console.log('Error while SELECT * FROM clients:', err.message);
                            resolve([false,db])
                        }
                    }
                })
            })
        } else{
            // user and password already did NOT match and /login is now checking if at least the username is in DB, to control access attempts
            return new Promise((resolve,reject) => {
                db.all('SELECT * FROM clients WHERE user = ?', [in_username], (err, rows) => {
                    if (err){
                        console.log('Error while SELECT * FROM clients:', err.message);
                        resolve([false,db])
                    } else{
                        try{
                            let id = rows[0]['id'];
                            resolve([id,db])   
                        } catch (err){
                            console.log('Error while SELECT * FROM clients:', err.message);
                            resolve([false,db])
                        }
                    }
                });
            })
        }
    } catch (err){ console.log('Error while db = await openDb(checkLogin):', err.message);
        if (db){ closeDb(db,'checkLogin'); db = 0
        };
        return [false,false]
    }
};

// https://youtu.be/_8gHHBlbziw
// sends the whole user's line in tasks table to the caller function do operations
async function selectFromTasksTable(in_id){
    console.log('||| STT ||| selectFromTasksTable(' + in_id + ')');
    let db;
    try{
        db = await openDb('selectFromTasksTable');
        return new Promise((resolve,reject) => {
            db.all('SELECT * FROM tasks WHERE user_id = ?', [in_id], (err, rows) => {
                if (err){
                    console.log('Error while SELECT * FROM tasks:', err.message);
                    resolve([false,db])
                } else{
                    try{
                        let tsk = rows[0];
                        resolve([tsk,db])   
                    } catch (err){
                        console.log('Error while SELECT * FROM tasks:', err.message);
                        resolve([false,db])
                    }
                }
            })
        })
    } catch (err){ console.log('Error while db = await openDb(selectFromTasksTable):', err.message);
        if (db){ closeDb(db,'selectFromTasksTable'); db = 0
        };
        return [false,false]
    }
};

// https://stackoverflow.com/a/64372513
// receives an already stringified object to update only the user's notes column in tasks table
async function updateNotesColumn(stringified_dict, in_id){
    console.log('||| UNC ||| updateNotesColumn(' + stringified_dict,in_id + ')');
    let db;
    try{
        db = await openDb('updateNotesColumn');
        return new Promise ((resolve, reject) => {
            db.run('UPDATE tasks SET notes = ? WHERE user_id = ?', [stringified_dict, in_id], function(err) {
                if (err) {
                    console.log('Error while UPDATE tasks SET notes:', err.message);
                    resolve([false,db])
                } else{
                    console.log(`UPDATE tasks SET notes - Row(s) updated: ${this.changes}`);
                    resolve([200,db])
                }
            })
        })
    } catch(err){ console.log('Error while db = await openDb(updateNotesColumn):', err.message);
        if (db){ closeDb(db,'updateNotesColumn'); db = 0
        };
        return [false,false]
    }
};

// receives an already stringified object to update only the user's routine column in tasks table
async function updateRoutinesColumn(stringified_dict, in_id, in_stringified_notes = false){
    console.log('||| URC ||| updateRoutinesColumn(' + stringified_dict,in_id,in_stringified_notes + ')');
    let db;
    try{
        db = await openDb('updateRoutinesColumn');
        if (!in_stringified_notes){
            return new Promise ((resolve, reject) => {
                db.run('UPDATE tasks SET routines = ? WHERE user_id = ?', [stringified_dict, in_id], function(err) {
                    if (err) {
                        console.log('Error while UPDATE tasks SET routines:', err.message);
                        resolve([false,db])
                    } else{
                        console.log(`UPDATE tasks SET routines - Row(s) updated: ${this.changes}`);
                        resolve([200,db])
                    }
                })
            })
        } else{
            return new Promise ((resolve, reject) => {
                db.run('UPDATE tasks SET (routines,notes) = (?,?) WHERE user_id = ?', [stringified_dict, in_stringified_notes, in_id], function(err) {
                    if (err) {
                        console.log('Error while UPDATE tasks SET (routines,notes):', err.message);
                        resolve([false,db])
                    } else{
                        console.log(`UPDATE tasks SET (routines,notes) - Row(s) updated: ${this.changes}`);
                        resolve([200,db])
                    }
                })
            })
        }
    } catch(err){
        console.log('Error while db = await openDb(updateRoutinesColumn):', err.message)
        if (db){ closeDb(db,'updateRoutinesColumn')
        };
        return [false,false]
    }
};

async function updateProjects(in_id, in_projects){
    console.log('||| UPr ||| updateProjects(' + in_id,in_projects + ')');
    let db;
    try{
        db = await openDb('updateProjects');
        return new Promise ((resolve, reject) => {
            db.run('UPDATE tasks SET (projects) = ? WHERE user_id = ?', [in_projects, in_id], function(err) {
                if (err) {
                    console.log('Error while UPDATE tasks SET (projects):', err.message);
                    resolve([false,db])
                } else{
                    console.log(`UPDATE tasks SET (projects) - Row(s) updated: ${this.changes}`);
                    resolve([200,db])
                }
            })
        })
    } catch(err){
        console.log('Error while UPDATE tasks SET (projects):', err.message);
        if (db){ closeDb(db,'updateProjects'); db = 0
        };
        return [false,false]
    }
};

// FUNCTIONS THAT MANAGES NOTES:
// receives an array from post/home, calls selectFromTasksTable to insert a new note, returns 200 if sucessful
async function insertNewNote(in_key, in_text, in_id){
    console.log('>>> INN >>> insertNewNote(' + in_key,in_text,in_id + ')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        let x_db = tasks_raw2[1];
        try{ closeDb(x_db,'insertNewNote A*')
        } catch (err){ console.log('Error while closeDb(x_db,insertNewNote A*):', err.message)
        } finally{
            let notes_parsed = JSON.parse(tasks_raw['notes']);
            if (notes_parsed && (Object.keys(notes_parsed).length) < 3000){             // impedes insertion if there are more than 3000 keys in the notes object
                let day_array = notes_parsed[in_key];
                let notes_array = day_array['notes'];
                if (notes_array.length < 15){                                           // impedes insertion if there are more than 15 notes in the same day
                    for (let i = 0; i < in_text.length; i++){
                        let TIMEZONE = tasks_raw['tmz'];
                        let day_obj = new Date(in_key+TIMEZONE);
                        let day_string = day_obj.toString();
                        notes_array.push([in_text[i], Date.now(), ( day_string.slice(0,3) + ',' + day_string.slice(3,10) )])
                    };
                    day_array['notes'] = notes_array;
                    notes_parsed[in_key] = day_array;
                    let new_notes_string = JSON.stringify(notes_parsed);                // will insert into DB
                    let x_db2;
                    try{
                        let result = await updateNotesColumn(new_notes_string, in_id);
                        let false_or_200 = result[0];
                        x_db2 = result[1]
                        try{ closeDb(x_db2,'insertNewNote B*'); x_db = 0
                        } catch (err){ console.log('Error while closeDb(x_db2,insertNewNote B*):', err.message)
                        } finally{ return false_or_200                
                        }
                    } catch(err){ console.log('Error while updateNotesColumn(new_notes_string, in_id):', err.message);
                        if(x_db2){ closeDb(x_db2, 'Error while updateNotesColumn(new_notes_string, in_id)')
                        };
                        return false
                    }
                } else{ return false
                }
            } else{ console.log('Denied insertion since there are more than 3000 keys already'); return false
            }
        }
    } catch(err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if(x_db){ closeDb(x_db,'Error while selectFromTasksTable( in_id )');
        };
        return false
    }
};

async function editNote(in_key, in_text, in_timestamp, in_id){
    console.log('>>> EdN >>> editNote(' + in_key,in_text,in_timestamp,in_id + ')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id )
        let tasks_raw = tasks_raw2[0];
        let x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'editNote A*')
        } catch(err){ console.log('Error while closeDb(x_db, editNote A*):', err.message)
        } finally{
            let notes_parsed = JSON.parse(tasks_raw['notes']);
            let day_array = notes_parsed[in_key];
            let notes_array = day_array['notes'];
            for (let l = 0; l < notes_array.length; l++){
                if (notes_array[l][1] == in_timestamp){                 // edits the note using its unique timestamp, not its text
                    notes_array[l][0] = in_text
                }
            };
            day_array['notes'] = notes_array;
            notes_parsed[in_key] = day_array;
            let new_notes_string = JSON.stringify(notes_parsed);        // will insert into DB
            let x_db2;
            try{
                let result = await updateNotesColumn(new_notes_string, in_id)
                let false_or_200 = result[0];
                x_db2 = result[1];
                try{ closeDb(x_db2, 'editNote B*')
                } catch(err){ console.log('Error while closeDb(x_db, editNote B*):', err.message)
                } finally{ return false_or_200
                }
            } catch (err){ console.log('Error while updateNotesColumn(new_notes_string, in_id):', err.message);
                if (x_db2){ closeDb(x_db2, 'Error while updateNotesColumn(new_notes_string, in_id)')
                };
                return false
            }
        }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){ closeDb(x_db, 'Error while selectFromTasksTable( in_id )')
        };
        return false
    }
};

async function removeNote(in_key, in_timestamp, in_id){
    console.log('>>> RmN >>> removeNote(' + in_key,in_timestamp,in_id + ')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'removeNote A*')
        } catch (err){ console.log('Error while closeDb(x_db, removeNote A*):', err.message)
        } finally{
            let notes_parsed = JSON.parse(tasks_raw['notes']);
            let day_array = notes_parsed[in_key];
            let notes_array = day_array['notes'];
            for (let m = 0; m < notes_array.length; m++){
                if (notes_array[m][1] == in_timestamp){                 // remves the note using its unique timestamp, not its text
                    notes_array.splice(m, 1);    
                }
            };
            if (notes_array.length > 0){
                day_array['notes'] = notes_array;
                notes_parsed[in_key] = day_array;
            } else{
                delete notes_parsed[in_key]
            };
            // https://stackoverflow.com/a/5737136/21113444             deletes other days that have no notes whatsoever
            for (const [key, value] of Object.entries(notes_parsed)) {
                if(value['notes'] == [] || value['notes'].length < 1){
                    delete notes_parsed[key]
                }
            };
            let new_notes_string = JSON.stringify(notes_parsed);        // will insert into DB
            let x_db2;
            try{
                let result = await updateNotesColumn(new_notes_string, in_id);
                let false_or_200 = result[0];
                x_db2 = result[1]
                try{ closeDb(x_db2, 'removeNote B*')
                } catch (err){ console.log('Error while closeDb(x_db, removeNote B*):', err.message)
                } finally{ return false_or_200
                }
            } catch (err){ console.log('Error while updateNotesColumn(new_notes_string, in_id):', err.message);
                if (x_db2){ closeDb(x_db2, 'Error while updateNotesColumn(new_notes_string, in_id)')
                };
                return false
            }
        }        
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){ closeDb(x_db, 'Error while selectFromTasksTable( in_id )')
        };
        return false
    }
};

// FUNCTIONS THAT MANAGES ROUTINES:
// both highlight and unhighlight, weekly and "unweekly", monthly and "unmonthly" are received by this function
async function insertNewRoutine(in_id, in_key, in_timestamp, in_text, week_month_high){
    console.log('>>> INR >>> insertNewRoutine('+in_id, in_key, in_timestamp, in_text, week_month_high+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1]
        try{ closeDb(x_db, 'insertNewRoutine A*'); x_db = 0
        } catch (err){ console.log('Error while closeDb(x_db, insertNewRoutine A*):', err.message)
        } finally{
            let notes_parsed = JSON.parse(tasks_raw['notes']);
            let routines_parsed = JSON.parse(tasks_raw['routines']);
            in_timestamp = parseInt(in_timestamp);
            let TIMEZONE = tasks_raw.tmz;            
            if (!(Object.keys(routines_parsed)) || (Object.keys(routines_parsed).length) < 3 || routines_parsed == undefined){
                routines_parsed['weekly'] = {};
                routines_parsed['monthly'] = {};
                routines_parsed['highlight'] = {};
            };            
            if (week_month_high[0] == 'u'){                                 // if it starts with "u", then it is to remove a routine
                week_month_high = week_month_high.slice(2,);
                let buffer_obj = routines_parsed[week_month_high];
                if (notes_parsed[in_key]){
                    if (week_month_high == 'highlight'){
                        let buffer_tasks = buffer_obj[in_key];
                        for (let k = 0; k < buffer_tasks.length; k++){
                            if (buffer_tasks[k][1] == in_timestamp){        // highlighted notes are identified by timestamp
                                buffer_tasks.splice(k,1);                   // removes it
                            }
                        };
                        buffer_obj[in_key] = buffer_tasks
                    } else if (week_month_high == 'weekly'){
                        let weekday = new Date(in_key + TIMEZONE).getDay();
                        let buffer_tasks = buffer_obj[weekday];
                        for (let k = 0; k < buffer_tasks.length; k++){
                            if (buffer_tasks[k] == in_text){                // weekly notes are identified by their text
                                buffer_tasks.splice(k,1);                   // removes it
                            }
                        };
                        buffer_obj[weekday] = buffer_tasks
                    } else if (week_month_high == 'monthly'){
                        let day = new Date(in_key + TIMEZONE).getDate();
                        let buffer_tasks = buffer_obj[day];
                        for (let k = 0; k < buffer_tasks.length; k++){
                            if (buffer_tasks[k] == in_text){                // monthly notes are identified by their text
                                buffer_tasks.splice(k,1);                   // removes it
                            }
                        };
                        buffer_obj[day] = buffer_tasks
                    }
                } else{
                    if (week_month_high = 'highlight'){                     // if there is a void key, delete it
                        delete buffer_obj[in_key]
                    } else if (week_month_high == 'weekly'){
                        delete buffer_obj[new Date(in_key + TIMEZONE).getDay()]
                    } else if (week_month_high == 'monthly'){
                        delete buffer_obj[new Date(in_key + TIMEZONE).getDate()]
                    }
                }
                for (const [key, value] of Object.entries(buffer_obj)) {    // if there is a void key, delete it
                    if(value == [] || value.length < 1){
                        delete buffer_obj[key]
                    }
                };
                routines_parsed[week_month_high] = buffer_obj;
                let new_notes_string = JSON.stringify(routines_parsed);     // will insert into DB
                let x_db2;
                try{
                    let result = await updateRoutinesColumn(new_notes_string, in_id)    
                    let false_or_200 = result[0];
                    x_db2 = result[1];
                    try{ closeDb(x_db2, 'insertNewRoutine B*')
                    } catch (err){ console.log('Error while closeDb(x_db2, insertNewRoutine B*):', err.message)
                    } finally{ return false_or_200
                    }                    
                } catch (err){ console.log('Error while updateRoutinesColumn(new_notes_string, in_id):', err.message);
                    if(x_db2){ closeDb(x_db2,'Error while updateRoutinesColumn(new_notes_string, in_id)')
                    };
                    return false
                }    
            } else {

                let buffer_obj = routines_parsed[week_month_high];
                let day_obj;
                if (week_month_high == 'highlight'){
                    try{
                        buffer_obj[in_key].push([in_text, in_timestamp])        // key already present - inserts the highlited note with its timestamp
                    } catch{
                        buffer_obj[in_key] = [[in_text, in_timestamp]]          // key was yet not present - inserts the highlited note with its timestamp
                    }
                } else if (week_month_high == 'weekly'){
                    day_obj = new Date (in_key + TIMEZONE);
                    try{
                        buffer_obj[day_obj.getDay()].push(in_text)              // key already present - inserts the weekly note
                    } catch{
                        buffer_obj[day_obj.getDay()] = [in_text]                // key was not yet present - inserts the weekly note
                    } finally{
                        for (let w = 1; w < 4; w++){                            // inserts three more weekly notes in the future - the rest will be added as the user
                            let current_mili = day_obj.getTime();               // navigates the calendar or as time passes and a day scheduled to have the weekly
                            let week_after = current_mili + (w * 604800000);    // note comes naturally
                            let new_day = new Date(week_after);
                            let day_string = new_day.toString();
                            let new_key = (new_day.toISOString()).slice(0,10);
                            if (notes_parsed[new_key]){
                                let day_notes = notes_parsed[new_key]['notes'];
                                let create_new = true;
                                for (let i = 0; i < day_notes.length; i++){
                                    if (day_notes[i] == in_text){
                                        create_new = false
                                    }
                                }
                                if (create_new){
                                    day_notes.push([in_text, Date.now(), day_string.slice(0,3)+','+day_string.slice(3,10)])
                                }
                                notes_parsed[new_key]['notes'] = day_notes
                            } else{
                                let day = new_day.getDate();
                                if (day < 10){
                                    day = "0" + day.toString()
                                } else{
                                    day = day.toString()
                                }
                                notes_parsed[new_key] = {"YYYY-MM-DD" : new_key , "weekday" : new_day.getDay() , "day" : day , "notes" : [[in_text, Date.now(), day_string.slice(0,3)+','+day_string.slice(3,10)]] }
                            }
                        }
                    }

                } else if (week_month_high == 'monthly'){

                    day_obj = new Date (in_key + TIMEZONE);
                    let old_day = day_obj.getDate();
                    let old_month = day_obj.getMonth() +1;
                    try{
                        buffer_obj[old_day].push(in_text)                       // key already present - inserts the monthly note
                    } catch{
                        buffer_obj[old_day] = [in_text]                         // key was not yet present - inserts the monthly note
                    } finally{
                        let buffer_month = parseInt(in_key.slice(5,7))+1;       // starts the process of adding 1 additional monthly note in the future
                        let buffer_key;
                        if (buffer_month < 13){                                 // month cannot be > 12
                            if (buffer_month < 10){
                                buffer_month = "0" + buffer_month.toString()
                            } else{
                                buffer_month = buffer_month.toString()
                            }
                            buffer_key = in_key.slice(0,5)+buffer_month+in_key.slice(7,);
                        } else{
                            let new_year = (parseInt(in_key.slice(0,4))+1).toString();
                            buffer_key = new_year+"-01-"+in_key.slice(8,)
                        };
                        let new_date = new Date(buffer_key + TIMEZONE);         // the new_date to create a monthly note in the future...
                        let buf_new_month = new_date.getMonth() + 1;
                        while(old_month +1 < buf_new_month){                    // ...can be wrong if the day is 31 in a 30-day month, for example
                            let buf_mili = new_date.getTime() - 86400000;       // the correction is to diminish 1 day per iteration until the note
                            new_date = new Date(buf_mili);                      // is set to a month + 1. So if a user sets a task to a day "31",
                            buf_new_month = new_date.getMonth() + 1;            // in february this note will be added to day "28" or "29", if
                        };                                                      // there is a FEB-29 day in that year

                        let new_key = (new_date.toISOString()).slice(0,10);
                        let day_string = new_date.toString();
                        if (notes_parsed[new_key]){                             // key already present
                            let day_notes = notes_parsed[new_key]['notes'];
                            let create_new = true;
                            for (let i = 0; i < day_notes.length; i++){
                                if (day_notes[i] == in_text){
                                    create_new = false                          // if a note with the same text is already there, none will be created
                                }
                            };
                            if (create_new){
                                day_notes.push([in_text, Date.now(), day_string.slice(0,3)+','+day_string.slice(3,10) ])    // creates new note
                            };
                            notes_parsed[new_key]['notes'] = day_notes
                        } else{                                                 // key was not yet present
                            let day = new_date.getDate();
                            if (day < 10){
                                day = "0" + day.toString()
                            } else{
                                day = day.toString()
                            };
                            notes_parsed[new_key] = {"YYYY-MM-DD" : new_key , "weekday" : new_date.getDay() , "day" : day , "notes" : [[in_text, Date.now(), day_string.slice(0,3)+','+day_string.slice(3,10)]]}
                        }                        
                    }
                };
                routines_parsed[week_month_high] = buffer_obj;
                let new_routines_string = JSON.stringify(routines_parsed);      // will insert into DB
        
                if (week_month_high == 'weekly' || week_month_high == 'monthly'){
                    let new_notes_string = JSON.stringify(notes_parsed);
                    let x_db3;
                    try{
                        let result = await updateRoutinesColumn(new_routines_string, in_id, new_notes_string);
                        let false_or_200 = result[0];
                        x_db3 = result[1];
                        try{ closeDb(x_db3, 'insertNewRoutine C*')
                        } catch (err){ console.log('Error while closeDb(x_db3, insertNewRoutine C*):', err.message)
                        } finally{ return false_or_200
                        }
                    } catch (err){ console.log('Error while updateRoutinesColumn(new_routines_string, in_id, new_notes_string):', err.message);
                        if (x_db3){ closeDb(x_db3, 'Error while updateRoutinesColumn(new_routines_string, in_id, new_notes_string)')
                        };
                        return false
                    }
                };
                let x_db4;
                try{
                    let result = await updateRoutinesColumn(new_routines_string, in_id);
                    let false_or_200 = result[0];
                    x_db4 = result[1];
                    try{ closeDb(x_db4, 'insertNewRoutine D*')
                    } catch (err){ console.log('Error while closeDb(x_db4, insertNewRoutine D*)', err.message)
                    } finally{ return false_or_200
                    }
                } catch (err){ console.log('Error while updateRoutinesColumn(new_routines_string, in_id):', err.message);
                    if (x_db4){ closeDb(x_db4, 'Error while updateRoutinesColumn(new_routines_string, in_id)')
                    };
                    return false
                }
            }
        }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){ closeDb(x_db)
        };
        return false
    }
};

async function editRoutine(in_key, in_new_text, in_old_text, in_timestamp, week_month_both, in_id){
    console.log('>>> EdR >>> editRoutine('+in_key, in_new_text, in_old_text, in_timestamp, week_month_both, in_id+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'editRoutine A*')
        } catch (err){ console.log('Error while closeDb(x_db, editRoutine A*):', err.message)
        } finally{
            let routines_parsed = JSON.parse(tasks_raw['routines']);
            let notes_parsed = JSON.parse(tasks_raw['notes']);
            let TIMEZONE = tasks_raw.tmz;
            let day_obj = new Date (in_key + TIMEZONE);
            let buffer_obj, day_key;
            if (routines_parsed[week_month_both]){                          // if key is "weekly" or "monthly" (there is no "both" key)
                buffer_obj = routines_parsed[week_month_both];
                if (week_month_both == 'weekly'){
                    day_key = day_obj.getDay()
                } else{
                    day_key = day_obj.getDate()
                };
                for (let a = 0; a < buffer_obj[day_key].length; a++){
                    if (buffer_obj[day_key][a] == in_old_text){
                        buffer_obj[day_key][a] = in_new_text;               // substitutes text in the routines buffer object
                        break
                    }
                };
                if (week_month_both == 'weekly'){
                    for (const [key, value] of Object.entries(notes_parsed)) {
                        if(value['weekday'] == day_key){
                            let value_notes = value['notes'];
                            for (let i = 0; i < value_notes.length; i++){
                                if (value_notes[i][0] == in_old_text){
                                    value_notes[i][0] = in_new_text;        // substitutes text in the (already existing) notes buffer object
                                    value_notes[i][1] = Date.now()
                                    break
                                }
                            }
                            value['notes'] = value_notes
                        }
                    }
                } else if (week_month_both == 'monthly'){
                    for (const [key, value] of Object.entries(notes_parsed)) {
                        if(value['day'] == day_key){
                            let value_notes = value['notes'];
                            for (let i = 0; i < value_notes.length; i++){
                                if (value_notes[i][0] == in_old_text){
                                    value_notes[i][0] = in_new_text;        // substitutes text in the (already existing) notes buffer object
                                    value_notes[i][1] = Date.now()
                                    break
                                }
                            }
                            value['notes'] = value_notes
                        }
                    }
                };
                routines_parsed[week_month_both] = buffer_obj;
                let new_routines_string = JSON.stringify(routines_parsed);
                let new_notes_string = JSON.stringify(notes_parsed);        // will insert into DB
                let x_db2;
                try{
                    let result = await updateRoutinesColumn(new_routines_string, in_id, new_notes_string)
                    let false_or_200 = result[0];
                    x_db2 = result[1];
                    try{ closeDb(x_db2, 'editRoutine B*')
                    } catch (err){ console.log('Error while closeDb(x_db2, editRoutine B*):', err.message)
                    } finally{ return false_or_200
                    }
                } catch (err){ console.log('Error while updateRoutinesColumn(new_routines_string, in_id, new_notes_string):', err.message);
                    return false
                }

            } else{                                                         // if key is "both"

                buffer_obj = routines_parsed['weekly'];
                day_key = day_obj.getDay();
                for (let a = 0; a < buffer_obj[day_key].length; a++){
                    if (buffer_obj[day_key][a] == in_old_text){
                        buffer_obj[day_key][a] = in_new_text;               // substitutes text in the routines buffer object
                        break
                    }
                };
                let buffer_obj2 = routines_parsed['monthly'];
                let day_key2 = day_obj.getDate();
                for (let b = 0; b < buffer_obj2[day_key2].length; b++){
                    if (buffer_obj2[day_key2][b] == in_old_text){
                        buffer_obj2[day_key2][b] = in_new_text;             // substitutes text in the routines buffer object
                        break
                    }
                };
                for (const [key, value] of Object.entries(notes_parsed)) {
                    if(value['weekday'] == day_key){
                        let value_notes = value['notes'];
                        for (let i = 0; i < value_notes.length; i++){
                            if (value_notes[i][0] == in_old_text){
                                value_notes[i][0] = in_new_text;            // substitutes text in the (already existing) notes buffer object
                                value_notes[i][1] = Date.now()
                                break
                            }
                        }
                        value['notes'] = value_notes
                    } else if(value['day'] == day_key2){
                        let value_notes = value['notes'];
                        for (let i = 0; i < value_notes.length; i++){
                            if (value_notes[i][0] == in_old_text){
                                value_notes[i][0] = in_new_text;            // substitutes text in the (already existing) notes buffer object
                                value_notes[i][1] = Date.now()
                                break
                            }
                        }
                        value['notes'] = value_notes
                    }
                };
                routines_parsed['weekly'] = buffer_obj;
                routines_parsed['monthly'] = buffer_obj2;
                let new_routines_string = JSON.stringify(routines_parsed);  // will insert into DB
                let new_notes_string = JSON.stringify(notes_parsed);        // will insert into DB
                let x_db3;
                try{
                    let result = await updateRoutinesColumn(new_routines_string, in_id, new_notes_string);
                    let false_or_200 = result[0];
                    x_db3 = result[1];
                    try{ closeDb(x_db3, 'editRoutine C*')
                    } catch (err){ console.log('Error while closeDb(x_db3, editRoutine C*)', err.message)
                    } finally{ return false_or_200
                    }
                } catch (err){ console.log('Error while closeDb(x_db3, editRoutine C*)', err.message);
                    if (x_db3){ closeDb(x_db3)
                    };
                    return false
                }
            }
        }
    } catch (err){ console.log('Error while await selectFromTasksTable( in_id )', err.message);
        return false
    }
};

// FUNCTIONS THAT MANAGES PROJECTS:
async function insertNewProject(in_dict, in_id){
    console.log('>>> INP >>> insertNewProject(' + in_dict,in_id + ')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'insertNewProject A*')
        } catch (err){ console.log('Error while closeDb(x_db, insertNewProject A*):', err.message)
        } finally{
            let projects_parsed = JSON.parse(tasks_raw['projects']);
            projects_parsed.push(in_dict);                                  // inserts new project into projects object
            let new_projects = JSON.stringify(projects_parsed);             // will insert into DB
            let db;
            try{
                db = await openDb('insertNewProject');
                return new Promise((resolve,reject) => {
                    db.run('UPDATE tasks SET projects = ? WHERE user_id = ?', [new_projects, in_id], function(err) {
                        if (err) { console.log('Error while UPDATE tasks SET projects:', err.message);
                            resolve([false,db])
                        } else{ console.log(` UPDATE tasks SET projects - Row(s) updated: ${this.changes}`);
                            resolve([200,db])
                        }
                    })
                })
            } catch (err){
                console.log('Error while openDb(insertNewProject):', err.message);
                if (db){ closeDb(db,'insertNewProject B*')
                };
                return [false,false]
            }
        }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){ closeDb(x_db,'Error while selectFromTasksTable( in_id ):')
        };
        return [false,false]
    }
};

// changes a project's task status from "todo" to "done" or vice-versa
async function changeProjectTaskDoneTodo(in_id, in_project_index, in_old_text, todo_done){
    console.log('>>> CPT >>> changeProjectTaskDoneTodo('+in_id, in_project_index, in_old_text,todo_done+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'changeProjectTaskDoneTodo A*')
        } catch (err){ console.log('Error while closeDb(x_db, changeProjectTaskDoneTodo A*)', err.message) 
        } finally{
            let projects_parsed = JSON.parse(tasks_raw['projects']);
            let buffer_project = projects_parsed[in_project_index];
            let done_array = buffer_project['tasks_done'];
            let todo_array = buffer_project['tasks_todo'];    
            if (todo_done == 'done'){
                for (let i = 0; i < done_array.length; i++){
                    if (done_array[i]['task'] == in_old_text){
                        todo_array.unshift(done_array[i]);                  // puts the newly "done" task as first element
                        done_array.splice(i,1);
                    }
                }
            } else if (todo_done == 'todo'){
                for (let i = 0; i < todo_array.length; i++){
                    if (todo_array[i]['task'] == in_old_text){
                        done_array.push(todo_array[i]);                     // puts the newly "todo" task as last element
                        todo_array.splice(i,1);
                    }
                }
            }
            buffer_project['tasks_done'] = done_array;
            buffer_project['tasks_todo'] = todo_array;
            projects_parsed[in_project_index] = buffer_project;             // will insert into DB
            let x_db2;
            try{
                let result = await updateProjects(in_id,JSON.stringify(projects_parsed));
                let false_or_200 = result[0];
                x_db2 = result[1];
                try{ closeDb(x_db2, 'changeProjectTaskDoneTodo B*')
                } catch (err){ console.log('Error while closeDb(x_db2, changeProjectTaskDoneTodo B*):', err.message)
                } finally{ return false_or_200
                }
            } catch (err){ console.log('Error while updateProjects(in_id,JSON.stringify(projects_parsed)):', err.message);
                if (x_db2){ closeDb(x_db2,'Error while updateProjects(in_id,JSON.stringify(projects_parsed))')
                };
                return false
            }
        }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if(x_db){ closeDb(x_db, 'Error while selectFromTasksTable( in_id ):')
        };
        return false
    }
};

async function removeProjectTask(in_id, in_project_index, in_old_text, todo_done){
    console.log('>>> RPT >>> removeProjectTask('+in_id, in_project_index, in_old_text,todo_done+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'removeProjectTask A*')
        } catch (err){ console.log('Error while closeDb(x_db, removeProjectTask A*):', err.message)
        } finally{
            let projects_parsed = JSON.parse(tasks_raw['projects']);
            let buffer_project = projects_parsed[in_project_index];
            let buffer_array = buffer_project['tasks_'+todo_done];
            for (let i = 0; i < buffer_array.length; i++){
                if (buffer_array[i]['task'] == in_old_text){
                    buffer_array.splice(i,1);                               // removes the task
                    break
                }
            };
            buffer_project['tasks_'+todo_done] = buffer_array;
            projects_parsed[in_project_index] = buffer_project;             // will insert into DB
            let x_db2;
            try{
                let result = await updateProjects(in_id,JSON.stringify(projects_parsed));
                let false_or_200 = result[0];
                x_db2 = result[1];
                try{ closeDb(x_db2, 'removeProjectTask B*')
                } catch (err){ console.log('Error while closeDb(x_db2, removeProjectTask B*):', err.message)
                } finally{ return false_or_200
                }
            } catch (err){ console.log('Error while updateProjects(in_id,JSON.stringify(projects_parsed)):', err.message);
                if (x_db2){ closeDb(x_db2, 'Error while updateProjects(in_id,JSON.stringify(projects_parsed))')
                };
                return false
            }
        }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){closeDb(x_db, 'Error while selectFromTasksTable( in_id )')
        };
        return false
    }
};

async function editTaskObs(in_id, in_project_index, in_old_text, todo_done, in_obs){
    console.log('>>> ETO >>> editTaskObs('+in_id, in_project_index, in_old_text,todo_done, in_obs+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'editTaskObs A*')
        } catch (err){ console.log('Error while closeDb(x_db, editTaskObs A*):', err.message)
        } finally{
            let projects_parsed = JSON.parse(tasks_raw['projects']);
            let buffer_project = projects_parsed[in_project_index];
            let buffer_array = buffer_project['tasks_'+todo_done];
            for (let i = 0; i < buffer_array.length; i++){
                if (buffer_array[i]['task'] == in_old_text){                // checks the task text...
                    buffer_array[i]['obs'] = in_obs;                        // and changes its observation field
                    break
                }
            };
            buffer_project['tasks_'+todo_done] = buffer_array;
            projects_parsed[in_project_index] = buffer_project;
            let x_db2;
            try{
                let result = await updateProjects(in_id,JSON.stringify(projects_parsed))
                let false_or_200 = result[0];
                x_db2 = result[1]
                try{ closeDb(x_db2, 'editTaskObs B*')
                } catch (err){ console.log('Error while closeDb(x_db2, editTaskObs B*):', err.message)
                } finally{ return false_or_200
                }
            } catch (err){ console.log('Error while updateProjects(in_id,JSON.stringify(projects_parsed)):', err.message);
                if (x_db2){closeDb(x_db2,'Error while updateProjects(in_id,JSON.stringify(projects_parsed))')
                };
                return false
            }
        }
    } catch (err){ console.log('>>> ETO >4>', err.message);
        if (x_db){closeDb(x_db,'Error while selectFromTasksTable( in_id )')
        };
        return false
    }

};

async function editProjectTitleAndDeadline(in_id, in_project_index, in_deadline, in_title){
    console.log('>>> EPT >>> editProjectTitleAndDeadline('+in_id, in_project_index, in_deadline, in_title+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'editProjectTitleAndDeadline A*')
        } catch (err){ console.log('Error while closeDb(x_db, editProjectTitleAndDeadline A*):', err.message)
        } finally{
            let projects_parsed = JSON.parse(tasks_raw['projects']);
            let buffer_project = projects_parsed[in_project_index];
            if (in_deadline && in_deadline != ""){                                  // if there is a new deadline...
                buffer_project['final_deadline'] = in_deadline                      // ... it substitutes the old one
            };
            if (in_title && in_title.length < 26 && in_title != ""){                // if there is a new title...    
                buffer_project['title'] = in_title                                  // ... it substitutes the old one
            };
            projects_parsed[in_project_index] = buffer_project;                     // will insert into DB
            let x_db2;
            try{
                let result = await updateProjects(in_id,JSON.stringify(projects_parsed))
                let false_or_200 = result[0];
                x_db2 = result[1]
                try{ closeDb(x_db2, 'editProjectTitleAndDeadline B*')
                } catch (err){ console.log('Error while closeDb(x_db2, editProjectTitleAndDeadline B*):', err.message)
                } finally{ return false_or_200
                }
            } catch (err){ console.log('Error while updateProjects(in_id,JSON.stringify(projects_parsed)):', err.message);
                if (x_db2){closeDb(x_db2,'Error while updateProjects(in_id,JSON.stringify(projects_parsed))')
                };
                return false
            }
        }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){closeDb(x_db, 'Error while selectFromTasksTable( in_id )')
        };
        return false
    }
};

async function deleteProject(in_project_index, in_id){
    console.log('>>> DlP >>> deleteProject('+in_project_index, in_id+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
        let tasks_raw = tasks_raw2[0];
        x_db = tasks_raw2[1];
        try{ closeDb(x_db, 'deleteProject A*')
        } catch (err){ console.log('Error while closeDb(x_db, deleteProject A*):', err.message)
        } finally{
            let projects_parsed = JSON.parse(tasks_raw['projects']);
            projects_parsed.splice(in_project_index,1);                             // deletes the whole Project in the buffer object and will insert to DB
            let x_db2;
            try{
                let result = await updateProjects(in_id,JSON.stringify(projects_parsed));
                let false_or_200 = result[0];
                x_db2 = result[1]
                try{ closeDb(x_db2, 'deleteProject B*')
                } catch (err){ console.log('Error while closeDb(x_db2, deleteProject B*):', err.message)
                } finally{ return false_or_200
                }
            } catch (err){ console.log('Error while updateProjects(in_id,JSON.stringify(projects_parsed)):', err.message);
                if (x_db2){closeDb(x_db2,'Error while updateProjects(in_id,JSON.stringify(projects_parsed))')
                };
                return false
            }
        }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){closeDb(x_db, 'Error while selectFromTasksTable( in_id )')
        };
        return false
    }
};

async function receiveProjectTask(in_id, in_project_index, in_old_text, todo_done, in_edit_task_text, in_new_task_before, in_new_task_after, in_new_deadline){
    console.log('>>> RPT >>> receiveProjectTask('+in_id, in_project_index, in_old_text,todo_done, in_edit_task_text, in_new_task_before, in_new_task_after, in_new_deadline+')');
    let x_db;
    try{
        let tasks_raw2 = await selectFromTasksTable( in_id );
            let tasks_raw = tasks_raw2[0];
            x_db = tasks_raw2[1];
            try{ closeDb(x_db, 'receiveProjectTask A*')
            } catch (err){ console.log('Error while closeDb(x_db, receiveProjectTask A*):', err.message)
            } finally{
                let projects_parsed = JSON.parse(tasks_raw['projects']);
                let buffer_project = projects_parsed[in_project_index];
                
                if (in_edit_task_text && in_edit_task_text != ''){                  // if the action required is to edit a task...
                    let buffer_tasks = buffer_project['tasks_'+todo_done];
                    for (let i = 0; i < buffer_tasks.length; i++){                  // ...it iterates the tasks buffer object
                        if (buffer_tasks[i]['task'] == in_old_text){                // if the text match...
                            buffer_tasks[i]['task'] = in_edit_task_text;            // ...the text is substituted
                            break
                        }
                    }
                    buffer_project['tasks_'+todo_done] = buffer_tasks
                }
                if (in_new_task_before && in_new_task_before != ''){                // if the action required is to add a task before
                    let new_task_index;
                    for (let i = 0; i < buffer_project['tasks_'+todo_done].length; i++){
                        if (buffer_project['tasks_'+todo_done][i]['task'] == in_old_text){
                            new_task_index = i
                            break
                        }
                    }
                    buffer_project['tasks_'+todo_done].splice(new_task_index, 0, {"task" : in_new_task_before , "obs" : "" , "deadline" : false });
                }
                if (in_new_task_after && in_new_task_after != ''){                  // if the action required is to add a task after
                    if (todo_done == 'todo'){
                        let new_task_index;
                        for (let i = 0; i < buffer_project['tasks_todo'].length; i++){
                            if (buffer_project['tasks_todo'][i]['task'] == in_old_text){
                                new_task_index = i+1
                                break
                            }
                        }
                        buffer_project['tasks_todo'].splice(new_task_index, 0, {"task" : in_new_task_after , "obs" : "" , "deadline" : false });
                    } else{
                        buffer_project['tasks_todo'].splice(0, 0, {"task" : in_new_task_after , "obs" : "" , "deadline" : false });
                    }
                }
                if (in_new_deadline && in_new_deadline != ''){                      // if the action required is to change a task's deadline...
                    let buffer_array = buffer_project['tasks_'+todo_done];
                    let buf_task;
                    let new_timestamp = new Date(in_new_deadline).getTime();
                    if (buffer_array.length == 1){
                        buffer_array[0]['deadline'] = in_new_deadline
                    } else{
                        for (let i = 0; i < buffer_array.length; i++){
                            if (buffer_array[i]['task'] == in_old_text){
                                buf_task = buffer_array[i];
                                buf_task['deadline'] = in_new_deadline;
                                buffer_array.splice(i,1)                            // ...it will first remove it from its current position...
                                break
                            }
                        };
                        for (let j = 0; j < buffer_array.length; j++){
                            if (j == buffer_array.length -1){
                                buffer_array.splice(j,0,buf_task);                  // (this will only be executed if the new deadline is the most late of all tasks)
                                break
                            }
                            let buf_ddl = buffer_array[j]['deadline'];
                            if (buf_ddl && buf_ddl != "false"){
                                if (new Date(buf_ddl).getTime() < new_timestamp){
                                    continue
                                } else{
                                    buffer_array.splice(j,0,buf_task);              // ...to add it in the correct position regarding the other tasks deadlines
                                    break
                                }
                            }
                        }
                    };
                    buffer_project['tasks_'+todo_done] = buffer_array
                };
                projects_parsed[in_project_index] = buffer_project;                 // will insert it into DB
                let x_db2;
                try{
                    let result = await updateProjects(in_id,JSON.stringify(projects_parsed));
                    let false_or_200 = result[0];
                    x_db2 = result[1]
                    try{ closeDb(x_db, 'receiveProjectTask B*')
                    } catch (err){ console.log('Error while closeDb(x_db, receiveProjectTask B*):', err.message)
                    } finally{ return false_or_200
                    }
                } catch (err){ console.log('Error while updateProjects(in_id,JSON.stringify(projects_parsed)):', err.message);
                    if (x_db2){closeDb(x_db2, 'Error while updateProjects(in_id,JSON.stringify(projects_parsed))')
                    };
                    return false
                }
            }
    } catch (err){ console.log('Error while selectFromTasksTable( in_id ):', err.message);
        if (x_db){closeDb(x_db, 'Error while selectFromTasksTable( in_id )')
        };
        return false
    }    
};

// gets the weather forecast using axios. if an id is given, it updates the TASKS TABLE. returns a stringified object and the DB handler
async function getWeather(in_lat, in_lon, in_GMT_NAME, in_hour, in_cel = 1, in_id = false){
    console.log('>>> GWe >>> getWeather('+in_lat, in_lon, in_GMT_NAME, in_hour, in_cel, in_id+')');
    if (in_cel == 1 || in_cel == "1"){ in_cel = "";
    } else{ in_cel = "temperature_unit=fahrenheit&";                        // in_cel is taken from the TASKS TABLE. If it is 1, converts to an empty string, since the open-meteo API returns in ºC by default.
    }                                                                       // To return the temperatures in ºF, the API requires a modifier, which is given if in_cel == 0.
    let string_to_axios = `https://api.open-meteo.com/v1/forecast?latitude=${in_lat}&longitude=${in_lon}&hourly=temperature_2m,weathercode&${in_cel}daily=sunrise,sunset&timezone=${in_GMT_NAME}&forecast_days=3`
    try{
        let axios_response = await axios.get(string_to_axios, {timeout : 2200})
        let tmp_arr = axios_response.data.hourly.temperature_2m;            // temperatures array is stored
        let cod_arr = axios_response.data.hourly.weathercode;               // weather codes array is stored
        let next_6h_hrs = [];                                               // array to store data for the next 6h is declared
        in_hour = parseInt(in_hour);
        for (let q = 1; q < 7; q++){                                        // strings like "12", "13"... representing the next 6 hours are assigned
            let curr_hour_buf = in_hour + q;
            if (curr_hour_buf > 9){
                if (curr_hour_buf < 24){
                    next_6h_hrs.push(((curr_hour_buf).toString()))
                } else{
                    next_6h_hrs.push( "0" + (curr_hour_buf - 24).toString() )
                }
            } else{
                next_6h_hrs.push("0" + (curr_hour_buf.toString()))
            }
        }
        let next_6h_tmp = tmp_arr.slice(in_hour+1, in_hour+7);              // only the temperatures for the next 6h are assigned
        let next_6h_cod = cod_arr.slice(in_hour+1, in_hour+7);              // only the weather codes for the next 6h are assigned
        let day1_sunrise = parseInt((axios_response.data.daily.sunrise)[0].slice(11,13));
        let day1_sunset = parseInt((axios_response.data.daily.sunset)[0].slice(11,13));
        let next_6h_data = [next_6h_hrs, next_6h_cod, next_6h_tmp, day1_sunrise, day1_sunset];      // the array for the next 6h is ready...
        let next_6h_string = JSON.stringify(next_6h_data);                                          // ...and stringified
    
        let day2_tmp = tmp_arr.slice(30, 46);                               // an array with the temperatures between 06h and 21h for the next day is declared and assigned
        let day2_cod = cod_arr.slice(30, 46);                               // an array with the weather codes between 06h and 21h for the next day is declared and assigned
        let max_tmp_day2 = [-999, -9];                                      // an array for the MAX temps for the next day (between 06h and 21h) is declared and assigned with buffer values
        let min_tmp_day2 = [999, -9];                                       // an array for the MIN temps for the next day (between 06h and 21h) is declared and assigned with buffer values
        let codes_day2_6_9_12_15_18_21 = [  day2_cod[0], day2_tmp[0], day2_cod[3], day2_tmp[3],
                                            day2_cod[6], day2_tmp[6], day2_cod[9], day2_tmp[9],
                                            day2_cod[12], day2_tmp[12], day2_cod[15], day2_tmp[15]
                                        ];
        for (let i = 0; i < 16; i++){                                       // assigns the real MAX and MIN temps for the next day
            if (day2_tmp[i] > max_tmp_day2[0]){
                max_tmp_day2[0] = day2_tmp[i];
                max_tmp_day2[1] = i+6
            };
            if (day2_tmp[i] < min_tmp_day2[0]){
                min_tmp_day2[0] = day2_tmp[i];
                min_tmp_day2[1] = i+6
            }
        };
        let day2_sunrise = parseInt((axios_response.data.daily.sunrise)[1].slice(11,13));
        let day2_sunset = parseInt((axios_response.data.daily.sunset)[1].slice(11,13));
        let next_day_data = [max_tmp_day2, min_tmp_day2, codes_day2_6_9_12_15_18_21, day2_sunrise, day2_sunset];        // the array for the next day is ready...
        let next_day_string = JSON.stringify(next_day_data);                                                            // ...and stringified
    
        let day3_tmp = tmp_arr.slice(54, 70);                               // same process for the day after tomorrow
        let day3_cod = cod_arr.slice(54, 70);
        let max_tmp_day3 = [-999, -9];
        let min_tmp_day3 = [999, -9];
        let codes_day3_6_9_12_15_18_21 = [  day3_cod[0], day3_tmp[0], day3_cod[3], day3_tmp[3],
                                            day3_cod[6], day3_tmp[6], day3_cod[9], day3_tmp[9],
                                            day3_cod[12], day3_tmp[12], day3_cod[15], day3_tmp[15]
                                        ];
        for (let i = 0; i < 16; i++){
            if (day3_tmp[i] > max_tmp_day3[0]){
                max_tmp_day3[0] = day3_tmp[i];
                max_tmp_day3[1] = i+6
            };
            if (day3_tmp[i] < min_tmp_day3[0]){
                min_tmp_day3[0] = day3_tmp[i];
                min_tmp_day3[1] = i+6
            }
        };
        let day3_sunrise = parseInt((axios_response.data.daily.sunrise)[2].slice(11,13));
        let day3_sunset = parseInt((axios_response.data.daily.sunset)[2].slice(11,13));
        let day3_data = [max_tmp_day3, min_tmp_day3, codes_day3_6_9_12_15_18_21, day3_sunrise, day3_sunset];
        let day3_string = JSON.stringify(day3_data);
        let weather_final = [next_6h_string, next_day_string, day3_string];
        let string_weather = JSON.stringify(weather_final);                 // will return the object, and, if an id is given, insert it into the DB
        if (in_id){
            let db;
            try{
                db = await openDb('getWeather');
                return new Promise ((resolve,reject) =>{
                    db.run('UPDATE tasks SET weather = ? WHERE user_id = ?', [string_weather, in_id], function(err) {
                        if (err) { console.log('>>> GtW >1>', err.message);
                            resolve([false,db])
                        } else{ console.log(`WEATHER COLUMN UPDATED IN THE DB - Row(s) updated >>> GtW >2>: ${this.changes}`);
                            resolve([string_weather,db])
                        }
                    })
                })
            } catch (err){
                console.log('Error while openDb(getWeather)', err.message);
                if (db){ closeDb(db, 'getWeather');
                }
                return([string_weather, false])
            }
        } else{ return([string_weather,false])
        }
    }catch (err){ console.log('Error while axios.get(string_to_axios, {timeout : 2000}):', err.message);
        return [false,false]
    }
};

// adjust weather layout and DB if the user clicks to present the weather in simplified version or in ºF/ºC
async function adjustWeather(in_lat, in_lon, in_gmt_iana, in_hour, in_letter, in_id){
    console.log('>>> AdW >>> adjustWeather('+in_lat, in_lon, in_gmt_iana, in_hour, in_letter, in_id+')');
    if (in_letter == 0 || in_letter == 1 || in_letter == "0" || in_letter == "1"){          // if 1, will present in ºC; if 0, ºF
        let x_db;
        try{
            let weather_array = await getWeather(in_lat,in_lon,in_gmt_iana,in_hour,in_letter);
            let weather = weather_array[0];
            x_db = weather_array[1];
            try{ closeDb(x_db, 'adjustWeather A*')
            } catch (err){ console.log('Error while closeDb(x_db, adjustWeather A*):', err.message)
            } finally{
                if (weather){                                           // if the object returned by getWeather is valid (not false)...
                    let db;                                             // ...it will be inserted into DB AND resolved to the caller function
                    try{
                        db = await openDb('adjustWeather - ºC/ºF');
                        return new Promise ((resolve, reject) => {
                            if (in_letter == 1 || in_letter == '1'){
                                db.run('UPDATE tasks SET (weather,Cel) = (?,?) WHERE user_id = ?', [weather,in_letter, in_id], function(err) {
                                    if (err) { console.log('Error while UPDATE tasks SET (weather,Cel):', err.message);
                                        resolve([false,db])
                                    } else{ console.log(`UPDATE tasks SET (weather,Cel) - Row(s) updated: ${this.changes}`);
                                        resolve([200,db])
                                    }
                                })
                            } else if(in_letter == 0 || in_letter == '0'){
                                db.run('UPDATE tasks SET (weather,Cel) = (?,?) WHERE user_id = ?', [weather,in_letter, in_id], function(err) {
                                    if (err) { console.log('Error while UPDATE tasks SET (weather,Cel):', err.message);
                                        resolve([false,db])
                                    } else{ console.log(`UPDATE tasks SET (weather,Cel) - Row(s) updated: ${this.changes}`);
                                        resolve([200,db])
                                    }
                                })
                            } else{ console.log('Something went wrong: in_letter was not recognized (should be either 0, "0", 1 or "1"). Returning [false,db]');
                                resolve([false,db])
                            }
                        })
                    } catch(err){ console.log('Error while openDb(adjustWeather):', err.message);
                        if (db){ closeDb(db, 'Error while openDb(adjustWeather)')
                        };
                        return [false,false]
                    }
                } else{ console.log('Something went wrong: getWeather did not return a valid weather object. Returning [false,false]');
                    return [false,false]
                }
            }
        } catch (err){ console.log('Error while getWeather(in_lat,in_lon,in_gmt_iana,in_hour,in_letter):', err.message);
            if (x_db){ closeDb(x_db, 'Error while getWeather(in_lat,in_lon,in_gmt_iana,in_hour,in_letter)')
            };
            return [false,false]
        }
    } else{                                 // it means that the user just wants the weather's simplified version...
        let db;                             // ... so we don't need to get a new weather object. It will return 200 or false
        try{
            db = await openDb('adjustWeather - s/o');
            if (in_letter == 's'){
                db.run('UPDATE tasks SET wtr_simple = ? WHERE user_id = ?', [1, in_id], function(err) {
                    if (err) { console.log('Error while UPDATE tasks SET wtr_simple:', err.message);
                        return([false,db])
                    } else{ console.log(`UPDATE tasks SET wtr_simple - Row(s) updated: ${this.changes}`);
                        return([200,db])
                    }
                })
            } else if (in_letter == 'o'){
                db.run('UPDATE tasks SET wtr_simple = ? WHERE user_id = ?', [0, in_id], function(err) {
                    if (err) { console.log('Error while UPDATE tasks SET wtr_simple:', err.message);
                        return([false,db])
                    } else{ console.log(`UPDATE tasks SET wtr_simple - Row(s) updated: ${this.changes}`);
                        return([200,db])
                    }
                })
            }
        } catch(err){ console.log('Error while openDb(adjustWeather - s/o):', err.message);
            if (db){ closeDb(db, 'Error while openDb(adjustWeather - s/o)')
            }
            return [false,false]
        }
    }
};

// returns a hashed password to be stored in DB
function hashPW(in_word){
    console.log('hashPW('+in_word+')');
    let buf = "";
    for (let a = 0; a < in_word.length; a+=3){
        let b = a+1;
        let c = a+2;
        let buf3 = (in_word.charCodeAt(3)*(c*1.62)*(b*2.185)).toFixed(4);
        let buf4 = parseInt(buf3);
        buf3 = parseInt((buf3 - buf4) * 10000);
        let aa, bb, cc, dd, ee, ff, ss;
        if (!a){ ss = 10
        } else{ ss = 36
        };
        if( in_word.charCodeAt(a) ){
            aa = in_word.charCodeAt(a)
            if( in_word.charCodeAt(b) ){ 
                bb = in_word.charCodeAt(b)
                if( in_word.charCodeAt(c) ){
                    cc = in_word.charCodeAt(c)
                    if (cc > bb){
                        dd = ((cc+0.321) * (bb-2.844)).toFixed(4);
                        ee = parseInt(dd);
                        if (!a){ ff = (parseInt((dd - ee)*645*buf3)).toString(ss+1)
                        } else{ ff = (parseInt((dd - ee)*645*buf3)).toString(ss)
                        };
                        if (!a){ ee = (ee*buf4).toString(ss+1)
                        } else{ ee = (ee*buf4).toString(ss)
                        }
                    } else{
                        dd = ((bb+0.562) * (cc-1.499)).toFixed(4);
                        ee = parseInt(dd);
                        if (!a){ ff = (parseInt((dd - ee)*543*buf3)).toString(ss+1)
                        } else{ ff = (parseInt((dd - ee)*543*buf3)).toString(ss)
                        }
                        if (!a){ ee = (ee*buf4).toString(ss+1)
                        } else{ ee = (ee*buf4).toString(ss)
                        }
                    };
                    if (!a){
                        for (let z = 0; z < ff.length; z++){
                            if (ff[z] == "a"){ buf += (z+2*(cc-24)).toString()
                            } else{ buf += ff[z]
                            }
                        };
                        for (let z = 0; z < ee.length; z++){
                            if (ee[z] == "a"){ buf += (z+3*(cc-29)).toString()
                            } else{ buf += ee[z]
                            }
                        }
                        buf += "-"
                    } else{ buf += (ee + ff)
                    };
                    if ((in_word.length - 1) == c){
                        a = b = c = aa = bb = cc = dd = ee = ff = in_word = buf3 = buf4 = 0;
                        return buf
                    }
                } else{
                    if (bb > aa){
                        dd = ((bb+0.393) * (aa-3.164)).toFixed(4);
                        ee = parseInt(dd);
                        if (!a){ ff = (parseInt((dd - ee)*629*buf3)).toString(ss+1)
                        } else{ ff = (parseInt((dd - ee)*629*buf3)).toString(ss)
                        }
                        if (!a){ ee = (ee*buf4).toString(ss+1)
                        } else{ ee = (ee*buf4).toString(ss)
                        }
                    } else{
                        dd = ((aa+0.565) * (bb-1.424)).toFixed(4);
                        ee = parseInt(dd);
                        if (!a){ ff = (parseInt((dd - ee)*519*buf3)).toString(ss+1)
                        } else{ ff = (parseInt((dd - ee)*519*buf3)).toString(ss)
                        }
                        if (!a){ ee = (ee*buf4).toString(ss+1)
                        } else{ ee = (ee*buf4).toString(ss)
                        }
                    };
                    buf += (ee + ff);
                    if ((in_word.length - 1) == b){
                        a = b = c = aa = bb = cc = dd = ee = ff = in_word = buf3 = buf4 = 0;
                        return buf
                    }
                }
            } else{
                if (aa % 3 == 0){
                    dd = ((aa*83*buf3)).toString(36);
                    buf += dd
                } else if (aa % 2 == 0){
                    dd = ((aa*79*buf3)).toString(36);
                    buf += dd
                } else{
                    dd = ((aa*81*buf4)).toString(36);
                    buf += dd
                }
                if ((in_word.length - 1) == a){
                    a = b = c = aa = bb = cc = dd = ee = ff = in_word = buf3 = buf4 = 0;
                    return buf
                }
            }
        } else{
            a = b = c = aa = bb = cc = dd = ee = ff = in_word = buf3 = buf4 = 0;
            return buf
        };
        if (a+3 > in_word.length){
            a = b = c = aa = bb = cc = dd = ee = ff = in_word = buf3 = buf4 = 0;
            return buf
        }
    }
};

app.get('/login', (req, res) => {
    res.render('login', {})        
});

app.get('/register', (req, res) => {    
    res.redirect('/login')
});

app.get('/', (req, res) => {
    if(session){
        let buf_id = session.userid;
        if (buf_id){ res.redirect('/home')
        }
    } else{ res.redirect('/login')
    }
});

app.get('/home', async (req, res) => {
    console.log('app.get(/home');    
    if(session){
        let in_id = session.userid;                         // declares and assigns a user's id from session object
        try{
            let tasks_raw2 = await selectFromTasksTable( in_id );
            let tasks_raw = tasks_raw2[0];
            if (tasks_raw2[1]){ closeDb(tasks_raw2[1], '/home')
            };
            let dayA_obj, dayA_key, dayB_obj, dayB_key, dayC_obj, dayC_key, new_date_mili, current_hour;
            let username = tasks_raw['username'];
            let realname = tasks_raw['realname'];
            let notes_parsed = JSON.parse(tasks_raw['notes']);
            let routines_parsed = tasks_raw['routines'];
            let projects_parsed = JSON.parse(tasks_raw['projects']);
            let old_weather = JSON.parse(tasks_raw['weather']);
            let GMT = tasks_raw['gmt'];
            let GMT_NAME = tasks_raw['gmt_iana'];
            let TIMEZONE = tasks_raw['tmz'];
            let user_lat = tasks_raw['lat'];
            let user_lon = tasks_raw['lon'];
            let celsius = tasks_raw['Cel'];
            let wtr_simple = tasks_raw['wtr_simple'];
            let last_timestamp = tasks_raw['timestamp'];
            let date_now = Date.now();
            let mili_diff = 0;

            if (notes_parsed == undefined || !notes_parsed){ res.redirect('/login');
            } else if (projects_parsed == undefined || !projects_parsed){ res.redirect('/login');
            } else if (routines_parsed == undefined || !routines_parsed){ res.redirect('/login');
            } else if (username == undefined || !username){ res.redirect('/login');
            };

            let timequery;
            if (req.query.new_y && req.query.new_y != undefined){               // in case the user selected a date from the calendar
                let month = (parseInt(req.query.new_m) + 1).toString();
                if (month.length == 1){
                    month = "0"+month
                };
                let day = req.query.new_d;
                if (day.length == 1){
                    day = "0"+day
                };
                timequery = (req.query.new_y+'-'+month+'-'+day) + TIMEZONE;
                new_date_mili = new Date ( timequery ).getTime();
                mili_diff = new_date_mili - date_now;
                dayA_obj = JSON.parse(dayModule.dayA(new_date_mili));           // selected day
                dayB_obj = JSON.parse(dayModule.dayB(new_date_mili));           // +24h
                dayC_obj = JSON.parse(dayModule.dayC(new_date_mili))            // +48h                    
            } else {                                                            // in case the user is indeed in today's date
                dayA_obj = JSON.parse(dayModule.dayA());                        // today
                dayB_obj = JSON.parse(dayModule.dayB());                        // tomorrow
                dayC_obj = JSON.parse(dayModule.dayC())                         // after tomorrow
            };
            dayA_key = dayA_obj["YYYY-MM-DD"];                                  // the key for a day is in the format "YYYY-MM-DD"
            dayB_key = dayB_obj["YYYY-MM-DD"];
            dayC_key = dayC_obj["YYYY-MM-DD"];

            if (notes_parsed == {}){                                            // if it is a new user with no data yet...
                console.log('/home - if (notes_parsed == {}){');
                notes_parsed[dayA_key] = {"YYYY-MM-DD" : dayA_key , "weekday" : dayA_obj["weekday"] , "day" : dayA_obj["day"] , "notes" : []}
                notes_parsed[dayB_key] = {"YYYY-MM-DD" : dayB_key , "weekday" : dayB_obj["weekday"] , "day" : dayB_obj["day"] , "notes" : []}
                notes_parsed[dayC_key] = {"YYYY-MM-DD" : dayC_key , "weekday" : dayC_obj["weekday"] , "day" : dayC_obj["day"] , "notes" : []}
                let notes_stringified = JSON.stringify(notes_parsed);
                try{
                    let result = await updateNotesColumn(notes_stringified, in_id);         //...it will be inserted into DB...
                    if (result[1]){ closeDb(result[1],'/home - if (notes_parsed == {}){')
                    };
                    if (result[0] != 200){ console.log('FAIL - get (/home) if(notes_parsed=={}), result[0] != 200')
                    };
                    return res.redirect('/home')                                            //...and redirected to /home
                } catch (err){
                    console.log('get (/home) if(notes_parsed=={}) error:', err.message);
                    return res.redirect('/home')
                }
            };
            let errorcatched = false;
            if (!notes_parsed[dayA_key] || notes_parsed[dayA_key] == undefined){        // if there's no data for the requested day
                notes_parsed[dayA_key] = {"YYYY-MM-DD" : dayA_key , "weekday" : dayA_obj["weekday"] , "day" : dayA_obj["day"] , "notes" : []}
                errorcatched = true
            };
            if (!notes_parsed[dayB_key] || notes_parsed[dayB_key] == undefined){        // if there's no data for the requested day
                notes_parsed[dayB_key] = {"YYYY-MM-DD" : dayB_key , "weekday" : dayB_obj["weekday"] , "day" : dayB_obj["day"] , "notes" : []}
                errorcatched = true
            };
            if (!notes_parsed[dayC_key] || notes_parsed[dayC_key] == undefined){        // if there's no data for the requested day
                notes_parsed[dayC_key] = {"YYYY-MM-DD" : dayC_key , "weekday" : dayC_obj["weekday"] , "day" : dayC_obj["day"] , "notes" : []}
                errorcatched = true
            };
            if (errorcatched){
                let notes_stringified = JSON.stringify(notes_parsed);
                try{
                    let result = await updateNotesColumn(notes_stringified, in_id);
                    try{ closeDb(result[1], 'get (/home) if (errorcatched)')
                    } catch (err){ console.log('Error while closeDb(result[1], get (/home) if (errorcatched)):', err.message)
                    }
                } catch (err){ console.log('Error while get (/home) if (errorcatched) updateNotesColumn(notes_stringified, in_id):', err.message);
                    return res.redirect('/home')
                }
            };
            let days_7 = [];                                                        // declares array for the notes in the next 2~7 or 3~8 days
            let days_31 = [];                                                       // declares array for the notes in the next 8~31 or 9~32 days
            let today_mili;
            if (!new_date_mili || new_date_mili == undefined){                      // changes the reference day if it is not today (user user the calendar)
                today_mili = date_now;            
            } else{
                today_mili = new_date_mili;
            };
            current_hour = new Date().getUTCHours() + GMT;                          // since the display changes depending on the current hour
            if (current_hour < 0){                                                  // the reference day for the days_7 and days_31 can also
                current_hour = current_hour + 24                                    // change: in the morning, days_7 will present the notes
            };                                                                      // for the next 2~7 days. If it is already evening or
            let next_events_days = 3;                                               // night, it will show 3~8 days
            if (  3 < current_hour && current_hour < 17  ){
                next_events_days = 2
            };
            for (next_events_days; next_events_days < 33; next_events_days++){
                let new_key = (new Date(today_mili + (next_events_days * 86400000))).toISOString().slice(0,10);
                if (next_events_days < 8){
                    if (notes_parsed[new_key]){
                        let buffer_day = notes_parsed[new_key];
                        for (let i = 0; i < buffer_day['notes'].length; i++){
                            let already_there = false;
                            let this_text = buffer_day['notes'][i][0];
                            for (let j = 0; j < days_7.length; j++){
                                if (this_text == days_7[j][0]){
                                    already_there = j;
                                    break
                                }
                            }
                            if (this_text.length > 65){
                                this_text = this_text.slice(0,66)+'...'
                            }
                            if (already_there === false){
                                days_7.push([this_text, [buffer_day['notes'][i][2]]])
                            } else {
                                if (days_7[already_there][1].length == 0){
                                    days_7[already_there][1].push(buffer_day['notes'][i][2])
                                } else if (days_7[already_there][1].length < 2){
                                    days_7[already_there][1].push(buffer_day['notes'][i][2])
                                } else if (days_7[already_there][1].length == 2){
                                    days_7[already_there][1].push('+ ...');
                                    break
                                }
                            }
                        }
                    }            
                } else{
                    if (notes_parsed[new_key]){
                        let buffer_day = notes_parsed[new_key];
                        for (let i = 0; i < buffer_day['notes'].length; i++){
                            let already_there = false;
                            let this_text = buffer_day['notes'][i][0];
                            for (let j = 0; j < days_31.length; j++){
                                if (this_text == days_31[j][0]){
                                    already_there = j;
                                    break
                                }
                            }
                            if (this_text.length > 65){
                                this_text = this_text.slice(0,66)+'...'
                            }
                            if (already_there === false){
                                days_31.push([this_text, [buffer_day['notes'][i][2]]])
                            } else {
                                if (days_31[already_there][1].length == 0){
                                    days_31[already_there][1].push(buffer_day['notes'][i][2])
                                } else if (days_31[already_there][1].length < 2){
                                    days_31[already_there][1].push(buffer_day['notes'][i][2])
                                } else if (days_31[already_there][1].length == 2){
                                    days_31[already_there][1].push('+ ...');
                                    break
                                }
                            }
                        }
                    }            
                }
            };
            
            let next_6h_string, next_day_string, day3_string;
            try{
                let weather_array, weather;
                if ( date_now - last_timestamp > 180000 ){
                    weather_array = await getWeather(user_lat, user_lon, GMT_NAME, current_hour, celsius, in_id);
                    weather = JSON.parse((weather_array[0]));
                } else{
                    weather = old_weather
                };
                if( typeof(weather_array) == "object" && weather_array[1]){
                    closeDb(weather_array[1], 'getWeather(user_lat, user_lon, GMT_NAME, current_hour, celsius, in_id)')
                };
                if (weather){
                    next_6h_string = weather[0];
                    next_day_string = weather[1];
                    day3_string = weather[2]
                }else{
                    try{
                        next_6h_string = old_weather[0];
                        next_day_string = old_weather[1];
                        day3_string = old_weather[2]
                    } catch (err){ console.log('Error while next_6h_string = old_weather[0]:', err.message)
                        next_6h_string = [];
                        next_day_string = [];
                        day3_string = []
                    }
                };
                if (new_date_mili){                                             // in case the reference day is not today...
                    if (mili_diff > 172800000 || mili_diff < -86400000){        // ...and it is either 3 days + in the future or in the past
                        next_6h_string = next_day_string = day3_string = false
                    } else if (mili_diff > 86400000){                           // ...and it is the day after tomorrow
                        if (current_hour < 17){
                            next_day_string = day3_string;
                            next_6h_string = day3_string = false
                        } else{ next_6h_string = next_day_string = day3_string = false
                        }
                    } else if (mili_diff > 0){                                  // ...and it is tomorrow
                        if (current_hour < 17){ next_6h_string = false
                        } else{
                            next_day_string = day3_string;
                            next_6h_string = day3_string = false
                        }
                    }
                    res.render('index', {
                        user_timezone_PH : TIMEZONE, current_hour_PH : current_hour,
                        dayA_PH : dayModule.dayA_pretty(new_date_mili), notesDayA_PH_string : JSON.stringify(notes_parsed[dayA_key]['notes']), dayA_hidden_date_PH : dayA_key,       // "_PH" is for PlaceHolder
                        dayB_PH : dayModule.dayB_pretty(new_date_mili), notesDayB_PH_string : JSON.stringify(notes_parsed[dayB_key]['notes']), dayB_hidden_date_PH : dayB_key,
                        dayC_PH : dayModule.dayC_pretty(new_date_mili), notesDayC_PH_string: JSON.stringify(notes_parsed[dayC_key]['notes']), dayC_hidden_date_PH : dayC_key,
                        routines_raw_PH_string : JSON.stringify(routines_parsed), username_PH : realname, mili_diff_PH : mili_diff,
                        projects_PH_string : JSON.stringify(projects_parsed), notes_PH_string : JSON.stringify(notes_parsed),
                        days_7_PH : JSON.stringify(days_7) , days_31_PH : JSON.stringify(days_31),
                        next_6h_PH : next_6h_string, next_day_PH : next_day_string, day3_PH : day3_string, wtr_simple_PH : wtr_simple, celsius_PH : celsius            
                    })
                } else{
                    res.render('index', {
                        user_timezone_PH : TIMEZONE, current_hour_PH : current_hour,
                        dayA_PH : dayModule.dayA_pretty(), notesDayA_PH_string : JSON.stringify(notes_parsed[dayA_key]['notes']), dayA_hidden_date_PH : dayA_key,       // "_PH" is for PlaceHolder
                        dayB_PH : dayModule.dayB_pretty(), notesDayB_PH_string : JSON.stringify(notes_parsed[dayB_key]['notes']), dayB_hidden_date_PH : dayB_key,
                        dayC_PH : dayModule.dayC_pretty(), notesDayC_PH_string: JSON.stringify(notes_parsed[dayC_key]['notes']), dayC_hidden_date_PH : dayC_key,
                        routines_raw_PH_string : JSON.stringify(routines_parsed), username_PH : realname, mili_diff_PH : mili_diff,
                        projects_PH_string : JSON.stringify(projects_parsed), notes_PH_string : JSON.stringify(notes_parsed),
                        days_7_PH : JSON.stringify(days_7) , days_31_PH : JSON.stringify(days_31),
                        next_6h_PH : next_6h_string, next_day_PH : next_day_string, day3_PH : day3_string, wtr_simple_PH : wtr_simple, celsius_PH : celsius            
                    })
                }
            } catch (err){ console.log('Error while getWeather(user_lat, user_lon, GMT_NAME, current_hour, celsius, in_id):', err.message);
                try{
                    next_6h_string = old_weather[0];
                    next_day_string = old_weather[1];
                    day3_string = old_weather[2]
                } catch (err){ console.log('Error while next_6h_string = old_weather[0]:', err.message);
                    next_6h_string = [];
                    next_day_string = [];
                    day3_string = []
                }
                if (new_date_mili){                                                 // in case the reference day is not today...
                    if (mili_diff > 172800000 || mili_diff < -86400000){            // ...and it is either 3 days + in the future or in the past
                        next_6h_string = next_day_string = day3_string = false
                    } else if (mili_diff > 86400000){                               // ...and it is the day after tomorrow
                        if (current_hour < 17){
                            next_day_string = day3_string;
                            next_6h_string = day3_string = false
                        } else{ next_6h_string = next_day_string = day3_string = false
                        }
                    } else if (mili_diff > 0){                                      // ...and it is tomorrow
                        if (current_hour < 17){ next_6h_string = false;
                        } else{
                            next_day_string = day3_string;
                            next_6h_string = day3_string = false
                        }
                    };
                    res.render('index', {
                        user_timezone_PH : TIMEZONE, current_hour_PH : current_hour,
                        dayA_PH : dayModule.dayA_pretty(new_date_mili), notesDayA_PH_string : JSON.stringify(notes_parsed[dayA_key]['notes']), dayA_hidden_date_PH : dayA_key,       // "_PH" is for PlaceHolder
                        dayB_PH : dayModule.dayB_pretty(new_date_mili), notesDayB_PH_string : JSON.stringify(notes_parsed[dayB_key]['notes']), dayB_hidden_date_PH : dayB_key,
                        dayC_PH : dayModule.dayC_pretty(new_date_mili), notesDayC_PH_string: JSON.stringify(notes_parsed[dayC_key]['notes']), dayC_hidden_date_PH : dayC_key,
                        routines_raw_PH_string : JSON.stringify(routines_parsed), username_PH : realname, mili_diff_PH : mili_diff,
                        projects_PH_string : JSON.stringify(projects_parsed), notes_PH_string : JSON.stringify(notes_parsed),
                        days_7_PH : JSON.stringify(days_7) , days_31_PH : JSON.stringify(days_31),
                        next_6h_PH : next_6h_string, next_day_PH : next_day_string, day3_PH : day3_string, wtr_simple_PH : wtr_simple, celsius_PH : celsius            
                    })
                } else{ 
                    res.render('index', {
                        user_timezone_PH : TIMEZONE, current_hour_PH : current_hour,
                        dayA_PH : dayModule.dayA_pretty(), notesDayA_PH_string : JSON.stringify(notes_parsed[dayA_key]['notes']), dayA_hidden_date_PH : dayA_key,       // "_PH" is for PlaceHolder
                        dayB_PH : dayModule.dayB_pretty(), notesDayB_PH_string : JSON.stringify(notes_parsed[dayB_key]['notes']), dayB_hidden_date_PH : dayB_key,
                        dayC_PH : dayModule.dayC_pretty(), notesDayC_PH_string: JSON.stringify(notes_parsed[dayC_key]['notes']), dayC_hidden_date_PH : dayC_key,
                        routines_raw_PH_string : JSON.stringify(routines_parsed), username_PH : realname, mili_diff_PH : mili_diff,
                        projects_PH_string : JSON.stringify(projects_parsed), notes_PH_string : JSON.stringify(notes_parsed),
                        days_7_PH : JSON.stringify(days_7) , days_31_PH : JSON.stringify(days_31),
                        next_6h_PH : next_6h_string, next_day_PH : next_day_string, day3_PH : day3_string, wtr_simple_PH : wtr_simple, celsius_PH : celsius            
                    })
                }
            }
        } catch (err){ console.log('Error in /home:', err.message);
            return res.redirect('/login')
        }
    } else{ console.log('no session! redirecting to login...');
        return res.redirect('/login')
    }
});

app.post('/home', async (req, res) => {

    if(req.body.logout){                                    // logout from home page
        req.session._expires = new Date();
        req.session.destroy();
        return res.redirect('/login')
    };

    if (req.body.user_hour_lat_lon){                        // this object is almost always sent in order to refresh user's weather DB
        let user_hour_lat_lon_str = req.body.user_hour_lat_lon;
        if (user_hour_lat_lon_str[0].length > 1){
            console.log('WARNING! THERE WERE ' + user_hour_lat_lon_str.length + ' OBJECTS IN user_hour_lat_lon_str!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            user_hour_lat_lon_str = user_hour_lat_lon_str[user_hour_lat_lon_str.length-1]
        };
        let user_hour_lat_lon = JSON.parse(user_hour_lat_lon_str);
        let user_hour = parseInt(user_hour_lat_lon[0]);
        let user_timestamp = parseInt(user_hour_lat_lon[5]);
        let new_date = new Date();
        let current_timestamp = new_date.getTime();
        let user_GMT = user_hour_lat_lon[6];
        if (user_GMT[0] == "-"){ user_GMT = parseInt(user_GMT.slice(1,))
        } else if (user_GMT[0] == "+") { user_GMT = parseInt(user_GMT.slice(1,)) * -1
        };
        let current_hour = new_date.getUTCHours() + user_GMT;
        if (current_hour > 24){ current_hour -= 24
        } else if (current_hour < 0){ current_hour += 24
        };

        if ((user_timestamp + 600000 < current_timestamp) || (current_hour != user_hour)){          // it doesnt refresh if too recent
            let hour_user = (user_hour_lat_lon[0]).toString();
            if (hour_user.length == 1){
                hour_user = "0"+hour_user
            };
            let user_lat = parseFloat(user_hour_lat_lon[1]);
            let user_lon = parseFloat(user_hour_lat_lon[2]);
            let user_tmz = user_hour_lat_lon[3];
            let user_gmt_name = user_hour_lat_lon[4];
            let db;
            try{
                db = await openDb('req.body.user_hour_lat_lon');
                if ( typeof(user_lat) == 'number' && user_lat != -27.6 && user_lon != -48.5){
                    if (user_tmz && user_tmz.length == 19){
                        db.run('UPDATE tasks SET (hour_str, timestamp, lat, lon, tmz, gmt_iana) = (?,?,?,?,?,?) WHERE user_id = ?',
                        [hour_user, user_timestamp, user_lat, user_lon, user_tmz, user_gmt_name, session.userid], function(err) {
                            if (err) { console.log('req.body.user_hour_lat_lon', err.message); return([false,db])
                            } else{ console.log(`Row(s) updated req.body.user_hour_lat_lon: ${this.changes}`); return([200,db])
                            }
                        })
                    } else{
                        db.run('UPDATE tasks SET (hour_str, timestamp, lat, lon) = (?,?,?,?) WHERE user_id = ?',
                        [hour_user, user_timestamp, user_lat, user_lon, session.userid], function(err) {
                            if (err) { console.log('req.body.user_hour_lat_lon', err.message); return([false,db])
                            } else{ console.log(`Row(s) updated req.body.user_hour_lat_lon: ${this.changes}`); return([200,db])
                            }
                        })
                    }
                } else{
                    if (user_tmz && user_tmz.length == 19){
                        db.run('UPDATE tasks SET (hour_str, timestamp, tmz, gmt_iana) = (?,?,?,?) WHERE user_id = ?',
                        [hour_user, user_timestamp, user_tmz, user_gmt_name, session.userid], function(err) {
                            if (err) { console.log('req.body.user_hour_lat_lon', err.message); return([false,db])
                            } else{ console.log(`Row(s) updated req.body.user_hour_lat_lon: ${this.changes}`); return([200,db])
                            }
                        })
                    } else{
                        db.run('UPDATE tasks SET (hour_str, timestamp) = (?,?) WHERE user_id = ?',
                        [hour_user, user_timestamp, session.userid], function(err) {
                            if (err) { console.log('req.body.user_hour_lat_lon', err.message); return([false,db])
                            } else{ console.log(`Row(s) updated req.body.user_hour_lat_lon: ${this.changes}`); return([200,db])
                            }
                        })
                    }
                }
            } catch (err){ console.log('req.body.user_hour_lat_lon', err.message);
                if (db){ closeDb(db, 'req.body.user_hour_lat_lon')
                };
                return [false,false]
            }
        }
    };
    
    if (req.body.new_note_array){
        let new_note_string_array = req.body.new_note_array;
        let buffer_array = [];
        let texts_array = [];
        if (new_note_string_array[0].length > 1){
            console.log('WARNING! THERE WERE ' + new_note_string_array.length + ' OBJECTS IN req.body.new_note_array!');
            console.log('FUNCTION CONTINUING WITH AN ARRAY WITH ALL VALUES');
            for (let i = 0; i < new_note_string_array.length; i++){
                texts_array.push(JSON.parse(new_note_string_array[i])[1])
            }
            buffer_array.push(JSON.parse(new_note_string_array[0])[0]);
            buffer_array.push(texts_array);
            buffer_array.push(JSON.parse(new_note_string_array[0])[2])
        } else{
            let new_note_array = JSON.parse(new_note_string_array);
            buffer_array.push(new_note_array[0]);
            buffer_array.push([new_note_array[1]]);
            buffer_array.push(new_note_array[2])
        }
        try{
            let result = await insertNewNote(buffer_array[0], buffer_array[1], session.userid);
            let x1 = result[0];
            let x_db = result[1]
            try{ closeDb(x_db, 'req.body.new_note_array'); x_db = 0
            } catch (err){ console.log('req.body.new_note_array', err.message)
            } finally{
                if(x1 != 200){ console.log('req.body.new_note_array - FAIL(not 200)')
                };
                res.redirect('/home'); return
            }
        } catch (err){ console.log('req.body.new_note_array', err.message); res.redirect('/home'); return
        }
    }

    else if (req.body.edit_note_array){
        let edit_note_string_array = req.body.edit_note_array;
        if (edit_note_string_array[0].length > 1){
            console.log('WARNING! THERE WERE ' + edit_note_string_array.length + ' OBJECTS IN req.body.edit_note_array!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            edit_note_string_array = edit_note_string_array[edit_note_string_array.length-1]
        }
        let edit_note_array = JSON.parse(edit_note_string_array);
        let x_db;
        try{
            let result = await editNote(edit_note_array[0], edit_note_array[1], edit_note_array[2], session.userid);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.edit_note_array')
            } catch (err){ console.log('req.body.edit_note_array', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.edit_note_array - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.edit_note_array', err.message);
            if (x_db){closeDb(x_db,'req.body.edit_note_array')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.remove_note_array){
        let remove_note_string_array = req.body.remove_note_array;
        console.log(remove_note_string_array);
        if (remove_note_string_array[0].length > 1){
            console.log('WARNING! THERE WERE ' + remove_note_string_array.length + ' OBJECTS IN req.body.remove_note_array!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            remove_note_string_array = remove_note_string_array[remove_note_string_array.length-1]
        }
        let remove_note_array = JSON.parse(remove_note_string_array);
        let x_db;
        try{
            let result = await removeNote(remove_note_array[0], remove_note_array[1], session.userid);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.remove_note_array')
            } catch (err){ console.log('req.body.remove_note_array', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.remove_note_array - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.remove_note_array', err.message);
            if (x_db){closeDb(x_db,'req.body.remove_note_array')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.routine_note_array){
        let routine_note_string_array = req.body.routine_note_array;
        console.log(routine_note_string_array);
        if (routine_note_string_array[0].length > 1){
            console.log('WARNING! THERE WERE ' + routine_note_string_array.length + ' OBJECTS IN req.body.routine_note_array!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            routine_note_string_array = routine_note_string_array[routine_note_string_array.length -1]
        }
        let routine_note_array = JSON.parse(routine_note_string_array);
        let x_db;
        try{
            let result = await insertNewRoutine(session.userid, routine_note_array[0], routine_note_array[1], routine_note_array[2], routine_note_array[3]);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.routine_note_array')
            } catch (err){ console.log('req.body.routine_note_array', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.routine_note_array - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.routine_note_array', err.message);
            if (x_db){closeDb(x_db,'req.body.routine_note_array')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.edit_routine_note){
        let edit_routine_note_string = req.body.edit_routine_note;
        if (edit_routine_note_string[0].length > 1){
            console.log('WARNING! THERE WERE ' + edit_routine_note_string.length + ' OBJECTS IN req.body.edit_routine_note!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE FIRST ONE...');
            edit_routine_note_string = edit_routine_note_string[0]
        }
        let edit_routine_note = JSON.parse(edit_routine_note_string);
        let x_db;
        try{
            let result = await editRoutine(edit_routine_note[0], edit_routine_note[1], edit_routine_note[2], edit_routine_note[3], edit_routine_note[4], session.userid);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.edit_routine_note')
            } catch (err){ console.log('req.body.edit_routine_note', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.edit_routine_note - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.edit_routine_note', err.message);
            if (x_db){closeDb(x_db,'req.body.edit_routine_note')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.project_task_array){
        let project_task_array_string = req.body.project_task_array;
        if (project_task_array_string[0].length > 1){
            console.log('WARNING! THERE WERE ' + project_task_array_string.length + ' OBJECTS IN req.body.project_task_array!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            project_task_array_string = project_task_array_string[(project_task_array_string.length-1)]
        }
        console.log(project_task_array_string);
        let project_task_array = JSON.parse(project_task_array_string);
        let x_db;
        try{
            let result = await receiveProjectTask(session.userid, project_task_array[0], project_task_array[1], project_task_array[2], project_task_array[3], project_task_array[4], project_task_array[5], project_task_array[6]);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.project_task_array')
            } catch (err){ console.log('req.body.project_task_array', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.project_task_array - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.project_task_array', err.message);
            if (x_db){closeDb(x_db,'req.body.project_task_array')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.mark_done_todo){
        let mark_done_todo_string = req.body.mark_done_todo;
        if (mark_done_todo_string[0].length > 1){
            console.log('WARNING! THERE WERE ' + mark_done_todo_string.length + ' OBJECTS IN req.body.mark_done_todo!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            mark_done_todo_string = mark_done_todo_string[(mark_done_todo_string.length -1)]
        }
        let mark_done_todo = JSON.parse(mark_done_todo_string);
        let x_db;
        try{
            let result = await changeProjectTaskDoneTodo(session.userid, mark_done_todo[0], mark_done_todo[1], mark_done_todo[2]);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.mark_done_todo')
            } catch (err){ console.log('req.body.mark_done_todo', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.mark_done_todo - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.mark_done_todo', err.message);
            if (x_db){closeDb(x_db,'req.body.mark_done_todo')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.remove_task_array){
        let remove_task_array_string = req.body.remove_task_array;
        if (remove_task_array_string[0].length > 1){
            console.log('WARNING! THERE WERE ' + remove_task_array_string.length + ' OBJECTS IN req.body.mark_done_todo!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            remove_task_array_string = remove_task_array_string[(remove_task_array_string.length -1)]
        };
        let remove_task_array = JSON.parse(remove_task_array_string);
        let x_db;
        try{
            let result = await removeProjectTask(session.userid, remove_task_array[0], remove_task_array[1], remove_task_array[2]);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.remove_task_array')
            } catch (err){ console.log('req.body.remove_task_array', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.remove_task_array - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.remove_task_array', err.message);
            if (x_db){closeDb(x_db,'req.body.remove_task_array')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.project_title_and_deadline_array){
        let project_title_and_deadline_array_string = req.body.project_title_and_deadline_array;
        if (project_title_and_deadline_array_string[0].length > 1){
            console.log('WARNING! THERE WERE ' + project_title_and_deadline_array_string.length + ' OBJECTS IN req.body.project_title_and_deadline_array!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            project_title_and_deadline_array_string = project_title_and_deadline_array_string[(project_title_and_deadline_array_string.length -1)]
        }
        let project_title_and_deadline_array = JSON.parse(project_title_and_deadline_array_string);
        let x_db;
        try{
            let result = await editProjectTitleAndDeadline(session.userid, project_title_and_deadline_array[0], project_title_and_deadline_array[1], project_title_and_deadline_array[2]);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.project_title_and_deadline_array')
            } catch (err){ console.log('req.body.project_title_and_deadline_array', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.project_title_and_deadline_array - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.project_title_and_deadline_array', err.message);
            if (x_db){closeDb(x_db,'req.body.project_title_and_deadline_array')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.edit_obs_array){
        let edit_obs_array_string = req.body.edit_obs_array;
        if (edit_obs_array_string[0].length > 1){
            console.log('WARNING! THERE WERE ' + edit_obs_array_string.length + ' OBJECTS IN req.body.edit_obs!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            edit_obs_array_string = edit_obs_array_string[(edit_obs_array_string.length -1)]
        }
        let edit_obs_array = JSON.parse(edit_obs_array_string);
        let x_db;
        try{
            let result = await editTaskObs(session.userid, edit_obs_array[0], edit_obs_array[1], edit_obs_array[2], edit_obs_array[3]);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.edit_obs_array')
            } catch (err){ console.log('req.body.edit_obs_array', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.edit_obs_array - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.edit_obs_array', err.message);
            if (x_db){closeDb(x_db,'req.body.edit_obs_array')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.delete_project){
        let delete_project = req.body.delete_project;
        if (delete_project.length > 1){
            console.log('WARNING! THERE WERE ' + delete_project.length + ' OBJECTS IN req.body.delete_project!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            delete_project = delete_project[(delete_project.length -1)]
        };
        let x_db;
        try{
            let result = await deleteProject(delete_project, session.userid);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.delete_project')
            } catch (err){ console.log('req.body.delete_project', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.delete_project - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.delete_project', err.message);
            if (x_db){closeDb(x_db,'req.body.delete_project')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.temp_letter){
        let temp_letter = req.body.temp_letter;
        if (temp_letter[0].length > 1){
            console.log('WARNING! THERE WERE ' + temp_letter.length + ' OBJECTS IN temp_letter!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            temp_letter = temp_letter[(temp_letter.length -1)]
        }        
        temp_letter = JSON.parse(temp_letter);
        let user_lat = temp_letter[0];
        let user_lon = temp_letter[1];
        let gmt_iana = temp_letter[2];
        let user_hour = temp_letter[3];
        let letter = temp_letter[4];
        let x_db;
        try{
            let result = await adjustWeather(user_lat, user_lon, gmt_iana, user_hour, letter, session.userid);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.temp_letter')
            } catch (err){ console.log('req.body.temp_letter', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.temp_letter - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.temp_letter', err.message);
            if (x_db){closeDb(x_db,'req.body.temp_letter')
            };
            return res.redirect('/home')
        }
    }

    else if (req.body.new_project_title){
        let new_project = {};
        new_project['title'] = req.body.new_project_title;
        if (req.body.new_project_deadline){
            new_project['final_deadline'] = req.body.new_project_deadline;
        } else{
            new_project['final_deadline'] = false;
        }
        new_project['tasks_todo'] = [];
        new_project['tasks_done'] = [];
        if (req.body.new_task_deadline0){
            new_project['tasks_todo'].push({'task' : req.body.new_project_task0 , 'obs' : "" , 'deadline' : req.body.new_task_deadline0});
        } else{
            new_project['tasks_todo'].push({'task' : req.body.new_project_task0 , 'obs' : "" , 'deadline' : false});
        }
        try{
            if (req.body.new_project_task1){
                if(req.body.new_task_deadline1){
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task1 , 'obs' : "" , 'deadline' : req.body.new_task_deadline1});
                } else{
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task1 , 'obs' : "" , 'deadline' : false});
                }
            }
            if (req.body.new_project_task2){
                if(req.body.new_task_deadline2){
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task2 , 'obs' : "" , 'deadline' : req.body.new_task_deadline2});
                } else{
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task2 , 'obs' : "" , 'deadline' : false});
                }
            }
            if (req.body.new_project_task3){
                if(req.body.new_task_deadline3){
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task3 , 'obs' : "" , 'deadline' : req.body.new_task_deadline3});
                } else{
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task3 , 'obs' : "" , 'deadline' : false});
                }
            }
            if (req.body.new_project_task4){
                if(req.body.new_task_deadline4){
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task4 , 'obs' : "" , 'deadline' : req.body.new_task_deadline4});
                } else{
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task4 , 'obs' : "" , 'deadline' : false});
                }
            }
            if (req.body.new_project_task5){
                if(req.body.new_task_deadline5){
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task5 , 'obs' : "" , 'deadline' : req.body.new_task_deadline5});
                } else{
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task5 , 'obs' : "" , 'deadline' : false});
                }
            }
            if (req.body.new_project_task6){
                if(req.body.new_task_deadline6){
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task6 , 'obs' : "" , 'deadline' : req.body.new_task_deadline6});
                } else{
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task6 , 'obs' : "" , 'deadline' : false});
                }
            }
            if (req.body.new_project_task7){
                if(req.body.new_task_deadline7){
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task7 , 'obs' : "" , 'deadline' : req.body.new_task_deadline7});
                } else{
                    new_project['tasks_todo'].push({'task' : req.body.new_project_task7 , 'obs' : "" , 'deadline' : false});
                }
            }
        }catch{};
        let x_db;
        try{
            let result = await insertNewProject(new_project, session.userid);
            let false_or_200 = result[0];
            x_db = result[1];
            try{ closeDb(x_db, 'req.body.new_project_title')
            } catch (err){ console.log('req.body.new_project_title', err.message)
            } finally{
                if(false_or_200 != 200){ console.log('req.body.new_project_title - FAIL(not 200)')
                };
                return res.redirect('/home')
            }
        } catch (err){ console.log('req.body.new_project_title', err.message);
            if (x_db){closeDb(x_db,'req.body.new_project_title')
            };
            return res.redirect('/home')
        }
    }
    
    else{
        console.log('###############   NO req.body!   ###############')
    };

});

app.post('/login', async (req, res) => {
    console.log('app.post(/login, async (req, res) => {');
    
    if (req.body.login_array){
        let login_array_string = req.body.login_array;
        if (login_array_string[0].length > 1){
            console.log('WARNING! THERE WERE ' + login_array_string.length + ' OBJECTS IN login_array_string!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            login_array_string = login_array_string[(login_array_string.length -1)]
        };
        let login_array = JSON.parse(login_array_string);
        let new_Date = new Date();
        let Date_now = new_Date.getTime();

        if(req.body.guest){                                             // if the user clicked on the "demonstration" button.
            let TIMEZONE = login_array[2];                              // a new user will be created
            let GMT_NAME = login_array[3];
            let hour_user = login_array[4];
            if (typeof(hour_user) == 'object'){ console.log('if (typeof(hour_user) == "object"){');
                hour_user = hour_user[hour_user.length-1];
            };
            hour_user = hour_user.toString();
            if(hour_user.length == 1){ hour_user = "0"+hour_user
            };
            let user_lat = login_array[5];
            let user_lon = login_array[6];            
            let GMT = login_array[8];
            let user_h = parseInt(hour_user);
            let today_string2 = new_Date.toString();
            let today_string = ( today_string2.slice(0,3)+','+today_string2.slice(3,10) );
            let dayA_obj, dayB_obj, dayC_obj;
            dayA_obj = JSON.parse(dayModule.dayA(Date_now));
            dayB_obj = JSON.parse(dayModule.dayB(Date_now));            // +24h
            dayC_obj = JSON.parse(dayModule.dayC(Date_now))             // +48h
            let dayA_key = dayA_obj["YYYY-MM-DD"]; let dayB_key = dayB_obj["YYYY-MM-DD"]; let dayC_key = dayC_obj["YYYY-MM-DD"];
            let tomorrow_date = new Date(dayB_key); let tomorrow_string2 = tomorrow_date.toString(); let tomorrow_string = ( tomorrow_string2.slice(0,3)+','+tomorrow_string2.slice(3,10) );  
    
            let base_5 = Date_now + 432000000;
            let dayD5_obj = JSON.parse(dayModule.dayA(base_5)); let dayE6_obj = JSON.parse(dayModule.dayB(base_5)); let dayF7_obj = JSON.parse(dayModule.dayC(base_5));
            let dayD5_key = dayD5_obj["YYYY-MM-DD"]; let dayE6_key = dayE6_obj["YYYY-MM-DD"]; let dayF7_key = dayF7_obj["YYYY-MM-DD"];
            let D5_date = new Date(dayD5_key); let E6_date = new Date(dayE6_key); let F7_date = new Date(dayF7_key);
            let D5_string = D5_date.toString(); let E6_string = E6_date.toString(); let F7_string = F7_date.toString();
    
            let base_15 = Date_now + 1296000000;
            let dayG15_obj = JSON.parse(dayModule.dayA(base_15)); let dayH16_obj = JSON.parse(dayModule.dayB(base_15)); let dayI17_obj = JSON.parse(dayModule.dayC(base_15));
            let dayG15_key = dayG15_obj["YYYY-MM-DD"]; let dayH16_key = dayH16_obj["YYYY-MM-DD"]; let dayI17_key = dayI17_obj["YYYY-MM-DD"];
            let G15_date = new Date(dayG15_key); let H16_date = new Date(dayH16_key);
            let G15_string = G15_date.toString(); let H16_string = H16_date.toString();
            
            let mili1 = Date_now - 1600000000000;
            let username = "guest_"+(mili1.toString(36));
            let buffer_month;
            if (3 < user_h && user_h < 17 ){ buffer_month = parseInt(dayB_key.slice(5,7))+1
            } else{ buffer_month = parseInt(dayC_key.slice(5,7))+1
            };
            let buffer_key;
            if (buffer_month < 13){
                if (buffer_month < 10){
                    buffer_month = "0" + buffer_month.toString()
                } else{
                    buffer_month = buffer_month.toString()
                }
                if (3 < user_h && user_h < 17 ){ buffer_key = dayB_key.slice(0,5)+buffer_month+dayB_key.slice(7,)
                } else{ buffer_key = dayC_key.slice(0,5)+buffer_month+dayC_key.slice(7,)
                };
            } else{
                if (3 < user_h && user_h < 17 ){
                    let new_year = (parseInt(dayB_key.slice(0,4))+1).toString();
                    buffer_key = new_year+"-01-"+dayB_key.slice(8,)
                } else{
                    let new_year = (parseInt(dayC_key.slice(0,4))+1).toString();
                    buffer_key = new_year+"-01-"+dayC_key.slice(8,)
                }
            };
            let new_date = new Date(buffer_key + TIMEZONE);
            let buf_new_month = new_date.getMonth() + 1;
            while(buffer_month +1 < buf_new_month){
                let buf_mili = new_date.getTime() - 86400000;
                new_date = new Date(buf_mili);
                buf_new_month = new_date.getMonth() + 1;
            };
            let new_monthly_obj = JSON.parse(dayModule.dayA((new_date.getTime())));
            let new_monthly_key = new_monthly_obj["YYYY-MM-DD"];
            let new_monthly_string = new_date.toString();

            let notes_obj = {};
            if (3 < user_h && user_h < 17 ){
                notes_obj[dayA_key] = {
                    "YYYY-MM-DD": dayA_key,
                    "weekday":dayA_obj['weekday'],
                    "day": dayA_obj['day'],
                    "notes":[
                        ["Hi! *CLICK ME* These are the Notes, to remind you of important to-dos",Date_now+1,today_string],
                        ["Until 16:59, you will see notes for today and tomorrow",Date_now+2,today_string],
                        ["From 17:00 onwards, for tomorrow and after tomorrow",Date_now+3,today_string],
                        ['You can add a new note by clicking on "new note..." ↓',Date_now+4,today_string],
                        ["When you finish writing, click anywhere outside of it",Date_now+5,today_string],
                    ]
                };
                notes_obj[dayB_key] = {
                    "YYYY-MM-DD": dayB_key,
                    "weekday":dayB_obj['weekday'],
                    "day": dayB_obj['day'],
                    "notes":[
                        ["Right-click to see options",Date_now+6,tomorrow_string],
                        ["...like highlighting!",Date_now+7,tomorrow_string],
                        ["Or making a note repeat, weekly...",Date_now+8,tomorrow_string],
                        ["or monthly, like this one! (at the same day of the month)",Date_now+9,tomorrow_string],
                        ["You should also be seeing the weather forecast for this day (from 06 to 21h)",Date_now+10,tomorrow_string]
                    ]
                };
                notes_obj[dayC_key] = {
                        "YYYY-MM-DD": dayC_key,
                        "weekday":dayC_obj['weekday'],
                        "day": dayC_obj['day'],
                        "notes":[]
                };
            } else{
                notes_obj[dayA_key] = {
                    "YYYY-MM-DD": dayA_key,
                    "weekday":dayA_obj['weekday'],
                    "day": dayA_obj['day'],
                    "notes":[]
                };
                notes_obj[dayB_key] = {
                    "YYYY-MM-DD": dayB_key,
                    "weekday":dayB_obj['weekday'],
                    "day": dayB_obj['day'],
                    "notes":[
                        ["Hi! *CLICK ME* These are the Notes, to remind you of important to-dos",Date_now+1,today_string],
                        ["Until 16:59, you will see notes for today and tomorrow",Date_now+2,today_string],
                        ["From 17:00 onwards, for tomorrow and after tomorrow",Date_now+3,today_string],
                        ['You can add a new note by clicking on "new note..." ↓',Date_now+4,today_string],
                        ["When you finish writing, click anywhere outside of it",Date_now+5,today_string],
                    ]
                };
                notes_obj[dayC_key] = {
                    "YYYY-MM-DD": dayC_key,
                    "weekday":dayC_obj['weekday'],
                    "day": dayC_obj['day'],
                    "notes":[
                        ["Right-click to see options",Date_now+6,tomorrow_string],
                        ["...like highlighting!",Date_now+7,tomorrow_string],
                        ["Or making a note repeat, weekly...",Date_now+8,tomorrow_string],
                        ["or monthly, like this one! (at the same day of the month)",Date_now+9,tomorrow_string],
                        ["You should also be seeing the weather forecast for this day (from 06 to 21h)",Date_now+10,tomorrow_string]
                    ]
                };
            };
            notes_obj[dayD5_key] = {
                    "YYYY-MM-DD": dayD5_key,
                    "weekday":dayD5_obj['weekday'],
                    "day": dayD5_obj['day'],
                    "notes":[
                        ["Coming-up events for the next 7 days...",Date_now+11,( D5_string.slice(0,3)+','+D5_string.slice(3,10) )]
                    ]
            };
            notes_obj[dayE6_key] = {
                    "YYYY-MM-DD": dayE6_key,
                    "weekday":dayE6_obj['weekday'],
                    "day": dayE6_obj['day'],
                    "notes":[
                        ["will appear here. To access them, use...",Date_now+12,( E6_string.slice(0,3)+','+E6_string.slice(3,10) )]
                    ]
            };
            notes_obj[dayF7_key] = {
                    "YYYY-MM-DD": dayF7_key,
                    "weekday":dayF7_obj['weekday'],
                    "day": dayF7_obj['day'],
                    "notes":[
                        ["the calendar icon at the top-right corner",Date_now+13,( F7_string.slice(0,3)+','+F7_string.slice(3,10) )]
                    ]
            };
            notes_obj[dayG15_key] = {
                    "YYYY-MM-DD": dayG15_key,
                    "weekday":dayG15_obj['weekday'],
                    "day": dayG15_obj['day'],
                    "notes":[
                        ["Coming-up events for the next 8~31 days...",Date_now+14,( G15_string.slice(0,3)+','+G15_string.slice(3,10) )]
                    ]
            };
            notes_obj[dayH16_key] = {
                    "YYYY-MM-DD": dayH16_key,
                    "weekday":dayH16_obj['weekday'],
                    "day": dayH16_obj['day'],
                    "notes":[
                        ["will appear here. Note that the next one is from a monthly note",Date_now+15,( H16_string.slice(0,3)+','+H16_string.slice(3,10) )]
                    ]
            };
            notes_obj[new_monthly_key] = {
                    "YYYY-MM-DD": new_monthly_key,
                    "weekday":new_monthly_obj['weekday'],
                    "day": new_monthly_obj['day'],
                    "notes":[
                        ["or monthly, like this one! (at the same day of the month)",Date_now+9,( new_monthly_string.slice(0,3)+','+new_monthly_string.slice(3,10) )]
                    ]
            };

            let routines_obj = {};
            routines_obj['weekly'] = {};
            routines_obj["monthly"] = {};
            routines_obj['highlight'] = {};
            if (3 < user_h && user_h < 17 ){
                if ((dayB_key.slice(8,))[0] == "0"){
                    routines_obj['monthly'][dayB_key.slice(9,)] = ["or monthly, like this one! (at the same day of the month)"];
                } else{
                    routines_obj['monthly'][dayB_key.slice(8,)] = ["or monthly, like this one! (at the same day of the month)"];
                }
                routines_obj['highlight'][dayB_key] = [["...like highlighting!",Date_now+7]]
            } else{
                if ((dayC_key.slice(8,))[0] == "0"){
                    routines_obj['monthly'][dayC_key.slice(9,)] = ["or monthly, like this one! (at the same day of the month)"];
                } else{
                    routines_obj['monthly'][dayC_key.slice(8,)] = ["or monthly, like this one! (at the same day of the month)"];
                }
                routines_obj['highlight'][dayC_key] = [["...like highlighting!",Date_now+7]]
            };
            let buf_prj_ddl_obj = JSON.parse(dayModule.dayA((Date_now + 15778800000)));         // 6 months for the Project deadline
            let buf_pfj_ddl_key = buf_prj_ddl_obj["YYYY-MM-DD"];
            let projects_arr = [
                {
                    "title":"Project A",
                    "final_deadline": buf_pfj_ddl_key,
                    "tasks_todo":[
                        {           
                            "task": "A Project is a series of tasks, like this one",
                            "obs":"",
                            "deadline": false
                        },
                        {
                            "task": "Both the Project and its tasks can",
                            "obs":"",
                            "deadline": false
                        },
                        {
                            "task": "have their own deadlines, that you",
                            "obs":"",
                            "deadline": dayC_key
                        },
                        {
                            "task": "can edit by right-clicking. Try this one",
                            "obs":"Hi there! This is a task's observation. You see... since a project is something that takes one's considerable amount of time and possibly has a lot of tasks to complete, the tasks itselves are limited to 40 characters, so the screen doesn't get polluted by a loooooong task description. If you want to further detail a task, use this Observations field, since it's character limit is 2000",
                            "deadline": dayD5_key
                        },
                        {
                            "task":"The title and deadline of the project...",
                            "obs":"... can also be right-clicked, so you will also get options of what to do with them, like deleting the whole Project. You can also make changes to the weather forecast by right-clicking it.",
                            "deadline": dayE6_key
                        },
                        {
                            "task":"If there is no weather forecast...",
                            "obs":"... right below the notes up there, it is because the weather API failed to fetch data. The string used in AXIOS to get the weather forecast was: "+`https://api.open-meteo.com/v1/forecast?latitude=${user_lat}&longitude=${user_lon}&hourly=temperature_2m,weathercode&daily=sunrise,sunset&timezone=${GMT_NAME}&forecast_days=3`,
                            "deadline": dayI17_key
                        }
                    ],
                    "tasks_done":[]
                }
            ];
            
            let x_db;
            try{
                let weather_obj2 = await getWeather(user_lat, user_lon, GMT_NAME, hour_user,1,false);
                let weather_str = weather_obj2[0];
                x_db = weather_obj2[1];
                if(x_db) { closeDb(x_db); x_db = 0
                };
                if (weather_str){
                    let db;
                    try{
                        db = await openDb('guest');
                        db.run('INSERT INTO clients (user,pw_hash,realname) VALUES(?,?,?)', [username, "00000", "Guest user"], function(err) {
                            if (err) {
                                console.log('Error while INSERT INTO clients (user,pw_hash,realname):',err.message);
                            } else{
                                console.log(`INSERT INTO clients (user,pw_hash,realname) - Row(s) updated: ${this.changes}`);
                                db.all('SELECT * FROM clients WHERE (user,pw_hash) = (?,?)', [username,"00000"], function (err, rows) {
                                    if (err){
                                        console.log('Error while SELECT * FROM clients:',err.message);
                                    } else{
                                        let designated_id = (rows[0]['id']);
                                        db.run('INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                        [designated_id, username, "Guest user", JSON.stringify(notes_obj), JSON.stringify(routines_obj), JSON.stringify(projects_arr), weather_str,Date_now,hour_user,GMT,GMT_NAME,TIMEZONE,user_lat,user_lon, 1, 0], function(err) {
                                            if (err) {
                                                console.log('Error while INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple):',err.message);
                                            } else{
                                                console.log(`INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) - Row(s) updated: ${this.changes}`);
                                                session = req.session;
                                                session.userid = designated_id;
                                                try{  
                                                    closeDb(db, 'guest success');
                                                }catch{}
                                                return res.redirect('/home');
                                            }
                                        })
                                    }
                                })
                            }
                        })
                    } catch (err){
                        console.log('catch error generated after try{ db = await openDb(guest):', err.message);
                        if (db){ closeDb(db,'catch error generated after try{ db = await openDb(guest):')
                        };
                        return res.redirect('/login')
                    }
                } else{
                    let db;
                    try{
                        db = await openDb('guest');
                        db.run('INSERT INTO clients (user,pw_hash,realname) VALUES(?,?,?)', [username, "00000", "Guest user"], function(err) {
                            if (err) {
                                console.log('Error while INSERT INTO clients (user,pw_hash,realname):', err.message)
                            } else{
                                console.log(`INSERT INTO clients (user,pw_hash,realname) - Row(s) updated: ${this.changes}`);
                                db.all('SELECT * FROM clients WHERE (user,pw_hash) = (?,?)', [username,"00000"], function (err, rows) {
                                    if (err){
                                        console.log('Error while SELECT * FROM clients:',err.message);
                                    } else{
                                        let designated_id = (rows[0]['id']);
                                        db.run('INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                        [designated_id, username, "Guest user", JSON.stringify(notes_obj), JSON.stringify(routines_obj), JSON.stringify(projects_arr), JSON.stringify([]),Date_now,hour_user,GMT,GMT_NAME,TIMEZONE,user_lat,user_lon, 1, 0], function(err) {
                                            if (err) {
                                                console.log('Error while INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple):',err.message);
                                            } else{
                                                console.log(`INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) - Row(s) updated: ${this.changes}`);
                                                session = req.session;
                                                session.userid = designated_id;
                                                try{  
                                                    closeDb(db, 'guest success');
                                                }catch{}                                                    
                                                return res.redirect('/home');
                                            }
                                        })
                                    }
                                })
                            }
                        })
                    } catch (err){
                        console.log('catch error generated after try{ db = await openDb(guest):', err.message);
                        if (db){ closeDb(db,'catch error generated after try{ db = await openDb(guest):')
                        };
                        return res.redirect('/login')
                    }
                }
            }catch (err){ console.log('Error while getWeather(user_lat, user_lon, GMT_NAME, hour_user,1,false):', err.message);
                if (x_db){ closeDb(x_db)
                };
                let db;
                try{
                    db = await openDb('guest');
                    db.run('INSERT INTO clients (user,pw_hash,realname) VALUES(?,?,?)', [username, "00000", "Guest user"], function(err) {
                        if (err) {
                            console.log('Error while INSERT INTO clients:',err.message);
                        } else{
                            console.log(`INSERT INTO clients - Row(s) updated: ${this.changes}`);
                            db.all('SELECT * FROM clients WHERE (user,pw_hash) = (?,?)', [username,"00000"], function (err, rows) {
                                if (err){
                                    console.log('/login guest - error in db.all:',err.message);
                                } else{
                                    let designated_id = (rows[0]['id']);
                                    db.run('INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                    [designated_id, username, "Guest user", JSON.stringify(notes_obj), JSON.stringify(routines_obj), JSON.stringify(projects_arr), JSON.stringify([]),Date_now,hour_user,GMT,GMT_NAME,TIMEZONE,user_lat,user_lon, 1, 0], function(err) {
                                        if (err) {
                                            console.log('Error while INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple):',err.message);
                                        } else{
                                            console.log(`INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) - Row(s) updated: ${this.changes}`);
                                            session = req.session;
                                            session.userid = designated_id;
                                            try{  
                                                closeDb(db, 'guest success');
                                            }catch{}                                                    
                                            return res.redirect('/home');
                                        }
                                    })
                                }
                            })
                        }
                    })
                } catch (err){
                    console.log('Error while openDb(guest):', err.message);
                    if (db){ closeDb(db,'Error while openDb(guest)')
                    };
                    return res.redirect('/login')
                }
            }
        } else{
            let buf_p = hashPW(login_array[1]);
            let x_db;
            try{
                let result = await checkLogin(login_array[0], buf_p);
                let answer_id = result[0];
                x_db = result[1];
                buf_p = 0;
                if(x_db){ closeDb(x_db)
                };
                if (answer_id){
                    session = req.session;
                    session.userid = answer_id;
                    let x_db2;
                    try{
                        let tasks_raw2 = await selectFromTasksTable( answer_id );
                        let tasks_raw = tasks_raw2[0];
                        x_db2 = tasks_raw2[1];
                        if (x_db2){ closeDb(x_db2, '/login try{ let tasks_raw2 = await selectFromTasksTable( answer_id )')
                        };
                        if (tasks_raw){
                            let celsius = tasks_raw['Cel'];
                            let hour_user = login_array[4];
                            if (typeof(hour_user) == 'object'){ hour_user = hour_user[hour_user.length-1];
                            };
                            hour_user = hour_user.toString();
                            if(hour_user.length == 1){ hour_user = "0"+hour_user
                            };
                            let current_timestamp = login_array[7];
                            let user_lat = login_array[5];
                            let user_lon = login_array[6];
                            let TIMEZONE = login_array[2];
                            let GMT_NAME = login_array[3];
                            let GMT = login_array[8];
                            let x_db3;
                            try{
                                weather_array = await getWeather(user_lat, user_lon, GMT_NAME, hour_user, celsius);
                                weather_str = weather_array[0];
                                x_db3 = weather_array[1];
                                if (x_db3){ closeDb(x_db3); x_db3 = 0;
                                };
                                if (weather_str){
                                    let db;
                                    try{
                                        db = await openDb('weather_str');
                                        db.run('UPDATE tasks SET (weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon) = (?,?,?,?,?,?,?,?) WHERE user_id = ?',
                                        [weather_str, current_timestamp, hour_user, GMT, GMT_NAME, TIMEZONE, user_lat, user_lon, answer_id], function(err) {
                                            if (err) {
                                                console.log('Error while UPDATE tasks SET (weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon):',err.message)
                                            } else{
                                                console.log(`UPDATE tasks SET (weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon) - Row(s) updated: ${this.changes}`);
                                                db.run('UPDATE clients SET (log_allowance_delay, log_try, log_attempt, log_ok) = (?,?,?,?) WHERE id = ?',
                                                [0, 0, 0, Date_now, answer_id], function(err) {
                                                    if (err) {
                                                        console.log('Error while UPDATE clients SET (log_allowance_delay, log_try, log_attempt, log_ok):',err.message)
                                                    } else{
                                                        console.log(`UPDATE clients SET (log_allowance_delay, log_try, log_attempt, log_ok) - Row(s) updated: ${this.changes}`)
                                                    }
                                                })
                                            }
                                        })
                                    } catch (err){ console.log('Error while openDb(weather_str):', err.message)
                                    } finally{
                                        if (db){ closeDb(db, 'Error while openDb(weather_str)')
                                        };
                                        return res.redirect('/home')
                                    }
                                } else{
                                    let db;
                                    try{
                                        db = await openDb('NO weather_str');
                                        db.run('UPDATE tasks SET ( timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon) = (?,?,?,?,?,?,?) WHERE user_id = ?',
                                        [current_timestamp, hour_user, GMT, GMT_NAME, TIMEZONE, user_lat, user_lon, answer_id], function(err) {
                                            if (err) {
                                                console.log('Error while UPDATE tasks SET ( timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon):',err.message)
                                            } else{
                                                console.log(`UPDATE tasks SET ( timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon) - Row(s) updated: ${this.changes}`);
                                                db.run('UPDATE clients SET (log_allowance_delay, log_try, log_attempt, log_ok) = (?,?,?,?) WHERE id = ?',
                                                [0, 0, 0, Date_now, answer_id], function(err) {
                                                    if (err) {
                                                        console.log('Error while UPDATE clients SET (log_allowance_delay, log_try, log_attempt, log_ok)',err.message)
                                                    } else{
                                                        console.log(`UPDATE clients SET (log_allowance_delay, log_try, log_attempt, log_ok) - Row(s) updated: ${this.changes}`)
                                                    }
                                                })
                                            }
                                        })
                                    } catch (err){ console.log('Error while openDb(NO weather_str):', err.message)
                                    } finally{
                                        if (db){ closeDb(db, 'Error while openDb(NO weather_str)')
                                        };
                                        return res.redirect('/home')
                                    }
                                }
                            } catch(err){
                                console.log('Error while getWeather(user_lat, user_lon, GMT_NAME, hour_user, celsius):', err.message);
                                if (x_db3){ closeDb(x_db3, 'Error while getWeather(user_lat, user_lon, GMT_NAME, hour_user, celsius)')
                                };
                                return res.redirect('/home')
                            }   
                        } else{ console.log('No tasks_raw. Redirecting to login...');
                            return res.redirect('/login')
                        }
                    } catch (err){ console.log('Error while selectFromTasksTable( answer_id ):', err.message);
                        if (x_db2){ closeDb(x_db2, 'Error while selectFromTasksTable( answer_id )')
                        };
                        return res.redirect('/home')
                    }
                } else{
                    let x_db;
                    try{
                        let result = await checkLogin(login_array[0]);
                        let x1 = result[0];
                        x_db = result[1];
                        let attempt = 0;
                        let allowance_delay = 0;
                        if (x1){ console.log(`### WRONG PASSWORD FOR USER ${x1} ###`);
                            x_db.all('SELECT * FROM clients WHERE (user) = (?)', [login_array[0]], function (err, rows) {
                                if (err){ console.log(' Error while SELECT * FROM clients:',err.message);
                                } else {
                                    if (rows[0]['log_attempt']){ attempt = rows[0]['log_attempt']
                                    };
                                    if (rows[0]['log_allowance_delay']){ allowance_delay = rows[0]['log_allowance_delay']
                                    };
                                    if (allowance_delay){
                                        if (Date_now < allowance_delay){
                                            if (x_db){ closeDb(x_db, '### login not allowed due to Date_now < allowance_delay ###')
                                            };
                                        } else{
                                            x_db.run('UPDATE clients SET (log_allowance_delay, log_try, log_attempt) = (?,?) WHERE user = ?',
                                            [0, Date_now, 0, login_array[0]], function(err) {
                                                if (err) { console.log('Error while UPDATE clients SET (log_allowance_delay):',err.message)
                                                } else{ console.log(`UPDATE clients SET (log_allowance_delay) - Row(s) updated: ${this.changes}`)
                                                }
                                            })
                                        }
                                    } else{
                                        attempt += 1;
                                        if (attempt > 5){
                                            x_db.run('UPDATE clients SET (log_allowance_delay, log_attempt) = (?,?) WHERE user = ?', 
                                                [(Date_now + 180000),0, login_array[0]], function(err) {
                                                if (err) { console.log('Error in UPDATE clients SET (log_allowance_delay, log_attempt):',err.message)
                                                } else{ console.log(`UPDATE clients SET (log_allowance_delay, log_attempt) - Row(s) updated: ${this.changes}`);
                                                }
                                            })
                                        } else{
                                            x_db.run('UPDATE clients SET (log_try, log_attempt) = (?,?) WHERE user = ?',
                                                [Date_now, attempt, login_array[0]], function(err) {
                                                if (err) { console.log('Error in UPDATE clients SET (log_try, log_attempt):',err.message)
                                                } else{ console.log(`UPDATE clients SET (log_try, log_attempt) - Row(s) updated: ${this.changes}`);
                                                }
                                            })
                                        }
                                    }
                                }
                            });
                        } else{ console.log('No id fetched - username not in DB')
                        }
                    }catch(err){ console.log('Error while checkLogin(login_array[0]):', err.message);
                    } finally{
                        if (x_db){ closeDb(x_db,'Error while checkLogin(login_array[0])')
                        };
                        return res.redirect('/login')
                    }
                }
            } catch (err){ console.log('Error while checkLogin(login_array[0], buf_p):', err.message);
                if (x_db){ closeDb(x_db,'Error while checkLogin(login_array[0], buf_p)')
                };
                return res.redirect('/login')
            }
        }        
    };

    if(req.body.change_pw){
        res.redirect('/change_pw')
    };

});

app.post('/register', async (req, res) => {
    console.log('app.post(/register, async (req, res) => {');
    
    if (req.body.register_array){
        let register_array = req.body.register_array;
        if (register_array[0].length > 1){
            console.log('WARNING! THERE WERE ' + register_array.length + ' OBJECTS IN register_array!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            register_array = register_array[(register_array.length -1)]
        };
        let r_array = JSON.parse(req.body.register_array);
        let username = r_array[0];
        let realname = r_array[2];
        let buf = hashPW(r_array[1]);
        let x_db;
        try{
            let result = await checkLogin(username, buf);
            let answer_id = result[0];
            x_db = result[1];
            if (x_db){ closeDb(x_db, '/register checkLogin')
            };
            if (answer_id){
                buf = "";
                console.log('### user already exists ###');
                return res.redirect('/login')
            } else{
                console.log('user does not exist - register proceeding');
                let log_arr = JSON.parse(req.body.login_array);
                let buf_tmz = log_arr[2];
                let buf_iana = log_arr[3];
                let buf_hr = log_arr[4];
                let buf_lat = log_arr[5];
                let buf_lon = log_arr[6];
                let buf_tmstp = log_arr[7];
                let buf_gmt = log_arr[8];               
                let designated_id, buf_wea2, buf_wea, x_db2, db;
                try{
                    buf_wea2 = await getWeather(buf_lat, buf_lon, buf_iana, buf_hr);
                    buf_wea = buf_wea2[0];
                    x_db2 = buf_wea2[1]
                } catch (err){
                    console.log('Error while getWeather(buf_lat, buf_lon, buf_iana, buf_hr):', err.message);
                    buf_wea = JSON.stringify([])
                } finally{
                    if(x_db2){ closeDb(x_db2, 'Error while getWeather(buf_lat, buf_lon, buf_iana, buf_hr)')
                    };
                    let db;
                    try{
                        db = await openDb('register finally');
                        db.run('INSERT INTO clients (user,pw_hash,realname) VALUES(?,?,?)', [username,buf,realname], function (err) {
                            if (err) { console.log('Error while INSERT INTO clients (user,pw_hash,realname):',err.message);
                            } else{ console.log(`INSERT INTO clients (user,pw_hash,realname) - Row(s) updated: ${this.changes}`);
                                db.all('SELECT * FROM clients WHERE (user,pw_hash) = (?,?)', [username,buf], function (err, rows) {
                                    if (err){ console.log('Error while SELECT * FROM clients:',err.message);
                                    } else {
                                        designated_id = (rows[0]['id']);
                                        db.run('INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                        [designated_id, username, realname, JSON.stringify({}), JSON.stringify({}), JSON.stringify([]), buf_wea,buf_tmstp,buf_hr,buf_gmt,buf_iana,buf_tmz,buf_lat, buf_lon, 1, 0], function(err) {
                                            if (err) { console.log('Error while INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple):',err.message)
                                            } else{ console.log(`INSERT INTO tasks (user_id, username, realname, notes, routines, projects, weather, timestamp, hour_str, gmt, gmt_iana, tmz, lat, lon, Cel, wtr_simple) - Row(s) updated: ${this.changes}`);
                                                return res.redirect('/login')
                                            }
                                        })
                                    }
                                })
                            }
                        })
                    } catch(err){ console.log('Error while openDb(register finally):', err.message);
                        if (db){ closeDb(db,'Error while openDb(register finally)')
                        };
                        return res.redirect('/login')
                    }
                }
            }
        } catch (err){ console.log('Error while checkLogin(username, buf):', err.message);
            if (x_db){ closeDb(x_db, 'Error while checkLogin(username, buf)')
            };    
            return res.redirect('/login')
        }

    } else { console.log('NO req.body.register_array');
        return res.redirect('/login')
    }
});

app.get('/change_pw',(req,res) => {
    res.render('change_pw')
});

app.post('/change_pw', async (req,res) => {
    if (req.body.change_pw_array){
        let change_pw_array_str = req.body.change_pw_array;
        if (change_pw_array_str[0].length > 1){
            console.log('WARNING! THERE WERE ' + change_pw_array_str.length + ' OBJECTS IN change_pw_array_str!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            change_pw_array_str = change_pw_array_str[(change_pw_array_str.length -1)]
        };
        let change_pw = JSON.parse(change_pw_array_str);
        let inep = hashPW(change_pw[2]);
        let inop = hashPW(change_pw[1]);
        let x_db;
        try{
            let buf_id = await checkLogin(change_pw[0], inop);
            buf_id = buf_id[0];
            x_db = buf_id[1];
            if (buf_id){
                x_db.run('UPDATE clients SET (pw_hash,old_pw_hash, pw_change) = (?,?,?) WHERE user = ?', [inep, inop, Date.now(), change_pw[0]], function(err) {
                    if (err) { console.log('Error while UPDATE clients SET (pw_hash,old_pw_hash, pw_change):',err.message);
                    } else{ console.log(`UPDATE clients SET (pw_hash,old_pw_hash, pw_change) - Row(s) updated: ${this.changes}`)
                    }
                })
            };
            try{ closeDb(db, 'x_db.run(UPDATE clients...')
            } catch (err){ console.log('Error while closeDb(db, x_db.run(UPDATE clients...',err.message)
            }
            return res.redirect('/login')
        } catch (err){ console.log('Error while let buf_id = await checkLogin(...):', err.message);
            if (db){ closeDb(db,'Error while let buf_id = await checkLogin(...)')
            };
            return res.redirect('/change_pw')
        }
    }
});

app.listen(3000, function(){
    console.log("listening on port 3000");
});
