#!/bin/sh
ganache-cli -a 5 --account="0xc6bfed48f747e3b6fdf67c9b77108a50323ca4bde735c397faad6fa2d7a896a1, 123" --account="0x3145530a8a36b861c5e27d1e3e3d2da9e11ef497272896c03171ca9d9c5aa8be, 312" &
gid=$!
# ganache-cli -a 5 --account="0xc6bfed48f747e3b6fdf67c9b77108a50323ca4bde735c397faad6fa2d7a896a1, 123" --account="0x3145530a8a36b861c5e27d1e3e3d2da9e11ef497272896c03171ca9d9c5aa8be, 312" &> /dev/null & gid=$!
sleep 2
#echo ${gid}
#kill "${gid}"
#exit 123
#(sudo pfctl -sr 2>/dev/null; echo "block drop quick on lo0 proto tcp from any to any port = 65520") | sudo pfctl -nf -
pathy=${PWD}
# cd ../remix/remix-debugger
cd ../browser-solidity
npm start
cd ..
# python -m SimpleHTTPServer &> /dev/null &
# pid=$!
#
# sleep 1

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --kiosk --app=http://127.0.0.1:8080

sleep 30
# kill "${pid}"
kill "${gid}"

cd $pathy
remixd -S $pathy

