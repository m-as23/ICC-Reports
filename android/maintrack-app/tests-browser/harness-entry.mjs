// Served only by the localhost QA harness, never included in release artifacts.
import {stageMainTrackLabRelease, createMainTrackLabUpdater} from '../update-system/stage-maintrack.mjs';
globalThis.Stage14IntegrationTest = Object.freeze({stageMainTrackLabRelease, createMainTrackLabUpdater});

import {mountPilotPanel} from '../update-system/pilot-panel.mjs';
globalThis.Stage15PilotTest = Object.freeze({mountPilotPanel});
