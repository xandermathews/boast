"use strict";

var fs = require('fs');
var q = require('q');

exports.access = function(path, perms) {
	if (!perms) {
		if (path.slice(-1) === '/') perms = fs.constants.X_OK;
		else perms = fs.constants.R_OK | fs.constants.W_OK;
	}
	var result = q.defer();
	fs.access(path, perms, (err,d)=> {
		if (err && err.code !== 'ENOENT') result.reject(err);
		console.log("access", {path, perms, d});
		result.resolve(!err);
	});
	return result.promise;
};

// promise is boolean: true if newly created, false if already exists.
exports.mkdir = function(path, perms) {
	if (!perms) perms = 0o777;
	var result = q.defer();
	fs.mkdir(path, perms, err=> {
		if (err && err.code !== 'EEXIST') result.reject(err);
		result.resolve(!err);
	});
	return result.promise;
};

exports.rename = q.nbind(fs.rename, fs);
