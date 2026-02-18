import React from 'react';
import Pokemon from './Pokemon';
import styles from '../css/playingField.module.css';
import { resolveCardRefsToImageUrls } from '../game-state/compatRead';
import { toPlayerKey } from '../game-state/migrateV1ToV2';

const CARD_BACK_IMAGE = '/card-back.jpg';

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

const PlayingField = ({ playerId, sessionDoc, privateStateDoc }) => {
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
  const playerBench = asArray(playerBoard?.bench);
  const opponentBenchCount = asArray(opponentBoard?.bench).length;

  return (
    <div className={`game-board container mt-5 text-center ${styles.playingField}`}>
      <div id="opponentField">
        <div className="row mb-4">
          <div className="col-3">
            <div className={`opponent ${styles.discardPile}`}>トラッシュ（相手）</div>
            <div className={`opponent ${styles.deck}`}>
              {opponentDeckCount > 0 && (
                <img src={CARD_BACK_IMAGE} alt="Opponent Deck" className={styles.deckCardBack} />
              )}
              <div>山札（相手）{opponentDeckCount > 0 ? `（${opponentDeckCount}枚）` : '（0枚）'}</div>
            </div>
          </div>
          <div className="col-6">
            <div className={`opponent ${styles.bench}`}>ベンチ（相手）: {opponentBenchCount}体</div>
            <div className="row">
              <div className="col-4">
                <div className={`opponent ${styles.stadium}`}>スタジアム（相手）</div>
              </div>
              <div className="col-4">
                <div className={`opponent ${styles.activeSpot}`}>バトルポケモン（相手）</div>
              </div>
              <div className="col-4">
                <div className={`opponent ${styles.prizeCards}`}>
                  サイド（相手）: {asArray(opponentBoard?.prize).length}
                </div>
              </div>
            </div>
          </div>
          <div className="col-3">
            <div className={`opponent ${styles.message}`}>
              状態: {sessionDoc?.status || 'waiting'} / Rev: {sessionDoc?.revision ?? 0}
            </div>
          </div>
        </div>
      </div>

      <div id="playerField">
        <div className="row">
          <div className={`col-3 self ${styles.hand}`}>
            <div>手札（{playerHandCards.length}枚）</div>
            <div className={styles.handCards}>
              {playerHandCards.map((card, index) => (
                <img
                  key={`${card}-${index}`}
                  src={card}
                  alt={`Hand Card ${index + 1}`}
                  className={styles.handCardImage}
                />
              ))}
            </div>
            <div className="action-buttons">
              <button className="btn btn-primary m-1" type="button">
                見せる
              </button>
              <button className="btn btn-primary m-1" type="button">
                ベンチに出す
              </button>
              <button className="btn btn-primary m-1" type="button">
                バトル場に出す
              </button>
              <button className="btn btn-primary m-1" type="button">
                山札に戻す
              </button>
              <button className="btn btn-primary m-1" type="button">
                トラッシュ
              </button>
              <button className="btn btn-primary m-1" type="button">
                スタジアムに出す
              </button>
            </div>
          </div>

          <div className="col-6">
            <div className="row">
              <div className="col-4">
                <div className={`self ${styles.prizeCards}`}>
                  サイド: {asArray(playerBoard?.prize).length}
                </div>
              </div>
              <div className="col-4">
                <div className={`self ${styles.activeSpot}`}>
                  {playerActive ? (
                    <Pokemon {...toPokemonProps(playerActive, playerCatalog)} />
                  ) : (
                    'バトルポケモン（自分）'
                  )}
                </div>
              </div>
              <div className="col-4">
                <div className={`self ${styles.stadium}`}>スタジアム</div>
              </div>
            </div>
            <div className={`self ${styles.bench}`}>
              {playerBench.map((stack, index) => (
                <Pokemon key={stack?.stackId || index} {...toPokemonProps(stack, playerCatalog)} />
              ))}
              {playerBench.length === 0 && 'ベンチ'}
            </div>
          </div>

          <div className="col-3">
            <div className={`self ${styles.deck}`}>
              {playerDeckCount > 0 ? (
                <>
                  <img src={CARD_BACK_IMAGE} alt="Deck" className={styles.deckCardBack} />
                  <div>山札（{playerDeckCount}枚）</div>
                </>
              ) : (
                <div>山札（0枚）</div>
              )}
            </div>
            <div className={`self ${styles.discardPile}`}>
              トラッシュ: {asArray(playerBoard?.discard).length}
            </div>
            <div className={`self ${styles.discardPile}`}>
              ロスト: {asArray(playerBoard?.lostZone).length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayingField;
