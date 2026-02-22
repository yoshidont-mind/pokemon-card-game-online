import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { doc, onSnapshot } from 'firebase/firestore';
import db from '../firebase';
import PlayingField from './PlayingField';
import '../css/style.css';
import PreplayShell from './layout/PreplayShell';
import styles from '../css/preplayScreens.module.css';
import { createPrivateStateFromDeckImageUrls } from '../game-state/builders';
import { ensureSignedIn, getCurrentUid } from '../auth/authClient';
import { adaptSessionForClient, hasDeckConfigured } from '../game-state/compatRead';
import { ERROR_CODES, isGameStateError } from '../game-state/errors';
import { toPlayerKey } from '../game-state/migrateV1ToV2';
import { CONNECTION_STATES, touchSessionPresence } from '../game-state/presence';
import { claimPlayerSlot } from '../game-state/sessionParticipation';
import { SESSION_STATUS, isV1SessionDoc, isV2SessionDoc } from '../game-state/schemaV2';
import { INITIAL_PRIZE_COUNT_DEFAULT, normalizeInitialPrizeCount, takeInitialPrizeRefsFromDeck } from '../game-state/setupUtils';
import { applySessionMutation } from '../game-state/transactionRunner';

const INITIAL_HAND_SIZE = 7;
const DECK_PREVIEW_HOVER_SCALE = 5;
const DECK_PREVIEW_VIEWPORT_MARGIN_PX = 6;
const DECK_PREVIEW_BASE_SHIFT = Object.freeze({
  x: 0,
  y: -40,
});

function clampValue(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function resolveDeckPreviewPlacement({
  buttonRect,
  viewportWidth,
  viewportHeight,
  scale = DECK_PREVIEW_HOVER_SCALE,
  margin = DECK_PREVIEW_VIEWPORT_MARGIN_PX,
}) {
  if (
    !buttonRect ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight)
  ) {
    return null;
  }

  const previewWidth = buttonRect.width * scale;
  const previewHeight = buttonRect.height * scale;

  let x =
    buttonRect.left +
    (buttonRect.width - previewWidth) / 2 +
    (Number(DECK_PREVIEW_BASE_SHIFT.x) || 0);
  let y =
    buttonRect.bottom -
    previewHeight +
    (Number(DECK_PREVIEW_BASE_SHIFT.y) || 0);

  const maxX = Math.max(margin, viewportWidth - previewWidth - margin);
  const maxY = Math.max(margin, viewportHeight - previewHeight - margin);

  x = clampValue(x, margin, maxX);
  y = clampValue(y, margin, maxY);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(previewWidth),
  };
}

function mergeOwnedCardsIntoPublicCatalog({ sessionDoc, ownerPlayerId, privateCardCatalog }) {
  const nextPublicCardCatalog =
    sessionDoc?.publicState?.publicCardCatalog &&
    typeof sessionDoc.publicState.publicCardCatalog === 'object'
      ? { ...sessionDoc.publicState.publicCardCatalog }
      : {};

  Object.keys(nextPublicCardCatalog).forEach((cardId) => {
    if (cardId.startsWith(`c_${ownerPlayerId}_`)) {
      delete nextPublicCardCatalog[cardId];
    }
  });

  Object.values(privateCardCatalog || {}).forEach((cardEntity) => {
    const cardId = cardEntity?.cardId;
    const imageUrl =
      typeof cardEntity?.imageUrl === 'string' ? cardEntity.imageUrl.trim() : '';
    if (cardId && imageUrl) {
      nextPublicCardCatalog[cardId] = imageUrl;
    }
  });

  return nextPublicCardCatalog;
}

const Session = () => {
  const query = new URLSearchParams(useLocation().search);
  const sessionId = query.get('id');
  const playerIdParam = query.get('playerId');
  const [deckCode, setDeckCode] = useState('');
  const [selectedDeckCards, setSelectedDeckCards] = useState([]);
  const [rawSessionDoc, setRawSessionDoc] = useState(null);
  const [rawPrivateStateDoc, setRawPrivateStateDoc] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isPlayerSlotReady, setIsPlayerSlotReady] = useState(false);
  const [slotErrorMessage, setSlotErrorMessage] = useState('');
  const [mutationMessage, setMutationMessage] = useState('');
  const [deckHoverPreview, setDeckHoverPreview] = useState(null);
  const latestRevisionRef = useRef(null);
  const deckCardRefs = useRef({});

  const ownerPlayerId = useMemo(() => {
    try {
      return toPlayerKey(playerIdParam);
    } catch (_error) {
      return null;
    }
  }, [playerIdParam]);

  useEffect(() => {
    let isMounted = true;
    ensureSignedIn()
      .then(() => {
        if (isMounted) {
          setIsAuthReady(true);
        }
      })
      .catch((error) => {
        console.error('Failed to initialize auth in Session:', error);
        if (isMounted) {
          setIsAuthReady(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return undefined;
    }
    const sessionDocRef = doc(db, 'sessions', sessionId);
    const unsubscribe = onSnapshot(sessionDocRef, (snapshot) => {
      setRawSessionDoc(snapshot.exists() ? snapshot.data() : null);
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !ownerPlayerId) {
      return undefined;
    }
    const privateDocRef = doc(db, 'sessions', sessionId, 'privateState', ownerPlayerId);
    const unsubscribe = onSnapshot(privateDocRef, (snapshot) => {
      setRawPrivateStateDoc(snapshot.exists() ? snapshot.data() : null);
    });
    return () => unsubscribe();
  }, [ownerPlayerId, sessionId]);

  useEffect(() => {
    setIsPlayerSlotReady(false);
    setSlotErrorMessage('');
  }, [sessionId, ownerPlayerId]);

  useEffect(() => {
    if (!isAuthReady || !sessionId || !ownerPlayerId || !rawSessionDoc || isPlayerSlotReady) {
      return undefined;
    }

    if (!isV2SessionDoc(rawSessionDoc)) {
      setIsPlayerSlotReady(true);
      return undefined;
    }

    let isMounted = true;
    ensureSignedIn()
      .then(async (user) => {
        if (!user?.uid) {
          throw new Error('Missing auth uid while claiming player slot.');
        }
        await claimPlayerSlot({
          sessionId,
          playerId: ownerPlayerId,
          uid: user.uid,
        });
        if (isMounted) {
          setIsPlayerSlotReady(true);
          setSlotErrorMessage('');
        }
      })
      .catch((error) => {
        console.error('Failed to claim player slot in Session:', error);
        if (!isMounted) {
          return;
        }
        setIsPlayerSlotReady(false);
        if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
          setSlotErrorMessage(`このセッションの ${ownerPlayerId} は既に別のユーザーが使用中です。`);
          return;
        }
        if (isGameStateError(error, ERROR_CODES.NOT_FOUND)) {
          setSlotErrorMessage('セッションが見つかりません。URLを確認してください。');
          return;
        }
        setSlotErrorMessage('セッション参加に失敗しました。しばらくして再試行してください。');
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthReady, isPlayerSlotReady, ownerPlayerId, rawSessionDoc, sessionId]);

  const adapted = useMemo(() => {
    if (!rawSessionDoc || !ownerPlayerId) {
      return null;
    }
    try {
      return adaptSessionForClient({
        sessionDoc: rawSessionDoc,
        privateStateDoc: rawPrivateStateDoc,
        playerId: ownerPlayerId,
      });
    } catch (error) {
      console.error('Failed to adapt session data:', error);
      return null;
    }
  }, [ownerPlayerId, rawPrivateStateDoc, rawSessionDoc]);

  useEffect(() => {
    latestRevisionRef.current = Number.isFinite(rawSessionDoc?.revision) ? rawSessionDoc.revision : null;
  }, [rawSessionDoc]);

  useEffect(() => {
    if (!isAuthReady || !isPlayerSlotReady || !sessionId || !ownerPlayerId) {
      return undefined;
    }
    if (!isV2SessionDoc(rawSessionDoc)) {
      return undefined;
    }

    const privateCardCatalog = rawPrivateStateDoc?.cardCatalog;
    if (!privateCardCatalog || typeof privateCardCatalog !== 'object') {
      return undefined;
    }

    const ownedPrefix = `c_${ownerPlayerId}_`;
    const hasOwnedCards = Object.keys(privateCardCatalog).some((cardId) =>
      cardId.startsWith(ownedPrefix)
    );
    if (!hasOwnedCards) {
      return undefined;
    }

    const nextPublicCardCatalog = mergeOwnedCardsIntoPublicCatalog({
      sessionDoc: rawSessionDoc,
      ownerPlayerId,
      privateCardCatalog,
    });
    const currentPublicCardCatalog =
      rawSessionDoc?.publicState?.publicCardCatalog &&
      typeof rawSessionDoc.publicState.publicCardCatalog === 'object'
        ? rawSessionDoc.publicState.publicCardCatalog
        : {};

    const currentOwnedEntries = Object.entries(currentPublicCardCatalog)
      .filter(([cardId]) => cardId.startsWith(ownedPrefix))
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId));
    const nextOwnedEntries = Object.entries(nextPublicCardCatalog)
      .filter(([cardId]) => cardId.startsWith(ownedPrefix))
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId));

    const isAlreadySynced =
      currentOwnedEntries.length === nextOwnedEntries.length &&
      currentOwnedEntries.every(
        ([cardId, imageUrl], index) =>
          nextOwnedEntries[index]?.[0] === cardId &&
          nextOwnedEntries[index]?.[1] === imageUrl
      );
    if (isAlreadySynced) {
      return undefined;
    }

    const actorUid = getCurrentUid();
    if (!actorUid) {
      return undefined;
    }

    let isDisposed = false;
    const expectedRevision = Number.isFinite(rawSessionDoc?.revision) ? rawSessionDoc.revision : 0;

    const syncPublicCardCatalog = async () => {
      try {
        await applySessionMutation({
          sessionId,
          playerId: ownerPlayerId,
          actorUid,
          expectedRevision,
          touchPrivateState: false,
          mutate: ({ sessionDoc: draftSessionDoc }) => {
            draftSessionDoc.publicState.publicCardCatalog = mergeOwnedCardsIntoPublicCatalog({
              sessionDoc: draftSessionDoc,
              ownerPlayerId,
              privateCardCatalog,
            });
            return { sessionDoc: draftSessionDoc };
          },
        });
      } catch (error) {
        if (
          isGameStateError(error, ERROR_CODES.REVISION_CONFLICT) ||
          isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)
        ) {
          return;
        }
        if (!isDisposed) {
          console.warn('Failed to sync publicCardCatalog:', error);
        }
      }
    };

    void syncPublicCardCatalog();

    return () => {
      isDisposed = true;
    };
  }, [isAuthReady, isPlayerSlotReady, ownerPlayerId, rawPrivateStateDoc, rawSessionDoc, sessionId]);

  useEffect(() => {
    if (!isAuthReady || !isPlayerSlotReady || !sessionId || !ownerPlayerId) {
      return undefined;
    }

    let isDisposed = false;

    const updatePresence = async (connectionState) => {
      const actorUid = getCurrentUid();
      if (!actorUid) {
        return;
      }

      try {
        await touchSessionPresence({
          sessionId,
          playerId: ownerPlayerId,
          actorUid,
          expectedRevision: latestRevisionRef.current,
          connectionState,
        });
      } catch (error) {
        if (
          isGameStateError(error, ERROR_CODES.REVISION_CONFLICT) ||
          isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)
        ) {
          return;
        }
        if (!isDisposed) {
          console.warn('Presence update failed:', error);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void updatePresence(CONNECTION_STATES.ONLINE);
      }
    };

    const onPageHide = () => {
      void updatePresence(CONNECTION_STATES.OFFLINE);
    };

    void updatePresence(CONNECTION_STATES.ONLINE);
    const intervalId = window.setInterval(() => {
      void updatePresence(CONNECTION_STATES.ONLINE);
    }, 30000);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      void updatePresence(CONNECTION_STATES.OFFLINE);
    };
  }, [isAuthReady, isPlayerSlotReady, ownerPlayerId, sessionId]);

  const copyToClipboard = () => {
    if (!sessionId) {
      return;
    }
    navigator.clipboard.writeText(sessionId);
    alert('セッションIDをコピーしました！');
  };

  const fetchDeckInfo = async () => {
    if (deckCode.trim() === '') {
      alert('デッキコードを入力してください。');
      return;
    }
    const url = `http://localhost:3001/proxy?url=https://www.pokemon-card.com/deck/confirm.html/deckID/${deckCode}`;
    try {
      const response = await axios.get(url);
      const { imageUrls, cardData } = response.data;

      const nextSelectedDeckCards = [];
      cardData.forEach((card) => {
        const matchingUrls = imageUrls.filter((imageUrl) => imageUrl.includes(card.id));
        if (matchingUrls.length > 0) {
          for (let i = 0; i < card.count; i += 1) {
            nextSelectedDeckCards.push(matchingUrls[0]);
          }
        }
      });

      setSelectedDeckCards(nextSelectedDeckCards);
    } catch (error) {
      console.error('Error fetching deck information:', error);
      alert('デッキ情報の取得に失敗しました。');
    }
  };

  const saveDeck = async () => {
    if (!sessionId || !ownerPlayerId) {
      alert('セッション情報の読み込みに失敗しました。ページを再読み込みしてください。');
      return;
    }
    if (!isPlayerSlotReady) {
      alert('セッション参加処理中です。数秒待ってから再試行してください。');
      return;
    }
    if (!isAuthReady) {
      alert('認証の初期化中です。数秒待ってから再試行してください。');
      return;
    }

    const user = await ensureSignedIn();
    const actorUid = user?.uid || getCurrentUid();
    if (!actorUid) {
      alert('認証に失敗しました。ページを再読み込みしてください。');
      return;
    }

    if (selectedDeckCards.length === 0) {
      alert('保存するデッキがありません。');
      return;
    }

    try {
      if (isV1SessionDoc(rawSessionDoc)) {
        alert('旧スキーマ（V1）のセッションです。先に移行を実施してください。');
        return;
      }
      if (!isV2SessionDoc(rawSessionDoc)) {
        alert('セッションデータの形式が不正です。ページを再読み込みしてください。');
        return;
      }

      const expectedRevision = Number.isFinite(rawSessionDoc?.revision) ? rawSessionDoc.revision : 0;

      await applySessionMutation({
        sessionId,
        playerId: ownerPlayerId,
        actorUid,
        expectedRevision,
        mutate: ({ sessionDoc, now }) => {
          const initialPrizeCount = normalizeInitialPrizeCount(
            sessionDoc?.publicState?.setup?.initialPrizeCount,
            INITIAL_PRIZE_COUNT_DEFAULT
          );

          const nextPrivateState = createPrivateStateFromDeckImageUrls({
            ownerPlayerId,
            imageUrls: selectedDeckCards,
            initialHandSize: INITIAL_HAND_SIZE,
            updatedBy: actorUid,
            now,
            shuffle: true,
          });
          const initialPrizeRefs = takeInitialPrizeRefsFromDeck(nextPrivateState, initialPrizeCount);

          const opponentPlayerId = ownerPlayerId === 'player1' ? 'player2' : 'player1';
          const opponentDeckCount = Number(
            sessionDoc?.publicState?.players?.[opponentPlayerId]?.counters?.deckCount || 0
          );

          sessionDoc.publicState.publicCardCatalog = mergeOwnedCardsIntoPublicCatalog({
            sessionDoc,
            ownerPlayerId,
            privateCardCatalog: nextPrivateState.cardCatalog,
          });
          sessionDoc.publicState.players[ownerPlayerId].board.prize = initialPrizeRefs;

          sessionDoc.publicState.players[ownerPlayerId].counters = {
            deckCount: nextPrivateState.zones.deck.length,
            handCount: nextPrivateState.zones.hand.length,
          };
          sessionDoc.publicState.battleStartReadyByPlayer = {
            player1: false,
            player2: false,
          };

          if (sessionDoc.status !== SESSION_STATUS.PLAYING) {
            sessionDoc.status =
              nextPrivateState.initialDeckCardIds.length > 0 && opponentDeckCount > 0
                ? SESSION_STATUS.READY
                : SESSION_STATUS.WAITING;
          }

          return {
            sessionDoc,
            privateStateDoc: nextPrivateState,
          };
        },
      });

      setSelectedDeckCards([]);
      setDeckCode('');
      setMutationMessage('');
      alert('デッキが保存されました。');
    } catch (error) {
      console.error('Error saving deck:', error);
      if (isGameStateError(error, ERROR_CODES.REVISION_CONFLICT)) {
        setMutationMessage('最新状態へ更新しました。もう一度操作してください。');
        alert('他端末の更新と競合しました。最新状態を反映したので、もう一度操作してください。');
        return;
      }
      if (isGameStateError(error, ERROR_CODES.PERMISSION_DENIED)) {
        setMutationMessage('セッション書き込み権限がありません。URLと参加状態を確認してください。');
        alert('書き込み権限がありません。参加状態を確認してください。');
        return;
      }
      alert('デッキの保存に失敗しました。');
    }
  };

  const updateDeckHoverPreview = (index) => {
    if (!Number.isInteger(index) || index < 0) {
      setDeckHoverPreview(null);
      return;
    }
    const previewImageUrl = selectedDeckCards[index];
    const buttonNode = deckCardRefs.current[index];
    if (!previewImageUrl || !buttonNode || typeof window === 'undefined') {
      setDeckHoverPreview(null);
      return;
    }

    const buttonRect = buttonNode.getBoundingClientRect();
    const placement = resolveDeckPreviewPlacement({
      buttonRect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (!placement) {
      setDeckHoverPreview(null);
      return;
    }

    setDeckHoverPreview({
      imageUrl: previewImageUrl,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      index,
    });
  };

  const clearDeckHoverPreview = () => {
    setDeckHoverPreview(null);
  };

  const renderPreplayShell = ({
    title,
    subtitle = '',
    statusMessage = '',
    isStatusDanger = false,
    modalClassName = '',
    body = null,
  }) => (
    <PreplayShell modalClassName={modalClassName}>
      <section className={styles.header}>
        <p className={styles.eyebrow}>Pokémon Trading Card Game Online Simulator</p>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </section>
      {statusMessage ? (
        <p
          className={[
            styles.statusMessage,
            isStatusDanger ? styles.statusMessageDanger : '',
          ].join(' ')}
        >
          {statusMessage}
        </p>
      ) : null}
      {body}
    </PreplayShell>
  );

  if (!sessionId || !ownerPlayerId) {
    return renderPreplayShell({
      title: 'セッションURLを確認してください',
      statusMessage: 'URLの `id` / `playerId` を確認してください。',
      isStatusDanger: true,
    });
  }

  if (!isAuthReady) {
    return renderPreplayShell({
      title: 'セッションに接続しています',
      statusMessage: '認証を初期化中...',
    });
  }

  if (!rawSessionDoc) {
    return renderPreplayShell({
      title: 'セッションを読み込み中',
      statusMessage: 'セッション情報を取得しています。しばらくお待ちください。',
    });
  }

  if (slotErrorMessage) {
    return renderPreplayShell({
      title: 'セッション参加エラー',
      statusMessage: slotErrorMessage,
      isStatusDanger: true,
    });
  }

  if (!isPlayerSlotReady) {
    return renderPreplayShell({
      title: '参加状態を確認中',
      statusMessage: '参加者スロットを確認中...',
    });
  }

  const shouldShowPlayingField =
    rawSessionDoc &&
    hasDeckConfigured({
      sessionDoc: rawSessionDoc,
      privateStateDoc: rawPrivateStateDoc,
      playerId: ownerPlayerId,
    });

  if (shouldShowPlayingField && adapted) {
    return (
      <PlayingField
        sessionId={sessionId}
        playerId={ownerPlayerId}
        sessionDoc={adapted.sessionDoc}
        privateStateDoc={adapted.privateStateDoc}
      />
    );
  }

  return renderPreplayShell({
    title: 'デッキを準備する',
    subtitle: 'デッキコードからカード一覧を取得し、使用デッキとして保存します。',
    statusMessage: mutationMessage || '',
    isStatusDanger: Boolean(mutationMessage),
    modalClassName: styles.sessionDeckModal,
    body: (
      <>
        <section className={styles.sessionIdRow}>
          <p className={styles.sessionIdLabel}>セッションID</p>
          <p className={styles.sessionIdValue}>{sessionId}</p>
          <button type="button" className={styles.buttonGhost} onClick={copyToClipboard}>
            コピー
          </button>
        </section>

        <section className={styles.fieldGroup}>
          <label htmlFor="deckCode" className={styles.label}>
            デッキコード
          </label>
          <div className={styles.inputRow}>
            <input
              type="text"
              id="deckCode"
              name="deckCode"
              className={styles.textInput}
              value={deckCode}
              onChange={(event) => setDeckCode(event.target.value)}
              placeholder="デッキコードを入力"
            />
            <button type="button" className={styles.buttonSecondary} onClick={fetchDeckInfo}>
              デッキ情報を取得
            </button>
          </div>
        </section>

        <section className={styles.deckPreview}>
          {selectedDeckCards.length > 0 ? (
            <div className={styles.deckGrid}>
              {selectedDeckCards.map((card, index) => (
                <div key={`${card}-${index}`} className={styles.deckCardCell}>
                  <button
                    type="button"
                    className={styles.deckCardButton}
                    ref={(node) => {
                      if (node) {
                        deckCardRefs.current[index] = node;
                      } else {
                        delete deckCardRefs.current[index];
                      }
                    }}
                    onMouseEnter={() => updateDeckHoverPreview(index)}
                    onMouseMove={() => updateDeckHoverPreview(index)}
                    onFocus={() => updateDeckHoverPreview(index)}
                    onBlur={clearDeckHoverPreview}
                    onMouseLeave={clearDeckHoverPreview}
                    aria-label={`デッキカード ${index + 1}`}
                  >
                    <img
                      src={card}
                      alt={`Card ${index}`}
                      className={styles.deckCard}
                    />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.statusMessage}>デッキ情報を取得すると、ここにカード一覧が表示されます。</p>
          )}
        </section>

        {selectedDeckCards.length > 0 ? (
          <div className={[styles.actions, styles.singleAction].join(' ')}>
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={saveDeck}
              disabled={!isAuthReady || !isPlayerSlotReady}
            >
              このデッキを使う
            </button>
          </div>
        ) : null}

        {deckHoverPreview && typeof document !== 'undefined'
          ? createPortal(
              <div
                className={styles.deckCardPreview}
                style={{
                  left: `${deckHoverPreview.x}px`,
                  top: `${deckHoverPreview.y}px`,
                }}
              >
                <img
                  src={deckHoverPreview.imageUrl}
                  alt="デッキカード拡大表示"
                  className={styles.deckCardPreviewImage}
                  style={{ width: `${deckHoverPreview.width}px` }}
                />
              </div>,
              document.body
            )
          : null}
      </>
    ),
  });
};

export default Session;
