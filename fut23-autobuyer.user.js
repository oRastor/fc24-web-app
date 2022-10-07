// ==UserScript==
// @name         FUT23 Autobuyer
// @namespace    http://tampermonkey.net/
// @version      1.6.3
// @updateURL    https://github.com/oRastor/fut23-web-app/raw/master/fut23-autobuyer.user.js
// @description  FUT23 Autobuyer
// @author       Rastor
// @co-author    Tiebe_V
// @match        https://www.easports.com/*/fifa/ultimate-team/web-app/*
// @match        https://www.ea.com/fifa/ultimate-team/web-app/*
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    window.old = {
        'utils': {
            'JS': {
                'inherits': function inherits(t, i) {
                    t.prototype = Object.create(i.prototype), Object.defineProperty(t.prototype, "constructor", {
                        value: t,
                        writable: !1,
                        enumerable: !1
                    }), t.superClass_ = i.prototype
                }
            }
        },
        'enums': {
            'SearchType': {
                ANY: "any",
                BALL: "ball",
                CLUB_INFO: "clubInfo",
                CONSUMABLES_DEVELOPMENT: "development",
                CONSUMABLES_TRAINING: "training",
                PLAYER: "player",
                STADIUM: "stadium",
                STAFF: "staff"
            }
        }
    };

    window.AB_STATUSES = {
        IDLE: "idle",
        ACTIVE: "active",
        ADJUST: "adjust"
    };

    window.autobuyerVersion = 'v1.6.3';
    window.searchCount = 0;
    window.profit = 0
    window.sellList = [];
    window.adjust = {};
    window.adjustBasePriceDetected = null;
    window.adjustSellPrice = null;
    window.adjustSearchPrice = null;
    window.searchCounts = [];
    window.autoBuyerStatus = window.AB_STATUSES.IDLE;
    window.bids = [];
    window.adjustBottomLimit = 3;
    window.adjustTopLimit = 13;
    window.adjustMinProfit = 50;
    window.tradeMode = 'buy';
    window.futInfo = 'FUT-23 Autobyer software https://github.com/oRastor/fut23-web-app';
    window.futCheck = 1875;
    window.futSearchCount = 21;

    window.initStatisics = function () {
        window.futStatistics = {
            soldItems: '-',
            unsoldItems: '-',
            activeTransfers: '-',
            availableItems: '-',
            coins: '-',
        };

        window.timers = {
            search: window.createTimeout(0, 0),
            coins: window.createTimeout(0, 0),
            transferList: window.createTimeout(0, 0),
        };
    };

    window.createTimeout = function (time, interval) {
        return {
            start: time,
            finish: time + interval,
        };
    };

    window.processor = window.setInterval(function () {
        if (window.autoBuyerStatus === window.AB_STATUSES.ACTIVE || window.autoBuyerStatus === window.AB_STATUSES.ADJUST) {
            var time = (new Date()).getTime();

            if (window.timers.search.finish === 0 || window.timers.search.finish <= time) {
                window.searchFutMarket(null, null, null);

                window.timers.search = window.createTimeout(time, window.getRandomWait());
            }

            if (window.timers.coins.finish === 0 || window.timers.coins.finish <= time) {
                window.futStatistics.coins = services.User.getUser().coins.amount.toLocaleString();

                window.timers.coins = window.createTimeout(time, 2500);
            }

            if (window.timers.transferList.finish === 0 || window.timers.transferList.finish <= time) {
                window.updateTransferList();

                window.timers.transferList = window.createTimeout(time, 30000);
            }
        } else {
            window.initStatisics();
        }

        window.updateStatistics();
    }, 500);

    window.itemName = function (data) {
        if (data.firstName !== '---') {
            return data.firstName + ' ' + data.lastName;
        }

        return data.name;
    }

    window.bidPrice = function (auction) {
        if (auction.currentBid < auction.startingBid) {
            return auction.startingBid;
        }

        return auction.currentBid;
    }

    window.getMaxSearchBid = function (min, max) {
        return Math.round((Math.random() * (max - min) + min) / 1000) * 1000;
    };

    window.prepareSearchCriteria = function(searchCriteria) {
        var minBidPriceThreshold = $('#ab_min_bid_price_threshold').val()
        var minBuyNowPriceThreshold = $('#ab_min_buy_now_threshold').val()

        this.setMaxBidPrice(window.getMaxSearchBid(10000000, 1500000))

        window.setMinBuyPrice(window.getNextPrice(searchCriteria.minBuy))
        if (searchCriteria.minBuy > minBuyNowPriceThreshold) {
            window.setMinBidPrice(window.getNextPrice(searchCriteria.minBid));
            window.setMinBuyPrice(window.getNextPrice(searchCriteria.minBid))

            if (searchCriteria.minBuy > minBuyNowPriceThreshold || searchCriteria.minBid > minBidPriceThreshold) {
                window.setMinBuyPrice(null)
                window.setMinBidPrice(null)
            }
        }

        return searchCriteria
    }

    window.searchFutMarket = function (sender, event, data) {
        if (window.autoBuyerStatus === window.AB_STATUSES.IDLE) {
            return;
        }

        services.Item.clearTransferMarketCache();
        var searchCriteria = window.prepareSearchCriteria(window.autobuyerController._viewmodel.searchCriteria)

        services.Item.searchTransferMarket(searchCriteria, 1).observe(this, (function (sender, response) {
            if (response.success) {
                writeToDebugLog('Received ' + response.data.items.length + ' items.');

                var maxPurchases = 3;
                if ($('#ab_max_purchases').val() !== '') {
                    maxPurchases = Math.max(1, parseInt($('#ab_max_purchases').val()));
                }

                response.data.items.sort(function (a, b) {
                    if (window.tradeMode === 'buy') {
                        var priceDiff = a._auction.buyNowPrice - b._auction.buyNowPrice;
                    } else {
                        var priceDiff = window.bidPrice(a._auction) - window.bidPrice(b._auction);
                    }

                    if (priceDiff != 0) {
                        return priceDiff;
                    }

                    return a._auction.expires - b._auction.expires;
                });

                for (var i = 0; i < response.data.items.length; i++) {
                    var item = response.data.items[i];
                    var auction = item._auction;
                    var buyNowPrice = auction.buyNowPrice;
                    var currentBid = window.bidPrice(auction);

                    if (auction.expires >= 60) {
                        var expires = services.Localization.localizeAuctionTimeRemaining(auction.expires);
                    } else {
                        var expires = auction.expires + ' seconds';
                    }

                    var flags = ' ';
                    if (window.bids.includes(auction.tradeId)) {
                        flags += '*';
                    }

                    if (auction.tradeOwner) {
                        flags += '+';
                    }

                    if (window.tradeMode === 'buy') {
                        writeToDebugLog(window.itemName(item._staticData) + ' [' + expires + '] ' + ' [' + auction.tradeId + '] ' + buyNowPrice + flags);
                    } else {
                        writeToDebugLog(window.itemName(item._staticData) + ' [' + expires + '] ' + ' [' + auction.tradeId + '] ' + buyNowPrice + ' (current ' + currentBid + ')' + flags);
                    }
                }

                if (window.autoBuyerStatus === window.AB_STATUSES.ACTIVE) {
                    if (window.needSetAdjustMode(response.data.items.length)) {
                        window.setAdjustMode();
                        window.adjustBasePriceDetected = true;
                    }
                }

                if (window.autoBuyerStatus === window.AB_STATUSES.ADJUST) {
                    if (!window.adjustPrice(response.data.items)) {
                        return;
                    }
                }

                for (var i = 0; i < response.data.items.length; i++) {
                    var player = response.data.items[i];
                    var auction = player._auction;

                    if (window.tradeMode === 'buy') {
                        var price = auction.buyNowPrice;
                    } else {
                        var price = window.bidPrice(auction);
                    }


                    if (price <= parseInt($('#ab_buy_price').val()) && !window.bids.includes(auction.tradeId) && --maxPurchases >= 0) {
                        if (window.tradeMode === 'buy') {
                            window.buyItem(player, price);
                        } else {
                            window.bidItem(player, price);
                        }


                        if (!window.bids.includes(auction.tradeId) && window.tradeMode === 'buy') {
                            window.bids.push(auction.tradeId);

                            if (window.bids.length > 300) {
                                window.bids.shift();
                            }
                        }
                    }
                }
            } else {
                writeToLog('Warning: Search request failed! Please, reload the page and solve the puzzle as soon as possible!');
                window.autoBuyerStatus = window.AB_STATUSES.IDLE;

                var alarmSound = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
                alarmSound.loop = true;
                alarmSound.play();
            }
        }));
    }

    window.increasePrice = function (from, to) {
        var nextPrice = window.getNextPrice(from);

        if (nextPrice >= to) {
            if (window.adjust[nextPrice] === undefined) {
                return nextPrice;
            }

            return null;
        }

        var median = from + ((to - from) / 2);
        var result = from;

        while (result < median) {
            result = window.getNextPrice(result);
        }

        return result;
    }

    window.decreaseAdjustPrice = function (from, to) {
        var previousPrice = window.getPreviousPrice(from);

        if (previousPrice <= to) {
            if (window.adjust[previousPrice] === undefined) {
                return previousPrice;
            }

            return null
        }

        var median = from - ((from - to) / 2);
        var result = from;

        while (result > median) {
            result = window.getPreviousPrice(result);
        }

        return result;
    }

    window.getNextAdjustPrice = function (from) {
        return Object.keys(window.adjust).reduce(function (result, price) {
            if (price <= from || window.adjust[price].count === 0) {
                return result;
            }

            if (!result || result > price) {
                return price;
            }

            return result;
        }, null);
    }

    window.getPreviousAdjustPrice = function (from) {
        return Object.keys(window.adjust).reduce(function (result, price) {
            if (price >= from) {
                return result;
            }

            if (!result || result < price) {
                return price;
            }

            return result;
        }, null);
    }

    window.adjustPrice = function (items) {
        var searchCriteria = window.autobuyerController._viewmodel.searchCriteria;

        var current = searchCriteria.maxBuy;
        var resultCount = items.length;

        var minPeriod = items.reduce(function (result, item) {
            if (!result || result > item._auction.expires) {
                return item._auction.expires;
            }

            return result;
        }, null);

        window.adjust[current] = {
            count: resultCount,
            expires: minPeriod
        };

        return window.adjustProcess(current);
    };

    window.adjustProcess = function (price) {
        if (price === 0) {
            price = 200;
        }

        if (window.adjust[price] === undefined) {
            writeToLog("Try set price value to " + price);
            window.setMaxBuyPrice(price);

            return false;
        }

        // if (!window.adjustBasePriceDetected) {
        //     if (window.adjust[price].count === 0) {
        //         var nextAvailablePrice = window.getNextAdjustPrice(price);
        //         if (!nextAvailablePrice) {
        //             return window.adjustProcess(window.increasePrice(price, price * 2));
        //         }
        //
        //         var nextPrice = window.increasePrice(price, nextAvailablePrice);
        //
        //         if (nextPrice) {
        //             return window.adjustProcess(nextPrice);
        //         }
        //     }
        //
        //     if (window.adjust[price].count === window.futSearchCount) {
        //         var previousAvailablePrice = window.getPreviousAdjustPrice(price);
        //         if (!previousAvailablePrice) {
        //             return window.adjustProcess(window.decreaseAdjustPrice(price, price / 2));
        //         }
        //
        //         var previousPrice = window.decreaseAdjustPrice(price, previousAvailablePrice);
        //
        //         if (previousPrice) {
        //             return window.adjustProcess(previousPrice)
        //         }
        //     }
        //
        //     window.adjustBasePriceDetected = true;
        // }

        if (!window.adjustSellPrice) {
            var minExpirePeriod = $('#ab_adjust_min_expire_period').val();

            if (window.adjust[price].expires && window.adjust[price].expires < minExpirePeriod * 60) {
                return window.adjustProcess(window.getPreviousPrice(price));
            }

            var nextPrice = window.getNextPrice(price);
            if (window.adjust[nextPrice] === undefined) {
                return window.adjustProcess(nextPrice);
            }

            if (!window.adjust[nextPrice].expires || window.adjust[nextPrice].expires > minExpirePeriod * 60) {
                return window.adjustProcess(nextPrice);
            }

            window.adjustSellPrice = price;
            writeToLog('Sell price: ' + window.adjustSellPrice);
        }

        if (!window.adjustSearchPrice) {
            if (window.adjust[price].count === window.futSearchCount) {
                return window.adjustProcess(window.getPreviousPrice(price));
            }

            window.adjustSearchPrice = price;
            writeToLog('Search price: ' + window.adjustSearchPrice);
        }

        window.completeAdjust(price);
        return true;
    }

    window.completeAdjust = function () {
        window.setMaxBuyPrice(window.adjustSearchPrice);

        $('#ab_sell_price').val(window.adjustSellPrice);

        var nonProfitPrice = window.adjustSellPrice * 0.95;
        var buyPrice = window.adjustSellPrice;

        while (nonProfitPrice - buyPrice < $('#ab_adjust_min_profit').val()) {
            buyPrice = window.getPreviousPrice(buyPrice);
        }

        $("#ab_buy_price").val(buyPrice)

        window.updateAfterTaxValue();
        writeToLog('Adjust completed! Buy Price: ' + buyPrice);
        window.autoBuyerStatus = window.AB_STATUSES.ACTIVE;
    }

    window.setMinBidPrice = function (value) {
        $('.search-prices').first().find('.ut-number-input-control')[0].value = value;

        var searchCriteria = window.autobuyerController._viewmodel.searchCriteria;
        searchCriteria.minBid = value;
    }

    window.setMaxBidPrice = function (value) {
        $('.search-prices').first().find('.ut-number-input-control')[1].value = value;

        var searchCriteria = window.autobuyerController._viewmodel.searchCriteria;
        searchCriteria.maxBid = value;
    }

    window.setMinBuyPrice = function (value) {
        $('.search-prices').first().find('.ut-number-input-control')[2].value = value;

        var searchCriteria = window.autobuyerController._viewmodel.searchCriteria;
        searchCriteria.minBuy = value;
    }

    window.setMaxBuyPrice = function (value) {
        $('.search-prices').first().find('.ut-number-input-control')[3].value = value;

        var searchCriteria = window.autobuyerController._viewmodel.searchCriteria;
        searchCriteria.maxBuy = value;
    }

    window.bidItem = function (item, price) {
        services.Item.bid(item, price).observe(this, (function (sender, data) {
            if (data.success) {
                writeToLog(window.itemName(item._staticData) + ' [' + item._auction.tradeId + '] ' + price + ' success');
                // var sellPrice = parseInt($('#ab_sell_price').val());
                // if (sellPrice !== 0 && !isNaN(sellPrice)) {
                //     writeToLog(' -- Selling for: ' + sellPrice);
                //     window.profit += (sellPrice/100*95) - price;
                //     window.sellRequestTimeout = window.setTimeout(function() {
                //         services.Item.list(item, window.getPreviousPrice(sellPrice), sellPrice, 3600);
                //     }, window.getRandomWait());
                // }
            } else {
                writeToLog(window.itemName(item._staticData) + ' [' + item._auction.tradeId + '] ' + price + ' bid failed');
            }
        }));
    }

    window.buyItem = function (item, price) {
        services.Item.bid(item, price).observe(this, (function (sender, data) {
            if (data.success) {
                writeToLog(item._staticData.firstName + ' ' + item._staticData.lastName + ' [' + item._auction.tradeId + '] ' + price + " Bought");
                var sellPrice = parseInt($('#ab_sell_price').val());
                if (sellPrice !== 0 && !isNaN(sellPrice)) {
                    writeToLog(' -- Selling for: ' + sellPrice);
                    window.profit += (sellPrice / 100 * 95) - price;
                    window.sellRequestTimeout = window.setTimeout(function () {
                        services.Item.list(item, window.getPreviousPrice(sellPrice), sellPrice, 3600);
                    }, window.getRandomWait());
                }
            } else {
                writeToLog(item._staticData.firstName + ' ' + item._staticData.lastName + ' [' + item._auction.tradeId + '] ' + price + ' buy failed');
            }
        }));
    }

    window.getNextPrice = function (bin) {
        if (bin < 150) {
            return 150;
        }

        if (bin < 1000) {
            return bin + 50;
        }

        if (bin >= 1000 && bin < 10000) {
            return bin + 100;
        }

        if (bin >= 10000 && bin < 50000) {
            return bin + 250;
        }

        if (bin >= 50000 && bin < 100000) {
            return bin + 500;
        }

        return bin + 1000;
    };

    window.getPreviousPrice = function (bin) {
        if (bin <= 1000) {
            if (bin <= 250) {
                return 200;
            }

            return bin - 50;
        }

        if (bin > 1000 && bin <= 10000) {
            return bin - 100;
        }

        if (bin > 10000 && bin <= 50000) {
            return bin - 250;
        }

        if (bin > 50000 && bin <= 100000) {
            return bin - 500;
        }

        return bin - 1000;
    };

    window.updateTransferList = function () {
        services.Item.requestTransferItems().observe(this, function (t, response) {
            var soldItems = response.response.items.filter(function (item) {
                return item.getAuctionData().isSold();
            }).length;

            if (window.futStatistics.soldItems !== soldItems) {
                services.User.requestCurrencies();
            }

            window.futStatistics.soldItems = soldItems;

            window.futStatistics.unsoldItems = response.response.items.filter(function (item) {
                return !item.getAuctionData().isSold() && item.getAuctionData().isExpired();
            }).length;

            window.futStatistics.activeTransfers = response.response.items.filter(function (item) {
                return item.getAuctionData().isSelling();
            }).length;

            window.futStatistics.availableItems = response.response.items.filter(function (item) {
                return item.getAuctionData().isInactive();
            }).length;

            var minSoldCount = 0;
            if ($('#ab_min_delete_count').val() !== '') {
                minSoldCount = Math.max(1, parseInt($('#ab_min_delete_count').val()));
            }

            if (minSoldCount > 0 && window.futStatistics.soldItems >= minSoldCount) {
                writeToLog(window.futStatistics.soldItems + " item(s) sold");
                window.clearSoldItems();
            }
        });
    }

    window.clearSoldItems = function () {
        UTTransferListViewController.prototype._clearSold();
    }

    window.setAdjustMode = function () {
        if (window.autoBuyerStatus === window.AB_STATUSES.ADJUST) {
            return;
        }

        if (!$('#adjust_mode').prop("checked")) {
            window.autoBuyerStatus = window.AB_STATUSES.ACTIVE;
            return;
        }

        writeToLog("Adjust mode started");

        window.adjust = {};
        window.adjustBasePriceDetected = false;
        window.adjustSellPrice = null;
        window.adjustSearchPrice = null;
        window.searchCounts = [];
        window.autoBuyerStatus = window.AB_STATUSES.ADJUST;
    }

    window.activateAutoBuyer = function () {
        if (window.autoBuyerStatus === window.AB_STATUSES.ADJUST || window.autoBuyerStatus === window.AB_STATUSES.ACTIVE) {
            return;
        }

        window.setAdjustMode();
        window.notify('Autobuyer Started');

        //$('input[name=trade_mode]:not(:checked)').prop('disabled', true);
        //window.tradeMode = $('input[name=trade_mode]:checked').val();
    }

    window.deactivateAutoBuyer = function () {
        if (window.autoBuyerStatus === window.AB_STATUSES.IDLE) {
            return;
        }

        window.autoBuyerStatus = window.AB_STATUSES.IDLE;
        window.notify('Autobuyer Stopped');

        $('input[name=trade_mode]').prop('disabled', false);
    }

    window.createButton = function (text, callBack, customClass) {
        const stdButton = new UTStandardButtonControl();
        stdButton.init();
        stdButton.addTarget(stdButton, callBack, EventType.TAP);
        stdButton.setText(text);

        if (customClass) {
            const classes = customClass.split(" ");
            for (let cl of classes) stdButton.getRootElement().classList.add(cl);
        }

        return stdButton;
    }

    window.UTAutoBuyerViewController = function () {
        UTMarketSearchFiltersViewController.call(this);
    }

    window.searchFiltersViewInit =
        UTMarketSearchFiltersViewController.prototype.init;

    window.old.utils.JS.inherits(UTAutoBuyerViewController, UTMarketSearchFiltersViewController);

    window.UTAutoBuyerViewController.prototype.init = function () {
        searchFiltersViewInit.call(this);

        const view = this.getView();
        const root = $(view.__root);

        const stopButton = window.createButton("Stop", function () {
            window.deactivateAutoBuyer()
        });

        const searchButton = createButton(
            "Start",
            function () {
                window.activateAutoBuyer()
            },
            "call-to-action"
        );

        const btnContainer = root.find(".button-container");
        btnContainer.find(".btn-standard").remove();
        btnContainer.append($(stopButton.__root));
        btnContainer.append($(searchButton.__root));

        view.__root.id = 'autobuyer-container';
        view.__root.style = "width: 60%; float: left;";

        window.autobuyerController = this
    };

    UTAutoBuyerViewController.prototype.getNavigationTitle = function () {
        setTimeout(() => {
            $("#autobuyer-container").parent().prepend(
                '<div id="InfoWrapper" class="ut-navigation-bar-view navbar-style-landscape">' +
                '   <h1 class="title">STATUS: <span id="ab_status"></span> | COUNT: <span id="ab_request_count">0</span> | PROFIT: <span id="profit_count">0</span></h1>' +
                '   <div class="view-navbar-clubinfo" style="border: none;">' +
                '     <a href="https://www.patreon.com/fut22_automatic" style="color: rgb(255, 66, 77); margin-right: 20px;" target="_blank">' +
                '       <svg height="32px" width="32px" version="1.1" viewBox="0 0 569 546" style="fill: rgb(255, 66, 77);" xmlns="http://www.w3.org/2000/svg">' +
                '           <title>Patreon logo</title>' +
                '           <g><circle cx="362.589996" cy="204.589996" data-fill="1" r="204.589996"></circle><rect data-fill="1" height="545.799988" width="100" x="0" y="0"></rect></g>' +
                '       </svg>' +
                '       <div style="float: right; margin-left: 10px; text-align: center;">Support on<br/> Patreon</div>' +
                '     </a>' +
                '     <span style="text-decoration: underline; cursor: pointer;" onclick="window.showAutobuyerInfo()">' + window.autobuyerVersion + '</span>' +
                '   </div>' +
                '   <div class="view-navbar-clubinfo">' +
                '       <div class="view-navbar-clubinfo-data">' +
                '           <div class="view-navbar-clubinfo-name">' +
                '               <div style="float: left;">Search:</div>' +
                '               <div style="float: right; height: 10px; width: 100px; background: #888; margin: 5px 0px 5px 5px;">' +
                '                   <div id="ab_search_progress" style="background: #000; height: 10px; width: 0%"></div>' +
                '               </div>' +
                '           </div>' +
                '           <div class="view-navbar-clubinfo-name">' +
                '               <div style="float: left;">Statistics:</div>' +
                '               <div style="float: right; height: 10px; width: 100px; background: #888; margin: 5px 0px 5px 5px;">' +
                '                   <div id="ab_statistics_progress" style="background: #000; height: 10px; width: 0%"></div>' +
                '               </div>' +
                '           </div>' +
                '       </div>' +
                '   </div>' +
                '   <div class="view-navbar-currency" style="margin-left: 10px;">' +
                '       <div class="view-navbar-currency-coins" id="ab_coins"></div>' +
                '   </div>' +
                '   <div class="view-navbar-clubinfo">' +
                '       <div class="view-navbar-clubinfo-data">' +
                '           <span class="view-navbar-clubinfo-name">Sold Items: <span id="ab-sold-items"></span></span>' +
                '           <span class="view-navbar-clubinfo-name">Unsold Items: <span id="ab-unsold-items"></span></span>' +
                '       </div>' +
                '   </div>' +
                '   <div class="view-navbar-clubinfo" style="border: none;">' +
                '       <div class="view-navbar-clubinfo-data">' +
                '           <span class="view-navbar-clubinfo-name">Available Items: <span id="ab-available-items"></span></span>' +
                '           <span class="view-navbar-clubinfo-name">Active transfers: <span id="ab-active-transfers"></span></span>' +
                '       </div>' +
                '   </div>' +
                '</div>'
            );

            $("#autobuyer-container").parent().append('' +
                '<div id="SearchWrapper" style="float: right; width: 40%;">' +
                '    <textarea readonly id="progressAutobuyer" style="font-size: 15px; width: 100%; height: 35%;"></textarea>' +
                '    <label>Search Results:</label><br/>' +
                '    <textarea readonly id="autoBuyerFoundLog" style="font-size: 10px; width: 100%; height: 50%;"></textarea>' +
                '</div>'
            );

            $('#autobuyer-container .ut-pinned-list').append().append(
                '<div class="search-prices">' +
                '<div class="search-price-header">' +
                '   <h1 class="secondary">Settings:</h1>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Sell Price:</span><br/><small>After Tax: <span id="sell_after_tax">0</span></small>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_sell_price">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Buy Price:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_buy_price">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Min Bid Price Threshold:</span>' +
                '       <br/><small>For cache reset iterations</small>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_min_bid_price_threshold" value="200">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Min Buy Now Threshold:</span>' +
                '       <br/><small>For cache reset iterations</small>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_min_buy_now_threshold" value="350">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Wait Time:<br/><small>(random wait time eg. 2-5)</small>:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_wait_time" placeholder="7-12" value="7-12">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Min clear count:<br/><small>(clear sold items)</small>:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_min_delete_count" placeholder="" value="10">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Max purchases per search request:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="text" class="ut-number-input-control" id="ab_max_purchases" placeholder="3" value="3">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <input type="checkbox" id="adjust_mode" name="adjust_mode" checked>' +
                '   <label for="adjust_mode">Adjust mode</label>' +
                '</div>' +
                '<div class="search-price-header">' +
                '   <h1 class="secondary">Adjust settings:</h1>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Enable after X search requests:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_adjust_search_requests_count" value="30">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Enable after X empty search responses:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_adjust_empty_search_responses_count" value="6">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Enable after X full search responses:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_adjust_full_search_responses_count" value="3">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Min expire period (minutes):</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_adjust_min_expire_period" value="50">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '<div class="price-filter">' +
                '   <div class="info">' +
                '       <span class="secondary label">Min profit:</span>' +
                '   </div>' +
                '   <div class="buttonInfo">' +
                '       <div class="inputBox">' +
                '           <input type="tel" class="ut-number-input-control" id="ab_adjust_min_profit" value="50">' +
                '       </div>' +
                '   </div>' +
                '</div>' +
                '</div>'
            );

            $(document).on('change keyup', '#ab_sell_price', function() {
                window.updateAfterTaxValue()
            });

            window.showAutobuyerInfo();
        });

        return '';
    };

    function addTabItem() {
        const navViewInit = UTGameTabBarController.prototype.initWithViewControllers;
        UTGameTabBarController.prototype.initWithViewControllers = function (tabs) {
            const autoBuyerTab = new UTTabBarItemView();
            autoBuyerTab.init();
            autoBuyerTab.setTag(8);
            autoBuyerTab.setText('Autobuyer');
            autoBuyerTab.addClass("icon-transfer");

            const autoBuyerNav = new UTGameFlowNavigationController();
            autoBuyerNav.initWithRootController(new UTAutoBuyerViewController());
            autoBuyerNav.tabBarItem = autoBuyerTab;

            tabs.push(autoBuyerNav);
            navViewInit.call(this, tabs);
        };
    };

    window.needSetAdjustMode = function (itemsFound) {
        if (window.autoBuyerStatus === window.AB_STATUSES.ADJUST) {
            return false;
        }

        if (!$('#adjust_mode').prop("checked")) {
            return false;
        }

        var adjustAfterRequestsCount = $('#ab_adjust_search_requests_count').val();
        var adjustAfterEmptyResponsesCount = $('#ab_adjust_empty_search_responses_count').val();
        var adjustAfterFullResponsesCount = $('#ab_adjust_full_search_responses_count').val();
        var searchHistoryLength = Math.max(adjustAfterEmptyResponsesCount, adjustAfterFullResponsesCount, adjustAfterRequestsCount);

        if (adjustAfterRequestsCount && searchCounts.length >= adjustAfterRequestsCount) {
            return true;
        }

        window.searchCounts.push(itemsFound);
        if (window.searchCounts.length >= searchHistoryLength) {
            window.searchCounts = window.searchCounts.slice(-searchHistoryLength);
        }

        if (adjustAfterEmptyResponsesCount && window.searchCounts.length >= adjustAfterEmptyResponsesCount) {
            var emptyCount = window.searchCounts.slice(-adjustAfterEmptyResponsesCount).reduce(function (previousValue, currentValue) {
                return previousValue + currentValue;
            });

            if (emptyCount === 0) {
                return true;
            }
        }

        if (adjustAfterFullResponsesCount && window.searchCounts.length >= adjustAfterEmptyResponsesCount) {
            var fullCount = window.searchCounts.slice(-adjustAfterFullResponsesCount).reduce(function (previousValue, currentValue) {
                return previousValue + currentValue;
            });

            if (fullCount === adjustAfterFullResponsesCount * window.futSearchCount) {
                return true;
            }
        }

        return false;
    };

    window.updateAfterTaxValue = function () {
        var sellPrice = parseInt($('#ab_sell_price').val());
        $('#sell_after_tax').html((sellPrice * 0.95).toLocaleString());
    }

    window.updateAutoTransferListStat = function () {
        if (window.autoBuyerStatus === window.AB_STATUSES.IDLE) {
            return;
        }

        window.updateTransferList();
    };

    window.writeToLog = function (message) {
        var $log = $('#progressAutobuyer');
        message = "[" + new Date().toLocaleTimeString() + "] " + message + "\n";
        $log.val($log.val() + message);
        $log.scrollTop($log[0].scrollHeight);
    };

    window.writeToDebugLog = function (message) {
        var $log = $('#autoBuyerFoundLog');
        message = "[" + new Date().toLocaleTimeString() + "] " + message + "\n";
        $log.val($log.val() + message);
        $log.scrollTop($log[0].scrollHeight);
    };

    window.notify = function (message) {
        services.Notification.queue([message, UINotificationType.POSITIVE])
    };

    window.badNotify = function (message) {
        services.Notification.queue([message, UINotificationType.NEGATIVE])
    };

    window.getRandomWait = function () {
        var wait = [2, 5];
        if ($('#ab_wait_time').val() !== '') {
            wait = $('#ab_wait_time').val().toString().split('-');
        }
        window.searchCount++;
        return Math.round(((Math.random() * (parseInt(wait[1]) - parseInt(wait[0]))) + parseInt(wait[0]))) * 1000;
    };

    window.getTimerProgress = function (timer) {
        var time = (new Date()).getTime();

        return (Math.max(0, timer.finish - time) / (timer.finish - timer.start)) * 100;
    };

    window.updateStatistics = function () {
        $('#ab_search_progress').css('width', window.getTimerProgress(window.timers.search));
        $('#ab_statistics_progress').css('width', window.getTimerProgress(window.timers.transferList));

        $('#ab_request_count').html(window.searchCount);

        $('#ab_coins').html(window.futStatistics.coins);

        $('#profit_count').css('color', '#2cbe2d').html(window.profit);

        switch (window.autoBuyerStatus) {
            case window.AB_STATUSES.ACTIVE:
                $("#ab_status").css('color', '#2cbe2d').html(window.autoBuyerStatus.toUpperCase());
                break;

            case window.AB_STATUSES.ADJUST:
                $("#ab_status").css('color', 'yellow').html(window.autoBuyerStatus.toUpperCase());
                break;

            case window.AB_STATUSES.IDLE:
                $("#ab_status").css('color', 'red').html(window.autoBuyerStatus.toUpperCase());
                break;
        }

        $("#ab-sold-items").html(window.futStatistics.soldItems);
        $("#ab-unsold-items").html(window.futStatistics.unsoldItems);
        $("#ab-available-items").html(window.futStatistics.availableItems);
        $("#ab-active-transfers").html(window.futStatistics.activeTransfers);

        if (window.futStatistics.unsoldItems) {
            $('#ab-unsold-items').css('color', 'red');
        } else {
            $('#ab-unsold-items').css('color', '');
        }

        if (window.futStatistics.availableItems) {
            $('#ab-available-items').css('color', 'orange');
        } else {
            $('#ab-available-items').css('color', '');
        }
    };

    window.showAutobuyerInfo = function () {
        writeToLog(window.futInfo);
    };

    window.setInterval(function () {
        showAutobuyerInfo();
    }, 600000);

    window.hasLoadedAll = false;
    window.searchCount = 0;
    window.autobuyerController = null
    addTabItem();
})();
