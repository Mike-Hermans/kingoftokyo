var io;
var gameSocket;

/**
 * This function is called by index.js to initialize a new game instance.
 *
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client.
 */
exports.initGame = function(sio, socket){
    io = sio;
    gameSocket = socket;
    gameSocket.emit('connected', { message: "You are connected!" });

    // Host Events
    gameSocket.on('hostCreateNewGame', hostCreateNewGame);
    gameSocket.on('hostRoomFull', hostPrepareGame);
    gameSocket.on('hostPreparedTurn', hostPreparedTurn);
    gameSocket.on('hostCheckAllPlayersDefended', hostCheckAllPlayersDefended);

    // Player Events
    gameSocket.on('playerJoinGame', playerJoinGame);
    gameSocket.on('playerEndTurn', playerEndTurn);
    gameSocket.on('playerConfirmedDice', playerConfirmedDice);
    gameSocket.on('playerEndDefending', playerEndedDefending);
    gameSocket.on('tokyoTakeOver', tokyoTakeOver);
    gameSocket.on('playerBuysCard', playerBuysCard);
};

/* *******************************
   *                             *
   *       HOST FUNCTIONS        *
   *                             *
   ******************************* */

/**
 * The 'START' button was clicked and 'hostCreateNewGame' event occurred.
 */
function hostCreateNewGame() {
    // Create a unique Socket.IO Room
    var thisgameID = ( Math.random() * 100000 ) | 0;

    // Return the Room ID (gameID) and the socket ID (socketId) to the browser client
    this.emit('newGameCreated', {gameID: thisgameID, socketId: this.id});

    // Join the Room and wait for the players
    this.join(thisgameID.toString());
}

/**
 * Two players have joined. Alert the host!
 * @param gameID The game ID / room ID
 */
function hostPrepareGame(gameID) {
    var sock = this;
    var data = {
        socketId : sock.id,
        gameID : gameID
    };
    io.sockets.in(data.gameID).emit('beginNewGame', data);
}

function hostPreparedTurn(data) {
    var sock = this;
    var newdata = {
        socketId : sock.id,
        gameID : data.gameID,
        currentTurnID: data.currentTurnID
    };
    io.sockets.in(newdata.gameID).emit('playerStartTurn', newdata);
}

function hostCheckAllPlayersDefended(data) {
    io.sockets.in(data.gameID).emit('allPlayersDefended', data);
}

/* *****************************
   *                           *
   *     PLAYER FUNCTIONS      *
   *                           *
   ***************************** */

/**
 * A player clicked the 'START GAME' button.
 * Attempt to connect them to the room that matches
 * the gameID entered by the player.
 * @param data Contains data entered via player's input - playerName and gameID.
 */
function playerJoinGame(data) {
    // A reference to the player's Socket.IO socket object
    var sock = this;

    // Look up the room ID in the Socket.IO manager object.
    var room = gameSocket.manager.rooms["/" + data.gameID];

    // If the room exists...
    if( room != undefined ){
        // attach the socket id to the data object.
        data.socketId = sock.id;

        // Join the room
        sock.join(data.gameID);

        // Emit an event notifying the clients that the player has joined the room.
        io.sockets.in(data.gameID).emit('playerJoinedRoom', data);

    } else {
        // Otherwise, send an error message back to the player.
        this.emit('error',{message: "This room does not exist."} );
    }
}

/* *************************
   *                       *
   *      GAME LOGIC       *
   *                       *
   ************************* */
function playerEndTurn(data) {
    io.sockets.in(data.gameID).emit('hostHandleEndTurn', data);
}

function playerConfirmedDice(data) {
    io.sockets.in(data.gameID).emit('playerRolledDice', data);
}

function playerEndedDefending(data) {
    io.sockets.in(data.gameID).emit('playerEndedDefending', data);
}

function tokyoTakeOver(data) {
    io.sockets.in(data.gameID).emit('playerTokyoTakeover', data);
}

function playerBuysCard(data) {
    io.sockets.in(data.gameID).emit('playerBoughtCard', data);
}