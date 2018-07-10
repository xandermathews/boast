"use strict";

function gen(key, attrs, parent) {
    key = key || 'div';
    attrs = attrs || {};

    key = key.split('/');
    if (key.length > 1) {
        var node = gen(key.shift(), null, parent);
        while (key.length > 1) {
            node = node.gen(key.shift());
        }
        return node.gen(key.shift(), attrs);
    }

    key = key[0].split('.');
    var tag = key[0] || 'div';
    key.shift();
    if (key.length) attrs.class = key.join(' ');
    var ele = $('<'+tag+'>', attrs);
    if (parent) ele.appendTo($(parent));
    ele.gen = function(key, attrs) {
        var child = gen(key, attrs, ele);
        if (child[0].tagName === 'TABLE') {
            child.horizontalRecords = function(schema, list) {
                var data_keys = [];
                var header = child.gen('tr');

                var col_names = Object.keys(schema);
                col_names.forEach(k => {
                    data_keys.push(schema[k]);
                    header.gen('th', {text: k});
                });

                var max = Math.floor(Math.random() * 6) + 1;
                for (var i = 0; i < max; ++i)
                list.map(row => {
                    var tr = child.gen('tr');
                    col_names.map(name => {
                        var data_key = schema[name];
                        tr.gen('td', {text: row[data_key]});
                    });
                });
            };

            child.verticalRecord = function(tup) {
                Object.keys(tup).filter(k => tup[k] != undefined).map(k => {
                    var tr = child.gen('tr');
                    tr.gen('td', {text: k});
                    tr.gen('td', {text: tup[k]});
                });
                return child;
            };
        }
        return child;
    };
    return ele;
}


