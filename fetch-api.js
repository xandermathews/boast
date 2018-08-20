"use strict";

window.api = {
	appendHeader(conf, key, val, force) {
		conf = conf || {};
		conf.headers = conf.headers || {};
		if (val != undefined) {
			if (force || conf.headers[key] === undefined) {
				conf.headers[key] = val;
			}
		}
		return conf;
	},

	get: function(path, conf, control) {
		if (arguments.length === 2 && typeof conf === 'string') {
			control = conf;
			conf = {};
		} else {
			control = control || {};
		}
		if (typeof control === 'string') {
			control = {formatter: control};
		}

		var needs_prefix = true;
		var prefix = api.base_url || '';
		if (path[0] === '/') prefix = '';
		if (path.match(/^https?:\/\//)) prefix = '';
		var url = (control.base_url || prefix) + path;

		switch (control.formatter) {
			case undefined:
				control.formatter = resp => {
					return resp.text().then(raw => {
						try {
							return JSON.parse(raw);
						} catch (e) {
							return raw;
						}
					});
				}
			break;
			case 'text':
				control.formatter = resp => resp.text();
			break;
		}

		conf = Object.assign({
			cache: 'no-cache',
			mode: 'cors',
			credentials: 'include'
		}, conf);

		api.appendHeader(conf, 'Accept', "application/json");
		api.appendHeader(conf, 'Authorization', api.authorization);

		return Q(fetch(url, conf)).then(response => {
			if (control.orig_body) conf.body = control.orig_body;
			return control.formatter(response).then(body => {
				var headers = {};
				for (var h of response.headers) {
					headers[h[0]] = h[1];
				}
				return { body, headers, code: response.status, response, request: {url, conf} };
			});
		}, error => {
			return { code: 0, body: {errors:[error]}, request: {url, conf}, headers: {} };
		}).then(normalized => {
			if (normalized.body && normalized.body.errors && normalized.body.errors.length) {
				throw normalized;
			}
			return normalized;
		});
	},

	post: function(path, body, conf, control) {
		if (arguments.length === 3 && typeof conf === 'string') {
			control = conf;
			conf = {};
		}
		conf = api.appendHeader(conf, "Content-Type", "application/json; charset=utf-8");
		conf.method = 'POST';
		if (body !== undefined) conf.body = body;
		if (typeof body === 'object') {
			conf.body = JSON.stringify(body);
			control = control || {};
			control.orig_body = body;
		}
		return api.get(path, conf, control);
	},

	postForm: function(path, body, conf, control) {
		if (arguments.length === 3 && typeof conf === 'string') {
			control = conf;
			conf = {};
		}
		conf = api.appendHeader(conf, "Content-Type", "application/x-www-form-urlencoded");
		return api.post(path, body, conf, control);
	}
};
