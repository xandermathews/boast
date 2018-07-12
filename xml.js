"use strict";

function handleList(xml, handlers, path) {
	var li = handleNode(xml, handlers, path);
	var out = [];
	Object.keys(li).map(k => {
		if (k === '#text') return;
		if (!Array.isArray(li[k])) {
			li[k] = [li[k]];
		}
		out = out.concat(li[k]);
	});
	return out;
}

function handleNode(xml, handlers, path) {
	var my_type = xml.nodeName;
	var out = {};
	var li = xml.childNodes;
	var valid = 0;

	for (var i = 0; i < li.length; ++i) {
		var child = li[i];
		var type = child.nodeName;
		var handler = handlers[type];
		if (handler === undefined) handler = handleNode;
		var val = handler(child, handlers, path.concat(type));
		if (val !== undefined) {
			++valid;
			if (out[type] !== undefined) {
				if (Array.isArray(out[type])) {
					out[type].push(val);
				} else {
					out[type] = [out[type], val];
				}
			} else {
				out[type] = val;
			}
		}
	}
	if (valid === 0) return '';
	if (valid === 1 && out['#text']) return out['#text'];
	return out;
}

function xml2js(xml, handlers) {
	var path = ['$'];
	if (typeof handlers === 'string') handlers = handlers.split(',');
	if (Array.isArray(handlers)) {
		var map = {};
		handlers.map(node => map[node] = handleList);
		handlers = map;
	}
	if (!handlers['#comment']) handlers['#comment'] = () => undefined;
	if (!handlers['#text']) handlers['#text'] = xml => {
		var str = xml.textContent.trim();
		var num = Number(str);
		if (str.length && Number.isFinite(num)) return num;
		return xml.textContent;
	}

	var handler = handlers[xml.nodeName];
	if (handler === undefined) handler = handleNode;
	return handler(xml, handlers, path);
}

function xmlVisitor(xml, hook, path) {
	path = path || ['$'];
	var li = xml.childNodes;
	for (var i = 0; i < li.length; ++i) {
		var child = li[i];
		if (child.nodeName === '#text') hook(path, child.textContent);
		else xmlVisitor(li[i], hook, path.concat(li[i].nodeName));
	}
}
