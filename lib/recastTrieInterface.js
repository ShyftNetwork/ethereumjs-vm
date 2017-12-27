// @note:
// Recast is an intermediate layer that transforms key-calls
// into alternate kv formats. That is, the traditional merkle-
// patricia trie is utilizied by the Ethereum vm in such a manner:
// https://ethereumbuilders.gitbooks.io/guide/content/en/design_rationale.html
// in note #5 : "Using sha3(k) as the key in the "secure tree""
//
// Recast does not necessarily follow the same "secure" format, in
// cases where it is called directly from a Shyft AEVM Op-code.
// It performs value lookups directly with the key, using transformations
// that are potentially harmful to the reputation of the developers
// if they are misused, as they could form explict DOS attacks within
// the smart contract infrastructure.
//
// Recast also explicitly allows for cross-blockchain EVM programming
// that is not replayable in the same sense for other blockchains.
// A collision of kv from a hash interface on the Ethereum network
// for instance might not be ever happen given that the address spaces
// only incidentally collide.
// And yet, knowing the Trie branch and calculating the exact path
// following Recast's rules would be doable if you wished to determine
// information that had been mirrored.
//
// Recast's secondary purpose is to incorporate a short-string
// compression library focused on regular namespace ascii characters.
// As most abci storage key names *have to be visible to programmers
// as most of the projects are open-source* it would make sense to have
// a more tracable, "reducible" tree structure.


const shorter = require('shorter')

const ethUtil = require('ethereumjs-util')
const rlp = require('rlp')

const Trie = require('merkle-patricia-tree/secure')
const TrieNode = require('merkle-patricia-tree/trieNode')
const matchingNibbleLength = require('merkle-patricia-tree/util').matchingNibbleLength
const doKeysMatch = require('merkle-patricia-tree/util').doKeysMatch

const callTogether = require('merkle-patricia-tree/util').callTogether

function ascii_to_hexa(str)
{
  var arr1 = [];
  for (var n = 0, l = str.length; n < l; n ++)
  {
    var hex = Number(str.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join('');
}

module.exports = recastInterface

function recastInterface (trie) {
  // overwrites
  trie.copy = copy.bind(trie, trie.copy.bind(trie))
  trie.get = get.bind(trie, trie.get.bind(trie))
  trie.put = put.bind(trie, trie.put.bind(trie))
  trie.del = del.bind(trie, trie.del.bind(trie))

  trie.getRecast = getRecast.bind(trie, trie.get.bind(trie))
  trie.putRecast = putRecast.bind(trie, trie.put.bind(trie))
  trie.delRecast = del.bind(trie, trie.del.bind(trie))
  trie.filterNodeValuesForPrefix = filterNodeValuesForPrefix
}

recastPrefixes = {
  "sidentity":0,
  "regunormal":0
}

// adds the interface when copying the trie
function copy (_super) {
  var trie = _super()
  recastInterface(trie)
  return trie
}

function get (_super, key, cb) {
  var hash = ethUtil.sha3(key)
  _super(hash, cb)
}

// for a falsey value, use the original key
// to avoid double hashing the key
function put (_super, key, val, cb) {
  if (!val) {
    this.del(key, cb)
  } else {
    var hash = ethUtil.sha3(key)
    _super(hash, val, cb)
  }
}

function del (_super, key, cb) {
  var hash = ethUtil.sha3(key)
  _super(hash, cb)
}

function getRecast (_super, key, cb) {
  var recastKey = getRecastDict(key)
  _super(recastKey, cb)
}

// for a falsey value, use the original key
// to avoid double hashing the key
function putRecast (_super, key, val, cb) {
  if (!val) {
    this.del(key, cb)
  } else {
    var recastKey = getRecastDict(key)
    _super(recastKey, val, cb)
  }
}

function delRecast (_super, key, cb) {
  var recastKey = getRecastDict(key)
  _super(recastKey, cb)
}

function getRecastPrefix(key) {
  var prefixToIndex = key.indexOf("_")

  // console.log("getRecastPrefix :: key :: " + key + " :: prefixToIndex :: " + prefixToIndex)
  if (prefixToIndex !== -1) {
    var potentialPrefix = key.substr(0, prefixToIndex)
    // console.log("getRecastPrefix :: key :: " + key + " :: potentialPrefix :: " + potentialPrefix)
    // console.log("getRecastPrefix :: key :: " + key + " :: recastPrefixes[potentialPrefix] :: " + recastPrefixes[potentialPrefix])
    if (recastPrefixes[potentialPrefix] !== undefined) {
      return potentialPrefix
    }
  }
  return undefined
}


function getRecastDict (key) {
  var recastKey = key
  var recastPrefix = getRecastPrefix(recastKey)

  if (recastPrefix !== undefined) {
    recastKey = shorter.compress(recastPrefix) + key.substr(recastPrefix.length + 1)
  }
  // console.log("getRecastDict :: key pre :: " + key + " :: post :: " + recastKey)
  // console.log("getRecastDict :: hex size pre :: " + ascii_to_hexa(key).length + " :: post :: " + ascii_to_hexa(recastKey.toString()).length)
  //
  // key = "tenleapsaround"
  // recastKey = shorter.compress(key)
  //
  // console.log("getRecastDict :: hex word pre :: " + key + " :: post :: " + recastKey)
  // console.log("getRecastDict :: hex len pre :: " + key.length + " :: post :: " + recastKey.length)


  if (recastKey === key) {
    recastKey = ethUtil.sha3(key)
  }
  return recastKey
}

function filterNodeValuesForPrefix(prefix, nodeRef, node, key, nextcall, cb) {
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

/*
 * Finds all nodes that store k,v values
 */
Trie.prototype._findRecastValueNodes = function (originNode, onFound, cb) {
  this._walkTrie(originNode, function (nodeRef, node, key, walkController) {
    var fullKey = key

    if (node.key) {
      fullKey = key.concat(node.key)
    }

    if (node.type === 'leaf') {
      // found leaf node!
      onFound(nodeRef, node, fullKey, walkController.next)
    } else if (node.type === 'branch' && node.value) {
      // found branch with value
      onFound(nodeRef, node, fullKey, walkController.next)
    } else {
      // keep looking for value nodes
      walkController.next()
    }
  }, cb)
}

