const https = require('https');
const WebSocketServer = require('ws').Server;
const fs = require('fs');
const path = require('path');

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

app.get('/assets/css/fontawesome.min.css', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', '..', 'assets','css','fontawesome.min.css'));
});

app.get('/assets/css/solid.css', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', '..', 'assets','css','solid.css'));
});

app.get('/assets/webfonts/fa-solid-900.woff2', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', '..', 'assets','webfonts','fa-solid-900.woff2'));
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

// (pk: stringified String, {msgQueue: Array of String, username: String})
// TODO: Extend with passwords, keys etc...
const allUsers = new Map();

// (username: String, pk: stringified String)
const usernameToPK = new Map();

// (pk: stringified String, {connection: WebSocket, chatrooms: Array of String})
const connectedUsers = new Map();

// UNUSED FOR NOW
// (chatroomID: String, members: Array of username)
const chatrooms = new Map();

// (chatID: String, {chatName: String, members: Array of String})
const chats = new Map();

var wsServer = new WebSocketServer({server});

if (!wsServer) {
  log("ERROR: Unable to create WebSocket server");
}

wsServer.on('connection', function(connection) {
  console.log("User connected");
  connections.push(connection);
  sendTo(connection, {
    type: "connectedUsers",
    usernames: Array.from(connectedUsers.keys()).map(pk => allUsers.get(pk).username).sort(),
  });

  connection.onmessage = function(message) {
    var data;

    try {
      data = JSON.parse(message.data);
    } catch (e) {
      console.log("Invalid JSON");
      data = {};
    }

    switch (data.type) { 
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

function onLogin (connection, name, pubKey) {
  pubKey = JSON.stringify(pubKey);
  console.log(`User [${name}] with pubKey [${pubKey}] online`);
  // TODO: Need some username password stuff here later on

  if (allUsers.has(pubKey)) {
    onReconnect(connection, name, pubKey);
    return;
  }

  if(connectedUsers.has(pubKey)) { 
    sendTo(connection, { 
        type: "login", 
        success: false,
        username: name,
        joinedChats: []
    }); 
  } else { 
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