var util = require('util')
  , events = require('events')
  , wu = require('wu').wu
  , domain = require('./domain')
  , ProcessInstance = require('./domaininst').ProcessInstance

var Process = function(_parent,_id,_params) {
	domain.Component.apply(this,wu.toArray(arguments))
	this.abstract = (this.params.length>0)
	this.components = {}
	this.instances = {}
}
util.inherits(Process,domain.Component)

Process.prototype.define = function(component) {
	this.components[component.id] = component
}
Process.prototype.definition = function(compid) {
	if(!this.components[compid]) {throw 'Component ' + this.id + '.' + compid + ' could not be found'}
	return this.components[compid]
}

Process.prototype.lookupDef = function(compid) {
	if(this.id == compid) {return this}
	for (var i = 0; i < this.components.length; i++) {
		var c = this.components[i]
		if(c.id == compid) {return cid}
	}
}

Process.prototype.killInstance = function(instance) {
	delete(this.instances[instance.uuid])
	this.runtime().killed(instance.uuid)
}

Process.prototype.instancesOf = function(scopeParent) {
	return wu(this.instances).filter(function(inst) {
		return inst[1].scope.uuid==scopeParent.uuid
	}).map(function(i) {return i[1]})
}
Process.prototype.getInstances = function(scopeParent,pattern) {
	var flt = function(el) {
		return el[1].scope.uuid==scopeParent.uuid && el[1].match(pattern)
	}
	var m = wu(this.instances).filter(flt).map(function(el) {return el[1]}).toArray()
	if( m.length==0 && this.abstract==false) { //auto construction
		//make an instance right here, right now
		return [this.makeInstance(scopeParent)]
	} else {
		return m
	}
}
Process.prototype.makeInstance = function(scopeParent,params) {
	var inst = new ProcessInstance(this,scopeParent,params)
	this.instances[inst.uuid] = inst
	this.runtime().created(inst)
	return inst
}

module.exports.Process = Process