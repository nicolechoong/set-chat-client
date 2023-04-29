const https = require('https');
const WebSocketServer = require('ws').Server;
const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');

const express = require('express');
const app = express();

const key = fs.readFileSync("./cert/CA/localhost/localhost.decrypted.key");
const cert = fs.readFileSync("./cert/CA/localhost/localhost.crt");

app.get('/', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', '..', 'index.html'));
});

app.get('/src/client/client.js', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', 'client', 'client.js'));
});

app.get('/src/client/accessControl.js', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', 'client', 'accessControl.js'));
});

app.get('/src/client/utils.js', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', 'client', 'utils.js'));
});

app.get('/src/client/chatroom.css', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', 'client', 'chatroom.css'));
});

app.get('/src/client/components.js', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', 'client', 'components.js'));
});

app.get('/assets/fonts/SpaceGrotesk-Regular.woff', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', '..', 'assets', 'fonts', 'SpaceGrotesk-Regular.woff'));
});

app.get('/node_modules/tweetnacl-es6/nacl-fast-es.js', (req, res, next) => {
  console.log(`imported nacl-fast`);
  res.status(200).sendFile(path.join(__dirname, '..', '..', 'node_modules', 'tweetnacl-es6', 'nacl-fast-es.js'));
});

const server = https.createServer({ key, cert }, app);

const port = 3000;
server.listen(port, () => {
  console.log(`Server is listening on https://localhost:${port}`);
});

// stores all connections
const connections = [];

// (pk: stringified pubkey, {username: String, msgQueue: Array of String})
const allUsers = new Map();

// (username: String, pk: stringified String)
const usernameToPK = new Map();

// (pk: stringified String, connection: WebSocket)
const connectedUsers = new Map();

// (chatID: String, {chatName: String, members: Array of String})
const chats = new Map();

const sessionKeys = new Map();
const onClientDH = new Map();

const keyPair = nacl.sign.keyPair();
keyPair.publicKey = arrToStr(keyPair.publicKey);

var wsServer = new WebSocketServer({server});

// unique application identifier ('set-chat-client')
const setAppIdentifier = new Uint8Array([115, 101, 116, 45, 99, 104, 97, 116, 45, 99, 108, 105, 101, 110, 116]);
const enc = new TextEncoder();

if (!wsServer) {
  log("ERROR: Unable to create WebSocket server");
}

wsServer.on('connection', function(connection) {
  console.log("User connected");
  connections.push(connection);

  initSIGMA(connection);

  connection.onmessage = function(message) {
    var data;

    try {
      data = JSON.parse(message.data);
    } catch (e) {
      console.log("Invalid JSON");
      data = {};
    }

    switch (data.type) { 
      case "SIGMA2":
        onClientDH.get(connection)(data);
        break;
      case "login":
        onLogin(connection, data.name, strToArr(data.sig));
        break;     
      case "offer":
        onOffer(connection, data);
        break;
      case "answer":
        onAnswer(connection, data);
        break;
      case "candidate":
        onCandidate(connection, data);
        break;
      case "join":
        onJoin(connection, data);
        break;
      case "createChat":
        onCreateChat(connection, data);
        break;
      case "getPK":
        onGetPK(connection, data);
        break;
      case "getOnline":
        onGetOnline(connection, data);
        break;
      case "getUsername":
        onGetUsername(connection, data);
        break;
      case "add":
        onAdd(connection, data);
        break;
      case "remove":
        onRemove(connection, data);
        break;
      case "leave":
        onLeave(connection, data);
        break;
      default:
        sendTo(connection, {
          type: "error",
          message: "Command not found: " + data.type
        });

        break;
    }
  };

    connection.onclose = function() {
      if (connection.pk) {
        console.log(`User [${allUsers.get(connection.pk).username}] disconnected`);
        connectedUsers.delete(connection.pk);
        connections.splice(connections.indexOf(connection), 1);

        broadcastActiveUsernames();
      }
    };
})

async function initSIGMA (connection) {
  const dh = nacl.box.keyPair();

  sendTo(connection, {
    type: "SIGMA1",
    value: arrToStr(dh.publicKey),
  });

  const res = await new Promise((res) => { onClientDH.set(connection, res); });

  const serverValue = dh.publicKey;
  const clientValue = strToArr(res.value);
  const sessionKey = nacl.box.before(clientValue, dh.secretKey);
  const macKey = nacl.hash(concatArr(setAppIdentifier, sessionKey));
  console.log(JSON.stringify(sessionKey));

  sessionKeys.set(connection, {
    dh: dh,
    session: sessionKey,
    mac: macKey,
  });

  if (connectedUsers.has(res.pk)) {
    sendTo(connection, {
      type: "SIGMA3",
      status: "PK_IN_USE",
    });
    initSIGMA(connection);
    return
  }

  if (nacl.sign.detached.verify(concatArr(serverValue, clientValue), strToArr(res.sig), strToArr(res.pk)) 
  && nacl.verify(strToArr(res.mac), hmac512(macKey, strToArr(res.pk)))) {

    connection.pk = res.pk;
    sendTo(connection, {
      status: "SUCCESS",
      type: "SIGMA3",
      pk: keyPair.publicKey,
      sig: arrToStr(nacl.sign.detached(concatArr(clientValue, serverValue), keyPair.secretKey)),
      mac: arrToStr(hmac512(macKey, strToArr(keyPair.publicKey))),
    });

  } else {
    sendTo(connection, {
      type: "SIGMA3",
      status: "VERIF_FAILED"
    });
  }
}

function onLogin (connection, name, sig) {
  // connection: websocket, name: string, sig: Uint8Array
  console.log(`User [${name}] online`);
  var status = "SUCCESS";

  const pubKey = connection.pk;
  if (!nacl.sign.detached.verify(enc.encode(name), sig, strToArr(pubKey))) { status = "VERIF_FAILED"; }
  else if (usernameToPK.has(name) && usernameToPK.get(name) !== pubKey) { status = "NAME_TAKEN"; }
  else {
      if (allUsers.has(pubKey)) {
        onReconnect(connection, name, pubKey);
        return;
      }

      connectedUsers.set(pubKey, connection); 
      allUsers.set(pubKey, {msgQueue: [], username: name});
      usernameToPK.set(name, pubKey);
  } 
  sendTo(connection, { 
    type: "login", 
    status: status,
    username: name,
    joinedChats: []
  });
  broadcastActiveUsernames();
}

function onOffer (connection, data) {
  const receiverPK = data.to;
  console.log(`decoded pk ${receiverPK} as sent by user ${connection.pk}`);
  if (connectedUsers.has(receiverPK)) {
    console.log(`Sending offer to: ${allUsers.get(receiverPK).username}`);

    const conn = connectedUsers.get(receiverPK);

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(receiverPK);

      sendTo(conn, data);
    } else {
      sendTo(conn, { type: "peerOffline", pk: receiverPK});
    }
  }
}

function onAnswer (connection, data) {
  const receiverPK = data.to;
  if (connectedUsers.has(receiverPK)) {
    console.log(`Sending answer to: ${allUsers.get(receiverPK).username}`);
    
    const conn = connectedUsers.get(receiverPK);

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(receiverPK);

      sendTo(conn, data);
    } else {
      sendTo(conn, { type: "peerOffline", pk: receiverPK});
    }
  }
}

// note that this doesn't use message queue, simply bc the candidates will probs expire by then lolsies
function onCandidate (connection, data) {
  console.log(`Sending candidate to: ${data.name}`);

  broadcast({
    type: "candidate",
    candidate: data.candidate,
    from: connection.pk
  }, data.chatID);
}


function onLeave (connection, data) {
  console.log(`Disconnecting from ${data.pk}`);
  connectedUsers.delete(data.pk);
  connection.pk = null;
  initSIGMA(connection);
}

function onCreateChat (connection, data) {
  // data = {type: 'createChat', chatName: chat title, members: [list of users]}
  
  // add to list of chats
  chats.set(data.chatID, {chatName: data.chatName, members: [data.from]});
  console.log(`created chat ${data.chatName} with id ${chatID}`);
}

function onGetPK (connection, data) {
  if (!usernameToPK.has(data.username)) {
    console.log(`User ${data.username} does not exist`);
    sendTo(connection, {
      type: "getPK",
      username: data.username,
      success: false,
      pk: []
    })
    return;
  }

  console.log(`sending pk of user ${data.username}`);
  sendTo(connection, {
    type: "getPK",
    username: data.username,
    success: true,
    pk: usernameToPK.get(data.username)
  });
}

function getOnline (pk, chatID) {
  // pk : stringified(pk)
  const onlineMembers = [];
  if (chats.has(chatID) && (chats.get(chatID).members.includes(pk))) {
    for (const mem of chats.get(chatID).members) {
      if (connectedUsers.has(mem) && mem !== pk) {
        onlineMembers.push({
          peerName: allUsers.get(mem).username,
          peerPK: mem
        });
      }
    }
  }
  return onlineMembers;
}

function onGetOnline (connection, data) {
  sendTo(connection, {
    type: "getOnline",
    chatID: data.chatID,
    online: getOnline(connection.pk, data.chatID)
  })
}

function onGetUsername (connection, data) {
  console.log(`seeking username for${data.pk}`);
  if (allUsers.has(data.pk)) {
    console.log(`returning username ${allUsers.get(data.pk).username}`);
    sendTo(connection, {
      type: "getUsername",
      pk: data.pk,
      success: true,
      username: allUsers.get(data.pk).username
    });
  } else {
    sendTo(connection, {
      type: "getUsername",
      pk: data.pk,
      success: false,
    });
  }
}

function onAdd (connection, data) {
  // data = {type: 'add', to: username of invited user, chatID: chat id}
  console.log(JSON.stringify(data));
  const toPK = data.to;

  console.log(`adding member ${toPK} to chats store ${data.msg.chatID} ${chats.has(data.msg.chatID)} ${[...chats.keys()]}`);
  chats.get(data.msg.chatID).members.push(toPK);

  console.log(`sending add message for chat ${data.msg.chatID} to ${allUsers.get(toPK).username}`);
  if (connectedUsers.get(toPK) == null) {
    sendTo(null, data.msg, toPK);
  } else {
    sendTo(connectedUsers.get(toPK), data.msg);
  }
}

function onRemove (connection, data) {
  const toPK = data.to;
  // chats.get(data.chatID).members.splice(chats.get(data.chatID).members.indexOf(toPK), 1);

  console.log(`sending remove message for chat ${data.msg.chatID} to ${allUsers.get(toPK).username}`);
  if (connectedUsers.get(toPK) == null) {
    sendTo(null, data.msg, toPK);
  } else {
    sendTo(connectedUsers.get(toPK), data.msg);
  }
}

function broadcastActiveUsernames () {
  console.log(`Broadcasting active users: ${Array.from(connectedUsers.keys()).map(pk => allUsers.get(pk).username)}`);
  console.log(`All existing users: ${Array.from(allUsers.keys()).map(pk => allUsers.get(pk).username)}`);
  broadcast({
    type: "connectedUsers",
    usernames: Array.from(connectedUsers.keys()).map(pk => allUsers.get(pk).username).sort()
  });
}

// Helper function to stringify outgoing messages
// Sends the message of the user is online, else adds it to its queue (if it doesn't expire)
// TODO: If the user doesn't exist it should send an error
function sendTo(connection, message, pk = "") {
  // connection: RTCPeerConnection, message: JSON, pk: stringified
  if (connection != null) {
    connection.send(JSON.stringify(message));
    return;
  }

  if (allUsers.has(pk)) {
    allUsers.get(pk).msgQueue.push(message);
  }
}

function broadcast(message, id = 0) {
  if (id) {
    for (const memPK of chats.get(id).members) {
      if (connectedUsers.has(memPK)) {
        sendTo(connectedUsers.get(memPK), message);
      }
    }
  } else {
    for (const connection of connections) {
      sendTo(connection, message);
    }
  }
}

function getJoinedChats(pk) {
  // pk string
  var joined = new Map();
  
  for (const chatID of chats.keys()) {
    const chatInfo = chats.get(chatID);
    if (chats.get(chatID).members.includes(pk)) {
      joined.set(chatID, {
        chatName: chatInfo.chatName,
        members: chatInfo.members,
        currentMember: true
      });
      console.log(`user ${allUsers.get(pk).username} is in ${chatID}`);
    }
  }
  return joined;
}

function onReconnect (connection, name, pk) {
  // expecting same data as onLogin
  // we want to read through the message queue and send
  // connection: WebSocket, pk: String
  const msgQueue = allUsers.get(pk).msgQueue;
  const joinedChats = getJoinedChats(pk);
  connectedUsers.set(pk, connection);

  console.log(`User ${allUsers.get(pk).username} has rejoined`);
  console.log(`all chats..? ${JSON.stringify([...chats])}`);
  
  sendTo(connection, { 
    type: "login", 
    status: "SUCCESS",
    username: name,
    joinedChats: Array.from(joinedChats)
  });

  console.log(JSON.stringify({ 
    type: "login", 
    status: "SUCCESS",
    username: name,
    joinedChats: Array.from(joinedChats)
  }));

  while (msgQueue.length > 0) {
    console.log(`sending message queue`);
    sendTo(connection, msgQueue.shift());
  }

  broadcastActiveUsernames();
}

function objToStr (obj) {
  return JSON.stringify(Uint8Array.from(Object.values(obj)))
}

function xorArr (arr1, arr2) {
  if (arr1.length != arr2.length) { return false; }

  const res = new Uint8Array(arr1.length);
  for (let i=0; i < arr1.length; i++) {
      res[i] = arr1[i] ^ arr2[i];
  }
  return res;
}

function objToArr (obj) {
  return Uint8Array.from(Object.values(obj));
}

function strToArr (str) {
  return Uint8Array.from(str.match(/.{1,2}/g).map(s => parseInt(s, 16)));
}

function arrToStr (arr) {
  return Array.from(arr).map(n => {
      return n.toString(16).padStart(2, '0');
  }).join("");
}

function concatArr (arr1, arr2) {
  const merged = new Uint8Array(arr1.length + arr2.length);
  merged.set(arr1);
  merged.set(arr2, arr1.length);
  return merged;
}

const ipad = new Uint8Array(Array(128).fill(54));
const opad = new Uint8Array(Array(128).fill(92));

function hmac512 (k, m) {
  const kp = new Uint8Array(128);
  kp.set(k);
  return nacl.hash(concatArr(xorArr(kp, opad), nacl.hash(concatArr(xorArr(kp, ipad), m))));
}
