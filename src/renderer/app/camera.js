/** Webcam-Aufnahme. */

import { $, toast } from './dom.js';
import { loadImage } from './image-load.js';

export const CAMERA_PREF_KEY = 'pic2laser.cameraDevice';

export function cameraErrorText(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Kein Zugriff auf die Kamera. Bitte in den Datenschutz-Einstellungen des Systems für Pic2Laser erlauben.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Keine Kamera gefunden.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Die Kamera lässt sich nicht starten – vielleicht benutzt sie gerade ein anderes Programm.';
    default:
      return `Kamera konnte nicht gestartet werden${err?.message ? ` (${err.message})` : ''}.`;
  }
}

export function bindCameraDialog() {
  const dlg = $('#camera-dialog');
  const video = $('#camera-video');
  const msg = $('#camera-msg');
  const select = $('#camera-device');
  const info = $('#camera-info');
  const captureBtn = $('#camera-capture');
  const view = dlg.querySelector('.camera-view');
  let stream = null;
  let token = 0; // verwirft Streams, die erst nach dem Schließen/Umschalten fertig werden

  const savedDevice = () => { try { return localStorage.getItem(CAMERA_PREF_KEY) || ''; } catch { return ''; } };
  const saveDevice = (id) => { try { localStorage.setItem(CAMERA_PREF_KEY, id); } catch { /* egal */ } };

  function stop() {
    token++;
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    video.srcObject = null;
    captureBtn.disabled = true;
    info.textContent = '';
  }

  async function listDevices() {
    let cams = [];
    try {
      cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch { /* ohne Liste geht es mit der Standardkamera weiter */ }
    const current = stream?.getVideoTracks()[0]?.getSettings().deviceId || savedDevice();
    select.replaceChildren(...cams.map((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Kamera ${i + 1}`;
      return o;
    }));
    if (cams.some((d) => d.deviceId === current)) select.value = current;
    select.hidden = cams.length < 2;
  }

  async function start(deviceId) {
    stop();
    const my = token;
    msg.textContent = 'Kamera wird gestartet …';
    try {
      // Möglichst hohe Auflösung anfordern – die Kamera liefert das Beste, was sie kann
      const constraints = { width: { ideal: 3840 }, height: { ideal: 2160 } };
      if (deviceId) constraints.deviceId = { exact: deviceId };
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      } catch (err) {
        // Gespeicherte Kamera nicht mehr da → Standardkamera
        if (!deviceId || (err.name !== 'NotFoundError' && err.name !== 'OverconstrainedError')) throw err;
        delete constraints.deviceId;
        s = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      }
      if (my !== token || !dlg.open) { for (const t of s.getTracks()) t.stop(); return; }
      stream = s;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (stream === s) { stop(); msg.textContent = 'Die Kamera wurde getrennt.'; }
      });
      video.srcObject = stream;
      await listDevices();
    } catch (err) {
      if (my !== token) return;
      msg.textContent = cameraErrorText(err);
    }
  }

  video.addEventListener('loadedmetadata', () => {
    if (!stream || !video.videoWidth) return;
    msg.textContent = '';
    view.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    info.textContent = `${video.videoWidth} × ${video.videoHeight} px`;
    captureBtn.disabled = false;
  });

  async function capture() {
    if (captureBtn.disabled || !video.videoWidth) return;
    captureBtn.disabled = true;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const flash = $('#camera-flash');
    flash.classList.remove('on');
    void flash.offsetWidth; // Animation neu starten
    flash.classList.add('on');
    // PNG: verlustfrei, das Originalbild soll keine zusätzlichen JPEG-Artefakte bekommen
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      toast('Die Aufnahme konnte nicht gespeichert werden.', true);
      captureBtn.disabled = false;
      return;
    }
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `kamera-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    dlg.close();
    await loadImage(name, bytes);
  }

  async function open(e) {
    e?.preventDefault();
    if (dlg.open) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Kamerazugriff wird hier nicht unterstützt.', true);
      return;
    }
    view.style.aspectRatio = '';
    select.hidden = true;
    dlg.showModal();
    msg.textContent = 'Kamera wird gestartet …';
    const allowed = await window.api.cameraAccess().catch(() => true);
    if (!dlg.open) return;
    if (!allowed) {
      msg.textContent = cameraErrorText({ name: 'NotAllowedError' });
      return;
    }
    await start(savedDevice());
  }

  select.addEventListener('change', () => {
    saveDevice(select.value);
    start(select.value);
  });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => {
    if (!dlg.open) return;
    if (stream) listDevices();
    else start(savedDevice()); // z. B. Kamera erst nach dem Öffnen eingesteckt
  });
  captureBtn.addEventListener('click', capture);
  dlg.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      capture();
    }
  });
  dlg.addEventListener('close', stop);
  $('#btn-camera').addEventListener('click', open);
  $('#drop-camera').addEventListener('click', open);
}
