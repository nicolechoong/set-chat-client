import { createRoot } from 'react-dom/client';

function ChatCard (props) {
    /* props: chatID, chatname, newMessage: bool */
    return (
        <div id={`card${props.chatID}`} class="card-chat">
            <button>
                <h3>{props.chatname}</h3>
            </button>
        </div>
    );
}

function ChatCardList (props) {
    /* props: list of chatID, chatname, newMessage */
    return (
        <div class="chatCardList">
            {props.chatInfo((prop) => <ChatCard chatID={prop.chatID} chatname={prop.chatname} />)}
        </div>
    );
}

const domNode = document.getElementById('chatCardList');
const root = createRoot(domNode);
const test = [
    {chatID: 1, chatname: 'hello', newMessage: false},
    {chatID: 2, chatname: 'hi', newMessage: false},
]
root.render(<ChatCardList chatInfo={test}/>);
