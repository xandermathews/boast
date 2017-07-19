"use strict";
//var q = require('q');
//import q from 'q';
import $ from 'jquery';
//console.log("q.d?", typeof q.defer);
//console.log("j?", typeof $);

let zonk = "frob";
const constanly = "evolving";
require("./style.css");
//console.error("bp");
console.log(zonk, constanly);

//document.write(require('./text.js').default);
$(document.body).append(require('./text.js').default());
