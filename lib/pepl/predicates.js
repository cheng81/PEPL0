var util = require('util')
  , wu = require('wu').wu


var Predicate = function() {}
Predicate.prototype.eval = function(env,proc,rt) {
	throw 'Predicate subclasses must implement eval'
}

var Any = function(){
	Predicate.call(this)
}
Any.prototype.eval = function() {
	return {
		match: function() { return true }
	}
}

module.exports.Any = {match: function(){return true}}