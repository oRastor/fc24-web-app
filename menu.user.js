// ==UserScript==
// @name         FUT19 Autobuyer Menu
// @namespace    http://tampermonkey.net/
// @version      0.4
// @updateURL    https://github.com/Unsworth94/fut19-web-app/raw/master/menu.user.js
// @description  try to take over the world!
// @author       You
// @match        https://www.easports.com/fifa/ultimate-team/web-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /**
      -left UTMarketSearchFiltersViewController

    */

    window.UTAutoBuyerViewController = function () {
        UTMarketSearchFiltersViewController.call(this);
        this._jsClassName = "UTAutoBuyerViewController";
    }

    utils.JS.inherits(UTAutoBuyerViewController, UTMarketSearchFiltersViewController)
    window.UTAutoBuyerViewController.prototype.init = function init() {
        if (!this.initialized) {
            //getAppMain().superclass(),
            this._viewmodel || (this._viewmodel = new viewmodels.BucketedItemSearch),
                this._viewmodel.searchCriteria.type === enums.SearchType.ANY && (this._viewmodel.searchCriteria.type = enums.SearchType.PLAYER);
            var t = gConfigurationModel.getConfigObject(models.ConfigurationModel.KEY_ITEMS_PER_PAGE)
            , count = 1 + (utils.JS.isValid(t) ? t[models.ConfigurationModel.ITEMS_PER_PAGE.TRANSFER_MARKET] : 15);
            this._viewmodel.searchCriteria.count = count,
                this._viewmodel.searchFeature = enums.ItemSearchFeature.MARKET;
            var view = this.getView();
            view.addTarget(this, this._eResetSelected, UTMarketSearchFiltersView.Event.RESET),
                view.addTarget(this, window.searchFutMarket, UTMarketSearchFiltersView.Event.SEARCH),
                view.addTarget(this, this._eFilterChanged, UTMarketSearchFiltersView.Event.FILTER_CHANGE),
                view.addTarget(this, this._eMinBidPriceChanged, UTMarketSearchFiltersView.Event.MIN_BID_PRICE_CHANGE),
                view.addTarget(this, this._eMaxBidPriceChanged, UTMarketSearchFiltersView.Event.MAX_BID_PRICE_CHANGE),
                view.addTarget(this, this._eMinBuyPriceChanged, UTMarketSearchFiltersView.Event.MIN_BUY_PRICE_CHANGE),
                view.addTarget(this, this._eMaxBuyPriceChanged, UTMarketSearchFiltersView.Event.MAX_BUY_PRICE_CHANGE),
                this._viewmodel.getCategoryTabVisible() && (view.initTabMenuComponent(),
                                                            view.getTabMenuComponent().addTarget(this, this._eSearchCategoryChanged, enums.Event.TAP)),
                this._squadContext ? isPhone() || view.addClass("narrow") : view.addClass("floating"),
                view.getPlayerNameSearch().addTarget(this, this._ePlayerNameChanged, enums.Event.CHANGE),
                view.__root.style = "width: 50%; float: left;";
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
                        AB = new UTGameFlowNavigationController, //added row
                        v = new UTGameFlowNavigationController;
                    C.initWithRootController(new UTSBCHubViewController),
                        T.initWithRootController(new UTLeaderboardsHubViewController),
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
                        AB.tabBarItem = AutoBuyerTab, //added line
                        t = t.concat([C, T, v, AB]) //added line
                }
                return i.initWithViewControllers(t),
                    i.getView().addClass("game-navigation"),
                    this.presentViewController(i, !0, function() {
                    services.URL.hasDeepLinkURL() && services.URL.processDeepLinkURL()
                }),
                    !0
            };

            getAppMain().getRootViewController().showGameView();
        } else {
            window.setTimeout(addTabItem ,1000);
        }
    };

    function createAbInterface()
    {
        if (jQuery('h1.title').html() == 'Home') {
            window.hasLoadedAll = true;
        }

        if (window.hasLoadedAll && getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._jsClassName) {
            if (!jQuery('.SearchWrapper').length) {
                var view = getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._view;
                jQuery(view.__root.parentElement).prepend('<div id="InfoWrapper" class="NavigationBar navbar-style-landscape"><h1 class="title" style="margin-right: 0;">COINS: <span id="ab_coins">900,000</span></h1><h1 class="title" style="margin-right: 0;">ITEMS IN TRADEPILE: <span id="ab_tp">0</span></h1><h1 class="title" style="margin-right: 0;">STATUS: <span id="ab_status">IDLE</span></h1><h1 class="title" style="margin-right: 0;">REQUEST COUNT: <span id="ab_request_count">0</span></h1></div>');

                jQuery(view.__root.parentElement).append('<div id="SearchWrapper" style="width: 50%; right: 50%"><textarea readonly id="progressAutobuyer" style="font-size: 15px; width: 100%;height: 58%;"></textarea><label>Search Results:</label><br/><textarea readonly id="autoBuyerFoundLog" style="font-size: 10px; width: 100%;height: 26%;"></textarea></div>');
                writeToLog('Autobuyer Ready');
                updateAbCoinStat();
                updateAbTpStat();
            }

            if (jQuery('.search-prices').first().length) {
                if (!jQuery('#ab_buy_price').length) {
                    jQuery('.search-prices').first().append('<div class="search-price-header"><h1 class="secondary">AB Settings:</h1><button class="flat camel-case disabled" disabled="">Clear</button></div>');
                    jQuery('.search-prices').first().append('<div class="price-filter"><div class="info"><span class="secondary label">Sell Price:</span><br/><small>Recieve After Tax: <span id="sell_after_tax">0</span></small></div><div class="buttonInfo bidSpinner"><div class="inputBox"><input type="tel" class="numericInput" id="ab_sell_price" placeholder="7000"></div></div></div>');
                    jQuery('.search-prices').first().append('<div class="price-filter"><div class="info"><span class="secondary label">Buy Price:</span></div><div class="buttonInfo bidSpinner"><div class="inputBox"><input type="tel" class="numericInput" id="ab_buy_price" placeholder="5000"></div></div></div>');
                    jQuery('.search-prices').first().append('<div class="price-filter"><div class="info"><span class="secondary label">Wait Time:<br/><small>(random second range eg. 7-15)</small>:</span></div><div class="buttonInfo bidSpinner"><div class="inputBox"><input type="tel" class="numericInput" id="ab_wait_time" placeholder="7-15"></div></div></div>');
                }
            }

            if (!jQuery('#search_cancel_button').length) {
                jQuery('#ut-search-wrapper .button-container button').first().after('<button class="btn-standard" id="search_cancel_button">Cancel</button>')
            }
        } else {
            window.setTimeout(createAbInterface, 1000);
        }
    }

    jQuery(document).on('click', '#search_cancel_button', function(){
        window.shouldBeSearching = false;
        window.notify('Autobyer Stopped');
    });

    jQuery(document).on('keyup', '#ab_sell_price', function(){
        jQuery('#sell_after_tax').html((jQuery('#ab_sell_price').val() - ((parseInt(jQuery('#ab_sell_price').val()) / 100) * 5)).toLocaleString());
    });

    window.updateAbCoinStat = function() {
        jQuery('#ab_coins').html(services.User.getUser()._coins.amount.toLocaleString());
        window.setTimeout(updateAbCoinStat, 2500);
    };

    window.updateAbTpStat = function() {
        window.getTransferList();
        window.setTimeout(updateAbTpStat, 15000);
    };

    window.writeToLog = function(message) {
        var $log = jQuery('#progressAutobuyer');
        message = "[" + new Date().toLocaleTimeString() + "] " + message + "\n";
        $log.val($log.val() + message);
        $log.scrollTop($log[0].scrollHeight);
    };

    window.writeToDebugLog = function(message) {
        var $log = jQuery('#autoBuyerFoundLog');
        message = "[" + new Date().toLocaleTimeString() + "] " + message + "\n";
        $log.val($log.val() + message);
        $log.scrollTop($log[0].scrollHeight);
    };

    window.notify = function(message) {
        services.Notification.queue([message, enums.UINotificationType.POSITIVE])
    };

    window.getRandomWait = function() {
        var addedTime = 0;
        if (window.searchCount % 15 === 0) {
            addedTime = 10000;
        }

        var wait = [7, 15];
        if (jQuery('#ab_wait_time').val() !== '') {
            wait = jQuery('#ab_wait_time').val().split('-');
        }
        window.searchCount++;
        jQuery('#ab_request_count').html(window.searchCount);
        return (Math.round((Math.random() * (wait[1] - wait[0]) + wait[0])) * 1000) + 5000 + addedTime;
    };

    function updateAbSatus() {
        if (window.shouldBeSearching) {
            jQuery('#ab_status').html('RUNNING');
        } else {
            jQuery('#ab_status').html('IDLE');
        }
        window.setTimeout(updateAbSatus, 2000);
    }

    window.hasLoadedAll = false;
    window.searchCount = 0;
    createAbInterface();
    addTabItem();
    updateAbSatus();
})();
