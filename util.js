"use strict";

var u = exports;

u.type = function(o) {
	var t = typeof o;
	if (t !== 'object') return t;
	return Object.prototype.toString.call(o).split(' ')[1].slice(0, -1).toLowerCase();
};

u.isContainer = function(o) {
	//true for arrays and objects
	return o && typeof o === 'object';
};

u.isError = function(o) {
	return o instanceof Error;
};

u.toArray = function(pseudo_array, skip) {
	var args = Array.prototype.slice.call(pseudo_array);
	if (skip) args.splice(0, skip);
	return args;
};

u.num = function(str) {
	var n = null;
	try {
		var t = +str;
		if (Number.isFinite(t)) n = t;
	} catch (e) {
	}
	return n;
}

u.each = function(o, visitor) {
	switch (u.type(o)) {
		case 'arguments':
			o = u.toArray(o);
			/* falls through */
		case 'array':
			return o.map(visitor);

		case 'object':
		case 'error':
			return Object.keys(o).map(k=>visitor(o[k], k, o));

		default:
			throw u.type(o) + ' is not a valid type for util.each';
	}
};

u.j = function(a, indent, filter) {
	if (indent === undefined) indent = 4;
	if (filter && typeof filter !== 'function') {
		console.error("ERR: obsolete filter value in j()");
		throw {filter,a};
	}
	if (typeof filter !== 'function') filter = (k,v)=>v;
	if (!u.isContainer(a)) return JSON.stringify(a, filter, indent);

	var seen = new WeakMap();
	var parents = new WeakMap();
	parents.set(a, '$');
	function filt(k, v) {
		v = filter(k, v);
		if (u.isContainer(v)) {
			if (seen.has(v)) return "[Circular] "+ parents.get(v);
			seen.set(v, true);
			var myself = parents.get(v) + '.';
			u.each(v, function(val,sub) {
				if (u.isContainer(val)) {
					if (!parents.has(val)) parents.set(val, myself+sub);
				}
			});
			if (u.isError(v)) {
				return ''+v;
				//return {msg: ''+v, stack: v.stack};
			}
		}
		return v;
	}
	try {
		return JSON.stringify(a, filt, indent);
	} catch (e) {
		if (''+e === 'TypeError: Converting circular structure to JSON') {
			try {
				return JSON.stringify(a, function(k, v) {
					if (typeof v === 'object' && v) {
						// TODO: rewrite my mapping to be full path, so that I can print what the new ref's original path was.
						if (seen.has(v)) return k+" is a LOOP";
						seen.set(v, true);
					}
					return filter(k, v);
				}, indent);
			} catch (e) {
				return e;
			}
		} else {
			throw e;
		}
	}
};

u.jp = function(input, reviver, do_throw) {
	if (arguments.length === 2 && typeof reviver === 'boolean') return u.jp(input, null, reviver);
	try {
		return JSON.parse(input, reviver);
	} catch (e) {
		if (do_throw) throw e;
		return null;
	}
};

u.ji = function(a, filter) { return u.j(a, 0, filter); };

u.slov = function(args) {
	var r = "";
	for (var i = 0; i < args.length; ++i) {
		var a = args[i];
		if (i > 0) r += ' ';
		switch (typeof a) {
			case 'string':
			case 'number':
			case 'boolean':
			case 'function':
				r += a;
				break;
			default:
				if (a instanceof Error) {
					r += a;
				} else if (a instanceof TypeError) {
					r += a;
				} else {
					r += u.j(a);
				}
		}
	}
	return r;
};

u.slo = function() {
	return u.slov(arguments);
};

function cordova_safe_log(level) {
	var r = u.slov(u.toArray(arguments, 1));
	console[level](new Date().toISOString() +': '+ r);
}

u.mergeMap = function(filter) {
	if (arguments.length < 1) return {};
	var out = arguments[1];
	if (!out) out = {};
	var a;
	function apply(k) {
		out[k] = filter(a[k], out, k, a);
	}
	for (var i = 2; i < arguments.length; ++i) {
		a = arguments[i];
		if (a) Object.keys(a).forEach(apply);
	}
	return out;
};

u.merge = u.mergeMap.bind(null, (v) => v);
u.seal = u.mergeMap.bind(null, function(v, dst) {
   	if (typeof v === 'function') v = v.bind(dst);
   	return v;
});

u.lo = cordova_safe_log.bind(null, 'log');

u.dumpApi = function(obj) {
	Object.keys(obj).forEach(function(k) {
		u.lo(typeof obj[k], k, u.ji(obj[k]));
	});
};

u.listOrVarargs = function(args) {
	// is always called with the caller's (arguments)
	// if the caller was called with a single param that's an array, that's already wrapped nicely.
	if (args.length === 1 && u.type(args[0]) === 'array') return args[0];
	// else wrap all caller args into a single true list.
	return u.toArray(args);
};


u.createTrace = function(obj, name, key) {
	key = key || 'verbosity';
	name = name || 'trace'; // this is the component name for log tagging
	obj[key] = obj[key] || 0;

	return function(level, args) {
		if (obj[key] >= level) {
			if (typeof args === 'function') {
				return args();
			}
			var a = [name+'-'+level];
			for (var i = 1; i < arguments.length; ++i) {
				a.push(arguments[i]);
			}
			if (a.length > 1) u.lo.apply(null, a);
			return true;
		}
		return false;
	};
};

var subs = {};
var verbose = {};

u.pub = function(type, json) {
	var responses = [];
	if (verbose[type]) u.lo(type, json);
	if (!subs[type] || !subs[type].length) return responses;
	json.type = type;
	subs[type].forEach(function(hook) {
		var r = hook(json);
		if (r !== undefined) responses.push(r);
	});
	return responses;
};
u.pub.verbosity = function(type, bool) {
	if (arguments.length === 1) bool = true;
	verbose[type] = bool;
};
u.sub = function(type, hook) {
	subs[type] = subs[type] || [];
	subs[type].push(hook);
};
u.unsub = function(type, hook) {
	subs[type] = subs[type].filter(function(h) {
		return h !== hook;
	});
};

u.sub.once = function(type, hook, count) {
	count = count || 1;
	function wrapper(j) {
		if (--count < 1) u.unsub(type, hook);
		return hook(j);
	}
	u.sub(type, wrapper);
};
