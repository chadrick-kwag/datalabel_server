var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var multer = require('multer');
var storage = multer.diskStorage({
    destination: function(req, file, cb) {
        console.log("here is file info: ", file)
        console.log("print req.body from multer storage function:", req.body);

        userid = req.body.userid
        dsid = req.body.dsid

        BASEDEST='uploads'
        finedest = BASEDEST+"/"+dsid

        console.log("finedest =",finedest)

        // check if dir exists
        dirpath = path.join(__dirname,finedest)
        fs.stat(dirpath,function(err,status){
            if(err){
                console.log("dir doesn't exist")
                fs.mkdir(dirpath,function(err){
                    if(err){
                        console.log("error occured when making dir")
                    }
                    else{
                        console.log("mkdir success")
                        cb(null,finedest)
                    }
                })
            }
            // assume that dir exists
            console.log("dir exists")
            cb(null,finedest)

        })


        // cb(null, finedest);
    },
    filename: function(req, file, cb) {
        // add this to mongodb... what format?
        cb(null, file.originalname);
    }
});
var jwt = require('jsonwebtoken')
var upload = multer({ storage: storage });


var GoogleAuth = require('google-auth-library');
var auth = new GoogleAuth;
var CLIENT_ID = "873694293520-q047egbt95605dlh2t9vv8ijd65j8i9i.apps.googleusercontent.com"
var client = new auth.OAuth2(CLIENT_ID, '', '');

var MongoClient = require('mongodb').MongoClient,
    assert = require('assert')

var mongourl = 'mongodb://localhost:27017/datalabelprj'

var mongodb

MongoClient.connect(mongourl, function(err, db) {
    assert.equal(null, err);
    console.log("connected successfully to mongo server");
    mongodb = db


});

var JWT_SECRET_KEY = "CHADRICK"



app.use(bodyParser.json());


app.get('/', function(req, res) {
    console.log("request from ", req.connection.remoteAddress);
    res.send('hello from aws');
});


// this will fetch for alll dslist for now.
// send them thumbnail_url, dataset title, dataset id
app.post('/dslist', function(req, res) {
    // console.log("request for dslist : ", req);


    collection = mongodb.collection('datasets');
    // fetch all datasets
    collection.find({}, { id: 1, title: 1 }).toArray(function(err, result) {
        if (err) throw err;
        // console.log(result);
        // sendback = { 'result': result};
        res.send(result);

    });

});





app.get('/download/dszip', function(req, res) {
    console.log("inside get download dszip");
    var request_ds_id = req.query.id;
    console.log("request id: ", request_ds_id);

    if (request_ds_id == undefined) {
        console.log("request ds id is undefined. abort");
        res.send("no request id");
        return;
    }

    // fetch the matching zip_path based on ds_id
    mongodb.collection('datasets').find({ "id": parseInt(request_ds_id) }).toArray(function(err, result) {
        if (err) throw err;
        // check if result exists. if not, then send error msg in response.

        // console.log(result);

        if (result.length == 0) {
            // when it doesn't exist.
            console.log("mongo query result length=0");
            res.status(409);
            res.send("no dataset exist for that requested dataset id");

        } else if (result.length > 1) {
            // internal db fault. 
            console.log("mongo query result length > 1");
            res.send("duplicate dataset found. error");
        } else {
            // fetch the zip path
            zip_path = result[0].zip_path;

            zip_path = path.join(__dirname, zip_path);

            console.log("fetched zippath = ", zip_path);

            // var filepath = path.join(__dirname, 'dszips/' + request_ds_id + '.zip');

            fs.access(zip_path, (err) => {
                if (err) {
                    console.log(zip_path, " doesn't seem to exist.");
                    res.status(512)
                    res.send("request dszip file doesn't exist");
                } else {
                    console.log(zip_path, " exists.");
                    // now send this file to the response.
                    var stat = fs.statSync(zip_path);
                    res.writeHead(200, { 'Content-Length': stat.size });
                    var readstream = fs.createReadStream(zip_path);
                    readstream.pipe(res);

                }
            });

        }

    })



});


// send the thumbnail image file
app.get('/thumbnail', function(req, res) {
    console.log("thumbnail request for id=", req.query.id);
    var reqid = req.query.id;

    if (reqid == undefined) {
        res.status(409);
        res.send("invalid dataset id requested");
    }

    // fetch the thumbnail url from db
    mongodb.collection('datasets').find({ "id": parseInt(reqid) }, { thumbnailfile: 1 }).toArray(function(err, result) {
        if (err) {
            res.status(512);
            res.send("no thumbnail found");
        }

        if (result.length == 0 || result.length > 1) {
            res.status(512);
            res.send("thumbnail file query failed");
        } else {
            tnpath = "/thumbnail/" + result[0].thumbnailfile
            tnpath = path.join(__dirname, tnpath);
            console.log("fetched thumbnail image path=", tnpath);

            fs.access(tnpath, (err) => {
                if (err) {
                    console.log("error fetching ", tnpath)
                    res.status(512)
                    res.send("thumbnail file not found")
                } else {
                    var stat = fs.statSync(tnpath)
                    res.writeHead(200, { 'Content-Length': stat.size })
                    var readstream = fs.createReadStream(tnpath);
                    readstream.pipe(res);
                }
            })
        }

    });
});


// deal with uploading from client after done with labeling.
// app.post('/upload/labelzip', upload.single('labelzip'), function(req, res, next) {
//     console.log(req.file.filename + " received");
//     res.setHeader('Content-Type', 'application/json');
//     res.setHeader('charset', 'utf-8');
//     res.send("{'result':'1'}");
// });


app.post('/upload/labelzip', upload.single('labelzip'), function(req, res, next) {
    console.log(req.file.filename + " received");

    req.file.destination = path.join(__dirname, "/tempupload")
    console.log("changed file destination in app.post")

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('charset', 'utf-8');
    res.send("{'result':'1'}");
});



// deal with login
app.post('/tokensignin', function(req, res) {
    console.log("inside tokensignin");
    var reqobject = req.body;
    var idtoken = reqobject.idToken;
    console.log("received idToken=", idtoken);

    var useremail = ""
    client.verifyIdToken(idtoken, CLIENT_ID, function(e, login) {
        var payload = login.getPayload();
        var userid = payload['sub'];
        // console.log("userid=",userid);
        // console.log("payload=",payload);

        useremail = payload['email']
        console.log("email=", useremail);


        collection = mongodb.collection('users');

        collection.find({ 'email': useremail }).toArray(function(err, docs) {
            assert.equal(err, null);
            queryresult = docs
            if (queryresult.length == 0) {
                console.log("no user found with given email");
                // add the new user to the database for simplicity

                addnewuser(useremail);





                res.send("{'userverified':false}");

            } else if (queryresult.length > 1) {
                console.log("user query result >1. something is weird");
                /// this is internal error. but since the user is registered anyway, allow the user to login.


                res.send("{'userverified':true}");
            } else {
                console.log("user exists");
                result = docs[0];
                console.log("fetched userid=", result['_id'], " second versionww");

                jwt.sign({ 'userid': result['_id'], 'user_mail':useremail }, JWT_SECRET_KEY, function(err, token) {
                    if (err) {
                        respjson = {}
                        respjson['userverified']=true
                        respjson['jwt']=''
                        res.send(JSON.stringify(respjson))
                    } else {
                        console.log("jwt created:",token)
                        respjson = {}
                        respjson['userverified']=true
                        respjson['jwt']=token
                        res.send(JSON.stringify(respjson));
                    }
                })


                
            }

        });

    });


});


app.post('/dsinfo', function(req, res) {
    console.log("dsinfo request received");
    var id = req.body.id;
    var reqfields = req.body.reqfield;
    console.log("id=", id, "reqfield=", reqfields);

    filterobj = new Object();
    for (i = 0; i < reqfields.length; i++) {
        filterobj[reqfields[i]] = 1
    }



    mongodb.collection('datasets').find({ 'id': id }, filterobj).toArray(function(err, result) {
        if (err) {

            console.log("error occured during mongodb find");
            res.send("{'success':false}");
            throw err;

            return;
        }

        if (result.length > 1 || result.length == 0) {
            console.log("length of result is weird");
            res.send("{'success':false}");

        } else {
            console.log("correct case");
            console.log("fetched result=", result[0])
            var respobj = new Object();
            respobj.success = true;
            respobj.description = result[0].description;
            console.log("response = ", JSON.stringify(respobj));
            res.send(JSON.stringify(respobj));
        }



    })


});


function addnewuser(email) {
    collection = mongodb.collection('users');
    collection.insert([{ 'email': email }], null, function(err, res) {
        if (err != null) {
            console.log("err:", err);
        } else {
            console.log("addnewuser result=", res);
        }

    });
}


var server = app.listen(4001, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log("app listening at %s:%s", host, port);
});