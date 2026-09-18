import { Chess } from 'chess.js';
import { once } from 'node:events';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { startBridge } from './bridge.mjs';
import { connectDevelopmentEngine } from '../src/engine/DevelopmentEngine';
import { UciSession } from '../src/engine/UciSession';
import { GameController } from '../src/GameController';

// Le second moteur joue les blancs pour parcourir une partie complète sans intervention.
it.skipIf(!process.env.CHESS_ENGINE_BINARY)('joue une partie entière avec ShallowRed via le contrôleur de l’interface', async () => {
  const bridge = startBridge({ command: process.env.CHESS_ENGINE_BINARY, port: 0 });
  const controller = new GameController({ timeControl: { initialMs: 2000, incrementMs: 20 } });
  let receivedAnalysis = false;
  const unsubscribe = controller.subscribe(() => {
    if (controller.snapshot?.analysis?.depth > 0 && controller.snapshot?.analysis?.score) receivedAnalysis = true;
  });
  let whiteSession;
  try {
    await once(bridge.server, 'listening');
    const url = `ws://127.0.0.1:${bridge.server.address().port}`;
    vi.stubGlobal('WebSocket', class extends WebSocket {
      constructor(address) { super(address, { origin: 'http://127.0.0.1:5173' }); }
    });
    const whiteEngine = await connectDevelopmentEngine(message => whiteSession?.fail(message), url);
    let whiteState;
    whiteSession = new UciSession(whiteEngine, snapshot => { whiteState = snapshot.state; });
    whiteSession.start();
    await controller.connect('local', failure => connectDevelopmentEngine(failure, url));
    await vi.waitFor(() => {
      expect(whiteState).toBe('ready');
      expect(controller.canMove).toBe(true);
    });
    for (let ply = 0; ply < 500 && !controller.finished; ply += 2) {
      const moves = controller.game.chess.history({ verbose: true }).map(move => move.from + move.to + (move.promotion ?? ''));
      const position = `position startpos${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
      const uci = await whiteSession.search(position, 10);
      const move = controller.game.chess.moves({ verbose: true }).find(move => move.from + move.to + (move.promotion ?? '') === uci);
      expect(move, `Coup blanc légal : ${uci}`).toBeDefined();
      controller.tick();
      if (controller.finished) break;
      expect(controller.move(move.from, move.to)).toBe(true);
      if (move.promotion) controller.promote(move.promotion);
      await vi.waitFor(() => {
        expect(controller.snapshot?.error).toBe('');
        expect(controller.finished || controller.canMove).toBe(true);
      }, { timeout: 6000, interval: 10 });
      if (ply === 0 && !controller.finished) {
        const fen = controller.game.chess.fen();
        controller.undo();
        expect(controller.game.chess.history()).toEqual([]);
        controller.redo();
        expect(controller.game.chess.fen()).toBe(fen);
        await vi.waitFor(() => expect(controller.canMove).toBe(true), { timeout: 6000 });
      }
    }
    expect(controller.finished).toBe(true);
    expect(receivedAnalysis).toBe(true);
    const exported = new Chess();
    exported.loadPgn(controller.exportPgn());
    expect(exported.fen()).toBe(controller.game.chess.fen());
    expect(controller.game.chess.history().length).toBeGreaterThan(1);
    console.log(`${controller.timeResult || controller.game.status} ; ${controller.game.chess.history().length} demi-coups`);
  } finally {
    unsubscribe();
    await controller.disconnect();
    await whiteSession?.dispose();
    await bridge.close();
    vi.unstubAllGlobals();
  }
}, 90000);
