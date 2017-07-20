dev: npm
	npm run dev
	# http://localhost:8080/ is the app
	# http://localhost:8080/app adds refresh
	# http://localhost:8080/webpack-dev-server/app adds compile message bar

build: npm
	# https://webpack.js.org/guides
	npm run build
build-watch:
	npm run build -- --watch

test:
	npm test

clean:
	rm -rvf dist
clean-dist: clean
	rm -rvf node_modules

npm: node_modules/.bin/webpack
node_modules/.bin/webpack:
	./infra/init_node.sh

ifndef VERBOSE
.SILENT:
endif
.PHONY: test
