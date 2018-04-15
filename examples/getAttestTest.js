var VM = require('../index.js')
const ethUtil = require('ethereumjs-util')
const BN = ethUtil.BN

//create a new VM instance
var vm = new VM()
var code = '63DEADBEEF60AB5560AB6000E03e'

vm.on('step', (op) => {
  /*console.log(`(stack before: ${op.stack.length} items)`)
  op.stack.forEach((item, i) => {
    console.log(`${i}: ${item.toString('hex')}`)
  })
  const string = `${op.opcode.name} (gas left: ${op.gasLeft.toString()})`
  console.log(string)*/

  let hexStack = []
  hexStack = op.stack.map(item => {
    return '0x' + new BN(item).toString(16, 0)
  })

  var opTrace = {
    'pc': op.pc,
    'op': op.opcode.opcode,
    'gas': '0x' + op.gasLeft.toString('hex'),
    'gasCost': '0x' + op.opcode.fee.toString(16),
    'stack': hexStack,
    'depth': op.depth,
    'opName': op.opcode.name
  }

  console.log(JSON.stringify(opTrace))
})

vm.runCode({
  code: Buffer.from(code, 'hex'), // code needs to be a Buffer
  gasLimit: Buffer.from('ffffffff', 'hex')
}, function(err, results){
  if(err){
    console.log(err)
  }
  console.log('returned: ' + results.return.toString('hex'));
})