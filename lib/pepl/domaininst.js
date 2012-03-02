var util = require('util')
  , events = require('events')
  , wu = require('wu').wu
  , domain = require('./domain')
  , domp = require('./domainproc')
  , Component = domain.Component
  , Process = domp.Process
  , Event = require('./domainevt').Event
  , State = require('./procstate').State

var _uuid = 0
var ProcessInstance = function(def,scope,params) {
	this.def = def
	this.scope = scope
	//this.params = params
	this.uuid = (++_uuid)
	this.state = new State(this,params)
	this.killed = false
	wu(def.components).each(function(component) {
		if(component[1] instanceof Event) {
			component[1].onNewInstance(this)
		}
	},this)
}
ProcessInstance.prototype.match = function(boundPattern) {
	if(this.def.abstract==false) {return true}
	for(var i in this.state.store) {
		if(!boundPattern[i] || !boundPattern[i].match(this.state.store[i])){
			return false
		}
	}
	return true
}

ProcessInstance.prototype.execute = function(evtId,data,runtime) {
	var evtDef = this.def.definition(evtId)
	return evtDef.execute(data,this,runtime)
}
ProcessInstance.prototype.accepting = function() {
	if(this.killed==true) {return true}
	return this.state.isAccepting() && 
		wu(this.def.components).filter(function(c) {
			return (c[1].components != undefined)
		},this).map(function(fld) {
			return fld[1]
		},this).map(function(procDef) {
			return procDef.instancesOf(this)
		},this).all(function(procs) {
			return procs.length==0 || procs.all(function(proc) {
				return proc.accepting()
			},this)
		},this)
}
ProcessInstance.prototype.kill = function() {
	wu(this.def.components)
		.filter(function(comp) {
			return comp[1].components != undefined
		})
		.map(function(comp) {return comp[1]})
		.each(function(proc) {
			proc.instancesOf(this).each(function(p) {
				p.kill()
			})
		},this)
	this.def.killInstance(this)
	this.killed=true
}


module.exports.ProcessInstance = ProcessInstance