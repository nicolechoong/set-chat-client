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
      case "selectedIgnored":
        onSelectedIgnored(data.op);
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
      await new Promise(resolve => setTimeout(resolve, 200));
      await sendMessages("tester", [
        { type: "text", message: "helloooo", from: "jimmyGourd", chatID: 2 },
        { type: "text", message: "Amazon is sending you a refund of $1233.20. Please reply with your bank account and routing number fo receive the refund. #$#%#$%#$#$%#@###@@##$$$%%%", from: "percyPea", chatID: 2 },
        { type: "text", message: "uhoh looks like someone got hacked", from: "lauraCarrot", chatID: 2 }
      ]);
      break;

    case "3":
      chats.set(3, {chatName: 'Scenario 1: CST Chat 2020', members: ['jimmyGourd', 'lauraCarrot', 'percyPea', 'bobTomato']});
      addUser("tester", 3, "jimmyGourd");
      sendChatHistory("tester", 3, [
        {
          type: "add",
          username: "tester",
          chatName: 'Scenario 1',
          chatID: 3,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await sendMessages("tester", [
        { type: "text", message: "has the info theory group class been scheduled?", from: "bobTomato", chatID: 3 },
        { type: "text", message: "i don't think so", from: 'lauraCarrot', chatID: 3 },
        { type: "text", message: "does smfejiwfwi", from: 'percyPea', chatID: 3 },
        { type: "text", message: "rude", from: 'lauraCarrot', chatID: 3 },
      ]);
      await new Promise(resolve => setTimeout(resolve, 1000));
      sendTo(connectedUsers.get("tester"), removeUser("percyPea", 3, "lauraCarrot"));
      await new Promise(resolve => setTimeout(resolve, 1000));
      sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "he's so annoying", from: 'lauraCarrot', chatID: 3 }));
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendTo(connectedUsers.get("tester"), removeUser("lauraCarrot", 3, "percyPea", JSON.stringify([{ pk1: "lauraCarrot", action: "remove", pk2: "percyPea" }, { pk1: "percyPea", action: "remove", pk2: "lauraCarrot" }])));
      await new Promise(resolve => setTimeout(resolve, 3000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "lauraCarrot removes percyPea", from: "jimmyGourd", chatID: 3 }));
      break;

    

    case "4":
      chats.set(4, {chatName: 'Scenario 2', members: ['jimmyGourd', 'bobTomato', 'larryCucumber', 'percyPea']});
      addUser("tester", 4, "jimmyGourd");
      sendChatHistory("tester", 4, [
        {
          type: "add",
          username: "tester",
          chatName: 'Task 4',
          chatID: 4,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await sendMessages("tester", [
        { type: "text", message: "welcome!", from: "jimmyGourd", chatID: 4 },
        { type: "text", message: "Raid Shadow Legends: RAID: Shadow Legends™ is an immersive online experience with everything you'd expect from a brand new RPG title. It's got an amazing storyline, awesome 3D graphics, giant boss fights, PVP battles, and hundreds of never before seen champions to collect and customize. I never expected to get this level of performance out of a mobile game. Look how crazy the level of detail is on these champions! So go ahead and check out the video description to find out more about RAID: Shadow Legends™. There, you will find a link to the store page and a special code to unlock all sorts of goodies. Using the special code, you can get 50,000 Silver immediately, and a FREE Epic Level Champion as part of the new players program, courtesy of course of the RAID: Shadow Legends devs.", from: "larryCucumber", chatID: 4 },
        { type: "text", message: "LMAOOOO", from: "bobTomato", chatID: 4 },
        { type: "text", message: "someone kick larry out", from: "bobTomato", chatID: 4 }
      ]);
      break;
    
    case "4a":
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "larryCucumber removes tester", from: "jimmyGourd", chatID: 4 }));
      await new Promise(resolve => setTimeout(resolve, 1000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "larryCucumber removes tester", from: "bobTomato", chatID: 4 }));
      await new Promise(resolve => setTimeout(resolve, 1500));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "larryCucumber removes tester", from: "percyPea", chatID: 4 }));
      break;

    case "5":
      chats.set(5, {chatName: 'Scenario 3', members: ['jimmyGourd', 'bobTomato', 'lauraCarrot', 'percyPea']});
      addUser("tester", 5, "jimmyGourd");
      sendChatHistory("tester", 5, [
        {
          type: "add",
          username: "tester",
          chatName: 'Task 5',
          chatID: 5,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await sendMessages("tester", [
        { type: "text", message: "idk man there's too many of us here", from: "percyPea", chatID: 5 },
        { type: "text", message: "what? just let them stay", from: "jimmyGourd", chatID: 5 },
      ]);
      removeUser("tester", 5, "percyPea", false, null);
      break;
  }
}

async function sendMessages (to, msgs) {
  for (const msg of msgs) {
    sendTo(connectedUsers.get(to), addMsgID(msg));
    await new Promise(resolve => setTimeout(resolve, 200));
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
  if (data.sentTime == null) {
    data.sentTime = Date.now();
  }
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

function removeUser (to, chatID, from, dispute=null, peerIgnored=[]) {
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

async function onRemove (connection, data) {
  if (data.pk2 == "larryCucumber") {
    await new Promise(resolve => setTimeout(resolve, 3000));
    removeUser("tester", 5, "larryCucumber", dispute=true, null);
  }
}

// Helper function to stringify outgoing messages
// Sends the message of the user is online, else adds it to its queue (if it doesn't expire)
// TODO: If the user doesn't exist it should send an error
function sendTo (connection, message) {
  // connection: RTCPeerConnection, message: JSON, pk: stringified
  console.log(`sending ${message.type}`);
  if (connection != null) {
    connection.send(JSON.stringify(message));
    return;
  }
}

function onSelectedIgnored (op) {
  console.log(op);
  if (op.pk1 == "percyPea") {
    sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "good that he's gone", chatID: 3, from: "jimmyGourd"}));
  } else if (op.pk1 == "lauraCarrot") {
    sendChatHistory("tester", 3, [
      {
        type: "remove",
        pk1: "percyPea",
        pk2: "lauraCarrot",
        chatID: 3,
        dispute: false,
      }
    ]);
    sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "wow, that was dumb", chatID: 3, from: "percyPea"}));
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