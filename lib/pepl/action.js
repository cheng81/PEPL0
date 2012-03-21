var util = require('util')
  , events = require('events')
  , wu = require('wu').wu
  , domain = require('./domain')
  , Component = domain.Component
  , Process = require('./domainproc').Process
  , Event = require('./domainevt').Event
  , ProcessInstance = require('./domaininst').ProcessInstance
  , rt = require('./runtime')
  , unification = require('./unification')
  , isExcluded = unification.isExcluded
  , EXCLD = unification.EXCLD

var Action = function(t) {this.type=t; this.part=null}
Action.prototype.setPart = function(part) {
	this.part = part
}
Action.prototype.eval = function() {
	return this.perform.apply(this,wu.toArray(arguments))
}
Action.prototype.perform = function() {
	throw 'Action subclasses must implement the perform function'
}
Action.prototype.resolveParams = function(names,exprs,env) {
	var out = {}
	if(names.length != exprs.length){ throw 'argument number mismatch error' }
	for(var i=0;i<names.length;i++) {
		var id = names[i]
		var val = exprs[i].eval(env)
		if(isExcluded(val)) {return EXCLD}
		out[id] = val
	}
	return out
}
// Action.prototype.lookupProcessInstances = function(def,path,env,procInst,runtime) {
// 	if(!def instanceof Process && procInst.def.components[def]) {
// 		def = procInst.def.components[def]
// 	}
// 	if(def.parent instanceof rt.Module) {return [def.parent]}
// 	//if(def.parent.abstract==false) {return def.parent.getInstances(procInst)} //?
// 	return path.eval(env,procInst,runtime)
// }

var New = function(path,id,params) {
	Action.call(this,'New')
	this.path = path
	this.id = id
	this.params = params
}
util.inherits(New,Action)
New.prototype.perform = function(env,proc,rt) {
	var parents = this.path.eval(env,proc,rt)
	var out = []
	if(parents.length>0) {
		//console.log(parents[0],parents[0].def)
		var def = parents[0].def.components[this.id]
		var prms = this.resolveParams(def.params,this.params,env,proc,rt)
		if(!isExcluded(prms)) {
			wu(parents).each(function(parent) {
				out.push(def.makeInstance(parent,prms))
			})
		}
	}
	return out
}

// var New = function(path,def,params){
// 	Action.call(this,'New')
// 	this.path = path
// 	this.def = def
// 	this.params = params
// 	if(this.path==null||this.path.length==0) {
// 		this.path = {eval:function(_e,proc,_r) {return [proc]}}
// 	}
// }
// util.inherits(New,Action)
// New.prototype.perform = function(env,procInst,runtime) {
// 	var parents = this.lookupProcessInstances(this.def,this.path,env,procInst,runtime)
// 	var prms = this.resolveParams(this.def.params,this.params,env)
// 	if(!this.def instanceof Process && parents.length>0) {
// 		this.def = parents[0].def.components[this.def]
// 	}
// 	wu(parents).each(function(parent) {
// 		//new ProcessInstance(this.def,parent,prms)
// 		this.def.makeInstance(parent,prms)
// 	},this)
// }

var Response = function(path,id,params,isAuto) {
	Action.call(this,'Response')
	this.path = path
	this.id = id
	this.params = params
	this.isAuto = isAuto
}
util.inherits(Response,Action)
Response.prototype.perform = function(env,proc,rt) {
	var parents = this.path.eval(env,proc,rt)
	if(parents.length>0) {
		var def = parents[0].def.components[this.id]
		var prms = this.resolveParams(def.params,this.params,env,proc,rt)
		if(!isExcluded(prms)) {
			wu(parents).each(function(parent) {
				if(this.isAuto==true) {
					rt.queue(parent.uuid,def.id,prms)
				} else {
					parent.state.addResponse(def,prms)
				}
			},this)
		}
	}
}

// var Response = function(path,evtDef,params,isAuto) {
// 	Action.call(this,'Response')
// 	this.path = path
// 	this.def = evtDef
// 	this.params = params
// 	this.isAuto = isAuto
// 	if(this.path==null||this.path.length==0) {
// 		this.path = {eval:function(_e,proc,_r) {return [proc]}}
// 	}
// }
// util.inherits(Response,Action)
// Response.prototype.perform = function(env,procInst,runtime) {
// 	var parents = this.lookupProcessInstances(this.def,this.path,env,procInst,runtime)
// 	var prms = this.resolveParams(this.def.params,this.params,env)

// 	wu(parents).each(function(parent) {
// 		if(this.isAuto==true) {
// 			runtime.queue(parent.uuid,this.def.id,prms)
// 		} else {
// 			parent.state.addResponse(this.def.id,prms)
// 		}
// 	},this)
// }

var Exclude = function(path,id,params,isSuper) {
	Action.call(this,'Exclude')
	this.path = path
	this.id = id
	this.params = params
	this.isSuper = isSuper
}
util.inherits(Exclude,Action)
Exclude.prototype.perform = function(env,proc,rt) {
	if(this.isSuper) {proc.kill(); return}

	var parents = this.path.eval(env,proc,rt)
	if(parents.length>0) {
		if(this.params.length==0) {
			wu(parents).each(function(parent) {
				parent.state.included[this.id].none()
			},this)
		} else {
			var def = parents[0].def.components[this.id]
			var prms = this.resolveParams(def.params,this.params,env,proc,rt)
			if(!isExcluded(prms)) {
				wu(parents).each(function(parent) {
					parent.state.included[this.id].exclude(prms)
				},this)
			}
		}
	}
//	throw 'normal exclude behavior not yet implemented (poker face)'
}
// var Exclude = function(path,evtDef,params,isSuper) {
// 	Action.call(this,'Exclude')
// 	this.path = path
// 	this.def = evtDef
// 	this.params = params
// 	this.isSuper = isSuper
// }
// util.inherits(Exclude,Action)
// Exclude.prototype.perform = function(env,procInst,runtime) {
// 	if(this.isSuper) {procInst.kill(); return}

// 	var parents = this.lookupProcessInstances(this.def,this.path,env,procInst,runtime)
// 	var prms = this.resolveParams(this.def.params,this.params,env)

// 	wu(parents).each(function(parent) {
// 		throw 'normal exclude behavior not yet implemented (poker face)'
// 	})
// }
var Include = function(path,id,params) {
	Action.call(this,'Include')
	this.path = path
	this.id = id
	this.params = params
}
util.inherits(Include,Action)
Include.prototype.perform = function(env,proc,rt) {
	var parents = this.path.eval(env,proc,rt)
	if(parents.length>0) {
		if(this.params.length==0) {
			wu(parents).each(function(parent) {
				parent.state.included[this.id].all()
			},this)
		} else {
			var def = parents[0].def.components[this.id]
			var prms = this.resolveParams(def.params,this.params,env,proc,rt)
			if(!isExcluded(prms)) {
				wu(parents).each(function(parent) {
					parent.state.included[this.id].include(prms)
				},this)
			}
		}
	}

//	throw 'include behavior not yet implemented (poker face)'
}

var Let = function(id,expr) {
	Action.call(this,'Let')
	this.id = id
	this.expr = expr
}
util.inherits(Let,Action)
Let.prototype.perform = function(env,procInst,runtime) {
	//var val = this.expr.eval(env,procInst,runtime)
	env.define(this.id,this.expr.eval(env,procInst,runtime))	//is excluded, it should get the same EXCLD value
}



module.exports.New = New
module.exports.Response = Response
module.exports.Exclude = Exclude
module.exports.Include = Include
module.exports.Let = Let













