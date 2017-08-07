"use strict";

var bcrypt = require('bcrypt');
var crypto = require('crypto');
var q = require('q');
var mysql = require('./mysql.js');

module.exports = function(cfg) {
	return mysql(cfg).then(con => {
		con.setPass = function(email_or_id, pass) {
			var f = {};
			switch (typeof email_or_id) {
				case 'string': f.email = email_or_id; break;
				case 'number': f.id    = email_or_id; break;
				default:
					throw "con.setPass: param 1 must be a string or number";
			}
			return q(bcrypt.hash(pass, 10)).then(function(pass) {
				return con.update('user', f, {pass});
			});
		};

		con.checkPass = function(email, guess) {
			return con.query1('select * from user where deleted is null and email = ?', [email]).then(function(row) {
				return q(bcrypt.compare(guess, row.user.pass)).then(function(valid) {
					if (!valid) throw 'bcrypt rejected password';
					return row.user;
				});
			});
		};

		con.login = function(email, guess) {
			return con.checkPass(email, guess).then(user => {
				var response = {};
				response.user = {
					id: user.id,
					name: user.name,
					pref: user.pref
				};
				response.auth = crypto.randomBytes(16).toString('hex');

				var cookie = crypto.randomBytes(16).toString('hex');

				return con.insert('session', {
					iduser: user.id,
					cookie,
					csrf: response.auth,
					flags: user.flags
				}).then(sid => {
					cookie += 's'+ sid;
					return {cookie, response};
				});
			});
		};
		con.logout = function(id) {
			return con.delete('session', id);
		};
		function fail(msg) {
			console.log("failing auth check based on", msg);
			throw {code: 401, msg: msg};
		}
		con.checkSession = function(cookie, req) {
			var auth = req.headers['x-token'];
			if (!auth) fail("no request.auth");
			if (auth.length !== 32) fail("bad request.auth");

			cookie = cookie.split('s');
			if (cookie.length !== 2) fail("bad cookie: wrong cParts");
			var session_id = +cookie[1];
			cookie = cookie[0];
			if (cookie.length !== 32) fail("bad cookie length");

			return con.query1('select * from session where id = ?', [session_id]).then(row => {
				var s = row.session;
				if (s.cookie !== cookie) fail("cookie mismatch");
				if (s.csrf !== auth) fail("request.auth mismatch");
				return s;
			});
		};
		return con;
	});
}

