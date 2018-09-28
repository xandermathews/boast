/*
var tabulate = require('boast/tabulate');
console.log(tabulate(rows_or_conf));

takes either an array of objs, or a config:
{
	rows: [objs,] (everything else is optional)
	widths: {colname: 5} (these are minimums, not maximums.)
	include: 'colname,col2' (if present, all fields not in this list are ignored)
	exclude: 'colname,col2' (this is not checked if 'include' is present.)
	color: function(field_val, field_name, row_obj) { return '\x1b[31m'; }
}

returns a multiline string.
columnn sets can also be an array, or map of truthieness.

printout's column order is controlled by 'width'. (or include if width is not present.)

if color returns a truthy, assume it's a console color string to use as prefix, and add a reset at end of cell's printout.
the default color() prints json undefined and null in grey
*/

// if input is an object, this is contractually a passthrough.
function unpackFlagSet(variant) {
	if (!variant) return {}; // catch null, undefined, and silly inputs like false
	if (typeof variant === 'string') variant = variant.split(',');
	if (Array.isArray(variant)) {
		var obj = {};
		variant.map(val => obj[val] = true);
		return obj;
	}
	if (typeof variant === 'object') return variant;
	throw new Exception('unpackFlagSet does not accept '+ typeof variant);
}

function validateMapInts(w) {
	var err = 'tabulate conf.width must be a map of numbers';
	if (w === undefined) return;
	if (w && typeof w === 'object') {
		var bad_keys = Object.keys(w).filter(key => typeof w[key] !== 'number');
		if (bad_keys === 0) return;
		err += '; these keys were not: ' + bad_keys.join(' ');
	}

	throw new Error(err);
}

function processConf(rows_or_conf) {
	if (typeof rows_or_conf !== 'object') throw new Error('tabulate parameter is ' + typeof rows_or_conf);
	var conf;
	if (Array.isArray(rows_or_conf)) {
		conf = {rows: rows_or_conf};
	} else {
		conf = Object.assign({}, rows_or_conf);
	}

	if (!Array.isArray(conf.rows)) throw new Error('tabulate conf.rows must be an array of objects');

	if (conf.widths) {
		validateMapInts(conf.widths);
		// clone them; we're going to mutate conf.widths.
		conf.widths = Object.assign({}, conf.widths);
	} else conf.widths = {};

	if (conf.include) {
		conf.include = unpackFlagSet(conf.include);
		if (conf.exclude) throw new Error('tabulate conf does not support having both include and exclude');

		if (Object.keys(conf.widths).length === 0) {
			Object.keys(conf.include).map(key => {
				conf.widths[key] = 1;
			});
		}
	} else if (conf.exclude) {
		conf.exclude = unpackFlagSet(conf.exclude);
	}

	if (conf.color && typeof conf.color !== 'function') throw new Error('tabulate conf.color must be a function');
	conf.color = conf.color || (val => val == null ? '\x1b[2m' : false);

	return conf;
}

function stringify(val) {
	if (val && typeof val === 'object') val = JSON.stringify(val);
	return val + '';
}

module.exports = function(rows_or_conf) {
	var conf = processConf(rows_or_conf);

	// get final widths
	conf.rows.map(row => {
		Object.keys(row).map(key => {
			var val = stringify(row[key]);
			conf.widths[key] = Math.max(conf.widths[key]||0, key.length, val.length);
		});
	});

	var cols = Object.keys(conf.widths);

	// print title
	var vsep = '+';
	var titles = '|';
	cols.map(col => {
		if (conf.include) {
			if (!conf.include[col]) return;
		} else if (conf.exclude) {
			if (conf.exclude[col]) return;
		}

		var len = conf.widths[col] + 2;
		vsep += '-'.repeat(len) + '+';
		while (col.length < len) {
			col += ' ';
			if (col.length < len) col = ' ' + col;
		}
		titles += col + '|';
	});
	vsep += '\n';
	titles += '\n';

	var printout = vsep + titles + vsep;
	// LOOP
	conf.rows.map(row => {
		var line = '|';
		cols.map(key => {
			if (conf.include) {
				if (!conf.include[key]) return;
			} else if (conf.exclude) {
				if (conf.exclude[key]) return;
			}
			var width = conf.widths[key] + 1;
			var val = row[key];
			var prefix = conf.color(val, key, row);
			val = stringify(val);
			var trailer = ' '.repeat(width-val.length) + '|';
			if (prefix) val = prefix + val + "\x1b[0m";
			line += ' ' + val + trailer;
		});
		printout += line + '\n';
	});
	printout += vsep;
	return printout;
};
