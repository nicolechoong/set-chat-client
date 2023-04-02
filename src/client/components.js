import { keyMap, selectChat, removeFromChat, selectIgnored } from './client.js';

const createPopup = document.getElementById('createPopup');
const loginPopup = document.getElementById('loginPopup');
const dim = document.getElementById('dim');

const chatInfo = document.getElementById('chatInfo');
const chatNameInput = document.getElementById('chatNameInput');

const chatCardTemplate = document.getElementById('chatCardTemplate');
const userCardTemplate = document.getElementById('userCardTemplate');
const conflictCardTemplate = document.getElementById('conflictCardTemplate');
const optionTemplate = document.getElementById('optionTemplate');


export function generateChatCard (chatID, chatName) {
    const cardCopy = chatCardTemplate.cloneNode(true);
    cardCopy.id = `chatCard${chatID}`;
    cardCopy.className = `card card-chat`
    chatCardTemplate.insertAdjacentElement("afterend", cardCopy);

    const card = document.getElementById(`chatCard${chatID}`);
    card.addEventListener("click", () => selectChat(chatID));

    const h3 = card.childNodes[1];
    const text = document.createTextNode(chatName);
    h3.appendChild(text);

    return card;
}

export function generateUserCard (pk, username, chatID) {
    var card = userCardTemplate.cloneNode(true);
    card.id = `userCard${username}`;

    const h3 = card.childNodes[1];
    const text = document.createTextNode(username);
    h3.appendChild(text);

    const button = card.getElementsByClassName("removeUserBtn")[0];
    button.addEventListener("click", () => {
        removeFromChat(username, pk, chatID);
    });

    return card;
}

export function generateConflictCard (ops) {
    // op.sig mapped to op: Object of Arr, mem mapped to String of joined members
    var option, button;
    var card = conflictCardTemplate.cloneNode(true);
    card.id = "";

    for (const [sig, info] of ops) {
        option = optionTemplate.cloneNode(true);
        option.id = "";

        option.getElementsByTagName("h3")[0].innerHTML = `${keyMap.get(JSON.stringify(info.op.pk1))} ${info.op.action}s ${keyMap.get(JSON.stringify(info.op.pk2))}`;
        const p = option.getElementsByTagName("p")[0];
        p.innerHTML = `↪ Members: ${info.mems}`;
        p.id = `p${sig}`;

        button = option.getElementsByTagName("button")[0];
        button.addEventListener("click", async () => { 
            await selectIgnored(info.op);
            card.parentNode.removeChild(card);
        });
        card.appendChild(option);
    }

    return card;
}

export function updateSelectedMembers (username, sig) {
    const p = document.getElementById(`p${sig}`);
    if (p !== null) {
        const cur = p.innerHTML.split(", ");
        if (!cur.includes(username)) { 
            p.innerHTML = `${p.innerHTML}, ${username}`;
        }
    }
}

document.getElementById('createChatBtn').onclick = (() => {
    createPopup.style.display = "flex";
    chatNameInput.focus();
    chatNameInput.select();
});

document.getElementById('showChatInfoBtn').onclick = (() => {
    chatInfo.style.display = chatInfo.style.display === "flex" ? "none" : "flex";
});

document.getElementById('closeChatInfo').onclick = (() => {
    chatInfo.style.display = "none";
});

[...document.getElementsByClassName('close-popup')].map((elem) => {
    elem.onclick = closePopup;
});

export function closePopup () {
    if (loginPopup.style.display === "none" && createPopup.style.display === "flex") {
        dim.style.display = "none";
        createPopup.style.display = "none";
    }
}