"use strict";

var q = require('q');
var u = require('./util.js');
var lo = u.lo;

var aws = require('aws-sdk');
var s3 = new aws.S3();

var promisify = function(fn, cfg) {
	var response = q.defer();
	lo("calling promisified s3."+fn, cfg);
	s3[fn](cfg, (e,d)=> {
		if (e) response.reject(e);
		else response.resolve(d);
	});
	return response.promise;
};

function wrap(fn) {
	return promisify.bind(exports, fn);
}

exports = module.exports = function(cfg) {
	var p = q.defer();
	var lib = {};
	if (!cfg.Bucket) fin.reject('aws() requires {Bucket:"foo"}');
	lib.objs = function(Prefix, visitor, MaxKeys, ContinuationToken) {
		var fin = q.defer();
		var RequestPayer = 'requester';
		s3.listObjectsV2({Bucket: cfg.Bucket, Prefix, MaxKeys, RequestPayer, ContinuationToken}, (e,d)=> {
			if (e) return fin.reject(e);
			var stop = false;
			var size = 0;
			d.Contents.forEach(row=> {
				if (stop) return;
				size += row.Size;
				var result = visitor(row);
				if (result === false) stop = true;
			});
			delete d.Contents;
			if (!stop && d.NextContinuationToken) {
				return lib.objs(Prefix, visitor, MaxKeys, d.NextContinuationToken).then(r=> {
					fin.resolve({count: d.KeyCount + r.count, size: size + r.size});
				});
			}
			fin.resolve({count: d.KeyCount, size});
		});
		return fin.promise;
	};

	var getObject = wrap('getObject');
	lib.signedUrl = function(Key, Expires) {
		var fin = q.defer();
		s3.getSignedUrl('getObject', {Key, Bucket: cfg.Bucket, Expires, ResponseContentDisposition: 'inline', ResponseContentType: 'application/json'}, (e,d)=> {
			if (e) return fin.reject(e);
			fin.resolve(d);
		});
		return fin.promise;
	};
	lib.obj = function(Key) {
		return getObject({Key, Bucket: cfg.Bucket, ResponseContentType: 'application/json'}).then(record=> {
			lo(record);
			return record;
		});
	};
	p.resolve(lib);
	return p.promise;
};
