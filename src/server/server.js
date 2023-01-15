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
    onReconnect(connection, pubKey);
    return;
  }

  if(connectedUsers.has(pubKey)) { 
    sendTo(connection, { 
        type: "login", 
        success: false, 
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
      joinedChats: JSON.stringify([])
    });

    broadcastActiveUsernames();
  } 
}

function onOffer (connection, data) {
  console.log(`decoded pk ${data.to} as sent by user ${data.from}`)
  if (connectedUsers.has(data.to)) {
    console.log(`Sending offer to: ${data.to}`);

    const conn = connectedUsers.get(data.to).connection;

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(data.to);

      sendTo(conn, data);
    }
  }
}

function onAnswer (connection, data) {
  if (connectedUsers.has(data.to)) {
    console.log(`Sending answer to: ${data.to}`);
    
    const conn = connectedUsers.get(data.to).connection;

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(data.to);

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
    from: connection.pk
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
    console.log(pk);
    validMemberPubKeys.set(allUsers.get(JSON.stringify(pk)).username, pk);
    console.log(`member [${allUsers.get(JSON.stringify(pk)).username}] has pk ${JSON.stringify(pk)}`);
  }

  const invalidMembers = data.members.filter(mem => !usernameToPK.has(mem));

  // add to list of chats
  chats.set(chatID, {chatName: data.chatName, members: validMembers});
  console.log(`created chat ${data.chatName} with id ${chatID}`);

  console.log(`validMemberPKs ${JSON.stringify(Array.from(validMemberPubKeys))}`);
  const createChatMessage = {
    type: "createChat",
    chatID: chatID,
    chatName: data.chatName,
    validMemberPubKeys: JSON.stringify(Array.from(validMemberPubKeys)),
    invalidMembers: invalidMembers
  };

  sendTo(connection, createChatMessage);
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
    pubKey: Uint8Array.from(Object.values(usernameToPK.get(data.name)))
  });
}

function onAdd (connection, data) {
  // data = {type: 'add', to: username of invited user, chatID: chat id}
  console.log(data.to);
  console.log(typeof data.to);
  console.log(data.to instanceof Uint8Array);
  console.log(`sending add message for chat ${data.chatID} to ${allUsers.get(JSON.stringify(data.to)).username}, with public key ${JSON.stringify(data.to)}`);
  sendTo(connectedUsers.get(JSON.stringify(data.to)).connection, data);
}

function broadcastActiveUsernames () {
  console.log(`Broadcasting active users: ${Array.from(usernameToPK.keys())}`);
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
    for (memPK of chats.get(id).members) {
      if (connectedUsers.has(memPK)) {
        sendTo(connectedUsers.get(memPK).connection, message);
      }
    }
  } else {
    for (connection of connections) {
      sendTo(connection, message);
    }
  }
}

function getJoinedChats(pk) {
  var joined = new Map();
  for (chatID of chats.keys()) {
    if (chats.get(chatID).members.includes(pk)) {
      joined.set(chatID, chats.get(chatID));
    }
  }
  return joined;
}

function onReconnect (connection, pk) {
  // expecting same data as onLogin
  // we want to read through the message queue and send
  msgQueue = allUsers.get(pk).msgQueue;
  connectedUsers.set(pk, {connection: connection, groups: []}); 
  connection.pk = pk;

  console.log(`User ${allUsers.get(pk).username} has rejoined`);
  
  sendTo(connection, { 
    type: "login", 
    success: true,
    joinedChats: JSON.stringify(Array.from(getJoinedChats(pk)))
  });

  console.log(JSON.stringify({ 
    type: "login", 
    success: true,
    joinedChats: JSON.stringify(Array.from(getJoinedChats(pk)))
  }))

  while (msgQueue.length > 0) {
    sendTo(connection, msgQueue);
    msgQueue.shift();
  }

  broadcastActiveUsernames();
}

function objToStr (obj) {
  return JSON.stringify(Uint8Array.from(Object.values(obj)))
}