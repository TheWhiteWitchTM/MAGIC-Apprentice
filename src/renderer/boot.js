const minUrl = new URL('../../node_modules/monaco-editor/min/', window.location.href).href;

window.MonacoEnvironment = {
  getWorkerUrl() {
    const code = `self.MonacoEnvironment={baseUrl:${JSON.stringify(minUrl)}};importScripts(${JSON.stringify(`${minUrl}vs/base/worker/workerMain.js`)});`;
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  },
};

require.config({ paths: { vs: `${minUrl}vs` } });

require(['vs/editor/editor.main'], () => {
  import('./js/app.js')
    .then((mod) => mod.start())
    .catch((error) => {
      const splash = document.getElementById('splash');
      if (!splash) return;
      splash.hidden = false;
      const pre = document.createElement('pre');
      pre.className = 'splash-error';
      pre.textContent = String(error && error.stack || error);
      splash.appendChild(pre);
    });
});
