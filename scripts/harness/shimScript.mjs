export function acquireShimScript(sessionId, nonce) {
  return `<script nonce="${nonce}">
(function () {
  var sessionId = ${JSON.stringify(sessionId)};
  var stateKey = 'gw-harness-state:' + location.search;
  var events = new EventSource('/events/' + sessionId);
  events.onmessage = function (event) {
    window.dispatchEvent(new MessageEvent('message', { data: JSON.parse(event.data) }));
  };
  window.acquireVsCodeApi = function () {
    return {
      postMessage: function (message) {
        fetch('/rpc/' + sessionId, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message) });
      },
      getState: function () {
        var raw = localStorage.getItem(stateKey);
        return raw === null ? undefined : JSON.parse(raw);
      },
      setState: function (state) {
        localStorage.setItem(stateKey, JSON.stringify(state));
        return state;
      },
    };
  };
})();
</script>`;
}
