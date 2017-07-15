var ethUtil = require('ethereumjs-util')
//adds button that triggers Metamask signature popup
ethSignButton.addEventListener('click', function(event) {
  event.preventDefault()
  var msg = 'Gnosis-pm'
  var from = web3.eth.accounts[0]
  web3.eth.sign(from, msg, function (err, result) {
    if (err) return console.error(err)
    console.log('SIGNED:' + result)
  })
})
