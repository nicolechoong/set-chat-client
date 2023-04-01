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
    var option, h3, button, text;
    var card = conflictCardTemplate.cloneNode(true);
    card.id = "";

    for (const op of ops) {
        option = optionTemplate.cloneNode(true);
        option.id = "";

        h3 = option.childNodes[1];
        text = document.createTextNode(`${keyMap.get(JSON.stringify(op.pk1))} ${op.action}s ${keyMap.get(JSON.stringify(op.pk2))}`);
        h3.appendChild(text);

        button = option.getElementsByTagName("button")[0];
        button.addEventListener("click", async () => { 
            await selectIgnored(op);
            card.parentNode.removeChild(card);
        });
        card.appendChild(option);
    }

    return card;
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