#!/bin/bash -x

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

must_exist curl

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
	curl -o- https://raw.githubusercontent.com/creationix/nvm/v$NVM_VERSION/install.sh | bash
	[[ -s "$NVM_DIR/nvm.sh" ]] || die "nvm install"
fi

. "$NVM_DIR/nvm.sh"

if [[ ! -x "$(which node)" || $(node --version) != $NODE_VERSION ]]; then
	nvm install --lts
	nvm use --lts
	nvm alias default stable
fi

node bootstrap.js
