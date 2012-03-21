var rt = require('./runtime')
var proc = require('./domainproc')
var evt = require('./domainevt')
var act = require('./action')
var grd = require('./guard')
var pth = require('./procpath')
var unf = require('./unification')
var grm = require('./grammar')

module.exports = {
	Runtime: rt.Runtime,
	Module: rt.Module,
	Process: proc.Process,
	Event: evt.Event,
	Path: pth.Path,
	PathTo: pth.PathTo,
	annotations: {
		Must: evt.annotations.Must,
		Excluded: evt.annotations.Excluded
	},
	actions: {
		New: act.New,
		Response: act.Response,
		Exclude: act.Exclude,
		Let: act.Let
	},
	unification: {
		isExcluded: unf.isExcluded,
		EXCLD: unf.EXCLD,
		When: unf.When,
		Condition: grd.Condition,
		Milestone: grd.Milestone,
		Accepting: grd.Accepting,
		True: unf.True,
		Logic: {
			'&': unf.Logic['&'],
			'|': unf.Logic['|'],
			'!': unf.Logic['!']
		},
		BExpr: {
			'=': unf.BExpr['='],
			'>': unf.BExpr['>'],
			'>=': unf.BExpr['>='],
			'<': unf.BExpr['<'],
			'<=': unf.BExpr['<=']
		}
	},
	// guards: {
	// 	And: grd.And,
	// 	Or: grd.Or,
	// 	Not: grd.Not,
	// 	Executed: grd.Executed,
	// 	Running: grd.Running,
	// 	Accepting: grd.Accepting,
	// 	Condition: grd.Condition,
	// 	Response: grd.Response,
	// 	Milestone: grd.Milestone
	// },

	boot: function() {return new rt.Runtime()},
	bootLog: function() {
		var util = require('util')
		var out = new rt.Runtime(true)
		out.on('created',function(d) { 
			console.log('Created instance of ' + d.processDef + ' - ' + d.instance + ' - ' + 
			util.inspect(out.instances[d.instance].state.store))
		})
		out.on('killed',function(d) { console.log('Killed instance of ' + d.processDef + ' - ' + d.instance)})
		return out
	},
	parser: grm
}