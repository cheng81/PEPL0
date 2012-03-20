var util = require('util')
  , events = require('events')
  , wu = require('wu').wu
  , domain = require('./domain')
  , preds = require('./predicates')
  , Component = domain.Component

var Part = function(def,guard,actions,isContingency) {
	this.def = def
	this.parent = def
	this.guard = guard || function() {return true}
	this.actions = actions || []
	this.isContingency = isContingency || false
}
Part.prototype.match = function(env,procInst,runtime) {
//	if(!this.guard) {return true}
	return this.guard.eval(env,procInst,runtime)
}

var Event = function(_parent,_id,_params,annotations) {
	Component.apply(this,wu.toArray(arguments))
	this.parts = []
	this.annotations = annotations
	wu(this.annotations).each(function(annot) {annot.setEvent(this)},this)
	this.defPart = null
}
util.inherits(Event,Component)

Event.prototype.onNewInstance = function(proc) {
	for (var i = 0; i < this.annotations.length; i++) {
		this.annotations[i].onNewInstance(proc)
	}
}
Event.prototype.define = function(part) {
	this.parts.push(part)
}
Event.prototype.makePart = function(guard,actions) {
	var out = new Part(this,guard,actions)
	this.define(out)
	return out
}
Event.prototype.makeDefaultPart = function(actions,isContingency) {
	this.defPart = new Part(this,null,actions,isContingency)
	return this.defPart
}
Event.prototype.getPart = function(env,data,procInst,runtime) {
	if(!(procInst.state.isIncluded(this,data))){
		//console.log('event not included')
		if(data.__meta&&data.__meta.auto!=undefined&&data.__meta.auto==true) {
			console.log('auto response excluded, add response')
			procInst.state.addAutoResponse(this,data)
			return null
		} else if(this.defPart&&this.defPart.isContingency) {
			return this.defPart
		} else {
			return null
		}
	}
	for (var i = 0; i < this.parts.length; i++) {
		var p = this.parts[i]
		if(p.match(env,procInst,runtime)){return p}
	}
	if(this.defPart!=null) {return this.defPart}
	return null
}
Event.prototype.execute = function(data,procInst,runtime) {
	var ctxt = {}
	var env = {
		_ctxt: ctxt,
		lookup: mkLookup(data,ctxt,procInst,false),
		define: function(id,val) {
			ctxt[id]=val
		},
		isDefined: mkLookup(data,ctxt,procInst,true)
	}
	var part = this.getPart(env,data,procInst,runtime)
	if(part) {
		if(part.isContingency==false) {
			procInst.state.addExecuted(this,data)
			procInst.state.removeResponses(this,data)
		}
		wu(part.actions).each(function(action) {
			action.perform(env,procInst,runtime)
		})
		return true
	} else {
		return false
	}
}



var mkLookup = function(data,ctxt,procInst,testOnly) {
	
	if(testOnly) {
		return function(id) {
			if(data[id]!=undefined) {return true}
			if(ctxt[id]!=undefined) {return true}
			var scope = procInst
			while(scope != null && scope != undefined) {
				if(scope.state && scope.state.store[id]!=undefined) {return true}
				scope = scope.scope
			}
			return false
		}
	}
	return function(id) {
		//first search in data passed to the event
		if(data[id]!=undefined) {return data[id]}
		//then in the execution context
		if(ctxt[id]!=undefined) {return ctxt[id]}
		//as a last resort, search in the store of
		//the container process hierarchy
		var scope = procInst
		while(scope != null && scope!=undefined) {
			if(scope.state && scope.state.store[id]!=undefined) {return scope.state.store[id]}
			scope = scope.scope
		}
		//if it can't be found, throw an exception
		throw 'Cannot find value ' + id
	}
}

var Annotation = function(params) {
	this.evtDef = null
	this.params = params
}
Annotation.prototype.setEvent = function(evtDef) {
	this.evtDef = evtDef
}
Annotation.prototype.onNewInstance = function(proc) {
	throw 'Annotation subclasses must implements onNewInstance'
}

var Must = function() {
	Annotation.call(this)
}
util.inherits(Must,Annotation)
Must.prototype.onNewInstance = function(proc) {
	var predicates = {}
	for(var i=0;i<this.evtDef.params.length;i++) {
		predicates[this.evtDef.params[i]] = preds.Any
	}
	proc.state.addResponse(this.evtDef,predicates)
}

var Excluded = function() {
	Annotation.call(this)
}
util.inherits(Excluded,Annotation)
Excluded.prototype.onNewInstance = function(proc) {
	proc.state.included[this.evtDef.id].none()
}

module.exports.Event = Event
module.exports.annotations = {
	Must: Must,
	Excluded: Excluded
}