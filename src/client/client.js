import localforage from "https://unpkg.com/localforage@1.9.0/src/localforage.js";
import nacl from '../../node_modules/tweetnacl-es6/nacl-fast-es.js';
import * as access from "./accessControl.js";
import * as elem from "./components.js";
import {strToArr, concatArr, formatDate, isAlphanumeric, arrToStr, ASCIIToArr, arrToASCII} from "./utils.js";

const loginBtn = document.getElementById('loginBtn');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const addUserBtn = document.getElementById('addUserBtn');
const disputeBtn = document.getElementById('disputeBtn');
const acceptRemovalBtn = document.getElementById('acceptRemovalBtn');
const newChatBtn = document.getElementById('newChatBtn');
const resetStoreBtn = document.getElementById('resetStoreBtn');
const connectBtn = document.getElementById('connectBtn');
const chatBox = document.getElementById('chatBox');

const chatList = document.getElementById('chatList');
const memberList = document.getElementById('memberList');
const conflictCardList = document.getElementById('conflictCardList');

const chatBar = document.getElementById('chatBar');
const disabledChatBar = document.getElementById('disabledChatBar');
const conflictChatBar = document.getElementById('conflictChatBar');
const chatWindow = document.getElementById('chatWindow');
const wifiSlash = document.getElementById('wifiSlash');

const loginInput = document.getElementById('loginInput');
const messageInput = document.getElementById('messageInput');
const addUserInput = document.getElementById('addUserInput');

var localUsername;

//////////////////////
// GLOBAL VARIABLES //
//////////////////////

var currentChatID, connections, msgQueue, serverValues, sessionKeys, acks, peerIgnored, reconnect;
var onSIGMA2, onSIGMA3; // for SIGMA protocol
var onlineMode = false;
export var joinedChats, keyMap, store, programStore;

const enc = new TextEncoder();

// private keypair for the client
export var keyPair;

// connection to stringified(peerPK)
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

function initialiseClient () {
    store = null;
    currentChatID = 0;
    connections = new Map(); // map from stringify(pk):string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
    joinedChats = new Map(); // (chatID: String, {chatName: String, members: Array of String})
    keyMap = new Map(); // map from public key : stringify(pk) to username : String
    msgQueue = [];
    sessionKeys = new Map();
    onSIGMA2 = new Map();
    onSIGMA3 = new Map();
    acks = new Set();
    peerIgnored = new Map();
    programStore = new Map();

    // layout
    [...chatList.childNodes].forEach((node) => {
        if (node.id !== "chatCardTemplate") {
            chatList.removeChild(node);
        }
    });
    document.getElementById('heading').innerHTML = "Hello I am a Chat";
    document.getElementById('defaultText').style.display = "block";
    document.getElementById('chatInfo').style.display = "none";
    document.getElementById('chatBoxHeading').style.display = "none";
    [...document.getElementsByClassName('chat-bar')].forEach((elem) => {
        elem.style.display = "none";
    });
    chatWindow.style.display = 'none'; 
    chatWindow.innerHTML = '<div id="anchor" style="overflow-anchor: auto; min-height: 1px; height: 1px" ></div>';
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

var connection;
// var connection = new WebSocket('wss://localhost:3000');

function connectToServer () {
    connection = new WebSocket('wss://35.178.80.94:3000/');

    connection.onopen = function () {
        console.log("Connected to server");
        wifiSlash.style.display = "none";
        onlineMode = true;
    };

    connection.onerror = function (err) {
        console.log("Error: ", err);
        alert("Please authorise wss://35.178.80.94:3000/ on your device before refreshing! ")
    };

    connection.onmessage = async function (message) {
        console.log("Got message", message.data);
        var data = JSON.parse(message.data);

        switch (data.type) {
            case "SIGMA1":
                serverValues = { s: strToArr(data.valueS), m: strToArr(data.valueM) };
                if (reconnect) {
                    if (!await onSIGMA1(serverValues.s, serverValues.m, connection)) {
                        alert("failed to authenticate connection");
                        return;
                    }
                    sendToServer({
                        type: "login",
                        name: localUsername,
                    });
                }
                break;
            case "SIGMA3":
                onSIGMA3.get(connection)(data);
                break;
            case "login":
                onLogin(data.status, data.username, new Map(data.joinedChats));
                break;
            case "offer":
                onOffer(data.offer, data.from, data.fromPK);
                break;
            case "answer":
                onAnswer(data.answer, data.fromPK);
                break;
            case "candidate":
                onCandidate(data.candidate, data.from);
                break;
            case "connectedUsers":
                onConnectedUsers(data.usernames);
                break;
            case "join":
                onJoin(data.usernames);
                break;
            case "leave":
                onLeave(data.from);
                break;
            // case "createChat":
            //     onCreateChat(data.chatID, data.chatName);
            //     break;
            case "add":
                // data.ignored.forEach(ig => unpackOp(ig));
                onAdd(data.chatID, data.chatName, data.from, data.ignored, data);
                break;
            case "remove":
                onRemove(data);
                break;
            case "getUsername":
                onGetUsername(data.username, data.success, data.pk);
                break;
            case "getPK":
                onGetPK(data.username, data.success, data.pk);
                break;
            case "getOnline":
                onGetOnline(data.online, data.chatID);
                break;
            case "peerOffline":
                offerSent.delete(data.pk);
                break;
            default:
                break;
        }
    };

    connection.onclose = goOffline(true);
}

connectToServer();

function sendToServer(message) {
    console.log(`online mode ${onlineMode} message ${JSON.stringify(message)}`);
    if (onlineMode) {
        connection.send(JSON.stringify(message));
    } else {
        msgQueue.push(message);
    }
};

async function onSIGMA1 (peerValueS, peerValueM, connection) {
    // peerValue: Uint8Array
    return new Promise(async (resolve) => {
        const localKeyPairS = nacl.box.keyPair();
        const localKeyPairM = nacl.box.keyPair();
        const localValueS = localKeyPairS.publicKey;
        const sessionKey = nacl.box.before(peerValueS, localKeyPairS.secretKey);
        const macKey = nacl.box.before(peerValueM, localKeyPairM.secretKey);

        connection.send(JSON.stringify({
            type: "SIGMA2",
            valueS: arrToStr(localValueS), // Uint8Array
            valueM: arrToStr(localKeyPairM.publicKey),
            pk: keyPair.publicKey, // string
            sig: arrToStr(nacl.sign.detached(concatArr(peerValueS, localValueS), keyPair.secretKey)), // verifying secret key possession 
            mac: arrToStr(access.hmac512(macKey, strToArr(keyPair.publicKey))) // verifying identity
        }));

        const res = await new Promise((res2) => { onSIGMA3.set(connection, res2); });
        switch (res.status) {
            case "SUCCESS":
                const peerPK = strToArr(res.pk);
                if (nacl.sign.detached.verify(concatArr(localValueS, peerValueS), strToArr(res.sig), peerPK)
                && nacl.verify(strToArr(res.mac), access.hmac512(macKey, peerPK))) {
                    resolve(true);
                    sessionKeys.set(connection, { s: sessionKey, m: macKey});
                    console.log(sessionKeys);

                    console.log(`resolving?`);
                    if (resolveAuth.has(connection)) {
                        console.log(`resolving`);
                        resolveAuth.get(connection).forEach((con) => con());
                    }

                    if (connections.has(res.pk)) {
                        connections.get(res.pk).auth = true;
                    }
                } else {
                    console.log(`${nacl.sign.detached.verify(concatArr(localValueS, peerValueS), strToArr(res.sig), peerPK)}  ${nacl.verify(strToArr(res.mac), access.hmac512(macKey, peerPK))}`);
                }
                break;
            case "PK_IN_USE":
                alert("This username is being used on another tab. Please try a different username.");
                store = null;
                break;
            case "VERIF_FAILED":
                alert('Key exchange failed');
                resolve(false);
                closeConnections(res.pk);
        }
    });
}

// Server approves Login
async function onLogin (status, username, receivedChats) {

    switch (status) {
        case "SUCCESS":
            localUsername = username;
            joinedChats = mergeJoinedChats(joinedChats, new Map());
            store.setItem("joinedChats", joinedChats);
    
            store.getItem("keyMap").then((storedKeyMap) => {
                keyMap = storedKeyMap === null ? new Map() : storedKeyMap;
                keyMap.set(keyPair.publicKey, localUsername);
                store.setItem("keyMap", keyMap);
            });
            store.getItem("msgQueue").then((storedMsgQueue) => {
                msgQueue = storedMsgQueue === null ? [] : storedMsgQueue;
            });

            for (const chatID of joinedChats.keys()) {
                await store.getItem(chatID).then((chatInfo) => {
                    programStore.set(chatID, chatInfo);
                });
            }
    
            loginPopup.style.display = "none";
            dim.style.display = "none";
            document.getElementById('heading').innerHTML = `Welcome ${localUsername}`;
    
            for (const chatID of joinedChats.keys()) {
                console.log(chatID, joinedChats.get(chatID));
                if (joinedChats.get(chatID).members.has(keyPair.publicKey) || joinedChats.get(chatID).validMembers.has(keyPair.publicKey) || joinedChats.get(chatID).exMembers.has(keyPair.publicKey))
                updateChatOptions("add", chatID);
                getOnline(chatID);
            }
    
            for (const msg of msgQueue) {
                sendToServer(msg);
            }
            return;
        case "NAME_TAKEN":
            alert("This username is associated with another device. Please try a different username.");
            return;
        case "VERIF_FAILED":
            alert("Failed to verify identity. Please try a different username.");
            return;
    }
};

async function initialiseStore(username) {
    // new user: creates new store
    // returning user: will just point to the same instance
    console.log(`init store local user: ${username}`);
    store = localforage.createInstance({
        storeName: arrToStr(nacl.hash(enc.encode(username)))
    });
    
    localforage.ready().then(() => {
        store.getItem("joinedChats").then(async (chats) => {
            if (chats === null) {
                joinedChats = [];
            } else {
                joinedChats = chats;
            }
            await store.setItem("joinedChats", joinedChats).then(console.log(`store initialised to ${joinedChats}`));
        });
    });
}

var offerSent = new Set()

// TODO: add symmetric encryption to the links nacl.box()

// Sending Offer to Peer
function sendOffer(peerName, peerPK) {
    // peerName: String username, peerPK: string

    if (peerName !== null && peerPK !== null) {
        const newConnection = initPeerConnection(peerName);
        connections.set(peerPK, { connection: newConnection, sendChannel: null, auth: false });
        connectionNames.set(newConnection, peerPK);
        const peerConnection = connections.get(peerPK);

        const channelLabel = {
            senderPK: keyPair.publicKey,
            receiverPK: peerPK
        };
        peerConnection.sendChannel = peerConnection.connection.createDataChannel(JSON.stringify(channelLabel));
        initChannel(peerConnection.sendChannel);
        console.log(`Created sendChannel for ${localUsername}->${peerName}`);

        console.log(`Sending offer to ${peerName}`);
        peerConnection.connection.createOffer(function (offer) {
            sendToServer({
                to: peerPK,
                fromPK: keyPair.publicKey,
                from: localUsername,
                type: "offer",
                offer: offer
            });

            peerConnection.connection.setLocalDescription(offer);
        }, function (error) {
            alert("An error has occurred.");
        });
        offerSent.add(peerPK);
    }
};


// Receiving Offer + Sending Answer to Peer
async function onOffer(offer, peerName, peerPK) {
    // offer: JSON, peerName: String, peerPK: string
    if (!offerSent.has(peerPK) && connections.has(peerPK)) { return; }

    connections.set(peerPK, { connection: initPeerConnection(), sendChannel: null, auth: false });
    const peerConnection = connections.get(peerPK);
    connectionNames.set(connection, peerPK);

    keyMap.set(peerPK, peerName);
    store.setItem("keyMap", keyMap);
    peerConnection.connection.setRemoteDescription(offer);

    console.log(`Sending answer to ${peerName}`);
    peerConnection.connection.createAnswer(function (answer) {
        peerConnection.connection.setLocalDescription(answer);
        sendToServer({
            to: peerPK,
            fromPK: keyPair.publicKey,
            from: localUsername,
            type: "answer",
            answer: answer
        });
    }, function (error) {
        alert("oops...error");
    });
}

// Receiving Answer from Peer
function onAnswer(answer, peerPK) {
    connections.get(peerPK).connection.setRemoteDescription(answer);
    offerSent.delete(peerPK);
}

// Receiving ICE Candidate from Server
function onCandidate(candidate, peerPK) {
    peerPK = peerPK;
    if (connections.has(peerPK)) {
        connections.get(peerPK).connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function onConnectedUsers(usernames) {
    
}

function onLeave (peerPK) {
    // peerPK : string
    closeConnections(peerPK, 0, true);
}

async function createNewChat (chatName) {
    const createOp = access.generateCreateOp();
    const chatID = access.generateChatID(createOp);

    joinedChats.set(chatID, {
        chatName: chatName,
        validMembers: new Set([keyPair.publicKey]),
        members: new Set([keyPair.publicKey]),
        exMembers: new Set(),
        peerIgnored: new Map(),
        currentMember: true,
        toDispute: null
    });
    await store.setItem("joinedChats", joinedChats);

    const operations = [createOp];

    const createMsg = addMsgID({
        type: "create",
        from: keyPair.publicKey,
        op: createOp,
        chatID: chatID,
    });

    const chatInfo = {
        metadata: {
            chatName: chatName,
            operations: operations,
            ignored: [],
            unresolved: [],
        },
        history: [createMsg],
        historyTable: new Map(),
    };

    programStore.set(chatID, chatInfo);
    await store.setItem(chatID, chatInfo).then(async () => {
        updateChatOptions("add", chatID);
        await selectChat(chatID);
    });

    sendToServer({
        type: "createChat",
        chatID: chatID,
        chatName: chatName,
        from: keyPair.publicKey,
    });
}

// When being added to a new chat
async function onAdd(chatID, chatName, fromPK, ignored, msg) {
    // chatID: String, chatName: String, from: String, fromPK: Uint8Array, msgID: 

    // we want to move this actual joining to after syncing with someone from the chat
    const from = await getUsername(fromPK);
    console.log(`you've been added to chat ${chatName} by ${from}`);

    if (!joinedChats.has(chatID)) {
        joinedChats.set(chatID, {
            chatName: chatName,
            validMembers: new Set([fromPK]),
            members: new Set([fromPK]),
            exMembers: new Set(),
            peerIgnored: new Map(),
            currentMember: false,
            toDispute: null
        });
        await store.setItem("joinedChats", joinedChats);

        const chatInfo = {
            metadata: {
                chatName: chatName,
                operations: msg.ops,
                ignored: ignored,
                unresolved: [],
            },
            history: [msg],
            historyTable: new Map()
        };
        programStore.set(chatID, chatInfo);
        await store.setItem(chatID, chatInfo);
    }

    if (connections.has(fromPK)) {
        sendOperations(chatID, fromPK, true);
    } else {
        if (!(await connectToPeer({ peerName: from, peerPK: fromPK }))) {
            if (!getOnline(chatID)) {
                console.log(`no one is online :(`);
            }
        }
    }
}

async function addToChat (name, pk, chatID) {
    // members is the list: username: string, pk: string
    console.log(`we are now adding ${name} who has pk ${pk} and the ops are ${programStore.get(chatID).metadata.operations}`);
    const op = access.generateOp("add", pk, programStore.get(chatID).metadata.operations);
    programStore.get(chatID).metadata.operations.push(op);

    const addMessage = addMsgID({
        type: "add",
        op: op,
        ops: programStore.get(chatID).metadata.operations,
        ignored: programStore.get(chatID).metadata.ignored,
        from: keyPair.publicKey,
        username: name,
        chatID: chatID,
        chatName: programStore.get(chatID).metadata.chatName
    });

    joinedChats.get(chatID).validMembers.add(pk);
    joinedChats.get(chatID).members.add(pk);
    await store.setItem("joinedChats", joinedChats);

    await store.setItem(chatID, programStore.get(chatID)).then(console.log(`${name} has been added to ${chatID}`));
    if (connections.has(pk)) { sendToMember(addMessage, pk); }
    broadcastToMembers(addMessage, chatID);
    sendToServer({
        to: pk,
        type: "add",
        msg: addMessage
    });
}


async function onRemove (messageData) {
    const fromPK = messageData.from;
    const chatID = messageData.chatID;
    var joinedChatInfo = joinedChats.get(chatID);
    console.log(`onremove`);

    if (fromPK !== keyPair.publicKey) {
        updateChatWindow(messageData);
        await updateChatStore(messageData);

        if (messageData.dispute && joinedChatInfo.exMembers.has(fromPK)) {
            [...joinedChatInfo.members].forEach((pk) => sendOperations(chatID, pk, true));

        } else if (joinedChatInfo.members.has(fromPK)) {
            const verifiedOps = [];
            const verified = access.verifiedOperations(messageData.ops, programStore.get(chatID).metadata.operations, programStore.get(chatID).metadata.unresolved, verifiedOps);
            if (verified) {
                programStore.get(chatID).metadata.operations = verifiedOps;
            } else {
                return;
            }

            joinedChatInfo.currentMember = false;

            joinedChatInfo.toDispute = { peerName: await getUsername(fromPK), peerPK: fromPK };

            joinedChatInfo.members.delete(keyPair.publicKey, 1);
            joinedChatInfo.exMembers.add(keyPair.publicKey);
            await store.setItem("joinedChats", joinedChats);

            for (const pk of joinedChats.get(chatID).members) {
                if (programStore.get(chatID).historyTable.has(pk)) {
                    const interval = programStore.get(chatID).historyTable.get(pk).pop();
                    interval[1] = interval[1] == 0 ? messageData.sentTime : interval[1];
                    programStore.get(chatID).historyTable.get(pk).push(interval);
                }
            }
            await store.setItem(chatID, programStore.get(chatID));

            if (document.getElementById(`userCard${localUsername}`)) { document.getElementById(`userCard${localUsername}`).remove(); }
            disableChatMods(chatID);
            
            console.log(`you've been removed from chat ${joinedChatInfo.chatName} by ${await getUsername(fromPK)}`);

            for (const pk of joinedChatInfo.members) {
                closeConnections(pk, chatID, true);
            }
        }
    }
}

export async function removeFromChat (username, pk, chatID) {
    // username : string, public key : string, chatID : string
    console.log(`we are now removing ${username} and the ops are ${programStore.get(chatID).metadata.operations.map(op => op.action)}`);
    const op = access.generateOp("remove", pk, programStore.get(chatID).metadata.operations);
    programStore.get(chatID).metadata.operations.push(op);
    await store.setItem(chatID, programStore.get(chatID)).then(console.log(`${username} has been removed from ${chatID}`));

    const removeMessage = addMsgID({
        type: "remove",
        op: op,
        ops: programStore.get(chatID).metadata.operations,
        username: username,
        from: keyPair.publicKey,
        chatID: chatID,
        dispute: false
    });
    broadcastToMembers(removeMessage, chatID);
    sendToServer({
        to: pk,
        type: "remove",
        msg: removeMessage
    });
}

async function disputeRemoval (peer, chatID) {
    joinedChats.get(chatID).currentMember = true;
    
    // generating operation
    const end = programStore.get(chatID).metadata.operations.findLastIndex((op) => op.action === "remove" && op.pk2 === keyPair.publicKey);
    const ignoredOp = programStore.get(chatID).metadata.operations.at(end);
    console.log(`we are now disputing ${peer.peerName} and the ops are ${programStore.get(chatID).metadata.operations.slice(0, end).map(op => op.action)}`);
    const op = access.generateDisputeOp("remove", peer.peerPK, ignoredOp.deps);

    programStore.get(chatID).metadata.operations.push(op);
    programStore.get(chatID).metadata.ignored.push(ignoredOp);
    await store.setItem(chatID, programStore.get(chatID));
    refreshChatWindow(chatID);

    programStore.get(chatID).metadata.operations.forEach(op => {
        console.log(`${op.action} ${keyMap.get(op.pk2)}`);
    });

    // sending message
    const removeMessage = addMsgID({
        type: "remove",
        op: op,
        username: peer.peerName,
        from: keyPair.publicKey,
        chatID: chatID,
        dispute: true,
    });
    sendToMember(removeMessage, keyPair.publicKey, false);
    // broadcastToMembers(removeMessage, chatID);
    sendToServer({
        to: peer.peerPK,
        type: "remove",
        msg: removeMessage
    });
    
    // updating member set
    const oldMembers = [...joinedChats.get(chatID).members];
    console.log(joinedChats.get(chatID).members);
    await updateMembers(access.members(programStore.get(chatID).metadata.operations, programStore.get(chatID).metadata.ignored), chatID);
    console.log(access.members(programStore.get(chatID).metadata.operations, programStore.get(chatID).metadata.ignored), chatID);
    for (const mem of oldMembers) {
        connectToPeer({ peerName: await getUsername(mem), peerPK: mem });
    }
}

var resolveGetUsername = new Map();
var rejectGetUsername = new Map();

function onGetUsername(name, success, pk) {
    // name: String, success: boolean, pk: string
    if (success) {
        keyMap.set(pk, name);
        store.setItem("keyMap", keyMap);
        if (resolveGetUsername.has(pk)) {
            resolveGetUsername.get(pk)(name);
        }
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
        keyMap.set(pk, name);
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
    online.sort((a, b) => {
        if (!joinedChats.get(chatID).members.has(a) && joinedChats.get(chatID).members.has(b)) {
            return 1
        } else if (!joinedChats.get(chatID).members.has(a) && joinedChats.get(chatID).members.has(b)) {
            return -1
        } else {
            return 0
        }
    });
    for (const peer of online) {
        if (await connectToPeer(peer)) {
            resolveGetOnline.get(chatID)(true);
            break;
        }
    }
    resolveGetOnline.get(chatID)(false);
    resolveGetOnline.delete(chatID);
}

var resolveGetOnline = new Map();

function getOnline (chatID) {
    return new Promise((resolve) => {
        resolveGetOnline.set(chatID, resolve);
        sendToServer({
            type: "getOnline",
            pk: keyPair.publicKey,
            chatID: chatID
        });
    });
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
                resolve(pk);
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

async function sendOperations(chatID, pk, ack=false) {
    // chatID : String, pk : String
    console.log(`sending operations to ${keyMap.get(pk)}`);
    sendToMember(addMsgID({
        type: "ops",
        ops: programStore.get(chatID).metadata.operations,
        chatID: chatID,
        from: keyPair.publicKey,
        sigmaAck: ack
    }), pk);
}

async function sendIgnored (ignored, chatID, pk) {
    // chatID : String, pk : String
    const ignoredMessage = addMsgID({
        type: "ignored",
        ignored: ignored,
        chatID: chatID,
        from: keyPair.publicKey,
    });
    broadcastToMembers(ignoredMessage, chatID);
    [...joinedChats.get(chatID).members].forEach((pk2) => {
        resolveSyncIgnored.set(`${chatID}_${pk2}`, (res) => {
            sendChatHistory(chatID, pk2);
            if (res) {
                console.log(`res success`);
                sendAdvertisement(chatID, pk2);
            } else {
                console.log(`res failed`);
            }
        });
    });
    if (!joinedChats.get(chatID).members.has(ignored)) {
        sendToMember(ignoredMessage, pk);
    }
}

async function receivedIgnored (ignored, chatID, pk, resolve) {
    // ignored: Array of Object, chatID: String, pk: stringify(public key of sender)
    if (pk === keyPair.publicKey) { resolve(true); return; }
    console.log(`receiving ignored ${ignored.length} for chatID ${chatID} from ${keyMap.get(pk)}`);

    if (opsArrEqual(programStore.get(chatID).metadata.ignored, ignored)) {
        console.log(`same universe naisu`);
        const memberSet = access.members(programStore.get(chatID).metadata.operations, programStore.get(chatID).metadata.ignored);
        joinedChats.get(chatID).exMembers.delete(pk);

        await store.setItem("joinedChats", joinedChats);
        if (memberSet.has(pk)) {
            updateMembers(memberSet, chatID);
        }

        if (memberSet.has(keyPair.publicKey)) {
            resolve(true);
        } else {
            resolve(false);
        }

    } else {
        console.log(`different universe from ${keyMap.get(pk)}`);
        joinedChats.get(chatID).members.delete(pk);
        joinedChats.get(chatID).exMembers.add(pk);
        console.log(programStore.get(chatID).historyTable.get(pk));
        store.setItem("joinedChats", joinedChats);
        updateChatInfo();
        resolve(false);
    }
}

const resolveSyncIgnored = new Map();

async function receivedOperations (ops, chatID, pk) {
    // ops: Array of Object, chatID: String, pk: stringify(public key of sender)
    console.log(`receiving operations for chatID ${chatID} from ${keyMap.get(pk)}`);
    return new Promise(async (resolve) => {
        console.log(`ops acquired lock`);
        if (pk === keyPair.publicKey) { return resolve(true); }

        const verifiedOps = [];
        console.log(`received`);
        console.log(ops);
        console.log(`self`);
        console.log(programStore.get(chatID).metadata.operations);
        const verified = access.verifiedOperations(ops, programStore.get(chatID).metadata.operations, programStore.get(chatID).metadata.unresolved, verifiedOps);
        programStore.get(chatID).metadata.operations = verifiedOps;
        await store.setItem(chatID, programStore.get(chatID));

        const graphInfo = access.hasCycles(programStore.get(chatID).metadata.operations);
        console.log(`graph Info ${graphInfo.cycle}`);
        if (graphInfo.cycle) {
            
            if (access.unresolvedCycles(graphInfo.concurrent, programStore.get(chatID).metadata.ignored)) {
                console.log(`cycle detected`);
                await getIgnored(graphInfo.concurrent, chatID, pk);
            }

            sendIgnored(programStore.get(chatID).metadata.ignored, chatID, pk);
            const queuedIgnoredSets = [...peerIgnored].filter((entry) => entry[0].split("_")[0] == chatID);
            for (const [syncID, queuedIg] of queuedIgnoredSets) {
                await receivedIgnored(queuedIg.ignored, chatID, queuedIg.pk, resolve);
                joinedChats.get(chatID).peerIgnored.delete(queuedIg.pk);
                peerIgnored.delete(syncID);
            }
            resolveSyncIgnored.set(`${chatID}_${pk}`, resolve);
            return;
        }
        
        const memberSet = access.members(programStore.get(chatID).metadata.operations, programStore.get(chatID).metadata.ignored);
        console.log(`valid?`);
        updateMembers(memberSet, chatID);

        console.log(`${verified}   ${memberSet.has(pk)}   ${memberSet.has(keyPair.publicKey)}`);
        return verified && memberSet.has(pk) ? resolve(true) : resolve(false);
    });
}

async function updateMembers (memberSet, chatID) {
    for (const mem of memberSet) { // populating keyMap
        await getUsername(mem);
    }

    if (memberSet.has(keyPair.publicKey)) {
        updateChatOptions("add", chatID);
        joinedChats.get(chatID).currentMember = true;
        joinedChats.get(chatID).exMembers.delete(keyPair.publicKey);
    } else {
        joinedChats.get(chatID).currentMember = false;
    }

    // add all the users which are no longer valid to exMembers
    joinedChats.get(chatID).validMembers.forEach(pk => {
        if (!memberSet.has(pk)) {
            joinedChats.get(chatID).exMembers.add(pk)
        }
    });
    joinedChats.get(chatID).validMembers = memberSet;
    joinedChats.get(chatID).members = new Set([...joinedChats.get(chatID).validMembers].filter(pk => !joinedChats.get(chatID).exMembers.has(pk)));
    await store.setItem("joinedChats", joinedChats);
    updateChatInfo();
    console.log(`all valid members ${chatID} ${[...joinedChats.get(chatID).validMembers].map(pk => keyMap.get(pk))}`);
    console.log(`current universe members ${chatID} ${[...joinedChats.get(chatID).members].map(pk => keyMap.get(pk))}`);
    console.log(`current exmembers ${chatID} ${[...joinedChats.get(chatID).exMembers].map(pk => keyMap.get(pk))}`);
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
        connection.on = function (event) {
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
                    chatID: currentChatID
                });
            }
        };
        connection.oniceconnectionstatechange = function (event) {
            if (connection.iceConnectionState === "failed") {
                connections.delete(connectionNames.get(connection));
                console.log(`Restarting ICE because ${connectionNames.get(connection)} failed`);
                connection.restartIce();
            }
        }
        connection.onconnectionstatechange = function (event) {
            console.log(event);
            if (connection.connectionState === "failed") {
                connections.delete(connectionNames.get(connection));
                console.log(`Restarting ICE because ${connectionNames.get(connection)} failed`);
                connection.restartIce();
            } else if (connection.connectionState === "disconnected") {
                console.log(`peer disconnected ${connectionNames.get(connection)}`);
                closeConnections(connectionNames.get(connection), 0);
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

const resolveAuth = new Map();

function initChannel(channel) {
    channel.onopen = (event) => { onChannelOpen(event); }
    channel.onclose = (event) => { console.log(`Channel ${event.target.label} closed`); }
    channel.onmessage = async (event) => { 
        const receivedData = JSON.parse(event.data);
        console.log(receivedData);
        if (!receivedData.encrypted && (receivedData.type === "ack" || receivedData.type === "SIGMA1" || receivedData.type === "SIGMA2" || receivedData.type === "SIGMA3")) {
            await receivedMessage(receivedData, event.target);

        } else if (receivedData.encrypted) {
            if (!sessionKeys.has(event.target)) {
                console.log(`queue waiting`);
                await new Promise((res) => {
                    if (!resolveAuth.has(event.target)) { resolveAuth.set(event.target, [])}
                    resolveAuth.get(event.target).push(res);
                });
            }
            console.log(`hello`);
            const data = arrToASCII(nacl.box.open.after(strToArr(receivedData.data), strToArr(receivedData.nonce), sessionKeys.get(event.target).s));
            console.log(data);
            console.log(nacl.verify(strToArr(receivedData.mac), access.hmac512(sessionKeys.get(event.target).m, data)));
            if (nacl.verify(strToArr(receivedData.mac), access.hmac512(sessionKeys.get(event.target).m, data))) {
                await receivedMessage(JSON.parse(data), event.target);
            }
        }
    }
}

const resolveMergeHistory = new Map();

async function receivedMessage (messageData, channel=null) {
    console.log(`received a message from the channel of type ${messageData.type} from ${keyMap.get(messageData.from)}`);
    if (messageData.chatID !== currentChatID && (messageData.type === "text" || messageData.type === "add" || messageData.type === "remove")
    && document.getElementById(`chatCard${messageData.chatID}`) !== null) {
        document.getElementById(`chatCard${messageData.chatID}`).className = "card card-chat notif";
    }

    const syncID = `${messageData.chatID}_${messageData.from}`;
    switch (messageData.type) {
        case "ack":
            console.log(`ack received ${messageData.id}`);
            acks.delete(messageData.id);
            return;
        case "SIGMA1":
            onSIGMA1(strToArr(messageData.valueS), strToArr(messageData.valueM), channel);
            return;
        case "SIGMA2":
            onSIGMA2.get(channel)(messageData);
            return;
        case "SIGMA3":
            console.log(`here`);
            onSIGMA3.get(channel)(messageData);
            return;
        case "ops":
            await sendChatHistory(messageData.chatID, messageData.from);
            if (messageData.sigmaAck) { sendOperations(messageData.chatID, messageData.from); }
            receivedOperations(messageData.ops, messageData.chatID, messageData.from).then(async (res) => {
                console.log(res);
                console.log(resolveMergeHistory.get(syncID));
                await mergeChatHistory(messageData.chatID, resolveMergeHistory.get(syncID));
                if (res) {
                    console.log(`res success`);
                    updateConnectStatus(messageData.from, true);
                    sendAdvertisement(messageData.chatID, messageData.from);
                } else {
                    console.log(`res fail`);
                    updateConnectStatus(messageData.from, false);
                    // closeConnections(messageData.from, messageData.chatID);
                }
            });
            break;
        case "ignored":
            if (resolveSyncIgnored.has(syncID)) {
                console.log(`ripe ignored`);
                receivedIgnored(messageData.ignored, messageData.chatID, messageData.from, resolveSyncIgnored.get(syncID));
                resolveSyncIgnored.delete(syncID);
            } else if (messageData.from !== keyPair.publicKey) {
                console.log(`premature ignored`);
                peerIgnored.set(syncID, { pk: messageData.from, ignored: messageData.ignored });
                joinedChats.get(messageData.chatID).peerIgnored.set(messageData.from, messageData.ignored);
                store.setItem("joinedChats", joinedChats);
            }
            break;
        case "selectedIgnored":
            await updateChatStore(messageData);
            if (!resolveSyncIgnored.has(`${messageData.chatID}_${messageData.from}`)) {
                sendOperations(messageData.chatID, messageData.from, true);
            }
            if (messageData.chatID == currentChatID) {
                elem.updateSelectedMembers(keyMap.get(messageData.from), messageData.op.sig);
                refreshChatWindow(messageData.chatID);
            }
            break;
                
        case "advertisement":
            // if (messageData.online.length === 0) { getOnline(messageData.chatID); } 
            messageData.online.forEach((peer) => connectToPeer(peer));
            break;
        case "history":
            resolveMergeHistory.set(syncID, messageData.history);
            const disputeCheck = (messageData.history.findLastIndex((msg) => msg.type === "remove" && msg.op.pk2 === keyPair.publicKey && !msg.dispute));
            if (disputeCheck > -1 && programStore.get(messageData.chatID).history.findLastIndex((msg) => msg.id === messageData.history.at(disputeCheck)) < 0) {
                onRemove(messageData.history.at(disputeCheck));
            }
            break;
        case "remove":
            await receivedOperations(messageData.ops, messageData.chatID, messageData.from).then(async (res) => {
                if (res) { 
                    console.log(`success`);
                    if (messageData.op.pk2 === keyPair.publicKey) {
                        onRemove(messageData);
                    } else {
                        removePeer(messageData); 
                    }
                } else {
                    console.log(`reject`);
                }
            });
            break;
        case "add":
            if (messageData.op.pk2 === keyPair.publicKey) {
                onAdd(messageData.chatID, messageData.chatName, messageData.from, messageData.ignored, messageData);
            } else {
                await receivedOperations(messageData.ops, messageData.chatID, messageData.from).then(async (res) => {
                    if (res) { addPeer(messageData); }
                });
            }
            break;
        case "text":
            if (joinedChats.get(messageData.chatID).members.has(messageData.from)) {
                updateChatWindow(messageData);
                await updateChatStore(messageData);
            }
            break;
        case "close":
            sendChatHistory(messageData.chatID, messageData.from);
            closeConnections(messageData.from, messageData.chatID);
            break;
        default:
            console.log(`Unrecognised message type ${messageData.type}`);
    }
    sendToMember({
        type: "ack",
        id: `${messageData.id}${keyPair.publicKey}`,
        from: keyPair.publicKey
    }, messageData.from, false);
}

async function initSIGMA (channel) {
    // only used for p2p connections
    return new Promise(async (resolve) => {
        const dhS = nacl.box.keyPair();
        const dhM = nacl.box.keyPair();

        channel.send(JSON.stringify({
            type: "SIGMA1",
            valueS: arrToStr(dhS.publicKey),
            valueM: arrToStr(dhM.publicKey),
        }));
    
        const res = await new Promise((res) => { onSIGMA2.set(channel, res); });
    
        const localValueS = dhS.publicKey;
        const peerValueS = strToArr(res.valueS);
        const peerValueM = strToArr(res.valueM);
        const peerPK = strToArr(res.pk);
        const sessionKey = nacl.box.before(peerValueS, dhS.secretKey);
        const macKey = nacl.box.before(peerValueM, dhM.secretKey);
    
        const receivedValues = concatArr(localValueS, peerValueS);
    
        if (nacl.sign.detached.verify(receivedValues, strToArr(res.sig), peerPK) 
        && nacl.verify(strToArr(res.mac), access.hmac512(macKey, peerPK))) {
            if (connections.has(res.pk)) {
                connections.get(res.pk).auth = true;
            }

            sessionKeys.set(channel, { s: sessionKey, m: macKey});
            console.log(sessionKeys);
            sendToMember({
                status: "SUCCESS",
                type: "SIGMA3",
                pk: keyPair.publicKey,
                sig: arrToStr(nacl.sign.detached(concatArr(peerValueS, localValueS), keyPair.secretKey)),
                mac: arrToStr(access.hmac512(macKey, strToArr(keyPair.publicKey))),
            }, res.pk, false);
            resolve(true);

        } else {
            sendToMember({
                status: "VERIF_FAILED"
            }, res.pk, false);
            resolve(false);
        }
    });
}

async function onChannelOpen(event) {
    console.log(`Channel ${event.target.label} opened`);
    const channelLabel = JSON.parse(event.target.label);
    const peerPK = channelLabel.senderPK === keyPair.publicKey ? channelLabel.receiverPK : channelLabel.senderPK;

    if (resolveConnectToPeer.has(peerPK)) {
        if (await initSIGMA(event.target)) {
            for (const chatID of joinedChats.keys()) {
                if (joinedChats.get(chatID).members.has(peerPK) || joinedChats.get(chatID).exMembers.has(peerPK)) {
                    sendOperations(chatID, peerPK, true);
                }
            }
        } else {
            updateConnectStatus(peerPK, false);
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

function sendAdvertisement (chatID, pk) {
    // chatID: String, pk: stringify(pk)
    const online = [];
    for (const mem of joinedChats.get(chatID).members) {
        if (connections.has(mem) && mem !== pk) {
            online.push({ peerName: keyMap.get(mem), peerPK: mem });
        }
    }

    if (online.length > 0) {
        console.log(`sending an advertistment of length ${online.length} to ${pk} of ${online}`)
        sendToMember(addMsgID({
            type: "advertisement",
            online: online,
            from: keyPair.publicKey,
            chatID: chatID,
        }), pk);
    }
}

var resolveConnectToPeer = new Map();

function connectToPeer (peer) {
    // peer: JSON {peerName: String, peerPK: string}
    return new Promise((resolve) => {
        if (peer.peerName === localUsername || resolveConnectToPeer.has(peer.peerPK)) { resolve(false); return; }
        if (connections.has(peer.peerPK)) { 
            if (connections.get(peer.peerPK).auth) {
                resolve(true); 
            } else {
                resolve(false);
            }
            return;
        }

        resolveConnectToPeer.set(peer.peerPK, resolve);
        keyMap.set(peer.peerPK, peer.peerName);
        store.setItem("keyMap", keyMap);

        sendOffer(peer.peerName, peer.peerPK);
        setTimeout(() => {
            resolve(false);
        }, 10000);
    });
}

function updateConnectStatus (pk, success) {
    console.log(`updating connect status of ${keyMap.get(pk)} to ${success}`);
    if (resolveConnectToPeer.has(pk)) { 
        resolveConnectToPeer.get(pk)(success);
        resolveConnectToPeer.delete(pk);
    }
}

async function addPeer (messageData) {
    const pk = messageData.op.pk2;
    const chatID = messageData.chatID;
    keyMap.set(pk, messageData.username);
    store.setItem("keyMap", keyMap);

    joinedChats.get(chatID).members.add(pk);
    joinedChats.get(chatID).validMembers.add(pk);
    joinedChats.get(chatID).exMembers.delete(pk);
    store.setItem("joinedChats", joinedChats);

    updateChatInfo();
    updateChatWindow(messageData);
    await updateChatStore(messageData);
    console.log(programStore.get(chatID).history);
    await store.setItem(chatID, programStore.get(chatID));
    console.log(`history for ${pk}: ${programStore.get(chatID).historyTable.get(pk)}`);
}

async function removePeer (messageData) {
    const pk = messageData.op.pk2;
    const chatID = messageData.chatID;

    // inserting message + rollback
    // const endIndex = programStore.get(chatID).history.findIndex((msg) => (messageData.sentTime < msg.sentTime && (msg.action === "add" || msg.op.pk2 === pk)));
    await updateChatStore(messageData);

    console.log(`history ${programStore.get(chatID).history}`);
    await store.setItem(chatID, programStore.get(chatID));
    console.log(`added removal message data to chat history`);

    joinedChats.get(chatID).members.delete(pk);
    joinedChats.get(chatID).validMembers.delete(pk);
    
    joinedChats.get(chatID).exMembers.add(pk);
    await store.setItem("joinedChats", joinedChats);

    updateChatInfo();
    updateChatWindow(messageData);
    closeConnections(pk, chatID);
}

function refreshChatWindow (chatID) {
    if (chatID === currentChatID) {
        chatWindow.innerHTML = '<div id="anchor" style="overflow-anchor: auto; height: 1px" ></div>';
        sortChatHistory(programStore.get(chatID).history);
        programStore.get(chatID).history.forEach(data => {
            updateChatWindow(data);
        });
    }
}

function updateChatWindow (data) {
    // data: JSON
    if (data.chatID === currentChatID) {
        const message = document.createElement('p');
        message.id = data.id;
        message.className = "chat-message";
        switch (data.type) {
            case "create":
                message.innerHTML = `[${formatDate(data.sentTime)}] chat created by ${keyMap.get(data.op.pk)}`;
                break;
            case "text":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${keyMap.get(data.from)}: ${data.message}`;
                break;
            case "add":
                message.innerHTML = `[${formatDate(data.sentTime)}] <span style="color: #169873;">${keyMap.get(data.op.pk1)} added ${keyMap.get(data.op.pk2)}</span>`;
                break;
            case "remove":
                message.innerHTML = `[${formatDate(data.sentTime)}] <span style="color: #fc5c65;">${keyMap.get(data.op.pk1)} removed ${keyMap.get(data.op.pk2)}</span>`;
                break;
            case "selectedIgnored":
                message.innerHTML = `[${formatDate(data.sentTime)}] <span style="color: #5E6472;">${keyMap.get(data.from)} chose to ignore '${keyMap.get(data.op.pk1)} ${data.op.action} ${keyMap.get(data.op.pk2)}</span>'`;
                break;
            default:
                break;
        }
        chatWindow.insertBefore(message, chatWindow.lastElementChild);
    }
}

async function updateChatStore (messageData) {
    const chatID = messageData.chatID;
    const locationIndex = programStore.get(chatID).history.findIndex((msg) => (msg.sentTime >= messageData.sentTime));
    if (locationIndex < 0) {
        programStore.get(chatID).history.push(messageData);
    } else {
        if (programStore.get(chatID).history.at(locationIndex).id !== messageData.id) {
            if (messageData.type === "remove") {
                programStore.get(chatID).history.splice(locationIndex+1, Infinity, messageData, ...programStore.get(chatID).history.slice(locationIndex+1).filter((msg) => msg.pk1 !== messageData.op.pk2));
            } else {
                programStore.get(chatID).history.splice(locationIndex+1, 0, messageData);
            }
        }
    }
    await store.setItem(chatID, programStore.get(chatID));
}

function sendToMember (data, pk, requireAck=true) {
    // data: JSON, pk: String
    if (pk === keyPair.publicKey && data.type !== "ack") { return receivedMessage(data); }
    console.log(`sending ${data.type} to ${keyMap.get(pk)}`);
    if (connections.has(pk) && onlineMode) {
        try {
            if (data.type === "ack" || data.type === "SIGMA1" || data.type === "SIGMA2" || data.type === "SIGMA3") {
                data.encrypted = false;
                connections.get(pk).sendChannel.send(JSON.stringify(data));
            } else {
                const stringData = JSON.stringify(data);
                const nonce = nacl.randomBytes(24);

                const encryptedData = {
                    encrypted: true,
                    mac: arrToStr(access.hmac512(sessionKeys.get(connections.get(pk).sendChannel).m, enc.encode(stringData))),
                    nonce: arrToStr(nonce),
                    data: arrToStr(nacl.box.after(ASCIIToArr(stringData), nonce, sessionKeys.get(connections.get(pk).sendChannel).s))
                }
                connections.get(pk).sendChannel.send(JSON.stringify(encryptedData));
            }
            if (requireAck && pk !== keyPair.publicKey) { acks.add(`${data.id}${pk}`); }
        } catch (err) {
            console.log(`failed to send ${data.type}`);
            console.error(err.message);
        }
    }
    return;
}

function addMsgID (data) {
    data.sentTime = Date.now();
    if (data.type == "create" || data.type == "add" || data.type == "remove" || data.type == "selectedIgnored") {
        data.id = data.op.sig;
    } else {
        data.id = arrToStr(nacl.hash(enc.encode(`${keyPair.publicKey}:${data.sentTime}`)));
    }
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
    login(loginInput.value);
    loginInput.value = "";
});

async function login (username) {
    console.log(username);
    if (username.length > 0 && isAlphanumeric(username)) {
        
        if (store) {
            await store.config({
                storeName: arrToStr(nacl.hash(enc.encode(username)))
            });
            store.getItem("keyPair").then((kp) => console.log(kp.publicKey));
        } else {
            await initialiseStore(username);
            await store.getItem("keyPair").then((kp) => {
                if (kp) {
                    console.log(`keypair ${JSON.stringify(kp)}`);
                    keyPair = kp;
                } else {
                    keyPair = nacl.sign.keyPair();
                    keyPair.publicKey = arrToStr(keyPair.publicKey);
                    console.log("keyPair generated");
                    store.setItem("keyPair", keyPair);
                    store.setItem("keyMap", keyMap);
                    store.setItem("msgQueue", msgQueue);
                }
            });

            if (!await onSIGMA1(serverValues.s, serverValues.m, connection)) {
                alert("failed to authenticate connection");
                return;
            }
        }
        console.log(`sending login`);
        sendToServer({
            type: "login",
            name: username,
        });
    }
}

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
    createNewChat(chatNameInput.value);
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
        if (joinedChats.get(currentChatID).validMembers.has(pk)) { alert(`User has already been added`); return; }
        addToChat(username, pk, currentChatID);
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
        conflictChatBar.style.display = conflict ? "flex" : "none";

        document.getElementById('disputeCard').style.display = conflict || joinedChats.get(currentChatID).toDispute == null ? "none" : "flex";
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
        conflictChatBar.style.display = "none";
        
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

resetStoreBtn.addEventListener("click", () => {
    console.log(`resetting store...`);
    store.keys().then((keys) => {
        for (const key of keys) {
            if (key !== "keyPair") {
                store.removeItem(key);
            }
        }
    })
})

var resolveGetIgnored = new Map();

async function getIgnored (cycles, chatID, pk) {
    return new Promise(async (resolve) => { 
        if (!resolveGetIgnored.has(chatID)) { resolveGetIgnored.set(chatID, [cycles, new Map()]); }
        resolveGetIgnored.get(chatID)[0] = cycles;
        resolveGetIgnored.get(chatID)[1].set(pk, resolve);
        console.log([...resolveGetIgnored]);

        for (const cycle of cycles) {
            const issuedOp = cycle.find((op) => op.pk1 === keyPair.publicKey);

            if (issuedOp) {
                const sources = access.earliestSubset(cycle);
                const dependentIndex = sources.findIndex((op) => op.sig == issuedOp.sig || access.precedes(cycle, op, issuedOp));
                const ignore = sources.at(dependentIndex-1);
                await selectIgnored(ignore, chatID, cycle);

                console.log(`automatically resolved ${selected.action} ${keyMap.get(selected.pk2)}`);
                continue;
            }
        }

        if (chatID === currentChatID && resolveGetIgnored.has(chatID)) {
            document.getElementById('chatBar').style.display = "none";
            updateChatInfo();
        }
    });
}

export async function selectIgnored(ignoredOp, chatID, cycle) {
    // unwinding chat history
    const ignoredOpIndex = programStore.get(chatID).history.findIndex(msg => msg.type == ignoredOp.action && msg.op.sig === ignoredOp.sig);

    if (ignoredOpIndex > -1) {
        console.log(`found ignored op`);
        const sources = access.earliestSubset(cycle);
        const index = cycle.findIndex((op) => ignoredOp.sig === op.sig);
        const ignoreFrom = new Set();
        do {
            ignoreFrom.add(cycle.at(index).pk1);
            index += 1;
        } while (!hasOp(sources, cycle.at(index)));
        const filteredHistory = programStore.get(chatID).history.slice(ignoredOpIndex+1).filter(msg => msg.type === "selectedIgnored" || ignoreFrom.has(msg.from));

        programStore.get(chatID).history.splice(ignoredOpIndex+1, Infinity, ...filteredHistory);

        if (programStore.get(chatID).historyTable.has(ignoredOp.pk2)) { 
            const interval = programStore.get(chatID).historyTable.get(ignoredOp.pk2).pop();
            if (ignoredOp.action == "remove") {
                interval[1] = 0;
                programStore.get(chatID).historyTable.get(ignoredOp.pk2).push(interval);
            }
        }
    }

    // writing to storage
    programStore.get(chatID).metadata.ignored.push(ignoredOp);
    // removeOp(chatInfo.metadata.operations, ignoredOp);
    await store.setItem(chatID, programStore.get(chatID));
    refreshChatWindow(chatID);

    // sending to others
    if (ignoredOp.pk2 !== keyPair.publicKey) {
        const msg = addMsgID({
            type: "selectedIgnored",
            op: ignoredOp,
            chatID: chatID,
            from: keyPair.publicKey,
        });
        broadcastToMembers(msg, chatID);
        if (!joinedChats.get(chatID).members.has(ignoredOp.pk1)) {
            sendToMember(msg, ignoredOp.pk1);
        }
        if (!joinedChats.get(chatID).members.has(ignoredOp.pk2)) {
            sendToMember(msg, ignoredOp.pk2);
        }
    }

    resolveGetIgnored.get(chatID)[0].splice(resolveGetIgnored.get(chatID)[0].findIndex((cycle) => access.hasOp(cycle, ignoredOp)), 1);

    if (resolveGetIgnored.get(chatID)[0].length == 0) {
        [...resolveGetIgnored.get(chatID)[1].values()].forEach((res) => res(programStore.get(chatID).metadata.ignored));
        resolveGetIgnored.delete(chatID);
        chatBox.className = "chat-panel col-8";
        enableChatMods(chatID);
    }
}


export function updateChatInfo () {
    if (currentChatID !== 0) {
        document.getElementById('chatTitle').innerHTML = joinedChats.get(currentChatID).chatName;

        memberList.innerHTML = "";
        [...joinedChats.get(currentChatID).members].forEach((pk) => {
            if (pk === keyPair.publicKey) {
                const card = elem.generateUserCard(pk, keyMap.get(pk), currentChatID);
                card.className = `card self`;
                memberList.insertBefore(card, memberList.firstElementChild);
            } else {
                memberList.appendChild(elem.generateUserCard(pk, keyMap.get(pk), currentChatID));
            }
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
                const options = access.earliestSubset(cycle);
                conflictCardList.appendChild(elem.generateConflictCard(options, currentChatID, cycle));
                for (const op of cycle) {
                    if (document.getElementById(op.sig) == null) {
                        updateChatWindow(addMsgID({
                            type: op.action,
                            chatID: currentChatID,
                            op: op
                        }));
                    }
                }
            });
        };
    }
}

export async function selectChat(chatID) {
    currentChatID = chatID;
    console.log(currentChatID);
    document.getElementById(`chatCard${chatID}`).className = "card card-chat";
    await navigator.locks.request("history", async () => {
        await refreshChatWindow(currentChatID);
    });
    updateChatInfo();
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

function logout () {
    for (const chatID of joinedChats.keys()) {
        [...joinedChats.get(chatID).members].forEach((pk) => {
            closeConnections(pk, chatID);
        });
    }
    initialiseClient();
    sendToServer({
        type: "leave",
        pk: keyPair.publicKey,
    });
}

connectBtn.addEventListener("click", () => {
    if (onlineMode) { goOffline(false); }
    else { 
        reconnect = true;
        connectToServer();
    }
});

function goOffline (event) {
    console.log(`goOffline`);
    onlineMode = false;
    wifiSlash.style.display = "block";
    [...connections.keys()].forEach((pk) => closeConnections(pk, 0));
    if (!event) { connection.close(); }
}


///////////
// UTILS //
///////////

function opsArrEqual (ops1, ops2) {
    if (ops1.length !== ops2.length) { return false; }

    const sigSet = new Set(ops1.map(op => op.sig));
    for (const op of ops2) {
        if (!sigSet.has(op.sig)) {
            return false;
        }
    }
    return true;
}

function removeOp(ops, op) {
    for (let i = 0; i < ops.length; i++) {
        if (ops[i].sig === op.sig) {
            ops.splice(i, 1);
        }
    }
}

function mergeJoinedChats(localChats, receivedChats) {
    console.log(localChats);
    const mergedChats = new Map([...localChats]);
    if (receivedChats.size === 0) { return mergedChats; }
    const localChatIDs = new Set(localChats.keys());
    for (const id of receivedChats.keys()) {
        if (!localChatIDs.has(id)) {
            mergedChats.set(id, {
                chatName: chatName,
                validMembers: new Set([fromPK]),
                members: new Set([fromPK]),
                exMembers: new Set(),
                peerIgnored: new Map(),
                currentMember: false,
                toDispute: null
            });
            receivedChats.get(id);
        } else {
            mergedChats.get(id).currentMember = receivedChats.get(id).currentMember;
        }
    }
    return mergedChats;
}

async function sendChatHistory (chatID, pk) {
    await navigator.locks.request(`history${keyPair.publicKey}`, async () => {
        var authorised = joinedChats.get(chatID).members.has(pk);
        console.log(authorised);
        console.log(programStore.get(chatID).history);
        var msg;
        const peerHistory = [];
        for (let index = programStore.get(chatID).history.length; index-- ; index >= 0) {
            msg = programStore.get(chatID).history.at(index);
            console.log(`${msg.type}`);
            if (msg.type === "add" && msg.op.pk2 === pk) {
                if (!authorised) {
                    peerHistory.splice(0, peerHistory.findIndex((msg) => msg.type === "add"));
                }
                authorised = false;
                peerHistory.unshift(msg);
            } else if (msg.type === "remove" && msg.op.pk2 === pk) {
                if (authorised) {
                    peerHistory.splice(0, peerHistory.findIndex((msg) => msg.type === "remove"));
                }
                authorised = true;
            }

            if (authorised || msg.type === "selectIgnored") {
                peerHistory.unshift(msg);
            }
        }
        console.log(peerHistory);
        sortChatHistory(peerHistory);
        sendToMember(addMsgID({
            type: "history",
            history: peerHistory,
            chatID: chatID,
            from: keyPair.publicKey
        }), pk);
    });
}

async function mergeChatHistory (chatID, receivedMsgs=[]) {
    await navigator.locks.request(`history${keyPair.publicKey}`, async () => {
        const localMsgs = programStore.get(chatID).history;
        console.log(`local length ${localMsgs.length}`);
        console.log(`received length ${receivedMsgs.length}`);
        var newMessage = false;

        if (receivedMsgs.length > 0) {
            const mergedChatHistory = [];
            var localIndex = localMsgs.length-1;
            var receivedIndex = receivedMsgs.length-1;
            var authorisedSet = new Set(joinedChats.get(chatID).members);
            console.log(authorisedSet);

            var msg;
            while (localIndex >= 0 && receivedIndex >= 0) {
                console.log(`${localMsgs.at(localIndex).type}  ${receivedMsgs.at(receivedIndex).type}`);
                if (localMsgs.at(localIndex).id == receivedMsgs.at(receivedIndex).id) {
                    msg = localMsgs[localIndex];
                    localIndex -= 1;
                    receivedIndex -= 1;
                } else if (localMsgs.at(localIndex).sentTime > receivedMsgs.at(receivedIndex).sentTime) {
                    msg = localMsgs[localIndex];
                    localIndex -= 1;
                } else {
                    newMessage = true;
                    msg = receivedMsgs[receivedIndex];
                    receivedIndex -= 1;
                }
                
                console.log(mergedChatHistory.map(msg => msg.type));
                if (authorisedSet.has(msg.from) || msg.from === keyPair.publicKey) {
                    if (msg.type === "add") {
                        authorisedSet.delete(msg.op.pk2);
                    } else if (msg.type === "remove") {
                        authorisedSet.add(msg.op.pk2);
                    }
                    mergedChatHistory.unshift(msg);
                }
            }
            console.log(`exit`);

            while (localIndex >= 0) {
                console.log(`localLoop`);
                msg = localMsgs[localIndex];
                if (authorisedSet.has(msg.from) || msg.from === keyPair.publicKey) {
                    if (msg.type === "add") {
                        authorisedSet.delete(msg.op.pk2);
                    } else if (msg.type === "remove") {
                        authorisedSet.add(msg.op.pk2);
                    }
                    mergedChatHistory.unshift(msg);
                }
                localIndex -= 1;
            }

            while (receivedIndex >= 0) {
                console.log(`receivedLoop ${receivedIndex}`);
                msg = receivedMsgs[receivedIndex];
                newMessage = true;
                if (authorisedSet.has(msg.from) || msg.from === keyPair.publicKey) {
                    if (msg.type === "add") {
                        authorisedSet.delete(msg.op.pk2);
                    } else if (msg.type === "remove") {
                        authorisedSet.add(msg.op.pk2);
                    }
                    mergedChatHistory.unshift(msg);
                }
                receivedIndex -= 1;
            }

            sortChatHistory(mergedChatHistory);
            programStore.get(chatID).history = mergedChatHistory;
            await store.setItem(chatID, programStore.get(chatID));
            refreshChatWindow(chatID);
            if (newMessage && chatID !== currentChatID && document.getElementById(`chatCard${chatID}`) !== null) { 
                document.getElementById(`chatCard${chatID}`).className = "card card-chat notif";
            }
        }
    });
}

function sortChatHistory (history) {
    history.sort((a, b) => {
        if (a.sentTime > b.sentTime) { return 1; }
        if (a.sentTime < b.sentTime) { return -1; }
        if (a.username > b.username) { return 1; }
        else { return -1; } // (a[1].username <= b[1].username) but we know it can't be == and from the same timestamp
    });
}

function closeConnections (pk, chatID=0) {
    if (chatID !== 0) {
        for (const id of joinedChats.keys()) {
            if (chatID !== id && joinedChats.get(id).members.has(pk)) {
                return;
            }
        }
    }
    if (connections.has(pk) && !offerSent.has(pk) && (chatID == 0 || [...acks].findIndex((id) => id.slice(128) === pk) == -1)) {
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
