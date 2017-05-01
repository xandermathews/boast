"use strict";
var boast = require('./boast.js');
var u = require('./util.js');
var ji = u.ji;
var lo = u.lo;

var atLeastOneDupe = function(cats) {
	var seen = {};
	var pass = false;
	cats.map(function(cat) {
		if (seen[cat]) pass = true;
		seen[cat] = true;
	});
	return pass ? null : 'a duplication';
};

var russians = ['tink','taz'];
var oneOfTheBlueRussians = function(cats) {
	if (typeof cats === 'string') cats = [cats];
	else if (cats.length !== 1) return 'one russian cat, exactly';
	if (!russians.includes(cats[0])) return 'one of the blue russians';
};

var sorted = function(actual, expected) {
	if (actual.length !== expected.length) return expected;
	var unseen = {};
	expected.map(c=>unseen[c] = c);
	var missing = actual.filter(c=> ! unseen[c]);
	if (missing.length) return expected;
};

var scan_results;
var scanner = function(id, expected) {
	if (scan_results === undefined) scan_results = {};
	if (arguments.length === 2) {
		//lo("setting up", id, "with", expected);
		// tracking results
		var missing = {};
		var surplus = [];
		expected.forEach(function(v, i) {
			if (typeof v === 'object') v = ji(v);
			missing[v] = i;
		});
		scan_results[id] = {missing, surplus};

		return function(val) {
			//lo("proc", id, val);
			var v = val;
			if (typeof v === 'object') v = ji(v);
			if (missing[v] !== undefined) {
				delete missing[v];
			} else {
				surplus.push(val);
			}
		};
	}

	return function() {
		// checking results
		var results = scan_results[id];
		results.missing = Object.keys(results.missing);
		//lo("final for", id, results);
		if (results.missing.length || results.surplus.length) return results;
	};
};

// if editor brace jumps continue to annoy me, I could obfuscate the inclusive/exclusive markers...
//exports.lo("codes: [", '['.charCodeAt(0));
//codes: [ 91
//codes: ( 40

var redis_tests = {
	// BASICS
	mset: {
		test: [
			{i:['hello', 'world'],              o:'OK'},
			{i:['number',42],                   o:'OK'},
			{i:['hello', 'world', 'number',42], o:'OK'},
			{i:['rangetest','rangetest'],       o:'OK'},
			{i:['taco','f','mar','j'],          o:'OK'}
		]
	},
	mget: {
		test: {i:['hello','number'], o:['world', '42']}
	},
	getset: {
		test: [
			{i:['hello','mars'], o:'world'},
			{i:['hello','world'],o:'mars'}
		]
	},
	setrange: {
		test: [
			{i:['rangetest',-4,'negatives are not permitted'],e:'ReplyError: ERR offset is out of range'},
			{i:['rangetest',5,'toast'],o:10}
		]
	},
	getrange: {
		test: {i:['rangetest',3,-4],o:'geto'}
	},
	keys: {
		test: {i:'hello', o: ['hello']}
	},
	type: {
		test: {i:'hello', o: 'string'}
	},
	append: {
		test: {i:['hello',' world'], o:11}
	},
	incr: {
		test: [
			{i:'hello', e:'ReplyError: ERR value is not an integer or out of range'},
			{i:'number', o:43}
		]
	},
	decr: {
		test: {i:'number', o:42}
	},
	incrby: {
		test: {i:['number',-1], o:41}
	},
	decrby: {
		test: {i:['number',-1], o:42}
	},
	incrbyfloat: {
		test: [
			{i:['number',-3], o:'39'},
			{i:['number',3.14], o:'42.14'}
		]
	},
	exists: {
		test: [
			{i:'hello', o:1},
			{i:'ufo',o:0}
		]
	},
	rename: {
		test: {i:['mar','torro'],o:'OK'}
	},
	// TODO: when redis 4.x is out, s/del/unlink/
	del: { // accepts N targets, returns 'real keys removed'
		test: [
			{i:['taco','torro','ufo'], o: 2},
			{i:['ship', 'movies', 'cats', 'live_cats', 'dead_cats','ca_cats','la_cats','russian_cats'], o: ()=>null} // clean up unit test noise
		]
	},
	// EXPIRATIONS
	psetex: {
		test: {i:['rangetest',30,'this goes away in 30 milli'],o:'OK'}
	},
	persist: {
		test: {i:'rangetest', o:1}
	},
	pexpire: {
		test: {i:['rangetest', 30], o:1}
	},
	pexpireat: {
		test: {i:['rangetest', Date.now()+3000], o:1}
	},
	pttl: {
		test: [
			{i:'hello', o: -1}, // there is no expiry
			{i:'ufo', o: -2}, // there is no key
			{i:'rangetest', o: ans=> +ans > -1 ? null :'positive TTL' } // zero is a valid response: you can hit it if you time your request right.
		]
	},
	// HASHES
	hmset: {
		test: {i: ['ship', 'shields', 42, 'hull', 12], o: 'OK'}
	},
	hmget: {
		test: [
			{i: ['ship', 'shields', 'hull'], o: ['42','12']},
			{i: ['ship', 'shields'], o: ['42']}
		]
	},
	hgetall: {
		test: {i: 'ship', o: {shields: '42', hull: '12'}}
	},
	hlen: {
		test: {i: 'ship', o: 2}
	},
	hkeys: {
		test: {i: 'ship', o: ['shields', 'hull']}
	},
	hvals: {
		test: {i: 'ship', o: ['42','12']}
	},
	hexists: {
		test: {i: ['ship', 'shields'], o: 1}
	},
	hdel: {
		test: {i: ['ship', 'shields'], o: 1}
	},
	hincrby: {
		test: {i: ['ship', 'hull', -1], o: 11}
	},
	hincrbyfloat: {
		test: [
			{i:['ship','shields',-3], o:'-3'},
			{i:['ship','shields',3.14], o:'0.14'}
		]
	},
	// LISTS
	lpush: {
		test: {i:['cats','milo','gizmo'], o: 2} // note push order: 'gizmo' is now first
	},
	rpush: {
		test: {i:['cats','tink','spaz','chaos','chat','admiral bird','pounce de leon','electron','taz'], o: 10}
	},
	lset: {
		test: {i:['cats',2,'tinkerbell'], o:'OK'}
	},
	lindex: {
		test: {i:['cats',2], o:'tinkerbell'}
	},
	llen: {
		test: {i:'cats', o:10}
	},
	lrem: {
		test: {i:['cats', -1, 'electron'], o:1}
	},
	lpop: {
		test: {i:'cats', o:'gizmo'}
	},
	rpop: {
		test: {i:'cats', o:'taz'}
	},
	lrange: {
		test: {i:['cats',2,3], o:['spaz','chaos']}
	},
	linsert: {
		test: [
			{i:['cats','before', 'chat', 'tink'], o: 8},
			{i:['cats','after', 'chat', 'purrcilla'], o: 9},
			{i:['cats','after', 'chat', 'elvis'], o: 10}
		]
	},
	ltrim: { // use [0, n-1] to keep only the HEAD N items
		test: {i:['cats', 0, 10], o:'OK'}
	},
	rpoplpush: { // takes the tail of SRC and puts it at the head of DST, and returns value moved
		test: {i:['cats','cats'], o: 'pounce de leon'}
	},
	// SETS
	sadd: { // since sets ignore dupes...
		test: [
			{i:['live_cats','spaz','chat','chaos','electron','taz','purrcilla'], o: 6},
			{i:['dead_cats','tink','admiral bird','pounce de leon','gizmo','milo','elvis'], o: 0},
			{i:['la_cats','admiral bird','pounce de leon','gizmo','milo','elvis','purrcilla'], o: 0},
			{i:['ca_cats','tink','spaz','chaos','chat','electron','taz','copper'], o: 7},
			{i:['russian_cats','tink','taz'], o: 2}
		]
	},
	srem: {
		test: {i:['ca_cats','copper'], o:1}
	},
	sunionstore: {
		test: {i:['cat', 'live_cats','dead_cats','la_cats','ca_cats'], o:12}
	},
	scard: {
		test: {i:'cat', o:12}
	},
	sunion: {
		test: {i:['la_cats','ca_cats'], o:list=>list.length === 12 ? null: '12 cats'}
	},
	srandmember: { // count defaults to 1. if count is positive, select distinct. if negative, pure random, allows dupes.
		test: [
			{i:'russian_cats', o:oneOfTheBlueRussians},
			{i:['russian_cats', 2], o:cats=> cats.includes('tink') && cats.includes('taz') ?null:'both of the blue russians'},
			{i:['russian_cats', -3], o: cats=>atLeastOneDupe(cats)},
		]
	},
	spop: {
		test: [
			{i:'russian_cats', o:oneOfTheBlueRussians},
			//requires redis 3.2, I have 3.0
			//{i:['russian_cats', 2], o:oneOfTheBlueRussians} // because spop returns "all remaining" on underflow.
		]
	},
	smove: {
		test: {i:['live_cats', 'dead_cats', 'chaos'], o:1}
	},
	smembers: {
		test: {i:'russian_cats', o:oneOfTheBlueRussians},
	},
	sismember: {
		test: {i:['ca_cats','spaz'], o: 1}
	},
	sinter: {
		test: {i:['ca_cats','live_cats'], o: cats=>sorted(cats, ["electron","taz","spaz","chat"])}
	},
	sinterstore: {
		test: {i:['cat', 'ca_cats','live_cats'], o: 4}
	},
	sdiff: {
		test: {i:['ca_cats','dead_cats'], o: cats=>sorted(cats, ["taz","chat","spaz","electron"])}
	},
	sdiffstore: {
		test: {i:['cat', 'ca_cats','dead_cats'], o: 4}
	},
	// ZSETS
	zadd: {
		test: [
			{i:['movies', 10, 'star wars', 9, 'princess bride', 1, 'anything by micheal bay'], o: 3},
			{i:['movies', 0, 'fake', 2, 'fake2', 1.5, 'anything by micheal bay'], o: 2},
			{i:['movies', 3, 'fake3', 4, 'fake4', 5, 'fake5', 6, 'fake6', 7, 'fake7', 8, 'fake8', 8.1, 'fake9', 8.2, 'fake10'], o: 8}
		]
	},
	zrem: {
		test: {i:['movies', 'fake', 'fake2'], o:2}
	},
	zincrby: {
		test: {i:['movies', -10, 'anything by micheal bay'], o: '-8.5'}
	},
	zscore: {
		test: {i:['movies', 'star wars'], o: '10'}
	},
	zrevrank: {
		test: {i:['movies', 'star wars'], o: 0}
	},
	zrank: {
		test: {i:['movies', 'star wars'], o: 10}
	},
	zcard: {
		test: {i:'movies', o: 11}
	},
	zcount: { // select by score
		test: {i:['movies', 9, 10], o: 2}
	},
	zrange: { // indexed by rank
		test: [
			{i:['movies', -2, -1, 'withscores'], o: ["princess bride","9","star wars","10"]},
			{i:['movies', -2, -1], o: ["princess bride","star wars"]}
		]
	},
	zrangebyscore: { // indexed by score
		test: [
			{i:['movies', 9,10, 'withscores'], o: ["princess bride","9","star wars","10"]},
			{i:['movies', 9,10], o: ["princess bride","star wars"]},
			{i:['movies', '(9',10], o: ["star wars"]}
		]
	},
	zrevrangebyscore: { // indexed by score
		test: [
			{i:['movies', 10,9], o: ["star wars","princess bride"]},
			{i:['movies', '(10',9], o: ["princess bride"]}
		]
	},
	zrevrange: {
		test: {i:['movies', -1,-1, 'withscores'], o: ["anything by micheal bay","-8.5"]}
	},
	zunionstore: {
		test: {i: ['copy_of_movies', 1, 'movies', 'weights', 1.5], o: 11}
	},
	zinterstore: {
		test: {i: ['copy_of_movies', 1, 'movies', 'weights', 1.5], o: 11}
	},
	// so many ways to delete
	zremrangebyrank: {
		test: {i:['movies', 1,2], o: 2}
	},
	zremrangebyscore: {
		test: {i:['movies', 8,'(9'], o: 3}
	},
	// LEX SUBSECTION
	zremrangebylex: {
		test: {i:['movies', '[fake',  '(prin'], o:3}
	},
	zrangebylex: {
		test: {i:['movies', '-',  '[star', 'limit','0','1'], o:["anything by micheal bay"]}
	},
	zrevrangebylex: {
		test: {i:['movies', '+',  '[star'], o:["star wars"]}
	},
	zlexcount: {
		test: {i:['movies', '-',  '[star'], o:2}
	},

	// applies to LISTS, SETS, and ZSETS. syntax's more than a little crazy (https://redis.io/commands/sort)
	sort: {
		test: {i:['cat', 'alpha'], o:["chat","electron","spaz","taz"]}
	},
	// BITS TODO make a subclass for bits: https://redis.io/commands/bitfield https://redis.io/commands/bitop https://redis.io/commands/bitpos
	//setbit: { },
	bitcount: {
		test: {i:'hello', o: 47}
	},
	// SCANS
	scan: {
		test: {i:[0,'match', '*cats','count', 2, scanner('scan', [
			"russian_cats","cats","live_cats","dead_cats","ca_cats","la_cats"
		])], o: scanner('scan')}
	},
	zscan: {
		test: {i:['movies', 0,'match', '*', 'count', 2, scanner('zscan', [
			{"v":"anything by micheal bay","s":"-8.5"},
			{"v":"princess bride","s":"9"},
			{"v":"star wars","s":"10"}
		])], o: scanner('zscan')}
	},
	hscan: {
		test: {i:['ship', 0,'match', '*', 'count', 2, scanner('hscan', [
			{k:"hull",v:"11"},
			{k:"shields",v:"0.14"}
		])], o: scanner('hscan')}
	},
	sscan: {
		test: {i:['cat', 0,'match', '*', 'count', 2, scanner('sscan', ["chat","taz","electron","spaz"])], o: scanner('sscan')}
	},
	list: {
		test: {foo:'bar', i:function() {
			lo("list test", this.foo);
		}, o: function() {
			lo("list validator");
		}}
	}
};

exports.testRedis = function(wrap) {
	return boast(redis_tests, wrap, true).fin(a=> wrap.conn.unref());
};
