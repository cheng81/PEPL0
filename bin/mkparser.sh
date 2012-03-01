#!/bin/bash
PEGJS='../node_modules/pegjs/bin/pegjs'
SRC='../lib/pepl/grammar.pegjs'
OUT='../lib/pepl/grammar.js'

${PEGJS} ${SRC} ${OUT}