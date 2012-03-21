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
	// return this.guard.eval(env,procInst,runtime)
	this.guard.boot(env,procInst,runtime)
	if(this.guard.next()==true) {return true}
}
Part.prototype.next = function() {
	return this.guard.next()
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
	this.defPart.isDefault = true
	return this.defPart
}
Event.prototype.getPart = function(env,data,procInst,runtime) {
	if(!(procInst.state.isIncluded(this,data))){
		console.log('event not included')
		if(this.defPart&&this.defPart.isContingency) {
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
	var env = new Env(data,ctxt,procInst)
	// var env = (function() {
	// 		var _unif = {}
	// 		this.lookup = mkLookup(_unif,data,ctxt,procInst,false)
	// 		this.define = function(id,val) {ctxt[id]=val}
	// 		this.defineUnif = function(id,val) {_unif[id]=val}
	// 		this.clearUnif = function() {for(var i in _unif) {delete(_unif[i])}}
	// 		this.isDefined = mkLookup(_unif,data,ctxt,procInst,true)
	// 	}())

	// var env = {
	// 	_unif: {},
	// 	_ctxt: ctxt,
	// 	lookup: mkLookup(data,ctxt,procInst,false),
	// 	define: function(id,val) {
	// 		ctxt[id]=val
	// 	},
	// 	isDefined: mkLookup(data,ctxt,procInst,true)
	// }
	var part = this.getPart(env,data,procInst,runtime)
	if(part) {
		do {
			if(part.isContingency==false) {
				procInst.state.addExecuted(this,data)
				procInst.state.removeResponses(this,data)
			}
			wu(part.actions).each(function(action) {
				action.perform(env,procInst,runtime)
			})
			if(part.isDefault!=undefined&&part.isDefault==true) {break}
		} while(part.next())
		return true
	} else {
		return false
	}
}

var Env = function(data,ctxt,procInst) {
	this.data = data
	this.ctxt = ctxt
	this.procInst = procInst
	this.unif = {
		search: function() {return undefined}
	}
}
Env.prototype.define = function(id,val) {
	this.ctxt[id] = val
}
Env.prototype.setUnificationStack = function(stack) {
	this.unif = stack
}
Env.prototype._lookup = function(id) {
	var out = this.unif.search(id)
	if(out != undefined) {return out}
	if(this.data[id] != undefined) {return this.data[id]}
	if(this.ctxt[id] != undefined) {return this.ctxt[id]}
	var scope = this.procInst
	while(scope != null && scope != undefined) {
		if(scope.state && scope.state.store[id] != undefined) {return scope.state.store[id]}
		scope = scope.scope
	}
}
Env.prototype.isDefined = function(id) {
	return undefined != this._lookup(id)
}
Env.prototype.lookup = function(id) {
	var out = this._lookup(id)
	if(out==undefined) {throw new Error('Cannot find value '+id)}
	return out
}

// var mkLookup = function(unif,data,ctxt,procInst,testOnly) {
	
// 	if(testOnly) {
// 		return function(id) {
// 			if(unif[id]!=undefined) {return true}
// 			if(data[id]!=undefined) {return true}
// 			if(ctxt[id]!=undefined) {return true}
// 			var scope = procInst
// 			while(scope != null && scope != undefined) {
// 				if(scope.state && scope.state.store[id]!=undefined) {return true}
// 				scope = scope.scope
// 			}
// 			return false
// 		}
// 	}
// 	return function(id) {
// 		//search in unification vars
// 		if(unif[id]!=undefined) {return unif[id]}
// 		//search in data passed to the event
// 		if(data[id]!=undefined) {return data[id]}
// 		//then in the execution context
// 		if(ctxt[id]!=undefined) {return ctxt[id]}
// 		//as a last resort, search in the store of
// 		//the container process hierarchy
// 		var scope = procInst
// 		while(scope != null && scope!=undefined) {
// 			if(scope.state && scope.state.store[id]!=undefined) {return scope.state.store[id]}
// 			scope = scope.scope
// 		}
// 		//if it can't be found, throw an exception
// 		throw 'Cannot find value ' + id
// 	}
// }

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