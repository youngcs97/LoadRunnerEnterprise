'use strict';

var args = process.argv.slice(2);
console.log('args: ', args);

const lr = require("./load-runner-enterprise.js");
const path = require("path");

var f = path.relative(".", path.resolve(args[0]))
var d = f.substring(0,f.length-path.extname(f).length)

console.log(`lr.swagger.toDevWeb('${f}', '${d}');`)

lr.swagger.toDevWeb(f, d);