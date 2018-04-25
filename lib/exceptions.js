const ERROR = {
  OUT_OF_GAS: 'out of gas (@shyftnetwork)',
  STACK_UNDERFLOW: 'stack underflow (@shyftnetwork)',
  STACK_OVERFLOW: 'stack overflow (@shyftnetwork)',
  INVALID_JUMP: 'invalid JUMP (@shyftnetwork)',
  INVALID_OPCODE: 'invalid opcode (@shyftnetwork)',
  REVERT: 'revert (@shyftnetwork)',
  STATIC_STATE_CHANGE: 'static state change (@shyftnetwork)',
  INTERNAL_ERROR: 'internal error (@shyftnetwork)'
}

function VmError (error) {
  this.error = error
  this.errorType = 'VmError'
}

module.exports = {
  ERROR: ERROR,
  VmError: VmError
}
