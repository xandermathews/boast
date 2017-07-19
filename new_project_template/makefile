dev: npm
	npm start
	# http://localhost:8080/ is the app
	# http://localhost:8080/app adds refresh
	# http://localhost:8080/webpack-dev-server/app adds compile message bar

prod: npm
	# https://webpack.js.org/guides
	npm run build
prod-watch:
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
