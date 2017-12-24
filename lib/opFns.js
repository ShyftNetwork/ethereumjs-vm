const Buffer = require('safe-buffer').Buffer
const async = require('async')
const fees = require('ethereum-common')
const utils = require('ethereumjs-util')
const BN = utils.BN
const constants = require('./constants.js')
const logTable = require('./logTable.js')
const ERROR = constants.ERROR
const MAX_INT = 9007199254740991

// the opcode functions
module.exports = {
  STOP: function (runState) {
    runState.stopped = true
  },
  ADD: function (a, b, runState) {
    return new BN(a)
      .iadd(new BN(b))
      .mod(utils.TWO_POW256)
      .toArrayLike(Buffer, 'be', 32)
  },
  MUL: function (a, b, runState) {
    return new BN(a)
      .imul(new BN(b))
      .mod(utils.TWO_POW256)
      .toArrayLike(Buffer, 'be', 32)
  },
  SUB: function (a, b, runState) {
    return utils.toUnsigned(
      new BN(a)
        .isub(new BN(b))
    )
  },
  DIV: function (a, b, runState) {
    b = new BN(b)

    if (b.isZero()) {
      return Buffer.from([0])
    } else {
      a = new BN(a)
      return a.div(b).toArrayLike(Buffer, 'be', 32)
    }
  },
  SDIV: function (a, b, runState) {
    b = utils.fromSigned(b)

    if (b.isZero()) {
      return Buffer.from([0])
    } else {
      a = utils.fromSigned(a)
      return utils.toUnsigned(a.div(b))
    }
  },
  MOD: function (a, b, runState) {
    b = new BN(b)

    if (b.isZero()) {
      return Buffer.from([0])
    } else {
      a = new BN(a)
      return a.mod(b).toArrayLike(Buffer, 'be', 32)
    }
  },
  SMOD: function (a, b, runState) {
    b = utils.fromSigned(b)
    var r

    if (b.isZero()) {
      r = Buffer.from([0])
    } else {
      a = utils.fromSigned(a)
      r = a.abs().mod(b.abs())
      if (a.isNeg()) {
        r = r.ineg()
      }

      r = utils.toUnsigned(r)
    }
    return r
  },
  ADDMOD: function (a, b, c, runState) {
    c = new BN(c)

    if (c.isZero()) {
      return Buffer.from([0])
    } else {
      a = new BN(a).iadd(new BN(b))
      return a.mod(c).toArrayLike(Buffer, 'be', 32)
    }
  },
  MULMOD: function (a, b, c, runState) {
    c = new BN(c)

    if (c.isZero()) {
      return Buffer.from([0])
    } else {
      a = new BN(a).imul(new BN(b))
      return a.mod(c).toArrayLike(Buffer, 'be', 32)
    }
  },
  EXP: function (base, exponent, runState) {
    base = new BN(base)
    exponent = new BN(exponent)
    var m = BN.red(utils.TWO_POW256)

    base = base.toRed(m)

    if (!exponent.isZero()) {
      var bytes = 1 + logTable(exponent)
      subGas(runState, new BN(bytes).muln(fees.expByteGas.v))
      return base.redPow(exponent).toArrayLike(Buffer, 'be', 32)
    } else {
      return Buffer.from([1])
    }
  },
  SIGNEXTEND: function (k, val, runState) {
    k = new BN(k)
    val = Buffer.from(val) // use clone, don't modify object reference
    var extendOnes = false

    if (k.lten(31)) {
      k = k.toNumber()

      if (val[31 - k] & 0x80) {
        extendOnes = true
      }

      // 31-k-1 since k-th byte shouldn't be modified
      for (var i = 30 - k; i >= 0; i--) {
        val[i] = extendOnes ? 0xff : 0
      }
    }

    return val
  },
  // 0x10 range - bit ops
  LT: function (a, b, runState) {
    return Buffer.from([
      new BN(a).lt(new BN(b))
    ])
  },
  GT: function (a, b, runState) {
    return Buffer.from([
      new BN(a).gt(new BN(b))
    ])
  },
  SLT: function (a, b, runState) {
    return Buffer.from([
      utils.fromSigned(a).lt(utils.fromSigned(b))
    ])
  },
  SGT: function (a, b, runState) {
    return Buffer.from([
      utils.fromSigned(a).gt(utils.fromSigned(b))
    ])
  },
  EQ: function (a, b, runState) {
    a = utils.unpad(a)
    b = utils.unpad(b)
    return Buffer.from([a.toString('hex') === b.toString('hex')])
  },
  ISZERO: function (a, runState) {
    a = new BN(a)
    return Buffer.from([a.isZero()])
  },
  AND: function (a, b, runState) {
    return new BN(a)
      .iand(new BN(b))
      .toArrayLike(Buffer, 'be', 32)
  },
  OR: function (a, b, runState) {
    return new BN(a)
      .ior(new BN(b))
      .toArrayLike(Buffer, 'be', 32)
  },
  XOR: function (a, b, runState) {
    return new BN(a)
      .ixor(new BN(b))
      .toArrayLike(Buffer, 'be', 32)
  },
  NOT: function (a, runState) {
    return new BN(a)
      .inotn(256)
      .toArrayLike(Buffer, 'be', 32)
  },
  BYTE: function (pos, word, runState) {
    pos = new BN(pos)
    if (pos.gten(32)) {
      return Buffer.from([0])
    }

    pos = pos.toNumber()
    word = utils.setLengthLeft(word, 32)

    return utils.intToBuffer(word[pos])
  },
  // 0x20 range - crypto
  SHA3: function (offset, length, runState) {
    offset = utils.bufferToInt(offset)
    length = utils.bufferToInt(length)
    var data = memLoad(runState, offset, length)
    // copy fee
    subGas(runState, new BN(fees.sha3WordGas.v).imuln(Math.ceil(length / 32)))
    return utils.sha3(data)
  },
  // @note: @todo: @here:
  TOPOINT: function () {

  },
  // 0x30 range - closure state
  ADDRESS: function (runState) {
    return runState.address
  },
  BALANCE: function (address, runState, cb) {
    var stateManager = runState.stateManager
    // stack to address
    address = utils.setLengthLeft(address, 20)

    // shortcut if current account
    if (address.toString('hex') === runState.address.toString('hex')) {
      cb(null, utils.setLengthLeft(runState.contract.balance, 32))
      return
    }

    // otherwise load account then return balance
    stateManager.getAccountBalance(address, cb)
  },
  ORIGIN: function (runState) {
    return runState.origin
  },
  CALLER: function (runState) {
    return runState.caller
  },
  CALLVALUE: function (runState) {
    return runState.callValue
  },
  CALLDATALOAD: function (pos, runState) {
    pos = new BN(pos)

    var loaded
    if (pos.gtn(runState.callData.length)) {
      loaded = Buffer.from([0])
    } else {
      pos = pos.toNumber()
      loaded = runState.callData.slice(pos, pos + 32)
      loaded = loaded.length ? loaded : Buffer.from([0])
    }

    return utils.setLengthRight(loaded, 32)
  },
  CALLDATASIZE: function (runState) {
    if (runState.callData.length === 1 && runState.callData[0] === 0) {
      return Buffer.from([0])
    } else {
      return utils.intToBuffer(runState.callData.length)
    }
  },
  CALLDATACOPY: function (memOffset, dataOffset, dataLength, runState) {
    memOffset = utils.bufferToInt(memOffset)
    dataLength = utils.bufferToInt(dataLength)
    dataOffset = utils.bufferToInt(dataOffset)

    memStore(runState, memOffset, runState.callData, dataOffset, dataLength)
    // sub the COPY fee
    subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(dataLength / 32)))
  },
  CODESIZE: function (runState) {
    return utils.intToBuffer(runState.code.length)
  },
  CODECOPY: function (memOffset, codeOffset, length, runState) {
    memOffset = utils.bufferToInt(memOffset)
    codeOffset = utils.bufferToInt(codeOffset)
    length = utils.bufferToInt(length)

    memStore(runState, memOffset, runState.code, codeOffset, length)
    // sub the COPY fee
    subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(length / 32)))
  },
  EXTCODESIZE: function (address, runState, cb) {
    var stateManager = runState.stateManager
    address = utils.setLengthLeft(address, 20)
    stateManager.getContractCode(address, function (err, code) {
      if (err) return cb(err)
      cb(null, utils.intToBuffer(code.length))
    })
  },
  EXTCODECOPY: function (address, memOffset, codeOffset, length, runState, cb) {
    var stateManager = runState.stateManager
    address = utils.setLengthLeft(address, 20)
    memOffset = utils.bufferToInt(memOffset)
    codeOffset = utils.bufferToInt(codeOffset)
    length = utils.bufferToInt(length)

    // FIXME: for some reason this must come before subGas
    subMemUsage(runState, memOffset, length)
    // copy fee
    subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(length / 32)))

    stateManager.getContractCode(address, function (err, code) {
      if (err) return cb(err)
      memStore(runState, memOffset, code, codeOffset, length, false)
      cb(null)
    })
  },
  RETURNDATASIZE: function (runState) {
    return utils.intToBuffer(runState.lastReturned.length)
  },
  RETURNDATACOPY: function (memOffset, returnDataOffset, length, runState) {
    memOffset = utils.bufferToInt(memOffset)
    returnDataOffset = utils.bufferToInt(returnDataOffset)
    length = utils.bufferToInt(length)

    if (returnDataOffset + length > runState.lastReturned.length) {
      trap(ERROR.OUT_OF_GAS)
    }

    memStore(runState, memOffset, utils.toBuffer(runState.lastReturned), returnDataOffset, length, false)
    // sub the COPY fee
    subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(length / 32)))
  },
  GASPRICE: function (runState) {
    return utils.setLengthLeft(runState.gasPrice, 32)
  },
  // '0x40' range - block operations
  BLOCKHASH: function (number, runState, cb) {
    var stateManager = runState.stateManager
    var diff = new BN(runState.block.header.number).sub(new BN(number))

    // block lookups must be within the past 256 blocks
    if (diff.gtn(256) || diff.lten(0)) {
      cb(null, Buffer.from([0]))
      return
    }

    stateManager.getBlockHash(number, function (err, blockHash) {
      if (err) return cb(err)
      cb(null, blockHash)
    })
  },
  COINBASE: function (runState) {
    return utils.setLengthLeft(runState.block.header.coinbase, 32)
  },
  TIMESTAMP: function (runState) {
    return utils.setLengthLeft(runState.block.header.timestamp, 32)
  },
  NUMBER: function (runState) {
    return utils.setLengthLeft(runState.block.header.number, 32)
  },
  DIFFICULTY: function (runState) {
    return utils.setLengthLeft(runState.block.header.difficulty, 32)
  },
  GASLIMIT: function (runState) {
    return utils.setLengthLeft(runState.block.header.gasLimit, 32)
  },
  // 0x50 range - 'storage' and execution
  POP: function () {
  },
  MLOAD: function (pos, runState) {
    pos = utils.bufferToInt(pos)
    var loaded = utils.unpad(memLoad(runState, pos, 32))
    return loaded
  },
  MSTORE: function (offset, word, runState) {
    offset = utils.bufferToInt(offset)
    word = utils.setLengthLeft(word, 32)
    memStore(runState, offset, word, 0, 32)
  },
  MSTORE8: function (offset, byte, runState) {
    offset = utils.bufferToInt(offset)
    // grab the last byte
    byte = byte.slice(byte.length - 1)
    memStore(runState, offset, byte, 0, 1)
  },
  SLOAD: function (key, runState, cb) {
    var stateManager = runState.stateManager
    key = utils.setLengthLeft(key, 32)

    stateManager.getContractStorage(runState.address, key, function (err, value) {
      if (err) return cb(err)
      value = value.length ? value : Buffer.from([0])
      cb(null, value)
    })
  },
  SSTORE: function (key, val, runState, cb) {
    if (runState.static) {
      trap(ERROR.STATIC_STATE_CHANGE)
    }
    var stateManager = runState.stateManager
    var address = runState.address
    key = utils.setLengthLeft(key, 32)
    var value = utils.unpad(val)

    stateManager.getContractStorage(runState.address, key, function (err, found) {
      if (err) return cb(err)
      try {
        if (value.length === 0 && !found.length) {
          subGas(runState, new BN(fees.sstoreResetGas.v))
        } else if (value.length === 0 && found.length) {
          subGas(runState, new BN(fees.sstoreResetGas.v))
          runState.gasRefund.iadd(new BN(fees.sstoreRefundGas.v))
        } else if (value.length !== 0 && !found.length) {
          subGas(runState, new BN(fees.sstoreSetGas.v))
        } else if (value.length !== 0 && found.length) {
          subGas(runState, new BN(fees.sstoreResetGas.v))
        }
      } catch (e) {
        cb(e.error)
        return
      }

      stateManager.putContractStorage(address, key, value, function (err) {
        if (err) return cb(err)
        runState.contract = stateManager.cache.get(address)
        cb(null)
      })
    })
  },
  JUMP: function (dest, runState) {
    dest = new BN(dest)

    if (dest.gtn(runState.code.length)) {
      trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
    }

    dest = dest.toNumber()

    if (!jumpIsValid(runState, dest)) {
      trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
    }

    runState.programCounter = dest
  },
  JUMPI: function (dest, cond, runState) {
    dest = new BN(dest)
    cond = new BN(cond)

    if (!cond.isZero()) {
      if (dest.gtn(runState.code.length)) {
        trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
      }

      dest = dest.toNumber()

      if (!jumpIsValid(runState, dest)) {
        trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
      }

      runState.programCounter = dest
    }
  },
  PC: function (runState) {
    return utils.intToBuffer(runState.programCounter - 1)
  },
  MSIZE: function (runState) {
    return utils.intToBuffer(runState.memoryWordCount * 32)
  },
  GAS: function (runState) {
    return runState.gasLeft.toArrayLike(Buffer, 'be', 32)
  },
  JUMPDEST: function (runState) {
  },
  PUSH: function (runState) {
    const numToPush = runState.opCode - 0x5f
    const loaded = utils.setLengthLeft(runState.code.slice(runState.programCounter, runState.programCounter + numToPush), 32)
    runState.programCounter += numToPush
    return loaded
  },
  DUP: function (runState) {
    const stackPos = runState.opCode - 0x7f
    if (stackPos > runState.stack.length) {
      trap(ERROR.STACK_UNDERFLOW)
    }
    // dupilcated stack items point to the same Buffer
    return runState.stack[runState.stack.length - stackPos]
  },
  SWAP: function (runState) {
    var stackPos = runState.opCode - 0x8f

    // check the stack to make sure we have enough items on teh stack
    var swapIndex = runState.stack.length - stackPos - 1
    if (swapIndex < 0) {
      trap(ERROR.STACK_UNDERFLOW)
    }

    // preform the swap
    var newTop = runState.stack[swapIndex]
    runState.stack[swapIndex] = runState.stack.pop()
    return newTop
  },
  LOG: function (memOffset, memLength) {
    var args = Array.prototype.slice.call(arguments, 0)
    var runState = args.pop()
    if (runState.static) {
      trap(ERROR.STATIC_STATE_CHANGE)
    }

    var topics = args.slice(2)
    topics = topics.map(function (a) {
      return utils.setLengthLeft(a, 32)
    })

    memOffset = utils.bufferToInt(memOffset)
    memLength = utils.bufferToInt(memLength)
    const numOfTopics = runState.opCode - 0xa0
    const mem = memLoad(runState, memOffset, memLength)
    subGas(runState, new BN(fees.logTopicGas.v).imuln(numOfTopics).iadd(new BN(fees.logDataGas.v).imuln(memLength)))

    // add address
    var log = [runState.address]
    log.push(topics)

    // add data
    log.push(mem)
    runState.logs.push(log)
  },

  // 0xb0 GETATTEST
  // get all attestations for an address

  // 0xb1 GETATTESTTA
  // get all attestations for an address by a trust anchor

  // 0xb2 GETATTESTJURIS
  // get all attestations for an address in a jurisdiction

  // 0xb3 GETATTESTTAJURIS
  // get all attestations for an address in a jurisdiction by a trust anchor

  // 0xb4 GETVALIDATTEST
  // get all valid attestations for an address

  // 0xb5 GETVALIDATTESTTA
  // get all valid attestations for an address by a trust anchor

  // 0xb6 GETVALIDATTESTJURIS
  // get all valid attestations for an address in a jurisdiction

  // 0xb7 GETVALIDATTESTTAJURIS
  // get all valid attestations for an address in a jurisdiction by a trust anchor

  // 0xb8 GETREVOKE
  // Gets all revocations for an address

  // 0xbb CHECKATTESTVALID
  // checks whether an attestation (specified by indentified address and nonce) is still valid

  // 0xbc GETACTIVEREVOKE
  // Gets all active revocations for an address

  // 0xbd GETACTIVEREVOKETA
  // Gets all active revocations made for an address by a trust anchor

  // 0xbe GETACTIVEREVOKEJURIS
  // Gets all active revocations made for an address in a jurisdiction

  // 0xbf GETACTIVEREVOKETAJURIS
  // Gets all active revocations made for an address in a jurisdiction by a trust anchor

  // '0xb0' range - identity
  // 0xb0: ['GETATTEST', 0, 1, 1, false, false],
  // 0xb1: ['GETATTESTTA', 0, 1, 1, false, false],
  // 0xb2: ['GETATTESTJURIS', 0, 1, 1, false, false],
  // 0xb3: ['GETATTESTTAJURIS', 0, 1, 1, false, false],
  // 0xb4: ['GETVALIDATTEST', 0, 1, 1, false, false],
  // 0xb5: ['GETVALIDATTESTTA', 0, 1, 1, false, false],
  // 0xb6: ['GETVALIDATTESTJURIS', 0, 1, 1, false, false],
  // 0xb7: ['GETVALIDATTESTTAJURIS', 0, 1, 1, false, false],
  // 0xb8: ['GETREVOKE', 0, 1, 1, false, false],
  // 0xbb: ['CHECKATTESTVALID', 0, 1, 1, false, false],
  // 0xbc: ['GETACTIVEREVOKE', 0, 1, 1, false, false],
  // 0xbd: ['GETACTIVEREVOKETA', 0, 1, 1, false, false],
  // 0xbe: ['GETACTIVEREVOKEJURIS', 0, 1, 1, false, false],
  // 0xbf: ['GETACTIVEREVOKETAJURIS', 0, 1, 1, false, false],


  // ADDRESS: function (runState) {
  //     return runState.address
  // },
  // BALANCE: function (address, runState, cb) {
  //     var stateManager = runState.stateManager
  //     // stack to address
  //     address = utils.setLengthLeft(address, 20)
  //
  //     // shortcut if current account
  //     if (address.toString('hex') === runState.address.toString('hex')) {
  //         cb(null, utils.setLengthLeft(runState.contract.balance, 32))
  //         return
  //     }
  //
  //     // otherwise load account then return balance
  //     stateManager.getAccountBalance(address, cb)
  // },
  //
  //   0x21 (TOPOINT)
  //
  //   Pops an x co-ordinate from the stack, and solves for the point (x,y) on the
  //   secp256k1 elliptic curve. If no solution exists, the maximum (unsigned) 256-bit
  // integer is pushed to the stack, otherwise y is pushed to the stack.
  //
  //
  //
  //


  // 0xb0 (GETATTEST)
  //
  // Pops an account address from the stack, and retrieves the identity state for
  //   that address (i.e. all attestations in the ledger having that address as their
  // identified address). The identity state is serialized (by serializing individual
  // attestations, concatenating them, and RLP-encoding the resulting bytestream)
  // and loaded in to memory starting at the address b. b is then pushed to the
  // stack. If the address popped from the stack is not a valid address (i.e. it is
  // too large), the value pushed will be the same as for a valid address with no
  //   attestations (a pointer to an RLP-encoded null string).

  // @note: @here: @todo: @next: functionality for the ITX EVM codes
  GETATTEST: function (address, runState, cb) {
    var stateManager = runState.stateManager;
    address = utils.setLengthLeft(address, 20);

    // shortcut if current account
    if (address.toString('hex') === runState.address.toString('hex')) {
      cb(null, utils.setLengthLeft(runState.attestation, 32))
      return
    }

    // otherwise load account then return identity attestations
    stateManager.getIdentityAttestations(address, cb)
  },

  // 0xb1 (GETATTESTTA)
  //
  // Functions the same as 0xb0, except after the account address is popped from the
  // stack, an additional address is popped from the stack. The pushed identity state
  // is reduced/restricted to only include attestations whose trust anchor field
  // matches this additional address.
  //
  GETATTESTTA: function (address, runState, cb) {
    var stateManager = runState.stateManager;
    address = utils.setLengthLeft(address, 20);

    // shortcut if current account
    if (address.toString('hex') === runState.address.toString('hex')) {
      cb(null, utils.setLengthLeft(runState.attestation, 32))
      return
    }

    // otherwise load account then return identity attestations
    stateManager.getIdentityAttestations(address, cb)
  },

  //
  // 0xb2 (GETATTESTJURIS)
  //
  // Functions the same as 0xb1, except instead of popping an additional address from
  // the stack, a pointer to an RLP-encoded jurisdiction string (in memory) is popped
  // from the stack. The pushed identity state is reduced/restricted to attestations
  // whose jurisdiction field matches the jurisdiction string popped from the stack.
  //
  //
  // 0xb3 (GETATTESTTAJURIS)
  //
  // Functions like 0xb0 except an additional address is popped from the stack, and
  // then a pointed is popped from the stack. The pushed identity state is
  // reduced/restricted to only include attestations which match the additional
  // address as in 0xb1 AND match the pointer as in 0xb2.
  //
  //
  // 0xb4 (GETVALIDATTEST)
  //
  // Functions like 0xb0, but only valid attestations (i.e. those which have taken
  // effect, and have not expired, been revoked, or been superceded) are included in
  // the pushed identity state.
  //
  //
  // 0xb5 (GETVALIDATTESTTA)
  //
  // Functions like 0xb1, but only valid attestations (i.e. those which have taken
  // effect, and have not expired, been revoked, or been superceded) are included in
  // the pushed identity state.
  //
  //
  // 0xb6 (GETVALIDATTESTJURIS)
  //
  // Functions like 0xb2, but only valid attestations (i.e. those which have taken
  // effect, and have not expired, been revoked, or been superceded) are included in
  // the pushed identity state.
  //
  //
  // 0xb7 (GETVALISATTESTTAJURIS)
  //
  // Functions like 0xb3, but only valid attestations (i.e. those which have taken
  // effect, and have not expired, been revoked, or been superceded) are included in
  // the pushed identity state.
  //
  //
  // 0xb8 (GETREVOKE)
  //
  // Functions like 0xb0, but only attestations which are revocations (i.e. those
  // whose replacement address is non-zero) are included in the pushed identity
  // state.
  //
  //
  // 0xbb (CHECKATTESTVALID)
  //
  // Pops an account address from the stack, then pops a nonce from the stack, and
  // then searches the popped address's identity state for an attestation whose nonce
  // matches the popped nonce. If there is no such address, the validity value v is
  // set to 2^160 (i.e. 1 more than the maximum possible address value).
  //
  // If the attestation exists, but is either expired (i.e. its expiry field is less
  // (i.e. earlier) than the timestamp on the parent block's header) or has not yet
  // taken effect (i.e. its effective time field is greater (i.e. later) than the
  // timestamp on the parent block's header), then the validity value is set to
  // 2^160 - 1 (i.e. the maximum possible address value -- which is a reserved
  // address for attestation functions)
  //
  // If the attestation exists, has taken effect, and is not yet expired, but it has
  // been revoked, then the validity value is set to the replacement field on the
  // effective revocation (i.e. the first applicable revocation to provide a
  // non-reserved address, or the first overall, if no revocation yet provides a
  // non-reserved address).
  //
  // If the attestation exists and is valid (i.e. it has taken effect, and has
  // neither expired nor been revoked), the validity value is set to 0.
  //
  // More succinctly, if the attestation is still valid, the validity value is set to
  // 0; if the attestation is not valid, and a replacement address is available, the
  // validity value is set to the replacement address; if the attestation is not
  // valid, and no replacement address is available, the validity value is set to
  // (the reserved address value) 2^160 - 1; if the attestation does not exist at all
  // the validity value is set to 2^160.
  //
  // The validity address is then pushed to the stack.
  //
  //
  // 0xbc (GETACTIVEREVOKE)
  //
  // Functions like 0xb8, but only revocations which are active (i.e. those which
  // have not been preceded by a revocation covering all the same attestations and
  // also providing a replacement address) are included in the pushed identity state.
  //
  //
  // 0cbd (GETACTIVEREVOKETA)
  //
  // Functions the same as 0xbc, except after the account address is popped from the
  // stack, an additional address is popped from the stack. The pushed identity state
  // is reduced/restricted to only include attestations whose trust anchor field
  // matches this additional address.
  //
  //
  // 0xbe (GETACTIVEREVOKEJURIS)
  //
  // Functions the same as 0xbd, except instead of popping an additional address from
  // the stack, a pointer to an RLP-encoded jurisdiction string (in memory) is popped
  // from the stack. The pushed identity state is reduced/restricted to attestations
  // whose jurisdiction field matches the jurisdiction string popped from the stack.
  //
  //
  // 0xb3 (GETACTIVEREVOKETAJURIS)
  //
  // Functions like 0xb8 except an additional address is popped from the stack, and
  // then a pointed is popped from the stack. The pushed identity state is
  // reduced/restricted to only include attestations which match the additional
  // address as in 0xb1 AND match the pointer as in 0xb2.
  //
  // '0xf0' range - closures
  CREATE: function (value, offset, length, runState, done) {
    if (runState.static) {
      trap(ERROR.STATIC_STATE_CHANGE)
    }const Buffer = require('safe-buffer').Buffer
    const async = require('async')
    const fees = require('ethereum-common')
    const utils = require('ethereumjs-util')
    const BN = utils.BN
    const constants = require('./constants.js')
    const logTable = require('./logTable.js')
    const ERROR = constants.ERROR
    const MAX_INT = 9007199254740991

    // the opcode functions
    module.exports = {
      STOP: function (runState) {
        runState.stopped = true
      },
      ADD: function (a, b, runState) {
        return new BN(a)
          .iadd(new BN(b))
          .mod(utils.TWO_POW256)
          .toArrayLike(Buffer, 'be', 32)
      },
      MUL: function (a, b, runState) {
        return new BN(a)
          .imul(new BN(b))
          .mod(utils.TWO_POW256)
          .toArrayLike(Buffer, 'be', 32)
      },
      SUB: function (a, b, runState) {
        return utils.toUnsigned(
          new BN(a)
            .isub(new BN(b))
        )
      },
      DIV: function (a, b, runState) {
        b = new BN(b)

        if (b.isZero()) {
          return Buffer.from([0])
        } else {
          a = new BN(a)
          return a.div(b).toArrayLike(Buffer, 'be', 32)
        }
      },
      SDIV: function (a, b, runState) {
        b = utils.fromSigned(b)

        if (b.isZero()) {
          return Buffer.from([0])
        } else {
          a = utils.fromSigned(a)
          return utils.toUnsigned(a.div(b))
        }
      },
      MOD: function (a, b, runState) {
        b = new BN(b)

        if (b.isZero()) {
          return Buffer.from([0])
        } else {
          a = new BN(a)
          return a.mod(b).toArrayLike(Buffer, 'be', 32)
        }
      },
      SMOD: function (a, b, runState) {
        b = utils.fromSigned(b)
        var r

        if (b.isZero()) {
          r = Buffer.from([0])
        } else {
          a = utils.fromSigned(a)
          r = a.abs().mod(b.abs())
          if (a.isNeg()) {
            r = r.ineg()
          }

          r = utils.toUnsigned(r)
        }
        return r
      },
      ADDMOD: function (a, b, c, runState) {
        c = new BN(c)

        if (c.isZero()) {
          return Buffer.from([0])
        } else {
          a = new BN(a).iadd(new BN(b))
          return a.mod(c).toArrayLike(Buffer, 'be', 32)
        }
      },
      MULMOD: function (a, b, c, runState) {
        c = new BN(c)

        if (c.isZero()) {
          return Buffer.from([0])
        } else {
          a = new BN(a).imul(new BN(b))
          return a.mod(c).toArrayLike(Buffer, 'be', 32)
        }
      },
      EXP: function (base, exponent, runState) {
        base = new BN(base)
        exponent = new BN(exponent)
        var m = BN.red(utils.TWO_POW256)

        base = base.toRed(m)

        if (!exponent.isZero()) {
          var bytes = 1 + logTable(exponent)
          subGas(runState, new BN(bytes).muln(fees.expByteGas.v))
          return base.redPow(exponent).toArrayLike(Buffer, 'be', 32)
        } else {
          return Buffer.from([1])
        }
      },
      SIGNEXTEND: function (k, val, runState) {
        k = new BN(k)
        val = Buffer.from(val) // use clone, don't modify object reference
        var extendOnes = false

        if (k.lten(31)) {
          k = k.toNumber()

          if (val[31 - k] & 0x80) {
            extendOnes = true
          }

          // 31-k-1 since k-th byte shouldn't be modified
          for (var i = 30 - k; i >= 0; i--) {
            val[i] = extendOnes ? 0xff : 0
          }
        }

        return val
      },
      // 0x10 range - bit ops
      LT: function (a, b, runState) {
        return Buffer.from([
          new BN(a).lt(new BN(b))
        ])
      },
      GT: function (a, b, runState) {
        return Buffer.from([
          new BN(a).gt(new BN(b))
        ])
      },
      SLT: function (a, b, runState) {
        return Buffer.from([
          utils.fromSigned(a).lt(utils.fromSigned(b))
        ])
      },
      SGT: function (a, b, runState) {
        return Buffer.from([
          utils.fromSigned(a).gt(utils.fromSigned(b))
        ])
      },
      EQ: function (a, b, runState) {
        a = utils.unpad(a)
        b = utils.unpad(b)
        return Buffer.from([a.toString('hex') === b.toString('hex')])
      },
      ISZERO: function (a, runState) {
        a = new BN(a)
        return Buffer.from([a.isZero()])
      },
      AND: function (a, b, runState) {
        return new BN(a)
          .iand(new BN(b))
          .toArrayLike(Buffer, 'be', 32)
      },
      OR: function (a, b, runState) {
        return new BN(a)
          .ior(new BN(b))
          .toArrayLike(Buffer, 'be', 32)
      },
      XOR: function (a, b, runState) {
        return new BN(a)
          .ixor(new BN(b))
          .toArrayLike(Buffer, 'be', 32)
      },
      NOT: function (a, runState) {
        return new BN(a)
          .inotn(256)
          .toArrayLike(Buffer, 'be', 32)
      },
      BYTE: function (pos, word, runState) {
        pos = new BN(pos)
        if (pos.gten(32)) {
          return Buffer.from([0])
        }

        pos = pos.toNumber()
        word = utils.setLengthLeft(word, 32)

        return utils.intToBuffer(word[pos])
      },
      // 0x20 range - crypto
      SHA3: function (offset, length, runState) {
        offset = utils.bufferToInt(offset)
        length = utils.bufferToInt(length)
        var data = memLoad(runState, offset, length)
        // copy fee
        subGas(runState, new BN(fees.sha3WordGas.v).imuln(Math.ceil(length / 32)))
        return utils.sha3(data)
      },
      // @note: @todo: @here:
      TOPOINT: function () {

      },
      // 0x30 range - closure state
      ADDRESS: function (runState) {
        return runState.address
      },
      BALANCE: function (address, runState, cb) {
        var stateManager = runState.stateManager
        // stack to address
        address = utils.setLengthLeft(address, 20)

        // shortcut if current account
        if (address.toString('hex') === runState.address.toString('hex')) {
          cb(null, utils.setLengthLeft(runState.contract.balance, 32))
          return
        }

        // otherwise load account then return balance
        stateManager.getAccountBalance(address, cb)
      },
      ORIGIN: function (runState) {
        return runState.origin
      },
      CALLER: function (runState) {
        return runState.caller
      },
      CALLVALUE: function (runState) {
        return runState.callValue
      },
      CALLDATALOAD: function (pos, runState) {
        pos = new BN(pos)

        var loaded
        if (pos.gtn(runState.callData.length)) {
          loaded = Buffer.from([0])
        } else {
          pos = pos.toNumber()
          loaded = runState.callData.slice(pos, pos + 32)
          loaded = loaded.length ? loaded : Buffer.from([0])
        }

        return utils.setLengthRight(loaded, 32)
      },
      CALLDATASIZE: function (runState) {
        if (runState.callData.length === 1 && runState.callData[0] === 0) {
          return Buffer.from([0])
        } else {
          return utils.intToBuffer(runState.callData.length)
        }
      },
      CALLDATACOPY: function (memOffset, dataOffset, dataLength, runState) {
        memOffset = utils.bufferToInt(memOffset)
        dataLength = utils.bufferToInt(dataLength)
        dataOffset = utils.bufferToInt(dataOffset)

        memStore(runState, memOffset, runState.callData, dataOffset, dataLength)
        // sub the COPY fee
        subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(dataLength / 32)))
      },
      CODESIZE: function (runState) {
        return utils.intToBuffer(runState.code.length)
      },
      CODECOPY: function (memOffset, codeOffset, length, runState) {
        memOffset = utils.bufferToInt(memOffset)
        codeOffset = utils.bufferToInt(codeOffset)
        length = utils.bufferToInt(length)

        memStore(runState, memOffset, runState.code, codeOffset, length)
        // sub the COPY fee
        subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(length / 32)))
      },
      EXTCODESIZE: function (address, runState, cb) {
        var stateManager = runState.stateManager
        address = utils.setLengthLeft(address, 20)
        stateManager.getContractCode(address, function (err, code) {
          if (err) return cb(err)
          cb(null, utils.intToBuffer(code.length))
        })
      },
      EXTCODECOPY: function (address, memOffset, codeOffset, length, runState, cb) {
        var stateManager = runState.stateManager
        address = utils.setLengthLeft(address, 20)
        memOffset = utils.bufferToInt(memOffset)
        codeOffset = utils.bufferToInt(codeOffset)
        length = utils.bufferToInt(length)

        // FIXME: for some reason this must come before subGas
        subMemUsage(runState, memOffset, length)
        // copy fee
        subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(length / 32)))

        stateManager.getContractCode(address, function (err, code) {
          if (err) return cb(err)
          memStore(runState, memOffset, code, codeOffset, length, false)
          cb(null)
        })
      },
      RETURNDATASIZE: function (runState) {
        return utils.intToBuffer(runState.lastReturned.length)
      },
      RETURNDATACOPY: function (memOffset, returnDataOffset, length, runState) {
        memOffset = utils.bufferToInt(memOffset)
        returnDataOffset = utils.bufferToInt(returnDataOffset)
        length = utils.bufferToInt(length)

        if (returnDataOffset + length > runState.lastReturned.length) {
          trap(ERROR.OUT_OF_GAS)
        }

        memStore(runState, memOffset, utils.toBuffer(runState.lastReturned), returnDataOffset, length, false)
        // sub the COPY fee
        subGas(runState, new BN(fees.copyGas.v).imuln(Math.ceil(length / 32)))
      },
      GASPRICE: function (runState) {
        return utils.setLengthLeft(runState.gasPrice, 32)
      },
      // '0x40' range - block operations
      BLOCKHASH: function (number, runState, cb) {
        var stateManager = runState.stateManager
        var diff = new BN(runState.block.header.number).sub(new BN(number))

        // block lookups must be within the past 256 blocks
        if (diff.gtn(256) || diff.lten(0)) {
          cb(null, Buffer.from([0]))
          return
        }

        stateManager.getBlockHash(number, function (err, blockHash) {
          if (err) return cb(err)
          cb(null, blockHash)
        })
      },
      COINBASE: function (runState) {
        return utils.setLengthLeft(runState.block.header.coinbase, 32)
      },
      TIMESTAMP: function (runState) {
        return utils.setLengthLeft(runState.block.header.timestamp, 32)
      },
      NUMBER: function (runState) {
        return utils.setLengthLeft(runState.block.header.number, 32)
      },
      DIFFICULTY: function (runState) {
        return utils.setLengthLeft(runState.block.header.difficulty, 32)
      },
      GASLIMIT: function (runState) {
        return utils.setLengthLeft(runState.block.header.gasLimit, 32)
      },
      // 0x50 range - 'storage' and execution
      POP: function () {
      },
      MLOAD: function (pos, runState) {
        pos = utils.bufferToInt(pos)
        var loaded = utils.unpad(memLoad(runState, pos, 32))
        return loaded
      },
      MSTORE: function (offset, word, runState) {
        offset = utils.bufferToInt(offset)
        word = utils.setLengthLeft(word, 32)
        memStore(runState, offset, word, 0, 32)
      },
      MSTORE8: function (offset, byte, runState) {
        offset = utils.bufferToInt(offset)
        // grab the last byte
        byte = byte.slice(byte.length - 1)
        memStore(runState, offset, byte, 0, 1)
      },
      SLOAD: function (key, runState, cb) {
        var stateManager = runState.stateManager
        key = utils.setLengthLeft(key, 32)

        stateManager.getContractStorage(runState.address, key, function (err, value) {
          if (err) return cb(err)
          value = value.length ? value : Buffer.from([0])
          cb(null, value)
        })
      },
      SSTORE: function (key, val, runState, cb) {
        if (runState.static) {
          trap(ERROR.STATIC_STATE_CHANGE)
        }
        var stateManager = runState.stateManager
        var address = runState.address
        key = utils.setLengthLeft(key, 32)
        var value = utils.unpad(val)

        stateManager.getContractStorage(runState.address, key, function (err, found) {
          if (err) return cb(err)
          try {
            if (value.length === 0 && !found.length) {
              subGas(runState, new BN(fees.sstoreResetGas.v))
            } else if (value.length === 0 && found.length) {
              subGas(runState, new BN(fees.sstoreResetGas.v))
              runState.gasRefund.iadd(new BN(fees.sstoreRefundGas.v))
            } else if (value.length !== 0 && !found.length) {
              subGas(runState, new BN(fees.sstoreSetGas.v))
            } else if (value.length !== 0 && found.length) {
              subGas(runState, new BN(fees.sstoreResetGas.v))
            }
          } catch (e) {
            cb(e.error)
            return
          }

          stateManager.putContractStorage(address, key, value, function (err) {
            if (err) return cb(err)
            runState.contract = stateManager.cache.get(address)
            cb(null)
          })
        })
      },
      JUMP: function (dest, runState) {
        dest = new BN(dest)

        if (dest.gtn(runState.code.length)) {
          trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
        }

        dest = dest.toNumber()

        if (!jumpIsValid(runState, dest)) {
          trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
        }

        runState.programCounter = dest
      },
      JUMPI: function (dest, cond, runState) {
        dest = new BN(dest)
        cond = new BN(cond)

        if (!cond.isZero()) {
          if (dest.gtn(runState.code.length)) {
            trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
          }

          dest = dest.toNumber()

          if (!jumpIsValid(runState, dest)) {
            trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
          }

          runState.programCounter = dest
        }
      },
      PC: function (runState) {
        return utils.intToBuffer(runState.programCounter - 1)
      },
      MSIZE: function (runState) {
        return utils.intToBuffer(runState.memoryWordCount * 32)
      },
      GAS: function (runState) {
        return runState.gasLeft.toArrayLike(Buffer, 'be', 32)
      },
      JUMPDEST: function (runState) {
      },
      PUSH: function (runState) {
        const numToPush = runState.opCode - 0x5f
        const loaded = utils.setLengthLeft(runState.code.slice(runState.programCounter, runState.programCounter + numToPush), 32)
        runState.programCounter += numToPush
        return loaded
      },
      DUP: function (runState) {
        const stackPos = runState.opCode - 0x7f
        if (stackPos > runState.stack.length) {
          trap(ERROR.STACK_UNDERFLOW)
        }
        // dupilcated stack items point to the same Buffer
        return runState.stack[runState.stack.length - stackPos]
      },
      SWAP: function (runState) {
        var stackPos = runState.opCode - 0x8f

        // check the stack to make sure we have enough items on teh stack
        var swapIndex = runState.stack.length - stackPos - 1
        if (swapIndex < 0) {
          trap(ERROR.STACK_UNDERFLOW)
        }

        // preform the swap
        var newTop = runState.stack[swapIndex]
        runState.stack[swapIndex] = runState.stack.pop()
        return newTop
      },
      LOG: function (memOffset, memLength) {
        var args = Array.prototype.slice.call(arguments, 0)
        var runState = args.pop()
        if (runState.static) {
          trap(ERROR.STATIC_STATE_CHANGE)
        }

        var topics = args.slice(2)
        topics = topics.map(function (a) {
          return utils.setLengthLeft(a, 32)
        })

        memOffset = utils.bufferToInt(memOffset)
        memLength = utils.bufferToInt(memLength)
        const numOfTopics = runState.opCode - 0xa0
        const mem = memLoad(runState, memOffset, memLength)
        subGas(runState, new BN(fees.logTopicGas.v).imuln(numOfTopics).iadd(new BN(fees.logDataGas.v).imuln(memLength)))

        // add address
        var log = [runState.address]
        log.push(topics)

        // add data
        log.push(mem)
        runState.logs.push(log)
      },

      // 0xb0 GETATTEST
      // get all attestations for an address

      // 0xb1 GETATTESTTA
      // get all attestations for an address by a trust anchor

      // 0xb2 GETATTESTJURIS
      // get all attestations for an address in a jurisdiction

      // 0xb3 GETATTESTTAJURIS
      // get all attestations for an address in a jurisdiction by a trust anchor

      // 0xb4 GETVALIDATTEST
      // get all valid attestations for an address

      // 0xb5 GETVALIDATTESTTA
      // get all valid attestations for an address by a trust anchor

      // 0xb6 GETVALIDATTESTJURIS
      // get all valid attestations for an address in a jurisdiction

      // 0xb7 GETVALIDATTESTTAJURIS
      // get all valid attestations for an address in a jurisdiction by a trust anchor

      // 0xb8 GETREVOKE
      // Gets all revocations for an address

      // 0xbb CHECKATTESTVALID
      // checks whether an attestation (specified by indentified address and nonce) is still valid

      // 0xbc GETACTIVEREVOKE
      // Gets all active revocations for an address

      // 0xbd GETACTIVEREVOKETA
      // Gets all active revocations made for an address by a trust anchor

      // 0xbe GETACTIVEREVOKEJURIS
      // Gets all active revocations made for an address in a jurisdiction

      // 0xbf GETACTIVEREVOKETAJURIS
      // Gets all active revocations made for an address in a jurisdiction by a trust anchor

      // '0xb0' range - identity
      // 0xb0: ['GETATTEST', 0, 1, 1, false, false],
      // 0xb1: ['GETATTESTTA', 0, 1, 1, false, false],
      // 0xb2: ['GETATTESTJURIS', 0, 1, 1, false, false],
      // 0xb3: ['GETATTESTTAJURIS', 0, 1, 1, false, false],
      // 0xb4: ['GETVALIDATTEST', 0, 1, 1, false, false],
      // 0xb5: ['GETVALIDATTESTTA', 0, 1, 1, false, false],
      // 0xb6: ['GETVALIDATTESTJURIS', 0, 1, 1, false, false],
      // 0xb7: ['GETVALIDATTESTTAJURIS', 0, 1, 1, false, false],
      // 0xb8: ['GETREVOKE', 0, 1, 1, false, false],
      // 0xbb: ['CHECKATTESTVALID', 0, 1, 1, false, false],
      // 0xbc: ['GETACTIVEREVOKE', 0, 1, 1, false, false],
      // 0xbd: ['GETACTIVEREVOKETA', 0, 1, 1, false, false],
      // 0xbe: ['GETACTIVEREVOKEJURIS', 0, 1, 1, false, false],
      // 0xbf: ['GETACTIVEREVOKETAJURIS', 0, 1, 1, false, false],


      // ADDRESS: function (runState) {
      //     return runState.address
      // },
      // BALANCE: function (address, runState, cb) {
      //     var stateManager = runState.stateManager
      //     // stack to address
      //     address = utils.setLengthLeft(address, 20)
      //
      //     // shortcut if current account
      //     if (address.toString('hex') === runState.address.toString('hex')) {
      //         cb(null, utils.setLengthLeft(runState.contract.balance, 32))
      //         return
      //     }
      //
      //     // otherwise load account then return balance
      //     stateManager.getAccountBalance(address, cb)
      // },

      // @note: @here: @todo: @next: functionality for the ITX EVM codes
      GETATTEST: function (address, runState, cb) {
        var stateManager = runState.stateManager;
        address = utils.setLengthLeft(address, 20);

        // shortcut if current account
        if (address.toString('hex') === runState.address.toString('hex')) {
          cb(null, utils.setLengthLeft(runState.account, 32))
          return
        }

        // otherwise load account then return balance
        stateManager.getAttestations(address, cb)
      },


      // '0xf0' range - closures
      CREATE: function (value, offset, length, runState, done) {
        if (runState.static) {
          trap(ERROR.STATIC_STATE_CHANGE)
        }

        value = new BN(value)
        offset = utils.bufferToInt(offset)
        length = utils.bufferToInt(length)

        var data = memLoad(runState, offset, length)

        var options = {
          value: value,
          data: data
        }

        var localOpts = {
          inOffset: offset,
          inLength: length,
          outOffset: 0,
          outLength: 0
        }

        checkCallMemCost(runState, options, localOpts)
        checkOutOfGas(runState, options)
        makeCall(runState, options, localOpts, done)
      },
      CALL: function (gasLimit, toAddress, value, inOffset, inLength, outOffset, outLength, runState, done) {
        var stateManager = runState.stateManager
        gasLimit = new BN(gasLimit)
        toAddress = utils.setLengthLeft(toAddress, 20)
        value = new BN(value)
        inOffset = utils.bufferToInt(inOffset)
        inLength = utils.bufferToInt(inLength)
        outOffset = utils.bufferToInt(outOffset)
        outLength = utils.bufferToInt(outLength)

        if (runState.static && !value.isZero()) {
          trap(ERROR.STATIC_STATE_CHANGE)
        }

        var data = memLoad(runState, inOffset, inLength)

        var options = {
          gasLimit: gasLimit,
          value: value,
          to: toAddress,
          data: data,
          static: runState.static
        }

        var localOpts = {
          inOffset: inOffset,
          inLength: inLength,
          outOffset: outOffset,
          outLength: outLength
        }

        if (!value.isZero()) {
          subGas(runState, new BN(fees.callValueTransferGas.v))
        }

        stateManager.exists(toAddress, function (err, exists) {
          if (err) {
            done(err)
            return
          }

          stateManager.accountIsEmpty(toAddress, function (err, empty) {
            if (err) {
              done(err)
              return
            }

            if (!exists || empty) {
              if (!value.isZero()) {
                try {
                  subGas(runState, new BN(fees.callNewAccountGas.v))
                } catch (e) {
                  done(e.error)
                  return
                }
              }
            }

            try {
              checkCallMemCost(runState, options, localOpts)
              checkOutOfGas(runState, options)
            } catch (e) {
              done(e.error)
              return
            }

            if (!value.isZero()) {
              runState.gasLeft.iadd(new BN(fees.callStipend.v))
              options.gasLimit.iadd(new BN(fees.callStipend.v))
            }

            makeCall(runState, options, localOpts, done)
          })
        })
      },
      CALLCODE: function (gas, toAddress, value, inOffset, inLength, outOffset, outLength, runState, done) {
        var stateManager = runState.stateManager
        gas = new BN(gas)
        toAddress = utils.setLengthLeft(toAddress, 20)
        value = new BN(value)
        inOffset = utils.bufferToInt(inOffset)
        inLength = utils.bufferToInt(inLength)
        outOffset = utils.bufferToInt(outOffset)
        outLength = utils.bufferToInt(outLength)

        var data = memLoad(runState, inOffset, inLength)

        const options = {
          gasLimit: gas,
          value: value,
          data: data,
          to: runState.address,
          static: runState.static
        }

        const localOpts = {
          inOffset: inOffset,
          inLength: inLength,
          outOffset: outOffset,
          outLength: outLength
        }

        if (!value.isZero()) {
          subGas(runState, new BN(fees.callValueTransferGas.v))
        }

        checkCallMemCost(runState, options, localOpts)
        checkOutOfGas(runState, options)

        if (!value.isZero()) {
          runState.gasLeft.iadd(new BN(fees.callStipend.v))
          options.gasLimit.iadd(new BN(fees.callStipend.v))
        }

        // load the code
        stateManager.getAccount(toAddress, function (err, account) {
          if (err) return done(err)
          if (runState._precompiled[toAddress.toString('hex')]) {
            options.compiled = true
            options.code = runState._precompiled[toAddress.toString('hex')]
            makeCall(runState, options, localOpts, done)
          } else {
            stateManager.getContractCode(toAddress, function (err, code, compiled) {
              if (err) return done(err)
              options.compiled = compiled || false
              options.code = code
              makeCall(runState, options, localOpts, done)
            })
          }
        })
      },
      DELEGATECALL: function (gas, toAddress, inOffset, inLength, outOffset, outLength, runState, done) {
        var stateManager = runState.stateManager
        var value = runState.callValue
        gas = new BN(gas)
        toAddress = utils.setLengthLeft(toAddress, 20)
        inOffset = utils.bufferToInt(inOffset)
        inLength = utils.bufferToInt(inLength)
        outOffset = utils.bufferToInt(outOffset)
        outLength = utils.bufferToInt(outLength)

        var data = memLoad(runState, inOffset, inLength)

        const options = {
          gasLimit: gas,
          value: value,
          data: data,
          to: runState.address,
          caller: runState.caller,
          delegatecall: true,
          static: runState.static
        }

        const localOpts = {
          inOffset: inOffset,
          inLength: inLength,
          outOffset: outOffset,
          outLength: outLength
        }

        checkCallMemCost(runState, options, localOpts)
        checkOutOfGas(runState, options)

        // load the code
        stateManager.getAccount(toAddress, function (err, account) {
          if (err) return done(err)
          if (runState._precompiled[toAddress.toString('hex')]) {
            options.compiled = true
            options.code = runState._precompiled[toAddress.toString('hex')]
            makeCall(runState, options, localOpts, done)
          } else {
            stateManager.getContractCode(toAddress, function (err, code, compiled) {
              if (err) return done(err)
              options.compiled = compiled || false
              options.code = code
              makeCall(runState, options, localOpts, done)
            })
          }
          //@note:@here:@todo: verificationContract stuff here.
        })
      },
      STATICCALL: function (gasLimit, toAddress, inOffset, inLength, outOffset, outLength, runState, done) {
        var stateManager = runState.stateManager
        gasLimit = new BN(gasLimit)
        toAddress = utils.setLengthLeft(toAddress, 20)
        var value = new BN(0)
        inOffset = utils.bufferToInt(inOffset)
        inLength = utils.bufferToInt(inLength)
        outOffset = utils.bufferToInt(outOffset)
        outLength = utils.bufferToInt(outLength)

        var data = memLoad(runState, inOffset, inLength)

        var options = {
          gasLimit: gasLimit,
          value: value,
          to: toAddress,
          data: data,
          static: true
        }

        var localOpts = {
          inOffset: inOffset,
          inLength: inLength,
          outOffset: outOffset,
          outLength: outLength
        }

        stateManager.exists(toAddress, function (err, exists) {
          if (err) {
            done(err)
            return
          }

          stateManager.accountIsEmpty(toAddress, function (err, empty) {
            if (err) {
              done(err)
              return
            }

            try {
              checkCallMemCost(runState, options, localOpts)
              checkOutOfGas(runState, options)
            } catch (e) {
              done(e.error)
              return
            }

            makeCall(runState, options, localOpts, done)
          })
        })
      },
      RETURN: function (offset, length, runState) {
        offset = utils.bufferToInt(offset)
        length = utils.bufferToInt(length)
        runState.returnValue = memLoad(runState, offset, length)
      },
      REVERT: function (offset, length, runState) {
        offset = utils.bufferToInt(offset)
        length = utils.bufferToInt(length)

        runState.stopped = true
        runState.returnValue = memLoad(runState, offset, length)
        trap(ERROR.REVERT)
      },
      // '0x70', range - other
      SELFDESTRUCT: function (selfdestructToAddress, runState, cb) {
        if (runState.static) {
          trap(ERROR.STATIC_STATE_CHANGE)
        }
        var stateManager = runState.stateManager
        var contract = runState.contract
        var contractAddress = runState.address
        var zeroBalance = new BN(0)
        selfdestructToAddress = utils.setLengthLeft(selfdestructToAddress, 20)

        stateManager.getAccount(selfdestructToAddress, function (err, toAccount) {
          // update balances
          if (err) {
            cb(err)
            return
          }

          stateManager.accountIsEmpty(selfdestructToAddress, function (error, empty) {
            if (error) {
              cb(error)
              return
            }

            if ((new BN(contract.balance)).gt(zeroBalance)) {
              if (!toAccount.exists || empty) {
                try {
                  subGas(runState, new BN(fees.callNewAccountGas.v))
                } catch (e) {
                  cb(e.error)
                  return
                }
              }
            }

            // only add to refund if this is the first selfdestruct for the address
            if (!runState.selfdestruct[contractAddress.toString('hex')]) {
              runState.gasRefund = runState.gasRefund.add(new BN(fees.suicideRefundGas.v))
            }
            runState.selfdestruct[contractAddress.toString('hex')] = selfdestructToAddress
            runState.stopped = true

            var newBalance = new BN(contract.balance).add(new BN(toAccount.balance)).toArrayLike(Buffer)
            async.series([
              stateManager.putAccountBalance.bind(stateManager, selfdestructToAddress, newBalance),
              stateManager.putAccountBalance.bind(stateManager, contractAddress, new BN(0))
            ], function (err) {
              // The reason for this is to avoid sending an array of results
              cb(err)
            })
          })
        })
      }
    }

    module.exports._DC = module.exports.DELEGATECALL

    function describeLocation(runState) {
      var hash = utils.sha3(runState.code).toString('hex')
      var address = runState.address.toString('hex')
      var pc = runState.programCounter - 1
      return hash + '/' + address + ':' + pc
    }

    function subGas(runState, amount) {
      runState.gasLeft.isub(amount)
      if (runState.gasLeft.ltn(0)) {
        runState.gasLeft = new BN(0)
        trap(ERROR.OUT_OF_GAS)
      }
    }

    function trap(err) {
      function VmError(error) {
        this.error = error
      }

      throw new VmError(err)
    }

    /**
     * Subtracts the amount needed for memory usage from `runState.gasLeft`
     * @method subMemUsage
     * @param {Number} offset
     * @param {Number} length
     * @return {String}
     */
    function subMemUsage(runState, offset, length) {
      // YP (225): access with zero length will not extend the memory
      if (!length) return

      // hacky: if the dataOffset is larger than the largest safeInt then just
      // load 0's because if tx.data did have that amount of data then the fee
      // would be high than the maxGasLimit in the block
      if (offset > MAX_INT || length > MAX_INT) {
        runState.gasLeft = new BN(0)
        trap(ERROR.OUT_OF_GAS)
      }

      const newMemoryWordCount = Math.ceil((offset + length) / 32)

      if (newMemoryWordCount <= runState.memoryWordCount) return

      const words = new BN(newMemoryWordCount)
      const fee = new BN(fees.memoryGas.v)
      const quadCoeff = new BN(fees.quadCoeffDiv.v)
      // words * 3 + words ^2 / 512
      const cost = words.mul(fee).add(words.mul(words).div(quadCoeff))

      if (cost.gt(runState.highestMemCost)) {
        subGas(runState, cost.sub(runState.highestMemCost))
        runState.highestMemCost = cost
      }

      runState.memoryWordCount = newMemoryWordCount
    }

    /**
     * Loads bytes from memory and returns them as a buffer. If an error occurs
     * a string is instead returned. The function also subtracts the amount of
     * gas need for memory expansion.
     * @method memLoad
     * @param {Number} offset where to start reading from
     * @param {Number} length how far to read
     * @return {Buffer|String}
     */
    function memLoad(runState, offset, length) {
      // check to see if we have enougth gas for the mem read
      subMemUsage(runState, offset, length)

      // shortcut
      if (length === 0) {
        return new Buffer('')
      }

      var loaded = runState.memory.slice(offset, offset + length)
      // fill the remaining lenth with zeros
      for (var i = loaded.length; i < length; i++) {
        loaded.push(0)
      }
      return Buffer.from(loaded)
    }

    /**
     * Stores bytes to memory. If an error occurs a string is instead returned.
     * The function also subtracts the amount of gas need for memory expansion.
     * @method memStore
     * @param {Number} offset where to start reading from
     * @param {Number} length how far to read
     * @return {Buffer|String}
     */
    function memStore(runState, offset, val, valOffset, length, skipSubMem) {
      if (skipSubMem !== false) {
        subMemUsage(runState, offset, length)
      }

      // shortcut
      if (length === 0) {
        return
      }

      var valLength = Math.min(val.length, length)

      // read max possible from the value
      for (var i = 0; i < valLength; i++) {
        runState.memory[offset + i] = val[valOffset + i]
      }
    }

    // checks if a jump is valid given a destination
    function jumpIsValid(runState, dest) {
      return runState.validJumps.indexOf(dest) !== -1
    }

    // checks to see if we have enough gas left for the memory reads and writes
    // required by the CALLs
    function checkCallMemCost(runState, callOptions, localOpts) {
      // calculates the gas need for saving the output in memory
      subMemUsage(runState, localOpts.outOffset, localOpts.outLength)

      if (!callOptions.gasLimit) {
        callOptions.gasLimit = runState.gasLeft
      }
    }

    function checkOutOfGas(runState, callOptions) {
      const gasAllowed = runState.gasLeft.sub(runState.gasLeft.div(new BN(64)))
      if (callOptions.gasLimit.gt(gasAllowed)) {
        callOptions.gasLimit = gasAllowed
      }
    }

    //@note: @here: @todo: add function to check KYC identity stuff here?
    //@note: @here: @todo: add function to check Trust Channel functionality + scope delegates here?


    // sets up and calls runCall
    function makeCall(runState, callOptions, localOpts, cb) {
      callOptions.caller = callOptions.caller || runState.address
      callOptions.origin = runState.origin
      callOptions.gasPrice = runState.gasPrice
      callOptions.block = runState.block
      callOptions.populateCache = false
      callOptions.static = callOptions.static || false
      callOptions.selfdestruct = runState.selfdestruct

      // increment the runState.depth
      callOptions.depth = runState.depth + 1

      // empty the return data buffer
      runState.lastReturned = new Buffer([])

      // check if account has enough ether
      // @note: @here: @todo: add function to check for gas forwarding here?
      // Note: in the case of delegatecall, the value is persisted and doesn't need to be deducted again
      if (runState.depth >= fees.stackLimit.v || (callOptions.delegatecall !== true && new BN(runState.contract.balance).lt(callOptions.value))) {
        runState.stack.push(Buffer.from([0]))
        cb(null)
      } else {
        // if creating a new contract then increament the nonce
        if (!callOptions.to) {
          runState.contract.nonce = new BN(runState.contract.nonce).addn(1)
        }

        runState.stateManager.cache.put(runState.address, runState.contract)
        runState._vm.runCall(callOptions, parseCallResults)
      }

      function parseCallResults(err, results) {
        if (err) return cb(err)

        // concat the runState.logs
        if (results.vm.logs) {
          runState.logs = runState.logs.concat(results.vm.logs)
        }

        // add gasRefund
        if (results.vm.gasRefund) {
          runState.gasRefund = runState.gasRefund.add(results.vm.gasRefund)
        }

        // this should always be safe
        runState.gasLeft.isub(results.gasUsed)

        // save results to memory
        if (results.vm.return && (!results.vm.exceptionError || results.vm.exceptionError === ERROR.REVERT)) {
          memStore(runState, localOpts.outOffset, results.vm.return, 0, localOpts.outLength, false)

          if (results.vm.exceptionError === ERROR.REVERT && runState.opName === 'CREATE') {
            runState.lastReturned = results.vm.return
          }

          switch (runState.opName) {
          case 'CALL':
          case 'CALLCODE':
          case 'DELEGATECALL':
          case 'STATICCALL':
            runState.lastReturned = results.vm.return
            break
          }
        }

        if (!results.vm.exceptionError) {
          // update stateRoot on current contract
          runState.stateManager.getAccount(runState.address, function (err, account) {
            if (err) return cb(err)

            runState.contract = account
            // push the created address to the stack
            if (results.createdAddress) {
              cb(null, results.createdAddress)
            } else {
              cb(null, Buffer.from([results.vm.exception]))
            }
          })
        } else {
          // creation failed so don't increament the nonce
          if (results.vm.createdAddress) {
            runState.contract.nonce = new BN(runState.contract.nonce).subn(1)
          }

          cb(null, Buffer.from([results.vm.exception]))
        }
      }
    }


    value = new BN(value)
    offset = utils.bufferToInt(offset)
    length = utils.bufferToInt(length)

    var data = memLoad(runState, offset, length)

    var options = {
      value: value,
      data: data
    }

    var localOpts = {
      inOffset: offset,
      inLength: length,
      outOffset: 0,
      outLength: 0
    }

    checkCallMemCost(runState, options, localOpts)
    checkOutOfGas(runState, options)
    makeCall(runState, options, localOpts, done)
  },
  CALL: function (gasLimit, toAddress, value, inOffset, inLength, outOffset, outLength, runState, done) {
    var stateManager = runState.stateManager
    gasLimit = new BN(gasLimit)
    toAddress = utils.setLengthLeft(toAddress, 20)
    value = new BN(value)
    inOffset = utils.bufferToInt(inOffset)
    inLength = utils.bufferToInt(inLength)
    outOffset = utils.bufferToInt(outOffset)
    outLength = utils.bufferToInt(outLength)

    if (runState.static && !value.isZero()) {
      trap(ERROR.STATIC_STATE_CHANGE)
    }

    var data = memLoad(runState, inOffset, inLength)

    var options = {
      gasLimit: gasLimit,
      value: value,
      to: toAddress,
      data: data,
      static: runState.static
    }

    var localOpts = {
      inOffset: inOffset,
      inLength: inLength,
      outOffset: outOffset,
      outLength: outLength
    }

    if (!value.isZero()) {
      subGas(runState, new BN(fees.callValueTransferGas.v))
    }

    stateManager.exists(toAddress, function (err, exists) {
      if (err) {
        done(err)
        return
      }

      stateManager.accountIsEmpty(toAddress, function (err, empty) {
        if (err) {
          done(err)
          return
        }

        if (!exists || empty) {
          if (!value.isZero()) {
            try {
              subGas(runState, new BN(fees.callNewAccountGas.v))
            } catch (e) {
              done(e.error)
              return
            }
          }
        }

        try {
          checkCallMemCost(runState, options, localOpts)
          checkOutOfGas(runState, options)
        } catch (e) {
          done(e.error)
          return
        }

        if (!value.isZero()) {
          runState.gasLeft.iadd(new BN(fees.callStipend.v))
          options.gasLimit.iadd(new BN(fees.callStipend.v))
        }

        makeCall(runState, options, localOpts, done)
      })
    })
  },
  CALLCODE: function (gas, toAddress, value, inOffset, inLength, outOffset, outLength, runState, done) {
    var stateManager = runState.stateManager
    gas = new BN(gas)
    toAddress = utils.setLengthLeft(toAddress, 20)
    value = new BN(value)
    inOffset = utils.bufferToInt(inOffset)
    inLength = utils.bufferToInt(inLength)
    outOffset = utils.bufferToInt(outOffset)
    outLength = utils.bufferToInt(outLength)

    var data = memLoad(runState, inOffset, inLength)

    const options = {
      gasLimit: gas,
      value: value,
      data: data,
      to: runState.address,
      static: runState.static
    }

    const localOpts = {
      inOffset: inOffset,
      inLength: inLength,
      outOffset: outOffset,
      outLength: outLength
    }

    if (!value.isZero()) {
      subGas(runState, new BN(fees.callValueTransferGas.v))
    }

    checkCallMemCost(runState, options, localOpts)
    checkOutOfGas(runState, options)

    if (!value.isZero()) {
      runState.gasLeft.iadd(new BN(fees.callStipend.v))
      options.gasLimit.iadd(new BN(fees.callStipend.v))
    }

    // load the code
    stateManager.getAccount(toAddress, function (err, account) {
      if (err) return done(err)
      if (runState._precompiled[toAddress.toString('hex')]) {
        options.compiled = true
        options.code = runState._precompiled[toAddress.toString('hex')]
        makeCall(runState, options, localOpts, done)
      } else {
        stateManager.getContractCode(toAddress, function (err, code, compiled) {
          if (err) return done(err)
          options.compiled = compiled || false
          options.code = code
          makeCall(runState, options, localOpts, done)
        })
      }
    })
  },
  DELEGATECALL: function (gas, toAddress, inOffset, inLength, outOffset, outLength, runState, done) {
    var stateManager = runState.stateManager
    var value = runState.callValue
    gas = new BN(gas)
    toAddress = utils.setLengthLeft(toAddress, 20)
    inOffset = utils.bufferToInt(inOffset)
    inLength = utils.bufferToInt(inLength)
    outOffset = utils.bufferToInt(outOffset)
    outLength = utils.bufferToInt(outLength)

    var data = memLoad(runState, inOffset, inLength)

    const options = {
      gasLimit: gas,
      value: value,
      data: data,
      to: runState.address,
      caller: runState.caller,
      delegatecall: true,
      static: runState.static
    }

    const localOpts = {
      inOffset: inOffset,
      inLength: inLength,
      outOffset: outOffset,
      outLength: outLength
    }

    checkCallMemCost(runState, options, localOpts)
    checkOutOfGas(runState, options)

    // load the code
    stateManager.getAccount(toAddress, function (err, account) {
      if (err) return done(err)
      if (runState._precompiled[toAddress.toString('hex')]) {
        options.compiled = true
        options.code = runState._precompiled[toAddress.toString('hex')]
        makeCall(runState, options, localOpts, done)
      } else {
        stateManager.getContractCode(toAddress, function (err, code, compiled) {
          if (err) return done(err)
          options.compiled = compiled || false
          options.code = code
          makeCall(runState, options, localOpts, done)
        })
      }
      //@note:@here:@todo: verificationContract stuff here.
    })
  },
  STATICCALL: function (gasLimit, toAddress, inOffset, inLength, outOffset, outLength, runState, done) {
    var stateManager = runState.stateManager
    gasLimit = new BN(gasLimit)
    toAddress = utils.setLengthLeft(toAddress, 20)
    var value = new BN(0)
    inOffset = utils.bufferToInt(inOffset)
    inLength = utils.bufferToInt(inLength)
    outOffset = utils.bufferToInt(outOffset)
    outLength = utils.bufferToInt(outLength)

    var data = memLoad(runState, inOffset, inLength)

    var options = {
      gasLimit: gasLimit,
      value: value,
      to: toAddress,
      data: data,
      static: true
    }

    var localOpts = {
      inOffset: inOffset,
      inLength: inLength,
      outOffset: outOffset,
      outLength: outLength
    }

    stateManager.exists(toAddress, function (err, exists) {
      if (err) {
        done(err)
        return
      }

      stateManager.accountIsEmpty(toAddress, function (err, empty) {
        if (err) {
          done(err)
          return
        }

        try {
          checkCallMemCost(runState, options, localOpts)
          checkOutOfGas(runState, options)
        } catch (e) {
          done(e.error)
          return
        }

        makeCall(runState, options, localOpts, done)
      })
    })
  },
  RETURN: function (offset, length, runState) {
    offset = utils.bufferToInt(offset)
    length = utils.bufferToInt(length)
    runState.returnValue = memLoad(runState, offset, length)
  },
  REVERT: function (offset, length, runState) {
    offset = utils.bufferToInt(offset)
    length = utils.bufferToInt(length)

    runState.stopped = true
    runState.returnValue = memLoad(runState, offset, length)
    trap(ERROR.REVERT)
  },
  // '0x70', range - other
  SELFDESTRUCT: function (selfdestructToAddress, runState, cb) {
    if (runState.static) {
      trap(ERROR.STATIC_STATE_CHANGE)
    }
    var stateManager = runState.stateManager
    var contract = runState.contract
    var contractAddress = runState.address
    var zeroBalance = new BN(0)
    selfdestructToAddress = utils.setLengthLeft(selfdestructToAddress, 20)

    stateManager.getAccount(selfdestructToAddress, function (err, toAccount) {
      // update balances
      if (err) {
        cb(err)
        return
      }

      stateManager.accountIsEmpty(selfdestructToAddress, function (error, empty) {
        if (error) {
          cb(error)
          return
        }

        if ((new BN(contract.balance)).gt(zeroBalance)) {
          if (!toAccount.exists || empty) {
            try {
              subGas(runState, new BN(fees.callNewAccountGas.v))
            } catch (e) {
              cb(e.error)
              return
            }
          }
        }

        // only add to refund if this is the first selfdestruct for the address
        if (!runState.selfdestruct[contractAddress.toString('hex')]) {
          runState.gasRefund = runState.gasRefund.add(new BN(fees.suicideRefundGas.v))
        }
        runState.selfdestruct[contractAddress.toString('hex')] = selfdestructToAddress
        runState.stopped = true

        var newBalance = new BN(contract.balance).add(new BN(toAccount.balance)).toArrayLike(Buffer)
        async.series([
          stateManager.putAccountBalance.bind(stateManager, selfdestructToAddress, newBalance),
          stateManager.putAccountBalance.bind(stateManager, contractAddress, new BN(0))
        ], function (err) {
          // The reason for this is to avoid sending an array of results
          cb(err)
        })
      })
    })
  }
}

module.exports._DC = module.exports.DELEGATECALL

function describeLocation(runState) {
  var hash = utils.sha3(runState.code).toString('hex')
  var address = runState.address.toString('hex')
  var pc = runState.programCounter - 1
  return hash + '/' + address + ':' + pc
}

function subGas(runState, amount) {
  runState.gasLeft.isub(amount)
  if (runState.gasLeft.ltn(0)) {
    runState.gasLeft = new BN(0)
    trap(ERROR.OUT_OF_GAS)
  }
}

function trap(err) {
  function VmError(error) {
    this.error = error
  }

  throw new VmError(err)
}

/**
 * Subtracts the amount needed for memory usage from `runState.gasLeft`
 * @method subMemUsage
 * @param {Number} offset
 * @param {Number} length
 * @return {String}
 */
function subMemUsage(runState, offset, length) {
  // YP (225): access with zero length will not extend the memory
  if (!length) return

  // hacky: if the dataOffset is larger than the largest safeInt then just
  // load 0's because if tx.data did have that amount of data then the fee
  // would be high than the maxGasLimit in the block
  if (offset > MAX_INT || length > MAX_INT) {
    runState.gasLeft = new BN(0)
    trap(ERROR.OUT_OF_GAS)
  }

  const newMemoryWordCount = Math.ceil((offset + length) / 32)

  if (newMemoryWordCount <= runState.memoryWordCount) return

  const words = new BN(newMemoryWordCount)
  const fee = new BN(fees.memoryGas.v)
  const quadCoeff = new BN(fees.quadCoeffDiv.v)
  // words * 3 + words ^2 / 512
  const cost = words.mul(fee).add(words.mul(words).div(quadCoeff))

  if (cost.gt(runState.highestMemCost)) {
    subGas(runState, cost.sub(runState.highestMemCost))
    runState.highestMemCost = cost
  }

  runState.memoryWordCount = newMemoryWordCount
}

/**
 * Loads bytes from memory and returns them as a buffer. If an error occurs
 * a string is instead returned. The function also subtracts the amount of
 * gas need for memory expansion.
 * @method memLoad
 * @param {Number} offset where to start reading from
 * @param {Number} length how far to read
 * @return {Buffer|String}
 */
function memLoad(runState, offset, length) {
  // check to see if we have enougth gas for the mem read
  subMemUsage(runState, offset, length)

  // shortcut
  if (length === 0) {
    return new Buffer('')
  }

  var loaded = runState.memory.slice(offset, offset + length)
  // fill the remaining lenth with zeros
  for (var i = loaded.length; i < length; i++) {
    loaded.push(0)
  }
  return Buffer.from(loaded)
}

/**
 * Stores bytes to memory. If an error occurs a string is instead returned.
 * The function also subtracts the amount of gas need for memory expansion.
 * @method memStore
 * @param {Number} offset where to start reading from
 * @param {Number} length how far to read
 * @return {Buffer|String}
 */
function memStore(runState, offset, val, valOffset, length, skipSubMem) {
  if (skipSubMem !== false) {
    subMemUsage(runState, offset, length)
  }

  // shortcut
  if (length === 0) {
    return
  }

  var valLength = Math.min(val.length, length)

  // read max possible from the value
  for (var i = 0; i < valLength; i++) {
    runState.memory[offset + i] = val[valOffset + i]
  }
}

// checks if a jump is valid given a destination
function jumpIsValid(runState, dest) {
  return runState.validJumps.indexOf(dest) !== -1
}

// checks to see if we have enough gas left for the memory reads and writes
// required by the CALLs
function checkCallMemCost(runState, callOptions, localOpts) {
  // calculates the gas need for saving the output in memory
  subMemUsage(runState, localOpts.outOffset, localOpts.outLength)

  if (!callOptions.gasLimit) {
    callOptions.gasLimit = runState.gasLeft
  }
}

function checkOutOfGas(runState, callOptions) {
  const gasAllowed = runState.gasLeft.sub(runState.gasLeft.div(new BN(64)))
  if (callOptions.gasLimit.gt(gasAllowed)) {
    callOptions.gasLimit = gasAllowed
  }
}

//@note: @here: @todo: add function to check KYC identity stuff here?
//@note: @here: @todo: add function to check Trust Channel functionality + scope delegates here?


// sets up and calls runCall
function makeCall(runState, callOptions, localOpts, cb) {
  callOptions.caller = callOptions.caller || runState.address
  callOptions.origin = runState.origin
  callOptions.gasPrice = runState.gasPrice
  callOptions.block = runState.block
  callOptions.populateCache = false
  callOptions.static = callOptions.static || false
  callOptions.selfdestruct = runState.selfdestruct

  // increment the runState.depth
  callOptions.depth = runState.depth + 1

  // empty the return data buffer
  runState.lastReturned = new Buffer([])

  // check if account has enough ether
  // @note: @here: @todo: add function to check for gas forwarding here?
  // Note: in the case of delegatecall, the value is persisted and doesn't need to be deducted again
  if (runState.depth >= fees.stackLimit.v || (callOptions.delegatecall !== true && new BN(runState.contract.balance).lt(callOptions.value))) {
    runState.stack.push(Buffer.from([0]))
    cb(null)
  } else {
    // if creating a new contract then increament the nonce
    if (!callOptions.to) {
      runState.contract.nonce = new BN(runState.contract.nonce).addn(1)
    }

    runState.stateManager.cache.put(runState.address, runState.contract)
    runState._vm.runCall(callOptions, parseCallResults)
  }

  function parseCallResults(err, results) {
    if (err) return cb(err)

    // concat the runState.logs
    if (results.vm.logs) {
      runState.logs = runState.logs.concat(results.vm.logs)
    }

    // add gasRefund
    if (results.vm.gasRefund) {
      runState.gasRefund = runState.gasRefund.add(results.vm.gasRefund)
    }

    // this should always be safe
    runState.gasLeft.isub(results.gasUsed)

    // save results to memory
    if (results.vm.return && (!results.vm.exceptionError || results.vm.exceptionError === ERROR.REVERT)) {
      memStore(runState, localOpts.outOffset, results.vm.return, 0, localOpts.outLength, false)

      if (results.vm.exceptionError === ERROR.REVERT && runState.opName === 'CREATE') {
        runState.lastReturned = results.vm.return
      }

      switch (runState.opName) {
      case 'CALL':
      case 'CALLCODE':
      case 'DELEGATECALL':
      case 'STATICCALL':
        runState.lastReturned = results.vm.return
        break
      }
    }

    if (!results.vm.exceptionError) {
      // update stateRoot on current contract
      runState.stateManager.getAccount(runState.address, function (err, account) {
        if (err) return cb(err)

        runState.contract = account
        // push the created address to the stack
        if (results.createdAddress) {
          cb(null, results.createdAddress)
        } else {
          cb(null, Buffer.from([results.vm.exception]))
        }
      })
    } else {
      // creation failed so don't increament the nonce
      if (results.vm.createdAddress) {
        runState.contract.nonce = new BN(runState.contract.nonce).subn(1)
      }

      cb(null, Buffer.from([results.vm.exception]))
    }
  }
}
