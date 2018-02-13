#!/bin/sh
ganache-cli -a 5 --account="0x958784d1bc1578405498a47cd36e108bb954af3166cd16685bb7434ff67e4537, 12300000000000000000000" --account="0xa15930f879561bf2f5cc7194659d76dd242468fed45387d9d64751e4a601c2b1, 3120000000000000000000" --account="0xc4d82d1f7295b2e8afdc037be0c0f4b1386630662bdc7b5329b8ef0a57613827, 42200000000000000000000" --account="0x466c6e56cc64c51292255913218aeb574771ddb13dc1c9246e4e94cb8f74fa12, 512000000000000000000" & gid=$!
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

