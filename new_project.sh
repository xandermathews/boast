#!/bin/bash -e

NVM_VERSION=0.33.2 # see https://github.com/creationix/nvm
NODE_VERSION=v6.11.0

export NVM_DIR=${NVM_DIR:-~/.nvm}

die() {
	echo FAIL: "$*"
	exit 1
}
must_exist() {
	local tool
	for tool; do
		[[ -x $(which $tool) ]] || die "$tool is not in path"
	done
}
check_exist() {
	local tool
	for tool; do
		[[ -x $(which $tool) ]] || return 1
	done
	return 0
}
check_version() {
	check_exist $1 && [[ $($1 --version) =~ $2 ]]
}
all_yes=0
confirm() {
	((all_yes)) && return
	echo about to install $1. 'continue? [Yna] (yes, no, all-yes)'
	local ans
	read ans
	case $ans in
		(a)
			all_yes=1
			return
		;;
		(''|y|Y)
			return
		;;
	esac
	exit
}

must_exist curl

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
	confirm nvm
	curl -o- https://raw.githubusercontent.com/creationix/nvm/v$NVM_VERSION/install.sh | bash
	[[ -s "$NVM_DIR/nvm.sh" ]] || die "nvm install"
fi

. "$NVM_DIR/nvm.sh"

if ! check_version node $NODE_VERSION; then
	confirm node
	nvm install --lts
	nvm use --lts
	nvm alias default stable
fi

project=${0%.sh}.js
if [[ ! -f package.json ]]; then
	npm init -y || exit 1
	if [[ -f $project ]]; then
		sed "s|index.js|$project|" -i package.json
	fi
fi

if [[ ! -d node_modules ]]; then
	npm install --save-dev --save-exact --legacy-bundling webpack webpack-dev-server css-loader style-loader
fi

if [[ -f $project ]]; then
	node $project
else
	sed -e '1,/^#SERVER.JS/d' $0 > $project
	node $project
	rm $project
fi
exit
#SERVER.JS
"use strict";
console.log("server platform installed");
