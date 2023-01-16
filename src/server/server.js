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

const server = https.createServer({ key, cert }, app);

const port = 3000;
server.listen(port, () => {
  console.log(`Server is listening on https://localhost:${port}`);
});

var enc = new TextEncoder();
var dec = new TextDecoder();

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
    type: "usernames",
    usernames: Array.from(connectedUsers.keys()).map(pk => allUsers.get(pk).username)
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
        const removeFrom = connectedUsers.get(connection.pk).groups;
        connectedUsers.delete(connection.pk);
        connections.splice(connections.indexOf(connection), 1);

        broadcastActiveUsernames()

        for (chatroomID of removeFrom) {
          chatrooms.get(chatroomID).splice(chatrooms.get(chatroomID).indexOf(connection.name), 1);
          console.log(`${connection.name} has left ${chatroomID}`);
          broadcast({
            type: "leave",
            from: connection.name
          }, chatroomID);
        }
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
        joinedChats: JSON.stringify([])
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
      joinedChats: JSON.stringify([])
    });

    broadcastActiveUsernames();
  } 
}

function onOffer (connection, data) {
  const receiverPK = JSON.stringify(data.to);
  console.log(`decoded pk ${receiverPK} as sent by user ${data.from}`)
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
  var conn = connectedUsers.get(data.pk).connection;

  const index = conn.otherNames.indexOf(data.pk);
  if (index > -1) {
    conn.otherNames.splice(index, 1);
  }

  if (conn != null) {
    sendTo(conn, {
      type: "leave",
      from: data.pk
    });
  }
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
  const validMembers = data.members.filter(mem => usernameToPK.has(mem)).map(mem => JSON.parse(usernameToPK.get(mem)));

  const validMemberPubKeys = new Map();
  for (pk of validMembers) {
    // pk: Object
    validMemberPubKeys.set(allUsers.get(JSON.stringify(pk)).username, pk);
  }

  const invalidMembers = data.members.filter(mem => !usernameToPK.has(mem));

  // add to list of chats
  chats.set(chatID, {chatName: data.chatName, members: [data.from], currentMember: true});
  console.log(`created chat ${data.chatName} with id ${chatID}`);

  console.log(`validMemberPKs ${JSON.stringify(Array.from(validMemberPubKeys))}`);
  const createChatMessage = {
    type: "createChat",
    chatID: chatID,
    chatName: data.chatName,
    validMemberPubKeys: JSON.stringify(Array.from(validMemberPubKeys)),
    invalidMembers: invalidMembers
  };

  sendTo(connection, createChatMessage, connection.pk);
}

function onGetPK (connection, data) {
  if (!usernameToPK.has(data.name)) {
    sendTo(connection, {
      type: "getPK",
      name: data.name,
      success: false,
      pubKey: []
    })
  }

  console.log(`sending pk of user ${data.name}`);
  sendTo(connection, {
    type: "getPK",
    name: data.name,
    success: true,
    pubKey: Uint8Array.from(Object.values(JSON.parse(usernameToPK.get(data.name))))
  });
}

function onAdd (connection, data) {
  // data = {type: 'add', to: username of invited user, chatID: chat id}
  console.log(`adding member ${data.to} to chats store`);
  chats.get(data.chatID).members.push(JSON.stringify(data.to));
  console.log(`sending add message for chat ${data.chatID} to ${allUsers.get(JSON.stringify(data.to)).username}`);
  if (connectedUsers.get(JSON.stringify(data.to)) == null) {
    sendTo(null, data, JSON.stringify(data.to));
  } else {
    sendTo(connectedUsers.get(JSON.stringify(data.to)).connection, data);
  }
}

function onRemove (connection, data) {
  chats.get(data.chatID).members.splice(chats.get(data.chatID).members.indexOf(JSON.stringify(data.to)), 1);
  console.log(`sending add message for chat ${data.chatID} to ${allUsers.get(JSON.stringify(data.to)).username}`);
  if (connectedUsers.get(JSON.stringify(data.to)) == null) {
    sendTo(null, data, JSON.stringify(data.to));
  } else {
    sendTo(connectedUsers.get(JSON.stringify(data.to)).connection, data);
  }
}

function broadcastActiveUsernames () {
  console.log(`Broadcasting active users: ${Array.from(connectedUsers.keys()).map(pk => allUsers.get(pk).username)}`);
  console.log(`All existing users: ${Array.from(allUsers.keys()).map(pk => allUsers.get(pk).username)}`);
  broadcast({
    type: "usernames",
    usernames: Array.from(connectedUsers.keys()).map(pk => allUsers.get(pk).username)
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

  console.log(``);
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
    if (chats.get(chatID).members.includes(pk)) {
      joined.set(chatID, chats.get(chatID));
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
  const joinedChats = Array.from(getJoinedChats(pk));
  connectedUsers.set(pk, {connection: connection, groups: []}); 
  connection.pk = pk;

  console.log(`User ${allUsers.get(pk).username} has rejoined`);
  console.log(`all chats..? ${JSON.stringify(chats)}`);
  
  sendTo(connection, { 
    type: "login", 
    success: true,
    username: name,
    joinedChats: JSON.stringify(joinedChats)
  });

  console.log(JSON.stringify({ 
    type: "login", 
    success: true,
    username: name,
    joinedChats: JSON.stringify(joinedChats)
  }))

  while (msgQueue.length > 0) {
    console.log(`sending message queue`);
    sendTo(connection, msgQueue.shift());
  }

  broadcastActiveUsernames();
}

function objToStr (obj) {
  return JSON.stringify(Uint8Array.from(Object.values(obj)))
}