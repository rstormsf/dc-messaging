import * as messaging from '../../rtc.js'
import WEB3 from 'web3'
import random from 'random-object-generator'

messaging.upIPFS('/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star')

const web3          = new WEB3(new WEB3.providers.HttpProvider('https://ropsten.infura.io/JCnK5ifEPH9qcQkX0Ahl'))
const account       = web3.eth.accounts.create()
const allow_address = [account.address]
const SharedRoom    = new messaging.RTC(account.address, 'TestRoom')

function testObject () {
  this.id            = 'id'
  this.number        = 'int'
  this.description   = 'string'
  this.anotherObject = [new anotherTestObject()]
  this.intArray      = ['int']
}

function anotherTestObject () {
  this.testId = 'id'
}

setTimeout(() => {
  SharedRoom.sendMsg({action: 'getAddress', address :account.address})
}, 15000)

SharedRoom.on('action::getAddress', data => {
  allow_address.push(data.address)
  console.log('peer1', allow_address)
  
  const Room = new messaging.RTC(account.address, 'GameRoom', {
    privateKey    : account.privateKey,
    allowed_users : allow_address
  })

  setTimeout(() => {
    Room.sendMsg({action: 'ping', message:random.randomObject(new testObject())})
  }, 15000)

  Room.on('action::ping', data => {
    console.log(data.message)
    setTimeout(() => {
      Room.sendMsg({action: 'ping', message:random.randomObject(new testObject())})
    }, 555)
  })  
})



