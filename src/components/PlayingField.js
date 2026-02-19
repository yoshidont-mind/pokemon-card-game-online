import React, { useCallback, useEffect, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import Pokemon from './Pokemon';
import HandTray from './HandTray';
import ToolboxPanel from './ToolboxPanel';
import DroppableZone from './dnd/DroppableZone';
import DroppableStack from './dnd/DroppableStack';
import BoardDragOverlay from './dnd/BoardDragOverlay';
import '../css/boardLayout.tokens.css';
import styles from '../css/playingField.module.css';
import { getCurrentUid } from '../auth/authClient';
import { ERROR_CODES, isGameStateError } from '../game-state/errors';
import { toPlayerKey } from '../game-state/migrateV1ToV2';
import { applyPrivateStateMutation } from '../game-state/privateStateMutation';
import { buildStackDropPayload, buildZoneDropPayload } from '../interaction/dnd/buildDragPayload';
import { STACK_KINDS, ZONE_KINDS } from '../interaction/dnd/constants';
import { useBoardDnd } from '../interaction/dnd/useBoardDnd';

const CARD_BACK_IMAGE = '/card-back.jpg';
const BENCH_SLOTS = 5;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveUiPrefs(privateStateDoc) {
  const source = privateStateDoc?.uiPrefs;
  return {
    handTrayOpen: Boolean(source?.handTrayOpen),
    toolboxOpen: Boolean(source?.toolboxOpen),
  };
}

function getStackImages(stack, cardCatalog) {
  return asArray(stack?.cardIds)
    .map((cardId) => cardCatalog?.[cardId]?.imageUrl || null)
    .filter(Boolean);
}

function toPokemonProps(stack, cardCatalog) {
  return {
    images: getStackImages(stack, cardCatalog),
    damage: Number(stack?.damage || 0),
    isPoisoned: Boolean(stack?.specialConditions?.poisoned),
    isBurned: Boolean(stack?.specialConditions?.burned),
    isAsleep: Boolean(stack?.specialConditions?.asleep),
    isParalyzed: Boolean(stack?.specialConditions?.paralyzed),
    isConfused: Boolean(stack?.specialConditions?.confused),
  };
}

function resolveStackId(stack, fallback) {
  if (stack?.stackId && typeof stack.stackId === 'string') {
    return stack.stackId;
  }
  return fallback;
}

function toHandCards(privateStateDoc) {
  const cardCatalog = privateStateDoc?.cardCatalog || {};
  return asArray(privateStateDoc?.zones?.hand)
    .map((ref, index) => {
      const cardId = ref?.cardId || `unknown-hand-card-${index + 1}`;
      return {
        cardId,
        imageUrl: cardCatalog?.[cardId]?.imageUrl || null,
      };
    })
    .filter((entry) => Boolean(entry.imageUrl));
}

function ZoneTile({
  zone,
  title,
  children,
  dropGroup = 'zone',
  dropPayload = null,
  isHighlighted = false,
}) {
  return (
    <DroppableZone
      dropId={`zone-${zone}`}
      dropPayload={dropPayload}
      className={styles.zoneTile}
      activeClassName={styles.dropZoneActive}
      isHighlighted={isHighlighted}
      data-zone={zone}
      data-drop-group={dropGroup}
    >
      <p className={styles.zoneTitle}>{title}</p>
      <div className={styles.zoneValue}>{children}</div>
    </DroppableZone>
  );
}

function BenchRow({
  owner,
  ownerPlayerId,
  bench,
  cardCatalog,
  isOwnerView,
  allowCardDrop,
  isZoneHighlighted,
  isStackHighlighted,
}) {
  const slots = Array.from({ length: BENCH_SLOTS }, (_, index) => bench[index] || null);

  return (
    <div className={styles.benchRow} data-zone={`${owner}-bench`} data-drop-group="bench">
      {slots.map((stack, index) => {
        const zoneId = `${owner}-bench-${index + 1}`;
        const stackId = resolveStackId(stack, `s_${ownerPlayerId}_bench_${index + 1}`);
        const zoneDropPayload = allowCardDrop
          ? buildZoneDropPayload({
              zoneId,
              targetPlayerId: ownerPlayerId,
              zoneKind: ZONE_KINDS.BENCH,
              benchIndex: index,
            })
          : null;

        const stackDropPayload = buildStackDropPayload({
          zoneId,
          targetPlayerId: ownerPlayerId,
          stackKind: STACK_KINDS.BENCH,
          benchIndex: index,
        });

        return (
          <DroppableZone
            key={`${owner}-bench-${index}`}
            dropId={`zone-${zoneId}`}
            dropPayload={zoneDropPayload}
            className={styles.benchSlot}
            activeClassName={styles.dropZoneActive}
            isHighlighted={isZoneHighlighted(zoneId)}
            data-zone={zoneId}
            data-drop-group="bench-slot"
          >
            {stack ? (
              <DroppableStack
                dropId={`stack-${stackId}`}
                dropPayload={stackDropPayload}
                className={styles.stackDropSurface}
                activeClassName={styles.dropStackActive}
                isHighlighted={isStackHighlighted(zoneId)}
                data-zone={`${zoneId}-stack`}
                data-drop-group="stack"
              >
                {isOwnerView ? (
                  <Pokemon {...toPokemonProps(stack, cardCatalog)} />
                ) : (
                  <img src={CARD_BACK_IMAGE} alt="Opponent Bench Card" className={styles.deckCardBack} />
                )}
              </DroppableStack>
            ) : (
              <span className={styles.benchPlaceholder}>ベンチ</span>
            )}
          </DroppableZone>
        );
      })}
    </div>
  );
}

const PlayingField = ({ sessionId, playerId, sessionDoc, privateStateDoc }) => {
  const ownerPlayerId = toPlayerKey(playerId);
  const opponentPlayerId = ownerPlayerId === 'player1' ? 'player2' : 'player1';

  const persistedUiPrefs = resolveUiPrefs(privateStateDoc);

  const [isHandOpen, setIsHandOpen] = useState(persistedUiPrefs.handTrayOpen);
  const [isToolboxOpen, setIsToolboxOpen] = useState(persistedUiPrefs.toolboxOpen);
  const [mutationMessage, setMutationMessage] = useState('');

  useEffect(() => {
    setIsHandOpen(persistedUiPrefs.handTrayOpen);
    setIsToolboxOpen(persistedUiPrefs.toolboxOpen);
  }, [persistedUiPrefs.handTrayOpen, persistedUiPrefs.toolboxOpen]);

  const persistUiPrefs = useCallback(
    async (nextPartialPrefs) => {
      const actorUid = getCurrentUid();
      if (!sessionId || !ownerPlayerId || !actorUid) {
        return;
      }

      try {
        await applyPrivateStateMutation({
          sessionId,
          playerId: ownerPlayerId,
          actorUid,
          mutate: ({ privateStateDoc: draftPrivateStateDoc }) => {
            const currentPrefs =
              draftPrivateStateDoc?.uiPrefs && typeof draftPrivateStateDoc.uiPrefs === 'object'
                ? draftPrivateStateDoc.uiPrefs
                : {};

            draftPrivateStateDoc.uiPrefs = {
              handTrayOpen: Boolean(
                nextPartialPrefs?.handTrayOpen ?? currentPrefs.handTrayOpen
              ),
              toolboxOpen: Boolean(
                nextPartialPrefs?.toolboxOpen ?? currentPrefs.toolboxOpen
              ),
            };

            return { privateStateDoc: draftPrivateStateDoc };
          },
        });
      } catch (error) {
        if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
          setMutationMessage('表示設定の保存権限がありません。参加状態を確認してください。');
          return;
        }
        setMutationMessage('表示設定の保存に失敗しました。再試行してください。');
      }
    },
    [ownerPlayerId, sessionId]
  );

  const handleHandToggle = useCallback(() => {
    setIsHandOpen((prev) => {
      const next = !prev;
      void persistUiPrefs({ handTrayOpen: next });
      return next;
    });
  }, [persistUiPrefs]);

  const handleToolboxToggle = useCallback(() => {
    setIsToolboxOpen((prev) => {
      const next = !prev;
      void persistUiPrefs({ toolboxOpen: next });
      return next;
    });
  }, [persistUiPrefs]);

  const publicPlayers = sessionDoc?.publicState?.players || {};
  const playerBoard = publicPlayers?.[ownerPlayerId]?.board || {};
  const opponentBoard = publicPlayers?.[opponentPlayerId]?.board || {};
  const playerCounters = publicPlayers?.[ownerPlayerId]?.counters || {};
  const opponentCounters = publicPlayers?.[opponentPlayerId]?.counters || {};

  const playerHandRefs = asArray(privateStateDoc?.zones?.hand);
  const playerDeckRefs = asArray(privateStateDoc?.zones?.deck);
  const playerCatalog = privateStateDoc?.cardCatalog || {};

  const playerHandCards = toHandCards(privateStateDoc);
  const playerDeckCount = Number(playerCounters.deckCount ?? playerDeckRefs.length);
  const opponentDeckCount = Number(opponentCounters.deckCount ?? 0);

  const playerActive = playerBoard?.active;
  const opponentActive = opponentBoard?.active;
  const playerBench = asArray(playerBoard?.bench);
  const opponentBench = asArray(opponentBoard?.bench);

  const playerActiveZoneId = 'player-active';
  const opponentActiveZoneId = 'opponent-active';

  const playerActiveDropPayload = buildZoneDropPayload({
    zoneId: playerActiveZoneId,
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.ACTIVE,
  });

  const playerDiscardDropPayload = buildZoneDropPayload({
    zoneId: 'player-discard',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.DISCARD,
  });

  const playerLostDropPayload = buildZoneDropPayload({
    zoneId: 'player-lost',
    targetPlayerId: ownerPlayerId,
    zoneKind: ZONE_KINDS.LOST,
  });

  const playerActiveStackDropPayload = buildStackDropPayload({
    zoneId: playerActiveZoneId,
    targetPlayerId: ownerPlayerId,
    stackKind: STACK_KINDS.ACTIVE,
  });

  const opponentActiveStackDropPayload = buildStackDropPayload({
    zoneId: opponentActiveZoneId,
    targetPlayerId: opponentPlayerId,
    stackKind: STACK_KINDS.ACTIVE,
  });

  const {
    sensors,
    activeDragPayload,
    isMutating,
    isZoneHighlighted,
    isStackHighlighted,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useBoardDnd({
    sessionId,
    playerId: ownerPlayerId,
    sessionDoc,
    onMutationMessage: setMutationMessage,
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={`container mt-4 ${styles.boardRoot}`}>
        <div className={styles.statusBar}>
          状態: {sessionDoc?.status || 'waiting'} / Rev: {sessionDoc?.revision ?? 0}
          {isMutating ? ' / 更新中...' : ''}
        </div>
        {mutationMessage && <div className={styles.mutationBanner}>{mutationMessage}</div>}

        <section className={styles.opponentArea} data-zone="opponent-area" data-drop-group="area">
          <div className={styles.sideColumn}>
            <ZoneTile zone="opponent-prize" title="サイド（相手）">
              {asArray(opponentBoard?.prize).length} 枚
            </ZoneTile>
            <ZoneTile zone="opponent-deck" title="山札（相手）">
              {opponentDeckCount > 0 ? (
                <img src={CARD_BACK_IMAGE} alt="Opponent Deck" className={styles.deckCardBack} />
              ) : (
                <span className={styles.zoneValueMuted}>0 枚</span>
              )}
            </ZoneTile>
          </div>

          <div className={styles.mainColumn}>
            <BenchRow
              owner="opponent"
              ownerPlayerId={opponentPlayerId}
              bench={opponentBench}
              cardCatalog={playerCatalog}
              isOwnerView={false}
              allowCardDrop={false}
              isZoneHighlighted={isZoneHighlighted}
              isStackHighlighted={isStackHighlighted}
            />
            <div className={styles.activeRow}>
              <DroppableZone
                dropId={`zone-${opponentActiveZoneId}`}
                dropPayload={null}
                className={styles.activeZone}
                activeClassName={styles.dropZoneActive}
                isHighlighted={isZoneHighlighted(opponentActiveZoneId)}
                data-zone={opponentActiveZoneId}
                data-drop-group="active"
              >
                {opponentActive ? (
                  <DroppableStack
                    dropId={`stack-${resolveStackId(opponentActive, `s_${opponentPlayerId}_active`)}`}
                    dropPayload={opponentActiveStackDropPayload}
                    className={styles.stackDropSurface}
                    activeClassName={styles.dropStackActive}
                    isHighlighted={isStackHighlighted(opponentActiveZoneId)}
                    data-zone={`${opponentActiveZoneId}-stack`}
                    data-drop-group="stack"
                  >
                    <img src={CARD_BACK_IMAGE} alt="Opponent Active" className={styles.deckCardBack} />
                  </DroppableStack>
                ) : (
                  <span className={styles.activePlaceholder}>バトルポケモン（相手）</span>
                )}
              </DroppableZone>
            </div>
          </div>

          <div className={styles.sideColumn}>
            <ZoneTile zone="opponent-discard" title="トラッシュ（相手）">
              {asArray(opponentBoard?.discard).length} 枚
            </ZoneTile>
            <ZoneTile zone="opponent-lost" title="ロスト（相手）">
              {asArray(opponentBoard?.lostZone).length} 枚
            </ZoneTile>
          </div>
        </section>

        <section className={styles.centerArea}>
          <div className={styles.centerZone} data-zone="center-stadium" data-drop-group="stadium">
            <p className={styles.zoneTitle}>スタジアム</p>
            <span className={styles.zoneValueMuted}>{sessionDoc?.publicState?.stadium ? '場に出ている' : 'なし'}</span>
          </div>
        </section>

        <section className={styles.playerArea} data-zone="player-area" data-drop-group="area">
          <div className={styles.sideColumn}>
            <ZoneTile zone="player-deck" title="山札（自分）">
              {playerDeckCount > 0 ? (
                <img src={CARD_BACK_IMAGE} alt="Player Deck" className={styles.deckCardBack} />
              ) : (
                <span className={styles.zoneValueMuted}>0 枚</span>
              )}
            </ZoneTile>
            <ZoneTile
              zone="player-discard"
              title="トラッシュ（自分）"
              dropPayload={playerDiscardDropPayload}
              isHighlighted={isZoneHighlighted('player-discard')}
            >
              {asArray(playerBoard?.discard).length} 枚
            </ZoneTile>
            <ZoneTile
              zone="player-lost"
              title="ロスト（自分）"
              dropPayload={playerLostDropPayload}
              isHighlighted={isZoneHighlighted('player-lost')}
            >
              {asArray(playerBoard?.lostZone).length} 枚
            </ZoneTile>
          </div>

          <div className={styles.mainColumn}>
            <div className={styles.activeRow}>
              <DroppableZone
                dropId={`zone-${playerActiveZoneId}`}
                dropPayload={playerActiveDropPayload}
                className={styles.activeZone}
                activeClassName={styles.dropZoneActive}
                isHighlighted={isZoneHighlighted(playerActiveZoneId)}
                data-zone={playerActiveZoneId}
                data-drop-group="active"
              >
                {playerActive ? (
                  <DroppableStack
                    dropId={`stack-${resolveStackId(playerActive, `s_${ownerPlayerId}_active`)}`}
                    dropPayload={playerActiveStackDropPayload}
                    className={styles.stackDropSurface}
                    activeClassName={styles.dropStackActive}
                    isHighlighted={isStackHighlighted(playerActiveZoneId)}
                    data-zone={`${playerActiveZoneId}-stack`}
                    data-drop-group="stack"
                  >
                    <Pokemon {...toPokemonProps(playerActive, playerCatalog)} />
                  </DroppableStack>
                ) : (
                  <span className={styles.activePlaceholder}>バトルポケモン（自分）</span>
                )}
              </DroppableZone>
            </div>
            <BenchRow
              owner="player"
              ownerPlayerId={ownerPlayerId}
              bench={playerBench}
              cardCatalog={playerCatalog}
              isOwnerView
              allowCardDrop
              isZoneHighlighted={isZoneHighlighted}
              isStackHighlighted={isStackHighlighted}
            />
          </div>

          <div className={styles.sideColumn}>
            <ZoneTile zone="player-prize" title="サイド（自分）">
              {asArray(playerBoard?.prize).length} 枚
            </ZoneTile>
            <ZoneTile zone="player-hand-count" title="手札枚数">
              {playerHandRefs.length} 枚
            </ZoneTile>
          </div>
        </section>

        <HandTray cards={playerHandCards} isOpen={isHandOpen} onToggle={handleHandToggle} />
        <ToolboxPanel isOpen={isToolboxOpen} onToggle={handleToolboxToggle} />
      </div>
      <BoardDragOverlay activeDragPayload={activeDragPayload} cardCatalog={playerCatalog} />
    </DndContext>
  );
};

export default PlayingField;
