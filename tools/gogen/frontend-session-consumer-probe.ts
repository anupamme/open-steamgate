// SPDX-License-Identifier: MIT
// Compile-only consumer probe; tsconfig.gogen.json has noEmit. Never imported at runtime.
import {compileProgram} from './frontend.mjs';
import {compileClass} from './frontend-session.mjs';
import {compileDiskClass} from './frontend-object-cache.mjs';
import {resolvedFunctionModule} from './frontend-provenance.mjs';
import {resolvedFunctionModule as recordedFunctionModule} from './frontend-provenance-recorder.mjs';
import {suppliedAnswer, currentQueryAnswer, lockAnswer, suppliedSignature} from './frontend-queries.mjs';
import {rttiLocalSupers} from './frontend-inventory.mjs';
import {copyReplayProgram, recordLowering, replayLowering} from './frontend-replay.mjs';
import type {ArtifactObject, ClassObject, CacheDisk, CacheDiskEntry, CachePrediction, CacheShadow, ClassLowering, DiskFrontend, Replay, SessionProgram} from './frontend-session-types.ts';

// withProvenance declares this return type as FrontendProgram. Use the real
// compileProgram export so a future return-contract change is checked too.
declare const program: ReturnType<typeof compileProgram>;
declare const disk: CacheDisk;
declare const shadow: CacheShadow;
declare const frontend: DiskFrontend;
declare const entry: CacheDiskEntry;
declare const prediction: CachePrediction;
// Local-class adapter shape; keep this probe focused on program parameters.
interface ProbeClass extends ClassObject {obj: ArtifactObject}
declare const obj: ProbeClass;
declare const lower: ClassLowering;
declare const replay: Replay;

const sessionProgram: SessionProgram = program;
const ctx = {reg: program.reg, program};
// frontend.mjs's compile(ctx0, ...) dispatch and disk.finish(program).
compileClass(ctx, obj, lower, undefined);
compileDiskClass(ctx, obj, lower, undefined);
frontend.compileDiskClass(ctx, obj, lower, undefined);
disk.finish(program);
// frontend-object-cache.mjs's reads, writes, shadow checks and session replay.
disk.read('CLAS PROBE', 'PROBE', program);
disk.write('CLAS PROBE', entry, [], program);
disk.promote('CLAS PROBE', entry, program);
shadow.probe('CLAS PROBE', 'PROBE', program);
shadow.validate(prediction, ctx, obj, lower);
copyReplayProgram(program);
recordLowering(program, () => entry.ir);
replayLowering(program, replay);
// frontend.mjs's function-call resolution, including the recording facade.
resolvedFunctionModule(ctx, 'PROBE');
recordedFunctionModule(ctx, 'PROBE');

// frontend-queries.mjs and the dependency cache's current-query projection.
suppliedAnswer(program, 'PROBE=>RUN');
currentQueryAnswer(program, {kind: 'caught', args: [], result: []});
lockAnswer(ctx, 'PROBE');
rttiLocalSupers(new Map(), program);
suppliedSignature(ctx, 'PROBE', 'RUN', undefined);
