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

// stores all connections
const connections = [];

// (username: String, {msgQueue: Array of String, pubKey: Uint8Array})
// TODO: Extend with passwords, keys etc...
const allUsers = new Map();

// (username: String, {connection: WebSocket, chatrooms: Array of String})
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
    usernames: Array.from(connectedUsers.keys())
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
      if (connection.name) {
        console.log(`User [${connection.name}] disconnected`);
        const removeFrom = connectedUsers.get(connection.name).groups;
        connectedUsers.delete(connection.name);
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
  console.log(`User [${name}] with pubKey [${pubKey}] online`);
  // TODO: Need some username password stuff here later on

  if (allUsers.has(name)) {
    onReconnect(connection, name);
    return;
  }

  if(connectedUsers.has(name)) { 
    sendTo(connection, { 
        type: "login", 
        success: false, 
        joinedChats: JSON.stringify([])
    }); 
  } else { 
    connectedUsers.set(name, {connection: connection, groups: []}); 
    connection.name = name; 
    allUsers.set(name, {msgQueue: [], pubKey: pubKey})

    sendTo(connection, { 
      type: "login", 
      success: true,
      joinedChats: JSON.stringify([])
    });

    broadcastActiveUsernames();
  } 
}

function onOffer (connection, data) {
  const offerMessage = {
    type: "offer",
    offer: data.offer,
    from: connection.name
  };

  if (connectedUsers.has(data.to)) {
    console.log(`Sending offer to: ${data.to}`);

    const conn = connectedUsers.get(data.to).connection;

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(data.to);

      sendTo(conn, offerMessage);
    }
  }
}

function onAnswer (connection, data) {
  const answerMessage = {
    type: "answer",
    answer: data.answer,
    from: connection.name
  };

  if (connectedUsers.has(data.to)) {
    console.log(`Sending answer to: ${data.to}`);
    
    const conn = connectedUsers.get(data.to).connection;

    if (conn != null) {
      connection.otherNames = connection.otherNames || [];
      connection.otherNames.push(data.to);

      sendTo(conn, answerMessage);
    }
  }
}

// note that this doesn't use message queue, simply bc the candidates will probs expire by then lolsies
function onCandidate (connection, data) {
  console.log(`Sending candidate to: ${data.name}`);

  broadcast({
    type: "candidate",
    candidate: data.candidate,
    from: connection.name
  }, data.chatroomID);
}


function onLeave (data) {
  console.log(`Disconnecting from ${data.name}`);
  var conn = connectedUsers.get(data.name).connection;

  const index = conn.otherNames.indexOf(data.name);
  if (index > -1) {
    conn.otherNames.splice(index, 1);
  }

  if (conn != null) {
    sendTo(conn, {
      type: "leave",
      from: data.name
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
  const validMembers = data.members.filter(mem => allUsers.has(mem));

  const validMemberPubKeys = new Map();
  for (mem of data.members) {
    if (allUsers.has(mem)) {
      validMemberPubKeys.set(mem, allUsers.get(mem).pubKey);
      console.log(`member [${mem}] has pk ${allUsers.get(mem).pubKey}`);
    }
  }

  const invalidMembers = data.members.filter(mem => !allUsers.has(mem) && mem !== "");

  // add to list of chats
  chats.set(chatID, {chatName: data.chatName, members: validMembers});
  console.log(`created chat ${data.chatName} with id ${chatID}`);

  console.log(`validMemberPKs ${validMemberPubKeys}`);
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
  if (!allUsers.has(data.name)) {
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
    pubKey: allUsers.get(data.name).pubKey
  });
}

function onAdd (connection, data) {
  // data = {type: 'add', to: username of invited user, chatID: chat id}
  const addMessage = {
    type: "add",
    chatID: data.chatID,
    chatName: data.chatName,
    from: connection.name,
    fromPK: allUsers.get(connection.name).pubKey
  };
  console.log(`sending add message for chat ${data.chatID} to ${data.to}, with public key ${[...allUsers.get(connection.name).pubKey]}`);
  sendTo(connectedUsers.get(data.to).connection, addMessage);
}

function broadcastActiveUsernames () {
  console.log(`Broadcasting active users: ${Array.from(connectedUsers.keys())}`);
  console.log(`All existing users: ${Array.from(allUsers.keys())}`)
  broadcast({
    type: "usernames",
    usernames: Array.from(connectedUsers.keys())
  });
}

// Helper function to stringify outgoing messages
// Sends the message of the user is online, else adds it to its queue (if it doesn't expire)
// TODO: If the user doesn't exist it should send an error
function sendTo(connection, message, name = "") {
  if (connection != null) {
    connection.send(JSON.stringify(message));
    return;
  }

  if (allUsers.has(name)) {
    allUsers.get(name).msgQueue.push(message);
  }
}

function broadcast(message, id = 0) {
  if (id) {
    console.log(chats.get(id))
    for (username of chats.get(id).members) {
      if (connectedUsers.has(username)) {
        sendTo(connectedUsers.get(username).connection, message);
      }
    }
  } else {
    for (connection of connections) {
      sendTo(connection, message);
    }
  }
}

function getJoinedChats(name) {
  var joined = new Map();
  for (chatID of chats.keys()) {
    if (chats.get(chatID).members.includes(name)) {
      joined.set(chatID, chats.get(chatID));
    }
  }
  return joined;
}

function onReconnect (connection, name) {
  // expecting same data as onLogin
  // we want to read through the message queue and send
  msgQueue = allUsers.get(name).msgQueue;
  connectedUsers.set(name, {connection: connection, groups: []}); 
  connection.name = name;

  console.log(`User ${name} has rejoined`);
  
  sendTo(connection, { 
    type: "login", 
    success: true,
    joinedChats: JSON.stringify(Array.from(getJoinedChats(name)))
  });

  console.log(JSON.stringify({ 
    type: "login", 
    success: true,
    joinedChats: JSON.stringify(Array.from(getJoinedChats(name)))
  }))

  while (msgQueue.length > 0) {
    sendTo(connection, msgQueue);
    msgQueue.shift();
  }

  broadcastActiveUsernames();
}
