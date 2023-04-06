import nacl from '../../node_modules/tweetnacl-es6/nacl-fast-es.js';
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
const anchor = document.getElementById('anchor');

const messageInput = document.getElementById('messageInput');
const addUserInput = document.getElementById('addUserInput');
const loginInput = document.getElementById('loginInput');

var localUsername = "tester";


//////////////////////
// GLOBAL VARIABLES //
//////////////////////

const enc = new TextEncoder();

// connection to stringified(peerPK)
var connectionNames = new Map();

var currentChatID, connections, msgQueue;
export var joinedChats, keyMap;

var store = new Map();

function initialiseClient () {
    currentChatID = 0;
    connections = new Map(); // map from stringify(pk):string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
    joinedChats = new Map(); // (chatID: String, {chatName: String, members: Array of String})
    keyMap = new Map(); // map from public key : stringify(pk) to username : String

    // layout
    [...chatList.childNodes].forEach((node) => {
        if (node.id !== "chatCardTemplate") {
            chatList.removeChild(node);
        }
    });
    document.getElementById('heading').innerHTML = `Hello, I am a test Chat`;
    document.getElementById('defaultText').style.display = "block";
    document.getElementById('chatInfo').style.display = "none";
    document.getElementById('chatBoxHeading').style.display = "none";
    [...document.getElementsByClassName('chat-bar')].forEach((elem) => {
        elem.style.display = "none";
    });
    chatWindow.innerHTML = "";
    currentChatID = 0;
    chatWindow.innerHTML = '<div id="anchor" style="overflow-anchor: auto; min-height: 1px; height: 1px" ></div>';

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
    receivedSMessage(data);
};

function receivedSMessage (data) {
    if (data.chatID !== currentChatID && (data.type === "text" || data.type === "add" || data.type === "remove")
    && document.getElementById(`chatCard${data.chatID}`) !== null) {
        document.getElementById(`chatCard${data.chatID}`).className = "card card-chat notif";
    }

    switch (data.type) {
        case "login":
            onLogin();
            break;
        case "ignored":
            console.log(`p${data.op.split(" ")[0]}`);
            const p = document.getElementById(`p${data.op.split(" ")[2]}`);
            if (p) {
                p.innerHTML = `${p.innerHTML}, ${data.from}`;
            }
            if (data.chatID >= 5 && data.op.split(" ")[2] != localUsername) {
                if (joinedChats.get(currentChatID).members.includes(data.from)) {
                    joinedChats.get(currentChatID).members.splice(joinedChats.get(currentChatID).members.indexOf(data.from), 1);
                }
                joinedChats.get(currentChatID).exMembers.add(data.from);
            }
            joinedChats.get(data.chatID).peerIgnored.set(data.from, data.pk2);
            updateChatInfo();
        case "text":
            store.get(data.chatID).history.push(data);
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
            if (data.pk2 === localUsername) {
                onAdd(data.chatID, data.chatName, data.pk1, JSON.parse(data.members), data.id);
            } else {
                addPeer(data);
            }
            break;
        case "history":
            mergeChatHistory(data.chatID, data.history);
            break;
        case "remove":
            if (data.pk2 === localUsername) {
                onRemove(data);
            } else {
                removePeer(data);
            }
            break;
        case "getUsername":
            onGetUsername(data.username, data.success, data.pk);
            break;
        case "getPK":
            onGetPK(data.username, data.success, objToArr(data.pk));
            break;
        default:
            break;
    }
}

function onLogin () {
    loginPopup.style.display = "none";
    dim.style.display = "none";
    document.getElementById('heading').innerHTML = `I know this is ugly, but Welcome ${localUsername}`;
}


// When being added to a new chat
async function onAdd (chatID, chatName, from, members) {
    // chatID: String, chatName: String, from: String, fromPK: Uint8Array, msgID: 

    // we want to move this actual joining to after syncing with someone from the chat
    console.log(`you've been added to chat ${chatName} by ${from}`);
    console.log(members);

    joinedChats.set(chatID, {
        chatName: chatName,
        members: members,
        exMembers: new Set(),
        peerIgnored: new Map(),
        currentMember: true,
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
    });

    resolveGetIgnored.delete(chatID);

    updateChatOptions("remove", chatID);
    updateChatOptions("add", chatID);
    document.getElementById(`chatCard${chatID}`).className = "card card-chat notif";
    updateChatInfo();
}

async function addToChat (usernames, chatID) {
    // members is the list of members pubkey: object
    var chatInfo = store.get(chatID);
    for (const name of usernames) {
        console.log(`we are now adding ${name}`);

        const addMessage = addMsgID({
            type: "add",
            pk2: name,
            chatName: chatInfo.metadata.chatName,
            chatID: chatID,
            pk1: localUsername,
        });

        joinedChats.get(chatID).members.push(name);
        receivedSMessage(addMessage);
        sendToServer(addMessage);
    }
}

export async function removeFromChat (username, pk, chatID) {
    // username : string, public key : string, chatID : string
    const removeMessage = addMsgID({
        type: "remove",
        pk1: localUsername,
        pk2: username,
        chatID: chatID,
        dispute: false
    });

    if (joinedChats.get(chatID).members.includes(username)) {
        joinedChats.get(chatID).members.splice(joinedChats.get(chatID).members.indexOf(username), 1);
    }
    receivedSMessage(removeMessage);
    sendToServer(removeMessage);
}

async function onRemove (messageData) {
    // if the removal is disputable
    if (!messageData.dispute) { 
        joinedChats.get(messageData.chatID).toDispute = messageData.pk1;
    } else if (messageData.pk1 == "larryCucumber" && messageData.dispute) {
        joinedChats.currentMember = true;
        joinedChats.get(messageData.chatID).members.push(localUsername);
        chatInfo.history.push(messageData);
        updateChatWindow(messageData);
        return;
    }

    var chatInfo = store.get(messageData.chatID);
    chatInfo.history.push(messageData);

    joinedChats.get(messageData.chatID).currentMember = false;
    if (joinedChats.get(messageData.chatID).members.includes(localUsername)) {
        joinedChats.get(messageData.chatID).members.splice(joinedChats.get(messageData.chatID).members.indexOf(localUsername), 1);
        updateChatWindow(messageData);
    }
    joinedChats.get(messageData.chatID).exMembers.add(localUsername);

    if (document.getElementById(`userCard${localUsername}`)) { document.getElementById(`userCard${localUsername}`).remove(); }
    disableChatMods(messageData.chatID);
    
    console.log(`you've been removed from chat ${joinedChats.get(messageData.chatID).chatName} by ${messageData.pk1}`);
}

async function disputeRemoval(peer, chatID) {
    const chatInfo = store.get(chatID);

    const ignoredOpIndex = chatInfo.history.findIndex(msg => msg.type == "remove" && msg.pk2 == localUsername);
    if (ignoredOpIndex > -1) {
        chatInfo.history.splice(ignoredOpIndex);
    }

    if (joinedChats.get(chatID).members.includes(peer)) {
        joinedChats.get(chatID).members.splice(joinedChats.get(chatID).members.indexOf(peer), 1);
    }
    joinedChats.get(chatID).exMembers.add(peer);
    joinedChats.get(chatID).exMembers.delete(localUsername);
    joinedChats.get(chatID).members.push(localUsername);

    await refreshChatWindow(chatID);

    const removeMessage = addMsgID({
        type: "remove",
        pk1: localUsername,
        pk2: peer,
        chatID: chatID,
        dispute: true
    });

    chatInfo.history.push(removeMessage);
    updateChatWindow(removeMessage);
    sendToServer(removeMessage);
    updateChatInfo();
}


////////////////////////////
// Peer to Peer Functions //
////////////////////////////

async function addPeer(messageData) {
    const pk = messageData.pk2;

    if (!joinedChats.get(messageData.chatID).members.includes(pk)) {
        joinedChats.get(messageData.chatID).members.push(pk);
    }
    joinedChats.get(messageData.chatID).exMembers.delete(pk);

    updateChatInfo();
    updateChatWindow(messageData);
    const chatInfo = store.get(messageData.chatID);
    chatInfo.history.push(messageData);
    console.log(`added message data to chat history`);
}

async function removePeer (messageData) {
    const pk = messageData.pk2;
    const chatInfo = store.get(messageData.chatID);
    chatInfo.history.push(messageData);
    updateChatWindow(messageData);

    if (messageData.dispute) {
        console.log(`dispute detected`);
        joinedChats.get(messageData.chatID).peerIgnored = new Map(JSON.parse(messageData.peerIgnored));
        console.log(joinedChats.get(messageData.chatID).peerIgnored);
        disableChatMods(messageData.chatID, true);
        getIgnored([JSON.parse(messageData.dispute)], messageData.chatID);

    } else {
        if (joinedChats.get(messageData.chatID).members.includes(pk)) {
            joinedChats.get(messageData.chatID).members.splice(joinedChats.get(messageData.chatID).members.indexOf(pk), 1);
        }
        joinedChats.get(messageData.chatID).exMembers.add(pk);
    }

    updateChatInfo();
}

async function refreshChatWindow (chatID) {
    if (chatID === currentChatID) {
        chatWindow.innerHTML = '<div id="anchor" style="overflow-anchor: auto; height: 1px" ></div>';
        store.get(currentChatID).history.forEach(data => {
            updateChatWindow(data);
        });
    }
}

export function updateChatWindow (data) {
    // data: JSON
    if (data.chatID === currentChatID) {
        const message = document.createElement('p');
        message.className = "chat-message";
        switch (data.type) {
            case "create":
                message.innerHTML = `[${formatDate(data.sentTime)}] chat created by ${data.from}`;
                break;
            case "text":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${data.from}: ${data.message}`;
                break;
            case "add":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${data.pk1} added ${data.pk2}`;
                break;
            case "remove":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${data.pk1} removed ${data.pk2}`;
                break;
            case "setup":
                message.innerHTML = `[${formatDate(data.sentTime)}] $setup ${data.n}`;
                break;
            case "ignored":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${data.from} chose to ignore '${data.op}'`;
                break;
            default:
                break;
        }
        chatWindow.insertBefore(message, chatWindow.lastElementChild);
    }
}


function sendToMember(data, pk) {
    // data: JSON, pk: String
    if (pk == localUsername) {
        return receivedSMessage(data);
    }
    console.log(`sending ${JSON.stringify(data.type)}   to ${pk}`);
    sendToServer(data);
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
    var data;
    if (messageInput.slice(0, 6) == "$setup") {
        const cmd = messageInput.split(" ");
        data = addMsgID({
            type: "setup",
            n: cmd[1]
        });
    } else {
        data = addMsgID({
            type: "text",
            from: localUsername,
            message: messageInput,
            chatID: currentChatID
        });
    }

    broadcastToMembers(data, currentChatID);
}


/////////////////////
// Event Listeners //
/////////////////////

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


addUserBtn.addEventListener("click", async () => {
    if (currentChatID === 0) { console.alert(`Please select a chat`); return; }
    const username = addUserInput.value;
    try {
        addUserInput.value = "";
        // as long as you are in some universe
        addToChat([username], currentChatID);
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

        if (conflict) {
            disabledChatBar.style.display = "none";
            conflictChatBar.style.display = "flex";
            document.getElementById('conflictCardList').style.display = "flex";

        } else {
            disabledChatBar.style.display = "flex";
            conflictChatBar.style.display = "none";
            document.getElementById('conflictCardList').style.display = "none";
        }

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
    joinedChats.get(currentChatID).currentMember = true;
    joinedChats.get(currentChatID).toDispute = null;
    updateChatInfo();
});

acceptRemovalBtn.addEventListener("click", async () => {
    console.log(`toDispute cleared`);
    joinedChats.get(currentChatID).toDispute = null;
    updateChatInfo();
});

const optionTemplate = document.getElementById('optionTemplate');
const conflictCardTemplate = document.getElementById('conflictCardTemplate');

function generateConflictCard (ops, chatID) {
    // op.sig mapped to op: Object of Arr, mem mapped to String of joined members
    var option, button;
    var card = conflictCardTemplate.cloneNode(true);
    card.id = "card123";

    for (const op of ops) {
        option = optionTemplate.cloneNode(true);
        option.id = "";

        option.getElementsByTagName("h3")[0].innerHTML = `${op.pk1} ${op.action}s ${op.pk2}`;
        const p = option.getElementsByTagName("p")[0];

        const mems = [op.pk2];
        joinedChats.get(chatID).peerIgnored.forEach((value, key) => {
            if (value === op.pk2 && !mems.includes(key)) {
                mems.push(key);
            }
        });

        p.innerHTML = `↪ Members: ${mems.join(", ")}`;
        p.id = `p${op.pk2}`;

        button = option.getElementsByTagName("button")[0];
        button.addEventListener("click", async () => { 
            await selectIgnored(op, currentChatID);
            conflictCardList.removeChild(document.getElementById('card123'));
        });
        card.appendChild(option);
    }

    return card;
}

var resolveGetIgnored = new Map();

async function getIgnored(cycles, chatID) {

    return new Promise(async (resolve) => { 
        resolveGetIgnored.set(chatID, [cycles, resolve]); 

        for (const cycle of cycles) {
            const removeSelfIndex = cycle.findLastIndex((op) => op.action === "remove" && arrEqual(op.pk2, localUsername));
            if (removeSelfIndex > -1) {
                await selectIgnored(cycle.at(removeSelfIndex), chatID);
                continue;
            }
        }

        if (chatID == currentChatID && resolveGetIgnored.has(chatID)) {
            document.getElementById('chatBar').style.display = "none";
            updateChatInfo();
        }
    });
}

export async function selectIgnored (ignoredOp, chatID) {
    sendToServer({
        type: "selectedIgnored",
        op: ignoredOp
    })
    const chatInfo = store.get(chatID);
    // unwinding chat history
    const ignoredOpIndex = chatInfo.history.findIndex(msg => msg.type == ignoredOp.action && msg.pk1 === ignoredOp.pk1);

    if (ignoredOpIndex > -1) {
        console.log(`found ignored op`);
        const rem = chatInfo.history.splice(ignoredOpIndex);
        chatInfo.history = chatInfo.history.concat(rem.filter(msg => msg.type == "ignored"));
    }

    const msg = addMsgID({ type: "ignored", op: `${ignoredOp.pk1} ${ignoredOp.action}s ${ignoredOp.pk2}`, from: localUsername, chatID: chatID });
    chatInfo.history.push(msg);

    const pa = document.getElementById(`p${ignoredOp.pk2}`);
    const toAdd = pa.innerHTML.slice(11).split(", ");
    toAdd.forEach(mem => {
        if (!joinedChats.get(chatID).members.includes(mem)) {
            joinedChats.get(chatID).members.push(mem);
        }
        joinedChats.get(chatID).exMembers.delete(mem);
    });

    const pr = document.getElementById(`p${ignoredOp.pk1}`);
    const toRemove = pr.innerHTML.slice(11).split(", ");
    toRemove.forEach(mem => {
        if (joinedChats.get(chatID).members.includes(mem)) {
            joinedChats.get(chatID).members.splice(joinedChats.get(chatID).members.indexOf(mem), 1);
        }
        joinedChats.get(chatID).exMembers.add(mem);
    });

    updateChatInfo();
    refreshChatWindow(chatID);

    resolveGetIgnored.get(chatID)[0].splice(0, 1);

    if (resolveGetIgnored.get(chatID)[0].length == 0) {
        resolveGetIgnored.get(chatID)[1](chatInfo.metadata.ignored);
        resolveGetIgnored.delete(chatID);
        chatBox.className = "chat-panel col-8";
        enableChatMods(chatID);
    }
}

export function updateChatInfo () {
    if (currentChatID > 0) {
        document.getElementById('chatTitle').innerHTML = joinedChats.get(currentChatID).chatName;

        memberList.innerHTML = "";
        joinedChats.get(currentChatID).members.forEach((pk) => {
            if (pk === localUsername) {
                const card = elem.generateUserCard(pk, pk, currentChatID);
                card.className = `card self`;
                memberList.insertBefore(card, memberList.firstElementChild);
            } else {
                memberList.appendChild(elem.generateUserCard(pk, pk, currentChatID));
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
                conflictCardList.appendChild(generateConflictCard(cycle, currentChatID));
            });
        };
    }
}

export async function selectChat(chatID) {
    currentChatID = chatID;
    chatInfo.style.display = "none";
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
    if (username == "tester" || username == "overlord") {
        localUsername = username;
        sendToServer({
            type: "login",
            name: username,
        });
    } else {
        alert("please enter a valid username");
        loginInput.value = "";
    }
});


///////////
// UTILS //
///////////


async function mergeChatHistory (chatID, receivedMsgs) {
    await navigator.locks.request("history", async () => {
        const chatInfo = store.get(chatID);
        const localMsgs = chatInfo.history;
        console.log(`local length ${localMsgs.length}`);
        console.log(`received length ${receivedMsgs.length}`);
        var newMessage = false;

        if (receivedMsgs.length > 0) {
            const mergedChatHistory = [...localMsgs];
            
            const localMsgIDs = new Set(localMsgs.map(msg => msg.id));
            for (const msg of receivedMsgs) {
                console.log(`msg ${msg.type}`);
                if (!localMsgIDs.has(msg.id)) { // if we don't have this message
                    mergedChatHistory.push(msg);
                    newMessage = true;

                    if (msg.type === "text") { continue; }
                }
            }

            mergedChatHistory.sort((a, b) => {
                if (a.sentTime > b.sentTime) { return 1; }
                if (a.sentTime < b.sentTime) { return -1; }
                if (a.username > b.username) { return 1; }
                else { return -1; } // (a[1].username <= b[1].username) but we know it can't be == and from the same timestamp
            });
            chatInfo.history = mergedChatHistory;


            await refreshChatWindow(chatID);
            if (newMessage && chatID !== currentChatID && document.getElementById(`chatCard${chatID}`) !== null) { 
                document.getElementById(`chatCard${chatID}`).className = "card card-chat notif";
            }
        }
    });
}
