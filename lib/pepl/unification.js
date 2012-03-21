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

Generator types:
Condition [path .]? [name] [<*|id|?id>]?
	Question: can conditions be defined on different processes?
	if so, then
		path = [name] [(*|id|?id)]? [: path]?
	otherwise
		path = [empty]

Constraint types:
Milestone [path .]? [name] [<value>]? //value id|?id|litval
negation: (! constraint) //except Milestone!
logic: (op constraint constraint)
	op: &,|
bexpr: (op expr expr)
	op: =,<,<=,>,>=,match
	expr: (op expr expr),value
		op: +,-,/...
aggregate: (op ??)
	op : max,min,avg
*/

var IDXS = '__idxs'
//var VARS = '__vars'
var RECD = '__recorded'
var IDX = 'idx'
var RELS = 'rels'
var EXCLD = {excluded:true}
var isExcluded = function(v) {return wu.eq(v,EXCLD)}

var Stack = function(env,proc,rt) {
	this._idx = 0
	this.env = env
	this.proc = proc
	this.rt = rt
	this._st = []

	env.setUnificationStack(this)
}
Stack.prototype.assignId = function(gen) {
	gen.__idx = this._idx
	this.cur()[IDXS][gen.__idx] = {idx:0,rels:null}
	this._idx = this._idx+1
}
Stack.prototype.rels = function(gen,newrels) {
	var c = 0
	while(c<this._st.length) {
		var cf = this._st[c]
		if(cf[IDXS][gen.__idx]==undefined) {
			c++
		} else {
			if(newrels==undefined) {
				return cf[IDXS][gen.__idx][RELS]
			} else {
				cf[IDXS][gen.__idx][RELS] = newrels
				return newrels
			}
		}
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
				return cf[IDXS][gen.__idx][IDX]
			} else {
				cf[IDXS][gen.__idx][IDX] = newidx
				return newidx
			}
		}
	}
	throw new Error('Cannot find index for generator!')
}
Stack.prototype.defineExcluded = function(gen) {
	wu(gen.unificationVars()).each(function(uv) {
		// console.log('define excluded var',uv)
		this._defineIfEmpty(RECD,uv.name,EXCLD)
	},this)
	if(gen.as != undefined) {
		this._defineIfEmpty(RECD,gen.as,EXCLD)
	}
}
Stack.prototype.define = function(gen,rels) {
	// console.log('Stack.define',rels)
	wu(gen.unificationVars()).each(function(uv) {
		// console.log('define uvar',uv,rels[uv.id],' - in - ',rels)
		this._define(RECD,uv.name,rels[uv.id])
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
Stack.prototype.search = function(id) {
	//only in VARS/RECD..should probably merge those //done :)
	// console.log('searching',id)
	var c = this._search(RECD,id)
	if(c==undefined) {return c}
	return c[id]

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
		// __vars: {},
		__recorded: {}
	})
}
Stack.prototype.push = function() {
	this.newfr()
}
Stack.prototype.pop = function() {
	return this._st.shift()
}

var When = function(generators,constraint,firstOnly) {
	this.generators = generators
	this.constraint = constraint
	this.firstOnly = firstOnly
	this.counter = 0
	this.part = null
}
When.prototype.setPart = function(part) {
	this.part = part
}
When.prototype.boot = function(env,proc,rt) {
	this.stack = new Stack(env,proc,rt)
	this.stack.push()
	wu(this.generators).each(function(gen) {gen.init(this.stack)},this)
	this.constraint.init(this.stack)
	this.counter=0
}
When.prototype.next = function() {
	if(this.firstOnly==true&&this.counter>0) {delete(this.stack); return false} //block here
	var st = this.stack
	if(this.generators.length==0) {this.firstOnly=true;this.counter=1; return this.constraint.eval(st.env,st.proc,st.rt)}
	var i = 0
	while(true) {
		while(i<this.generators.length) {
			var gen = this.generators[i]
			// console.log('try to match generator',gen)
			if(false == gen.next(st)) {
				st.pop()
				if(i==0) {delete(this.stack); return false}
				i--
			} else {
				i++
				// console.log('generator match, next',i)
			}
		}
		if(false == this.constraint.eval(st.env,st.proc,st.rt)) {
			st.pop()
			i--
		} else {break}
	}
	this.counter++
	// console.log('When unified',this.counter)
	return true
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
	this.stack = stack
}
Generator.prototype.next = function(stack) {
	// console.log('next',this.__idx)
	var loaded = stack.rels(this)
	if(undefined==loaded) {
		loaded = this.load(stack)
		if(loaded.length==0 && false==this.isExcluded()) {
			// console.log('no match found')
			return false
		}
		stack.rels(this,loaded)
	}
	if(this.isExcluded()==true) {
		stack.defineExcluded(this)
		return true
	}
	var idx = stack.idx(this)
	stack.push()
	if(idx == loaded.length) {
		//this.loaded = undefined
		stack.pop()
		return false
	}
	stack.define(this,loaded[idx])
	idx = idx+1
	stack.idx(this,idx)
	// console.log('condition matched')
	return true
}




var Constraint = function(type) {
	this.type = type
}
Constraint.prototype.init = function(s) {
	this.stack = s
}
Constraint.prototype.eval = function(env,proc,rt) {
	throw new Error('Constraint subclasses must implement eval')
}


var True = function() {
	Constraint.call(this,'True')
}
util.inherits(True,Constraint)
True.prototype.eval = function() {
	return true
}
True.prototype.match = function() {
	return true
}

var And = function(fst,snd) {
	Constraint.call(this,'And')
	this.fst = fst
	this.snd = snd
}
util.inherits(And,Constraint)
And.prototype.eval = function(env,p,rt) {
	return (this.fst.eval(env,p,rt) && this.snd.eval(env,p,rt))
}
var Or = function(fst,snd) {
	Constraint.call(this,'Or')
	this.fst = fst
	this.snd = snd
}
util.inherits(Or,Constraint)
Or.prototype.eval = function(env,p,rt) {
	return (this.fst.eval(env,p,rt) || this.snd.eval(env,p,rt))
}

var Not = function(constraint) {
	Constraint.call(this,'Not')
	this.constraint = constraint
}
util.inherits(Not,Constraint)
Not.prototype.eval = function(env,p,rt) {
	return !(this.constraint.eval(env,p,rt))
}

var BinOp = function(fstExpr,sndExpr,name,fn) {
	Constraint.call(this,name)
	this.fst = fstExpr
	this.snd = sndExpr
	this.fn = fn
}
util.inherits(BinOp,Constraint)
BinOp.prototype.eval = function(env,p,rt) {
	var fst = this.fst.eval(env,p,rt)
	if(isExcluded(fst)==true) {return true}
	var snd = this.snd.eval(env,p,rt)
	if(isExcluded(snd)==true) {return true}
	return this.fn.call(this.fn,fst,snd)
}
var Eq = function(fstExpr,sndExpr) {
	BinOp.call(this,fstExpr,sndExpr,'=',function(a,b){return wu.eq(a,b)})
}
util.inherits(Eq,BinOp)
var Gt = function(fstExpr,sndExpr) {
	BinOp.call(this,fstExpr,sndExpr,'>',function(a,b){return a>b})
}
util.inherits(Gt,BinOp)
var Lt = function(fstExpr,sndExpr) {
	BinOp.call(this,fstExpr,sndExpr,'<',function(a,b){return a<b})
}
util.inherits(Lt,BinOp)
var Gte = function(fstExpr,sndExpr) {
	BinOp.call(this,fstExpr,sndExpr,'>=',function(a,b) {return a>=b})
}
util.inherits(Gte,BinOp)
var Lte = function(fstExpr,sndExpr) {
	BinOp.call(this,fstExpr,sndExpr,'<=',function(a,b){return a<=b})
}
util.inherits(Lt,BinOp)

module.exports = {
	EXCLD: EXCLD,
	isExcluded: isExcluded,

	When: When,
	Generator: Generator,
	Constraint: Constraint,
	// Condition: Condition,
	// Milestone: Milestone,

	True: True,

	Logic: {
		'&': And,
		'|': Or,
		'!': Not
	},

	BExpr: {
		'=': Eq,
		'>': Gt,
		'>=': Gte,
		'<': Lt,
		'<=': Lte
	}
}

//module.exports.EXCLD = EXCLD
