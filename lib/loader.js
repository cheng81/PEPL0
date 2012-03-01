var util = require('util')
  , fs = require('fs')
  , wu = require('wu').wu
  , pepl = require('./pepl')

var Loader = function(runtime) {
	this.runtime = runtime || pepl.bootLog()
}
Loader.prototype.loadFile = function(file) {
	if(-1 == file.indexOf('.pepl')) {file = file + '.pepl'}
	if(file[0] != '/') {
		file = process.cwd() + '/' + file
	}
	var contents = fs.readFileSync(file,'utf8')
	var module = pepl.parser.parse(contents)
	module.setRuntime(this.runtime)
	return module
}
Loader.prototype.running = function() {
	var out = {}
	wu(this.runtime.instances).eachply(function(id,proc) {
		if(!out[proc.def.id]) {out[proc.def.id] = []}
		out[proc.def.id].push(id)
	})
	return out
}
Loader.prototype.execute = function(procId,evId,data) {
	return this.runtime.execute(procId,evId,data || {})
}

module.exports.Loader = Loader