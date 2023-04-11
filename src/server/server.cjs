const https = require('https');
const WebSocketServer = require('ws').Server;
const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');
const {
  createHmac,
} = require('node:crypto');

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

// (pk: stringified pubkey, {msgQueue: Array of String, username: String})
const allUsers = new Map();

// (username: String, pk: stringified String)
const usernameToPK = new Map();

// (pk: stringified String, {connection: WebSocket, chatrooms: Array of String, dh: DiffieHellman object})
const connectedUsers = new Map();

// UNUSED FOR NOW
// (chatroomID: String, members: Array of username)
const chatrooms = new Map();

// (chatID: String, {chatName: String, members: Array of String})
const chats = new Map();

const sessionKeys = new Map();

const keyPair = nacl.sign.keyPair();

var wsServer = new WebSocketServer({server});

if (!wsServer) {
  log("ERROR: Unable to create WebSocket server");
}

wsServer.on('connection', function(connection) {
  console.log("User connected");
  connections.push(connection);

  sendDHValue(connection);

  connection.onmessage = function(message) {
    var data;

    try {
      data = JSON.parse(message.data);
    } catch (e) {
      console.log("Invalid JSON");
      data = {};
    }

    switch (data.type) { 
      case "clientDH":
        console.log(JSON.stringify(data));
        onClientDH(connection, objToArr(data.value), objToArr(data.pk), objToArr(data.sig), objToArr(data.mac));
        break;
      case "login":
        onLogin(connection, data.name, data.pubKey);
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
        onLeave(data);
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
        // const removeFrom = connectedUsers.get(connection.pk).groups;
        connectedUsers.delete(connection.pk);
        connections.splice(connections.indexOf(connection), 1);

        broadcastActiveUsernames();

        // for (chatroomID of removeFrom) {
        //   chatrooms.get(chatroomID).splice(chatrooms.get(chatroomID).indexOf(connection.name), 1);
        //   console.log(`${connection.name} has left ${chatroomID}`);
        //   broadcast({
        //     type: "leave",
        //     from: connection.name
        //   }, chatroomID);
        // }
      }
    };
})

function sendDHValue (connection) {
  const box = nacl.box.keyPair();
  sessionKeys.set(connection, box);

  sendTo(connection, {
    type: "initDH",
    value: box.publicKey,
  });
}

// unique application identifier ('set-chat-client')
const setAppIdentifier = new Uint8Array([115, 101, 116, 45, 99, 104, 97, 116, 45, 99, 108, 105, 101, 110, 116]);

function onClientDH (connection, clientValue, clientPK, clientSig, macValue) {
  // clientValue: uint8array, clientPK: uint8array, clientSig: uint8array, macValue: uint8array
  const serverValue = sessionKeys.get(connection).publicKey;
  const sessionKey = nacl.box.before(clientValue, sessionKeys.get(connection).secretKey);
  const macKey = nacl.hash(concatArr(setAppIdentifier, sessionKey));
  const kp = new Uint8Array(128);
  kp.set(macKey);

  const receivedValues = concatArr(serverValue, clientValue);
  const hmac = createHmac('sha512', kp);
  hmac.update(clientPK);
  console.log(new Uint8Array(hmac.digest()));

  if (nacl.sign.detached.verify(receivedValues, clientSig, clientPK) 
  && false) {

    const sentValues = concatArr(clientValue, serverValue);
    
    sendTo(connection, {
      success: true,
      type: "serverDH",
      pk: keyPair.publicKey,
      sig: nacl.sign.detached(sentValues, keyPair.secretKey),
      mac: nacl.sign.detached(keyPair.publicKey, macKey),
    });
  } else {
    sendTo(connection, {
      success: false
    });
  }
}

function onLogin (connection, name, pubKey) {
  pubKey = JSON.stringify(pubKey);
  console.log(`User [${name}] with pubKey [${pubKey}] online`);
  // TODO: Need some username password stuff here later on

  if(connectedUsers.has(pubKey)) { 
    sendTo(connection, { 
        type: "login", 
        success: false,
        username: name,
        joinedChats: []
    }); 
  } else { 
    if (allUsers.has(pubKey)) {
      onReconnect(connection, name, pubKey);
      return;
    }

    connectedUsers.set(pubKey, {connection: connection, groups: []}); 
    connection.pk = pubKey; 
    allUsers.set(pubKey, {msgQueue: [], username: name});
    usernameToPK.set(name, pubKey);

    sendTo(connection, { 
      type: "login", 
      success: true,
      username: name,
      joinedChats: []
    });

    broadcastActiveUsernames();
  } 
}

function onOffer (connection, data) {
  const receiverPK = JSON.stringify(data.to);
  console.log(`received ${JSON.stringify(data)}`);
  console.log(`decoded pk ${receiverPK} as sent by user ${connection.pk}`);
  if (connectedUsers.has(receiverPK)) {
    console.log(`Sending offer to: ${allUsers.get(receiverPK).username}`);

    const conn = connectedUsers.get(receiverPK).connection;

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(receiverPK);

      sendTo(conn, data);
    }
  }
}

function onAnswer (connection, data) {
  const receiverPK = JSON.stringify(data.to);
  if (connectedUsers.has(receiverPK)) {
    console.log(`Sending answer to: ${allUsers.get(receiverPK).username}`);
    
    const conn = connectedUsers.get(receiverPK).connection;

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(receiverPK);

      sendTo(conn, data);
    }
  }
}

// note that this doesn't use message queue, simply bc the candidates will probs expire by then lolsies
function onCandidate (connection, data) {
  console.log(`Sending candidate to: ${data.name}`);

  broadcast({
    type: "candidate",
    candidate: data.candidate,
    from: Uint8Array.from(Object.values(JSON.parse(connection.pk)))
  }, data.chatroomID);
}


function onLeave (data) {
  console.log(`Disconnecting from ${data.pk}`);
  var conn = connectedUsers.get(JSON.stringify(data.pk)).connection;
  connectedUsers.delete(JSON.stringify(data.pk));

  // const index = conn.otherNames.indexOf(JSON.stringify(data.pk));
  // if (index > -1) {
  //   conn.otherNames.splice(index, 1);
  // }

  // if (conn != null) {
  //   sendTo(conn, {
  //     type: "leave",
  //     from: data.pk
  //   });
  // }
}

// Depreciated: For joining public chatrooms (maybe revive later!!)
function onJoin (connection, data) {
  const chatroomID = data.id;

  if (!chatrooms.has(chatroomID)) {
    chatrooms.set(chatroomID, []);
  }

  if (chatrooms.get(chatroomID).indexOf(data.name) < 0) {
    chatrooms.get(chatroomID).push(data.name);
    connectedUsers.get(data.name).groups.push(chatroomID);
  }
  
  console.log(`Chatroom ${chatroomID} members: ${chatrooms.get(chatroomID)}`)

  sendTo(connection, {
    type: "join",
    usernames: chatrooms.get(chatroomID)
  });
}

function generateUID () {
  let id;
  do {
    id = Math.floor((Math.random() * 1000) + 1).toString();
  } while (chats.has(id));
  return id;
}

function onCreateChat (connection, data) {
  // data = {type: 'createChat', chatName: chat title, members: [list of users]}
  const chatID = generateUID();
  // const validMembers = data.members.filter(mem => usernameToPK.has(mem)).map(mem => JSON.parse(usernameToPK.get(mem)));

  // const validMemberPubKeys = new Map();
  // for (const pk of validMembers) {
  //   // pk: Object
  //   validMemberPubKeys.set(allUsers.get(JSON.stringify(pk)).username, pk);
  // }

  // const invalidMembers = data.members.filter(mem => !usernameToPK.has(mem));

  // add to list of chats
  chats.set(chatID, {chatName: data.chatName, members: [JSON.stringify(data.from)]});
  console.log(`created chat ${data.chatName} with id ${chatID}`);

  // console.log(`validMemberPKs ${JSON.stringify(Array.from(validMemberPubKeys))}`);
  const createChatMessage = {
    type: "createChat",
    chatID: chatID,
    chatName: data.chatName,
    // validMemberPubKeys: JSON.stringify(Array.from(validMemberPubKeys)),
    // invalidMembers: invalidMembers
  };

  sendTo(connection, createChatMessage, connection.pk);
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
    pk: Uint8Array.from(Object.values(JSON.parse(usernameToPK.get(data.username))))
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
          peerPK: Uint8Array.from(Object.values(JSON.parse(mem)))
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
  const toPK = JSON.stringify(data.to);

  console.log(`adding member ${toPK} to chats store ${data.msg.chatID} ${chats.has(data.msg.chatID)} ${[...chats.keys()]}`);
  chats.get(data.msg.chatID).members.push(toPK);

  console.log(`sending add message for chat ${data.msg.chatID} to ${allUsers.get(toPK).username}`);
  if (connectedUsers.get(toPK) == null) {
    sendTo(null, data.msg, toPK);
  } else {
    sendTo(connectedUsers.get(toPK).connection, data.msg);
  }
}

function onRemove (connection, data) {
  const toPK = JSON.stringify(data.to);
  // chats.get(data.chatID).members.splice(chats.get(data.chatID).members.indexOf(toPK), 1);

  console.log(`sending remove message for chat ${data.msg.chatID} to ${allUsers.get(toPK).username}`);
  if (connectedUsers.get(toPK) == null) {
    sendTo(null, data.msg, toPK);
  } else {
    sendTo(connectedUsers.get(toPK).connection, data.msg);
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
        sendTo(connectedUsers.get(memPK).connection, message);
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
  connectedUsers.set(pk, {connection: connection, groups: joinedChats}); 
  connection.pk = pk;

  console.log(`User ${allUsers.get(pk).username} has rejoined`);
  console.log(`all chats..? ${JSON.stringify([...chats])}`);
  
  sendTo(connection, { 
    type: "login", 
    success: true,
    username: name,
    joinedChats: Array.from(joinedChats)
  });

  console.log(JSON.stringify({ 
    type: "login", 
    success: true,
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

function objToArr (obj) {
  return Uint8Array.from(Object.values(obj));
}

function concatArr (arr1, arr2) {
  const merged = new Uint8Array(arr1.length + arr2.length);
  merged.set(arr1);
  merged.set(arr2, arr1.length);
  return merged;
}
