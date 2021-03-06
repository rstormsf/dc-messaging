/* global localStorage */
import EE             from 'event-emitter'
import IPFS           from 'ipfs'
import path           from 'path'
import Channel        from 'ipfs-pubsub-room'
import web3Acc        from 'web3-eth-accounts'
import * as Utils     from './utils'
import * as web3Utils from 'web3-utils'

const _config = {
  rtc_room: 'default_room_name',
  loglevel: 'light'
}

const uID = function () {
  return '_' + Math.random().toString(36).substr(2, 9)
}

const delivery_timeout = 15000
const msg_ttl = 10 * 60 * 1000

const seedsDB = (function () {
  const store_name = 'rtc_msgs_seeds'

  let _seeds = {}
  let w_time = false

  const read = function () {
    if (process.env.NODE_ENV === 'server') return
    if (typeof localStorage !== 'undefined') { return }
    try {
      _seeds = JSON.parse(localStorage[store_name])
    } catch (e) {}
  }
  const write = function () {
    if (process.env.NODE_ENV === 'server') return
    if (typeof localStorage !== 'undefined') { return }

    clearTimeout(w_time)
    w_time = setTimeout(function () {
      localStorage[store_name] = JSON.stringify(_seeds)
    }, 500)
  }

  read()

  return {
    add (data, id) {
      _seeds[id] = data
      write()
    },

    get (id) {
      if (!_seeds[id]) read()

      return _seeds[id] || null
    },

    getAll () {
      return _seeds
    },

    remove (id) {
      delete _seeds[id]
      write()
    }
  }
})()

let ipfs_connected = false
let repo = Utils.createRepo()
Utils.exitListener()

let server = [
  '/dns4/signal1.dao.casino/tcp/443/wss/p2p-websocket-star/',
  '/dns4/signal2.dao.casino/tcp/443/wss/p2p-websocket-star/',
  '/dns4/signal3.dao.casino/tcp/443/wss/p2p-websocket-star/'
]

export const version = require('./package.json').version

export async function upIPFS (yourSwarm) {
  await Utils.removeRepo(path.join(repo, '..'))
  
  if (yourSwarm) {
    server = (Array.isArray(yourSwarm))
      ? yourSwarm
      : [ yourSwarm ]
  }

  global.ipfs = new IPFS({
    repo: repo,
    EXPERIMENTAL: {
      pubsub: true
    },
    config: {
      Addresses: {
        Swarm: server
      }
    }
  }).on('ready', () => {
    ipfs_connected = true
    console.log(global.ipfs.swarm.localAddrs().then(console.log))
  }).on('error', err => {
    console.log(err)
  })
}

export class RTC {
  constructor (user_id = false, room = false, secure = false) {
    room = room || _config.rtc_room

    const EC = function () {}
    EE(EC.prototype)
    this.Event = new EC()

    if (!room) {
      Utils.debugLog('empty room name', 'error')
      return
    }
    
    this.Account = new web3Acc()

    if (secure) this._secure = secure

    this.user_id = user_id || uID()
    this.room_id = '' + room
    this.channel = false
    this.connect(room)

    this.clearOldSeeds()
  }

  connect (room) {
    if (!ipfs_connected) {
      setTimeout(() => {
        this.connect(room)
      }, 999)
      return
    }

    Utils.debugLog('room:' + room, _config.loglevel)
    this.channel = Channel(global.ipfs, room)
    this.channel.setMaxListeners(Infinity)
    this.channel.on('message', rawmsg => {
      let raw  = {}
      let data = {}
      try {
        raw  = JSON.parse(rawmsg.data.toString())
        data = raw.data
        const sign_mess = raw.sign_mess
        if (this._secure) {
          if (!this.validSig(sign_mess, data)) return
        }
      } catch (e) {
        return
      }

      // return
      if (data.user_id && data.user_id === this.user_id) {
        return
      }
      // if (data.room_id != this.room_id) {
      //   return
      // }

      this.acknowledgeReceipt(data)

      this.Event.emit('all', data)

      if (data.uiid) {
        this.Event.emit('uiid::' + data.uiid, data)
      }

      if (data.type && data.action) {
        this.Event.emit(data.type + '::' + data.action, data)
      }

      if (data.action) {
        this.Event.emit('action::' + data.action, data)
      }

      if (data.address) {
        this.Event.emit('address::' + data.address, data)
      }

      if (data.user_id) {
        this.Event.emit('user_id::' + data.user_id, data)
      }
    })

    this.channel.on('peer joined', (peer) => {
      Utils.debugLog('Peer(' + peer + ') joined the room ' + this.room_id, _config.loglevel)
    })

    this.channel.on('peer left', (peer) => {
      Utils.debugLog('Peer left... ' + peer, _config.loglevel)
    })

    // now started to listen to room
    this.channel.on('subscribed', () => {
      Utils.debugLog('Now connected!', _config.loglevel, false)
    })
  }

  validSig (sign_mess, data) {
    if (this._secure) {
      const hash       = web3Utils.soliditySha3(JSON.stringify(data))
      const recover    = this.Account.recover(hash, sign_mess.signature)
      const check_sign = this._secure.allowed_users.some(element => {
        return element.toLowerCase() === recover.toLowerCase()
      })

      return check_sign
    }
  }
  
  async isAlreadyReceived (data) {
    // isAlreadyReceived(data){
    if (!data.seed || typeof data.seed !== 'string' || data.action === 'delivery_confirmation') {
      return false
    }
    const seed_exist = seedsDB.get(data.seed)
    if (seed_exist && this.isFreshSeed(seed_exist.t)) {
      return true
    }

    seedsDB.add({ t:new Date().getTime() }, data.seed)
    return false
  }

  isFreshSeed (time) {
    let ttl = msg_ttl || 7 * 1000
    let livetime = (new Date().getTime()) - time * 1
    return (livetime < ttl)
  }

  async clearOldSeeds () {
    // clearOldSeeds(){
    let seeds = seedsDB.getAll()
    for (let id in seeds) {
      if (!this.isFreshSeed(seeds[id].t)) {
        seedsDB.remove(id)
      }
    }

    setTimeout(() => { this.clearOldSeeds() }, 10 * 1000)
  }

  on (event, callback) {
    this.Event.on(event, callback)
  }

  once (event, callback) {
    this.Event.once(event, callback)
  }

  off (event, callback) {
    this.Event.off(event, callback)
  }

  subscribe (address, callback, name = false) {
    this.on('address::' + address, callback)
  }

  unsubscribe (address, callback, name = false) {
    this.off('address::' + address, callback)
  }

  // Подтверждение получения принятого сообщения
  acknowledgeReceipt (acquired_data) {
    if (!acquired_data.user_id  || !acquired_data.action ||
      acquired_data.user_id === this.user_id ||
      acquired_data.action  === 'delivery_confirmation' ||
      acquired_data.action  === 'bankroller_active') {
      return
    }

    
    this.sendMsg({
      address : acquired_data.address,
      seed    : uID(),
      action  : 'delivery_confirmation',
      message : acquired_data
    })
  }

  // Проверка получения отправленного сообщения
  CheckReceipt (sended_data, callback) {
    let subscribe_index = false
    let address = sended_data.address

    let waitReceipt = data => {
      if (!data.action || data.action !== 'delivery_confirmation') {
        return
      }

      if (this.equaMsgs(sended_data, data.message)) {
        this.unsubscribe(address, waitReceipt, subscribe_index)

        if (this.CheckReceiptsT[sended_data.seed]) {
          clearTimeout(this.CheckReceiptsT[sended_data.seed])
        }

        callback(true)
      }
    }

    subscribe_index = this.subscribe(address, waitReceipt)

    if (!this.CheckReceiptsT) {
      this.CheckReceiptsT = {}
    }

    this.CheckReceiptsT[sended_data.seed] = setTimeout(() => {
      this.unsubscribe(address, waitReceipt, subscribe_index)

      callback(false)
    }, delivery_timeout)
  }

  equaMsgs (msg1, msg2) {
    return (JSON.stringify(msg1) === JSON.stringify(msg2))
  }

  // Отправка сообщения с ожидание подтверждения получения
  send (data, callback = false, repeat = 9) {
    if (!this.channel) {
      setTimeout(() => { this.send(data, callback) }, 1000)
      return
    }

    if (data.action === 'connect' && data.user_id !== data.player) {
      return
    }

    data = this.sendMsg(data)

    if (!data.address) {
      return
    }

    this.CheckReceipt(data, delivered => {
      if (!delivered && repeat > 0) {
        repeat--
        setTimeout(() => {
          this.send(data, callback, repeat)
        }, 1000 )
        return
      }

      if (callback) callback(delivered)
    })
  }

  sendMsg (data) {
    if (!this.channel) {
      if (data.action !== 'bankroller_active') {
        setTimeout(() => {
          this.sendMsg(data)
        }, 999)
      }
      return
    }

    let {sign_mess, hash} = false
    data.seed       = uID()
    data.user_id    = this.user_id
    // signed message
    if (this._secure) {
      hash      = web3Utils.soliditySha3(JSON.stringify(data))
      sign_mess = this.Account.sign(hash, this._secure.privateKey)
    }
    // data.room_id = this.room_id

    this.channel.broadcast(JSON.stringify({
      data: data,
      hash: hash, 
      sign_mess: sign_mess
    }))

    return data
  }
}
