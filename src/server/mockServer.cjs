const https = require('https');
const WebSocketServer = require('ws').Server;
const fs = require('fs');
const path = require('path');
const nacl = require('../../node_modules/tweetnacl/nacl-fast.js');

const express = require('express');
const app = express();
const enc = new TextEncoder();

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

  connection.onmessage = function(message) {
    var data;

    try {
      data = JSON.parse(message.data);
    } catch (e) {
      console.log("Invalid JSON");
      data = {};
    }

    console.log(`received ${data.type}`);
    switch (data.type) {
      case "login":
        onLogin(connection, data);
        break;
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
      case "text":
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
      }
    };
});

function onLogin (connection, data) {
  // data: type, name
  connectedUsers.set(data.name, connection);
  connections.push(connection);
  sendTo(connection, {
    type: "login",
  });

  if (data.name == "tester") {
    onSetup("1");
    onSetup("2");
    onSetup("3");
    onSetup("4");
    onSetup("5");
    onSetup("6");
  } else if (data.name == "overlord") {
    onSetup("0");
  }
}

async function onSetup (n) {
  console.log(`received setup ${n}`);
  switch (n) {
    case "0":
      chats.set(100, {chatName: 'Backdoor', members: ['server']});
      addUser("overlord", 100, "server");
      sendChatHistory('overlord', 100, [
        addMsgID({
          type: "add",
          chatName: 'Backdoor',
          chatID: 100,
          pk1: "server",
          pk2: "overlord"
        })
      ]);
      sendTo(connectedUsers.get("overlord"), addMsgID({ type: "text", message: "enter stuff", from: "server", chatID: 100 }));
      break;

    case "1":
      chats.set(1, {chatName: 'Task 1', members: ['jimmyGourd']});
      addUser("tester", 1, "jimmyGourd");
      sendChatHistory("tester", 1, [
        {
          type: "add",
          chatName: 'Task 1',
          chatID: 1,
          pk1: "jimmyGourd",
          pk2: "tester"
        }]);
      sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "helloooo", from: "jimmyGourd", chatID: 1 }));
      break;

    case "2":
      chats.set(2, {chatName: 'Task 2', members: ['jimmyGourd', 'lauraCarrot', 'percyPea']});
      addUser("tester", 2, "jimmyGourd");
      sendChatHistory("tester", 2, [
        {
          type: "add",
          username: "tester",
          chatName: 'Task 2',
          chatID: 2,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      sendMessages("tester", [
        { type: "text", message: "helloooo", from: "jimmyGourd", chatID: 2 },
        { type: "text", message: "Amazon is sending you a refund of $1233.20. Please reply with your bank account and routing number fo receive the refund. #$#%#$%#$#$%#@###@@##$$$%%%", from: "percyPea", chatID: 2 },
        { type: "text", message: "uhoh looks like someone got hacked", from: "lauraCarrot", chatID: 2 }
      ]);
      break;
    case "3":
      chats.set(3, {chatName: 'Task 3', members: ['jimmyGourd', 'lauraCarrot', 'percyPea']});
      addUser("tester", 3, "jimmyGourd");
      sendChatHistory("tester", 3, [
        {
          type: "add",
          username: "tester",
          chatName: 'Task 3',
          chatID: 3,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      sendMessages("tester", [
        { type: "text", message: "yo what's up guys", from: "lauraCarrot", chatID: 3 },
        { type: "text", message: "no", from: 'percyPea', chatID: 3 },
        { type: "text", message: "???", from: 'lauraCarrot', chatID: 3 },
        { type: "text", message: "rude", from: 'lauraCarrot', chatID: 3 },
      ]);
      await new Promise(resolve => setTimeout(resolve, 1000));
      sendTo(connectedUsers.get("tester"), removeUser("percyPea", 3, "lauraCarrot", [["jimmyGourd", "lauraCarrot"]]));
      await new Promise(resolve => setTimeout(resolve, 3000));
      sendTo(connectedUsers.get("tester"), removeUser("lauraCarrot", 3, "percyPea", JSON.stringify([{ pk1: "lauraCarrot", action: "remove", pk2: "percyPea" }, { pk1: "percyPea", action: "remove", pk2: "lauraCarrot" }])));
      break;
  }
}

function sendMessages (to, msgs) {
  for (const msg of msgs) {
    sendTo(connectedUsers.get(to), addMsgID(msg));
    new Promise(resolve => setTimeout(resolve, 1000))
  }
}

function sendChatHistory (to, chatID, history) {
  histIDs = []
  for (const msg of history) {
    histIDs.push(addMsgID(msg));
  }
    sendTo(connectedUsers.get(to), addMsgID({
      type: "history",
      history: histIDs,
      chatID: chatID,
      from: "jimmyGourd"
  }));
}

function addMsgID (data) {
  data.sentTime = Date.now();
  data.id = JSON.stringify(nacl.hash(enc.encode(`${data.from}:${data.sentTime}`)));
  return data;
}

function onAdd (connection, data) {
  sendTo(connectedUsers.get("overlord"), addMsgID({
    type: "text",
    message: JSON.stringify(data),
    from: "server",
    chatID: 100
  }))
}

function addUser (to, chatID, from) {
  // data = {type: 'add', to: username of invited user, chatID: chat id}
  chats.get(chatID).members.push(to);
  const msg = addMsgID({
    type: "add",
    pk1: from,
    pk2: to,
    chatID: chatID,
    members: JSON.stringify(chats.get(chatID).members),
    chatName: chats.get(chatID).chatName,
  });

  console.log(`adding ${to} to ${chatID}`);
  sendTo(connectedUsers.get(to), msg);
}

function removeUser (to, chatID, from, dispute=null, peerIgnored) {
  // data = {type: 'add', to: username of invited user, chatID: chat id}
  const msg = addMsgID({
    type: "remove",
    pk1: from,
    pk2: to,
    chatID: chatID,
    dispute: dispute,
    peerIgnored: JSON.stringify(peerIgnored)
  });

  console.log(`removing ${to} from ${chatID}`);
  sendTo(connectedUsers.get(to), msg);
  return msg;
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
function sendTo (connection, message, pk = "") {
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