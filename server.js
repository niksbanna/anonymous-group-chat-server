const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST'], 
    allowedHeaders: ['Content-Type', 'Authorization'] 
}));

const io = socketIo(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
    }
});

let users = {};
let messages = {};
let groupUsers = {}; 

Object.keys(groupUsers).forEach(group => {
    groupUsers[group] = { users: new Set(), lastMessageTime: Date.now() };
});

io.on('connection', (socket) => {

    socket.on('join', ({ company, username }) => {
        users[socket.id] = { company, username };
        socket.join(company);

        if (!groupUsers[company]) {
            groupUsers[company] = { users: new Set(), lastMessageTime: Date.now() };
        }
        groupUsers[company].users.add(username);

        if (messages[company]) {
            socket.emit('olderMessages', messages[company]);
        }

        io.to(company).emit('message', { username: 'System', message: `${username} joined the chat` });
        io.to(company).emit('activeUsers', { count: groupUsers[company].users.size, company, users: Array.from(groupUsers[company].users) });
    });

    socket.on('sendMessage', ({ company, message, username }) => {
        if (!messages[company]) {
            messages[company] = [];
        }
        messages[company].push({ username, message });
        groupUsers[company].lastMessageTime = Date.now(); 
        io.to(company).emit('message', { username, message });
    });

    socket.on('typing', ({ company, username }) => {
        socket.to(company).emit('typing', { username });
    });

    socket.on('stopTyping', ({ company, username }) => {
        socket.to(company).emit('stopTyping', { username });
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            io.to(user.company).emit('message', { username: 'System', message: `${user.username} left the chat` });

            if (groupUsers[user.company]) {
                groupUsers[user.company].users.delete(user.username);

                if (groupUsers[user.company].users.size === 0) {
                    delete groupUsers[user.company];
                    delete messages[user.company];
                    io.emit('groupRemoved', { company: user.company });
                } else {
                    io.to(user.company).emit('activeUsers', { company: user.company, users: Array.from(groupUsers[user.company].users) });
                }
            }
        }
        delete users[socket.id];
    });
});

app.get('/groups', (req, res) => {
    res.json(Object.keys(groupUsers));
});

const removeInactiveGroups = () => {
    const oneHourAgo = Date.now() - 3600000;
    Object.keys(groupUsers).forEach(group => {
        if (groupUsers[group].lastMessageTime < oneHourAgo && groupUsers[group].users.size === 0) {
            delete groupUsers[group];
            delete messages[group];
            io.emit('groupRemoved', { company: group });
        }
    });
};

setInterval(removeInactiveGroups, 3600000);

const port = 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
