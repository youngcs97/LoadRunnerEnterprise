'use strict';

/**
 * $ variable to wrap functional programming methods
 */
var $ = {
    /**
     * Stringify object, preserving template literals
     * @param {object} source Source object
     * @returns {string} String representation of the object
     */
    Stringify: function (source) {
        return JSON.stringify(source).replace(/\":\"/g,"\":`").replace(/\",\"/g,"`, \"").replace(/\"}/g,"`}")
    },
    /**
     * Coerces an object to an array
     * @param {object} source Source object
     * @returns {Array<object>} Object converted to an Array
     */
    toArray: function (source) {
        return Array.isArray(source) ? source : [source];
    },

    /**
     * Returns the _text property or null
     * @param {object} source Source object
     * @param {string} property 
     * @returns {string} _text value
     */
    toText: function (source, property) {
        var x = source[property];
        return ((x!=null)&&(x._text!=null)) ? x._text : null
    },
    
    /**
     * Formats a URL path, substituting an origin index and preserving path variables as string literals.
     * @param {string} path Path portion of URL
     * @param {number} index Zero-based index of the origin array
     * @returns {string} URL with string literals
     */
    toPath: function (path, index) {
        return `\${url.origin[${index}]}` + decodeURI(path).replace(/{(\w+)}/, "\${$1}");
    },

    /**
     * Append keypair values to a target by property names
     * @param {object} target Target object
     * @param {object} source Source object
     * @param {string} key Key property name
     * @param {string} value Value property name 
     */
    appendKeyPair: function (target, source, key, value) {
        var x = $.toText(source, key);
        var y = $.toText(source, value);
        if (x!=null) {
            if (y!=null) target[x]=y;
        }
    },

    /**
     * Default origin
     */
    origin: "http://localhost",
    /**
     * Builds a URL, testing to see if it needs a default origin appended.
     * @param {string} path 
     * @returns {URL} URL object
     */
    toUrl: function (path) {
        try { return new URL(path); } catch {
            try { return new URL($.origin+path); } catch {
                try { return new URL($.origin+"/"+path); } catch {
                    return null;
                }
            }
        }
    },
    
    /**
     * Loop through endpoints, appending each
     * @param {object} target Target object
     * @param {object} source Source object
     * @param {Array<string>} origin 
     */
    appendEps: function (target, source, origin) {
        var ep = $.toArray(source);
        var j = "";
        for (var i=0; i<ep.length; i++) {
            process.stdout.write(`${j}${i}`)
            $.appendEp(target, ep[i], origin);
            j = ", ";
        }
    },
    /**
     * Process an endpoint node, adding it to the target variable
     * @param {object} target Target object
     * @param {object} source Source object
     * @param {Array<string>} origin 
     */
    appendEp: function (target, source, origin) {
        if (source==null) return;

        var p = {}; //parameter container
        
        var b = "{}"; //body container
        if (source.bodyjsons!=null) {
            var x = $.toArray(source.bodyjsons.bodyjson);
            for (var i=0; i<x.length; i++) {
                var value = $.toText(x[i], "value")
                if (value!=null) { 
                    var dv = directory+value;
                    if (fs.existsSync(dv)) {    //read file indicated by bodyjson value
                        b = fs.readFileSync(dv, 'utf8')
                        try { 
                            b = $.Stringify(JSON.parse(b))
                        } catch(e) { 
                            console.log(dv)
                            b += "\t\t//Did not parse correctly -- check manually"
                        }
                    } else {
                        //value was not a file pointer, append to params
                        $.appendKeyPair(p, x[i], "name", "value");
                    }
                }
            }
        }
        var h = {}; //header container
        if (source.headers!=null) {
            x = $.toArray(source.headers.header);
            for (var i=0; i<x.length; i++) {
                $.appendKeyPair(h, x[i], "name", "value");
            }
        }
        
        var e = {}; //extractor container
        if (source.extracter!=null) {
            x = $.toArray(source.extracter.regexextract);
            for (var i=0; i<x.length; i++) {
                $.appendKeyPair(e, x[i], "name", "value");
            }
        }

        var m = ($.toText(source, "method")||'get').toUpperCase()
        var t = $.toText(source, "title")||''
        var l = $.toText(source, "loopcount")||'1'
        var s = ($.toText(source, "responseassert")||'').trim()
        var f = $.toText(source, "responseString")||''
        var n = $.toText(source, "name")||''
        var u = $.toUrl(n)
        var d = decodeURI(u.origin);
        var o = origin.indexOf(d)   //build and maintain list of origins by ordinal reference (index)
        if (o==-1) { 
            origin.push(d); 
            o=origin.length-1 
        }
        if ((t.length > 0)||(n.length > 0)) {
            target.push({loopcount: l, validate: $.Stringify({"status": s, "find": f}), body: b, headers: $.Stringify(h), method: m, origin: decodeURI(u.origin), url: $.toPath(u.pathname, o), title: t, extractor: e, parameter: p})
        }
    }
}


//requires
const path = require("path");
const url = require('url');
const fs = require("fs");

//init Handlebars templates
var hb = require("handlebars");
//const { config } = require("process");
var names = ['main', 'action', 'webrequest','scenario','rts'];
var template = {};
for (var i = 0; i < names.length; i++) {
    template[names[i]] = hb.compile(fs.readFileSync(`./template/portal/${names[i]}.template`, 'utf8'));
}

//Get Arguments array
var args = process.argv.slice(2);
console.log('args: ', args);

//deduces the relative path to argument 0 (filepath) and its relative directory
const file = path.relative(".", path.resolve(args[0]));   
const directory = path.relative(".", path.dirname(path.resolve(args[0])))+path.sep;

//parses xml to json
const xml = JSON.parse(require('xml-js').xml2json(fs.readFileSync(file, 'utf8'), {compact: true, spaces: 4 }));
var app = $.toText(xml.RequestInputXML, "pcfappname");
var base = `test/${app}`

//default origin
$.origin = $.toText(xml.RequestInputXML, "pcfurl")
var tgx = $.toArray(xml.RequestInputXML.threadgroup)

//build threadgroups
var tgs = [];
var table = [];
for (var j=0; j<tgx.length; j++) {
    
    //loop through all endpoints
    var tg = { origin: [], eps: [] }
    process.stdout.write(`\rThreadgroup ${j} / sessionendpoint: `)
    $.appendEps(tg.eps, tgx[j].sessionendpoint, tg.origin);
    process.stdout.write(`\rThreadgroup ${j} / endpoint: `)
    $.appendEps(tg.eps, tgx[j].endpoint, tg.origin);
    

    //get the scenario details
    var scenario = {
        vusers: $.toText(tgx[j], "numthreads"),
        rampup: $.toText(tgx[j], "ramptime"),
        duration: $.toText(xml.RequestInputXML, "duration")
    };
    tg.scenario = scenario;
    tgs.push(tg);

    //output variable to hold javascript
    var stats = [0,0];
    var output = "";
    var eps = tg.eps;
    for (var i = 0; i < eps.length; i++) {
        var x = eps[i];
        x.id = i+1;    //set ID for number iteration
        x.extractors = []
        for (var p in x.extractor) {
            x.extractors.push({name: JSON.stringify(p), value: JSON.stringify(x.extractor[p])})
        }
        output += "\r\n"+template.webrequest(x); //for each eps, build javascript from template
        stats[0]+=Object.keys(x.extractor).length
        stats[1]+=Object.keys(x.parameter).length
    }
    output = template.action({ webrequest: output })
    output = template.main({ action: output })


    //setup the target destination folder
    var d = base;
    if (!fs.existsSync(d)) fs.mkdirSync(d);
    if (tgx.length > 1) {
        d += `/ThreadGroup-${j.toString().padStart(2,'0')}`
        if (!fs.existsSync(d)) fs.mkdirSync(d);
    }
    d = path.resolve(d)+path.sep;
    fs.writeFileSync(d+'main.js', output);
    fs.writeFileSync(d+'url.json', JSON.stringify({"origin": tg.origin}));
    fs.writeFileSync(d+'scenario.yml', template.scenario(scenario));
    fs.writeFileSync(d+'rts.yml', template.rts({}));

    table.push({Origins: tg.origin.length, Endpoints: tg.eps.length, Extractors: stats[0], Parameters: stats[1] })

}
process.stdout.write(`\r${' '.repeat(100)}`)
process.stdout.write(`\r${tgs.length} script${(tgs.length==1)?'':'s'} created in '${base}'.\r\n`)
console.table(table);
console.log();

//LRE setup for pushing scripts to PC
const lr = require("./load-runner-enterprise.js");
lr.config = require("./config.json")
lr.config.debug = true;

var questions = [{ type: 'password', name: 'pwd', message: "Please enter your LRE password" }];
var inquirer = require('inquirer');
const { title } = require("process");
inquirer.prompt(questions).then(answers => { lr.config.password = answers['pwd'].toString(); runAfterAnswer(); }); //*/
async function runAfterAnswer() {
    var folder = `Subject\\CY\\${app}`
    await lr.MakeFolder(folder);

    let script;
    let vusers = null;
    if (tgs.length > 1) {
        script = [];
        vusers = [];
        for (var j=0; j<tgs.length; j++) {
            var d = `${base}/ThreadGroup-${j.toString().padStart(2,'0')}`
            var s = await lr.PushScript(d, folder, `script_${j.toString().padStart(2,'0')}_${app}`);
            script.push(s.ID);
            vusers.push(tgs[j].scenario.vusers);
            console.log({script: script, vusers: vusers})
        }
    } else {
        script = await lr.PushScript(base, folder, `script_${app}`);
        vusers = Number(scenario.vusers);
        console.log(script);
    }
    
    let test = await lr.PushTest(script, folder, `test_${app}`, vusers);
    console.log(test);
}