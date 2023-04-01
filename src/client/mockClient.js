import localforage from "https://unpkg.com/localforage@1.9.0/src/localforage.js";
import nacl from 'tweetnacl-es6';
import * as access from "./accessControl.js";
import * as elem from "./components.js";
import {strToArr, objToArr, formatDate, arrEqual, isAlphanumeric} from "./utils.js";

const loginBtn = document.getElementById('loginBtn');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const addUserBtn = document.getElementById('addUserBtn');
const disputeBtn = document.getElementById('disputeBtn');
const acceptRemovalBtn = document.getElementById('acceptRemovalBtn');
const newChatBtn = document.getElementById('newChatBtn');
const resetStoreBtn = document.getElementById('resetStoreBtn');
const chatBox = document.getElementById('chatBox');

const chatList = document.getElementById('chatList');
const memberList = document.getElementById('memberList');
const conflictCardList = document.getElementById('conflictCardList');

const chatBar = document.getElementById('chatBar');
const disabledChatBar = document.getElementById('disabledChatBar');
const chatWindow = document.getElementById('chatWindow');

const loginInput = document.getElementById('loginInput');
const messageInput = document.getElementById('messageInput');
const addUserInput = document.getElementById('addUserInput');

var localUsername;


//////////////////////
// GLOBAL VARIABLES //
//////////////////////

const enc = new TextEncoder();

// private keypair for the client
var keyPair;

// connection to stringified(peerPK)
var connectionNames = new Map();

var currentChatID, connections, joinedChats, msgQueue;
export var keyMap;

var store = new Map();

function initialiseClient () {
    currentChatID = 0;
    connections = new Map(); // map from stringify(pk):string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
    joinedChats = new Map(); // (chatID: String, {chatName: String, members: Array of String})
    keyMap = new Map(); // map from public key : stringify(pk) to username : String
    msgQueue = new Map(); // map from public key : stringify(pk) to array of JSON object representing the message data

    // layout
    [...chatList.childNodes].forEach((node) => {
        if (node.id !== "chatCardTemplate") {
            chatList.removeChild(node);
        }
    });
    document.getElementById('defaultText').style.display = "block";
    document.getElementById('chatInfo').style.display = "none";
    document.getElementById('chatBoxHeading').style.display = "none";
    [...document.getElementsByClassName('chat-bar')].forEach((elem) => {
        elem.style.display = "none";
    });
    chatWindow.innerHTML = "";
    currentChatID = 0;

    dim.style.display = "block";
    loginPopup.style.display = "flex";
    loginInput.focus();
    loginInput.select();
}

initialiseClient();

/////////////////////////
// WebSocket to Server //
/////////////////////////

var connection = new WebSocket('wss://35.178.80.94:3000/');
// var connection = new WebSocket('wss://localhost:3000');

connection.onopen = function () {
    console.log("Connected to server");
};

connection.onerror = function (err) {
    console.log("Error: ", err);
    alert("Please authorise wss://35.178.80.94:3000/ on your device before refreshing! ")
};

function sendToServer(message) {
    console.log(JSON.stringify(message));
    connection.send(JSON.stringify(message));
};

// Handle messages from the server 
connection.onmessage = function (message) {
    console.log("Got message", message.data);
    var data = JSON.parse(message.data);

    switch (data.type) {
        case "login":
            onLogin(data.success, new Map(data.joinedChats), data.username);
            break;
        case "text":
            updateChatWindow(data);
            break;
        case "connectedUsers":
            onConnectedUsers(data.usernames);
            break;
        case "join":
            onJoin(data.usernames);
            break;
        case "leave":
            onLeave(JSON.stringify(data.from));
            break;
        case "createChat":
            onCreateChat(data.chatID, data.chatName);
            break;
        case "add":
            onAdd(data.chatID, data.chatName, objToArr(data.from), data.id);
            break;
        case "remove":
            onRemove(data);
            break;
        case "getUsername":
            onGetUsername(data.username, data.success, data.pk);
            break;
        case "getPK":
            onGetPK(data.username, data.success, objToArr(data.pk));
            break;
        case "getOnline":
            onGetOnline(data.online, data.chatID);
            break;
        default:
            break;
    }
};

// Server approves Login
async function onLogin(success, chats, username) {

    if (success === false) {
        alert("oops...try a different username");
    } else {
        localUsername = username;
        joinedChats = mergeJoinedChats(joinedChats, new Map());
        store.setItem("joinedChats", joinedChats);

        keyMap.set(JSON.stringify(keyPair.publicKey), localUsername);
        store.getItem("keyMap").then((storedKeyMap) => {
            keyMap = storedKeyMap === null ? new Map() : storedKeyMap;
            keyMap.set(JSON.stringify(keyPair.publicKey), localUsername);
            store.setItem("keyMap", keyMap);
        })
        store.getItem("msgQueue").then((storedMsgQueue) => {
            msgQueue = storedMsgQueue === null ? new Map() : storedMsgQueue;
        });

        loginPopup.style.display = "none";
        dim.style.display = "none";
        document.getElementById('heading').innerHTML = `I know this is ugly, but Welcome ${localUsername}`;

        for (const chatID of joinedChats.keys()) {
            updateChatOptions("add", chatID);
            getOnline(chatID);
        }
    }
};

async function initialiseStore(username) {
    // new user: creates new store
    // returning user: will just point to the same instance
    console.log(`init store local user: ${username}`);
    store = localforage.createInstance({
        storeName: username
    });
    store.getItem("joinedChats").then((chats) => {
        if (chats === null) {
            joinedChats = [];
        } else {
            joinedChats = chats;
        }
        store.setItem("joinedChats", joinedChats).then(console.log(`store initialised to ${joinedChats}`));
    });
}


function onConnectedUsers(usernames) {
    if (localUsername) {
        const toSend = [...msgQueue.entries()].filter(entry => usernames.has(keyMap.get(entry[0]))).map(entry => entry[0]);
        for (const pk of toSend) {
            onQueuedOnline(objToArr(pk));
        }
    }
}


// When being added to a new chat
async function onAdd(chatID, chatName, fromPK, msgID) {
    // chatID: String, chatName: String, from: String, fromPK: Uint8Array, msgID: 

    // we want to move this actual joining to after syncing with someone from the chat
    const from = await getUsername(JSON.stringify(fromPK));
    console.log(`you've been added to chat ${chatName} by ${from}`);

    if (!joinedChats.has(chatID)) {
        joinedChats.set(chatID, {
            chatName: chatName,
            validMembers: [JSON.stringify(fromPK)],
            members: [JSON.stringify(fromPK)],
            exMembers: new Set(),
            peerIgnored: new Map(),
            currentMember: false,
            conc: [],
            toDispute: null
        });

        store.set(chatID, {
            metadata: {
                chatName: chatName,
                operations: [],
                ignored: []
            },
            history: [],
            historyTable: new Map(),
        });
    }
}

async function addToChat (validMemberPubKeys, chatID) {
    // members is the list of members pubkey: object
    var chatInfo = store.get(chatID);
    var pk;
    for (const name of validMemberPubKeys.keys()) {
        console.log(`we are now adding ${name} who has pk ${pk} and the ops are ${chatInfo.metadata.operations}`);

        const addMessage = addMsgID({
            type: "add",
            from: keyPair.publicKey,
            username: name,
            chatID: chatID,
        });

        joinedChats.get(chatID).validMembers.push(JSON.stringify(pk));
        joinedChats.get(chatID).members.push(JSON.stringify(pk));
        // broadcastToMembers(addMessage, chatID);
        sendToServer({
            to: pk,
            type: "add",
            msg: addMessage
        });
    }
}


async function onRemove (messageData) {
    const fromPK = objToArr(messageData.from);
    var chatInfo = joinedChats.get(messageData.chatID);
    if (chatInfo.validMembers.includes(JSON.stringify(fromPK))) {
        const from = await getUsername(JSON.stringify(fromPK));
        chatInfo.currentMember = false;

        // if the removal is disputable
        if (!messageData.dispute) { 
            chatInfo.toDispute = { peerName: from, peerPK: fromPK };
        }

        if (chatInfo.members.includes(JSON.stringify(keyPair.publicKey))) {
            chatInfo.members.splice(chatInfo.members.indexOf(JSON.stringify(keyPair.publicKey)), 1);
            updateChatWindow(messageData);
        }
        chatInfo.exMembers.add(JSON.stringify(keyPair.publicKey));

        if (document.getElementById(`userCard${localUsername}`)) { document.getElementById(`userCard${localUsername}`).remove(); }
        disableChatMods(messageData.chatID);
        
        console.log(`you've been removed from chat ${chatInfo.chatName} by ${from}`);
    }
}

export async function removeFromChat (username, pk, chatID) {
    // username : string, public key : string, chatID : string
    const removeMessage = addMsgID({
        type: "remove",
        from: keyPair.publicKey,
        chatID: chatID,
        dispute: false
    });
    // broadcastToMembers(removeMessage, chatID);
    sendToServer({
        to: strToArr(pk),
        type: "remove",
        msg: removeMessage
    });
}

async function disputeRemoval(peer, chatID) {
    store.getItem(chatID).then(async (chatInfo) => {
        const end = chatInfo.metadata.operations.findLastIndex((op) => op.action === "remove" && arrEqual(op.pk2, keyPair.publicKey));
        const ignoredOp = chatInfo.metadata.operations.at(end);
        console.log(`we are now disputing ${peer.peerName} and the ops are ${chatInfo.metadata.operations.slice(0, end).map(op => op.action)}`);
        const op = await access.generateOp("remove", keyPair, peer.peerPK, chatInfo.metadata.operations.slice(0, end));

        console.log(`${chatInfo.history.map(msg => msg.type)}`);
        const ignoredOpIndex = chatInfo.history.findIndex(msg => msg.type == ignoredOp.action && arrEqual(objToArr(msg.op.sig), ignoredOp.sig));
        if (ignoredOpIndex > -1) {
            chatInfo.history.splice(ignoredOpIndex);
        }

        chatInfo.metadata.operations.push(op);
        chatInfo.metadata.ignored.push(ignoredOp);
        await store.setItem(chatID, chatInfo);
        await refreshChatWindow(chatID);

        const removeMessage = addMsgID({
            type: "remove",
            op: op,
            username: peer.peerName,
            from: keyPair.publicKey,
            chatID: chatID,
            dispute: true,
        });


        sendToMember(removeMessage, JSON.stringify(keyPair.publicKey));
        sendToServer({
            to: peer.peerPK,
            type: "remove",
            msg: removeMessage
        });
        
        for (const mem of joinedChats.get(chatID).members) {
            connectToPeer({ peerName: await getUsername(mem), peerPK: objToArr(JSON.parse(mem)) });
        }

        updateMembers(await access.members(chatInfo.metadata.operations, chatInfo.metadata.ignored), chatID);
    });
}

var resolveGetUsername = new Map();
var rejectGetUsername = new Map();

function onGetUsername(name, success, pk) {
    // name: String, success: boolean, pk: string
    if (success) {
        keyMap.set(pk, name);
        store.setItem("keyMap", keyMap);
        resolveGetUsername.get(pk)(name);
    } else {
        rejectGetUsername.get(pk)(new Error("User does not exist"));
        console.error(`User ${name} does not exist`);
    }
    resolveGetUsername.delete(pk);
    rejectGetUsername.delete(pk);
}

function getUsername(pk) {
    // pk: stringified(pk)
    return new Promise((resolve, reject) => {
        if (keyMap.has(pk)) {
            resolve(keyMap.get(pk));
            return;
        }
        resolveGetUsername.set(pk, resolve);
        rejectGetUsername.set(pk, reject);
        sendToServer({
            type: "getUsername",
            pk: pk
        });
    });
}

function onGetPK(name, success, pk) {
    // name: String, success: boolean, pk: Uint8Array
    if (success) {
        keyMap.set(JSON.stringify(pk), name);
        store.setItem("keyMap", keyMap);
        resolveGetPK.get(name)(pk);
    } else {
        rejectGetPK.get(name)(new Error("User does not exist"));
        console.error(`User ${name} does not exist`);
    }
    resolveGetPK.delete(name);
    rejectGetPK.delete(name);
}

async function onGetOnline(online, chatID) {
    if (online.length == 0) {
        resolveGetOnline.get(chatID)(false);
    }
    for (const peer of online) {
        peer.peerPK = objToArr(peer.peerPK);
        if (await connectToPeer(peer)) {
            sendOperations(chatID, JSON.stringify(peer.peerPK));
            resolveGetOnline.get(true); // doesn't mean that it synced
        }
    }
    resolveGetOnline.delete(chatID);
}

var resolveGetOnline = new Map();

function getOnline(chatID) {
    return new Promise((resolve) => {
        resolveGetOnline.set(chatID, resolve);
        sendToServer({
            type: "getOnline",
            pk: keyPair.publicKey,
            chatID: chatID
        });
    });
}

async function onQueuedOnline(pk) {
    // pk: Uint8Array
    if (await connectToPeer(pk)) {
        const queue = msgQueue.get(JSON.stringify(pk));
        while (queue.length > 0) {
            sendToMember(queue.shift(), JSON.stringify(pk));
        }
        msgQueue.delete(JSON.stringify(pk)); // honestly so fucking crude
    }
}

//////////////////////////////
// Access Control Functions //
//////////////////////////////

var resolveGetPK = new Map();
var rejectGetPK = new Map();

function getPK(username) {
    return new Promise((resolve, reject) => {
        for (const pk of keyMap) {
            if (username == keyMap.get(pk)) {
                resolve(objToArr(pk));
                return;
            }
        }
        resolveGetPK.set(username, resolve);
        rejectGetPK.set(username, reject);
        sendToServer({
            type: "getPK",
            username: username
        });
    });
}

async function sendOperations(chatID, pk) {
    // chatID : String, pk : String
    console.log(`sending operations to ${keyMap.get(pk)}`);
    store.getItem(chatID).then((chatInfo) => {
        sendToMember({
            type: "ops",
            ops: chatInfo.metadata.operations,
            chatID: chatID,
            from: keyPair.publicKey,
        }, pk);
    });
}

async function sendIgnored (ignored, chatID, pk) {
    // chatID : String, pk : String
    const ignoredMessage = addMsgID({
        type: "ignored",
        ignored: ignored,
        chatID: chatID,
        from: keyPair.publicKey,
        replay: false
    });
    broadcastToMembers(ignoredMessage, chatID);
    if (!joinedChats.get(chatID).members.includes(pk)) {
        sendToMember(ignoredMessage, pk)
    }
}

async function receivedIgnored (ignored, chatID, pk) {
    // ignored: Array of Object, chatID: String, pk: stringify(public key of sender)
    return new Promise(async (resolve) => {
        navigator.locks.request("ops", async () => {
            console.log(`ignored acquired lock`);
            await store.getItem(chatID).then(async (chatInfo) => {
                if (pk === JSON.stringify(keyPair.publicKey)) { resolve("IGNORE"); return; }
                console.log(`receiving ignored ${ignored.length} for chatID ${chatID} from ${keyMap.get(pk)}`);

                // we need to receive ops and ignored, and queue if we are missing dependencies
                const graphInfo = access.hasCycles(chatInfo.metadata.operations);
                if (graphInfo.cycle && access.unresolvedCycles(graphInfo.concurrent, chatInfo.metadata.ignored)) {
                    console.log(`not resolved?`);
                    joinedChats.get(chatID).peerIgnored.set(pk, ignored);
                    store.setItem("joinedChats", joinedChats);
                    resolve("WAITING FOR LOCAL IGNORED");
                    return;
                }
            
                if (opsArrEqual(chatInfo.metadata.ignored, ignored)) {
                    console.log(`same universe naisu`);
                    const memberSet = await access.members(chatInfo.metadata.operations, chatInfo.metadata.ignored);
                    joinedChats.get(chatID).exMembers.delete(pk);
                    await store.setItem("joinedChats", joinedChats);
                    if (memberSet.has(pk)) {
                        updateMembers(memberSet, chatID);
                    }

                    if (memberSet.has(JSON.stringify(keyPair.publicKey))) {
                        resolve("ACCEPT");
                    } else {
                        resolve("REJECT");
                    }

                } else {
                    console.log(`different universe from ${keyMap.get(pk)}`);
                    if (joinedChats.get(chatID).members.includes(pk)) {
                        joinedChats.get(chatID).members.splice(joinedChats.get(chatID).members.indexOf(pk), 1);
                    }
                    joinedChats.get(chatID).exMembers.add(pk);
                    store.setItem("joinedChats", joinedChats);
                    updateChatInfo();
                    resolve("REJECT");
                }
            });
            console.log(`ignored released lock`);
        });
    });
}

async function receivedOperations (ops, chatID, pk) {
    // ops: Array of Object, chatID: String, pk: stringify(public key of sender)
    console.log(`receiving operations for chatID ${chatID}`);
    return new Promise((resolve) => {
        navigator.locks.request("ops", async () => {
            console.log(`ops acquired lock`);
            if (pk === JSON.stringify(keyPair.publicKey)) { return resolve("ACCEPT"); }
            store.getItem(chatID).then(async (chatInfo) => {
                ops = unionOps(chatInfo.metadata.operations, ops);
                var ignoredSet = chatInfo.metadata.ignored; // because the concurrent updates are not captured hhhh

                if (access.verifyOperations(ops)) {
                    chatInfo.metadata.operations = ops;
                    await store.setItem(chatID, chatInfo);

                    const graphInfo = access.hasCycles(ops);
                    if (graphInfo.cycle) {
                        if (access.unresolvedCycles(graphInfo.concurrent, chatInfo.metadata.ignored)) {
                            console.log(`cycle detected`);
                            ignoredSet = await getIgnored(graphInfo.concurrent, chatID);
                        }

                        sendIgnored(ignoredSet, chatID, pk);
                        for (const [queuedPk, queuedIg] of joinedChats.get(chatID).peerIgnored) {
                            receivedMessage({
                                type: "ignored",
                                ignored: queuedIg,
                                chatID: chatID,
                                from: strToArr(queuedPk),
                                replay: true
                            });
                            joinedChats.get(chatID).peerIgnored.delete(queuedPk);
                            await store.setItem("joinedChats", joinedChats);
                        }
                    }
                    const memberSet = await access.members(chatInfo.metadata.operations, ignoredSet);
                    if (memberSet.has(pk)) {
                        updateMembers(memberSet, chatID);
                    }

                    if (graphInfo.cycle) {
                        return resolve("WAITING FOR PEER IGNORED");
                    } else {
                        return memberSet.has(pk) ? resolve("ACCEPT") : resolve("REJECT");
                    }
                } else {
                    return resolve("FAIL");
                }
            });
            console.log(`ops released lock`);
        });
    });
}

async function updateMembers (memberSet, chatID) {
    for (const mem of memberSet) { // populating keyMap
        await getUsername(mem);
    }

    if (memberSet.has(JSON.stringify(keyPair.publicKey))) {
        updateChatOptions("add", chatID);
        joinedChats.get(chatID).currentMember = true;
        joinedChats.get(chatID).exMembers.delete(JSON.stringify(keyPair.publicKey));
    }

    // add all the users which are no longer valid to exMembers
    joinedChats.get(chatID).validMembers.filter(pk => !memberSet.has(pk)).forEach(pk => joinedChats.get(chatID).exMembers.add(pk));
    joinedChats.get(chatID).validMembers = [...memberSet];
    joinedChats.get(chatID).members = joinedChats.get(chatID).validMembers.filter(pk => !joinedChats.get(chatID).exMembers.has(pk));
    await store.setItem("joinedChats", joinedChats);
    updateChatInfo();
    console.log(`all valid members ${joinedChats.get(chatID).validMembers.map(pk => keyMap.get(pk))}`);
    console.log(`current universe members ${joinedChats.get(chatID).members.map(pk => keyMap.get(pk))}`);
    console.log(`current exmembers ${[...joinedChats.get(chatID).exMembers].map(pk => keyMap.get(pk))}`);
}


////////////////////////////
// Peer to Peer Functions //
////////////////////////////

function initPeerConnection() {
    try {
        const connection = new RTCPeerConnection(configuration);
        connection.ondatachannel = receiveChannelCallback;
        connection.onclose = function (event) {
            console.log(`received onclose`);
            closeConnections(connectionNames.get(connection), 0);
        };
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
                connections.delete(JSON.stringify(connectionNames.get(connection)));
                console.log(`Restarting ICE because ${connectionNames.get(connection)} failed`);
                connection.restartIce();
            }
        }
        connection.onconnectionstatechange = function (event) {
            console.log(event);
            if (connection.connectionState === "failed") {
                connections.delete(JSON.stringify(connectionNames.get(connection)));
                console.log(`Restarting ICE because ${connectionNames.get(connection)} failed`);
                connection.restartIce();
            }
        }
        // connection.onnegotiationneeded = function (event) {
        //     console.log("On negotiation needed")
        //     if (connection.connectionState === "failed") {
        //         console.log(JSON.stringify(event));
        //         console.log(`connection name ${connectionNames.get(connection)}`);
        //         connection.createOffer(function (offer) { 
        //             sendToServer({
        //                 to: connectionNames.get(connection),
        //                 type: "offer",
        //                 offer: offer ,
        //                 fromPK: keyPair.publicKey,
        //                 from: localUsername,
        //             });
        //             connection.setLocalDescription(offer);
        //         }, function (error) { 
        //             alert("An error has occurred."); 
        //         }, function () {
        //             console.log("Create Offer failed");
        //         }, {
        //             iceRestart: true
        //         });
        //     }
        // }
        console.log("Local RTCPeerConnection object was created");
        return connection;
    } catch (e) {
        console.error(e);
        return null;
    }
}

function initChannel(channel) {
    channel.onopen = (event) => { onChannelOpen(event); }
    channel.onclose = (event) => { console.log(`Channel ${event.target.label} closed`); }
    channel.onmessage = async (event) => { await receivedMessage(JSON.parse(event.data)) }
}

async function receivedMessage(messageData) {
    console.log(`received a message from the channel of type ${messageData.type} from ${keyMap.get(JSON.stringify(messageData.from))}`);
    if (messageData.chatID !== currentChatID && (messageData.type === "text" || messageData.type === "add" || messageData.type === "remove")
    && document.getElementById(`chatCard${messageData.chatID}`) !== null) {
        document.getElementById(`chatCard${messageData.chatID}`).className = "card card-chat notif";
    }
    switch (messageData.type) {
        case "ops":
            messageData.ops.forEach(op => unpackOp(op));
            receivedOperations(messageData.ops, messageData.chatID, JSON.stringify(messageData.from)).then(async (res) => {
                if (res === "ACCEPT" || res === "REJECT") {
                    sendChatHistory(messageData.chatID, JSON.stringify(messageData.from));
                    if (res == "ACCEPT") {
                        sendAdvertisement(messageData.chatID, JSON.stringify(messageData.from));
                    } else {
                        closeConnections(JSON.stringify(messageData.from), messageData.chatID);
                    }
                }
            });
            break;
        case "ignored":
            if (!messageData.replay) {
                messageData.ignored.forEach(op => unpackOp(op));
            }
            receivedIgnored(messageData.ignored, messageData.chatID, JSON.stringify(messageData.from)).then(async (res) => {
                if (res == "ACCEPT") {
                    console.log(`ignored from??? ${keyMap.get(JSON.stringify(messageData.from))}`);
                    sendAdvertisement(messageData.chatID, JSON.stringify(messageData.from));
                    sendChatHistory(messageData.chatID, JSON.stringify(messageData.from));
                } else if (res === "REJECT") {
                    closeConnections(JSON.stringify(messageData.from), messageData.chatID);
                }
            });
            break;
        case "advertisement":
            messageData.online.forEach((peer) => connectToPeer(peer));
            break;
        case "history":
            await mergeChatHistory(messageData.chatID, JSON.stringify(messageData.from), messageData.history);
            break;
        case "remove":
            unpackOp(messageData.op);
            receivedOperations([messageData.op], messageData.chatID, JSON.stringify(messageData.from)).then((res) => {
                if (res === "ACCEPT") { 
                    if (arrEqual(messageData.op.pk2, keyPair.publicKey)) {
                        onRemove(messageData);
                    } else {
                        removePeer(messageData); 
                    }
                } else {
                    console.log(`remove reject`);
                }
            });
            break;
        case "add":
            unpackOp(messageData.op);
            if (arrEqual(messageData.op.pk2, keyPair.publicKey)) {
                onAdd(messageData.chatID, messageData.chatName, objToArr(messageData.from), messageData.msgID);
            } else {
                receivedOperations([messageData.op], messageData.chatID, JSON.stringify(messageData.from)).then((res) => {
                    if (res === "ACCEPT") { addPeer(messageData); }
                });
            }
            break;
        case "text":
            if (joinedChats.get(messageData.chatID).members.includes(JSON.stringify(messageData.from))) {
                updateChatWindow(messageData);
                updateChatStore(messageData);
            }
            break;
        default:
            console.log(`Unrecognised message type ${messageData.type}`);
    }
}

function onChannelOpen(event) {
    console.log(`Channel ${event.target.label} opened`);
    const channelLabel = JSON.parse(event.target.label);
    const peerPK = channelLabel.senderPK === JSON.stringify(keyPair.publicKey) ? channelLabel.receiverPK : channelLabel.senderPK;

    if (resolveConnectToPeer.has(peerPK)) {
        resolveConnectToPeer.get(peerPK)(true);
        resolveConnectToPeer.delete(peerPK);
    }

    for (const chatID of joinedChats.keys()) {
        if (joinedChats.get(chatID).members.includes(peerPK) || joinedChats.get(chatID).exMembers.has(peerPK)) {
            sendOperations(chatID, peerPK);
        }
    }
}

function receiveChannelCallback(event) {
    const channelLabel = JSON.parse(event.channel.label);
    console.log(`Received channel ${event.channel.label} from ${channelLabel.senderPK}`);
    const peerConnection = connections.get(channelLabel.senderPK);
    peerConnection.sendChannel = event.channel;
    initChannel(peerConnection.sendChannel);
}

function sendAdvertisement(chatID, pk) {
    // chatID: String, pk: stringify(pk)
    const online = [];
    for (const mem of joinedChats.get(chatID).members) {
        if (connections.has(mem) && mem !== pk) {
            online.push({ peerName: keyMap.get(mem), peerPK: objToArr(JSON.parse(mem)) });
        }
    }

    if (online.length > 0) {
        console.log(`sending an advertistment to ${pk} of ${JSON.stringify(online)}`)
        sendToMember(addMsgID({
            type: "advertisement",
            online: online,
            from: keyPair.publicKey
        }), pk);
    }
}

async function sendChatHistory (chatID, pk) {
    console.log(`sending chat history to ${pk}`);
    await store.getItem(chatID).then(async (chatInfo) => {
        var peerHistory = [];
        if (!chatInfo.historyTable.has(pk)) {
            chatInfo.historyTable.set(pk, [[chatInfo.history[0].id, 0]]);
            await store.setItem(chatID, chatInfo);
        }
        const intervals = chatInfo.historyTable.get(pk);
        var start, end;
        for (const interval of intervals) {
            start = chatInfo.history.findIndex(msg => { return msg.id === interval[0]; });
            end = chatInfo.history.findIndex(msg => { return msg.id === interval[1]; });
            end = (interval[1] == 0 ? chatInfo.history.length : end) + 1;
            peerHistory = peerHistory.concat(chatInfo.history.slice(start, end));
        }
        
        sendToMember(addMsgID({
            type: "history",
            history: peerHistory,
            chatID: chatID,
            from: keyPair.publicKey
        }), pk);
    });
}

function initChatHistoryTable (chatID, msgID) {
    console.log(`initialised chat history`);
    store.getItem(chatID).then(async (chatInfo) => {
        for (const pk of joinedChats.get(chatID).members) {
            if (!chatInfo.historyTable.has(pk)) {
                chatInfo.historyTable.set(pk, []);
            }
            chatInfo.historyTable.get(pk).push([msgID, 0]);
        }
        await store.setItem(chatID, chatInfo);
    });
} 

var resolveConnectToPeer = new Map();

function connectToPeer (peer) {
    // peer: JSON {peerName: String, peerPK: Uint8Array}
    return new Promise((resolve) => {
        if (peer.peerName === localUsername) { resolve(false); return; }
        if (connections.has(JSON.stringify(peer.peerPK))) { resolve(true); return; }

        resolveConnectToPeer.set(JSON.stringify(peer.peerPK), resolve);
        keyMap.set(JSON.stringify(peer.peerPK), peer.peerName);
        store.setItem("keyMap", keyMap);
        sendOffer(peer.peerName, peer.peerPK);
        setTimeout(() => {
            resolve(false);
        }, 5000);
    });
}

async function addPeer(messageData) {
    const pk = JSON.stringify(messageData.op.pk2);
    keyMap.set(pk, messageData.username);
    store.setItem("keyMap", keyMap);

    if (!joinedChats.get(messageData.chatID).members.includes(pk)) {
        joinedChats.get(messageData.chatID).members.push(pk);
    }
    if (!joinedChats.get(messageData.chatID).validMembers.includes(pk)) {
        joinedChats.get(messageData.chatID).validMembers.push(pk);
    }
    joinedChats.get(messageData.chatID).exMembers.delete(pk);
    store.setItem("joinedChats", joinedChats);

    updateChatInfo();
    updateChatWindow(messageData);
    await store.getItem(messageData.chatID).then((chatInfo) => {
        if (!chatInfo.historyTable.has(pk)) {
            chatInfo.historyTable.set(pk, []);
        }
        chatInfo.historyTable.get(pk).push([messageData.id, 0]);
        chatInfo.history.push(messageData);
        store.setItem(messageData.chatID, chatInfo);
        console.log(`history for ${pk}: ${chatInfo.historyTable.get(pk)}`);
    }).then(() => console.log(`added message data to chat history`));
}

async function removePeer (messageData) {
    const pk = JSON.stringify(messageData.op.pk2);

    await store.getItem(messageData.chatID).then(async (chatInfo) => {
        if (chatInfo.historyTable.has(pk)) {
            const interval = chatInfo.historyTable.get(pk).pop();
            interval[1] = messageData.id;
            chatInfo.historyTable.get(pk).push(interval);
        }
        chatInfo.history.push(messageData);
        console.log(`history for ${pk}: ${chatInfo.historyTable.get(pk)}`);
        await store.setItem(messageData.chatID, chatInfo);
    }).then(() => console.log(`added removal message data to chat history`));

    if (joinedChats.get(messageData.chatID).members.includes(pk)) {
        joinedChats.get(messageData.chatID).members.splice(joinedChats.get(messageData.chatID).members.indexOf(pk), 1);
    }
    if (joinedChats.get(messageData.chatID).validMembers.includes(pk)) {
        joinedChats.get(messageData.chatID).validMembers.splice(joinedChats.get(messageData.chatID).validMembers.indexOf(pk), 1);
    }
    
    joinedChats.get(messageData.chatID).exMembers.add(pk);
    await store.setItem("joinedChats", joinedChats);

    updateChatInfo();
    updateChatWindow(messageData);
    closeConnections(pk, messageData.chatID);
}

async function refreshChatWindow (chatID) {
    if (chatID === currentChatID) {
        chatWindow.innerHTML = "";
        await store.getItem(currentChatID).then(async (chatInfo) => {
            chatInfo.history.forEach(data => {
                updateChatWindow(data);
            });
        });
    }
}

function updateChatWindow (data) {
    // data: JSON
    if (data.chatID === currentChatID) {
        const message = document.createElement('p');
        message.className = "chat-message";
        switch (data.type) {
            case "create":
                message.innerHTML = `[${formatDate(data.sentTime)}] chat created by ${keyMap.get(JSON.stringify(data.from))}`;
                break;
            case "text":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${keyMap.get(JSON.stringify(data.from))}: ${data.message}`;
                break;
            case "add":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${keyMap.get(JSON.stringify(data.op.pk1))} added ${keyMap.get(JSON.stringify(data.op.pk2))}`;
                break;
            case "remove":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${keyMap.get(JSON.stringify(data.op.pk1))} removed ${keyMap.get(JSON.stringify(data.op.pk2))}`;
                break;
            default:
                break;
        }
        chatWindow.appendChild(message);
    }
}


function sendToMember(data, pk) {
    // data: JSON, pk: String
    if (pk === JSON.stringify(keyPair.publicKey)) {
        return receivedMessage(data);
    }
    console.log(`sending ${JSON.stringify(data.type)}   to ${keyMap.get(pk)}`);
    sendToServer({
        toPK: strToArr(pk),
        ...data
    });
    return;
}

function addMsgID (data) {
    data.sentTime = Date.now();
    data.id = JSON.stringify(nacl.hash(enc.encode(`${localUsername}:${data.sentTime}`)));
    return data;
}

function broadcastToMembers (data, chatID = null) {
    chatID = chatID === null ? currentChatID : chatID;
    for (const pk of joinedChats.get(chatID).members) {
        try {
            sendToMember(data, pk);
        } catch {
            continue;
        }
    }
}

function sendChatMessage (messageInput) {
    const data = addMsgID({
        type: "text",
        from: keyPair.publicKey,
        message: messageInput,
        chatID: currentChatID
    });

    broadcastToMembers(data, currentChatID);
}


/////////////////////
// Event Listeners //
/////////////////////

loginInput.addEventListener("keypress", ((event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        loginBtn.click();
    }
}));

// Send Login attempt
loginBtn.addEventListener("click", async function (event) {
    const username = loginInput.value;
    console.log(username);
    if (username.length > 0 && isAlphanumeric(username)) {
        keyPair = nacl.sign.keyPair();
        console.log("keyPair generated");

        sendToServer({
            type: "login",
            name: username,
            pubKey: keyPair.publicKey
        });
    }
});

chatNameInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        newChatBtn.click();
    }
});

messageInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendMessageBtn.click();
    }
});

addUserInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        addUserBtn.click();
    }
});

sendMessageBtn.addEventListener("click", function () {
    if (messageInput.value.length > 0) {
        sendChatMessage(messageInput.value);
        messageInput.value = "";
    }
})

newChatBtn.addEventListener("click", () => {
    createNewChat();
    elem.closePopup();
    chatNameInput.value = "";
});

logoutBtn.addEventListener("click", logout);

addUserBtn.addEventListener("click", async () => {
    if (currentChatID === 0) { console.alert(`Please select a chat`); return; }
    const username = addUserInput.value;
    try {
        const pk = await getPK(username);
        addUserInput.value = "";
        // as long as you are in some universe
        if (joinedChats.get(currentChatID).validMembers.includes(JSON.stringify(pk))) { alert(`User has already been added`); return; }
        addToChat(new Map([[username, pk]]), currentChatID);
    } catch (err) {
        alert(`User does not exist`);
        console.log(err);
    }
});

export function disableChatMods (chatID, conflict=false) {
    if (chatID == currentChatID) {
        document.getElementById('addUserCard').style.display = "none";
        chatBar.style.display = "none";
        chatWindow.style.display = "flex";
        disabledChatBar.style.display = conflict ? "none" : "flex";

        document.getElementById('disputeCard').style.display = joinedChats.get(currentChatID).toDispute == null ? "none" : "flex";
        document.getElementById('defaultText').style.display = "none";
        document.getElementById('chatBoxHeading').style.display = "flex";

        [...document.getElementsByClassName('removeUserBtn')].map((elem) => {
            elem.disabled = true;
        });
    }
}

export function enableChatMods (chatID) {
    if (chatID == currentChatID) {
        document.getElementById('addUserCard').style.display = "flex";
        chatWindow.style.display = "flex";
        chatBar.style.display = "flex";
        disabledChatBar.style.display = "none";
        
        document.getElementById('disputeCard').style.display = "none";
        document.getElementById('defaultText').style.display = "none";
        document.getElementById('chatBoxHeading').style.display = "flex";

        [...document.getElementsByClassName('removeUserBtn')].map((elem) => {
            elem.disabled = false;
        });
    }
}

disputeBtn.addEventListener("click", async () => {
    disputeRemoval(joinedChats.get(currentChatID).toDispute, currentChatID);
    joinedChats.get(currentChatID).toDispute = null;
    updateChatInfo();
});

acceptRemovalBtn.addEventListener("click", async () => {
    console.log(`toDispute cleared`);
    joinedChats.get(currentChatID).toDispute = null;
    updateChatInfo();
});

var resolveGetIgnored = new Map();

async function getIgnored(cycles, chatID) {

    return new Promise(async (resolve) => { 
        resolveGetIgnored.set(chatID, [cycles, resolve]); 

        for (const cycle of cycles) {
            const removeSelfIndex = cycle.findLastIndex((op) => op.action === "remove" && arrEqual(op.pk2, keyPair.publicKey));
            if (removeSelfIndex > -1) {
                await selectIgnored(cycle.at(removeSelfIndex));
                continue;
            }
        }

        if (chatID == currentChatID && resolveGetIgnored.has(chatID)) {
            document.getElementById('chatBar').style.display = "none";
            updateChatInfo();
        }
    });
}

export async function selectIgnored(ignoredOp) {
    sendToServer({
        type: "selectedIgnore",
        op: ignoredOp
    })
    await store.getItem(currentChatID).then(async (chatInfo) => {
        // unwinding chat history
        const ignoredOpIndex = chatInfo.history.findIndex(msg => msg.type == ignoredOp.action && arrEqual(msg.op.sig, ignoredOp.sig));

        if (ignoredOpIndex > -1) {
            console.log(`found ignored op`);
            chatInfo.history.splice(ignoredOpIndex);

            if (chatInfo.historyTable.has(JSON.stringify(ignoredOp.pk2))) {
                const interval = chatInfo.historyTable.get(JSON.stringify(ignoredOp.pk2)).pop();
                if (ignoredOp.action == "remove") {
                    interval[1] = 0;
                    chatInfo.historyTable.get(JSON.stringify(ignoredOp.pk2)).push(interval);
                }
            }
        }

        // writing to storage
        refreshChatWindow(currentChatID);

        resolveGetIgnored.get(currentChatID)[0].splice(resolveGetIgnored.get(currentChatID)[0].findIndex((cycle) => access.hasOp(cycle, ignoredOp)), 1);
    
        if (resolveGetIgnored.get(currentChatID)[0].length == 0) {
            resolveGetIgnored.get(currentChatID)[1](chatInfo.metadata.ignored);
            resolveGetIgnored.delete(currentChatID);
            chatBox.className = "chat-panel col-8";
            enableChatMods(currentChatID);
        }
    });
}

function getChatNames() {
    var chatnames = [];
    for (const chatID of joinedChats.keys()) {
        chatnames.push(joinedChats.get(chatID).chatName);
    }
    return chatnames;
}

function getChatID(chatName) {
    for (const chatID of joinedChats.keys()) {
        if (chatName === joinedChats.get(chatID).chatName) {
            return chatID;
        }
    }
    return -1;
}


function updateChatInfo () {
    if (currentChatID > 0) {
        document.getElementById('chatTitle').innerHTML = joinedChats.get(currentChatID).chatName;

        memberList.innerHTML = "";
        joinedChats.get(currentChatID).members.forEach((pk) => {
            memberList.appendChild(elem.generateUserCard(pk, keyMap.get(pk), currentChatID));
        });

        if (joinedChats.get(currentChatID).currentMember) {
            enableChatMods(currentChatID);
        } else {
            disableChatMods(currentChatID);
        }

        if (resolveGetIgnored.has(currentChatID)) {
            disableChatMods(currentChatID, true);
            chatBox.className = "chat-panel col-8 conflict";
            conflictCardList.innerHTML = "";
            resolveGetIgnored.get(currentChatID)[0].forEach((cycle) => {
                conflictCardList.appendChild(elem.generateConflictCard(cycle));
            });
        };
    }
}

export async function selectChat(chatID) {
    currentChatID = chatID;
    updateChatInfo();

    document.getElementById(`chatCard${chatID}`).className = "card card-chat";
    await navigator.locks.request("history", async () => {
        await refreshChatWindow(currentChatID);
    });
}

const chatOptions = new Set();

function updateChatOptions (operation, chatID) {
    if (operation === "add" && !chatOptions.has(chatID)) {
        elem.generateChatCard(chatID, joinedChats.get(chatID).chatName);
        chatOptions.add(chatID);
        return;
    }

    if (operation === "remove" && chatOptions.has(chatID)) {
        chatOptions.delete(chatID);
        document.getElementById(`chatCard${chatID}`).remove();
    }
}

function createNewChat () {
    sendToServer({
        type: "createChat",
        chatName: chatNameInput.value,
        from: keyPair.publicKey,
    });
}

function logout () {
    for (const chatID of joinedChats.keys()) {
        joinedChats.get(chatID).members.forEach((pk) => {
            closeConnections(pk, chatID);
        });
    }
    initialiseClient();
    sendToServer({
        type: "leave",
        pk: keyPair.publicKey,
    });
}


///////////
// UTILS //
///////////

function unpackOp(op) {
    op.sig = objToArr(op.sig);
    if (op.action === "create") {
        op.pk = objToArr(op.pk);
        op.nonce = objToArr(op.nonce);
    } else {
        op.pk1 = objToArr(op.pk1);
        op.pk2 = objToArr(op.pk2);
        op.deps = op.deps.map(dep => objToArr(dep));
    }
}

function unionOps(ops1, ops2) {
    const sigSet = new Set(ops1.map(op => JSON.stringify(op.sig)));
    const ops = [...ops1];
    for (const op of ops2) {
        if (!sigSet.has(JSON.stringify(op.sig))) { ops.push(op); }
    }
    return ops;
}

function opsArrEqual (ops1, ops2) {
    if (ops1.length !== ops2.length) { return false; }

    const sigSet = new Set(ops1.map(op => JSON.stringify(op.sig)));
    for (const op of ops2) {
        if (!sigSet.has(JSON.stringify(op.sig))) {
            return false;
        }
    }
    return true;
}

function removeOp(ops, op) {
    for (let i = 0; i < ops.length; i++) {
        if (arrEqual(ops[i].sig, op.sig)) {
            ops.splice(i, 1);
        }
    }
}

function mergeJoinedChats(localChats, receivedChats) {
    const mergedChats = new Map([...localChats]);
    if (receivedChats.size === 0) { return mergedChats; }
    const localChatIDs = new Set([...localChats.keys()]);
    for (const id of receivedChats.keys()) {
        if (!localChatIDs.has(id)) {
            mergedChats.set(id, receivedChats.get(id));
        }
    }
    return mergedChats;
}


async function mergeChatHistory (chatID, pk, receivedMsgs) {
    await navigator.locks.request("history", async () => {
        await store.getItem(chatID).then(async (chatInfo) => {
            const localMsgs = chatInfo.history;
            console.log(`local length ${localMsgs.length}`);
            console.log(`received length ${receivedMsgs.length}`);
            var newMessage = false;

            if (receivedMsgs.length > 0) {
                const mergedChatHistory = [...localMsgs];
                const modifiedHistoryTable = new Set();
                var pk2;
                
                const localMsgIDs = new Set(localMsgs.map(msg => msg.id));
                for (const msg of receivedMsgs) {
                    console.log(`msg ${msg.type}`);
                    if (!localMsgIDs.has(msg.id)) { // if we don't have this message
                        mergedChatHistory.push(msg);
                        newMessage = true;

                        if (msg.type === "text") { continue; }

                        // rolling forward changes to history table
                        if (!arrEqual(msg.op.pk2, keyPair.publicKey)) {
                            pk2 = JSON.stringify(msg.op.pk2);
                            if (msg.type === "add") {
                                if (!chatInfo.historyTable.has(pk2)) {
                                    chatInfo.historyTable.set(pk2, []);
                                }
                                modifiedHistoryTable.add(pk2);
                                chatInfo.historyTable.get(pk2).push([msg.id, 0]);

                            } else if (msg.type === "remove") {
                                modifiedHistoryTable.add(pk2);
                                if (!chatInfo.historyTable.has(pk2)) {
                                    chatInfo.historyTable.set(pk2, [[localMsgs[0].id, 0]]);
                                }
                                const interval = chatInfo.historyTable.get(pk2).pop();
                                interval[1] = msg.id;
                                chatInfo.historyTable.get(pk2).push(interval);
                            }
                        }
                    }
                }

                // sorting intervals for each set of intervals
                for (pk of modifiedHistoryTable) {
                    chatInfo.historyTable.get(pk).sort((a, b) => { a[0] - b[0] });
                }

                mergedChatHistory.sort((a, b) => {
                    if (a.sentTime > b.sentTime) { return 1; }
                    if (a.sentTime < b.sentTime) { return -1; }
                    if (a.username > b.username) { return 1; }
                    else { return -1; } // (a[1].username <= b[1].username) but we know it can't be == and from the same timestamp
                });
                chatInfo.history = mergedChatHistory;

                await store.setItem(chatID, chatInfo);
                await refreshChatWindow(chatID);
                if (newMessage && chatID !== currentChatID && document.getElementById(`chatCard${chatID}`) !== null) { 
                    document.getElementById(`chatCard${chatID}`).className = "card card-chat notif";
                }
            }
        });
    });
}

function closeConnections (pk, chatID) {
    // pk : string, chatID : string
    console.log(`connection with ${keyMap.get(pk)} closed`);
    for (const id of joinedChats.keys()) {
        if (chatID !== id && joinedChats.get(id).members.includes(pk)) {
            return;
        }
    }
    if (connections.has(pk) && !offerSent.has(pk)) {
        connectionNames.delete(connections.get(pk).connection);
        if (connections.get(pk).sendChannel) {
            connections.get(pk).sendChannel.close();
            connections.get(pk).sendChannel = null;
        }
        if (connections.get(pk).connection) {
            connections.get(pk).connection.close();
            connections.get(pk).connection = null;
        }
        connections.delete(pk);
    }
    console.log(`active connections ${[...connections.keys()].map((pk) => keyMap.get(pk))}`);
}