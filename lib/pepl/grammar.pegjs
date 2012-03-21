{
	var wu = require('wu').wu
	  , ga = require('./grammaractions')

	gactions = new ga.GActions()
	function l() {}
	function join(ar,sep) {
		var out = ''
		for(var i=0;i<ar.length;i++) {
			if(i==0) {out+=ar[i]}
			else{out += sep + ar[i]}
		}
		return out
	}
}

module = _ ns:namespace _ procs:(p:procdecl _ {return p})+ { return gactions.finish() }

event "event" =
	varid:id _ '.' _ evid:id _ vals:angvalues? {
		return {type:'event',varname:varid,id:evid,params:vals}
	}
	/ path:( p:procpath _ '.' _ {return p} )? _ evid:id _ vals:angvalues? {
		return {type:'event',path:path,id:evid,params:vals}
	} 

eventpredicate "eventpredicate" =
	varid:id _ '.' _ evid:id _ vals:angpredicates? {
		return {type:'eventpredicate',varname:varid,id:evid,params:vals}
	}
	/ path:( p:procpath _ '.' _ {return p})? _ evid:id _ vals:angpredicates? {
		return {type:'eventpredicate',path:path,id:evid,params:vals}
	}

//_ "spaces" = space*
//space = ' ' / [\t\n\r]
_ "spaces" = space* (comment _)?
space = ' ' / [\t\n\r]
comment "comment"
	= '//' (![\n\r] c:.)* / '/*' (!'*/' c:.)+ '*/'


namespace = 'namespace' _ fst:id rest:('.' i:id {return i})* {
	var id = join([fst].concat(rest),'.')
	var module = gactions.defineModule(id)
	return module
}

proctokens = (procdecl / eventdecl)+

params = fst:id rest:(_ ',' _ i:id {return i})* {
	if(rest.length==0) {return [fst]}
	return [fst].concat(rest)
}
angparams = '<' _ p:params _ '>' _ {return p}
parenparams = '(' _ p:params _ ')' _ {return p}
angpredicates = '<' _ v:predicates _ '>' _ {return v}
parenpredicates = '(' _ v:predicates _ ')' _ {return v}
angvalues = '<' _ v:values _ '>' _ {return v}
parenvalues = '(' _ v:values _ ')' _ {return v}

procdecl = 'process' _ procid _ '{' _ proctokens _ '}' _ {
	gactions.pop()
}
procid = procId:id _ prms:parenparams? {
	return gactions.defineProcess(procId,prms)
}

eventdecl = 
	eventid _ 
	p:('{' _ parts _ '}')? _ {
	if(p.length==0) {
		gactions.defaultPart([])
	}
	gactions.pop()
}
eventid = _ annots:(an:annotations _ {return an})? evId:id _ prms:angparams?  {
	return gactions.defineEvent(evId,prms,annots)
}
annotations = annotation+
annotation = an:('must' {return gactions.annotationMust()} / 'excluded' {return gactions.annotationExcluded()}) _ {return an}

actions = _ acts:((response / exclude / include / newproc / let / debugaction)+) _ {return acts}

parts = 
	whens
	 /
	acts:actions {
		gactions.defaultPart(acts)
	}
whens =
	when _ (when _)* (else/except _)?

//when "when" =
//	'when' _ grd:guard _
//	'{' _ when
//	'}' {
//		gactions.pushGuard(grd)
//	} /
//	'{' _ acts:actions _ '}' {
//		gactions.completePart(acts)
//	}

else =
	'else' _ '{' _ acts:actions _ '}' _ {
		gactions.defaultPart(acts)
	}
except =
	'except' _ '{' _ acts:actions _ '}' _ {
		gactions.defaultPart(acts,true)
	}

when =
	'when' _ grd:guard _
	'{' _ acts:actions _ '}' {
	gactions.part(grd,acts)
}

debugaction "debug" = ('debug'/'log') _ prms:parenvalues _ {
	return gactions.actionDebug(prms)
}

guard " guard" =
	ctr:constraint {
		return {type:'guard',generators:[],milestones:[],constraint:ctr}
	}
	/ mls:milestones _ ctr:(',' _ c:constraint {return c}) {
		return {type:'guard',generators:[],milestones:mls,constraint:ctr}
	}
	/ all:('forall')? _ gens:generators _ mls:(',' _ m:milestones {return m})? _ ctr:(',' _ c:constraint {return c})? {
		return {type:'guard',generators:gens,milestones:mls,constraint:ctr,all:all}
	}

//guard "guard" = all:('all')? _ gens:generators? _ mls:( ',' _ m:milestones {return m})? _ ctr:( ',' _ c:constraint {return c})? {
//	return {type:'guard',generators:gens,milestones:mls,constraint:ctr,all:all}
//}

generators = fst:generator _ rest:(',' _ g:generator {return g})* {
	if(rest.length==0) {return [fst]}
	return [fst].concat(rest)
}

milestones = fst:ismilestone _ rest:(',' _ ismilestone {return ml})* {
	if(rest.length==0) {return [fst]}
	return [fst].concat(rest)
}

constraint = bexpr:boolexpr {return bexpr}
//be:(',' _ bexpr:boolexpr {return bexpr}) {return be}

//constraints = fst:constraint _ rest:(',' _ c:constraint {return c})* {
//	if(rest.length==0) {return [fst]}
//	return [fst].concat(rest)
//}

generator = iscondition //ismilestone //isexecuted/isrunning/isaccepting
//constraint = boolexpr/ismilestone //iscondition/isresponse/ismilestone/boolexpr

boolexpr =
	'(' _ andor:('&'/'|') _ fst:boolexpr _ snd:boolexpr _ ')' {
		return gactions.makeGuard(andor,fst,snd)
	}
	/ '(' _ '!' _ bexpr:boolexpr _ ')' {
		return gactions.makeGuardNot(bexpr)
	}
	/ '(' _ op:cmpop _ fst:value _ snd:value _ ')' {
		return gactions.makeBoolExpression(op,fst,snd)
	}
cmpop = '='/'<'/'>'/'<='/'>='

//whenboolexprs = 
//	'(' _ andor:('&'/'|') _ fst:whenboolexprs _ snd:whenboolexprs _ ')' {
//		return gactions.makeGuard(andor,fst,snd)
//	} / '(' _ '!' _ expr:whenboolexprs _ ')' {
//		return gactions.makeGuardNot(expr)
//	} / whenboolexpr

//whenboolexpr = isexecuted / iscondition / isrunning / isaccepting / isresponse / ismilestone / boolexpr

//isexecuted = 
//	'Executed' _ '(' _ 
//	path:(p:procpath _ '.' {return p})? evid:id _
//	vals:angpredicates? _ 
//	')' _ as:('as' _ v:id {return v}) {
//	return gactions.makeGuardExecuted(path,evid,vals,as)
//}
iscondition =
	'Condition' _ '(' _
	path:(p:procpath _ '.' {return p})? evid:id _
	vals:angpredicates? _ 
	')' {
	return gactions.makeGuardCondition(path,evid,vals)
}

//isrunning =
//	'Running' _ '(' _
//	path:procpath _
//	')' _ as:('as' _ v:id {return v})? {
//	return gactions.makeGuardRunning(path,as)
//}

//isaccepting =
//	'Accepting' _ '(' _
//	path:procpath
//	')' {
//	return gactions.makeGuardAccepting(path)
//}

//isresponse = 
//	'Must' _ '(' _
//	path:(p:procpath _ '.' {return p})? evid:id _
//	vals:angvalues? _
//	')' {
//	return gactions.makeGuardResponse(path,evid,vals)
//}

ismilestone = 
	'Milestone' _ '(' _
	path:(p:procpath _ '.' {return p})? evid:id _
	vals:angvalues? _
	')' {
	return gactions.makeGuardMilestone(path,evid,vals)
}

let =
	'let' _ varid:id _ ':=' _ v:value _ {
	return gactions.actionLet(varid,v)
}

response = 
	'response' _ 'auto' _ evt:event {
		return gactions.actionAutoResponse2(evt)
	} / 'response' _ evt:eventpredicate {
		return gactions.actionResponse2(evt)
	}

newproc =
	'new ' _ path:(p:procpath _ '.' {return p} / v:id '.' {return {type:'path',val:[{type:'var',val:v}]}})? procid:id _
	vals:parenvalues? _ {

	return gactions.actionNew(path,procid,vals)
}

exclude =
	'exclude' _ path:(p:procpath _ '.' {return p})? evid:id _
	vals:angvalues? _ {
	if(evid=='super') {
		return gactions.actionExcludeSuper()
	} else {
		return gactions.actionExclude(path,evid,vals)
	}
}

include =
	'include' _ path:(p:procpath _ '.' {return p})? evid:id
	vals:angvalues? _ {
	return gactions.actionInclude(path,evid,vals)
}

procpath = 
	'$' _ fst:id {
		return {type:'path',val:[{procId:fst,params:[]}]}
	}
	/ fst:id _ prms:parenpredicates {
		return {type:'path',val:[{procId:fst,params:prms}]}
	}
	/ fst:pathtoken _ rest:(':' _ pt:pathtoken {return pt})+ {
		if(rest.length==0) {return {type:'path',val:[fst]}}
		return {type:'path',val:[fst].concat(rest)}
	}
pathtoken = pid:id prms:parenpredicates? {
	return {procId:pid,params:prms}
}

predicates = fst:predicate _ rest:(',' _ p:predicate {return p})* {
	if(rest.length==0) {return [fst]}
	return [fst].concat(rest)
}
values = fst:value _ rest:(',' _ v:value {return v})* {
	if(rest.length==0) {return [fst]}
	return [fst].concat(rest)
}

value "value" =  newproc / v:(procpath/varload/unifvar/litval) {return gactions.makeValueExpression(v)} / expr

unifvar "unification var" = '?' name:id {return {type:'uvar',val:name}}

predicate "predicate" 
	= '*' {return gactions.makeAnyPredicate()} 
//	/ singleboolexpr
	/ v:unifvar {return gactions.makeUnificationPredicate(v)}
	/ v:value {return gactions.makeEqPredicate(v)}

expr "expr" = '(' _ rator:opid _ rands:(v:value _ {return v})+ ')' {
	return gactions.makeExpression(rator,rands)
}
//boolexpr "boolexpr" = 
//	'(' _ '!' _ expr:boolexpr _ ')' {
//		return gactions.makeNotBoolExpression(expr)
//	}
//	/ '(' _ rator:opid _ fst:value _ snd:value _ ')' {
//		return gactions.makeBoolExpression(rator,fst,snd)
//	}

//singleboolexpr "singleboolexpr" =
//	'(' _ '!' _ expr:singleboolexpr _ ')' {
//		return gactions.makeNotPredicate(expr)
//	}
//	/ '(' _ rator:opid _ fst:value _ ')' {
//		return gactions.makePredicateExpression(rator,fst)
//	}

litval = strval / float / integer / bool

strval "string" 
	= "'" chars:strvaltok+ "'" {return {type:'string',val:chars.join("")}}
strvaltok = !"'" c:. {return c}
integer "integer"
  = digits:[0-9]+ { return {type:'int',val:parseInt(digits.join(""), 10)} }
float "float"
  = integral:[0-9]+ '.' decimal:[0-9]+ {return {type:'float',val:parseFloat(integral.join('')+'.'+decimal.join(''))}}
bool "bool"
	= "true" {return {type:'bool',val:true}}/"false" {return {type:'bool',val:false}}
varload "varload" =
	fst:id rest:('.' _ i:id {return i} )* {
	if(rest.length==0) {return {type:'var', val:fst}}
	else {
		return {type:'dotvar', val: [fst].concat(rest)}
	}
}

id "identifier"
  = fstchar:('_'/[a-zA-Z]) rest:(('_'/[a-zA-Z0-9])*) {var id = [fstchar].concat(rest).join(''); return id}

opid "operatorIdentifier"
  = chars:opidchar+ {return chars.join('')}

opidchar = !(space) c:. {return c}
