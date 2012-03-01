var wu = require('wu').wu
  , util = require('util')
  , pepl = require('./pepl')

function first(ar,pred,ctxt) {
	for (var i = 0; i < ar.length; i++) {
		var el = ar[i]
		if(pred.call(ctxt,el)){ return el }
	}
	return null
}
function pairExpr(fn) {
	return function(exprs) {
		var fst = exprs[0]
		var snd = exprs[1]
		return {
			eval: function(env,proc,rt) {
				var a = fst.eval(env,proc,rt)
				var b = snd.eval(env,proc,rt)
				return fn(a,b)
			}
		}
	}
}

function pairBoolExpr(fn) {
	return function(fst,snd) {
		if(!snd) {
			var expr = fst
			return {
				eval: function(env,proc,rt) {
					var val = expr.eval(env,proc,rt)
					return {
						match: function(value) {
							return fn(value,val)
						}
					}
				}
			}
		} else {
			return {
				eval: function(env,proc,rt) {
					var v1 = fst.eval(env,proc,rt)
					var v2 = snd.eval(env,proc,rt)
					return fn(v1,v2)
				}
			}
		}
	}
}

var expressions = {
	'+': pairExpr(function(a,b) {return a+b}),
	'-': pairExpr(function(a,b) {return a-b}),
	'/': pairExpr(function(a,b) {return a/b}),
	'*': pairExpr(function(a,b) {return a*b})
}
var boolexpressions = {
	'<': pairBoolExpr(function(a,b) {return a<b}),
	'>': pairBoolExpr(function(a,b) {return a>b}),
	'<=': pairBoolExpr(function(a,b) {return a<=b}),
	'>=': pairBoolExpr(function(a,b) {return a>=b}),
	'=': pairBoolExpr(function(a,b) {return a==b}),
	'!': function(expr) {
		return {
			eval: function(env,proc,rt) {
				var bexpr = expr.eval(env,proc,rt)
				return {
					match: function(value) {
						return !(bexpr.match(value))
					}
				}
			}
		}
	}
}

var DotVarLoad = function(path) {
	this.path = path
}
DotVarLoad.prototype.eval = function(env) {
	var cur = env.lookup(this.path[0])
	for (var i = 1; i < this.path.length; i++) {
		var idx = this.path[i]
		cur = cur[idx]
	}
	return cur
}
var VarLoad = function(name) {
	this.name = name
}
VarLoad.prototype.eval = function(env) {
	return env.lookup(this.name)
}
var Const = function(val) {
	this.val = val
}
Const.prototype.eval = function() {
	return this.val
}

var GActions = function() {
	this.stack = []
	this.guardstmp = []
	this.secondPass = []
}
GActions.prototype.finish = function() {
	// for (var i = 0; i < this.secondPass.length; i++) {
	// 	this.secondPass[i].pass()
	// }
	return this.pop()
}
GActions.prototype.push = function(v) {
	this.stack.push(v)
	// this.namestack.push({})
}
GActions.prototype.peek = function() {
	return this.stack[this.stack.length-1]
}
GActions.prototype.pop = function() {
	// this.namestack.pop()
	return this.stack.pop()
}
GActions.prototype.pushSnd = function(thunk) {
	this.secondPass.push(thunk)
}

GActions.prototype.defineModule = function(id) {
//	console.log('defining module ',id)
	var mod = new pepl.Module(id)
//	console.log('module ',id,' defined: ',mod)
	this.push(mod)
	return mod
}
GActions.prototype.defineProcess = function(id,params) {
	var proc = new pepl.Process(this.peek(),id,params)
	this.push(proc)
	return proc
}
GActions.prototype.defineEvent = function(id,params,annotations) {
	var ev = new pepl.Event(this.peek(),id,params,annotations)
	this.push(ev)
	return ev
}

GActions.prototype.annotationMust = function() {
	return new pepl.annotations.Must()
}
GActions.prototype.annotationExcluded = function() {
	return new pepl.annotations.Excluded()
}

GActions.prototype.defaultPart = function(actions) {
//	console.log('defaultPart in',util.inspect(this.peek()))
	var part = this.peek().makeDefaultPart(actions)
//	console.log('Actions',util.inspect(actions,true,10))
	for (var i = 0; i < actions.length; i++) {
//		if(!actions[i].setPart) {console.log('Action without setPart method?',actions[i])}
		actions[i].setPart(part)
	}
}
GActions.prototype.part = function(guard,actions) {
	var part = this.peek().makePart(guard,actions)
	for (var i = 0; i < this.guardstmp.length; i++) {
		var g = this.guardstmp[i]
//		if(!g.setPart) {console.log('Guard without setPart method?',guard)}
		guard.setPart(part)
	}
	this.guardstmp = []
	for (var i = 0; i < actions.length; i++) {
		actions[i].setPart(part)
	}
}

GActions.prototype.actionDebug = function(exprs) {
	return {
		setPart: function(){},
		perform: function(env,proc,rt) {
			var vals = wu(exprs).map(function(expr) {return expr.eval(env,proc,rt)}).toArray()
			console.log.apply(console,vals)
		}
	}
}
GActions.prototype.makePath = function(pathval,id,isEv,isTo) {
	var last = (isEv) ? {evId:id} : {procId:id}
	if(isTo) {
		return new pepl.PathTo(pathval.val,last)
	} else {
		return new pepl.Path(pathval.val,last)
	}
}

/**/
GActions.prototype.actionAutoResponse2 = function(evtStruct) {
	var path = evtStruct.varname ? 
		new VarLoad(evtStruct.varname) : this.makePath(evtStruct.path,evtStruct.id,true,true)
	return new pepl.actions.Response(path,evtStruct.id,evtStruct.params,true)
}
GActions.prototype.actionResponse2 = function(evtStruct) {
	var path = evtStruct.varname ? 
		new VarLoad(evtStruct.varname) : this.makePath(evtStruct.path,evtStruct.id,true,true)
	return new pepl.actions.Response(path,evtStruct.id,evtStruct.params,false)
}
/**/

GActions.prototype.actionLet = function(id,expr) {
	return new pepl.actions.Let(id,expr)
}
/*GActions.prototype.actionAutoResponse = function(path,evid,values) {
	return new pepl.actions.Response(this.makePath(path,evid,true,true),evid,values,true)
}
GActions.prototype.actionResponse = function(path,evid,values) {
	return new pepl.actions.Response(this.makePath(path,evid,true,true),evid,values,false)
}*/
GActions.prototype.actionNew = function(path,procId,values) {
	return new pepl.actions.New(this.makePath(path,procId,false,true),procId,values)
}
GActions.prototype.actionExcludeSuper = function() {
	return new pepl.actions.Exclude(null,null,null,true)
}
GActions.prototype.actionExclude = function(path,evid,values) {
	return new pepl.actions.Exclude(this.makePath(path,evid,true,true),evid,values)
}
GActions.prototype.actionInclude = function(path,evid,values) {
	return new pepl.actions.Include(this.makePath(path,evid,true,true),evid,values)
}


GActions.prototype.makeValueExpression = function(value) {
	switch(value.type) {
		case 'path': return new pepl.Path(value.val)
		case 'var': return new VarLoad(value.val)
		case 'dotvar': return new DotVarLoad(value.val)
		default: return new Const(value.val)
	}
}
GActions.prototype.makeExpression = function(rator,rands) {
	return expressions[rator](rands)
}
GActions.prototype.makeEqPredicate = function(expr) {
	return {
		eval: function(env,proc,rt) {
			var val = expr.eval(env,proc,rt)
			return {
				match: function(value) {
					if(expr instanceof pepl.Path) {
						if(!value.uuid) {throw 'Actual value is not a ProcessInstance'}
						return val.uuid==value.uuid
					}
					return wu.eq(value,val)
				}
			}
		}
	}
}
GActions.prototype.makeAnyPredicate = function() {
	if(!this.anyPredicate) {
		this.anyPredicate = {
			eval: function() {
				return {
					match: function() {return true}
				}
			}
		}
	}
	return this.anyPredicate
}
GActions.prototype.makeNotPredicate = function(expr) {
	return boolexpressions['!'](expr)
}
GActions.prototype.makeNotBoolExpression = function(expr) {
	return {
		eval: function(env,proc,rt) {
			return !(expr.eval(env,proc,rt))
		}
	}
}
GActions.prototype.makeBoolExpression = function(rator,fst,snd) {
	return boolexpressions[rator](fst,snd)
}
GActions.prototype.makePredicateExpression = function(rator,fst) {
	return boolexpressions[rator](fst)
}

GActions.prototype.makeGuard = function(andor,fst,snd) {
	var out = null
	if(andor=='&') {
		out = new pepl.guards.And(fst,snd)
	} else if(andor=='|') {
		out = new pepl.guards.Or(fst,snd)
	} else { throw 'Unrecognized guard connection ' + andor }
	this.guardstmp.push(out)
	return out
}
GActions.prototype.makeGuardNot = function(guard) {
	var out = new pepl.guards.Not(guard)
	this.guardstmp.push(out)
	return out
}
GActions.prototype.makeGuardExecuted = function(path,evid,vals,as) {
	var out = new pepl.guards.Executed(this.makePath(path,evid,true,true),evid,vals,as)
	this.guardstmp.push(out)
	return out
}
GActions.prototype.makeGuardRunning = function(path,as) {
	var out = new pepl.guards.Running(this.makePath(path,null,false,false),as)
	this.guardstmp.push(out)
	return out
}
GActions.prototype.makeGuardAccepting = function(path,vals) {
	var out = new pepl.guards.Accepting(this.makePath(path,null,false,false))
	this.guardstmp.push(out)
	return out
}
GActions.prototype.makeGuardCondition = function(path,evid,vals) {
	var out = new pepl.guards.Condition(this.makePath(path,evid,true,true),evid,vals)
	this.guardstmp.push(out)
	return out
}
GActions.prototype.makeGuardResponse = function(path,evid,vals) {
	var out = new pepl.guards.Response(this.makePath(path,evid,true,true),evid,vals)
	this.guardstmp.push(out)
	return out
}
GActions.prototype.makeGuardMilestone = function(path,evid,vals) {
	var out = new pepl.guards.Milestone(this.makePath(path,evid,true,true),evid,vals)
	this.guardstmp.push(out)
	return out
}

module.exports.GActions = GActions