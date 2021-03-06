var util = require('util')
  , events = require('events')
  , wu = require('wu').wu
  , Event = require('./domainevt').Event


var IncludedState = function(state,evtId,allIncluded) {
	this.allIncluded = allIncluded
	this.ar = []
	this.state = state
	this.evtId = evtId
}
IncludedState.prototype.all = function(proc,rt) {this.allIncluded=true;this.ar=[]; this.state.fireAutoResponses(this.evtId,this,proc,rt)}
IncludedState.prototype.none = function() {this.allIncluded=false;this.ar=[]}
IncludedState.prototype.include = function(data) {
	if(!this.allIncluded) {this.ar.push(data)
	this.state.fireAutoResponses(this.evtId,this)}
}
IncludedState.prototype.exclude = function(data) {
	if(this.allIncluded) {this.ar.push(data)}
}
IncludedState.prototype.isIncluded = function(data) {
	if(data==null) {
		return (this.allIncluded || this.ar.length>0)
	}
	if(this.allIncluded) {return wu(this.ar).all(function(v) {return !wu.eq(v,data)})}
	return wu(this.ar).any(function(v) {return wu.eq(v,data)})
}

var State = function(proc,params) {
	this.process = proc
	this.store = params || {}
	this.executed = {}
	this.responses = {}
	this.included = {}

	wu(proc.def.components)
		.filter(function(c){return (c[1] instanceof Event)})
		.each(function(evt){
			this.included[evt[0]] = new IncludedState(this,evt[0],true)
		},this)
}
State.prototype.addExecuted = function(evtDef,data) {
	var id = evtDef.id
	this.executed[id] = this.executed[id] || []
	this.executed[id].push(data)
}
State.prototype.fireAutoResponses = function(evtId,inclState,proc,rt) {
	if(inclState.allIncluded && this.responses[evtId]!=undefined) {
		wu(this.responses[evtId])
			.filter(function(re) { return re.__auto!=undefined },this)
			.each(function(auto) {
				rt.queue(proc.uuid,evtId,auto.data)
			})

	}
}
State.prototype.addAutoResponse = function(evtDef,data) {
	this.responses[evtDef.id] = this.responses[evtDef.id] || []
	this.responses[evtDef.id].push({__auto:true,data:data})
}
State.prototype.addResponse = function(evtDef,ptn) {
	this.responses[evtDef.id] = this.responses[evtDef.id] || []
	this.responses[evtDef.id].push(ptn)
}
State.prototype.removeResponses = function(evtDef,data) {
	var id = evtDef.id
	var res = this.responses[id]
	if(res) {
		if(data==null||data=={}) {
			delete(this.responses[id])
		} else {
			this.responses[id] = wu(res)
				.filter(function(re) {
				//return !re.match(data)
				if(re.__auto!=undefined) {
					return wu.eq(re.data,data)
				}
				return wu(data).any(function(fld) {
					return !(re[fld[0]].match(re[fld[1]]))
				})
			}).toArray()
			if(this.responses[id].length==0) {
				delete(this.responses[id])
			}
		}
	}
}
State.prototype.isIncluded = function(evtDef,data) {
	var id = evtDef
	if(evtDef instanceof Event) {
		id = evtDef.id
	}
	var incl = this.included[id]
	if(!incl){console.log('event ' + id + ' not in state.included!'); return false}
	return incl.isIncluded(data)
}

State.prototype.getExecuted = function(id,prms) {
	if(!this.executed[id] || this.executed[id].length == 0) {return null}
	if(prms == null) {return this.executed[id][0]}
	for (var i = 0; i < this.executed[id].length; i++) {
		var cur = this.executed[id][i]
		if(wu(prms).all(function(prm) {
			return prm[1].match(cur[prm[0]])
		})) {
			return cur
		}
	}
	return null
}
State.prototype.isExecuted = function(id,prms) {
	if(!this.executed[id] || this.executed[id].length == 0) {return false}
	if(prms == null) {return true}
	return wu(this.executed[id]).any(function(exc) {
		return wu(prms).all(function(ptn) {
			return ptn[1].match(exc[ptn[0]])
		})
	})
}
//State.prototype.isIncluded = function(id,prms) {
//	if(!this.included[id]) {return false}
//	return this.included[id].isIncluded(prms)
//}
State.prototype.isResponse = function(id,prms) {
	if(!this.responses[id] || this.responses[id].length==0) {return false}
	if(prms == null) {return true}
	return wu(this.responses[id]).any(function(rsp) {
		return wu(prms).all(function(fld) {
			return rsp[fld[0]].match(fld[1])
		})
	})
}

State.prototype.isAccepting = function() {
	return wu(this.responses).all(function(rspFld) {
		return rspFld[1].length==0 || wu(rspFld[1]).all(function(rsp) {
			return !this.isIncluded(rspFld[0],rsp)
		},this)
	},this)
}


module.exports.State = State