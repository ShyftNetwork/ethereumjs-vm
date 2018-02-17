const async = require('async')
const VM = require('../')
const testUtil = require('./util')
const Account = require('ethereumjs-account')
const Trie = require('merkle-patricia-tree/secure')
const tape = require('tape')
const testing = require('ethereumjs-testing')

// Load an example test case
const example = require('./localTests/example1.json')

// Most code copied from VMTestsRunner

/**
 * options:
 *  vmtrace
 * testData: the JSON input as specified by official ethereum test setup
 *
 */

function runShyftVMTest (testData, t, cb) {
  let state = new Trie()
  let account
  let results

  async.series([
    // Create initial account
    function (done) {
      let acctData = testData.pre[testData.exec.address]
      account = new Account()
      account.nonce = testUtil.format(acctData.nonce)
      account.balance = testUtil.format(acctData.balance)
      testUtil.setupPreConditions(state, testData, done)
    },
    // Initialize account state root
    function (done) {
      state.get(Buffer.from(testData.exec.address, 'hex'), function (err, data) {
        let a = new Account(data)
        account.stateRoot = a.stateRoot
        // console.log(account.toJSON(true))
        done(err)
      })
    },
    // Execute vm code and setup event emitter listener
    function (done) {
      let vm = new VM({state: state})
      let runCodeData = testUtil.makeRunCodeData(testData.exec, account, block)
      // Logging each step of execution in VM
      vm.on('step', (op) => {
        console.log(`(stack before: ${op.stack.length} items)`)
        op.stack.forEach((item, i) => {
          console.log(`${i}: ${item.toString('hex')}`)
        })
        const string = `${op.opcode.name} (gas left: ${op.gasLeft.toString()})`
        console.log(string)
      })
      vm.runCode(runCodeData, function (err, r) {
        if (r) {
          results = r
        }
        done(err)
      })
    }
  ])
}



tape('test1', t => {
  runShyftVMTest(testing.getSingleFile('../../../tests/localTests/example1.json'), t, (data) => t.comment(data))
})
