const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Game state
const rooms = new Map();
let waitingPlayer = null;

class GameRoom {
    constructor(player1Socket) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.players = {
            player1: {
                socket: player1Socket,
                id: player1Socket.id,
                health: 100,
                position: { x: 0, y: 10, z: 80 },
                rotation: { x: 0, y: Math.PI, z: 0 },
                wins: 0
            },
            player2: null
        };
        this.gameState = 'waiting'; // waiting, playing, round_end
        this.roundActive = false;
    }

    addPlayer2(socket) {
        this.players.player2 = {
            socket: socket,
            id: socket.id,
            health: 100,
            position: { x: 0, y: 10, z: -80 },
            rotation: { x: 0, y: 0, z: 0 },
            wins: 0
        };
        this.gameState = 'playing';
        this.roundActive = true;
    }

    getOpponent(socketId) {
        if (this.players.player1.id === socketId) {
            return this.players.player2;
        }
        return this.players.player1;
    }

    getPlayer(socketId) {
        if (this.players.player1.id === socketId) {
            return this.players.player1;
        }
        return this.players.player2;
    }

    removePlayer(socketId) {
        if (this.players.player1.id === socketId) {
            this.players.player1 = null;
        } else if (this.players.player2 && this.players.player2.id === socketId) {
            this.players.player2 = null;
        }

        // If room is empty, mark for deletion
        if (!this.players.player1 && !this.players.player2) {
            return true; // Room should be deleted
        }
        return false;
    }

    resetRound() {
        if (this.players.player1) {
            this.players.player1.health = 100;
            this.players.player1.position = { x: 0, y: 10, z: 80 };
            this.players.player1.rotation = { x: 0, y: Math.PI, z: 0 };
        }
        if (this.players.player2) {
            this.players.player2.health = 100;
            this.players.player2.position = { x: 0, y: 10, z: -80 };
            this.players.player2.rotation = { x: 0, y: 0, z: 0 };
        }
        this.roundActive = true;
    }
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Try to match with waiting player or create new room
    if (waitingPlayer && waitingPlayer.id !== socket.id) {
        // Match found!
        const room = rooms.get(waitingPlayer.roomId);
        if (room) {
            room.addPlayer2(socket);
            socket.join(room.id);

            // Notify both players
            waitingPlayer.emit('matched', {
                playerNumber: 1,
                roomId: room.id,
                opponentId: socket.id
            });

            socket.emit('matched', {
                playerNumber: 2,
                roomId: room.id,
                opponentId: waitingPlayer.id
            });

            console.log('Match created in room:', room.id);
            waitingPlayer = null;
        }
    } else {
        // Create new room and wait
        const room = new GameRoom(socket);
        rooms.set(room.id, room);
        socket.join(room.id);

        waitingPlayer = socket;
        waitingPlayer.roomId = room.id;

        socket.emit('waiting', { roomId: room.id });
        console.log('Player waiting in room:', room.id);
    }

    // Handle player movement
    socket.on('playerMove', (data) => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;

        const player = room.getPlayer(socket.id);
        if (player) {
            player.position = data.position;
            player.rotation = data.rotation;
        }

        const opponent = room.getOpponent(socket.id);
        if (opponent && opponent.socket) {
            opponent.socket.emit('opponentMove', data);
        }
    });

    // Handle shooting
    socket.on('playerShoot', (data) => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room.roundActive) return;

        const opponent = room.getOpponent(socket.id);
        if (opponent && opponent.socket) {
            opponent.socket.emit('opponentShoot', data);
        }
    });

    // Handle damage
    socket.on('playerHit', (data) => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room.roundActive) return;

        const opponent = room.getOpponent(socket.id);
        if (opponent) {
            opponent.health -= data.damage;

            if (opponent.socket) {
                opponent.socket.emit('takeDamage', {
                    damage: data.damage,
                    health: opponent.health
                });
            }

            // Check if opponent died
            if (opponent.health <= 0) {
                room.roundActive = false;
                const winner = room.getPlayer(socket.id);
                winner.wins++;

                // Notify both players
                socket.emit('roundEnd', {
                    won: true,
                    yourWins: winner.wins,
                    opponentWins: opponent.wins
                });

                if (opponent.socket) {
                    opponent.socket.emit('roundEnd', {
                        won: false,
                        yourWins: opponent.wins,
                        opponentWins: winner.wins
                    });
                }

                // Check for match end (first to 10)
                if (winner.wins >= 10) {
                    socket.emit('matchEnd', { won: true });
                    if (opponent.socket) {
                        opponent.socket.emit('matchEnd', { won: false });
                    }
                } else {
                    // Start new round after delay
                    setTimeout(() => {
                        if (room.players.player1 && room.players.player2) {
                            room.resetRound();
                            io.to(room.id).emit('newRound');
                        }
                    }, 3000);
                }
            }
        }
    });

    // Handle weapon switch
    socket.on('weaponSwitch', (data) => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;

        const opponent = room.getOpponent(socket.id);
        if (opponent && opponent.socket) {
            opponent.socket.emit('opponentWeaponSwitch', data);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        const room = findRoomBySocket(socket.id);
        if (room) {
            const opponent = room.getOpponent(socket.id);
            if (opponent && opponent.socket) {
                opponent.socket.emit('opponentLeft');
            }

            const shouldDelete = room.removePlayer(socket.id);
            if (shouldDelete) {
                rooms.delete(room.id);
                console.log('Room deleted:', room.id);
            }
        }

        // Clear waiting player if it was this socket
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
    });
});

function findRoomBySocket(socketId) {
    for (const room of rooms.values()) {
        if ((room.players.player1 && room.players.player1.id === socketId) ||
            (room.players.player2 && room.players.player2.id === socketId)) {
            return room;
        }
    }
    return null;
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);

    // Get local IP
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        for (const iface of networkInterfaces[interfaceName]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`Network: http://${iface.address}:${PORT}`);
            }
        }
    }
});
