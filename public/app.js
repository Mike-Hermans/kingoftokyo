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
            IO.socket.on('playerBoughtCard', IO.hostCheckPlayerBoughtCard);
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

        hostCheckPlayerBoughtCard: function(data) {
            if (App.myRole == "Host") {
                App.Host.playerBoughtCard(data);
            }
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

            // Defender actions
            App.$doc.on('click', '#actionYield', App.Player.onYieldClick);
            App.$doc.on('click', '#actionPurchaseCard', App.Player.onPurchaseCardClick);

            // Buying cards
            App.$doc.on('click', '#buyCardAccept', App.Player.onBuyCardAcceptClick);
            App.$doc.on('click', '#buyCardDeny', App.Player.onBuyCardDenyClick);

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
                data.hasCard = function(cardToFind) {
                    var cardFound = false;
                    $.each(this.cards, function(index, card) {
                        // Trim the strings because fuck you apparently
                        if ($.trim(card) == $.trim(cardToFind)) {
                            cardFound = true;
                        }
                    });

                    return cardFound;
                };
                data.calculateDamage = function(damage) {
                    if (this.hasCard("were only making it stronger")) {
                        if (damage >= 2) {
                            this.energy++;
                        }
                    }

                    if (this.hasCard("armor plating") && damage == 1) {
                        damage = 0;
                    }

                    return damage;
                };
                data.takeDamage = function(damage) {
                    this.hp -= calculateDamage(damage);
                };
                data.heal = function(heal) {
                    if (heal > 0) {
                        heal++;
                    }

                    if (!this.isInTokyoCity) {
                        for (var i = 0; i < heal; i++) {
                            if (this.hasCard("regeneration")) {
                                heal++;
                            }
                            if (this.hp < this.maxhp) {
                                this.hp++;
                            }
                        }
                    }
                };
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
                    var playerData = $("#player_" + playerIndex);
                    $.each(data, function(dataIndex, data) {
                        playerData
                            .find(data[0])
                            .html(App.Host.players[playerIndex][data[1]]);
                    });

                    var cardsCollection = playerData.find(".player_cards");
                    cardsCollection.html('<li class="collection-header">Powerups</li>');

                    $.each(player.cards, function(index, card) {
                        cardsCollection.append('<li class="collection-item">' + card + '</li>');
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

                        damage = parseInt(data.diceresult.damage);

                        // Victory points rolls
                        var victorypoints = 0;
                        if (data.diceresult.one >= 3) {
                            victorypoints += 1 + (data.diceresult.one - 3);

                            if (player.hasCard("gourmet")) {
                                victorypoints+=2;
                            }
                        }
                        if (data.diceresult.two >= 3) {
                            victorypoints += 2 + (data.diceresult.two - 3);

                            if (player.hasCard("poison quills") && damage > 0) {
                                damage += 2;
                            }
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
                        var energyCount = parseInt(data.diceresult.energy);
                        if (player.hasCard("solar powered") && player.energy == 0 && energyCount == 0) {
                            energyCount = 1;
                        }
                        if (energyCount > 0) {
                            if (player.hasCard("friend of children")) {
                                energyCount++;
                            }
                            player.energy += energyCount;
                            messages.push("generates " + energyCount + " energy");
                        }

                        // Heal
                        player.heal(data.diceresult.heart);

                        // Damage
                        if (player.hasCard("acid attack")) {
                            damage++;
                        }

                        if (damage >= 1 && player.hasCard("spiked tail")) {
                            damage++;
                        }

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
                                player.takeDamage(turndata.damage);
                                App.Host.updateGamefield(player.playerName + " takes " + turndata.damage + " damage");
                            }
                        });
                    } else {
                        // Someone attacks Tokyo
                        $.each(App.Host.players, function(index, player) {
                            if (player.socketId == App.currentlyInTokyo) {
                                // This player gets attacked
                                player.takeDamage(turndata.damage);
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
            },

            playerBoughtCard: function(data) {
                var cardPlayed = false;

                // Check cards that benefit the executing player
                $.each(App.Host.players, function(index, player) {
                    if (player.socketId == data.playerID) {
                        switch (data.card.title) {
                            case "jet fighters":
                                player.takeDamage(4);
                                player.vp += 5;
                                App.Host.updateGamefield(player.playerName + " activated Jet Fighters! He took 4 damage and received 5 Victory Points.");
                                cardPlayed = true;
                                break;
                            case "nuclear powerplant":
                                player.heal(3);
                                player.vp += 2;
                                App.Host.updateGamefield(player.playerName + " activated Nuclear Powerplant. Received 2 Victory Points and healed for 3 points");
                                cardPlayed = true;
                                break;
                            case "tanks":
                                player.takeDamage(3);
                                player.vp += 4;
                                App.Host.updateGamefield(player.playerName + " activated Tanks! Took 3 damage and received 4 Victory Points.");
                                cardPlayed = true;
                                break;
                            case "corner store":
                                player.vp += 1;
                                App.Host.updateGamefield(player.playerName + " attacked a corner store and received 1 Victory Point");
                                cardPlayed = true;
                                break;
                        }
                    }
                });

                // Cards that affect multiple players
                if (!cardPlayed) {
                    switch (data.card.title) {
                        case "fire blast":
                            $.each(App.Host.players, function(index, player) {
                                if (player.socketId != data.playerID) {
                                    player.takeDamage(2);
                                }
                            });
                            break;
                        case "high altitude bombing":
                            $.each(App.Host.players, function(index, player) {
                                player.takeDamage(3);
                            });
                            break;
                        case "gas refinery":
                            $.each(App.Host.players, function(index, player) {
                                if (player.socketId == data.playerID) {
                                    player.vp += 2;
                                } else {
                                    player.takeDamage(3);
                                }
                            });
                            break;
                        case "death from above":
                            $.each(App.Host.players, function(index, player) {
                                if (player.socketId == data.playerID) {
                                    player.vp += 2;

                                    if (!player.isInTokyoCity) {
                                        player.isInTokyoCity = true;

                                        $.each(App.Host.players, function(playerIndex, otherplayer) {
                                            if (otherplayer.isInTokyoCity) {
                                                otherplayer.isInTokyoCity = false;
                                                App.currentlyInTokyo = player.socketId;
                                                App.Host.updateGamefield(player.playerName + " takes over!");
                                                player.vp++;
                                                $("#tokyo-city").html(player.playerName);
                                            }
                                        })
                                    }
                                }
                            });
                            break;
                    }
                }

                // Card must be a Keep card
                if (!cardPlayed) {
                    $.each(App.Host.players, function(index, player) {
                        if (player.socketId == data.playerID) {
                            if (data.card.title == "even bigger") {
                                player.maxhp += 2;
                                player.hp += 2;
                            }
                            player.cards.push(data.card.title);
                            App.Host.updateGamefield(player.playerName + " purchased " + data.card.title);
                        }
                    });
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
                    gameID: +($('#inputgameID').val()),
                    playerName: $('#inputPlayerName').val() || 'noob',
                    hp: 10,
                    vp: 0,
                    energy: 0,
                    maxhp: 10,
                    isInTokyoCity: false,
                    cards: []
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
            },

            onPurchaseCardClick: function() {
                $(".playGameWrapper").addClass("hidden");
                $(".purchaseCardDiv, #actionScanCard").removeClass("hidden");

                var finderResults = false;
                var cloudRecognition = new craftar.CloudRecognition({
                    token: 'f9b09592aaff45bc'
                });
                var scanButton = $("#actionScanCard");

                cloudRecognition.addListener('results', function(err, response, xhr){
                    if (response.results && response.results.length > 0) {
                        finderResults = true;
                        cloudRecognition.stopFinder();

                        var card = response.results[0].item.name.split("|");

                        // Remove camera field
                        $("#videoCapture").html("");
                        $("#actionScanCard").addClass("hidden");
                        
                        // Show option to buy card
                        $("#cardname").html(card[0].replace(/_/g, " "));
                        $("#energy").html(card[1]);
                        $("#cardPopup").removeClass("hidden");
                    }
                });

                cloudRecognition.addListener('finderFinished', function(){
                    if (!finderResults) {
                        //alert("No results found, point to an object.");
                        cloudRecognition.stopFinder();

                        var card = ["acid_attack", 6];

                        // Remove camera field
                        $("#videoCapture").html("");
                        $("#actionScanCard").addClass("hidden");

                        // Show option to buy card
                        $("#cardname").html(card[0].replace(/_/g, " "));
                        $("#energy").html(card[1]);
                        $("#cardPopup").removeClass("hidden");
                    }
                });

                if ( craftar.supportsCapture() ) {
                    setupCapture(function(err, captureObject) {
                        if (err) {
                            alert("Something went wrong");
                        } else {
                            var capelem = $("#videoCapture");
                            capelem.append(captureObject.domElement);

                            scanButton.on('click', function() {
                                finderResults = false;
                                cloudRecognition.startFinder(captureObject, 2000, 3);
                            });
                        }
                    })
                }

                function setupCapture( callback ) {
                    var capture = new craftar.Capture();

                    capture.addListener('started', function() {
                        callback(null, capture);
                    });

                    capture.addListener('error', function(error) {
                        callback(error, capture);
                    });

                    capture.start();
                }
            },

            onBuyCardDenyClick: function() {
                $("#cardPopup, .purchaseCardDiv").addClass("hidden");
                $(".playGameWrapper").removeClass("hidden");
            },

            onBuyCardAcceptClick: function() {
                var data = App.Player.getPlayerData();
                data.card = {
                    title: $("#cardname").html(),
                    cost: $("#energy").html()
                };
                IO.socket.emit("playerBuysCard", data);
                $("#cardPopup, .purchaseCardDiv").addClass("hidden");
                $(".playGameWrapper").removeClass("hidden");
            }
        }
    };

    IO.init();
    App.init();

}($));
