var util = require('util')
  , events = require('events')
  , wu = require('wu').wu

var Module = function(namespace) {
	this.namespace = namespace
	this.id = namespace
	this.uuid = namespace
	this.components = {}
	this.runtime = null
	var s = this
	this.def = {
		components: {},
		singleton: s,
		id: namespace
	}
}
Module.prototype.setRuntime = function(rt) {
	this.runtime = rt
	rt.define(this)
	wu(this.def.components).eachply(function(_id,component) {
		if(component.abstract == false) {
			component.getInstances(this)
		}

	},this)
}
Module.prototype.kill = function() {
	wu(this.components).each(function(comp) {
		if(comp[1].instances != undefined) {
			var insts = wu(comp[1].instances).map(function(i) {return i[1]}).toArray()
			wu(insts).each(function(inst) {
//				console.log('Killing instance',inst)
				inst.kill()
			},this)
		}
	},this)
}

Module.prototype.define = function(component) {
	this.def.components[component.id] = component
	this.components[component.id] = component
}
Module.prototype.definition = function(compid) {
	if(!this.def.components[compid]) {throw 'Component ' + this.id + '.' + compid + ' could not be found'}
	return this.def.components[compid]
}


var Runtime = function(log) {
	this.modules= {}
	this.instances = {}
	this._queue = []
	this.log = log || false
	this.em = new events.EventEmitter()
}
Runtime.prototype._l = function() {
	if(this.log==true) {
		console.log.apply(console,wu.toArray(arguments))
	}
}
Runtime.prototype.emit = function() {
	return this.em.emit.apply(this.em,wu.toArray(arguments))
}
Runtime.prototype.on = function() {
	return this.em.on.apply(this.em,wu.toArray(arguments))
}

Runtime.prototype.define = function(module) {
	if(!this.modules[module.namespace]) {
		this.modules[module.namespace] = module
	}
}
Runtime.prototype.module = function(namespace) {
	if(!this.modules[namespace]){ throw 'Module ' + namespace + ' could not be found' }
	return this.modules[namespace]
}

//queueing should really be hierarchical and module-based
//such that each module has its own local queue
//and perhaps at even finer granularity each process should have its own queue
Runtime.prototype.execute = function(procId,evtId,data,fromQueue) {
	if(!fromQueue && this._queue.length>0) {
		console.log('queueinq event execution: queue is not empty',this.queue(procId,evtId,data))
		return
	}
	//console.log('Trying to execute ',procId,'.',evtId,'<',util.inspect(data),'>',"\r\n",this.instances)
	if(!this.instances[procId]){ throw 'Process Instance ' + procId + ' could not be found' }
	this._l('executing ' + this.instances[procId].def.id + '[' + procId + '].' + evtId + ' - ' + util.inspect(data))
	var proc = this.instances[procId]
	if(proc.execute(evtId,data,this)) {
		this.emit('executed',{instance:procId,event:evtId,data:data})
	}

	if(this._queue.length>0) {
		var next = this._queue.shift()
		if(next.procId != undefined) {
			process.nextTick((function(t){return function(){t.execute(next.procId,next.evtId,next.data,true)}}(this)))
		} else {
			process.nextTick((function(t){return function(){
				var n = next.next()
				if(n != undefined && n!=null) {
					t.execute(n.procId,n.evtId,n.data,true)
				}
			}
			}(this)))
		}
		
	}
}
Runtime.prototype.queue = function(procId,evtId,data) {
	//console.log('queuing',procId,evtId,data)
	if(procId instanceof Function) {
		this._queue.push({next:procId})
	} else {
		this._queue.push({procId:procId,evtId:evtId,data:data})
	}
}
Runtime.prototype.created = function(proc) {
	this.instances[proc.uuid] = proc
	this.emit('created',{processDef:proc.def.id,instance:proc.uuid})
}
Runtime.prototype.killed = function(procId) {
	var defid = this.instances[procId].def.id
	delete this.instances[procId]
	this.emit('killed',{processDef:defid,instance:procId})
}

module.exports.Runtime = Runtime
module.exports.Module = Module