// ==UserScript==
// @name         FUT19 Autobuyer
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.easports.com/fifa/ultimate-team/web-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    function getMaxSearchBid(min, max) {
        return Math.round((Math.random() * (max - min) + min) / 1000) * 1000;
    }

    window.searchFutMarket = function(sender, event, data) {
        var searchCriteria = getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController()._viewmodel.searchCriteria;

        var searchData = {
            offset: 0,
            count: 20,
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
        searchCriteria.maxBid = getMaxSearchBid(300000, 800000);

        repositories.TransferMarket.search(searchCriteria).observe(this, (function(sender, data) {
            data.items.forEach(function(player){
                var _auction = player._auction;

                var buyNowPrice = _auction.buyNowPrice;
                var expires = _auction.expires;
                var tradeId = _auction.tradeId;
                var tradeState = _auction.tradeState;


                //if (buyNowPrice <= parseInt(jQuery('#ab_buy_pirce').val())) {
                //buyPlayer(player, buyNowPrice);
                writeToLog(player._staticData.firstName + ' ' + player._staticData.lastName + ' [' + tradeId + '] ' + buyNowPrice);
                //}
            });
        }));
    }

    window.buyPlayer = function(player, price) {
        services.Item.bid(player.tradeId, price).observe(this, (function(sender, data){
            if (bidSuccess) {
                services.Item.move(player, enums.FUTItemPile.TRANSFER);
            }
        }));
    }

    window.getTransferList = function() {
        services.Item.requestTransferItems().observe(this, function _onRequestItemsComplete(t, response) {
            jQuery('#ab_tp').html(response.data.items.length);
            return response.data.items;
        });
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

    function startBot() {
        searchFutMarket({
            level: enums.SearchLevel.GOLD,
            maxBuy: 350,
            league: getLeagueIdByAbbr('ENG 1')
        });

        window.setInterval(startBot, 10000);
    }
})();
