const Buffer = require('safe-buffer').Buffer
const async = require('async')
const utils = require('ethereumjs-util')
const BN = utils.BN
const Bloom = require('./bloom.js')
const Block = require('ethereumjs-block')

/**
 * Process a transaction. Run the vm. Transfers eth. Checks balances.
 * @method processTx
 * @param opts
 * @param opts.tx {Transaction} - a transaction
 * @param opts.skipNonce - skips the nonce check
 * @param opts.skipBalance - skips the balance check
 * @param opts.block {Block} needed to process the transaction, if no block is given a default one is created
 * @param cb {Function} - the callback
 */
module.exports = function (opts, cb) {
  var self = this
  var block = opts.block
  var tx = opts.tx
  var gasLimit
  var results
  var basefee

  // create a reasonable default if no block is given
  if (!block) {
    block = new Block()
  }

  if (new BN(block.header.gasLimit).lt(new BN(tx.gasLimit))) {
    cb(new Error('tx has a higher gas limit than the block'))
    return
  }

  if (opts.populateCache === undefined) {
    opts.populateCache = true
  }

  // run everything
  async.series([
    populateCache,
    runTxHook,
    runCall,
    saveTries,
    runAfterTxHook,
    function (cb) {
      self.stateManager.cache.flush(function () {
        if (opts.populateCache) {
          self.stateManager.cache.clear()
        }
        cb()
      })
    }
  ], function (err) {
    cb(err, results)
  })

  // run the transaction hook
  function runTxHook(cb) {
    self.emit('beforeTx', tx, cb)
  }

  // run the transaction hook
  function runAfterTxHook(cb) {
    self.emit('afterTx', results, cb)
  }

  /**
     * populates the cache with the 'to' and 'from' of the tx
     */
  function populateCache(cb) {
    var accounts = new Set()
    accounts.add(tx.from.toString('hex'))
    accounts.add(block.header.coinbase.toString('hex'))

    if (tx.to.toString('hex') !== '') {
      accounts.add(tx.to.toString('hex'))
      self.stateManager.touched.push(tx.to)
    }

    if (opts.populateCache === false) {
      return cb()
    }

    self.stateManager.warmCache(accounts, cb)
  }

  // sets up the environment and runs a `call`
  function runCall(cb) {
    // check to the sender's account to make sure it has enough wei and the correct nonce
    var fromAccount = self.stateManager.cache.get(tx.from)
    var message

    // @note: @here: @next: make sure that the kyc'd path is not breached.

    // a far "left" is a sovereign account holder, with multiple linked sub-accounts.
    // the main account is effectively a straw-man for the soverign account holder's will, allowing a linked
    // "entity" that has enormous freedoms. from this main account, subaccounts can be created that are either
    // of the same subaligned-linkage philosophy and carry no regulatory associations, or are ascribed to fulfill
    // the conditions of an ecosystem regulatory (the "far right"). We'll label the subaligned-linkage L.

    // effectively, to serve both the far "left" and the far "right" simultaneously, buy-in has to come from the
    // far "left" (in this case the sovereign user), to the far "right"'s regulation. We'll label this L!.

    // thus, a far "left" cannot send to another far "left" if the latter has ascribed to be under a jurisdictional
    // regulatory environment (hopefully a sensical decision, like lower taxes while within the regulatory channel)
    // and the kyc of the former far "left" is incomplete or incompatible.

    // L -> L
    // L /-> L!
    // L! -> L!

    // as we can see, the only restriction is from an L to L! 'being', with a subjective rationale for this friction
    // whether it be a trust anchor failure, unavailable resources to pay for a sub-aligned insurance agent (neutral
    // watchdogs that perform extremely high security vetting), or the sovereign entity being caught in extra-legal
    // issues that would relate to the subaligned-linkage tree being in dispute, such as divorces where the existing
    // legal entities in that jurisdiction believe they can appropriate extra-regional assets.

    // this system is designed to allow for fractional seizure capabilities (and thus the trust in the regional
    // legal systems which would prevent unanticipated and unjust seizure) within what are called "Trust Channels"
    // that can automatically and without intervention handle historically daunting collection issue such as taxes,
    // while enabling the entirety of the market to utilize capital that would historically be immobile during such
    // a pre-collection period. indeed, if the taxes are automatically distributed, there need be no reporting
    // period, feedback loops on tax expenditure and local common good experience can be tightened, and there should
    // be a firm financial incentive for releasing this opportunity to the channels that would ordinarily never
    // touch it.

    // the growth potential of this system is simply stated as such: if there need not be trust in the protocol
    // operations, if redundancies are balanced with overall costs, and if there are strong forward-vetting
    // methodologies from the user to the regulations they are agreeing to be bound to, there should be no barrier
    // to the fluidity of the transactions, and thus the monetary velocity is increased by exactly this amount.

    // https://en.wikipedia.org/wiki/Middle_Way


    if (!opts.skipBalance && new BN(fromAccount.balance).lt(tx.getUpfrontCost())) {
      message = "sender doesn't have enough funds to send tx. The upfront cost is: " + tx.getUpfrontCost().toString() + ' and the sender\'s account only has: ' + new BN(fromAccount.balance).toString()
      cb(new Error(message))
      return
    } else if (!opts.skipNonce && !(new BN(fromAccount.nonce).eq(new BN(tx.nonce)))) {
      message = "the tx doesn't have the correct nonce. account has nonce of: " + new BN(fromAccount.nonce).toString() + ' tx has nonce of: ' + new BN(tx.nonce).toString()
      cb(new Error(message))
      return
    }

    // increment the nonce
    fromAccount.nonce = new BN(fromAccount.nonce).addn(1)

    basefee = tx.getBaseFee()
    gasLimit = new BN(tx.gasLimit)
    if (gasLimit.lt(basefee)) {
      return cb(new Error('base fee exceeds gas limit'))
    }
    gasLimit.isub(basefee)

    fromAccount.balance = new BN(fromAccount.balance).sub(new BN(tx.gasLimit).mul(new BN(tx.gasPrice)))
    self.stateManager.cache.put(tx.from, fromAccount)

    var options = {
      caller: tx.from,
      gasLimit: gasLimit,
      gasPrice: tx.gasPrice,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      block: block,
      populateCache: false
    }

    if (tx.to.toString('hex') === '') {
      delete options.to
    }

    // run call
    self.runCall(options, parseResults)

    function parseResults(err, _results) {
      if (err) return cb(err)
      results = _results

      // generate the bloom for the tx
      results.bloom = txLogsBloom(results.vm.logs)
      fromAccount = self.stateManager.cache.get(tx.from)

      // caculate the total gas used
      results.gasUsed = results.gasUsed.add(basefee)

      // process any gas refund
      var gasRefund = results.vm.gasRefund
      if (gasRefund) {
        if (gasRefund.lt(results.gasUsed.divn(2))) {
          results.gasUsed.isub(gasRefund)
        } else {
          results.gasUsed.isub(results.gasUsed.divn(2))
        }
      }

      results.amountSpent = results.gasUsed.mul(new BN(tx.gasPrice))
      // refund the leftover gas amount
      fromAccount.balance = new BN(tx.gasLimit).sub(results.gasUsed)
        .mul(new BN(tx.gasPrice))
        .add(new BN(fromAccount.balance))

      self.stateManager.cache.put(tx.from, fromAccount)
      self.stateManager.touched.push(tx.from)

      var minerAccount = self.stateManager.cache.get(block.header.coinbase)
      // add the amount spent on gas to the miner's account
      minerAccount.balance = new BN(minerAccount.balance)
        .add(results.amountSpent)

      // save the miner's account
      if (!(new BN(minerAccount.balance).isZero())) {
        self.stateManager.cache.put(block.header.coinbase, minerAccount)
      }

      if (!results.vm.selfdestruct) {
        results.vm.selfdestruct = {}
      }

      var keys = Object.keys(results.vm.selfdestruct)

      keys.forEach(function (s) {
        self.stateManager.cache.del(Buffer.from(s, 'hex'))
      })

      // delete all touched accounts
      var touched = self.stateManager.touched
      async.forEach(touched, function (address, next) {
        self.stateManager.accountIsEmpty(address, function (err, empty) {
          if (err) {
            next(err)
            return
          }

          if (empty) {
            self.stateManager.cache.del(address)
          }
          next(null)
        })
      },
      function () {
        self.stateManager.touched = []
        cb()
      })
    }
  }

  function saveTries(cb) {
    self.stateManager.commitContracts(cb)
  }
}

/**
 * @method txLogsBloom
 */
function txLogsBloom(logs) {
  var bloom = new Bloom()
  if (logs) {
    for (var i = 0; i < logs.length; i++) {
      var log = logs[i]
      // add the address
      bloom.add(log[0])
      // add the topics
      var topics = log[1]
      for (var q = 0; q < topics.length; q++) {
        bloom.add(topics[q])
      }
    }
  }
  return bloom
}
