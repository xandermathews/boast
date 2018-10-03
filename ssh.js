
var ch = require('child_process');
var q = require('q');

var verbose = 0;
// 1: print action headers
// 2: show rsync progress
// 3: print all close values

function promiseExit(child, resultFunc) {
	var def = q.defer();
	child.on('exit', (code, sig) => {
		if (code) def.reject({code, sig}); // note that we don't resolve here -- either place can fail it, but only close can pass it.
	});
	child.on('close', (code, sig) => {
		if (code) def.reject({code, sig});
		else def.resolve(resultFunc ? resultFunc() : undefined);
	});
	return def.promise;
}

exports.verbosity = function(t) { verbose = t; };

function logAll(child) {
	if (verbose >= 3) {
		child.on('message', (...args) => {
			console.log("message:", args);
		});
		child.on('close', (code, sig) => {
			console.log("close:", {code, sig});
		});
		child.on('exit', (code, sig) => {
			console.log("exited:", {code, sig});
		});
	}
}

// opts is an array: opts[0] is the hostname, the rest is run on the remote side:
// passes tests:
// ssh.exec(host, 'echo i am $HOSTNAME;sleep 3 ; echo i am ready');
// ssh.exec(host, 'echo', 'i am', '$HOSTNAME', ';sleep 3', ';echo ready');
// ssh.exec(root, `eval echo f >> ff`);
exports.exec = function(host, cmd, stdout) {
	var opts = {};
	if (stdout) opts.stdio = 'inherit';
	if (verbose) console.log(`\nexec(${host}, ${cmd})`);
	var child = ch.spawn('ssh', [host, cmd], opts);
	var buffer = '';
	logAll(child);
	if (stdout) return promiseExit(child);

	var StringDecoder = require('string_decoder').StringDecoder;
	var decoder = new StringDecoder('utf8');
	child.stdout.on('data', chunk => {
		var msg = decoder.write(chunk);
		buffer += msg;
		if (verbose) console.log("data:", msg);
	});
	return promiseExit(child, () => buffer);
};

// script is a local filename, that'll be rsynced to host as a mktemp, and that mktemp will be used as cmd name remotely
// example:
// var out = await ssh.script(root, 'foo.sh', 'greeble');
exports.script = async function(host, script, opts) {
	if (verbose) console.log(`\nscript(${host}, ${script}, ${opts})`);
	var tmp = await exports.exec(host, 'mktemp');
	tmp = tmp.trim();
	if (verbose >= 3) console.log("mktemp =", tmp);
	await exports.deploy(host, script, tmp);
	var cmd = tmp;
	if (opts && opts.length) {
		if (Array.isArray(opts)) opts = opts.join(' ');
		cmd += ' ' + opts;
	}
	var res = await exports.exec(host, cmd);
	await exports.exec(host, 'rm ' + tmp);
	return res;
};

/*
host can include a username: root@server
paths can be files or dirs -- these will be interpreted by rsync, so be aware of trailing slashes.
local_path supports ~/ but not named "~user/"
*/
exports.deploy = function(host, local_path, remote_path) {
	if (local_path.match(/^~\//)) local_path = process.env.HOME + local_path.substr(1);
	if (verbose) console.log(`\ndeploy(${host}, ${local_path}, ${remote_path})`);
	var opts = {};
	if (verbose >= 2) opts.stdio = 'inherit';
	var child = ch.spawn('rsync', ['--verbose','--archive','-H','--partial','--progress','--chmod=Dg+s,Du+x,u+rw','--no-o','--no-g','--no-whole-file', local_path, host+':'+remote_path], opts);

	logAll(child);
	return promiseExit(child);
};
