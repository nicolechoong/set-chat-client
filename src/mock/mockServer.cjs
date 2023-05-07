const https = require('https');
const WebSocketServer = require('ws').Server;
const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl/nacl-fast.js');

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
      sendTo(connectedUsers.get("overlord"), addMsgID({ type: "text", message: "1, 2, 3, 4, 4a, 5, 5a, 6, 6a", from: "server", chatID: 100 }));
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
        { type: "text", message: "hi there", from: "jimmyGourd", chatID: 2 },
        { type: "text", message: "hullo", from: "percyPea", chatID: 2 },
        { type: "text", message: "hey", from: "lauraCarrot", chatID: 2 }
      ]);
      break;

    case "3":
      chats.set(3, {chatName: 'Scenario 1: Temple Run Appreciation Soc', members: ['jimmyGourd', 'bobTomato', 'percyPea']});
      addUser("tester", 3, "jimmyGourd");
      await sendMessages("tester", [
        { type: "text", message: "new high score!! try to beat 32982900", from: "jimmyGourd", chatID: 3 },
        { type: "text", message: "Amazon is sending you a refund of $1233.20. Please reply with your bank account and routing number fo receive the refund. #$#%#$%#$#$%#@###@@##$$$%%%", from: "bobTomato", chatID: 3 },
        { type: "text", message: "oh no looks like someone got hacked", from: "percyPea", chatID: 3 },
        { type: "text", message: "time to KICK", from: "percyPea", chatID: 3 }
      ]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendTo(connectedUsers.get("tester"), removeUser("bobTomato", 3, "percyPea"));
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "good riddance", from: "percyPea", chatID: 3 }));
      await new Promise(resolve => setTimeout(resolve, 4000));
      sendTo(connectedUsers.get("tester"), removeUser("percyPea", 3, "bobTomato", JSON.stringify([{ pk1: "percyPea", action: "remove", pk2: "bobTomato" }, { pk1: "bobTomato", action: "remove", pk2: "percyPea" }])));
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "bobTomato removes percyPea", pk2: "percyPea", from: "jimmyGourd", chatID: 3 }));
      break;

    case "4":
      chats.set(4, {chatName: 'Scenario 2: Iceland Trip 2023', members: ['jimmyGourd', 'lauraCarrot', 'percyPea', 'bobTomato']});
      addUser("tester", 4, "jimmyGourd");
      sendChatHistory("tester", 4, [
        {
          type: "add",
          username: "tester",
          chatName: 'Scenario 2',
          chatID: 4,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await sendMessages("tester", [
        { type: "text", message: "how's the 18-20th for you guys?", from: "percyPea", chatID: 4 },
        { type: "text", message: "i can't do those dates :( what about 22 to 24?", from: 'lauraCarrot', chatID: 4 },
        { type: "text", message: "I can do the first but not the second.", from: 'jimmyGourd', chatID: 4 },
        { type: "text", message: "... vice versa", from: 'bobTomato', chatID: 4 },
        { type: "text", message: "shall we split?", from: 'lauraCarrot', chatID: 4 },
        { type: "text", message: "ok. remove me?", from: 'percyPea', chatID: 4 },
      ]);
      await new Promise(resolve => setTimeout(resolve, 1000));
      sendTo(connectedUsers.get("tester"), removeUser("percyPea", 4, "lauraCarrot"));
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendTo(connectedUsers.get("tester"), removeUser("lauraCarrot", 4, "percyPea", JSON.stringify([{ pk1: "lauraCarrot", action: "remove", pk2: "percyPea" }, { pk1: "percyPea", action: "remove", pk2: "lauraCarrot" }])));
      await new Promise(resolve => setTimeout(resolve, 3000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "lauraCarrot removes percyPea", pk2: "percyPea", from: "jimmyGourd", chatID: 4 }));
      break;
    
    case "4a":
      await new Promise(resolve => setTimeout(resolve, 1000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "percyPea removes lauraCarrot", pk2: "lauraCarrot", from: "bobTomato", chatID: 4 }));
      break;

    case "5":
      chats.set(5, {chatName: 'Scenario 3: Top Secret Club', members: ['jimmyGourd', 'bobTomato', 'lauraCarrot', 'percyPea']});
      addUser("tester", 5, "jimmyGourd");
      sendChatHistory("tester", 5, [
        {
          type: "add",
          username: "tester",
          chatName: 'Scenario 3: Top Secret Club',
          chatID: 5,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await sendMessages("tester", [
        { type: "text", message: "guys percy told me his account was hacked", from: "bobTomato", chatID: 5 },
        { type: "text", message: "What? Oh no.", from: "jimmyGourd", chatID: 5 },
        { type: "text", message: "yeah idk what's happening", from: "bobTomato", chatID: 5 },
      ]);
      removeUser("tester", 5, "percyPea", false, null);
      break;
    
    case "5a":
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "percyPea removes tester", pk2: "tester", from: "jimmyGourd", chatID: 5 }));
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "percyPea removes tester", pk2: "tester", from: "lauraCarrot", chatID: 5 }));
      await new Promise(resolve => setTimeout(resolve, 2500));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "percyPea removes tester", pk2: "tester", from: "bobTomato", chatID: 5 }));
      break;

    case "6":
      chats.set(6, {chatName: 'Scenario 4: Gang gang', members: ['jimmyGourd', 'bobTomato', 'larryCucumber', 'percyPea']});
      addUser("tester", 6, "jimmyGourd");
      sendChatHistory("tester", 6, [
        {
          type: "add",
          username: "tester",
          chatName: 'Scenario 4: Gang gang',
          chatID: 6,
          pk1: "jimmyGourd",
          pk2: "tester"
        }
      ]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await sendMessages("tester", [
        { type: "text", message: "welcome!", from: "jimmyGourd", chatID: 6 },
        { type: "text", message: "Raid Shadow Legends: RAID: Shadow Legends™ is an immersive online experience with everything you'd expect from a brand new RPG title. It's got an amazing storyline, awesome 3D graphics, giant boss fights, PVP battles, and hundreds of never before seen champions to collect and customize. I never expected to get this level of performance out of a mobile game. Look how crazy the level of detail is on these champions! So go ahead and check out the video description to find out more about RAID: Shadow Legends™. There, you will find a link to the store page and a special code to unlock all sorts of goodies. Using the special code, you can get 50,000 Silver immediately, and a FREE Epic Level Champion as part of the new players program, courtesy of course of the RAID: Shadow Legends devs.", from: "larryCucumber", chatID: 6 },
        { type: "text", message: "LMAOOOO", from: "bobTomato", chatID: 6 },
        { type: "text", message: "someone kick larry out", from: "bobTomato", chatID: 6 }
      ]);
      break;

    case "6a":
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "tester removes larryCucumber", pk2: "larryCucumber", from: "jimmyGourd", chatID: 6 }));
      await new Promise(resolve => setTimeout(resolve, 1000));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "larryCucumber removes tester", pk2: "tester", from: "bobTomato", chatID: 6 }));
      await new Promise(resolve => setTimeout(resolve, 1500));
      sendTo(connectedUsers.get('tester'), addMsgID({ type: "ignored", op: "larryCucumber removes tester", pk2: "tester", from: "percyPea", chatID: 6 }));
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
    removeUser("tester", 6, "larryCucumber", dispute=true, null);
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
    sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "okay gang gang let's goooo", chatID: 4, from: "lauraCarrot"}));
  } else if (op.pk1 == "lauraCarrot") {
    sendChatHistory("tester", 4, [
      {
        type: "remove",
        pk1: "percyPea",
        pk2: "lauraCarrot",
        chatID: 4,
        dispute: false,
      }
    ]);
    sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "hello hello", chatID: 4, from: "percyPea"}));
    sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "let's start looking for flights", chatID: 4, from: "percyPea"}));
  } else if (op.pk1 == "bobTomato") {
    sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "anyways...", chatID: 3, from: "percyPea"}));
    sendTo(connectedUsers.get("tester"), addMsgID({ type: "text", message: "that score is only high until i double it hoho", chatID: 3, from: "percyPea"}));
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