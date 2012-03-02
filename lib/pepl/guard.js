
var util = require('util')
  , wu = require('wu').wu

/*
Guards should allow searching of values that makes the guard true, e.g.
Executed(foo<n,*>) as f & Executed(bar<*,f.snd>)

with def
foo<fst,snd>
bar<fst,snd>

and execution history
foo<1,2>
foo<1,3>
bar<4,3>

should match on foo<1,3>,bar<4,3> instead of failing!
moreover, it would be nice to allow pattern matching like
Executed(foo<n,?foosnd>) & Executed(bar<n,?foosnd>)

such that "?"-prefixed variables should first go into a "search-store",
allowing the guard to backtrack and look for other instances,
and then into the context (if a match is found)
*/

var Stack = function() {
	var uuid = 0
	var _madeindexes = {}
}
var Guard = function(generators,constraints,firstOnly) {
	this.firstOnly = firstOnly
	this.generators = generators
	this.constraints = constraints
}
Guard.prototype.populate = function(env,proc,rt) {
	var st = env.isDefined() ? env.lookup() : new Stack()
	var populated = false
	var idx = st.idx(this)
	while(!populated) {
		while(idx<this.generators.length) {
			var m = this.generators[idx]
			var res = m.next(env)
			if(res==true) {
				idx++
			} else {
				env.pop()
				if(idx==0) {
					return false
				}
				idx--
			}

		}
		if(this.checkConstraints(st)) {
			populated = true
			st.defineIn(env)
		}
	}
	st.idx(this,this.matches.length-1)

}


function first(ar,pred,ctxt) {
	for (var i = 0; i < ar.length; i++) {
		var el = ar[i]
		if(pred.call(ctxt,el)){ return el }
	}
	return null
}

var Guard = function(type) {
	this.type = type
	this.part = null
}
Guard.prototype.setPart = function(part) {
	this.part = part
}
Guard.prototype.eval = function(env,proc,rt) {
	throw 'Guard subclasses must implement eval'
}
Guard.prototype.evalParams = function(params,def,env,proc,rt) {
	if(params.length!=def.params.length) {
		throw 'Guard param length mismatch! ' + def.id
	}
	var out = {}
	for (var i = 0; i < def.params.length; i++) {
		var prm = def.params[i]
		var val = params[i].eval(env,proc,rt)
		out[prm] = val
	}
	return out
}

var And = function(fst,snd) {
	Guard.call(this,'And')
	this.fst = fst
	this.snd = snd
}
util.inherits(And,Guard)
And.prototype.eval = function(env,proc,rt) {
	return this.fst.eval(env,proc,rt) && this.snd.eval(env,proc,rt)
}

var Or = function(fst,snd) {
	Guard.call(this,'Or')
	this.fst = fst
	this.snd = snd
}
util.inherits(Or,Guard)
Or.prototype.eval = function(env,proc,rt) {
	return (this.fst.eval(env,proc,rt)) || (this.snd.eval(env,proc,rt))
}

var Not = function(guard) {
	Guard.call(this,'Not')
	this.guard = guard
}
util.inherits(Not,Guard)
Not.prototype.eval = function(env,proc,rt) {
	return !(this.guard.eval(env,proc,rt))
}

var Executed = function(path,evId,params,as) {
	Guard.call(this,'Executed')
	this.path = path
	this.evId = evId
	this.params = params
	this.as = as || false
}
util.inherits(Executed,Guard)
Executed.prototype.eval = function(env,proc,rt) {
	var procs = this.path.eval(env,proc,rt)
	if(procs.length==0) {return false}
	var evtDef = procs[0].def.components[this.evId]
	for(var i=0;i<procs.length;i++) {
		var proc = procs[i]
		var state = proc.state
		var prms = (this.params.length>0) ? this.evalParams(this.params,evtDef,env,proc,rt) : null
		var match = state.getExecuted(this.evId,prms)
		if(match!=null) {
			if(this.as) {env.define(this.as,match)}
			return true
		}
	}
	return false
}

var Running = function(path,as) {
	Guard.call(this,'Running')
	this.path = path
	this.as = as || false
}
util.inherits(Running,Guard)
Running.prototype.eval = function(env,proc,rt) {
	var procs = this.path.eval(env,proc,rt)
	if(procs.length==0) {return false}
	if(this.as) {
		env.define(this.as,procs)
	}
	return true
}

var Accepting = function(path) {
	Guard.call(this,'Accepting')
	this.path = path
}
util.inherits(Accepting,Guard)
Accepting.prototype.eval = function(env,proc,rt) {
	var procs = this.path.eval(env,proc,rt)
	return wu(procs).any(function(proc) {
		return proc.accepting()
	})
}

var Condition = function(path,id,params) {
	Guard.call(this,'Condition')
	this.path = path
	this.evId = id
	this.params = params
}
util.inherits(Condition,Guard)
Condition.prototype.eval = function(env,proc,rt) {
	var procs = this.path.eval(env,proc,rt)
	if(procs.length==0) {return false}

	var evtDef = procs[0].def.components[this.evId]
	var prms = this.params.length>0 ? this.evalParams(this.params,evtDef,env,proc,rt) : null
	for (var i = 0; i < procs.length; i++) {
		var parent = procs[i]
		if(parent.state.isExecuted(this.evId,prms) ||
			!parent.state.isIncluded(this.evId,prms)
			) {return true}
	}
	return false
}

var Response = function(path,id,params) {
	Guard.call(this,'Response')
	this.path = path
	this.evId = id
	this.params = params
}
util.inherits(Response,Guard)
Response.prototype.eval = function(env,proc,rt) {
	var procs = this.path.eval(env,proc,rt)
	if(procs.length==0) {return false}

	var evtDef = procs[0].def.components[this.evId]
	var prms = this.params.length>0 ? this.evalParams(this.params,evtDef,env,proc,rt) : null
	for (var i = 0; i < procs.length; i++) {
		var parent = procs[i]
		if(parent.state.isResponse(this.evId,prms)) {return true}
	}
	return false
}

var Milestone = function(path,id,params) {
	Guard.call(this,'Milestone')
	this.path = path
	this.evId = id
	this.params = params
}
util.inherits(Milestone,Guard)
Milestone.prototype.eval = function(env,proc,rt) {
	var procs = this.path.eval(env,proc,rt)
	if(procs.length==0) {return false}

	var evtDef = procs[0].def.components[this.evId]
	var prms = this.params.length>0 ? this.evalParams(this.params,evtDef,env,proc,rt) : null
	for (var i = 0; i < procs.length; i++) {
		var parent = procs[i]
		if(!parent.state.isResponse(this.evId,prms) ||
			!parent.state.isIncluded(this.evId,prms)) {
			return true
		}
	}
	return false
}

module.exports.And = And
module.exports.Or = Or
module.exports.Not = Not
module.exports.Executed = Executed
module.exports.Running = Running
module.exports.Accepting = Accepting
module.exports.Condition = Condition
module.exports.Response = Response
module.exports.Milestone = Milestone