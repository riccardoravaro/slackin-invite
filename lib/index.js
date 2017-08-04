// es6 runtime requirements
import 'babel-polyfill'

// their code
import express from 'express'
import sockets from 'socket.io'
import { json } from 'body-parser'
import { Server as http } from 'http'
import remail from 'email-regex'
import dom from 'vd'
import cors from 'cors'

// our code
import Slack from './slack'
import invite from './slack-invite'
import badge from './badge'
import splash from './splash'
import iframe from './iframe'
import log from './log'
var sigUtil = require('eth-sig-util')
var ethUtil = require('ethereumjs-util')
var BigNumber = require('bignumber.js');
import Web3 from 'web3'
import { tokenABI, tokenAddr } from './config'

console.log(tokenAddr)

export default function slackin ({
  token,
  interval = 5000, // jshint ignore:line
  org,
  css,
  coc,
  cors: useCors = false,
  path='/',
  channels,
  emails,
  silent = false // jshint ignore:line,
}){
  // must haves
  if (!token) throw new Error('Must provide a `token`.')
  if (!org) throw new Error('Must provide an `org`.')

  if (channels) {
    // convert to an array
    channels = channels.split(',').map((channel) => {
      // sanitize channel name
      if ('#' === channel[0]) return channel.substr(1)
      return channel
    })
  }

  if (emails) {
    // convert to an array
    emails = emails.split(',')
  }

  // setup app
  let app = express()
  let srv = http(app)
  srv.app = app

  //instantiate web3 on server side
  let serverWeb3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io'))

  let assets = __dirname + '/assets'

  // fetch data
  let slack = new Slack({ token, interval, org })

  slack.setMaxListeners(Infinity)

  // capture stats
  log(slack, silent)

  // middleware for waiting for slack
  app.use((req, res, next) => {
    if (slack.ready) return next()
    slack.once('ready', next)
  })

  if (useCors) {
    app.options('*', cors())
    app.use(cors())
  }

  // splash page
  app.get('/', (req, res) => {
    let { name, logo } = slack.org
    let { active, total } = slack.users
    if (!name) return res.send(404)
    let page = dom('html',
      dom('head',
        dom('title',
          'Join ', name, ' on Slack!'
        ),
        dom('meta name=viewport content="width=device-width,initial-scale=1.0,minimum-scale=1.0,user-scalable=no"'),
        dom('link rel="shortcut icon" href=https://slack.global.ssl.fastly.net/272a/img/icons/favicon-32.png'),
        css && dom('link rel=stylesheet', { href: css })
      ),
      splash({ coc, path, css, name, org, logo, channels, active, total })
    )
    res.type('html')
    res.send(page.toHTML())
  })

  app.get('/data', (req, res) => {
    let { name, logo } = slack.org
    let { active, total } = slack.users
    res.send({
      name,
      org,
      coc,
      logo,
      channels,
      active,
      total
    })
  })

  // static files
  app.use('/assets', express.static(assets))

  // invite endpoint
  app.post('/invite', json(), (req, res, next) => {
    let chanId
    if (channels) {
      let channel = req.body.channel
      if (!channels.includes(channel)) {
        return res
        .status(400)
        .json({ msg: 'Not a permitted channel' })
      }
      chanId = slack.getChannelId(channel)
      if (!chanId) {
        return res
        .status(400)
        .json({ msg: `Channel not found "${channel}"` })
      }
    }

    let email = req.body.email

    if (!email) {
      return res
      .status(400)
      .json({ msg: 'No email provided' })
    }

    if (!remail().test(email)) {
      return res
      .status(400)
      .json({ msg: 'Invalid email' })
    }

    // Restricting email invites?
    if (emails && emails.indexOf(email) === -1) {
      return res
      .status(400)
      .json({ msg: 'Your email is not on the accepted email list' })
    }

    if (coc && '1' != req.body.coc) {
      return res
      .status(400)
      .json({ msg: 'Agreement to CoC is mandatory' })
    }

    let signature = req.body.signature

    if (signature) {
        //check signature
        console.log('Verifying signature')
        var text = 'Send a slack invite for gnosis to ' + email
        var msg = ethUtil.bufferToHex(new Buffer(text, 'utf8'))
        const msgParams = { data: msg, sig: signature }
        const recovered = sigUtil.recoverPersonalSignature(msgParams)

        //handle result by checking if account holds gno
        console.log('checking GNO balance')
        const TokenContract = serverWeb3.eth.contract(JSON.parse(tokenABI)).at(tokenAddr)

        // console.log('Checking GNO Balance')
        TokenContract.balanceOf(recovered, function(error, result){
            if (!error) {
                if (result.gt(0.01)) {
                    console.log( 'GNO Balance Verified. Sending Email Invite' )
                    invite({ token, org, email, channel: chanId }, err => {
                      if (err) {
                        if (err.message === `Sending you to Slack...`) {
                          return res
                          .status(303)
                          .json({ msg: err.message, redirectUrl: `https://${org}.slack.com` })
                        }

                        return res
                        .status(400)
                        .json({ msg: err.message })
                      }

                      res
                      .status(200)
                      .json({ msg: 'WOOT. Check your email!' })
                    })
                } else {
                    return res
                    .status(400)
                    .json({ msg: 'ERROR The account you provided does not hold GNO Tokens' })
                }

            } else {
                return res
                .status(400)
                .json({ msg: 'ERROR could not check GNO Balance ' + error })
            }
        })
    } else {
        return res
        .status(400)
        .json({ msg: 'No signature provided' })
    }
  })

  // iframe
  app.get('/iframe', (req, res) => {
    let large = 'large' in req.query
    let { active, total } = slack.users
    res.type('html')
    res.send(iframe({ path, active, total, large }).toHTML())
  })

  app.get('/iframe/dialog', (req, res) => {
    let large = 'large' in req.query
    let { name } = slack.org
    let { active, total } = slack.users
    if (!name) return res.send(404)
    let dom = splash({ coc, path, name, org, channels, active, total, large, iframe: true })
    res.type('html')
    res.send(dom.toHTML())
  })

  app.get('/.well-known/acme-challenge/:id', (req, res) => {
    res.send(process.env.LETSENCRYPT_CHALLENGE)
  })

  // badge js
  app.use('/slackin.js', express.static(assets + '/badge.js'))

  // badge rendering
  app.get('/badge.svg', (req, res) => {
    res.type('svg')
    res.set('Cache-Control', 'max-age=0, no-cache')
    res.set('Pragma', 'no-cache')
    res.send(badge(slack.users).toHTML())
  })

  // realtime
  sockets(srv).on('connection', socket => {
    socket.emit('data', slack.users)
    let change = (key, val) => socket.emit(key, val)
    slack.on('change', change)
    socket.on('disconnect', () => {
      slack.removeListener('change', change)
    })
  })

  return srv
}
