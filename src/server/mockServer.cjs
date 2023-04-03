const https = require('https');
const WebSocketServer = require('ws').Server;
const fs = require('fs');
const path = require('path');
const nacl = require('../../node_modules/tweetnacl/nacl-fast.js');

const express = require('express');
const app = express();

const key = fs.readFileSync("./cert/CA/localhost/localhost.decrypted.key");
const cert = fs.readFileSync("./cert/CA/localhost/localhost.crt");

app.get('/', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', '..', 'index.html'));
});

app.get('/src/client/client.js', (req, res, next) => {
  res.status(200).sendFile(path.join(__dirname, '..', 'client', 'mockClient.js'));
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
var connectedUser;

// (chatID: String, {chatName: String, members: Array of String})
const chats = new Map();

const pubKey = "1234";

var wsServer = new WebSocketServer({server});

if (!wsServer) {
  log("ERROR: Unable to create WebSocket server");
}

wsServer.on('connection', function(connection) {
  console.log("User connected");
  connectedUser = connection;
  usernameToPK.set('tester', pubKey);
  connections.push(connection);

  connection.onmessage = function(message) {
    var data;

    try {
      data = JSON.parse(message.data);
    } catch (e) {
      console.log("Invalid JSON");
      data = {};
    }

    switch (data.type) {
      case "setup":
        onSetup(data.n);
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
        // const removeFrom = connectedUsers.get(connection.pk).groups;
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
});

const msgs = [
  { type: "text", message: "helloooo" }
]

function onSetup (n) {
  switch (n) {
    case 1:
      chats.set(1, {chatName: 'Task 1', members: ['jimmyGourd']});
      addUser("tester", 1, "jimmyGourd");
      sendChatHistory(1, msgs);
      break;
  }
}

function sendChatHistory (chatID, history) {
    sendTo(addMsgID({
      type: "history",
      history: history,
      chatID: chatID,
      from: "jimmyGourd"
  }), connectedUser);
}

function setupChats () {
  chats.set(1, {chatName: 'Task 1', members: ['jimmyGourd']});
  addUser("tester", 1, "jimmyGourd");
  sendChatHistory(1, msgs);

  // chats.set(2, {chatName: 'Task 2', members: ['jimmyGourd', 'lauraCarrot', 'percyPea']});
  // chats.set(3, {chatName: 'Task 3', members: ['jimmyGourd']});
  // chats.set(4, {chatName: 'Task 4', members: ['jimmyGourd']});
  // chats.set(5, {chatName: 'Task 5', members: ['jimmyGourd']});
  // chats.set(6, {chatName: 'Task 6', members: ['jimmyGourd']});
}

function addMsgID (data) {
  data.sentTime = Date.now();
  data.id = JSON.stringify(nacl.hash(enc.encode(`${localUsername}:${data.sentTime}`)));
  return data;
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

function addUser (name, chatID, from) {
  // data = {type: 'add', to: username of invited user, chatID: chat id}
  const msg = addMsgID({
    "type": "add",
    username: name,
    from: from,
    chatID: chatID,
    chatName: chats.get(chatID).chatName,
  });

  chats.get(chatID).members.push(name);
  sendTo(connectedUser, msg);
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

// Helper function to stringify outgoing messages
// Sends the message of the user is online, else adds it to its queue (if it doesn't expire)
// TODO: If the user doesn't exist it should send an error
function sendTo(connection, message, pk = "") {
  // connection: RTCPeerConnection, message: JSON, pk: stringified
  console.log(`sending ${message.type}`);
  if (connection != null) {
    connection.send(JSON.stringify(message));
    return;
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
    }
  }
  return joined;
}

function objToStr (obj) {
  return JSON.stringify(Uint8Array.from(Object.values(obj)))
}