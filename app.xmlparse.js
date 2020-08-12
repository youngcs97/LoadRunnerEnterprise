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
     * Process an endpoint node, adding it to the target variable
     * @param {object} target Target object
     * @param {object} source Source object
     * @param {Array<string>} origin 
     */
    appendEp: function (target, source, origin) {
        
        var b = {}; //body container
        var x = $.toArray(source.bodyjsons.bodyjson);
        for (var i=0; i<x.length; i++) {
            var value = $.toText(x[i], "value")
            if (value!=null) { //read file indicated by bodyjson value
                b = JSON.parse(fs.readFileSync(directory+value, 'utf8')) 
            }
        }
        var h = {}; //header container
        if (source.extracter!=null) {
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
        
        var p = {}; //params container
        if (source.params!=null) {
            x = $.toArray(source.params.param);
            for (var i=0; i<x.length; i++) {
                $.appendKeyPair(p, x[i], "name", "value");
            }
        }

        var m = ($.toText(source, "method")||'get').toUpperCase()
        var t = $.toText(source, "title")||''
        var l = $.toText(source, "loopcount")||'1'
        var u = $.toUrl($.toText(source, "name"))
        
        var d = decodeURI(u.origin);
        var o = origin.indexOf(d)   //build and maintain list of origins by ordinal reference (index)
        if (o==-1) { 
            origin.push(d); 
            o=origin.length-1 
        }
        target.push({loopcount: l, body: $.Stringify(b), headers: $.Stringify(h), params: $.Stringify(p), method: m, origin: decodeURI(u.origin), url: $.toPath(u.pathname, o), title: t, extractor: e})
    }
}


//requires
const path = require("path");
const url = require('url');
const fs = require("fs");

//Get Arguments array
var args = process.argv.slice(2);
console.log('args: ', args);

//deduces the relative path to argument 0 (filepath) and its relative directory
const file = path.relative(".", path.resolve(args[0]));   
const directory = path.relative(".", path.dirname(path.resolve(args[0])))+path.sep;

//parses xml to json
const xml = JSON.parse(require('xml-js').xml2json(fs.readFileSync(file, 'utf8'), {compact: true, spaces: 4 }));

//default origin
$.origin = $.toText(xml.RequestInputXML, "pcfurl")
var tg = xml.RequestInputXML.threadgroup


//loop through all endpoints
var origin = [];
var eps = [];
$.appendEp(eps, tg.sessionendpoint, origin);
var ep = $.toArray(tg.endpoint);
for (var i=0; i<ep.length; i++) {
    $.appendEp(eps, ep[i], origin);
}

//get the scenario details
var scenario = {
    vusers: $.toText(tg, "numthreads"),
    rampup: $.toText(tg, "ramptime"),
    duration: $.toText(xml.RequestInputXML, "duration")
};

//init Handlebars templates
var hb = require("handlebars");
const { config } = require("process");
var names = ['main', 'action', 'webrequest','extractors','extractions','scenario','rts'];
var template = {};
for (var i = 0; i < names.length; i++) {
    template[names[i]] = hb.compile(fs.readFileSync(`./template/portal/${names[i]}.template`, 'utf8'));
}

//output variable to hold javascript
var output = "";
for (var i = 0; i < eps.length; i++) {
    eps[i].id = i+1;    //set ID for number iteration
    var e = ["", ""];   //e[0] = extractors, e[1]=javascript variables to recieve extractor output
    var s = ["", ""];
    for (var p in eps[i].extractor) {
        e[0] += template.extractors({name: JSON.stringify(p), value: JSON.stringify(eps[i].extractor[p]), separator: s[0]})
        e[1] += template.extractions({name: p, id: eps[i].id, separator: s[1]})
        s = [", ","\n"];
    }
    eps[i].extractors = e[0];
    eps[i].extractions = e[1];
    output += "\n"+template.webrequest(eps[i]); //for each eps, build javascript from template
}
output = template.action({ webrequest: output })
output = template.main({ action: output })


//setup the target destination folder
var app = $.toText(xml.RequestInputXML, "pcfappname");
var d = `test/${app}`
if (!fs.existsSync(d)) fs.mkdirSync(d);
d = path.resolve(d)+path.sep;
fs.writeFileSync(d+'main.js', output);
fs.writeFileSync(d+'url.json', JSON.stringify({"origin": origin}));
fs.writeFileSync(d+'scenario.yml', template.scenario(scenario));
fs.writeFileSync(d+'rts.yml', template.rts({}));


//console.log(output);
//console.log(JSON.stringify(eps));


//LRE setup for pushing scripts to PC
const lr = require("./load-runner-enterprise.js");
lr.config = require("./config.json")
lr.config.debug = true;

var questions = [{ type: 'password', name: 'pwd', message: "Please enter your LRE password" }];
var inquirer = require('inquirer');
inquirer.prompt(questions).then(answers => { lr.config.password = answers['pwd'].toString(); runAfterAnswer(); }); //*/
async function runAfterAnswer() {
    var folder = `Subject\\CY\\${app}`
    await lr.MakeFolder(folder);
    let script = lr.PushScript(d, folder, `script_${app}`);
    let test = await lr.PushTest(script, folder, `test_${app}`, Number(scenario.vusers));
    console.log(test);
}
