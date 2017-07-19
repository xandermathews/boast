"use strict";
// if (0) {
// // import q from 'q';
// // import $ from 'jquery';
// // export default "foo";
// } else {
//var q = require('q');
var $ = require('jquery');

module.exports = {
	default: ()=> {
		var d = $("<div>", {style: 'border: 1px dotted black'});
		console.warn("warn");
		d.html("this stack is crap");
		return d;
	}
};
// }
