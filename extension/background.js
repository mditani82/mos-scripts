chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  chrome.runtime.sendNativeMessage('com.local.runsh', msg, (res) => {
    const err = chrome.runtime.lastError;
    res = err ? { alias: msg.alias, code: -1, stderr: err.message } : res;
    if (msg.action === 'run') {
      chrome.storage.local.get('lastRunAt', ({ lastRunAt = {} }) =>
        chrome.storage.local.set({ lastRun: res, lastRunAt: { ...lastRunAt, [msg.alias]: Date.now() } }));
      chrome.action.setBadgeText({ text: res.stopped ? '' : res.running ? 'ON' : res.code === 0 ? 'OK' : 'ERR' });
      chrome.action.setBadgeBackgroundColor({ color: res.running ? '#0a66ff' : res.code === 0 ? '#2a2' : '#c22' });
    }
    sendResponse(res);
  });
  return true;
});
