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
========================================================
when block def:
when ::= (generators)? (constraint)?
generators ::= iscondition/ismilestone
constraint ::= boolexpr
iscondition ::= Condition( name '<' (*|? id|id) '>' ) //any,unif.var,scoped var
boolexpr ::= '(' boolexpr ')' | '(&|||<|>|...' (? id|id|boolexpr) (? id|id|boolexpr) ')'

excluded events mentioned in condition/milestone must:
 - return true always
 - if used as generators of values, the '? id' values must be recorded as {excluded:true}
 - above values in boolexpr must return true always
 - note for action.js, actions that use above values must not be performed
*/

var IDXS = '__idxs'
var VARS = '__vars'
var RECD = '__recorded'
var EXCLD = {excluded:true}
var isExcluded = function(v) {return wu.eq(v,EXCLD)}
var Stack = function(env,proc,rt) {
	this._idx = 0
	this.env = env
	this.proc = proc
	this.rt = rt
	this._st = []
}
Stack.prototype.assignId = function(gen) {
	if(undefined==gen.__idx) {
		gen.__idx = this.__idx++
		this.cur()[IDXS][gen.__idx] = 0
	}
}
Stack.prototype.idx = function(gen,newidx) {
	var c = 0
	while(c<this._st.length) {
		var cf = this._st[c]
		if(cf[IDXS][gen.__idx]==undefined) {
			c++
		} else {
			if(newidx==undefined) {
				return cf[IDXS][gen.__idx]
			} else {
				cf[IDXS][gen.__idx] = newidx
				return newidx
			}
		}
	}
	throw new Error('Cannot find index for generator!')
}
Stack.prototype.defineExcluded = function(gen) {
	wu(gen.unificationVars()).each(function(uv) {
		this._defineIfEmpty(VARS,uv.name,EXCLD)
	},this)
	if(gen.as != undefined) {
		this._defineIfEmpty(RECD,gen.as,EXCLD)
	}
};
Stack.prototype.define = function(gen,rels) {
	wu(gen.unificationVars()).each(function(uv) {
		this._define(VARS,uv.name,rels[uv.index])
	},this)
	if(gen.as != undefined) {
		this._define(RECD,gen.as,rels)
	}
}
Stack.prototype._defineIfEmpty = function(invar,id,val) {
	if(this._search(invar,id)==undefined) {
		this._st[0][invar][id] = val
	}
}
Stack.prototype._define = function(invar,id,val) {
	var cur = this._search(invar,id)
	if(cur==undefined) {
		cur = this._st[0][invar]
	}
	cur[id] = val
	return val
}
Stack.prototype._search = function(invar,id) {
	for (var i = 0; i < this._st.length; i++) {
		var cur = this._st[i][invar]
		if(cur[id] != undefined) {return cur}
	}
	return undefined
}

Stack.prototype.cur = function() {
	return this._st[0]
}
Stack.prototype.newfr = function() {
	this._st.unshift({
		__idxs: {},
		__vars: {},
		__recorded: {}
	})
}
Stack.prototype.push = function() {
	this.newfr()
}
Stack.prototype.pop = function() {
	return this._st.shift()
}

var When = function(generators,constraint) {
	this.generators = generators
	this.constraint = constraint
}
When.prototype.boot = function(env,proc,rt) {
	this.stack = new Stack(env,proc,rt)
}

var Generator = function() {
}
Generator.prototype.load = function() {
	throw new Error('Generator subclasses must implement load')
}
Generator.prototype.isExcluded = function() {
	throw new Error('Generator subclasses must implement isExcluded')
}
Generator.prototype.init = function(stack) {
	stack.assignId(this)
}
Generator.prototype.next = function(stack) {
	if(undefined==this.loaded) {this.loaded = this.load(stack)}
	if(this.isExcluded==true) {
		stack.defineExcluded(this)
		return true
	}
	var idx = stack.idx(this)
	stack.push()
	if(idx == this.loaded.length) {
		this.loaded = undefined
		stack.pop()
		return false
	}
	idx = idx+1
	stack.define(this,this.rels[idx])
	stack.idx(this,idx)
	return true
}

var EventGenerator = function(path,evtId,params) {
	Generator.call(this)
	this.path = path
	this.evtId = evtId
	this.params = params
}
util.inherits(EventGenerator,Generator)

var Condition = function(path,evtId,params) {
	EventGenerator.call(this,path,evtId,params)
}
util.inherits(Condition,EventGenerator)
Condition.prototype.load = function(s) {
	this.isExcluded = false
	var procs = this.path.eval(s.env,s.proc,s.rt)
	if(procs.length == 0) {return []}
	var evtDef = procs[0].def.components[this.evtId]
	var prms = resolveParams(this,s)
	var out = []
	var isExcluded = 0

	wu(procs).each(function(parent) {
		if(parent.state.isIncluded(evtDef.id)) {
			isExcluded++
		} else {
			out = out.concat(parent.state.getExecuted(evtDef.id,prms))
		}
	})
	if(isExcluded==procs.length) {
		this.isExcluded = true
	}
	return out
	/*
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
	*/
}
Condition.prototype.isExcluded = function() {
	
}
