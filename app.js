const got = require('got');
const merge = require('deepmerge');
const deasync = require('deasync-promise');
const { container, event, recorder, output } = require('codeceptjs');

// const wait = time => new Promise((res) => setTimeout(() => res(), time));

module.exports = function (config) {
    if (config.enabled) {
        recorder.startUnlessRunning();

        event.dispatcher.on(event.test.before, test => {
            if (container.helpers('Puppeteer')) {
                createNewRemotePuppeteerSession(test, config);
            }
            if (container.helpers('WebDriver')) {
                setTestConfigForWebdriver(test);
            }
        });

        event.dispatcher.on(event.test.after, test => {
            if (container.helpers('Puppeteer')) {
                stopRemoteSession(test, config);
            }
            const allureReporter = container.plugins('allure');
            var sessionId = getSessionId()
            if (allureReporter) {
                allureReporter.setDescription("This test was run on Browserbase. A direct link to the run is https://app.browserbase.io/session/" + sessionId);
            }
        });

        event.dispatcher.on(event.test.failed, test => {
            sendUpdate(test, config, "failed");
        });

        event.dispatcher.on(event.test.passed, test => {
            sendUpdate(test, config, "passed");
        });
    }
};

function createNewRemotePuppeteerSession(test, config) {
    const Puppeteer = container.helpers('Puppeteer');

    var requestJson = {
        browserName: "chrome",
        "bb:options": {
            name: test.title
        }
    }
    var mergedJson = merge(requestJson, config.desiredCapabilities)
    const { body } = deasync(got.post('https://' + config.organizationID + '.gateway.browserbase.io/wd/hub/session', {
        json: {
            desiredCapabilities: mergedJson
        },
        responseType: 'json'
    }));
    var sessionId = body.sessionId
    Puppeteer._setConfig(merge(Puppeteer.options, {
        chrome: {
            browserWSEndpoint: "ws://" + config.organizationID + ".gateway.browserbase.io/devtools/" + sessionId
        },
        bbSessionId: sessionId
    }));

}

function stopRemoteSession(test, config) {
    var sessionId = getSessionId()
    deasync(got.delete('https://' + config.organizationID + '.gateway.browserbase.io/wd/hub/session/' + sessionId));
}

function sendUpdate(test, config, result) {
    var sessionId = getSessionId()
    got.post("https://app.browserbase.io/api/v1/addSessionResult", {
        json: {
            sessionId: sessionId,
            result: result
        },
        responseType: 'json'
    })
}

function getSessionId() {
    if (container.helpers('Puppeteer')) {
        return container.helpers('Puppeteer').options.bbSessionId
    }
    if (container.helpers('WebDriver')) {
        return container.helpers('WebDriver').browser.sessionId;
    }
    if (container.helpers('Appium')) {
        return container.helpers('Appium').browser.sessionId;
    }
    if (container.helpers('WebDriverIO')) {
        return container.helpers('WebDriverIO').browser.requestHandler.sessionID;
    }
}

function setTestConfigForWebdriver(test) {
    const WebDriver = container.helpers('WebDriver');
    WebDriver.options.desiredCapabilities['bb:options'].name = test.title;
    // Merging this config in a recorder causes the waitfortimeout to be reconverted into seconds
    // by the upstream lib. Here we do a basic check to see if we need to reconvert it to milliseconds
    // so the upstream will not break
    if ((WebDriver.options.waitForTimeout / 1000) < 1) {
        WebDriver.options.waitForTimeout *= 1000
    }
    WebDriver._setConfig(WebDriver.options);
}