import React, { useState } from 'react';
import Pokemon from './Pokemon';
import HandTray from './HandTray';
import ToolboxPanel from './ToolboxPanel';
import '../css/boardLayout.tokens.css';
import styles from '../css/playingField.module.css';
import { resolveCardRefsToImageUrls } from '../game-state/compatRead';
import { toPlayerKey } from '../game-state/migrateV1ToV2';

const CARD_BACK_IMAGE = '/card-back.jpg';
const BENCH_SLOTS = 5;

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function ZoneTile({ zone, title, children, dropGroup = 'zone' }) {
  return (
    <div className={styles.zoneTile} data-zone={zone} data-drop-group={dropGroup}>
      <p className={styles.zoneTitle}>{title}</p>
      <div className={styles.zoneValue}>{children}</div>
    </div>
  );
}

function BenchRow({ owner, bench, cardCatalog, isOwnerView }) {
  const slots = Array.from({ length: BENCH_SLOTS }, (_, index) => bench[index] || null);

  return (
    <div className={styles.benchRow} data-zone={`${owner}-bench`} data-drop-group="bench">
      {slots.map((stack, index) => (
        <div
          key={`${owner}-bench-${index}`}
          className={styles.benchSlot}
          data-zone={`${owner}-bench-${index + 1}`}
          data-drop-group="bench-slot"
        >
          {stack ? (
            isOwnerView ? (
              <Pokemon {...toPokemonProps(stack, cardCatalog)} />
            ) : (
              <img src={CARD_BACK_IMAGE} alt="Opponent Bench Card" className={styles.deckCardBack} />
            )
          ) : (
            <span className={styles.benchPlaceholder}>ベンチ</span>
          )}
        </div>
      ))}
    </div>
  );
}

const PlayingField = ({ playerId, sessionDoc, privateStateDoc }) => {
  const [isHandOpen, setIsHandOpen] = useState(false);
  const [isToolboxOpen, setIsToolboxOpen] = useState(false);
  const ownerPlayerId = toPlayerKey(playerId);
  const opponentPlayerId = ownerPlayerId === 'player1' ? 'player2' : 'player1';

  const publicPlayers = sessionDoc?.publicState?.players || {};
  const playerBoard = publicPlayers?.[ownerPlayerId]?.board || {};
  const opponentBoard = publicPlayers?.[opponentPlayerId]?.board || {};
  const playerCounters = publicPlayers?.[ownerPlayerId]?.counters || {};
  const opponentCounters = publicPlayers?.[opponentPlayerId]?.counters || {};

  const playerHandRefs = asArray(privateStateDoc?.zones?.hand);
  const playerDeckRefs = asArray(privateStateDoc?.zones?.deck);
  const playerCatalog = privateStateDoc?.cardCatalog || {};

  const playerHandCards = resolveCardRefsToImageUrls(playerHandRefs, privateStateDoc);
  const playerDeckCount = Number(playerCounters.deckCount ?? playerDeckRefs.length);
  const opponentDeckCount = Number(opponentCounters.deckCount ?? 0);

  const playerActive = playerBoard?.active;
  const opponentActive = opponentBoard?.active;
  const playerBench = asArray(playerBoard?.bench);
  const opponentBench = asArray(opponentBoard?.bench);

  return (
    <div className={`container mt-4 ${styles.boardRoot}`}>
      <div className={styles.statusBar}>状態: {sessionDoc?.status || 'waiting'} / Rev: {sessionDoc?.revision ?? 0}</div>

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
            bench={opponentBench}
            cardCatalog={playerCatalog}
            isOwnerView={false}
          />
          <div className={styles.activeRow}>
            <div className={styles.activeZone} data-zone="opponent-active" data-drop-group="active">
              {opponentActive ? (
                <img src={CARD_BACK_IMAGE} alt="Opponent Active" className={styles.deckCardBack} />
              ) : (
                <span className={styles.activePlaceholder}>バトルポケモン（相手）</span>
              )}
            </div>
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
          <ZoneTile zone="player-discard" title="トラッシュ（自分）">
            {asArray(playerBoard?.discard).length} 枚
          </ZoneTile>
          <ZoneTile zone="player-lost" title="ロスト（自分）">
            {asArray(playerBoard?.lostZone).length} 枚
          </ZoneTile>
        </div>

        <div className={styles.mainColumn}>
          <div className={styles.activeRow}>
            <div className={styles.activeZone} data-zone="player-active" data-drop-group="active">
              {playerActive ? (
                <Pokemon {...toPokemonProps(playerActive, playerCatalog)} />
              ) : (
                <span className={styles.activePlaceholder}>バトルポケモン（自分）</span>
              )}
            </div>
          </div>
          <BenchRow owner="player" bench={playerBench} cardCatalog={playerCatalog} isOwnerView />
        </div>

        <div className={styles.sideColumn}>
          <ZoneTile zone="player-prize" title="サイド（自分）">
            {asArray(playerBoard?.prize).length} 枚
          </ZoneTile>
          <ZoneTile zone="player-hand-count" title="手札枚数">
            {playerHandCards.length} 枚
          </ZoneTile>
        </div>
      </section>

      <HandTray cards={playerHandCards} isOpen={isHandOpen} onToggle={() => setIsHandOpen((prev) => !prev)} />
      <ToolboxPanel isOpen={isToolboxOpen} onToggle={() => setIsToolboxOpen((prev) => !prev)} />
    </div>
  );
};

export default PlayingField;
