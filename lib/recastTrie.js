const CheckpointTrie = require('merkle-patricia-tree/index')
const recastInterface = require('./recastTrieInterface')
const inherits = require('util').inherits

module.exports = RecastTrie
inherits(RecastTrie, CheckpointTrie)

// @note:@comment:@todo: need to rewrite the wording to reflect Recast.
/**
 * You can create a secure Trie where the keys are automatically hashed using **SHA3** by using `require('merkle-patricia-tree/secure')`. It has the same methods and constuctor as `Trie`
 * @class RecastTrie
 * @extends Trie
 */
function RecastTrie () {
  CheckpointTrie.apply(this, arguments)
  recastInterface(this)
}