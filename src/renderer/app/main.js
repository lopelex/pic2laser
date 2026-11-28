/** Einstieg der Oberfläche: verbindet alle Teile und startet die App. */

import { Manual } from '../manual.js';
import { Tour } from '../tour.js';
import { bindCameraDialog } from './camera.js';
import { $, $$, bindDialogs } from './dom.js';
import { bindCancel, bindOriginalDrag, bindResultDrag } from './drag.js';
import { bindEmbDialog } from './emb-dialog.js';
import { refreshHistory } from './history.js';
import { bindDragDrop, loadImage } from './image-load.js';
import { bindMerge } from './merge.js';
import { bindModelsDialog, bindPerf, refreshModels, refreshPerf, renderModels } from './models-ui.js';
import { bindPresets, refreshPresets } from './presets.js';
import { bindAppMenu, bindControls, bindInfoToggles, syncControls } from './settings.js';
import { bindStages, restoreRevealedStages, revealInStage } from './stages.js';
import { refreshSystem } from './system.js';
import { bindUpdates } from './updates.js';
import { bindView, renderMarkers, setZoom } from './view.js';
import './sliders.js'; // −/+-Knöpfe an allen Reglern (auch später eingefügten)

window.api.version().then((v) => {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = `v${v}`;
}).catch(() => {});

bindInfoToggles();
bindStages();
bindAppMenu();
bindModelsDialog();
bindDialogs();
bindEmbDialog();
bindCameraDialog();
bindControls();
bindPresets();
bindResultDrag();
bindOriginalDrag();
bindCancel();
bindMerge();
bindPerf();
refreshPerf();
bindUpdates();
$('#img-original').addEventListener('load', renderMarkers);
window.addEventListener('resize', renderMarkers);
for (const b of $$('#view-mode button')) b.addEventListener('click', () => requestAnimationFrame(renderMarkers));
bindDragDrop();
bindView();
syncControls();
setZoom(0);
refreshHistory();
refreshSystem().then(renderModels);
refreshModels();
refreshPresets();
bindTour();

/** Hilfe: „?“ und F1 öffnen das Handbuch, darin „Tour starten“. Die Einführungstour läuft automatisch beim ersten Start. */
function bindTour() {
  $('#btn-help').addEventListener('click', () => Manual.open());
  $('#manual-tour').addEventListener('click', () => { $('#manual-dialog').close(); Tour.start(); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F1') return;
    e.preventDefault();
    if (Tour.isOpen()) return;
    const open = document.querySelector('dialog[open]');
    if (open && open.id !== 'manual-dialog') return; // nicht über einen anderen Dialog legen
    Manual.toggle();
  });
  Tour.init({ loadDemo: (bytes) => loadImage('beispiel-plakette.svg', bytes), revealInStage, restoreRevealedStages });
}
