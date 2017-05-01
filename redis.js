"use strict";

var q = require('q');
var u = require('./util.js');
var ji = u.ji;
var lo = u.lo;
var trace; /*
1: errors
2: warnings
3: connection status changes
4: all cmds sent
5: inputs that caused error
6: cmds as they launch and timing
*/

function sendToRedis(cfg) {
	var result = q.defer();
	var start;
	if (trace(6)) {
		trace(6, 'SEND '+cfg.cmd+ji(cfg.params));
		start = Date.now();
	}
	cfg.wrap.conn[cfg.cmd](cfg.params, function(e, v) {
		if (trace(1)) {
			var delta = '';
			if (trace(6)) {
				var end = Date.now();
				delta = ' ('+ (end-start)+'ms)';

			}
			var inputs = ji(cfg.params);
			trace(4, 'SENT '+cfg.cmd+inputs+delta);
			if (e) {
				trace(1, 'error-'+cfg.cmd, e);
				trace(5, 'error-'+cfg.cmd+'-inputs:'+inputs);
			} else {
				trace(4, 'RESP', v);
			}
		}
		if (e) return result.reject(e);
		cfg.results = v;
		result.resolve(cfg);
	});
	return result.promise;
}

function scanWrapper(cfg) {
	if (cfg.hooks.length === 0) throw "scan requires at least one callback";
	var hooks = cfg.hooks;
	cfg.hooks = [];
	var seen = 0;
	var result = q.defer();
	function loop(cfg) {
		sendToRedis(cfg).then(function(cfg) {
			var cursor = cfg.results[0];
			var keys = cfg.results[1];
			var k = 'k', v = 'v';
			switch (cfg.cmd) {
				case 'zscan':
				   	k = 'v'; v = 's';
					/* falls through */
				case 'hscan':
					var pairs = [];
					for (var i = 1; i < keys.length; i+=2) {
						var r = {};
						r[k] = keys[i-1];
						r[v] = keys[i];
						pairs.push(r);
					}
					keys = pairs;
			}
			seen += keys.length;
			keys.map(function(key) {
				hooks.map(hook=>hook(key));
			});
			if (cursor === '0') {
				cfg.results = seen;
				result.resolve(cfg);
			} else {
				cfg.params[cfg.cmd === 'scan'?0:1] = cursor;
				loop(cfg);
			}
		}).catch(e=>result.reject(e));
	}
	loop(cfg);
	return result.promise;
}

function removeValue(func) {
	return function(args) {
		args = u.listOrVarargs(arguments);
		switch (args.length) {
			case 1: args.unshift(0); break;
			case 2: args.reverse(); break;
			default: throw "wrong number of args";
		}
		return func.apply(this, args);
	};
}

function truncate(wrap) {
	return function(args) {
		args = u.listOrVarargs(arguments);
		switch (args.length) {
			case 0: return wrap.del(this.key); // my spec for list.truncate() empties it out; might as well deallocate the key itself.
			case 1: return wrap.ltrim(this.key, 0, args[0]-1); // list.truncate(10) keep exactly 10 entries
			case 2: return wrap.ltrim.apply(this, args); // ltrim is [begin,end] so (0,10) results in 11 entries
			default: throw "wrong number of args";
		}
	};
}

function insert(func, dir) {
	return function(args) {
		args = u.listOrVarargs(arguments);
		if (args.length !== 2) throw "wrong number of args";
		return func.call(this, dir, args[0], args[1]);
	};
}

function slice(func) {
	return function(args) {
		args = u.listOrVarargs(arguments);
		var a = args[0], b = args[1];
		switch (args.length) {
			case 0: return func.call(this, 0, -1);  // slice() fetches the whole list
			case 1: return func.call(this, a, -1);  // slice(5) the sixth through last. so does slice(5, 0)
			case 2: return func.call(this, a, b-1); // slice(0, 5) returns the first five; slice(-2, -1) returns the 2nd to last only
			default: throw "wrong number of args";  // slice(-2, 0) returns the last two.
		}
	};
}

function addLocalNames(wrap) {
	var list = {
		length: wrap.llen,
		push: wrap.rpush,
		unshift: wrap.lpush,
		get: wrap.lindex,
		set: wrap.lset,
		pop: wrap.rpop,
		shift: wrap.lpop,
		truncate: truncate(wrap),
		removeValue: removeValue(wrap.lrem), // (value) removes all of those instances. (value, N) removes up to abs(N) of that value. (negative starts at the end.)
		slice: slice(wrap.lrange),
		insertBefore: insert(wrap.linsert,'before'), // list.insert$DIR("existing-marker", "new-entry");
		insertAfter: insert(wrap.linsert,'after'),
		cycle: wrap.rpoplpush,

		// q(true).then(list.will('lset', 3)).then(print lset response);
		will: function(fn, args) {
			args = args || [];
			lo("setting up a future call to", fn, args);
			return resp=>this[fn](args.concat(resp));
		}
	};
	wrap.list = function(key) {
		var l = Object.create(list);
		l.key = key;
		return l;
	};
}

var cmds = 'mset,mget,getset,setrange,getrange,keys,type,append,incr,decr,incrby,decrby,incrbyfloat,exists,rename,del,psetex,persist,pexpire,pexpireat,pttl,hmset,hmget,hgetall,hlen,hkeys,hvals,hexists,hdel,hincrby,hincrbyfloat,lpush,rpush,lset,lindex,llen,lrem,lpop,rpop,lrange,linsert,ltrim,rpoplpush,sadd,srem,sunionstore,scard,sunion,srandmember,spop,smove,smembers,sismember,sinter,sinterstore,sdiff,sdiffstore,zadd,zrem,zincrby,zscore,zrevrank,zrank,zcard,zcount,zrange,zrangebyscore,zrevrangebyscore,zrevrange,zunionstore,zinterstore,zremrangebyrank,zremrangebyscore,zremrangebylex,zrangebylex,zrevrangebylex,zlexcount,sort,bitcount,scan,zscan,hscan,sscan'.split(',');
function wrapRawCmds(wrap) {
	cmds.forEach(function(cmd) {
		var custom = sendToRedis;
		switch (cmd) {
			case 'scan':
			case 'sscan':
			case 'hscan':
			case 'zscan':
				custom = scanWrapper;
		}
		wrap[cmd] = function(varargs) {
			varargs = u.listOrVarargs(arguments);
			var cfg = {
				cmd,
				wrap,
				hooks: [],
				params: []
			};
			// separate user inputs into params and functions
			cfg.params = varargs.filter(function(a) {
				if (typeof a === 'function') {
					cfg.hooks.push(a);
					return false;
				}
				return true;
			});
			if (this && this.key) cfg.params.unshift(this.key);
			return q(cfg).then(custom).then(function(cfg) {
				var p = q(cfg.results);
				if (cfg.hooks.length) {
					p = cfg.hooks.reduce((p, hook) => p.then(hook), p); // not in parallel; caller has right to use middleware, so mutations are possible.
				}
				return p;
			});
		};
		wrap[cmd].really = cmd;
	});
	wrap.set = function() { throw "use mset instead of set"; };
	wrap.get = function() { throw "use mget instead of get"; };
}

function installEventHooks(redis_client, onready) {
	'connect,reconnecting,end'.split(',').forEach(function(evn) {
		redis_client.on(evn, function(param) {
			trace(3, evn, {param});
		});
	});

	redis_client.on('error', function(msg) {
		trace(1, 'error', msg, 'argc', arguments.length);
		u.pub('redis_error', {msg});
	});
	redis_client.on('warning', function(msg) {
		trace(2, 'warning', msg);
		u.pub('redis_warning', {msg});
	});

	redis_client.on('ready', function() {
		trace(3, 'ready');
		onready();
	});
}

module.exports = function(deps_and_opts) {
	if (deps_and_opts.verbosity !== undefined) module.exports.verbosity = deps_and_opts.verbosity;
	var redis_client = require('redis').createClient(deps_and_opts);

	var wrap = { conn: redis_client };
	wrap.close = function() {
		trace(3, 'quitting');
		redis_client.quit();
	};

	wrapRawCmds(wrap);
	addLocalNames(wrap);
	var result = q.defer();
	installEventHooks(redis_client, ()=> result.resolve(wrap));
	var p = result.promise;
	if (deps_and_opts.test) p = p.then(require('./tests.js').testRedis);
	return p;
};

trace = u.createTrace(module.exports, 'red');
