var util = require('util')
  , wu = require('wu').wu
  , unif = require('./unification')
  , Generator = unif.Generator
  , Constraint = unif.Constraint

var evalParams = function(params,def,env,proc,rt) {
	if(params.length!=def.params.length) {
		throw new Error('params length mismatch (' + def.id + ')')
	}
	var out = {}
	for(var i=0; i<def.params.length; i++) {
		var prm = def.params[i]
		var val = params[i].eval(env,proc,rt)
		out[prm] = val
	}
	return out
}

var EventGenerator = function(path,evtId,params) {
	Generator.call(this)
	this.path = path
	this.evtId = evtId
	this.params = params
}
util.inherits(EventGenerator,Generator)
EventGenerator.prototype.unificationVars = function() {
	return wu(this.params).filter(function(prm) {
		return prm.type!=undefined && prm.type=='uvar'
	}).toArray()
}

var ProcessGenerator = function(path) {
	Generator.call(this)
	this.path = path
}
util.inherits(ProcessGenerator,Generator)
ProcessGenerator.prototype.unificationVars = function() {
	var out = []
	wu(this.path.path).each(function(p) {
		var uvs = wu(p.params||[]).filter(function(prm) {
			return prm.type&&prm.type=='uvar'
		}).toArray()
		out = out.concat(uvs)
	})
	return out
}

var Condition = function(path,evtId,params,as) {
	EventGenerator.call(this,path,evtId,params)
	this.as = as
}
util.inherits(Condition,EventGenerator)
Condition.prototype.load = function(s) {
	// console.log('loading condition',this.evtId,this.params)
	this._isExcluded = false
	var procs = this.path.eval(s.env,s.proc,s.rt)
	if(procs.length == 0) {return []}
	var evtDef = procs[0].def.components[this.evtId]
	for (var i = 0; i < this.params.length; i++) {
		var prm = this.params[i]
		if(prm.type&&prm.type=='uvar') {
			prm.id = evtDef.params[i]
		}
	};
	var prms = this.params.length>0 ? evalParams(this.params,evtDef,this.stack.env,this.stack.proc,this.stack.rt) : null
	var out = []
	var isExcluded = 0
	// console.log('prms',prms)
	wu(procs).each(function(parent) {
		if(!parent.state.isIncluded(evtDef.id)) {
			isExcluded++
		} else {
			out = out.concat(parent.state.getExecuted(evtDef.id,prms))
		}
	})
	if(isExcluded==procs.length) {
		// console.log('condition excluded!')
		this._isExcluded = true
	}
	// console.log('loaded',out)
	return out
}
Condition.prototype.isExcluded = function() {
	return this._isExcluded!==undefined && this._isExcluded==true
}

var MilestoneProc = function(path,as) {
	ProcessGenerator.call(this,path)
	this.as = as
}
util.inherits(MilestoneProc,ProcessGenerator)
MilestoneProc.prototype.load = function(s) {
	var procs = this.path.eval(s.env,s.proc,s.rt)
	return wu(procs).filter(function(proc) {
		return proc.accepting()
	}).map(function(proc){return proc.state.store}).toArray()
	//what a pain..I need to get the indexes of the unif.vars..
	//	solved, put the id of the uvar in procpath --might want a better
	//	solution, though
}
MilestoneProc.prototype.isExcluded = function() {
	//might probably think better about this..
	return false
}

var Milestone = function(path,evtId,params) {
	Constraint.call(this,'Milestone(Event)')
	this.path = path
	this.evtId = evtId
	this.params = params
}
util.inherits(Milestone,Constraint)
Milestone.prototype.eval = function(env,proc,rt) {
	var procs = this.path.eval(env)
	if(procs.length==0) {return false}
	var evtDef = procs[0].components[this.evtId]
	var prms = this.params.length>0 ? evalParams(this.params,evtDef,env,proc,rt) : null
	for (var i = 0; i < procs.length; i++) {
		var parent = procs[i]
		if(!parent.state.isResponse(this.evId,prms) ||
			!parent.state.isIncluded(this.evId,prms)) {
			return true
		}
	}
	return false
}

module.exports = {
	Condition: Condition,
	Milestone: Milestone,
	Accepting: MilestoneProc
}