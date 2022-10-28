const https = require('https');
const WebSocketServer = require('ws').Server;
const uuidv4 = require("uuid");
const fs = require('fs');

const express = require('express');
const { group } = require('console');
const app = express();

const key = fs.readFileSync("./cert/CA/localhost/localhost.decrypted.key");
const cert = fs.readFileSync("./cert/CA/localhost/localhost.crt");

app.get('/', (req, res, next) => {
  res.status(200).send('Hello world!');
});

const server = https.createServer({ key, cert }, app);

const port = 3000;
server.listen(port, () => {
  console.log(`Server is listening on https://localhost:${port}`);
});

// (username: String, {connection: WebSocket, chatrooms: Array of String})
const connectedUsers = new Map();
// (chatroomID: String, members: Array of username)
const chatrooms = new Map();

var wsServer = new WebSocketServer({server});

if (!wsServer) {
  log("ERROR: Unable to create WebSocket server");
}

wsServer.on('connection', function(connection) {
  console.log("User connected");
  sendTo(connection, {
    type: "usernames",
    usernames: Array.from(connectedUsers.keys())
  });

  connection.on('message', function(message) {
    var data;

    try {
      data = JSON.parse(message);
    } catch (e) {
      console.log("Invalid JSON");
      data = {};
    }

    switch (data.type) {
            
      case "login":
        onLogin(connection, data.name);
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
  })

    connection.on("close", function() {
      if (connection.name) {
        console.log(`User [${connection.name}] disconnected`);
        const removeFrom = connectedUsers.get(connection.name).groups;
        connectedUsers.delete(connection.name);

        broadcastActiveUsernames()

        for (chatroomID of removeFrom) {
          chatrooms.get(chatroomID).splice(chatrooms.get(chatroomID).indexOf(connection.name), 1);
          console.log(`Leaving group ${chatroomID}`);
          broadcast({
            type: "leave",
            from: connection.name
          }, chatroomID);
        }
      }
    });
})

function onLogin (connection, name) {
  console.log(`User [${name}] online`);

  if(connectedUsers.has(name)) { 
    sendTo(connection, { 
        type: "login", 
        success: false 
    }); 
  } else { 
    connectedUsers.set(name, {connection: connection, groups: []}); 
    connection.name = name; 

    sendTo(connection, { 
      type: "login", 
      success: true
    });

    broadcastActiveUsernames();
  } 
}

function onOffer (connection, data) {
  console.log(`Sending offer to: ${data.to}`);

  var conn = connectedUsers.get(data.to).connection;

  if (conn != null) {
    connection.otherNames = connection.otherNames || [];
    connection.otherNames.push(data.to);

    sendTo(conn, {
      type: "offer",
      offer: data.offer,
      from: connection.name
    });
  }
}

function onAnswer (connection, data) {
  console.log(`Sending answer to: ${data.to}`);

  var conn = connectedUsers.get(data.to).connection;

  if (conn != null) {
    connection.otherNames = connection.otherNames || [];
    connection.otherNames.push(data.to);

    sendTo(conn, {
      type: "answer",
      answer: data.answer,
      from: connection.name
    });
  }
}

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

function broadcastActiveUsernames () {
  console.log(`Broadcasting active users: ${Array.from(connectedUsers.keys())}`);
  broadcast({
    type: "usernames",
    usernames: Array.from(connectedUsers.keys())
  });
}

// Helper function to stringify outgoing messages
function sendTo(connection, message) {
  connection.send(JSON.stringify(message));
}

function broadcast(message, id = null) {
  const recipients = id ? chatrooms.get(id) : Array.from(connectedUsers.keys());
  for (username of recipients) {
    sendTo(connectedUsers.get(username).connection, message);
  }
}