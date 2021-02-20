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