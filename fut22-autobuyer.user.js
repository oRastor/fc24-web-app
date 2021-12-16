// ==UserScript==
// @name         FUT22 Autobuyer
// @namespace    http://tampermonkey.net/
// @version      1.5.3
// @updateURL    https://github.com/oRastor/fut22-web-app/raw/master/fut22-autobuyer.user.js
// @description  FUT22 Autobuyer
// @author       Rastor
// @co-author    Tiebe_V
// @match        https://www.easports.com/uk/fifa/ultimate-team/web-app/*
// @match        https://www.ea.com/fifa/ultimate-team/web-app/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    window.getMaxSearchBid = function (min, max) {
        return Math.round((Math.random() * (max - min) + min) / 1000) * 1000;
    };

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

    window.autobuyerVersion = 'v1.5.2';
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
    window.futInfo = '4b76226b712244504747226377766d60777b6770227161706b727622646d7022444b4443224457562230302255474022435252232252706d68676176227263656738226a76767271382d2d656b766a77602c616d6f2d6d506371766d702d64777630302f7567602f637272';
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

            if (window.timers.search.finish == 0 || window.timers.search.finish <= time) {
                window.searchFutMarket(null, null, null);

                window.timers.search = window.createTimeout(time, window.getRandomWait());
            }

            if (window.timers.coins.finish == 0 || window.timers.coins.finish <= time) {
                window.futStatistics.coins = services.User.getUser().coins.amount.toLocaleString();

                window.timers.coins = window.createTimeout(time, 2500);
            }

            if (window.timers.transferList.finish == 0 || window.timers.transferList.finish <= time) {
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

    window.searchFutMarket = function (sender, event, data) {
        if (window.autoBuyerStatus === window.AB_STATUSES.IDLE) {
            return;
        }

        var searchCriteria = getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._viewmodel.searchCriteria;

        searchCriteria.maxBid = window.getMaxSearchBid(300000, 800000);

        services.Item.clearTransferMarketCache();

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


                    if (price <= parseInt(jQuery('#ab_buy_price').val()) && !window.bids.includes(auction.tradeId) && --maxPurchases >= 0) {
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
        var searchCriteria = getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._viewmodel.searchCriteria;

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

        jQuery('#ab_buy_price').val(buyPrice)

        window.updateAfterTaxValue();
        writeToLog('Adjust completed! Buy Price: ' + buyPrice);
        window.autoBuyerStatus = window.AB_STATUSES.ACTIVE;
    }

    window.setMaxBuyPrice = function (value) {
        $('.search-prices').first().find('.numericInput')[3].value = value;

        var searchCriteria = getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._viewmodel.searchCriteria;
        searchCriteria.maxBuy = value;
    }

    window.bidItem = function (item, price) {
        services.Item.bid(item, price).observe(this, (function (sender, data) {
            if (data.success) {
                writeToLog(window.itemName(item._staticData) + ' [' + item._auction.tradeId + '] ' + price + ' success');
                // var sellPrice = parseInt(jQuery('#ab_sell_price').val());
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
                var sellPrice = parseInt(jQuery('#ab_sell_price').val());
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
            window.futStatistics.soldItems = response.data.items.filter(function (item) {
                return item.getAuctionData().isSold();
            }).length;

            window.futStatistics.unsoldItems = response.data.items.filter(function (item) {
                return !item.getAuctionData().isSold() && item.getAuctionData().isExpired();
            }).length;

            window.futStatistics.activeTransfers = response.data.items.filter(function (item) {
                return item.getAuctionData().isSelling();
            }).length;

            window.futStatistics.availableItems = response.data.items.filter(function (item) {
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
        services.Item.clearSoldItems().observe(this, function (t, response) {
        });
    }


    window.UTAutoBuyerViewController = function () {
        UTMarketSearchFiltersViewController.call(this);
        this._jsClassName = "UTAutoBuyerViewController";
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

    window.old.utils.JS.inherits(UTAutoBuyerViewController, UTMarketSearchFiltersViewController)
    window.UTAutoBuyerViewController.prototype.init = function init() {
        if (!this.initialized) {
            //getAppMain().superclass(),
            this._viewmodel || (this._viewmodel = new UTBucketedItemSearchViewModel),
            this._viewmodel.searchCriteria.type === window.old.enums.SearchType.ANY && (this._viewmodel.searchCriteria.type = window.old.enums.SearchType.PLAYER);
            var count = UTTransferMarketPaginationViewModel.prototype.getNumItemsPerPage() + 1;
            this._viewmodel.searchCriteria.count = count,
                this._viewmodel.searchFeature = enums.ItemSearchFeature.MARKET;
            var view = this.getView();
            view.addTarget(this, this._eResetSelected, UTMarketSearchFiltersView.Event.RESET),
                view.addTarget(this, window.activateAutoBuyer, UTMarketSearchFiltersView.Event.SEARCH),
                view.addTarget(this, this._eFilterChanged, UTMarketSearchFiltersView.Event.FILTER_CHANGE),
                view.addTarget(this, this._eMinBidPriceChanged, UTMarketSearchFiltersView.Event.MIN_BID_PRICE_CHANGE),
                view.addTarget(this, this._eMaxBidPriceChanged, UTMarketSearchFiltersView.Event.MAX_BID_PRICE_CHANGE),
                view.addTarget(this, this._eMinBuyPriceChanged, UTMarketSearchFiltersView.Event.MIN_BUY_PRICE_CHANGE),
                view.addTarget(this, this._eMaxBuyPriceChanged, UTMarketSearchFiltersView.Event.MAX_BUY_PRICE_CHANGE),
            this._viewmodel.getCategoryTabVisible() && (view.initTabMenuComponent(),
                view.getTabMenuComponent().addTarget(this, this._eSearchCategoryChanged, EventType.TAP)),
                this._squadContext ? isPhone() || view.addClass("narrow") : view.addClass("floating"),
                view.getPlayerNameSearch().addTarget(this, this._ePlayerNameChanged, EventType.CHANGE),
                view.__root.style = "width: 60%; float: left;";
        }
    };

    function addTabItem() {
        if (jQuery('h1.title').html() == 'Home') {
            getAppMain().getRootViewController().showGameView = function showGameView() {
                if (this._presentedViewController instanceof UTGameTabBarController)
                    return !1;
                var t, i = new UTGameTabBarController,
                    s = new UTGameFlowNavigationController,
                    o = new UTGameFlowNavigationController,
                    l = new UTGameFlowNavigationController,
                    u = new UTGameFlowNavigationController,
                    h = new UTGameFlowNavigationController,
                    p = new UTTabBarItemView,
                    _ = new UTTabBarItemView,
                    g = new UTTabBarItemView,
                    m = new UTTabBarItemView,
                    S = new UTTabBarItemView;
                if (s.initWithRootController(new UTHomeHubViewController),
                    o.initWithRootController(new UTSquadsHubViewController),
                    l.initWithRootController(new UTTransfersHubViewController),
                    u.initWithRootController(new UTStoreViewController),
                    h.initWithRootController(new UTClubHubViewController),
                    p.init(),
                    p.setTag(UTGameTabBarController.TabTag.HOME),
                    p.setText(services.Localization.localize("navbar.label.home")),
                    p.addClass("icon-home"),
                    _.init(),
                    _.setTag(UTGameTabBarController.TabTag.SQUADS),
                    _.setText(services.Localization.localize("nav.label.squads")),
                    _.addClass("icon-squad"),
                    g.init(),
                    g.setTag(UTGameTabBarController.TabTag.TRANSFERS),
                    g.setText(services.Localization.localize("nav.label.trading")),
                    g.addClass("icon-transfer"),
                    m.init(),
                    m.setTag(UTGameTabBarController.TabTag.STORE),
                    m.setText(services.Localization.localize("navbar.label.store")),
                    m.addClass("icon-store"),
                    S.init(),
                    S.setTag(UTGameTabBarController.TabTag.CLUB),
                    S.setText(services.Localization.localize("nav.label.club")),
                    S.addClass("icon-club"),
                    s.tabBarItem = p,
                    o.tabBarItem = _,
                    l.tabBarItem = g,
                    u.tabBarItem = m,
                    h.tabBarItem = S,
                    t = [s, o, l, u, h],
                    !isPhone()) {
                    var C = new UTGameFlowNavigationController,
                        T = new UTGameFlowNavigationController,
                        ST = new UTGameFlowNavigationController,
                        AB = new UTGameFlowNavigationController, //added row
                        v = new UTGameFlowNavigationController;
                    C.initWithRootController(new UTSBCHubViewController),
                        T.initWithRootController(new UTLeaderboardsHubViewController),
                        ST.initWithRootController(new UTCustomizeHubViewController),
                        AB.initWithRootController(new UTAutoBuyerViewController), //added line
                        v.initWithRootController(new UTAppSettingsViewController);
                    var L = new UTTabBarItemView;
                    L.init(),
                        L.setTag(UTGameTabBarController.TabTag.SBC),
                        L.setText(services.Localization.localize("nav.label.sbc")),
                        L.addClass("icon-sbc");
                    var I = new UTTabBarItemView;
                    I.init(),
                        I.setTag(UTGameTabBarController.TabTag.LEADERBOARDS),
                        I.setText(services.Localization.localize("nav.label.leaderboards")),
                        I.addClass("icon-leaderboards");

                    var stadiumTab = new UTTabBarItemView;
                    stadiumTab.init(),
                        stadiumTab.setTag(UTGameTabBarController.TabTag.STADIUM),
                        stadiumTab.setText(services.Localization.repository.get("navbar.label.customizeHub")),
                        stadiumTab.addClass("icon-stadium");

                    //added section
                    var AutoBuyerTab = new UTTabBarItemView;
                    AutoBuyerTab.init(),
                        AutoBuyerTab.setTag(8),
                        AutoBuyerTab.setText('AutoBuyer'),
                        AutoBuyerTab.addClass("icon-transfer");

                    var P = new UTTabBarItemView;
                    P.init(),
                        P.setTag(UTGameTabBarController.TabTag.SETTINGS),
                        P.setText(services.Localization.localize("button.settings")),
                        P.addClass("icon-settings"),
                        C.tabBarItem = L,
                        T.tabBarItem = I,
                        v.tabBarItem = P,
                        ST.tabBarItem = stadiumTab,
                        AB.tabBarItem = AutoBuyerTab, //added line
                        t = t.concat([C, T, v, AB, ST]) //added line
                }

                return i.initWithViewControllers(t),
                    i.getView().addClass("game-navigation"),
                    this.presentViewController(i, !0, function () {
                        services.URL.hasDeepLinkURL() && services.URL.processDeepLinkURL()
                    }),
                    !0
            };

            getAppMain().getRootViewController().showGameView();
        } else {
            window.setTimeout(addTabItem, 1000);
        }
    };

    function createAutoBuyerInterface() {
        if (jQuery('h1.title').html() == 'Home') {
            window.hasLoadedAll = true;
        }

        if (window.hasLoadedAll && getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._jsClassName) {
            if (!jQuery('.SearchWrapper').length) {
                var view = getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._view;
                jQuery(view.__root.parentElement).prepend(
                    '<div id="InfoWrapper" class="ut-navigation-bar-view navbar-style-landscape">' +
                    '   <h1 class="title">STATUS: <span id="ab_status"></span> | COUNT: <span id="ab_request_count">0</span> | PROFIT: <span id="profit_count">0</span></h1>' +
                    '   <div class="view-navbar-clubinfo" style="border: none;">' +
                    '   <span style="text-decoration: underline; cursor: pointer;" onclick="showAutobuyerInfo()">' + window.autobuyerVersion + '</span>' +
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

                jQuery(view.__root.parentElement).append('<div id="SearchWrapper" style="width: 40%; right: 40%"><textarea readonly id="progressAutobuyer" style="font-size: 15px; width: 100%; height: 35%;"></textarea><label>Search Results:</label><br/><textarea readonly id="autoBuyerFoundLog" style="font-size: 10px; width: 100%; height: 45%;"></textarea></div>');

                this.showAutobuyerInfo();
            }

            if (jQuery('.search-prices').first().length) {
                if (!jQuery('#ab_buy_price').length) {
                    jQuery('.search-prices').first().append(
                        '<div class="search-price-header">' +
                        '   <h1 class="secondary">Settings:</h1>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Sell Price:</span><br/><small>After Tax: <span id="sell_after_tax">0</span></small>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_sell_price">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Buy Price:</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_buy_price">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Wait Time:<br/><small>(random wait time eg. 2-5)</small>:</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_wait_time" placeholder="7-12" value="7-12">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Min clear count:<br/><small>(clear sold items)</small>:</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_min_delete_count" placeholder="" value="">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Max purchases per search request:</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="text" class="numericInput" id="ab_max_purchases" placeholder="3" value="3">' +
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
                        '           <input type="tel" class="numericInput" id="ab_adjust_search_requests_count" value="30">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Enable after X empty search responses:</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_adjust_empty_search_responses_count" value="6">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Enable after X full search responses:</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_adjust_full_search_responses_count" value="3">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Min expire period (minutes):</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_adjust_min_expire_period" value="30">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        '<div class="price-filter">' +
                        '   <div class="info">' +
                        '       <span class="secondary label">Min profit:</span>' +
                        '   </div>' +
                        '   <div class="buttonInfo">' +
                        '       <div class="inputBox">' +
                        '           <input type="tel" class="numericInput" id="ab_adjust_min_profit" value="50">' +
                        '       </div>' +
                        '   </div>' +
                        '</div>' +
                        // '<div class="price-filter" style="margin-top: 10px;">' +
                        // '   <div>Trade mode</div>' +
                        // '   <label>' +
                        // '      <input type="radio" value="buy" name="trade_mode" checked>' +
                        // '      <span>Buy Now</span>' +
                        // '   </label>' +
                        // '   <label>' +
                        // '      <input type="radio" value="bid" name="trade_mode">' +
                        // '      <span>Bid</span>' +
                        // '   </label>' +
                        // '</div>' +
                        ''
                    );
                }

                jQuery(document).on('click', '#search_cancel_button', window.deactivateAutoBuyer);

                jQuery(document).on('keyup', '#ab_sell_price', window.updateAfterTaxValue);
            }

            if (!jQuery('#search_cancel_button').length) {
                jQuery('#InfoWrapper').next().find('.button-container button').first().after('<button class="btn-standard" id="search_cancel_button">Stop</button>')
            }
        } else {
            window.setTimeout(createAutoBuyerInterface, 1000);
        }
    }

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
        jQuery('#sell_after_tax').html((sellPrice * 0.95).toLocaleString());
    }

    window.updateAutoTransferListStat = function () {
        if (window.autoBuyerStatus === window.AB_STATUSES.IDLE) {
            return;
        }

        window.updateTransferList();
    };

    window.writeToLog = function (message) {
        var $log = jQuery('#progressAutobuyer');
        message = "[" + new Date().toLocaleTimeString() + "] " + message + "\n";
        $log.val($log.val() + message);
        $log.scrollTop($log[0].scrollHeight);
    };

    window.writeToDebugLog = function (message) {
        var $log = jQuery('#autoBuyerFoundLog');
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
            wait = jQuery('#ab_wait_time').val().toString().split('-');
        }
        window.searchCount++;
        return Math.round(((Math.random() * (parseInt(wait[1]) - parseInt(wait[0]))) + parseInt(wait[0]))) * 1000;
    };

    window.getTimerProgress = function (timer) {
        var time = (new Date()).getTime();

        return (Math.max(0, timer.finish - time) / (timer.finish - timer.start)) * 100;
    };

    window.updateStatistics = function () {
        jQuery('#ab_search_progress').css('width', window.getTimerProgress(window.timers.search));
        jQuery('#ab_statistics_progress').css('width', window.getTimerProgress(window.timers.transferList));

        jQuery('#ab_request_count').html(window.searchCount);

        jQuery('#ab_coins').html(window.futStatistics.coins);

        jQuery('#profit_count').css('color', '#2cbe2d').html(window.profit);

        switch (window.autoBuyerStatus) {
            case window.AB_STATUSES.ACTIVE:
                jQuery('#ab_status').css('color', '#2cbe2d').html(window.autoBuyerStatus.toUpperCase());
                break;

            case window.AB_STATUSES.ADJUST:
                jQuery('#ab_status').css('color', 'yellow').html(window.autoBuyerStatus.toUpperCase());
                break;

            case window.AB_STATUSES.IDLE:
                jQuery('#ab_status').css('color', 'red').html(window.autoBuyerStatus.toUpperCase());
                break;
        }

        jQuery('#ab-sold-items').html(window.futStatistics.soldItems);
        jQuery('#ab-unsold-items').html(window.futStatistics.unsoldItems);
        jQuery('#ab-available-items').html(window.futStatistics.availableItems);
        jQuery('#ab-active-transfers').html(window.futStatistics.activeTransfers);

        if (window.futStatistics.unsoldItems) {
            jQuery('#ab-unsold-items').css('color', 'red');
        } else {
            jQuery('#ab-unsold-items').css('color', '');
        }

        if (window.futStatistics.availableItems) {
            jQuery('#ab-available-items').css('color', 'orange');
        } else {
            jQuery('#ab-available-items').css('color', '');
        }
    };

    window.showAutobuyerInfo = function () {
        writeToLog(window.futDecrypt(window.futInfo));
    };

    window.futDecrypt = function (text) {
        const textToChars = text => text.split('').map(c => c.charCodeAt(0));
        const applySaltToChar = code => textToChars(window.APP_YEAR.toString()).reduce((a, b) => a ^ b, code);

        return text.match(/.{1,2}/g)
            .map(hex => parseInt(hex, 16))
            .map(applySaltToChar)
            .map(charCode => String.fromCharCode(charCode))
            .join('');
    };

    window.futCheck = function (text) {
        return text.match(/.{1,2}/g)
            .map(function (item) {
                return parseInt(item, 16)
            })
            .reduce(function (current, item, index) {
                if (index % 2) {
                    return current + item;
                }
                return current - item;
            }, window.APP_YEAR);
    };

    window.setInterval(function () {
        if (!window.futCheck(this.futInfo)) {
            showAutobuyerInfo();
        }
    }, 600000);

    window.hasLoadedAll = false;
    window.searchCount = 0;
    createAutoBuyerInterface();
    addTabItem();
})();
