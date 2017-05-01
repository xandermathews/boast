"use strict";

// see redis_tests in tests.js for examples.
var test_block = {
	example: {
		// a minimum test spec has an "i" property, and either an "o" or "e".

		// the "i" can be either a function, in which case it is called (with the test spec object as context.)
		// or it can be the param list, in which case the function to be called is looked up on the object the test suite is running against.
		// the command name defaults to the test name ("example", in this block's case) or if the test has a "c" key, that takes precedence.

		// "o" is either a json object that is string-identical to the desired output of your "i" test, or "o" is a function that returns falsy on pass, or, on failure, a string or json description.
		// if the "i" test throws, "o" is not called.
		// if you provide an "e" instead of an "o", the same comparisons are done if and only if "i" throws.

		// the {test:} property can either be a single test-spec, or an array of test-specs. (in the latter, the names of the tests for logging are suffixed. ("example", "example2"...)
		// while all single character properties are reserved by the framework, your i/o/e funcs can read/write state to the test-spec object.
		test: {
			foo:'prefigured custom state',
			i:function() {
				console.log("example test", this.foo);
				return {exact:"data"};
			},
		   	o: function(r) {
				console.log("example validator");
				if (r.exact !== 'data') return "not happy";
			}
		}
	}
};

var q = require('q');
var u = require('./util.js');
var ji = u.ji;
var lo = u.lo;

var runtest = (function() {
	var queuer = q(true);
	var passes = 0, total = 0;
	var first_stack = true;
	var deferred_msgs = [];
	var seen_names = {};
	function deflo() {
		var args = u.toArray(arguments);
		deferred_msgs.push(u.slov(args));
	}
	return function(name, target, expected, is_fail) {
		if (arguments.length === 1) {
			return queuer.then(function(a) {
				if (name) {
					deferred_msgs.map(s=>lo(s));
					lo(passes === total? 'PASS':'FAIL', total-passes,"failures out of", total,"tests.");
					deferred_msgs = [];
					passes = total = 0;
				}
				return a;
			});
		}
		if (seen_names[name]) {
			name += seen_names[name]++;
		} else {
			seen_names[name] = 1;
		}
		++total;

		if (typeof target !== 'function') {
			target = () => target;
		}

		var test = expected;
		if (typeof expected !== 'function') {
			// TODO: use this instead https://nodejs.org/api/assert.html
			test = function(actual) {
				if (ji(expected) !== ji(actual)) return expected;
				return null; // no complaints => passed
			};
		}

		queuer = queuer.then(target).then(function(r) {
			if (is_fail) return {did_not_throw_an_error: r};
			var err = test(r);
			if (err) return {expected: err, actual: r};
			return {pass: true};
		}, function (r) {
			if (!is_fail) return {threw_an_error: r};
			var err = test(r);
			if (err) return {expected: err, actual: r};
			return {pass: true};
		}).then(function(results) {
			if (results.pass) {
				++passes;
				lo('PASS', name);
			} else {
				// in order because I'm cheesy about having one unit test's output set up the next. (SAD!)
				// it's massively helpful seeing the failure in the right place of the redis trace.
				lo('FAIL', name, ji(results));
				// but I like seeing the fails without having to scroll up and eyeball:
				deflo('FAIL', name, ji(results));
				process.exitCode = 1;
				if (u.isError(results.threw_an_error) && first_stack) {
					first_stack = false;
					lo(results.threw_an_error.stack);
				}
			}
		});
		return queuer;
	};
})();

module.exports = function(tests, library, is_last_block_of_tests) {
	var last_test_queued = q(true);
	Object.keys(tests).forEach(function(cmd) {
		var list = [].concat(tests[cmd].test);
		list.map(function(t, i) {
			var run;
			if (typeof t.i === 'function') {
				run = t.i.bind(t);
			} else {
				var args = [].concat(t.i);
				run = ()=> library[cmd].apply(library, args);
			}
			var test_name = t.c || cmd;
			var is_error = t.o === undefined;
			var validator = t.o || t.e;
			if (typeof validator === 'function') validator = validator.bind(t);
			last_test_queued = runtest(test_name, run, validator, is_error);
		});
	});
	return runtest(is_last_block_of_tests).thenResolve(library);
};

if (0) test_block('suppress linter warning');
