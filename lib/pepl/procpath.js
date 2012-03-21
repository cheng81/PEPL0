var util = require('util')
  , wu = require('wu').wu
  , Process = require('./domainproc').Process
  , ProcessInstance = require('./domaininst').ProcessInstance

var Path = function(path) {
	this.path = path
}
Path.prototype.eval = function(env,proc,rt) {
	//need to go up and search for this.path.shift()
	var out = searchUp(this.path[0],env,proc,rt)
	//..then walk the rest of the path
	for(var i=1;i<this.path.length;i++) {
		if(out.length==0) {return []}
		out = searchIn(this.path[i],out,env,proc,rt)
	}
	return out
}

var PathTo = function(path,to) {
	this.path = path || []
	this.to = to
	if(!this.to.procId) {
		if(this.to.evId) {this.to.procId=this.to.evId}
		else throw 'PathTo to needs field procId or evId'
	}
}
PathTo.prototype.eval = function(env,proc,rt) {
	if(this.path.length==0) {
		//need to go up and search for this.to definition
		return searchUp(this.to,env,proc,rt,true)
	} else {
		//need to go up and search for this.path.shift()
		var out = searchUp(this.path[0],env,proc,rt)
		//..then walk the rest of the path
		for(var i=1;i<this.path.length;i++) {
			if(out.length==0) {return []}
			out = searchIn(this.path[i],out,env,proc,rt)
		}
		return out
	}
}


function resolveParams(names,exprs,env,proc,rt) {
	if(names.length != exprs.length) {
		throw 'Cannot resolve parameters, arga number mismatch ' + names.length + ' != ' + exprs.length
	}
	var out = {}
	for (var i = 0; i < names.length; i++) {
		out[names[i]] = exprs[i].eval(env,proc,rt)
		if(exprs[i].type&&exprs[i].type=='uvar') {
			exprs[i].id = names[i]
		}
	}
	return out
}
function resolveParentInstance(parentDef,proc) {
	if(parentDef.singleton) {
		//must be Module or, in the future, Runtime
		return parentDef.singleton
	}
	var scope = proc
	while(scope != null && (scope.def.id!=parentDef.id)) {
		scope = scope.scope
	}
	if(scope==null) {
		throw 'Cannot find enclosing instance of ' + parentDef.id + ' from process instance ' + proc.def.id
	}
	return scope
}
function searchIn(pathToken,parents,env,proc,rt) {
	var out = []
	var def = parents[0].def.components[pathToken.procId]
	if(!def) {
		throw 'Cannot find definition of process ' + pathToken.procId + ' in process ' + parents[0].def.id
	}
	var prms = resolveParams(def.params,pathToken.params,env,proc,rt)
	wu(parents).each(function(parent) {
		out = out.concat( def.getInstances(parent,prms) )
	})
	return out
}
function searchUp(pathToken,env,proc,rt,searchOnlyDef) {
	if(pathToken.type&&pathToken.type=='var') {
		return env.lookup(pathToken.val)
	}
//	console.log('SearchUp - ',pathToken)
	var procId = pathToken.procId
	var params = pathToken.params || []
//	console.log('Lookup for ',procId,' from ',proc.def.id)
	if(params.length==0 && env.isDefined(procId)) {
		var p = env.lookup(procId)
		if(p instanceof Array && p[0] instanceof ProcessInstance) { return p }
	}
	parent = proc.def

	while(!parent.components[procId]) {
//		console.log(procId,' not found in ',parent.id)
		parent = parent.parent
		if(parent==null) {break}
//		console.log('Is into ',parent.id,'? ',(parent.components[procId]) ? 'yep' : 'no' )
	}
//	console.log('ProcessId sought is ',procId)
	if(parent==null) {
		throw new Error('Cannot find definition of process ' + procId + ' in process ' + proc.def.id)
	}
	var procDef = parent.components[procId]
	var parentInst = resolveParentInstance(parent,proc)
	if(searchOnlyDef) {return [parentInst]}
	var prms = resolveParams(procDef.params,params,env,proc,rt)
	return procDef.getInstances(parentInst,prms)
}

module.exports.Path = Path
module.exports.PathTo = PathTo