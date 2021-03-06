var rt = require('./runtime')
var proc = require('./domainproc')
var evt = require('./domainevt')
var act = require('./action')
var grd = require('./guard')
var pth = require('./procpath')

module.exports = {
	Runtime: rt.Runtime,
	Module: rt.Module,
	Process: proc.Process,
	Event: evt.Event,
	Path: pth.Path,
	PathTo: pth.PathTo,
	actions: {
		New: act.New,
		Response: act.Response,
		Exclude: act.Exclude,
		Include: act.Include,
		Let: act.Let
	},
		annotations: {
		Must: evt.annotations.Must,
		Excluded: evt.annotations.Excluded
	},
	guards: {
		And: grd.And,
		Or: grd.Or,
		Not: grd.Not,
		Executed: grd.Executed,
		Running: grd.Running,
		Accepting: grd.Accepting,
		Condition: grd.Condition,
		Response: grd.Response,
		Milestone: grd.Milestone
	},
	boot: function() {return new rt.Runtime()}
}