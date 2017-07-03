#!/bin/bash
pushd `dirname $0` > /dev/null
SCRIPTPATH=`pwd`
popd > /dev/null
GOPATH=$SCRIPTPATH

echo "Current GOPATH is $GOPATH..."

########### Go vend
echo "Installing govend"

go get github.com/govend/govend
########### Packages
echo "Installing Go packages"
pushd src
../bin/govend -v
popd

########### NPM
# echo "Installing NPM packages"
# npm install
