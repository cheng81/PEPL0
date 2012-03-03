var util = require('util')
  , readline = require('readline')
  , wu = require('wu').wu
  , pepl = require('./pepl')
  , gactions = require('./pepl/grammaractions')
  , ldr = require('./loader')
  , parser = pepl.parser
  , runtime = pepl.boot()

var loader = new ldr.Loader(runtime)
var rundir = process.cwd()
var rl = readline.createInterface(process.stdin,process.stdout)
var curmod = null

function getProc(pid) {
	if(env.isDefined(pid)) {
		return env.lookup(pid)
	}
	if(runtime.instances[pid]) {return runtime.instances[pid]}
	console.log('Process instance ',pid,' cannot be found')
	return null
}
var utils = {
	load: function(fname) {
		try {
			var mod = loader.loadFile(fname)
			mod.__fname = fname
			console.log('Loaded ',mod.namespace,' (',fname,')')
			curmod = mod
			var p = curmod.namespace + ' > '
			rl.setPrompt(p,p.length)
		} catch(e) {
			console.log('!Error',e)
			if(e.stack) {console.log(e.stack)}
		}
	},
	reload: function() {
		console.log('Reloading',curmod.namespace)
		curmod.kill()
		try {
			var fname = curmod.__fname
			curmod = loader.loadFile(fname)
			curmod.__fname = fname
		} catch(e) {
			console.log('!Error',e)
			if(e.stack) {console.log(e.stack)}
		}
	},
	ch: function(ns) {
		curmod = runtime.module(ns)
		var p = curmod.namespace + ' > '
		rl.setPrompt(p,p.length)
	},
	running: function() {
		console.log('Running processes:')
		console.log(loader.running())
	},
	state: function(pid) {
		var proc = getProc(pid)
		if(proc!=null) {
			if(proc.length) {
				wu(proc).each(function(p) {
					console.log(p.def.id,'[',p.uuid,']')
					console.log(p.state)
					console.log('-----')
				})
			} else {
				console.log(proc.def.id,'[',proc.uuid,']')
				console.log(proc.state)
			}
		}
	},
	accepting: function(pid) {
		var proc = getProc(pid)
		if(proc!=null) {
			if(proc.length) {
				wu(proc).each(function(p) {
					var accept = p.accepting()
					console.log(p.def.id,'[',p.uuid,'] : ',accept)
				})
			} else {
				var accept = proc.accepting()
				console.log(proc.def.id,'[',proc.uuid,'] : ',accept)
			}
			console.log('-----')
		}
	},
	kill: function(pid) {
		var proc = getProc(pid)
		if(proc!=null) {
			if(proc.length) {
				wu(proc).each(function(p) {p.kill()})
			} else {proc.kill()}
		}
	},
	parrot: function(args) {
		console.log.apply(console,args)
	}
}

var _env = {}
var env = {
	lookup: function(id) {
		if(_env[id]) {return _env[id]}
		console.log('Cannot find ',id,' in REPL environment')
		return null
	},
	define: function(id,val) {_env[id]=val},
	isDefined: function(id) {return _env[id]!=undefined}
}

var exe = 'exe'

rl.on('line', function(l) {
//	try {
	var line = l.trim()
	if(line.length==0){rl.prompt(); return}
	if(line==':q') {
		console.log('Bye!')
		process.exit(0)
	}
	if(line[0] == ':') {
		var spid = line.indexOf(' ')
		if(spid<0) {spid = line.length+1}
		var cmd = line.substr(1,spid-1)
		var args  = line.substr(spid+1).split(' ')
		if(utils[cmd]) {
			utils[cmd](args)	
		} else {
			console.log('Sorry, cannot understand command "',cmd,'"')
		}
		
	} else if(env.isDefined(line)) {
		console.log('== ',env.lookup(line))
	} else {
		try {
			var ev = parser.parse(line,'event')
			var proc = lookupProcess(ev)
			if(proc!=null) {
				var evDef = proc.def.components[ev.id]
				var prms = resolve(evDef,ev.params)
				try {
					runtime.execute(proc.uuid,ev.id,prms)
				} catch(relevant) {
					console.log('!Error ',relevant)
					if(relevant.stack) {console.log(relevant.stack)}
				}
			}
			rl.prompt()
			return
		} catch(e) {}

		try {
			var act = parser.parse(line,'actions')
			try {
				act[0].perform(env,curmod,runtime)
			} catch(relevant) {
				console.log('!Error ',relevant)
				if(relevant.stack) {console.log(relevant.stack)}
			}
			rl.prompt()
			return
		} catch(e) {}



		// if(0==line.indexOf(exe)) {
		// 	var evstr = line.substr(exe.length + 1)
		// 	var ev = parser.parse(evstr,'event')
		// 	var proc = lookupProcess(ev)
		// 	if(proc!=null) {
		// 		var evDef = proc.def.components[ev.id]
		// 		var prms = resolve(evDef,ev.params)
		// 		runtime.execute(proc.uuid,ev.id,prms)
		// 	}
		// } else {
		// 	var act = parser.parse(line,'actions')
		// 	act[0].perform(env,curmod,runtime)
		// }
		console.log('Sorry, I cannot understand "',line,'"')
	}
	// } catch(e) {
	// 	console.log('!Error - ',e)
	// }
	rl.prompt()
})

console.log('pepl0.0_REPL')
var prompt = ' > '
rl.setPrompt(prompt,prompt.length)
rl.prompt()

function resolve(def,exprs) {
	var out = {}
	if(def.params.length != exprs.length) {throw 'Param number exception'}
	for (var i = 0; i < def.params.length; i++) {
		var p = def.params[i]
		out[p] = exprs[i].eval(env,curmod,runtime)
	}
	return out
}

function lookupProcess(evStruct) {
	if(evStruct.varname) {
		out = env.lookup(evStruct.varname)
		if(out instanceof Array) {
			if(out.length>0) {return out[0]} else {return null}
		}
		return out
	}
//	console.log('Looking for parent process to execute ',util.inspect(evStruct,true,10))
	var path = evStruct.path.val
	var evId = evStruct.id

	var cur = curmod
	for (var i = 0; i < path.length; i++) {
		var pel = path[i]
		cur = search(cur,pel)
		if(cur==null) {
//			console.log('Suitable Process Instance cannot be found.')
			return null
		}
//		 else {
//			console.log('Found ',pel.procId,' instance - ',cur)
//		}
	}
	return cur
}

function search(parent,pathElm) {
	var procId = pathElm.procId
	var params = pathElm.params
	if(parent.def.components[procId]) {
		var procDef = parent.def.components[procId]
		var procs = procDef.getInstances(parent,resolve(procDef,params))
		return procs[0]
	} else {
		console.log('Cannot find ',procId,' definition in ',parent.id)
		return null
	}
}




