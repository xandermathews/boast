"use strict";
/* jshint -W040 */

var q = require('q');
var mysql = require('mysql');
var moment = require('moment');
var bcrypt = require('bcrypt');
var u = require('./util.js');
var ji = u.ji;

function makeFlat(obj) {
	if (typeof obj === 'object' && ! obj.forEach) {
		var out = {};
		Object.keys(obj).map(function(k) {
			var v = obj[k];
			if (typeof v === 'object') v = ji(v);
			out[k] = v;
		});
		return out;
	}
	return obj;
}

function queryFormat(query, values) {
	if (!values) return query;
	var i = 0;

	return query.replace(/[?]+/g, function(t, k) {
		var v = values[i++];
		v = makeFlat(v);
		if (t === '??') return mysql.escapeId(v);
		return mysql.escape(v);
	}).replace(/{(\w+)}/g, function(txt, key) {
		if (values.hasOwnProperty(key)) {
			return this.escape(makeFlat(values[key]));
		}
		return txt;
	}.bind(this));
}

/* violating a uniqueness constraint: {
    "code": "ER_DUP_ENTRY",
    "errno": 1062,
    "sqlState": "23000",
    "index": 0
	message: ER_DUP_ENTRY: Duplicate entry 'xander@ashnazg.com' for key 'email'
} */
function sql(sql, params) {
	/* jshint -W040 */
	var res = q.defer();
	var raw = this.format(sql, params);
	var args = {sql:raw, nestTables: true};
	var trace = this.trace;

	if (this.keepalive) clearTimeout(this.keepalive);
	this.keepalive = setTimeout(a=> {
		this.keepalive = null;
		this.sql('select 1').done();
	}, 30000);

	if (raw !== 'select 1') trace(3, "SEND", raw);
	function handler(err, rows, meta) {
		if (raw !== 'select 1' && !err) trace(1, "SENT", raw);
		if (err) {
			trace(1, err.message);
			res.reject(err);
			return;
		} else {
			if (rows && meta) {
				// scan for json and datetime
				meta.forEach(function(def, i) {
					if (!def) {
						// must be a call to a stored procedure
					} else if (def.type === 12) {
						// flags 129?
						//lo("column", def.table+'.'+def.name, "is datetime");
						rows.forEach(function(row) {
							try {
								var m = moment(row[def.table][def.name]);
								if (m.isValid()) row[def.table][def.name] = m.utc();
							} catch (e) {
								trace(1, 'NOT-DATETIME', def.table+'.'+def.name, row);
							}
						});
					} else if (def.type === 245) {
						// flags 4241?
						//lo("column", def.table+'.'+def.name, "is json");
						rows.forEach(function(row) {
							try {
								var j = JSON.parse(row[def.table][def.name]);
								row[def.table][def.name] = j;
							} catch (e) {
								trace(1, 'NOT-JSON', def.table+'.'+def.name, row);
							}
						});
					}
				});
			}
			res.resolve(rows || meta);
		}

		if (trace(1)) {
			if (!rows) {
				trace(1, "unexpected: rows is null");
			} else if (rows.forEach) {
				if (rows.length === 1 || trace(2)) {
					rows.forEach(function(r, i) {
						trace(2, "ROW"+i, ji(r));
					});
				} else {
					trace(1, "ROWc", rows? rows.length: 'null');
				}
				trace(4, "META", meta);
			} else if (!trace(4, "STAT", meta)) {
				trace(1, "STAT", ji({changedRows: rows.changedRows, affectedRows: rows.affectedRows, insertId:rows.insertId}));
			}
		}
	}
	this.query(args, handler);
	return res.promise.catch(function(err) {
		process.exitCode = 1;
		// todo: display errors that aren't well known
		throw err;
	});
}

function proc(procname, varargs) {
	varargs = u.toArray(arguments, 1);
	procname += '('+ varargs.map((v,i)=> {
		if (typeof v === 'object') varargs[i] = u.j(v);
		return '?';
	}).join(',')+')';
	return this.sql('CALL '+procname, varargs).then(rows=> {
		//console.log("proc results:", JSON.stringify(rows, null, 4));
		if (rows.length > 1) {
			rows.pop();
			rows = rows.map(row=> {
				return row[0][''];
			});
			if (rows.length === 1) return rows[0];
		}
		return rows;
	});
}

function query1(sql, params) {
	return this.sql(sql, params).then(function(rows) {
		if (rows.length === 1) return rows[0];
		throw {msg: 'wrong row count: 1 != '+ rows.length, sql, params, rows};
	});
}

function insert(table, p) {
	return this.sql('insert into ?? set ?', [table, p]).get('insertId');
}

// relevant result fields:
// affectedRows counts how many the where hits, but
// changedRows counts only those who actually changed.
function update(table, where, obj) {
	if (typeof where === 'number') where = 'id='+where;
	if (!where) throw "sql.update needs a where clause";
	return this.sql('update ?? set ? where '+where, [table, obj]);
}

module.exports = function(cfg) {
	var db_init = q.defer();
	cfg = u.merge({
		host: process.env.MYSQL_HOST || 'localhost',
		user: process.env.MYSQL_USER || process.env.USER || 'root',
		password: process.env.MYSQL_PWD || 'a',
		database: process.env.MYSQL_DATABASE || 'mysql',
		multipleStatements: true,
		verbosity: 0
	}, cfg);
	var con = mysql.createConnection(cfg);
	var trace;
	con.config.queryFormat = queryFormat;
	u.seal(con, {sql, query1, insert, update, proc});
	u.seal(con, {
		trace: trace = u.createTrace(con, 'sql'),
		close: function() {
			if (this.keepalive) clearTimeout(this.keepalive);
			con.end(); // con.end uses "this". con.close can be used as a promise hook.
		}

	});
	con.verbosity = cfg.verbosity;
	trace(1, 'connecting with', cfg);
	if (cfg.verbosity) con.verbosity = cfg.verbosity;
	con.setPass = function(pass, id) {
		return q(bcrypt.hash(pass, 10)).then(function(pass) {
			return con.update('user', id, {pass});
		});
	};

	con.checkPass = function(email, guess, happy) {
		return con.query1('select * from user where email = ?', [email]).then(function(row) {
			if (!happy) {
				happy = Object.assign({}, row.user);
				delete happy.pass;
				happy = {user: happy};
			}
			return q(bcrypt.compare(guess, row.user.pass)).then(function(valid) {
				if (valid) return happy;
				else throw 'bcrypt rejected password';
			});
		});
	};

	con.connect(function(e) {
		if (e) {
			trace(3, 'FAILED to connect', e);
			db_init.reject(e);
		} else {
			trace(3, 'db connected');
			db_init.resolve(con);
		}
	});

	return db_init.promise;
};

/*
e.hashPass = function(pwd, id) {
	return q(bcrypt.hash(pwd, 10)).then(function(pass) {
		return {pass};
	});
};

e.checkPass = function(hash, pwd, happy) {
	return q(bcrypt.compare(pwd, hash)).then(function(valid) {
		if (valid) return happy || {match:true};
		else throw 'bcrypt rejected password';
	});
};
*/
