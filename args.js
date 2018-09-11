/* Copyright 2018 Alexander Mathews xander@ashnazg.com
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */

// possible: abandon this and use https://github.com/busterjs/posix-argv-parser
// TODO: in a math cli, "-5" is a valid param. have a trap to capture those. (Do I already?)
var fs = require('fs');
var util = require('util');

module.exports = parse;

function applyGnu(arg, out) {
	var gnu_name = arg.shift();
	var val = arg.length ? arg.join('=') : true;
	var hook = out.gnu[gnu_name];
	if (!hook) return out.error_unknown(gnu_name, '--');
	if (hook === true) {
		if (arg.length) return out.error_flagonly(gnu_name, '--');
		return out.opts[gnu_name] = (out.opts[gnu_name] || 0) + 1;
	}
	var mapped = hook(val, out, gnu_name, '--');
	if (mapped !== undefined) {
		if (out.multi[gnu_name]) {
			out.opts[gnu_name].push(mapped);
		} else {
			out.opts[gnu_name] = mapped;
		}
	}
}

function applyPosix(arg, out, argv) {
	var posix_name = arg[0];
	var gnu_name = out.posix[posix_name];
	if (!gnu_name) return out.error_unknown(posix_name, '-');
	var hook = out.gnu[gnu_name];
	if (hook === true) {
		// peel one posix opt off, and if there's any more, stuff them back in the input buffer.
		if (arg.length > 1) argv.unshift('-'+ arg.substr(1));
		return applyGnu([gnu_name], out);
	} else {
		// we require a value -- either the rest of the current chunk, or the entire next one
		var val;
		if (arg.length > 1) {
			val = arg.substr(1);
		} else if (argv.length) {
			val = argv.shift();
		} else {
			return out.error_value_required(posix_name, '-');
		}
		var mapped = hook(val, out, posix_name, '-');
		if (mapped !== undefined) {
			if (out.multi[gnu_name]) {
				out.opts[gnu_name].push(mapped);
			} else {
				out.opts[gnu_name] = mapped;
			}
		}
	}
}

function parse(argv) {
	if (arguments.length === 0) {
		argv = process.argv.slice(2);
	} else {
		argv = argv.slice();
	}
	var dashedOut = false;
	argv.forEach(arg => {
		if (!dashedOut && arg === '--help') {
			if (parse.gnu.help) {
				parse.gnu.help();
			} else {
				var usage = parse.help.usage;
				if (!usage) {
					var script = parse.help.script;
					if (!script) {
						script = process.argv[1].replace(/^.*[/]/, '').replace(/.js$/, '');
					}
					usage = script + ' [-opts] '+ parse.help.noun;
				}
				console.log(`USAGE: ${usage}\n${parse.help.summary}\n` + parse.helpTable());
			}
			process.exit(0);
		} else if (arg === '--') dashedOut = true;
	});
	try {
		while (argv.length) {
			var arg = argv.shift();
			// if arg = '-' it means 'read/write stdin/stdout', which is out of the scope of this parser, so just put it in params.
			if (arg[0] === '-' && arg.length > 1) {
				if (arg[1] === '-') {
					if (arg.length > 2) {
						applyGnu(arg.substr(2).split('='), parse);
					} else {
						// '--' ends parsing
						while (argv.length) {
							parse.params.push(argv[0]);
							argv.shift();
						}
					}
					continue;

				} else {
					// posix mode
					applyPosix(arg.substr(1), parse, argv);
					continue;
				}
			}
			parse.params.push(arg);
		}
	} catch (e) {
		parse.error_abort(e, 1);
	}
	return parse.params;
}
parse.help = {
	summary: '[set ashnazgargs.help.summary to a string, or define("help", customHandler)]',
	noun: '[files...]'
};

// like typeof, except doesn't conflate null, array, undefined and map into 'object'
function type(o) {
	var t = typeof o;
	if (t !== 'object') return t;
	return Object.prototype.toString.call(o).split(' ')[1].slice(0, -1).toLowerCase();
};

parse.gnu = {}; // a map of validator functions
parse.posix = {}; // a map of single-char names to their full name in .gnu
parse.params = []; // output: non-options.
parse.opts = {}; // output: option values.
parse.desc = {}; // a map of gnu names to descriptors.
parse.suffix = {}; // this is used in the help table: --gnu=SUFFIX
parse.multi = {}; // map of gnu to bool (if true, option value is a list; if false, later options override earlier ones)

// low priority todo: contrast this error definition pattern with those at http://devdocs.io/javascript/global_objects/error
function UserError(message, extra) {
	  Error.captureStackTrace(this, this.constructor);
	  this.name = this.constructor.name;
	  this.message = message;
	  this.extra = extra;
};

util.inherits(UserError, Error);

parse.error_abort = function(e, code) {
	if (e instanceof UserError) {
		console.error("FAIL: " + e.message);
	} else {
		console.error("FAIL: ", e);
	}
	process.exit(code);
}

parse.error_unknown = function(key, prefix) {
	throw new UserError(`option ${prefix}${key} not understood`);
};

parse.error_flagonly = function(key, prefix) {
	throw new UserError(`option ${prefix}${key} does not take a value`);
};

parse.error_wrong_type = function(key, prefix, expected, article) {
	article = article || 'a';
	throw new UserError(`option ${prefix}${key} expects ${article} ${expected}`);
};

parse.error_value_required = function(key, prefix) {
	throw new UserError(`option ${prefix}${key} requires a value`);
};

parse.error_not_in_enum = function(key, prefix, list) {
	throw new UserError(`option ${prefix}${key} must one of: `+ list.join(','));
};

parse.error_input_file = function(key, prefix, fn) {
	if (arguments.length === 3) {
		throw new UserError(`option ${prefix}${key} could not read ${fn}`);
	} else {
		throw new UserError(`could not read ${key}`);
	}
};

/* accepted arities:
args.define('c', 'cat', 'string', 'stuff', 'NAME');
args.define('c', 'cat', 'string', 'stuff');
args.define(     'cat', 'string', 'stuff');
args.define(     'cat', 'string');
*/
// TODO: move suffix to being a cascade.
// TODO: write a default cascade
parse.define = function(gnu, posix, validator, desc, suffix) {
	if (arguments.length < 4) {
		desc = validator;
		validator = posix;
		posix = gnu[0];
	}

	var hook;
	switch (type(validator)) {
		case 'function':
			hook = validator;

		case 'string':
			var numtest = Number.isFinite;
			var article = 'a';
			switch (validator) {
				case 'flag':
					hook = true;
				break;

				case 'integer':
					console.warn("deprecated: option type integer. use int.");
				case 'int':
					numtest = Number.isInteger;
					article = 'an';
					// fall through
				case 'number':
					hook = (val, out, key, prefix) => {
						val = +val;
						if (!numtest(val)) {
							this.error_wrong_type(key, prefix, validator, article);
						}
						return val;
					};
				break;

				case 'file_in':
					hook = (val, out, key, prefix) => {
						if (val !== '-') {
							try {
								fs.accessSync(val, fs.constants.R_OK);
							} catch (e) {
								return this.error_input_file(key, prefix, val);
							}
						}
						return val;
					};
				break;

				case 'csv':
					if (suffix === undefined) suffix = 'CSV';
					// calling multi() isn't relevant; that flag only comes into play if hook returns !undefined; we're handling everything here.
					this.opts[gnu] = this.opts[gnu] || [];
					hook = (val, out, key, prefix) => {
						val = val.split(',');
						out.opts[gnu] = out.opts[gnu].concat(val);
					};
				break;

				case 'file_out':
					if (suffix === undefined) suffix = 'FILE_OUT';
					validator = 'string';
					// fall through

				default:
					hook = (val, out, key, prefix) => {
						if (type(val) !== validator) {
							this.error_wrong_type(key, prefix, validator);
						}
						return val;
					};
				break;
			}
			break;

		case 'array':
			if (suffix === undefined) suffix = 'ENUM';
			if (desc === undefined) desc = 'one of: ' + validator.join(', ');
			hook = (val, out, key, prefix) => {
				if (validator.indexOf(val) === -1) {
					return this.error_not_in_enum(key, prefix, validator);
				}
				return val;
			}
			break;
		default:
			throw new Error(`illegal type in ashnazgargs define(${gnu}, ${posix}, <${type(validator)}>)`);
	}

	if (posix) this.posix[posix] = gnu;
	if (desc) this.desc[gnu] = desc;
	if (suffix === undefined && validator !== 'flag') suffix = validator.toUpperCase();
	if (suffix) this.suffix[gnu] = suffix;

	this.gnu[gnu] = hook;

	var that = this;
	return {
		env(envname) {
			// TODO: have the initial value of the option set to this env var.
			// TODO: have the help table show this.
		},
		multi() {
			that.opts[gnu] = [];
			that.multi[gnu] = true;
			return this;
		}
	};
}

parse.helpTable = function() {
	// reverse the posix map:
	var gnu2posix = {};
	Object.keys(parse.posix).forEach(posix => {
		var dest = parse.posix[posix];
		gnu2posix[dest] = posix;
	});

	var gnus = Object.keys(parse.gnu);
	var longest = gnus.map(key => {
		var len = key.length;
		if (parse.suffix[key]) len += 1 + parse.suffix[key].length;
		return len;
	}).reduce((max, cur) => Math.max(max, cur));

	var out = '';

	var ch = require('child_process');
	var columns = +ch.execSync('tput cols');
	gnus.forEach(gnu => {
		var posix = gnu2posix[gnu];
		if (posix) {
			posix = `-${posix},`;
		} else posix = '   ';

		var desc = parse.desc[gnu] || '';
		var suffixed = gnu;
		var suffix = parse.suffix[gnu];
		if (suffix) suffixed += '='+suffix;
		suffixed = suffixed.padEnd(longest);

		var left = `  ${posix} --${suffixed}  `;
		var nextline = '\n' + ''.padEnd(left.length);
		var right_budget = columns - left.length;

		out += `\n${left}`;
		var paragraphs = desc.split('\n');
		paragraphs.forEach((longline, iPara) => {
			if (iPara) out += '\n' + nextline;
			if (longline.length > right_budget) {
				if (right_budget < columns/2) {
					// too thin to bother; just single-column it.
					return out += `\n    ${longline}\n`;
				}
				var words = longline.split(/\s/).filter(word => word.length);
				while (words.length) {
					if (words[0].length > right_budget) {
						// worst case. have to break inside a word.
						out += words[0].substr(0, right_budget) + nextline;
						words[0] = words[0].substr(right_budget);
					} else {
						// justify as many words as fits, then start the next line.
						var remaining_space = right_budget;
						while (words.length && words[0].length <= remaining_space) {
							out += words[0];
							remaining_space -= words.shift().length;
							if (remaining_space) {
								remaining_space -= 1;
								out += ' ';
							}
						}
						if (words.length) out += nextline;
					}
				}
			} else {
				// simple mode
				out += longline;
			}
		});
	});
	return out;
}

parse.logger = function(fn, truncate) {
	if (!fn) return  () => {};
	if (fn === '-') {
		return function() {
			console.log(util.format.apply(util, arguments));
		}
	} else {
		if (truncate) {
			fs.closeSync(fs.openSync(fn, 'w'));
		}
		return function() {
			fs.appendFileSync(fn, util.format.apply(util, arguments) + '\n');
		}
	}
}

parse.loadFilesSync = function(fn) {
	if (typeof fn === 'string') {
		if (fn === '-') {
			// stdin does not have a sync option, so this needs to be rewritten to streaming before this can handle that scenario.
			// TODO
			// looks likely. https://stackoverflow.com/questions/30441025/read-all-text-from-stdin
			// maybe works? untested. https://gist.github.com/pbkhrv/0d17c4c3f69e372cdcd0
			// convo. https://github.com/nodejs/node-v0.x-archive/issues/7412
			return parse.error_input_file(key, prefix, '- due to stdin requiring async streaming');
		}
		try {
			try {
				var contents = fs.readFileSync(fn, 'utf8');
			} catch (e) {
				if (e.code === 'ENOENT') {
					return parse.error_input_file(fn);
				} else {
					throw e;
				}
			}
		} catch (final_e) {
			return parse.error_abort(final_e, 1);
		}

		return contents.split('\n');

	} else {
		return fn.map(parse.loadFilesSync);
	}
};
