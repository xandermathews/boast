"use strict";

// routes can have auto-params with regex validation: 'path/:userid([0-9]+)/foo'

// ?queries go into req.query
// two level example: // GET /shoes?order=desc&shoe[color]=blue&shoe[type]=converse
// req.query.shoe.color => "blue"

// json post bodies are parsed and stored at req.body
// curl http://localhost:3000/path?query=value  -vd '{"username":"bob", "password":"foo", "twitter":"sucks"}' -H "Content-Type: application/json"

var q = require('q');
var u = require('./util.js');
var cookie = require('cookie');
var lo = u.lo;

// https://www.thepolyglotdeveloper.com/2015/10/create-a-simple-restful-api-with-node-js/
var express = require("express");
var bodyParser = require("body-parser");
var crypto = require('crypto');

var trace; /*
1: errors
2: warnings
3: connection status changes
4: errors sent to client
5: stack of those errors
6: routing diags
7: connection counts
*/

function enc64(str) {
	return Buffer.from(str).toString('base64');
}

function dec64(b64) {
	if (!b64.match(/^[0-9a-zA-Z+\/]*=*$/)) throw {code: 500, msg: "string was not base64 data", input: b64};
	try {
		return Buffer.from(b64, 'base64').toString('utf8');
	} catch (e) {
		throw {code: 500, msg: 'Buffer.from error', input: b64};
	}
}

exports = module.exports = function(opts) {
	if (typeof opts === 'number') opts = {port: opts};
	else opts = opts || {};
	opts.port = opts.port || 8080;
	opts.rootstem = opts.rootstem || 'api';
	var init = q.defer();

	var app = express();
	app.set('etag', false);
	app.set('x-powered-by', false);
	app.use(bodyParser.json(opts.parser));
	var result = {app};

	var server = app.listen(opts.port, opts.ip, function() {
		trace(3, "Listening on port "+server.address().port+"...");
		init.resolve(result);
	});
	result.server = server;

	function prodFilter(k, v) {
		if (k === 'pass') return '[redacted]';
		if (k === 'contents') return '['+v.length+' bytes]';
		return v;
	}

	result.prodLog = function(code, req, output) {
		var params = [1, code, req.method, req.url];
		var txt;
		if (req.body) {
			txt = JSON.stringify(req.body, prodFilter);
			if (txt.length < 1000) params.push(txt);
			else params.push("body.length="+txt.length);
		}
		var uid;
		if (!req.res.locals.session && result.optionalAuthRead) result.optionalAuthRead(req);
		try {
			uid = req.res.locals.session.public.id;
		} catch (e) {
		}
		if (uid) params.push('user'+uid);
		if (req.headers['x-from']) params.push(req.headers['x-from']);
		if (output) {
			txt = JSON.stringify(output, prodFilter);
			if (txt.length < 1000) params.push(txt);
			else params.push("output.length="+txt.length);
		}
		trace.apply(null, params);
	};

	function handleErrors(req, res, promish) {
		var verb = req.method;
		var path = req.originalUrl;

		return q(promish).catch(function(e) {
			if (typeof e === 'number') e = {code: e};
			if (typeof e === 'string') e = {msg: e};
			if (e.stack) trace(5, 'STACK:\n', e.stack, '\n');
			if (!e.code) e.code = 400;
			e.msg = e.msg || e.message || ''+e; // in node, you can't override Error.message and get it to json, so let's just standardize on a shorter name.
			if (e.msg === '[object Object]') e.msg = verb +' /'+opts.rootstem+'/'+path+' had a '+e.code+' error';
			// TODO: add support for type=tcp to u.lo
			// trace(4, {errs: [e], req});
			// then, just add req.path to the following:
			//trace(1, e.code || 'no code', req.method, req.url);
			var output = {errs: [e]};
			result.prodLog(e.code || 'no code', req, output);
			if (Number.isFinite(e.code) && e.code >= 200) res.status(e.code);
			return res.send(output);

		}).catch(function(e) {
			trace(1, "ERROR IN ERROR HANDLING: ", e.stack || e.message || e); // to test this, have route-def throw 42 -- express will reject that as a valid status code
			if (!res.statusCode) res.status(500);
			res.send({errs: [{code: 500, msg: e.message || 'SERVER ERROR IN ERROR HANDLING'}]});
		}).done();
	}
	// this nees to be after "bodyParser" but can be above all other hooks
	app.use((err, req, res, next)=> {
		//u.lo("err", err, "msg", err.message);
		//u.lo(Object.keys(err));
		handleErrors(req,res, q.reject(err.message || err));
		//res.send({no:"way"});
	});

	if (opts.cors) {
		app.use(function(req, res, next) {
			var acao;
			switch (opts.cors) {
				case 'wide': acao = '*'; break;
				case 'dynamic':
					acao = req.headers['x-from'] || '*';
				 break;
			}
			if (!acao) return next();

			res.header("Access-Control-Allow-Origin", acao);
			res.header("Access-Control-Allow-Credentials", true);
			res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE");
			res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
			if (req.method === 'OPTIONS') res.send(200);
			else next();
		});
	}

	function api(verb, path, func) {
		if (arguments.length === 2) return api('get', verb, path);
		return app[verb]("/"+opts.rootstem+"/"+path, function(req, res) {
			if (trace(7)) { // this is a cheap way to canary test for long-open cons
				server.getConnections((e,c)=> {
					trace(6, 'on open, con count='+c);
				});
				res.on('close', (req, res)=> {
					server.getConnections((e,c)=> {
						trace(6, 'on close, con count='+c);
					});
				});
				res.on('finish', (req, res)=> {
					server.getConnections((e,c)=> {
						trace(6, 'on finish, con count='+c);
					});
				});
			}
			trace(6, req.method, req.url, {body: req.body, query: req.query, params: req.params, headers: req.headers});
			/* jshint -W064 */
			var p = q(true);
			p = p.then(() => func(req, res)); // call the provided hook inside a promise context for error control.
			p = p.then((resp) => {
				result.prodLog(res.statusCode, req, resp);
				return resp;
			});
			p = p.then((resp) => resp? res.send(resp) : null); // hook can either use the res API, or just return a json.
			handleErrors(req, res, p);
		});
	}
	result.api = api;

	result.requireAuthBy = function(checker, secret, days, cookie_name) {
		cookie_name = cookie_name || 'auth';
		if (!secret) {
			secret = crypto.randomBytes(16).toString('hex'); // cache me if more than one app server needs to coordinate
		}
		days = days || 30;
		var maxAge = Math.floor(days*24*60*60000);

		if (typeof checker !== 'function') {
			if (typeof checker.checkPass === 'function') checker = checker.checkPass;
			else throw "api was handed a checker that was not a function, but a " + typeof checker;
		}

		function hmacify(msg) {
			var h = crypto.createHmac('sha256', secret);
			h.update(msg);
			return msg +'.'+ h.digest('base64');
		}
		function testHmac(msg, sig) {
			var h = crypto.createHmac('sha256', secret);
			h.update(msg);
			var expected = h.digest('base64');
			return expected === sig;
		}

		api('post', 'login', function(req, res) {
			if (!req.body.user || !req.body.pass) throw {code: 401, msg: "user/pass json required with correct Content-Type header."};
			return q(checker(req.body.user, req.body.pass)).then(function(resp) {
				if (!resp) throw "checker returned a "+ u.type(resp);
				resp.expiration = Date.now() + maxAge;
				var c = hmacify(enc64(JSON.stringify(resp)));
				res.cookie(cookie_name, c, {
					maxAge: maxAge,
					//secure: true, // HTTPS
					httpOnly: true, // no JS
					encode: function(inp) { return inp; } // I want exactly what I sent; I don't want an escaper touching my base64
				});
				if (resp.public) return resp.public;
				return {session: true};

			}, function(e) {
				res.cookie(cookie_name, 'invalid', { maxAge: -1000 });
				throw {code: 401, msg:"invalid credentials"};
			});
		});

		function authCheck(req, res) {
			function fail(msg) {
				lo("failing auth check based on", msg);
				res.cookie(cookie_name, 'invalid', { maxAge: -1000 });
				throw {code: 401, msg: msg};
			}
			var c = req.headers.cookie;
			// TODO: improve robustness by commenting out the next line, making api calls without a cookie, and tracing this "Error: Can't set headers after they are sent." error.
			if (!c) fail('no cookie');
			var cookies = cookie.parse(req.headers.cookie);
			c = cookies[cookie_name];
			if (!c) fail('no cookie');
			var parts = c.split('.');
			if (!c.match(/^[.0-9a-zA-Z+\/=]*$/) || parts.length !== 2) fail('cookie byte');
			var cookie_val = parts[0];
			if (!testHmac(cookie_val, parts[1])) fail('bad sig');
			var raw = dec64(cookie_val);
			var j = JSON.parse(raw);
			if (Number(j.expiration) < Date.now()) fail('login token expired');
			res.locals.session = j;
			return j;
		}
		result.manualAuthCheck = authCheck;

		result.optionalAuthRead = function(req) {
			var c = req.headers.cookie;
			if (!c) return {};
			var cookies = cookie.parse(req.headers.cookie);
			c = cookies[cookie_name];
			if (!c) return {};
			var parts = c.split('.');
			if (!c.match(/^[.0-9a-zA-Z+\/=]*$/) || parts.length !== 2) return {};
			var cookie_val = parts[0];
			if (!testHmac(cookie_val, parts[1])) return {};
			var raw = dec64(cookie_val);
			var j = JSON.parse(raw);
			if (Number(j.expiration) < Date.now()) return {};
			req.res.locals.session = j;
			return j;
		};

		app.use(function(req, res, next) {
			try {
				authCheck(req, res);
				next();
			} catch (e) {
				handleErrors(req, res, q.reject(e));
				if (!e.msg) throw e; // it wasn't one of mine...
			}
		});
		api('logged_in', function(req, res) {
			if (res.locals.session.public) return res.locals.session.public;
			return {session: true};
		});
		api('logout', function(req, res) {
			res.cookie(cookie_name, 'invalid', { maxAge: -1000 });
			return {session: false};
		});
	};

	/*
	result.static = function(local_path, public_path) {
		public_path = public_path || '';
		lo("static", local_path, public_path);
		app.use((req, res, next)=> {
			lo("static load?", req.url);
			if (req.url.match(/^\/[a-z/A-Z-]*(.[a-zA-Z])?$/)) {
				lo("static load", req.url);
				next();
			} else next();
		});
	};
	*/

	result.endApi = function() {
		app.use((req, res, next)=> {
			res.status(404);
			var output = {errs:[{code:404, msg:"that path/method combination is not valid"}]};
			result.prodLog(404, req, output);
			res.send(output);
		});
	};

	result.close = function() {
		server.close();
	};
	return init.promise;
};
exports.ensure = function(body, prefix, type) {
	for (var i = 3; i < arguments.length; ++i) {
		var field = arguments[i];
		try {
			switch (u.type(type)) {
				case 'string': // if the descriptor of json type is string ("number", "string", "object"...)
					var user_provided_type = u.type(body[field]);
					if (user_provided_type !== type) {
						throw '';
					}
					break;
				case 'array': // value must be in the enum []
					if (type.indexOf(body[field]) === -1) {
						type = 'one of ['+ type.join(',')+']';
						throw '';
					}
					break;
			}
		} catch (e) {
			if (e === '') {
				if (prefix) prefix += '.';
				else prefix = '';
				prefix += field;
				lo("rejected on input field", prefix);
				throw prefix + " must be "+type;
			} else throw e;
		}
	}
};

trace = u.createTrace(module.exports, 'api');
