;
jQuery(function($){    
    'use strict';

    /**
     * All the code relevant to Socket.IO is collected in the IO namespace.
     *
     * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
     */
    var IO = {

        /**
         * This is called when the page is displayed. It connects the Socket.IO client
         * to the Socket.IO server
         */
        init: function() {
            IO.socket = io.connect();
            IO.bindEvents();
        },

        /**
         * While connected, Socket.IO will listen to the following events emitted
         * by the Socket.IO server, then run the appropriate function.
         */
        bindEvents : function() {
            IO.socket.on('connected', IO.onConnected );
            IO.socket.on('newGameCreated', IO.onNewGameCreated );
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom );
            IO.socket.on('beginNewGame', IO.beginNewGame );
            IO.socket.on('error', IO.error );

            // Player action based
            IO.socket.on('hostCheckAttack', IO.hostCheckAttack);
        },

        /**
         * The client is successfully connected!
         */
        onConnected : function() {
            // Cache a copy of the client's socket.IO session ID on the App
            App.socketId = IO.socket.socket.sessionid;
        },

        /**
         * A new game has been created and a random game ID has been generated.
         * @param data {{ gameId: int, socketId: * }}
         */
        onNewGameCreated : function(data) {
            App.Host.gameInit(data);
        },

        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameId: int, socketId: int}}
         */
        playerJoinedRoom : function(data) {
            // When a player joins a room, do the updateWaitingScreen funciton.
            // There are two versions of this function: one for the 'host' and
            // another for the 'player'.
            //
            // So on the 'host' browser window, the App.Host.updateWiatingScreen function is called.
            // And on the player's browser, App.Player.updateWaitingScreen is called.
            App[App.myRole].updateWaitingScreen(data);
        },

        /**
         * Both players have joined the game.
         * @param data
         */
        beginNewGame : function(data) {
            App[App.myRole].gameSetup(data);
        },

        /**
         * An error has occurred.
         * @param data
         */
        error : function(data) {
            alert(data.message);
        },

        hostCheckAttack : function(data) {
            if(App.myRole === 'Host') {
                App.Host.playerAttacked(data);
            }
        }

    };

    var App = {

        /**
         * Keep track of the gameId, which is identical to the ID
         * of the Socket.IO Room used for the players and host to communicate
         *
         */
        gameId: 0,

        /**
         * This is used to differentiate between 'Host' and 'Player' browsers.
         */
        myRole: '',   // 'Player' or 'Host'

        /**
         * The Socket.IO socket object identifier. This is unique for
         * each player and host. It is generated when the browser initially
         * connects to the server when the page loads for the first time.
         */
        socketId: '',

        /**
         * Identifies the current round. Starts at 0 because it corresponds
         * to the array of word data stored on the server.
         */
        currentPlayer: 0,

        /* *************************************
         *                Setup                *
         * *********************************** */

        /**
         * This runs when the page initially loads.
         */
        init: function () {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();
        },

        /**
         * Create references to on-screen elements used throughout the game.
         */
        cacheElements: function () {
            App.$doc = $(document);

            // Templates
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$templateMainGame = $('#main-game-template').html();
            App.$hostGame = $('#host-game-template').html();
        },

        /**
         * Create some click handlers for the various buttons that appear on-screen.
         */
        bindEvents: function () {
            // Host
            App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);

            // Player
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnStart',App.Player.onPlayerStartClick);

            App.$doc.on('click', '#actionAttack', App.Player.onAttackClick);
            App.$doc.on('click', '#actionEndTurn', App.Player.onEndturnClick);
        },

        /* *************************************
         *             Game Logic              *
         * *********************************** */

        /**
         * Show the initial King of Tokyo Title Screen
         * (with Start and Join buttons)
         */
        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
        },


        /* *******************************
           *         HOST CODE           *
           ******************************* */
        Host : {

            /**
             * Contains references to player data
             */
            players : [],

            /**
             * Flag to indicate if a new game is starting.
             * This is used after the first game ends, and players initiate a new game
             * without refreshing the browser windows.
             */
            isNewGame : false,

            /**
             * Keep track of the number of players that have joined the game.
             */
            numPlayersInRoom: 0,

            /**
             * A reference to the correct answer for the current round.
             */
            currentCorrectAnswer: '',

            /**
             * Handler for the "Start" button on the Title Screen.
             */
            onCreateClick: function () {
                IO.socket.emit('hostCreateNewGame');
            },

            /**
             * The Host screen is displayed for the first time.
             * @param data{{ gameId: int, socketId: * }}
             */
            gameInit: function (data) {
                App.gameId = data.gameId;
                App.socketId = data.socketId;
                App.myRole = 'Host';
                App.Host.numPlayersInRoom = 0;

                App.Host.displayNewGameScreen();
            },

            /**
             * Show the Host screen containing the game URL and unique game ID
             */
            displayNewGameScreen : function() {
                // Fill the game screen with the appropriate HTML
                App.$gameArea.html(App.$templateNewGame);

                // Display the URL on screen
                $('#gameURL').text(window.location.href);

                // Show the gameId / room id on screen
                $('#spanNewGameCode').text(App.gameId);
            },

            /**
             * Update the Host screen when the first player joins
             * @param data{{playerName: string}}
             */
            updateWaitingScreen: function(data) {
                // If this is a restarted game, show the screen.
                if ( App.Host.isNewGame ) {
                    App.Host.displayNewGameScreen();
                }
                // Update host screen
                $('#playersWaiting')
                    .append('<p/>')
                    .text('Player ' + data.playerName + ' joined the game.');

                // Store the new player's data on the Host.
                App.Host.players.push(data);

                // Increment the number of players in the room
                App.Host.numPlayersInRoom += 1;

                // If two players have joined, start the game!
                if (App.Host.numPlayersInRoom === 2) {
                    // console.log('Room is full. Almost ready!');

                    // Let the server know that two players are present.
                    IO.socket.emit('hostRoomFull',App.gameId);
                }
            },

            /**
             * Show the countdown screen
             */
            gameSetup : function() {
                // Prepare the game screen with new HTML
                App.$gameArea.html(App.$hostGame);

                App.Host.updateGamefield(false);
            },

            updateGamefield: function(updateMessage) {
                // Display the players' names on screen

                // First data value: DOM-selector
                // second value: App.Host.players[id].{property}
                var data = [
                    ['.playerName', 'playerName'],
                    ['.playerHP', 'hp']
                ];

                $.each(App.Host.players, function (playerIndex, player) {
                    console.log(playerIndex);
                    $.each(data, function(dataIndex, data) {
                        $('#player_' + playerIndex)
                            .find(data[0])
                            .html(App.Host.players[playerIndex][data[1]]);
                    });
                });

                if (updateMessage) {
                    $("#hostStatusCollection").prepend('<li class="collection-item">'+updateMessage+'</li>');
                }
            },

            playerAttacked: function(data) {
                var attackingPlayer = data.playerID;

                $.each(App.Host.players, function( index, player ) {
                    if (player.socketId != attackingPlayer) {
                        player.hp -= 1;
                    }
                });

                var updateMessage = data.playerName + " attacked!";

                App.Host.updateGamefield(updateMessage);
            },

            endTurn: function(data) {

            }
        },


        /* *****************************
           *        PLAYER CODE        *
           ***************************** */

        Player : {

            /**
             * A reference to the socket ID of the Host
             */
            hostSocketId: '',

            /**
             * The player's name entered on the 'Join' screen.
             */
            myName: '',

            /**
             * Click handler for the 'JOIN' button
             */
            onJoinClick: function () {
                // Display the Join Game HTML on the player's screen.
                App.$gameArea.html(App.$templateJoinGame);
            },

            /**
             * The player entered their name and gameId (hopefully)
             * and clicked Start.
             */
            onPlayerStartClick: function() {
                // collect data to send to the server
                var data = {
                    gameId : +($('#inputGameId').val()),
                    playerName : $('#inputPlayerName').val() || 'anon',
                    hp: 20
                };

                // Send the gameId and playerName to the server
                IO.socket.emit('playerJoinGame', data);

                // Set the appropriate properties for the current player.
                App.myRole = 'Player';
                App.Player.myName = data.playerName;
            },

            onAttackClick: function() {
                var data = {
                    gameID : $('#gameID').html(),
                    playerID : $('#playerID').html(),
                    playerName: $("#playerName").html()
                };
                
                IO.socket.emit('playerAttacked', data);
            },

            onEndturnClick: function() {

            },

            /**
             * Display the waiting screen for player 1
             * @param data
             */
            updateWaitingScreen : function(data) {
                if(IO.socket.socket.sessionid === data.socketId){
                    App.myRole = 'Player';
                    App.gameId = data.gameId;

                    $('#playerWaitingMessage')
                        .append('<p/>')
                        .text('Joined Game ' + data.gameId + '. Please wait for game to begin.');
                }
            },

            /**
             * Display the main game template
             * @param hostData
             */
            gameSetup : function(hostData) {
                App.Player.hostSocketId = hostData.socketId;

                App.$gameArea.html(App.$templateMainGame);

                // Set some important variables in hidden fields
                $('#playerID').html(App.socketId);
                $('#gameID').html(hostData.gameId);
                $('#playerName').html(App.Player.myName);
            }
        }
    };

    IO.init();
    App.init();

}($));
