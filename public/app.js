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

            IO.socket.on('hostHandleEndTurn', IO.hostCheckEndTurn);
            IO.socket.on('playerRolledDice', IO.hostCheckDiceRoll);

            IO.socket.on('playerStartTurn', IO.playerCheckStartTurn);
            IO.socket.on('playerEndedDefending', IO.playerCheckDefendEnd);
            IO.socket.on('allPlayersDefended', IO.allPlayersDefended);
            IO.socket.on('playerTokyoTakeover', IO.checkTokyoTakeover);
        },

        /**
         * The client is successfully connected!
         */
        onConnected : function() {
            // Cache a copy of the client's socket.IO session ID on the App
            App.socketId = IO.socket.socket.sessionid;
        },

        // gameData object
        gameData: {},

        /**
         * A new game has been created and a random game ID has been generated.
         * @param data {{ gameID: int, socketId: * }}
         */
        onNewGameCreated : function(data) {
            App.Host.gameInit(data);
        },

        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameID: int, socketId: int}}
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

        hostCheckEndTurn: function(data) {
            if (App.myRole == "Host") {
                App.Host.playerEndedTurn(data);
            }
        },

        hostCheckDiceRoll: function(data) {
            App[App.myRole].playerRolledDice(data);
        },

        playerCheckStartTurn: function(data) {
            if (App.myRole == "Player") {
                App.Player.startTurn(data);
            }
        },

        playerCheckDefendEnd: function(data) {
            if (App.myRole == "Host") {
                App.Host.playerDefended(data);
            }
        },

        allPlayersDefended: function(data) {
            App[App.myRole].allPlayersDefended(data);
        },

        checkTokyoTakeover: function(data) {
            App.currentlyInTokyo = data.socketId;
        },

        /**
         * An error has occurred.
         * @param data
         */
        error : function(data) {
            alert(data.message);
        }
    };

    var App = {

        /**
         * Keep track of the gameID, which is identical to the ID
         * of the Socket.IO Room used for the players and host to communicate
         *
         */
        gameID: 0,

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

        /**
         * Count how many players ended their defensive turn
         */
        playersDefended: 0,

        /**
            Keep track of who is in Tokyo
         */
        currentlyInTokyo: "",

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
            App.loadGameData();
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

            App.$doc.on('click', '#actionEndTurn', App.Player.onEndturnClick);
            App.$doc.on('click', '#actionConfirmDiceRoll', App.Player.onConfirmDiceClick);
            App.$doc.on('click', '#actionEndDefending', App.Player.onEndDefendingClick);

            App.$doc.on('click', '#actionYield', App.Player.onYieldClick);
        },

        loadGameData: function() {
            $.getJSON('data/gamedata.json', function(data) {
                App.gameData = data;
            });
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
             * Keep track of the number of players that have joined the game.
             */
            numPlayersInRoom: 0,

            /**
             * data for player that currently attacks
             */
            currentTurnData: "",

            /**
             * Handler for the "Start" button on the Title Screen.
             */
            onCreateClick: function () {
                IO.socket.emit('hostCreateNewGame');
            },

            /**
             * The Host screen is displayed for the first time.
             * @param data{{ gameID: int, socketId: * }}
             */
            gameInit: function (data) {
                App.gameID = data.gameID;
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

                // Show the gameID / room id on screen
                $('#spanNewGameCode').text(App.gameID);
            },

            /**
             * Update the Host screen when the first player joins
             * @param data{{playerName: string}}
             */
            updateWaitingScreen: function(data) {
                // Update host screen
                $('#playersWaiting')
                    .append('<p/>')
                    .text(data.playerName + ' joined the game.');

                // Store the new player's data on the Host.
                App.Host.players.push(data);

                // Increment the number of players in the room
                App.Host.numPlayersInRoom += 1;

                // If two players have joined, start the game!
                if (App.Host.numPlayersInRoom === 2) {
                    // Let the server know that two players are present.
                    IO.socket.emit('hostRoomFull',App.gameID);
                }
            },

            /**
             * Prepare the game field
             */
            gameSetup : function() {
                // Prepare the game screen with new HTML
                App.$gameArea.html(App.$hostGame);

                App.Host.updateGamefield(false);

                var data = {
                    gameID: App.gameID,
                    currentTurnID: App.Host.players[App.currentPlayer].socketId
                };

                IO.socket.emit("hostPreparedTurn", data);
            },

            updateGamefield: function(updateMessage) {
                // Display the players' names data on screen

                // First data value: DOM-selector
                // second value: App.Host.players[id].{property}
                var data = [
                    ['.playerName', 'playerName'],
                    ['.playerHP', 'hp'],
                    ['.playerVP', 'vp'],
                    ['.playerEnergy', 'energy']
                ];

                $.each(App.Host.players, function (playerIndex, player) {
                    $.each(data, function(dataIndex, data) {
                        $('#player_' + playerIndex)
                            .find(data[0])
                            .html(App.Host.players[playerIndex][data[1]]);
                    });

                    if (playerIndex == App.currentPlayer) {
                        $(".current-turn-shadow").removeClass("current-turn-shadow");
                        $("#player_" + playerIndex).addClass("current-turn-shadow");
                    }
                });

                if (updateMessage) {
                    $("#hostStatusCollection").prepend('<li class="collection-item">'+updateMessage+'</li>');
                }
            },

            playerRolledDice: function(data) {
                // Manage data for the player that rolled
                var messages = [];
                var completeMessage = "";
                var damage = 0;
                var attackingPlayerIsInTokyo;

                $.each(App.Host.players, function( index, player) {
                    if (player.socketId == data.playerID) {
                        // If player is in Tokyo City, give 'em points
                        if (player.isInTokyoCity) {
                            player.vp += 2;
                            messages.push("gains 2 victory points from Tokyo City");
                        }

                        // Victory points rolls
                        var victorypoints = 0;
                        if (data.diceresult.one >= 3) {
                            victorypoints += 1 + (data.diceresult.one - 3);
                        }
                        if (data.diceresult.two >= 3) {
                            victorypoints += 2 + (data.diceresult.two - 3);
                        }
                        if (data.diceresult.three >= 3) {
                            victorypoints += 3 + (data.diceresult.three - 3);
                        }

                        if (victorypoints > 0) {
                            player.vp += victorypoints;

                            var s = "";
                            var gains = "";
                            if (victorypoints > 1) {
                                s = "s";
                            }
                            if (!player.isInTokyoCity) {
                                gains = "gains ";
                            }

                            messages.push(gains + victorypoints + " victory point" + s + " from a dice roll");
                        }

                        // Energy
                        player.energy += parseInt(data.diceresult.energy);

                        if (!player.isInTokyoCity) {
                            for (var i = 0; i < data.diceresult.heart; i++) {
                                if (player.hp < player.maxhp) {
                                    player.hp++;
                                }
                            }
                        }

                        damage = parseInt(data.diceresult.damage);
                        attackingPlayerIsInTokyo = player.isInTokyoCity;

                        if ($("#tokyo-city").html() == "" && damage > 0) {
                            player.isInTokyoCity = true;
                            $("#tokyo-city").html(player.playerName).data("id", player.socketId);
                            damage = 0;
                            player.vp++;

                            IO.socket.emit("tokyoTakeOver", player);
                        }

                        for (var i = 0; i < messages.length; i++) {
                            if (i == 0) {
                                completeMessage += player.playerName + " " + messages[i];
                                if (messages.length == 1) {
                                    completeMessage += ".";
                                }
                            } else {
                                if (i == messages.length - 1) {
                                    completeMessage += " and " + messages[i] + ".";
                                } else {
                                    completeMessage += ", " + messages[i];
                                }
                            }
                        }

                        if (completeMessage == "") {
                            completeMessage = player.playerName + " didn't do a lot of things";
                        }

                        App.Host.currentTurnData = {
                            playerName: player.playerName,
                            playerID: player.socketId,
                            damage: damage,
                            yield: ""
                        }
                    }
                });

                App.Host.updateGamefield(completeMessage);
            },

            allPlayersDefended: function(data) {
                var turndata = App.Host.currentTurnData;

                if (turndata.damage > 0) {
                    if (turndata.playerID == App.currentlyInTokyo) {
                        // Deal damage to everyone
                        $.each(App.Host.players, function(index, player) {
                            if (player.socketId != turndata.playerID) {
                                player.hp -= turndata.damage;
                                App.Host.updateGamefield(player.playerName + " takes " + turndata.damage + " damage");
                            }
                        });
                    } else {
                        // Someone attacks Tokyo
                        $.each(App.Host.players, function(index, player) {
                            if (player.socketId == App.currentlyInTokyo) {
                                // This player gets attacked
                                player.hp -= turndata.damage;
                                App.Host.updateGamefield(player.playerName + " takes " + turndata.damage + " damage");
                            }
                        });

                        if (turndata.yield != "") {
                            $.each(App.Host.players, function(index, player) {
                                if (player.socketId == turndata.yield) {
                                    player.isInTokyoCity = false;
                                    App.Host.updateGamefield(player.playerName + " leaves Tokyo City!");
                                } else if (player.socketId == turndata.playerID) {
                                    player.isInTokyoCity = true;
                                    IO.socket.emit("tokyoTakeOver", player);
                                    App.Host.updateGamefield(player.playerName + " takes over!");
                                    player.vp++;
                                    $("#tokyo-city").html(player.playerName);
                                }
                            });
                        }
                    }
                }
            },

            playerEndedTurn: function(data) {
                if (App.currentPlayer == App.Host.players.length - 1) {
                    App.currentPlayer = 0;
                } else {
                    App.currentPlayer++;
                }
                App.Host.updateGamefield(data.playerName + " ended the turn");

                var newdata = {
                    gameID: App.gameID,
                    currentTurnID: App.Host.players[App.currentPlayer].socketId
                };

                IO.socket.emit("hostPreparedTurn", newdata);
            },
            
            playerDefended: function(data) {
                App.playersDefended++;

                if (data.action == "yield") {
                    App.Host.currentTurnData.yield = data.playerID;
                }
                
                if (App.playersDefended == App.Host.players.length - 1) {
                    // All players have defended,reset counter to 0 and continue game
                    App.playersDefended = 0;
                    IO.socket.emit("hostCheckAllPlayersDefended", App.Host.players[App.currentPlayer]);
                }
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
             * The player entered their name and gameID (hopefully)
             * and clicked Start.
             */
            onPlayerStartClick: function() {
                // collect data to send to the server
                var data = {
                    gameID : +($('#inputgameID').val()),
                    playerName : $('#inputPlayerName').val() || 'noob',
                    hp: 20,
                    vp: 0,
                    energy: 0,
                    maxhp: 20,
                    isInTokyoCity: false,
                    cards: [],
                    hasCard: function(cardToFind) {
                        $.each(this.cards, function(index, card) {
                            if (card.title == cardToFind) {
                                return true;
                            }
                        });
                        return false;
                    }
                };

                // Send the gameID and playerName to the server
                IO.socket.emit('playerJoinGame', data);

                // Set the appropriate properties for the current player.
                App.myRole = 'Player';
                App.Player.myName = data.playerName;
            },
            
            onConfirmDiceClick: function() {
                var data = App.Player.getPlayerData();

                // Get dice data
                data.diceresult = {
                    one: $("#inputDice1").val() || 0,
                    two: $("#inputDice2").val() || 0,
                    three: $("#inputDice3").val() || 0,
                    damage: $("#inputDiceDamage").val() || 0,
                    heart: $("#inputDiceHeart").val() || 0,
                    energy: $("#inputDiceEnergy").val() || 0
                };

                $(".inputDiceValue").val("");

                IO.socket.emit('playerConfirmedDice', data);
            },

            onEndturnClick: function() {
                $(".playGameWrapper").addClass("hidden");
                IO.socket.emit('playerEndTurn', App.Player.getPlayerData());
            },

            onEndDefendingClick: function() {
                $(".defendbutton").addClass("hidden");
                var data = App.Player.getPlayerData();
                data.action = 'endDefending';
                IO.socket.emit('playerEndDefending', data);
            },

            onYieldClick: function() {
                $(".defendbutton").addClass("hidden");
                var data = App.Player.getPlayerData();
                data.action = 'yield';
                IO.socket.emit('playerEndDefending', data);
            },

            /**
             * Display the waiting screen for player 1
             * @param data
             */
            updateWaitingScreen : function(data) {
                if(IO.socket.socket.sessionid === data.socketId){
                    App.myRole = 'Player';
                    App.gameID = data.gameID;

                    $('#playerWaitingMessage')
                        .append('<p/>')
                        .text('Joined Game ' + data.gameID + '. Please wait for game to begin.');
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
                $('#gameID').html(hostData.gameID);
                $('#playerName').html(App.Player.myName);
            },

            startTurn: function(data) {
                // Check if current turn is players turn
                var playerData = App.Player.getPlayerData();
                if (data.currentTurnID == playerData.playerID) {
                    $(".rollDiceWrapper").removeClass("hidden");
                    $(".defendGameWrapper").addClass("hidden");
                }
            },

            getPlayerData: function() {
                return {
                    gameID : $('#gameID').html(),
                    playerID : $('#playerID').html(),
                    playerName: $("#playerName").html()
                };
            },

            playerRolledDice: function(data) {
                // If current player is not the one that rolled
                var player = App.Player.getPlayerData();
                if (player.playerID != data.playerID) {
                    var actions = 0;
                    var defend = $(".defendGameWrapper");
                    // If player can do actions, show the defending wrapper
                    defend.removeClass("hidden");

                    if (player.playerID == App.currentlyInTokyo) {
                        actions++;
                        $("#actionYield").removeClass("hidden");
                    }

                    // Else, just emit that we're done.
                    if (actions == 0) {
                        IO.socket.emit('playerEndDefending', App.Player.getPlayerData());
                    }
                }
            },

            allPlayersDefended: function(data) {
                var player = App.Player.getPlayerData();
                if (player.playerID == data.socketId) {
                    $(".rollDiceWrapper").addClass("hidden");
                    $(".playGameWrapper").removeClass("hidden");
                } else {
                    $(".defendGameWrapper").addClass("hidden");
                }
            }
        }
    };

    IO.init();
    App.init();

}($));
