#!/bin/bash -e

NVM_VERSION=0.33.2 # see https://github.com/creationix/nvm
NODE_VERSION=v6.11.0

export NVM_DIR=${NVM_DIR:-~/.nvm}

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
	curl -o- https://raw.githubusercontent.com/creationix/nvm/v$NVM_VERSION/install.sh | bash
fi

. "$NVM_DIR/nvm.sh"

if ! [[ $(node --version) =~ $NODE_VERSION ]]; then
	nvm install --lts
	nvm use --lts
	nvm alias default stable
fi

if [[ ! -x node_modules/.bin/webpack ]]; then
	npm install --legacy-bundling
fi
