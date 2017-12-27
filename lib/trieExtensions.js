
const rlp = require('rlp')
const ethUtil = require('ethereumjs-util')

const Trie = require('merkle-patricia-tree/secure')
const TrieNode = require('merkle-patricia-tree/trieNode')
const matchingNibbleLength = require('merkle-patricia-tree/util').matchingNibbleLength
const doKeysMatch = require('merkle-patricia-tree/util').doKeysMatch

const callTogether = require('merkle-patricia-tree/util').callTogether


Trie.prototype.filterNodeValuesForPrefix = function(prefix, nodeRef, node, key, nextcall, cb) {
  var foundPrefix = null
  var value = ""

  if (node && node.type === "leaf" && node.value) {
    if (node.value.toString().substr(0, prefix.length) === prefix) {
      foundPrefix = prefix
      value = node.value.toString().substr(prefix.length)
    }
  }

  cb(foundPrefix, nodeRef, node, key, value, nextcall)
}


// @note: @here: @override: update put method to add logs.
/**
 * Stores a given `value` at the given `key`
 * @method put
 * @param {Buffer|String} key
 * @param {Buffer|String} Value
 * @param {Function} cb A callback `Function` which is given the argument `err` - for errors that may have occured
 */
Trie.prototype.put = function (key, value, cb) {
  var self = this

  console.log("putting key :: " + key + " :: " + ethUtil.bufferToHex(key).toString() + " :: value :: " + value)

  key = ethUtil.toBuffer(key)
  value = ethUtil.toBuffer(value)

  console.log("putting key :: " + key + " :: " + ethUtil.bufferToHex(key).toString() + " :: value :: " + value)

  if (!value || value.toString() === '') {
    self.del(key, cb)
  } else {
    cb = callTogether(cb, self.sem.leave)

    self.sem.take(function () {
      if (self.root.toString('hex') !== ethUtil.SHA3_RLP.toString('hex')) {
        // first try to find the give key or its nearst node
        self.findPath(key, function (err, foundValue, keyRemainder, stack) {
          if (err) {
            return cb(err)
          }
          // then update
          self._updateNode(key, value, keyRemainder, stack, cb)
        })
      } else {
        self._createInitialNode(key, value, cb) // if no root initialize this trie
      }
    })
  }
}
