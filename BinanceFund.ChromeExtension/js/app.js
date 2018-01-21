var NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
});

var API_ENDPOINT = "https://api.binance.com/";
var settings;
var exchangeRates = {};

function loadSettings() {
    settings = JSON.parse(localStorage.getItem("settings") || "{}");

    settings.refreshRate = Number(settings.refreshRate) || 10;

    $("[data-settings]").each(function () {
        let e = $(this);
        e.val(settings[e.attr("data-settings")]);
    });
}

function saveSettings() {
    let save = {};

    $("[data-settings]").each(function () {
        let e = $(this);
        save[e.attr("data-settings")] = e.val();
    });

    localStorage.setItem("settings", JSON.stringify(save));
}

function signData(data, secret) {
    data.timestamp = Date.now();

    let queryString = $.param(data);

    let shaObj = new jsSHA("SHA-256", "TEXT");
    shaObj.setHMACKey(secret, "TEXT");
    shaObj.update(queryString);
    let hmac = shaObj.getHMAC("HEX");

    queryString += "&signature=" + encodeURIComponent(hmac);
    return queryString;
}

function updateAccountInfo() {
    return new Promise(function (resolve, reject) {
        let apiKey = settings.accountApiKey;
        let secret = settings.accountApiSecret;

        $("#lbl-no-account-info").addClass("invisible");

        let fail = function () {
            $("#lbl-no-account-info").removeClass("invisible");
            resolve();
        };

        if (apiKey && secret) {
            let data = { recvWindow: 100000, };
            let queryString = signData(data, secret);

            $.ajax({
                url: API_ENDPOINT + "api/v3/account?" + queryString,
                headers: {
                    "X-MBX-APIKEY": apiKey,
                },
            })
                .then(function (data) {
                    let list = $("#lst-balances");
                    list.html("");

                    let template = $("#template-balances").html();

                    let counter = 0;
                    for (var balance of data.balances) {
                        let free = Number(balance.free);
                        let locked = Number(balance.locked);

                        if (free > 0 || locked > 0) {
                            let row = $(template);

                            row.find(".no").html(++counter);
                            row.find(".currency").html(balance.asset);
                            row.find(".free").html(NUMBER_FORMATTER.format(free));
                            row.find(".locked").html(NUMBER_FORMATTER.format(locked));

                            var total = free + locked;
                            row.find(".total").html(NUMBER_FORMATTER.format(total));

                            row.find(".usd-free")
                                .html("...")
                                .attr("data-currency-amount", free)
                                .attr("data-currency", balance.asset)
                                .attr("data-currency-category", "free");

                            row.find(".usd-locked")
                                .html("...")
                                .attr("data-currency-amount", locked)
                                .attr("data-currency", balance.asset)
                                .attr("data-currency-category", "locked");

                            row.find(".usd-total")
                                .html("...")
                                .attr("data-currency-amount", total)
                                .attr("data-currency", balance.asset)
                                .attr("data-currency-category", "total");



                            list.append(row);
                        }
                    }

                    resolve();
                })
                .fail(fail);
        } else {
            fail();
        }
    });
}

function updateExchangeRate() {
    $("#lbl-no-exchange-rate").addClass("invisible");

    return new Promise(function (resolve, reject) {
        $.ajax({
            url: API_ENDPOINT + "api/v1/ticker/allPrices",
        })
            .then(function (data) {
                exchangeRates = {};

                for (var rate of data) {
                    exchangeRates[rate.symbol] = rate.price;
                }

                resolve();
            })
            .fail(function () {
                $("#lbl-no-exchange-rate").removeClass("invisible");
                exchangeRates = null;
                resolve();
            });
    });
}

function updateCurrencyExchange() {
    if (!exchangeRates) {
        return;
    }

    var total = {};

    $("[data-currency]").each(function () {
        let e = $(this);

        let currency = e.attr("data-currency");
        let lookup = currency + "USDT";
        let exchangeRate = exchangeRates[lookup];

        if (!exchangeRate) {
            // If found no direct USDT exchange,
            // switch to BTC and then BTC to USDT
            lookup = currency + "BTC";
            exchangeRate = exchangeRates[lookup];

            lookup = "BTCUSDT";
            exchangeRate *= exchangeRates[lookup];
        }

        let originalValue = Number(e.attr("data-currency-amount"));

        let exchangedValue = originalValue * exchangeRate;
        e.html(NUMBER_FORMATTER.format(exchangedValue));

        var category = e.attr("data-currency-category");
        if (total[category]) {
            total[category] += exchangedValue;
        } else {
            total[category] = exchangedValue;
        }
    });

    var balanceTotal = $($("#template-balance-total").html());

    balanceTotal.find(".usd-free").html(NUMBER_FORMATTER.format(total["free"]));
    balanceTotal.find(".usd-locked").html(NUMBER_FORMATTER.format(total["locked"]));
    balanceTotal.find(".usd-total").html(NUMBER_FORMATTER.format(total["total"]));

    showBadgeNumber(total["total"]);

    $("#lst-balances").append(balanceTotal);
}

function showBadgeNumber(number) {
    var show = Math.floor(number).toString();

    if (number > 1000) {
        number /= 1000;
        show = Math.floor(number) + "k";
    }

    if (number > 1000) {
        number /= 1000;
        show = Math.floor(number) + "M";
    }

    if (number > 1000) {
        number /= 1000;
        show = Math.floor(number) + "B";
    }

    if (number > 1000) {
        number /= 1000;
        show = Math.floor(number) + "T";
    }

    chrome.browserAction.setBadgeText({
        text: show,
    });
}

function updateInfo() {
    $("#lbl-updating").html("Updating...");

    let accountPromise = updateAccountInfo();
    let exchangeRatePromise = updateExchangeRate();

    Promise.all([accountPromise, exchangeRatePromise,])
        .then(function () {
            updateCurrencyExchange();

            $("#lbl-updating").html("Last updated at " + (new Date().toLocaleString()));
            window.setTimeout(updateInfo, settings.refreshRate * 1000);
        });
}

$(function () {
    loadSettings();

    $("#frm-settings").submit(function () {
        saveSettings();
        window.location.reload();

        return false;
    });

    updateInfo();
});