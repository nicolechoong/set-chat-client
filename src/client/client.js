import localforage from "https://unpkg.com/localforage@1.9.0/src/localforage.js";

var loginBtn = document.getElementById('loginBtn'); 
var sendMessageBtn = document.getElementById('sendMessageBtn');
var chatMessages = document.getElementById('chatMessages');

var loginInput = document.getElementById('loginInput');
var chatNameInput = document.getElementById('chatNameInput');
var messageInput = document.getElementById('messageInput');

var connectedUser, localConnection, sendChannel;
var localUsername;

// TODO: massive fucking techdebt of modularising

//////////////////////
// GLOBAL VARIABLES //
//////////////////////

var enc = new TextEncoder();
var dec = new TextDecoder();

// private keypair for the client
var keyPair;

// connection to peerName
var connectionNames = new Map();

const configuration = { 
   "iceServers": [
        { "urls": "stun:stun.12connect.com:3478" },
        { "urls": "stun:openrelay.metered.ca:80" },
        {
            "urls": "turn:openrelay.metered.ca:80",
            "username": "openrelayproject",
            "credential": "openrelayproject",
        },
        {
            "urls": "turn:openrelay.metered.ca:443",
            "username": "openrelayproject",
            "credential": "openrelayproject",
        },
        {
            "urls": "turn:openrelay.metered.ca:443?transport=tcp",
            "username": "openrelayproject",
            "credential": "openrelayproject",
        }
    ] 
}; 

var currentChatID;

// map from peerName:string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
var connections = new Map();

// (chatID: String, {chatName: String, members: Array of String})
var joinedChats = new Map();

// local cache : localForage instance
var store;

// map from name to public key
var keyMap = new Map();


/////////////////////////
// WebSocket to Server //
/////////////////////////

var connection = new WebSocket('wss://ec2-13-40-196-240.eu-west-2.compute.amazonaws.com:3000/'); 
// var connection = new WebSocket('wss://localhost:3000');

connection.onopen = function () { 
    console.log("Connected to server"); 
};
  
connection.onerror = function (err) { 
    console.log("Error: ", err);
    alert("Please authorise https://ec2-13-40-196-240.eu-west-2.compute.amazonaws.com:3000/ on your device before refreshing! ")
};

function sendToServer(message) {
    console.log(JSON.stringify(message));
    connection.send(JSON.stringify(message)); 
};
  
// Handle messages from the server 
connection.onmessage = function (message) { 
    console.log("Got message", message.data);
    var data = JSON.parse(message.data); 
	
    switch(data.type) { 
        case "login": 
            onLogin(data.success, new Map(JSON.parse(data.joinedChats))); 
            break; 
        case "offer": 
            onOffer(data.offer, data.from); 
            break; 
        case "answer": 
            onAnswer(data.answer, data.from); 
            break; 
        case "candidate": 
            onCandidate(data.candidate, data.from); 
            break;
        case "usernames":
            onUsernames(data.usernames);
            break;
        case "join":
            onJoin(data.usernames);
            break;
        case "leave":
            onLeave(data.from);
            break;
        case "createChat":
            onCreateChat(data.chatID, data.chatName, new Map(JSON.parse(data.validMemberPubKeys)), data.invalidMembers);
            break;
        case "add":
            onAdd(data.chatID, data.chatName, data.members, data.from);
            break;
        default: 
            break; 
   } 
};
  
// Server approves Login
function onLogin(success, chats) { 

    if (success === false) { 
        alert("oops...try a different username"); 
    } else {
        localUsername = loginInput.value;
        joinedChats = chats;
        updateHeading();

        initialiseStore();
    } 
};

function initialiseStore () {
    // new user: creates new store
    // returning user: will just point to the same instance
    store = localforage.createInstance({
        name: localUsername
    });

    store.setItem("keyPair", keyPair);
    store.setItem("joinedChats", joinedChats);
    store.setItem("test", "abcd").then(() => {
        store.getItem("test").then((test) => {
            console.log(`Retrieved from localforage ${test}`);
        })
    });
}

// Sending Offer to Peer
function sendOffer(peerName) {
    
    if (peerName !== null) { 
        const newConnection = initPeerConnection(peerName);
        connections.set(peerName, {connection: newConnection, sendChannel: null});
        connectionNames.set(newConnection, peerName);
        peerConnection = connections.get(peerName);

        peerConnection.sendChannel = peerConnection.connection.createDataChannel(`${localUsername}->${peerName}`);
        initChannel(peerConnection.sendChannel);
        console.log(`Created sendChannel for ${localUsername}->${peerName}`);

        console.log(`Sending offer to ${peerName}`);
        peerConnection.connection.createOffer(function (offer) { 
            sendToServer({
                to: peerName,
                type: "offer",
                offer: offer 
            });
                
            peerConnection.connection.setLocalDescription(offer);
        }, function (error) { 
            alert("An error has occurred."); 
        }); 
    }
}; 

// Receiving Offer + Sending Answer to Peer
function onOffer(offer, peerName) { 
    connections.set(peerName, {connection: initPeerConnection(), sendChannel: null});
    const peerConnection = connections.get(peerName);

    peerConnection.connection.setRemoteDescription(offer);

    console.log(`Sending answer to ${peerName}`);
    peerConnection.connection.createAnswer(function (answer) {
        peerConnection.connection.setLocalDescription(answer);
        sendToServer({ 
            to: peerName,
            type: "answer", 
            answer: answer 
        }); 
    }, function (error) { 
        alert("oops...error"); 
    });
}
  
// Receiving Answer from Peer
function onAnswer(answer, peerName) {
    connections.get(peerName).connection.setRemoteDescription(answer);
} 
 
// Receiving ICE Candidate from Server
function onCandidate(candidate, peerName) {
    if (connections.has(peerName)) {
        connections.get(peerName).connection.addIceCandidate(new RTCIceCandidate(candidate)); 
    }
}

function onUsernames(usernames) {
    if (usernames.length > 0) {
        document.getElementById('usernames').innerHTML = `Currently Online: ${usernames.join(", ")}`;
    }
}

// Depreciated: For now
function onJoin (usernames) {
    for (peerName of usernames) {
        if (!connections.has(peerName) && peerName !== localUsername) {
            sendOffer(peerName);
        }
    }
}

function onLeave (peerName) {
    connectionNames.delete(connections.get(peerName).connection);
    connections.get(peerName).sendChannel.close();
    connections.get(peerName).connection.close();
    updateChatWindow({from: "SET", message: `${peerName} has left the room`});
    connections.delete(peerName);
}

async function onCreateChat (chatID, chatName, validMemberPubKeys, invalidMembers) {
    console.log(`validmpk`);
    console.log([...validMemberPubKeys.entries()]);
    console.log([...validMemberPubKeys.keys()]);
    for (const mem of validMemberPubKeys.keys()) {
        console.log(mem);
        keyMap.set(mem, enc.encode(validMemberPubKeys.get(mem)));
    }
    
    if (invalidMembers.length > 0) {
        alert(`The following users do not exist ${invalidMembers}`);
    }

    var op = {
        action: 'create', 
        pk: keyPair.publicKey,
        nonce: nacl.randomBytes(length)
    };
    op["sig"] = nacl.sign(enc.encode(JSON.stringify(op)), keyPair.secretKey);
    const operations = new Set([op]);

    store.setItem(chatID, {
        metadata: {
            chatName: chatName,
            operations: operations,
            ignored: new Set()
        },
        history: new Map(),
    }).then(async () => {
        for (const mem of validMemberPubKeys.keys()) {
            await addOp(keyMap.get(mem), chatID);
            addToChat(chatID, mem);
            console.log(`added ${mem}`);
        }

        console.log(`successfully created ${chatName} with id ${chatID}`);
    });
}

function getDeps (operations) {
    var deps = new Set();
    for (op of operations) {
        const hOp = nacl.hash(enc.encode(JSON.stringify(op)));
        if (op.action !== "create" && !op.deps.has(hOp)) {
            deps.add(hOp);
            console.log(`dependency ${op.pk1} ${op.action} ${op.pk2}`);
        }
    }
    return deps;
}

async function addOp (pk2, chatID) {
    return new Promise(function(resolve) {
        store.getItem(chatID).then((chatInfo) => {
            console.log(`adding operation ${keyPair.publicKey} adds ${pk2}`);
            var op = {
                action: 'add', 
                pk1: keyPair.publicKey,
                pk2: pk2,
                deps: getDeps(chatInfo.metadata.operations)
            };
            op["sig"] = nacl.sign(enc.encode(JSON.stringify(op)), keyPair.secretKey);
            resolve(op);
        })
    });
}

// (chatID: String, {chatName: String, members: Array of String})
function onAdd (chatID, chatName, from) {
    console.log(`you've been added to ${chatName} by ${from}`);
    joinedChats.set(chatID, {chatName: chatName, members: []});
    // now we have to do syncing to get members

    updateChatOptions("add", chatID);
    updateHeading();
}

function addToChat(chatID, name) {
    sendToServer({
        type: 'add',
        to: name,
        chatID: chatID
    });
}

////////////////////////////
// Peer to Peer Functions //
////////////////////////////

function joinChat (chatID) {
    if (currentChatID !== chatID) {
        currentChatID = chatID;
        for (peerName of joinedChats.get(chatID).members) {
            if (peerName !== localUsername) {
                // Insert Key Exchange Protocol
                sendOffer(peerName);
            }
        }
    }
}

function initPeerConnection () {
    try {
        const connection = new RTCPeerConnection(configuration);
        connection.ondatachannel = receiveChannelCallback;
        connection.onicecandidate = function (event) {
            console.log("New candidate");
            if (event.candidate) {
                sendToServer({ 
                    type: "candidate", 
                    candidate: event.candidate,
                    name: localUsername,
                    chatroomID: currentChatID
                });
            }
        };
        connection.oniceconnectionstatechange = function (event) {
            if (connection.iceConnectionState === "failed") {
                console.log("Restarting ICE");
                connection.restartIce();
            }
        }
        connection.onconnectionstatechange = function (event) {
            console.log(event);
            if (connection.connectionState === "failed") {
                console.log("Restarting ICE");
                connection.restartIce();
            }
        }
        connection.onnegotiationneeded = function (event) {
            console.log("On negotiation needed")
            if (connection.connectionState === "failed") {
                connection.createOffer(function (offer) { 
                    sendToServer({
                        to: connectionNames.get(connection),
                        type: "offer",
                        offer: offer 
                    });
                    connection.setLocalDescription(offer);
                }, function (error) { 
                    alert("An error has occurred."); 
                }, function () {
                    console.log("Create Offer failed");
                }, {
                    iceRestart: true
                });
            }
        }
        console.log("Local RTCPeerConnection object was created");
        return connection;
    } catch (e) {
        console.error(e);
        return null;
    }
}

function initChannel (channel) {
    channel.onopen = (event) => { 
        console.log(event);
        console.log(`Channel ${event.target.label} opened`);
    }
    channel.onclose = (event) => { console.log(`Channel ${event.target.label} closed`); }
    channel.onmessage = (event) => {
        updateChatWindow(JSON.parse(event.data));
    }
}

function receiveChannelCallback (event) {
    peerName = (event.channel.label).split("->", 1)[0];
    console.log(`Received channel ${event.channel.label} from ${peerName}`);
    const peerConnection = connections.get(peerName);
    peerConnection.sendChannel = event.channel;
    initChannel (peerConnection.sendChannel);
    updateChatWindow({from: "SET", message: `${peerName} has joined`});
}

function updateChatWindow (data) {
    const msg = `${chatMessages.innerHTML}<br />${data.from}: ${data.message}`;
    chatMessages.innerHTML = msg;
}

function updateChatStore (chatID, messageData) {
    store.getItem(chatID).then((chatInfo) => {
        chatInfo.history.set(messageData.id, messageData);
        store.setItem(chatID, chatInfo);
    });
}

function broadcastToMembers (data) {
    for (username of joinedChats.get(currentChatID).members) {
        try {
            console.log(`sending ${data} to ${username}`);
            connections.get(username).sendChannel.send(JSON.stringify(data));
        } catch {
            continue;
        }
    }
}

function sendChatMessage (messageInput) {
    const data = {
        id: nacl.hash(enc.encode(`${localUsername}:${sentTime}`)),
        from: localUsername,
        message: messageInput,
        sentTime: Date.now()
    };

    broadcastToMembers(data);
    updateChatStore(currentChatID, data);
    updateChatWindow(data);
}


/////////////////////
// Event Listeners //
/////////////////////

// Send Login attempt
loginBtn.addEventListener("click", function (event) { 
    const loginInput = document.getElementById('loginInput').value;

    keyPair = nacl.box.keyPair();
    console.log("keyPair generated");

    if (loginInput.length > 0 && isAlphanumeric(loginInput)) {
        sendToServer({ 
            type: "login", 
            name: loginInput,
            pubKey: dec.decode(keyPair.publicKey)
        });
    }
});

messageInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendMessageBtn.click();
    }
})

sendMessageBtn.addEventListener("click", function () {
    if (messageInput.length > 0) {
        sendChatMessage(messageInput.value);
        messageInput.value = "";
    }
})

chatNameInput.addEventListener("change", selectChat);

newChatBtn.addEventListener("click", createNewChat);

function getChatNames() {
    var chatnames = []
    for (chatID of joinedChats.keys()) {
        chatnames.push(joinedChats.get(chatID).chatName)
    }
    return chatnames;
}

function getChatID(chatName) {
    for (chatID of joinedChats.keys()) {
        if (chatName === joinedChats.get(chatID).chatName) {
            return chatID;
        }
    }
    return -1;
}

function updateHeading() {
    const title = document.getElementById('heading');
    title.innerHTML = `I know this is ugly, but Welcome ${localUsername}`;
    if (joinedChats.size > 0) {
        availableChats = document.getElementById('availableChats');
        availableChats.innerHTML = `Chats: ${getChatNames().join(", ")}`;
    }
}

function selectChat() {
    const index = chatNameInput.selectedIndex;

    if (index > 0) {
        const chatName = chatNameInput.options.item(index).text;
        chatID = getChatID(chatName);
        console.log(`trying to join chatID ${chatID}`);

        chatTitle = document.getElementById('chatHeading');
        chatTitle.innerHTML = `Chat: ${chatName}`;
        chatMessages.innerHTML = "";
        const msg = "";
        store.getItem(currentChatID).then((chatInfo) => {
            for (mid of chatInfo.history.keys()) {
                msg = `${msg}<br />${data.from}: ${data.message}`
            }
            chatMessages.innerHTML = msg;
        });
        joinChat(chatID);
    }
}

// TODO: distinguish between same name different chat
function updateChatOptions(operation, chatID) {

    if (operation === "add") {
        var option = document.createElement("option");
        option.text = joinedChats.get(chatID).chatName;
        chatNameInput.options.add(option);
    } else {
        
    }
}

function createNewChat() {
    let newChatName = document.getElementById('newChatName').value;
    let member1 = document.getElementById('member1').value;
    let member2 = document.getElementById('member2').value;

    sendToServer({ 
        type: "createChat", 
        chatName: newChatName,
        members: [member1, member2]
    });
}

function isAlphanumeric(str) {
    return str === str.replace(/[^a-z0-9]/gi,'');
}