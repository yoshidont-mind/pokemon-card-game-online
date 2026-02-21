import {
  buildCardDragPayload,
  buildPileCardDragPayload,
  buildZoneDropPayload,
} from '../buildDragPayload';
import { ZONE_KINDS } from '../constants';
import { isHandZoneDropPayload, resolveDropPayloadForHandTray } from '../useBoardDnd';

describe('useBoardDnd hand tray payload helpers', () => {
  test('isHandZoneDropPayload returns true for player-hand zone payload', () => {
    const handDropPayload = buildZoneDropPayload({
      zoneId: 'player-hand',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.HAND,
    });

    expect(isHandZoneDropPayload(handDropPayload)).toBe(true);
  });

  test('isHandZoneDropPayload returns false for non-hand payloads', () => {
    const discardDropPayload = buildZoneDropPayload({
      zoneId: 'player-discard',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DISCARD,
    });

    expect(isHandZoneDropPayload(discardDropPayload)).toBe(false);
    expect(isHandZoneDropPayload(null)).toBe(false);
  });

  test('resolveDropPayloadForHandTray forces hand payload when pointer is in hand tray and card is dragged', () => {
    const dragPayload = buildCardDragPayload({
      cardId: 'c_player1_001',
      sourceZone: 'player-discard',
    });
    const baseDropPayload = buildZoneDropPayload({
      zoneId: 'player-bench-1',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.BENCH,
      benchIndex: 0,
    });

    const resolvedPayload = resolveDropPayloadForHandTray({
      dragPayload,
      dropPayload: baseDropPayload,
      isPointerInsideHandTray: true,
      playerId: 'player1',
    });

    expect(resolvedPayload).toEqual(
      expect.objectContaining({
        zoneId: 'player-hand',
        targetPlayerId: 'player1',
        zoneKind: ZONE_KINDS.HAND,
      })
    );
    expect(isHandZoneDropPayload(resolvedPayload)).toBe(true);
  });

  test('resolveDropPayloadForHandTray keeps original payload when drag is not a card', () => {
    const dragPayload = buildPileCardDragPayload({
      sourceZone: 'player-deck',
      availableCount: 1,
    });
    const baseDropPayload = buildZoneDropPayload({
      zoneId: 'player-discard',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DISCARD,
    });

    const resolvedPayload = resolveDropPayloadForHandTray({
      dragPayload,
      dropPayload: baseDropPayload,
      isPointerInsideHandTray: true,
      playerId: 'player1',
    });

    expect(resolvedPayload).toBe(baseDropPayload);
  });

  test('resolveDropPayloadForHandTray keeps original payload when pointer is outside hand tray', () => {
    const dragPayload = buildCardDragPayload({
      cardId: 'c_player1_001',
      sourceZone: 'player-discard',
    });
    const baseDropPayload = buildZoneDropPayload({
      zoneId: 'player-discard',
      targetPlayerId: 'player1',
      zoneKind: ZONE_KINDS.DISCARD,
    });

    const resolvedPayload = resolveDropPayloadForHandTray({
      dragPayload,
      dropPayload: baseDropPayload,
      isPointerInsideHandTray: false,
      playerId: 'player1',
    });

    expect(resolvedPayload).toBe(baseDropPayload);
  });
});
