# DC-Messanging

### Install
```shell
npm install daocasino/dc-messanging
```
________________________________________
### Usage
```js
  import RTC from 'dc-messanging'
  
  const room = new RTC(address, room_name)
  room.sendMsg(msg)
```
### Api
```js
// listening for an event
room.on(event, callback)

// Listen to the event only once
room.once(event, callback)

// stop listening to an event
romm.off(event, callback)

// subscribe to events
room.subscribe(address, callback)

// unsubscribe to events
room.unsubscribe(address, callback)

// Sending message in all room users
room.sendMsg(data)
```
