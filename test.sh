#!/bin/sh
node_modules/jshint/bin/hint ./*
hint=$?
if [ $hint != 0 ]; then
	echo "< script runner stopped jshint failed >";
	exit $hint
else
	echo "< jshint passed >";
fi

expresso ./test/unit/*
unit=$?
if [ $unit != 0 ]; then
	echo "< script runner stopped unit tests failed >";
	exit $unit
else
	echo "< unit tests passed >";
fi

