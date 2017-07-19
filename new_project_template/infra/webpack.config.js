"use strict";

var exclude = /(node_modules|3rd_party)/;

module.exports = {
	entry: "./src/client.js",
	output: {
		path: __dirname + "/../dist",
		filename: "app.js"
	},
	module: {
		rules: [
			{ test: /\.css$/, loader: "style-loader!css-loader!less-loader" },
			{
				test: /\.js$/,
				exclude,
				enforce: 'pre',
				use: {
					loader: 'jshint-loader',
					options: { // http://jshint.com/docs/options/
						"node": true,
						"browser": true,
						"esnext": true,
						"bitwise": true,
						"curly": false,
						"eqeqeq": true,
						"immed": true,
						"latedef": true,
						"newcap": true,
						"noarg": true,
						"forin": false, // a little weak -- it only really checks that the first line of the body is an "if". moving "hasOwnProperty" responsibilities to the programmer.
						"freeze": true,
						"nonew": true,
						"regexp": true,
						"undef": true,
						"unused": "vars", // true also complains about unused trailing params, but those are often worth keeping as documentation of function signature.
						"strict": "global",
						"trailing": true,
						"smarttabs": true,
						"maxerr": 50,
						"globals": {
							"$": false,
							"Q": false,
							"moment": false,
						}
					}
				}
			},
			{
				test: /\.js$/,
				exclude,
				use: {
					loader: 'babel-loader',
					options: {
						presets: ['env']
					}
				}
			}
		]
	},
	devtool: "cheap-source-map"
};
