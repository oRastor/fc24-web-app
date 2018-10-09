// ==UserScript==
// @name         FUT19 Autobuyer
// @namespace    http://tampermonkey.net/
// @version      0.5
// @updateURL    https://github.com/Unsworth94/fut19-web-app/raw/master/autobuyer.user.js
// @description  try to take over the world!
// @author       You
// @match        https://www.easports.com/fifa/ultimate-team/web-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    window.getMaxSearchBid = function(min, max) {
        return Math.round((Math.random() * (max - min) + min) / 1000) * 1000;
    };

    window.searchFutMarket = function(sender, event, data) {
        if (!window.autoBuyerActive) {
            return;
        }

        var searchCriteria = getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._viewmodel.searchCriteria;

        var searchData = {
            offset: 0,
            count: 21,
            type: enums.SearchType.PLAYER,
            category: enums.SearchCategory.ANY,
            position: enums.SearchType.ANY,
            zone: enums.SearchType.ANY,
            level: enums.SearchLevel.ANY,
            nation: -1,
            league: -1,
            club: -1,
            playStyle: -1,
            minBid: 0,
            maxBid: 0,
            minBuy: 0,
            maxBuy: 0,
            defId: [],
            maskedDefId: 0,
            year: enums.SearchType.ANY,
            untradeables: enums.SearchUntradeables.DEFAULT,
            isExactSearch: !1
        };

        //searchData = Object.assign(searchData, data);
        searchCriteria.maxBid = window.getMaxSearchBid(300000, 800000);

        repositories.TransferMarket.search(searchCriteria).observe(this, (function(sender, data) {
            if (data.success) {
                writeToDebugLog('Received ' + data.items.length + ' items');

                data.items.sort(function(a, b) {
                    return a._auction.buyNowPrice - b._auction.buyNowPrice;
                });

                for (var i = 0; i < data.items.length; i++) {
                    var player = data.items[i];
                    var _auction = player._auction;

                    var buyNowPrice = _auction.buyNowPrice;
                    var expires = _auction.expires;
                    var tradeId = _auction.tradeId;
                    var tradeState = _auction.tradeState;

                    writeToDebugLog(player._staticData.firstName + ' ' + player._staticData.lastName + ' [' + player._auction.tradeId + '] ' + buyNowPrice);
                    if (buyNowPrice <= parseInt(jQuery('#ab_buy_price').val())) {
                        buyPlayer(player, buyNowPrice);
                    }
                };
            }

            if (window.autoBuyerActive) {
                window.searchRequestTimeout = window.setTimeout(function() {
                    window.searchFutMarket(null, null, null);
                }, window.getRandomWait());
            }
        }));
    }

    window.buyPlayer = function(player, price) {
        services.Item.bid(player, price).observe(this, (function(sender, data){
            if (data.success) {
                writeToLog(player._staticData.firstName + ' ' + player._staticData.lastName + ' [' + player._auction.tradeId + '] ' + price + ' buyed');
                var sellPrice = parseInt(jQuery('#ab_sell_price').val());
                if (sellPrice !== 0) {
                    writeToLog(' -- Selling for: ' + sellPrice);
                    window.sellRequestTimeout = window.setTimeout(function() {
                        services.Item.list(player, window.getSellBidPrice(sellPrice), sellPrice, 3600);
                    }, window.getRandomWait());
                }
            } else {
                writeToLog(player._staticData.firstName + ' ' + player._staticData.lastName + ' [' + player._auction.tradeId + '] ' + price + ' buy failed');
            }
        }));
    }

    window.getSellBidPrice = function(bin) {
        if (bin <= 1000) {
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

    window.updateTransferList = function() {
        services.Item.requestTransferItems().observe(this, function(t, response) {
            var soldItems = response.data.items.filter(function(item) {
                return item.getAuctionData().isSold();
            });

            var unsoldItems = response.data.items.filter(function(item) {
                return !item.getAuctionData().isSold() && item.getAuctionData().isExpired();
            });

            var activeTransfers = response.data.items.filter(function(item) {
                return item.getAuctionData().isSelling();
            });

            var availableItems = response.data.items.filter(function(item) {
                return item.getAuctionData().isInactive();
            });

            jQuery('#ab-sold-items').html(soldItems.length);
            jQuery('#ab-unsold-items').html(unsoldItems.length);
            jQuery('#ab-available-items').html(availableItems.length);
            jQuery('#ab-active-transfers').html(activeTransfers.length);

            var minSoldCount = 10;
            if ($('#ab_min_delete_count').val() !== '') {
                minSoldCount = min(1, parseInt($('#ab_min_delete_count').val()));
            }

            if (soldItems.length >= minSoldCount) {
                writeToLog(soldItems.length + " item(s) sold");
                window.clearSoldItems();
            }
        });
    }

    window.clearSoldItems = function() {
        services.Item.clearSoldItems().observe(this, function(t, response) {});
    }

    function getLeagueIdByAbbr(abbr) {
        var leagues = Object.values(repositories.TeamConfig._leagues._collection['11']._leagues._collection);
        var leagueId = 0;
        for(var i = 0; i < leagues.length; i++) {
            if (abbr === leagues[i].abbreviation) {
                leagueId = leagues[i].id;
                break;
            }
        }

        return leagueId;
    }
})();
