'use strict';

/**
 * $: Shortnand variable for common functionality.
 */
const $ = {
    //$.${0,1,2} will be used to encapsulate logging. 0=error, 1=warning, 2=informational
    /**
     * Error message handler
     * @param {*} message 
     */
    $0: function(message) { console.error(message.substring(0, 5000)) }, 
    /**
     * Warning message handler
     * @param {*} message 
     */
    $1: function(message) { console.error(message.substring(0, 5000)) }, 
    /**
     * Informational message handler
     * @param {*} message 
     */
    $2: function(message) { if ($.config.debug) console.log(message) },

    /**
     * Convert to Integer
     * @param {any} value A value/object to parse
     * @param {string} property Property name to resolve (default = .ID)
     * @returns {Array} [0]: converted integer value, [1]: source item value
     */
    cint: function(value, property = "ID") {
        var r
        if (Array.isArray(value)) {
            for (var i = 0; i < value.length; i++) {
                r = $.cint(value[i])[0];
                if (r!=null) return [r, value[i]];
            }
            return [null, value];
        }
        if (value!=null) {
            r = parseInt(value)
            if (!isNaN(r)) return [r, value];
            r = parseInt(value[property])
            if (!isNaN(r)) return [r, value];
        }
        return [null, value];
    },

    /**
     * Coerces an object to an array
     * @param {object} source Source object
     * @returns {Array<object>} Object converted to an Array
     */
    toArray: function (source) {
        return Array.isArray(source) ? source : [source];
    },


    //set defaults
    /**
     * Configuration items
     * @property {boolean} debug Whether to print debug messages to the console
     * @property {string} server Load Runner server
     * @property {number} domain Domain
     * @property {number} project Project
     * @property {string} user LRC account userid
     * @property {string} password LRC account password
     */
    config: {   
        /** Whether to print debug messages to the console */
        debug: true,     
        /** Server */ 
        server: "lr",
        /** Domain */
        domain: "default",
        /** Project */
        project: "default",
        /** LR account userid */
        user: "user",
        /** LR account password */
        password: "password",
        /** Proxy */
        proxy: ""
    },

    //lazy initializations
    fs: require("fs"),
    path: require("path"),
    util: require("util"),
    hb: require("handlebars"),

    //request method wraps request module into a Promise
    _request: null,
    /**
     * Wraps request module into a Promise
     * @param {any} options request.options
     * @param {string} label label used for identification in messages
     * @param {any} data form-data
     * @param {boolean} parse call JSON.parse(.body) upon resolve
     * @returns {Promise<any>} Promise with the results of the http request
     */
    request: function (options, label, data = null, parse = false) {
        if (this._request == null) {
            this._request = require("request");
            if ($.config.proxy.length > 0) this.agent = new require('https-proxy-agent')($.config.proxy);
        }
        if ($.config.proxy.length > 0) {
            options.agent = this.agent;
            options.rejectUnauthorized = false;
        }
        options.rejectUnauthorized = false
        options.requestCert = true
        
        return new Promise((resolve, reject) => {
            var n = label;
            var r = this._request(options, (error, response, body) => {
                if (error) {
                    $.$0(n + " " +error);
                    reject(error);
                }
                var s = response.statusCode;
                if ((s >= 200)&&(s <= 299)) {     
                    $.$2(`${n}.statusCode: ${s}`);
                    resolve(parse ? JSON.parse(response.body) : response);
                } else {
                    $.$1(`${n}.statusCode = ${s}`);
                    $.$1(`${n}.body = ${JSON.stringify(response)}`);
                    reject(response);
                }
            });
            $.$2(`${n} requested.`);
            if (data!=null) {       //used to push form-data if necessary
                data.pipe(r);
                $.$2(`${n} piped.`);
            }
        });
    }
}
module.exports = {
    /**
     * Configuration items
     * @property {boolean} debug Whether to print debug messages to the console
     * @property {string} server Load Runner server
     * @property {number} domain Domain
     * @property {number} project Project
     * @property {string} user LRC account userid
     * @property {string} password LRC account password
     */
    get config() {
        return $.config;
    },
    set config(value) {
        if (typeof value !== "undefined") {
            Object.keys(value).forEach(function(key,index) {
                if (typeof $.config[key] !== "undefined") $.config[key]=value[key];
            });
        }
    }
}



/**
 * Packages a source directory with a VuGen wrapper for uploading
 * @param {string} source source directory
 * @param {string} name script target name
 * @returns {Buffer} Buffer representing the zip file
 */
const vugen = async function (source, name) {

    const { join } = $.path;
    const util = $.util;
    const jszip = require("jszip");
    const fs = require('fs');
    fs.readdir = util.promisify(fs.readdir)
    let { readdir } = fs;
    async function zip(dir) {
        var z = new jszip();
        //capture a file list with "filter" values
        var m = {"default.usr":"4", "default.cfg":"4", "default.usp":"4", "parameters.yml":"2", "rts.yml":"2", "main.js":"2", "url.json":"2", "data.csv":"2"};
        var d = {"default.usr":"4"};
        var n = [];     //extra files
        var t = [];     //transactions
        //function to decide whether to append to zip
        var p = function(f) {
            var b = join(dir, f)
            if ($.fs.lstatSync(b).isDirectory()==false) { 
                z.file(f, $.fs.createReadStream(b, 'binary'));
                d[f] = m[f.toLowerCase()] || "1";
                $.$2('packaging \'' + f + '\'');
                if (f.toLowerCase()=="main.js") {
                    var r = ['',null,null];
                    r[0] = $.fs.readFileSync(b, 'utf8')
                    r[1] = r[0].match(/load\.Transaction\(\"(.+?)\"\)/gi)
                    if (r[1]!=null) t = t.concat(r[1].map(f => { return f.match(/\"(.+?)\"/i)[1]}))
                    r[2] = r[0].match(/<!---\s+?(.+?)\s+?--->/gi)
                    if (r[2]!=null) t = t.concat(r[2].map(f => { return f.match(/<!---\s+?(.+?)\s+?--->/i)[1]}))
                    t = [...new Set(t)];
                } else {
                    if (d[f]=="2") n.push(f) //Add to extra files list
                }
            }
            return b;
        }

        //adds the files to zip
        var x = (await readdir(dir)).map(f => p(f)) 
        dir = "./vugen/"
        x = (await readdir(dir)).map(f => p(f)) 
        
        //builds FileEntries within metadata xml file
        var fe = "";
        for (var x in d) {
            fe+=`\n<FileEntry Name="${x}" Filter="${d[x]}" />`;
        }
        var fn = "ScriptUploadMetadata.xml"
        var y = $.hb.compile($.fs.readFileSync(`./template/${fn}`, 'utf8'));
        z.file(fn,y({FileEntry: fe, Filter: d["main.js"], ScriptName: name}))

        fn = "default.usr"
        y = $.hb.compile($.fs.readFileSync(`./template/${fn}`, 'utf8'));
        z.file(fn,y({Order: t.join("__*delimiter*__"), Transactions: t.join("=\r\n")+"=\r\n", Extra: n.join("=\r\n")+"="}))

        //executes the zip build
        $.$2("zip.generateAsync()");

        /*      Write to output file
        z.generateNodeStream({type:'nodebuffer',streamFiles:true})
        .pipe(fs.createWriteStream('out.zip'))
        .on('finish', function () { console.log("out.zip written."); });
        //*/

        return z.generateAsync({ type: 'nodebuffer', streamFiles: false })
    }
    $.$2('source \'' + source + '\'');
    return zip(source);

}

/**
 * Packages a source directory for uploading using either zip or 'npm pack'
 * @param {boolean} npm true: use 'npm pack' command (default=false)
 */
const bundle = async function (source, npm = false) {
    if (npm) {
        var p = $.path;
        var s = p.resolve(source);
        var d = p.dirname(s);
        var t = s.replace(d, "").replace(p.sep, "./");
        $.$2(`packing "${t}"`);
        const exec = require('child_process').exec;
        return new Promise((resolve, reject) => {
            exec(`npm pack ${t}`, { cwd: d }, (error, stdout, stderr) => {
                if (error) {
                    $.$1(error);
                    reject(error);
                }
                var f = d + p.sep + stdout.trim();
                $.$2(`zip file "${f}" created.`);
                resolve($.fs.createReadStream(f))
            });
        });
    } else {
        const { join } = $.path;
        const util = $.util;
        const jszip = require("jszip");
        const fs = require('fs');
        fs.readdir = util.promisify(fs.readdir)
        let { readdir } = fs;
        async function zip(dir) {
            var z = new jszip();
            const files = (await readdir(dir)).map(f => { 
                var b = join(dir, f)
                if ($.fs.lstatSync(b).isDirectory()==false) { 
                    z.file(f, $.fs.createReadStream(b, 'binary'));
                    $.$2('packaging \'' + f + '\'');
                }
                return b;
            }) 
            $.$2("zip.generateAsync()");
            return z.generateAsync({ type: 'nodebuffer', streamFiles: false })
        }
        $.$2('source \'' + source + '\'');
        return zip(source);
    }
}
module.exports.Bundle = bundle

/**
 * Logon to LoadRunnerEnterprise
 * @param {string} user userid (default=config.user)
 * @param {string} password password (default=config.password)
 * @param {boolean} force force new logon (default=false)
 * @returns {Promise<any>} Results of the logon request
 */
const logon = async function(user = $.config.user, password = $.config.password, force = false) {
    if (($.logon!=null) && ($.logon instanceof Promise) && !force) return $.logon
    $.logon = new Promise((resolve, reject) => {
        var n = "logon";
        $.$2(n + '.request()');
        var p = (Buffer.from(`${$.config.user}:${$.config.password}`)).toString('base64');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/authentication-point/authenticate`,
            headers: { "Authorization": `Basic ${p}`, "accept": "application/json" }
        }
        var l = $.request(o, n);
        Promise.all([l]).then(function(l){ 
            var v = (new RegExp('LWSSO_COOKIE_KEY=([^;]*)').exec(l[0].headers['set-cookie'].join(",")))
            var u = (new RegExp('QCSession=([^;]*)').exec(l[0].headers['set-cookie'].join(",")))
            $.token = [v ? v[1]: null, u ? u[1]: null]
            $.$2(`token: '${$.token}'`);
            resolve($.token);
        }).catch((error)=>{ error = error.body||error; $.$0("error"+error); reject(error); })
    });
    return $.logon;
}
module.exports.Logon = logon

/**
 * Upload a script asset to LoadRunnerEnterprise
 * @param {string} name Desired name of script asset
 * @param {string} folder Folder path
 * @param {stream} stream Stream to upload (use .bundle or .vugen method)
 * @param {string} token Token from logon
 * @returns {Promise<any>} Results of the upload request
 */
const upload = async function (name, folder, stream, token = $.token) {
    var n = "upload";
    $.$2(n + '.request()');
    var o = {
        method: 'POST',
        url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/Scripts`,
        headers: { "accept": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
    }
    var f = new require('form-data')();
    f.append('metadata',`<Script xmlns="http://www.hp.com/PC/REST/API"> 
        <TestFolderPath>${folder}</TestFolderPath> 
        <Overwrite>true</Overwrite> 
        <RuntimeOnly>false</RuntimeOnly> 
        <KeepCheckedOut>false</KeepCheckedOut> 
    </Script>`);
    f.append('file', stream, { filename: `${name}.zip`, contentType: 'application/x-zip-compressed' });
    $.$2(`${n} data appended as "${name}".`);

    o.headers["Content-Type"] = `multipart/form-data; boundary="${f._boundary}"`;
    $.$2(n + ' headers set.');
    
    return $.request(o, n, f, true);
}


/**
 * Creates a timestamp string for use in naming conventions
 */
const timestamp = function() {
    var d = new Date();
    return (d.getFullYear() +
        ("00" + (d.getMonth() + 1)).slice(-2) +
        ("00" + d.getDate()).slice(-2) + "_" +
        ("00" + d.getHours()).slice(-2) +
        ("00" + d.getMinutes()).slice(-2) +
        ("00" + d.getSeconds()).slice(-2)
        + "_" + ("000" + d.getMilliseconds()).slice(-3)
    );
}



/**
 * Module for LoadRunnerEnterprise Hosts
 */
const hosts = {
    /**
     * Returns a list of hosts that are both LoadGenerators and Controllers
     * @param {Array<string>} token Token from logon
     */
    LoadGeneratorAndController: async function (token = $.token) {
        var n = "hosts";
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/hosts?query={purpose["Data Processor" and "Controller"]}`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        return $.request(o, n, null, true);
    }
}


/**
 * Module for LoadRunnerEnterprise Test Plan Folders
 */
const folders = {
    /**
     * Gets all existing test plan folders.
     * @param {Array<string>} token Token from logon
     */
    getAll: async function (token = $.token) {
        //does not appear to support ?query syntax
        var n = "testplan";
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/testplan`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        return $.request(o, n, null, true);
    },
    /**
     * Gets all existing test path folders by path.
     * @param {string} path Folder path (default=null; return all)
     * @param {Array<string>} token Token from logon
     */
    getByPath: async function (path = null, token = $.token) {
        var r = this.getAll();
        if ((path||'').trim().length > 0) { //if path provided, then resolve promise and filter
            return new Promise((resolve, reject) => {
                Promise.all([r]).then(function(value){ 
                    //apply filter on results
                    resolve(value[0].filter(v => { return ((v.FullPath||'').toLowerCase()==(path||'').toLowerCase()) }));
                }).catch((error)=>{ $.$0(error); reject(error); })
            });
        } else {
            return r;
        }
    },
    /**
     * Adds a new test plan folder
     * @param {string} path Folder path (default=null; return all)
     * @param {Array<string>} token Token from logon
     */
    create: async function (path, token = $.token) {
        var x = path.split("\\")
        var n = "testplan.create";
        $.$2(n + '.request()');
        var o = {
            method: 'POST',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/testplan`,
            headers: { "Content-Type": "application/json", "Accept": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`},
            body: JSON.stringify({"Name": x.pop(), "Path": x.join("\\")})
        }
        return $.request(o, n, null, true);
    },
    /**
     * Gets all existing test path folders by path.
     * @param {string} path Folder path (default=null; return all)
     * @param {Array<string>} token Token from logon
     */
    getOrCreateByPath: async function (path, token = $.token) {
        if ((path||'').trim().length > 0) { //if path provided, then resolve promise and filter
            var r = this
            return new Promise((resolve, reject) => {
                function $0(error) {
                    $.$0(error); 
                    reject(error);
                }
                Promise.all([r.getAll()]).then(function(all){ 
                    var x = all[0].find(v => { return ((v.FullPath||'').toLowerCase()==(path).toLowerCase()) })
                    if (x==null) {
                        Promise.all([r.create(path)]).then(function(all){ 
                            resolve(all[0]);
                        }).catch((error)=>{ 
                            if ((error!=null)&&(error.statusCode!=null)&&(error.statusCode==400)&&(error.body!=null)) {
                                var body = JSON.parse(error.body)
                                if ((body.ErrorCode!=null)&&(body.ErrorCode==3455)) {
                                    resolve({Name: path.split("\\").pop(), FullPath: path })
                                }
                            } else { $0(error); }
                        })
                    } else {
                        resolve(x);
                    }
                }).catch((error)=>{ $0(error) })
            });
        } else {
            return null;
        }
    },
}


/**
 * Module for LoadRunnerEnterprise Scripts
 */
const scripts = { 
    /**
     * Returns an array of all scripts
     * @param {*} token Token from logon
     */
    getAll: async function (token = $.token) {
        var n = "scripts.getAll";
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/scripts`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        return $.request(o, n, null, true);
    },
    /**
     * Returns a script by the specified ID
     * @param {number} id ID
     * @param {Array<string>} token Token from Logon
     */
    getById: async function (id, token = $.token) {
        var n = `scripts.getById(${id})`;
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/scripts/${id}`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        return $.request(o, n, null, true);
    },
    /**
     * Returns an array of scripts by Name
     * @param {string} name Name (default=null; do not filter by name)
     * @param {string} path Folder path (default=null; do not filter by folder)
     * @param {Array<string>} token Token from Logon
     */
    getByName: async function (name=null, path=null, token = $.token) {
        var p = [((name||'').trim().length > 0), ((path||'').trim().length > 0)]
        var r = this.getAll();
        if (p[0]||p[1]) { //if name/folder provided, then resolve promise and filter
            return new Promise((resolve, reject) => {
                //temp function for filtering -- a = whether null or empty, else compare lowercase
                function d(a, b, c) {
                    return !a || ((b||'').toLowerCase()==c.toLowerCase())
                }
                Promise.all([r]).then(function(value){ 
                    //apply filter on results
                    resolve(value[0].filter(v => { return (d(p[0], v.Name, name) && d(p[1], v.TestFolderPath, path)) }));
                }).catch((error)=>{ $.$0(error); reject(error); })
            });
        } else {
            return r;
        }
    }
}

/**
 * Module for LoadRunnerEnterprise Tests
 */
const tests = {
    /**
     * Returns a test design by the specified test ID
     * @param {number} id Test ID
     * @param {Array<string>} token Token from logon
     */
    getById: async function (id, token = $.token) {
        var n = `tests.getById(${id})`;
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/tests/${id}`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        return $.request(o, n, null, true);
    },
    /**
     * Returns an array of test designs by name
     * @param {string} name Test name
     * @param {string} path Folder path (default=null; any path)
     * @param {Array<string>} token Token from logon 
     */
    getByName: async function (name, path = null, token = $.token) {
        var n = `tests.getByName('${name}')`;
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/tests?query={Name["${name}"]}`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        $.$2(o.url)
        var r = $.request(o, n, null, true);
        if ((path||'').trim().length > 0) { //if path provided, then resolve promise and filter
            return new Promise((resolve, reject) => {
                Promise.all([r]).then(function(value){ 
                    //apply filter on results
                    resolve(value[0].filter(v => { return ((v.TestFolderPath||'').toLowerCase()==path.toLowerCase()) }));
                }).catch((error)=>{ $.$0(error); reject(error); })
            });
        } else {
            return r;
        }
    },
    /**
     * (internal) The body text for creating/updating a test
     * @param {string} name Test name (default=null; update body format)
     * @param {string} folder Folder path (default = null)
     * @param {number} scriptid Script ID to bind
     * @param {number} vusers Number of vusers for test (default=1)
     */
    _body: function(name=null, folder=null, scriptid, vusers=1) {
        var g = []
        var s = $.toArray(scriptid)
        var v = $.toArray(vusers)
        for (var i = 0; i < s.length; i++) {
            if (i < v.length) vusers = v[i];
            if (vusers>100) vusers = 100;
            g.push({
                "Name": (s.length==1)?"web":`ThreadGroup-${i.toString().padStart(2,'0')}`,
                "Vusers": vusers,
                "Script": { "ID": s[i] },
                "Hosts": [ { "Name": "LG1", "Type": "automatch" } ],
                "RTS": {
                    "Pacing": { "NumberOfIterations": 1, "StartNewIteration": { "Type": "immediately" } },
                    "ThinkTime": { "Type": "replay" },
                    "Log": { "Type": "disable" }
                }
            });
        }
        var r = {
            "Name": name,
            "TestFolderPath": folder,
            "Content": {
                "WorkloadType": {
                    "Type": "basic",
                    "SubType": "by test",
                    "VusersDistributionMode": "by number"
                },
                "LGDistribution": { "Type": "manual" },
                "Groups": g,
                "Scheduler": {
                    "Actions": [
                        { "Initialize": { "Type": "just before vuser runs"} },
                        { "StartVusers": { "Type": "simultaneously" } },
                        { "Duration": { "Type": "run for", "TimeInterval": { "Seconds": 30 } } },
                        { "StopVusers": { "Type": "simultaneously" } }
                    ]
                }
            }
        }
        $.$2(r)
        return ((name||'').trim().length>0) ? r : r.Content;
    },
    /**
     * Create test design
     * @param {string} name Test name (default=null; update body format)
     * @param {string} path Folder path
     * @param {number} scriptid Script ID to bind 
     * @param {number} vusers Number of vusers for test (default=1)
     * @param {Array<string>} token Token from logon 
     */
    create: async function (name, path, scriptid, vusers=1, token = $.token) {
        var n = "tests.create";
        $.$2(n + '.request()');
        var o = {
            method: 'POST',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/tests`,
            headers: { "Content-Type": "application/json", "Accept": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`},
            body: JSON.stringify(this._body(name, path, scriptid, vusers))
        }
        return $.request(o, n, null, true);
    },
    /**
     * Update an existing test design
     * @param {number} id Test ID
     * @param {number} scriptid Script ID to bind 
     * @param {number} vusers Number of vusers for test (default=1) 
     * @param {boolean} refresh Whether to refresh details (default=false; no additional roundtrip to fetch details - will resolve on responseCode alone)
     * @param {Array<string>} token Token from logon
     */
    update: async function (id, scriptid, vusers=1, refresh=false, token = $.token) {
        var n = "tests.update";
        $.$2(n + '.request()');
        var b = this._body(null, null, scriptid, vusers);
        var o = {
            method: 'PUT',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/tests/${id}`,
            headers: { "Content-Type": "application/json", "Accept": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`},
            body: JSON.stringify(b)
        }
        return new Promise((resolve, reject) => {
            function $0(error) {
                $.$0(error); 
                reject(error);
            }
            try {
                var r = $.request(o, n);
                Promise.all([r]).then(function(all){ 
                    if (refresh) {
                        var t = tests.getById(id);
                        Promise.all([t]).then(function(all){ 
                            resolve(all[0])
                        }).catch((error)=>{ $0(error) })
                    } else {
                        resolve({"ID": id, "Content": b})
                    }
                }).catch((error)=>{ $0(error) })
            } 
            catch (error) 
            {
                return $0(error)
            }
        });

    }
}

/**
 * Module for LoadRunnerEnterprise Test Sets
 */
const testsets = {
    /**
     * Gets all existing test sets in the project.
     * @param {Array<string>} token Token from logon
     */
    getAll: async function (token = $.token) {
        //does not appear to support ?query syntax
        var n = "testsets";
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/testsets`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        return $.request(o, n, null, true);
    },
    /**
     * Gets all existing test sets in the project by name.
     * @param {string} name Test set name (default=null; return all)
     * @param {Array<string>} token Token from logon
     */
    getByName: async function (name = null, token = $.token) {
        var r = this.getAll();
        if ((name||'').trim().length > 0) { //if name provided, then resolve promise and filter
            return new Promise((resolve, reject) => {
                Promise.all([r]).then(function(value){ 
                    //apply filter on results
                    resolve(value[0].filter(v => { return ((v.TestSetName||'').toLowerCase()==name.toLowerCase()) }));
                }).catch((error)=>{ $.$0(error); reject(error); })
            });
        } else {
            return r;
        }
    },
    /**
     * Get default test set by name
     * @param {string} name Test set name (default=null; return 'unassigned' test set or first occurrence)
     * @param {Array<string>} token Token from logon
     */
    getDefault: async function (name = null, token = $.token) {
        name = (name||'unassigned').toLowerCase().trim()
        return new Promise((resolve, reject) => {
            Promise.all([this.getAll()]).then(function(all){
                var r = null;
                if (all[0].length > 0)
                {
                    //find a matching testsetname or fallback to 'unassigned'
                    r = all[0].find(x => x.TestSetName.toLowerCase().trim()==name)
                    if (r==null) {
                        //if nothing found, sort ascending ID and take first
                        r = all[0].sort((a, b) => { return a.TestSetID-b.TestSetID})[0]
                    }
                }
                resolve(r);
            }).catch((error)=>{ $.$0(error); reject(error); })
        });
    }
}


/**
 * Module for LoadRunnerEnterprise Test Instances
 */
const testinstances = {
    /**
     * Gets all test instances in the project by the specified TestID.
     * @param {number} testid Test ID
     * @param {number} testsetid Test Set ID (default=null; do not filter by TestSetID)
     * @param {Array<string>} token Token from logon
     */
    getByTestId: async function (testid, testsetid=null, token = $.token) {
        var n = "testinstances.getByTestId";
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/testInstances?query={test-id["${testid}"]}`,
            headers: { "Accept": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        var r = $.request(o, n, null, true);
        if ((testsetid||0) > 0) { //if testsetid provided, then resolve promise and filter
            return new Promise((resolve, reject) => {
                Promise.all([r]).then(function(value){ 
                    //apply filter on results
                    resolve(value[0].filter(v => { return (v.TestSetID==testsetid) }));
                }).catch((error)=>{ $.$0(error); reject(error); })
            });
        } else {
            return r;
        }
    },
    /**
     * Adds a test instance to a test set based on the specified test.
     * @param {number} testid Test ID
     * @param {number} testsetid Test Set ID
     * @param {Array<string>} token Token from logon
     */
    create: async function (testid, testsetid, token = $.token) {
        var n = "testinstances.create";
        $.$2(n + '.request()');
        var o = {
            method: 'POST',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/testInstances`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`},
            body: JSON.stringify({ "TestID": testid, "TestSetID": testsetid })
        }
        return $.request(o, n, null, true);
    }
}


/**
 * Module for LoadRunnerEnterprise Test Runs
 */
const runs = { 
    /**
     * Returns a list of test runs by test id
     * @param {number} testid Test ID
     * @param {Array<string>} token Token from Logon
     */
    getByTestId: async function (testid, token = $.token) {
        var n = "runs.getByTestId";
        $.$2(n + '.request()');
        var o = {
            method: 'GET',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/Runs?query={test-id[${testid}]}`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`}
        }
        return $.request(o, n, null, true);
    },
    /**
     * Runs a test using a previously created timeslot
     * @param {number} testid Test ID
     * @param {number} instanceid Test Instance ID
     * @param {number} timeslotid Timeslot ID
     * @param {Array<sting>} token Token from Logon
     */
    createFromTimeslot: async function (testid, instanceid, timeslotid, token = $.token) {
        var n = "runs.create";
        $.$2(n + '.request()');
        var o = {
            method: 'POST',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/Runs`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`},
            body: JSON.stringify({
                "PostRunAction" : "Collate And Analyze",
                "TestID" : testid,
                "TestInstanceID" : instanceid,
                "TimeslotID" : timeslotid,
                "VudsMode" : false
            })
        }
        return $.request(o, n, null, true);
    },
    /**
     * Runs a test with automatic host allocations
     * @param {number} testid Test ID
     * @param {number} instanceid Test Instance ID
     * @param {number} duration Duration of the timeslot in minutes (minimum = 30)
     * @param {Array<sting>} token Token from Logon
     */
    create: async function (testid, instanceid, duration=30, token = $.token) {
        var n = "runs.create";
        $.$2(n + '.request()');
        var o = {
            method: 'POST',
            url: `https://${$.config.server}/LoadTest/rest/domains/${$.config.domain}/projects/${$.config.project}/Runs`,
            headers: { "Content-Type": "application/json", "Cookie": `LWSSO_COOKIE_KEY=${token[0]};QCSession=${token[1]};`},
            body: JSON.stringify({
                "PostRunAction" : "Collate And Analyze",
                "TestID" : testid,
                "TestInstanceID" : instanceid,
                "TimeslotDuration": {
                    "Hours" : Math.floor(duration/60),
                    "Minutes" : duration%60
                },
                "VudsMode" : false
            })
        }
        return $.request(o, n, null, true);

    }
}



/**
 * Returns an array of runs for the specified test ID
 * @param {number} testid Test ID
 * @returns {Array} Array of runs
 */
const GetRuns = async function(testid) {
    return (new Promise(async (resolve, reject) => {
        let l = await logon();
        resolve(runs.getByTestId(testid));
    })); 
}
module.exports.GetRuns = GetRuns;


/**
 * Retrieves existing or adds a new test plan folder
 * @param {string} path 
 */
const MakeFolder = async function(path) {
    return (new Promise(async (resolve, reject) => {
        let l = await logon();
        resolve(folders.getOrCreateByPath(path))
    })); 
}
module.exports.MakeFolder = MakeFolder

/**
 * Returns an array of test instances for the specified test ID
 * @param {number} testid Test ID
 * @returns {Array} Array of test instances
 */
const GetInstances = async function(testid) {
    return (new Promise(async (resolve, reject) => {
        let l = await logon();
        resolve(testinstances.getByTestId(testid));
    })); 
}
module.exports.GetInstances = GetInstances;

/**
 * Returns the last test instance for the specified test ID
 * @param {number} testid Test ID
 * @returns {any} test instance
 */
const GetLastInstance = async function(testid) {
    return (new Promise(async (resolve, reject) => {
        //handles errors
        function $0(error) {
            //$.$0(error);
            reject(error);
        }
        try 
        {
            let l = await logon();
            Promise.all([testinstances.getByTestId(testid)]).then(async function(all){
                var r = all[0];
                //check whether we found existing test instances
                if (r.length > 0) {
                    //if so, sort by largest ID and take first item
                    r = r.sort((a, b) => { return b.TestInstanceID-a.TestInstanceID})[0]
                } else {
                    r = null;
                }
                resolve(r);
            }).catch((error)=>{ $0(error) })
        }
        catch (error) 
        {
            $0(error)
        }
    })); 
}
module.exports.GetLastInstance = GetLastInstance;





/**
 * Run a test with the following options:
    1.  Automatically select existing or create new if none exists
    2.  Manual selection (same as GUI > Test Management > Performance Test Summary view > Assign To):  
 * @param {any} test The test id ({number} ID or a Promise/Object that resolves with an .ID property)
 * @param {number} duration Run duration in minutes (default/minimum=30) 
 * @param {any} instance Test Instance ID (choices: 1. null (default) = Automatically select, 2. {number} TestInstanceID, {string} TestSetName, or an object/Promise that will resolve to those values or properties)
 * @param {boolean} force Force new instance creation
 * @param {string} testset Test set name (use for "force" option or auto-select creation)
 */
const RunTest = async function(test, duration = 30, instance = null, force = false, testset = null) {
    
    return (new Promise(async (resolve, reject) => {
        //handles errors
        function $0(error) {
            //$.$0(error);
            reject(error);
        }        
        try 
        {
            var l = await logon();
            //testinstances.getByTestId()   [ { TestInstanceID: 138, TestID: 262, TestSetID: 903 } ]
            Promise.all([test, instance]).then(async function(all){  

                var t = $.cint(all[0]); //try default test variable
                if ((t[0]==null) && (all[0].test!=null)) t = $.cint(all[0].test);   //try for a property called "test" (return of PushTest method)
                if (t[0]==null) throw `Test ID not valid: ${JSON.stringify(all[0])}`

                var i = $.cint(all[1]); //try instance
                if (i[0]==null) i = $.cint(all[1], "TestInstanceID"); //try .TestInstanceID
                if (i[0]==null) //null or no matches, must create
                {
                    //if not forcing a new testinstance, get last
                    if (!force) i = $.cint(await GetLastInstance(t[0]), "TestInstanceID");
                    //if no last (forced or unforced), then get default testset and create
                    if (i[0]==null) {
                        var s = await testsets.getDefault(testset);
                        i = $.cint(await testinstances.create(t[0], s.TestSetID), "TestInstanceID");
                    }
                }
                var r = await runs.create(t[0], i[0], duration);
                resolve({test: t[1], instance: i[1], run: r})

            }).catch((error)=>{ $0(error) })
        } 
        catch (error) 
        {
            $0(error)
        }
    }));
}
module.exports.RunTest = RunTest;




/**
 * Returns a list of scripts by name
 * @param {string} name Name (default=null; do not filter by name)
 * @param {string} path Folder path (default=null; do not filter by folder)
 */
const GetScripts = async function(name = null, path = null) {
    return (new Promise(async (resolve, reject) => {
        let l = await logon();
        resolve(scripts.getByName(name, path))
    }));
}
module.exports.GetScripts = GetScripts;
/**
 * Returns a script by ID
 * @param {number} id ID
 */
const GetScript = async function(id) {
    return (new Promise(async (resolve, reject) => {
        let l = await logon();
        resolve(scripts.getById(id));
    })); 
}
module.exports.GetScript = GetScript;


/**
 * Packages a directory as a script asset and uploads to LoadRunnerEnterprise.
 * @param {string} source Source directory to package.
 * @param {string} path Folder path to upload script.
 * @param {string} name Script asset target name (default=use naming convention).
 */
const PushScript = async function(source, path, name = null) {
    return (new Promise(async (resolve, reject) => {
        //promise w/directory stats
        function lstat(source) { 
            return new Promise((resolve, reject) => {
                $.fs.lstat(source, (error, stats) => {
                    if (error) reject(error);
                    resolve(stats);
                })
            })
        }
        //handles errors
        function $0(error) {
            //$.$0(error);
            reject(error);
        }        
        try 
        {
            //check the folder paths are valid
            if ((path==null)||(path.toString().trim().length==0)) throw `"${path}" is not a valid folder.`

            //build naming conventions if names not supplied
            if ((name==null)||(name.toString().trim().length==0)) { name=`Auto-Gen-Script [${$.config.user}] ${(timestamp())}` }

            //check that source is a directory
            if ((await lstat(source)).isDirectory()==false) throw `"${source}" is not a directory.`
            
            //bundle and logon can be performed independently
            let l = logon();    
            let b = bundle(source);   //possibly call vugen method for older PC 12.63 and below:  vugen(source, name)  
            Promise.all([b, l]).then(async function(all){   //both the bundle and logon must be completed before moving on
                Promise.all([upload(name,path,all[0])]).then(async function(all){
                    resolve(all[0]);
                }).catch((error)=>{ $0(error) })
            }).catch((error)=>{ $0(error) })
        } 
        catch (error) 
        {
            $0(error)
        }
    }));
}
module.exports.PushScript = PushScript;




/**
 * Returns an array of test designs by name
 * @param {string} name Name (default=null; do not filter by name)
 * @param {string} path Folder path (default=null; do not filter by folder)
 */
const GetTests = async function(name, path = null) {
    return (new Promise(async (resolve, reject) => {
        let l = await logon();
        resolve(tests.getByName(name, path))
    }));
}
module.exports.GetTests = GetTests;
/**
 * Returns a test design by the specified test ID
 * @param {number} id ID
 */
const GetTest = async function(id) {
    return (new Promise(async (resolve, reject) => {
        let l = await logon();
        resolve(tests.getById(id));
    })); 
}
module.exports.GetTest = GetTest;

/**
 * (internal) Create/Update a test design, binding a specific script
 * @param {any} script The script reference id ({number} ID or a Promise/Object that resolves with an .ID property)
 * @param {any} test The existing test id or folder/name to create (choices: 1. {number} ID, 2. a Promise/Object that resolves with an .ID property, or 3. creatable object with properties .Name and .TestFolderPath)
 * @param {number} vusers Number of vusers (default=1)
 */
const pushtest = async function(script, test, vusers = 1) {
    return (new Promise(async (resolve, reject) => {
        //handles errors
        function $0(error) {
            //$.$0(error);
            reject(error);
        }        
        try 
        {
            var l = await logon();
            var v = [];
            var c = false;  //whether to create new test
            if ((test!=null)&&(test.TestFolderPath!=null)&&!(test instanceof Promise)) {
                c = true;   //if path/name supplied, set flag for create
                v[0] = test.Name; v[1] = test.TestFolderPath    //save into temp variables
                test = tests.getByName(v[0], v[1])
            }
            Promise.all([test, script]).then(async function(all){                
                var t = $.cint(all[0]);
                if ((t[0]==null)&&!c) throw `Test ID not valid: ${JSON.stringify(all[0])}`
                if (c) c = (t[0]==null) //only create if cint returned empty
                let r;
                if (Array.isArray(all[1])) {
                    var s = all[1];
                    for (var i=0; i<s.length; i++) {
                        var j = $.cint(s[i]);
                        if (j[0]==null) throw `Script ID not valid: ${JSON.stringify(all[1])}`
                        s[i]=j[0]
                    }
                    r = { 
                        "script": s, 
                        //create or update
                        "test": c ?
                            tests.create(v[0], v[1], s, vusers) :
                            tests.update(t[0], s, vusers, false)
                    }
                } else {
                    var s = $.cint(all[1]);
                    if (s[0]==null) throw `Script ID not valid: ${JSON.stringify(all[1])}`
                    r = { 
                        "script": s[1], 
                        //create or update
                        "test": c ?
                            tests.create(v[0], v[1], s[0], vusers) :
                            tests.update(t[0], s[0], vusers, false)
                    }
                    //unexpected cint eval = return simple object with the interpreted id
                    if ((typeof(r.script)!="object")||(Array.isArray(r.script))) r.script = {ID: s[0]}
                }
                Promise.all([r.test]).then(async function(all){
                    r.test = all[0];
                    resolve(r);
                }).catch((error)=>{ $0(error) })
            }).catch((error)=>{ $0(error) })
        } 
        catch (error) 
        {
            $0(error)
        }
    }));
}

/**
 * Creates or updates a test design in LoadRunnerEnterprise.
 * @param {number} script The script reference id ({number} ID or a Promise/Object that resolves with an .ID property)
 * @param {string} path Folder path
 * @param {string} name Test design target name (default=use naming convention)
 * @param {number} vusers Number of vusers (default=1)
 */
const PushTest = async function(script, path, name = null, vusers = 1) {
    return pushtest(script, {TestFolderPath: path, Name: name}, vusers);
}
module.exports.PushTest = PushTest;

/**
 * Updates a test design in LoadRunnerEnterprise.
 * @param {number} script The script reference id ({number} ID or a Promise/Object that resolves with an .ID property)
 * @param {number} id The Test ID ({number} ID or a Promise/Object that resolves with an .ID property)
 * @param {number} vusers Number of vusers (default=1)
 */
const PushTestById = async function(script, id, vusers = 1) {
    return pushtest(script, id, vusers);
}
module.exports.PushTestById = PushTestById;






/**
 * Module for processing swagger files
 */
module.exports.swagger = {
    /**
     * Creates a DevWeb script from a swagger definition
     * @param {string} source Swagger file in .json or .yml format
     * @param {string} destination Target folder name
     */
    toDevWeb: function (source, destination) {

        //internal function to build default values
        function defaultValue(item) {
            return  (item.default != null) ? item.default.toString() :
                    (item.example != null) ? item.example.toString() :
                    "{" + item.name.toString() + "}";
        }
        //loop through properties
        function recurseProperties(properties) {
            var r = {};
            for (var n in properties) {
                var p = properties[n];
                switch (p.type) {
                    case "object":
                        r[n] = recurseProperties(p.properties)
                        break;
                    //TODO: test array handling
                    default:
                        p.name = n;
                        r[n] = defaultValue(p);
                        break;
                }
            }
            return r;
        }

        var fs = $.fs
        var hb = $.hb
        const parser = require("swagger-parser");
        parser.validate(source, (err, api) => {
            if (err) {
                $.$0(err);
            }
            else {
                var data = [];

                //loop through schemes
                var schemes = api.schemes;
                if (schemes == null) schemes = ['https'];
                schemes = schemes.map(function (x) { return x.toString().toLowerCase() });
                var scheme = 'http' + (schemes.includes('https') ? 's' : '')
                var url = scheme + ":\/\/" + api.host + api.basePath;

                //loop through paths
                var paths = api.paths;
                for (var path in paths) {
                    for (var method in paths[path]) {

                        //each of these will get transposed into http request code
                        var operation = paths[path][method];
                        var headers = {};
                        var payload = "";
                        var params = {};
                        var query = [];
                        operation.path = path;
                        if (operation.parameters!=null) {
                            operation.parameters.forEach(function (item) {
                                switch (item.in) {
                                    case "header":
                                        headers[item.name] = (item.default == null) ? "<" + item.name.toString() + "\/>" : item.default.toString();
                                        break;
                                    case "body":
                                        switch (((item.schema.type)||(typeof item.schema)).toLowerCase()) {
                                            case "object":
                                                payload = recurseProperties(item.schema.properties);
                                                break;
                                            case "array":
                                                payload = []
                                                payload.push(defaultValue(item.items));
                                                break;
                                            default:
                                                payload = defaultValue(item);
                                                break;
                                        }
                                        break;
                                    case "path": //replace {name} with params.name
                                        params[item.name]=defaultValue(item);
                                        operation.path = operation.path.replace(new RegExp("{"+item.name+"}", "ig"), "\"+params."+item.name+"+\"");
                                        break;
                                    case "query": 
                                        params[item.name]=defaultValue(item);
                                        query.push(item.name+'="+encodeURI(params.'+item.name+')')
                                        break;
                                }
                            });
                        }
                        //format any querystring params
                        if (query.length>0) {
                            query = query.join('+"&');
                            operation.path += operation.path.includes('?') ? "&" : "?"
                            operation.path += query+'+"';
                        }
                        var item = { "method": method.toUpperCase(), "path": operation.path, "headers": JSON.stringify(headers), "payload": JSON.stringify(payload), "summary": operation.summary, "operationId": operation.operationId, "params": JSON.stringify(params) };
                        data.push(item);
                    }
                }
                
                //Handlebars templates
                var names = ['main', 'action', 'webrequest'];
                var template = {};
                for (var i = 0; i < names.length; i++) {
                    template[names[i]] = hb.compile(fs.readFileSync(`./template/${names[i]}.template`, 'utf8'));
                }
                
                //output variable to hold javascript
                var output = "";
                
                //write all the webrequests
                for (var i = 0; i < data.length; i++) {
                    data[i].id = i+1;
                    output += "\n"+template.webrequest(data[i]);
                }
                //add webrequests to action
                output = template.action({ webrequest: output })
                //add action to main
                output = template.main({ action: output })
                

                //setup the target destination folder
                var d = destination
                if (!fs.existsSync(d)) fs.mkdirSync(d);
                var path = require('path');
                d = path.resolve(d)+path.sep;

                //write output to file
                fs.writeFileSync(d+'main.js', output);
                fs.writeFileSync(d+'url.json', JSON.stringify({
                    "host":  api.host,
                    "basePath": api.basePath,
                    "scheme": scheme
                }));

                //copy other relevant files
                var names = ['rts.yml', 'scenario.yml', 'TruWebSdk.d.ts', 'parameters.yml', 'data.csv'];
                for (var i = 0; i < names.length; i++) {
                    fs.copyFileSync("./template/"+names[i],d+"/"+names[i]);
                }

                //copy the original swagger file to destination
                var yaml = parser.YAML;
                fs.writeFileSync(d+'/swagger-source.yml', yaml.stringify(api))
                
            }
        });
    }
}


