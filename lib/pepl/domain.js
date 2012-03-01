var util = require('util')
  , events = require('events')
  , wu = require('wu').wu
  , Module = require('./runtime').Module
 
var Component = function(parent,id,params) {
	this.parent = parent
	this.id = id
	this.params = params || []
	if(this.parent && this.parent.define) {
		//this.parent.components[this.id] = this
		this.parent.define(this)
	}

}
Component.prototype.module = function() {
	var p = this.parent
	while(p) {
		if(p instanceof Module) {return p}
		p=p.parent
	}
}
Component.prototype.runtime = function() {
	return this.module().runtime
}


module.exports.Component = Component