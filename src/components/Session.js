import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import axios from 'axios';
import { doc, onSnapshot } from 'firebase/firestore';
import db from '../firebase';
import PlayingField from './PlayingField';
import '../css/style.css';
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
  const latestRevisionRef = useRef(null);

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

  if (!sessionId || !ownerPlayerId) {
    return <div className="container mt-5">URLの `id` / `playerId` を確認してください。</div>;
  }

  if (!isAuthReady) {
    return <div className="container mt-5">認証を初期化中...</div>;
  }

  if (!rawSessionDoc) {
    return <div className="container mt-5">セッションを読み込み中...</div>;
  }

  if (slotErrorMessage) {
    return <div className="container mt-5 text-danger">{slotErrorMessage}</div>;
  }

  if (!isPlayerSlotReady) {
    return <div className="container mt-5">参加者スロットを確認中...</div>;
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

  return (
    <div className="container mt-5">
      <h3>セッションID: {sessionId}</h3>
      {mutationMessage && <div className="alert alert-warning">{mutationMessage}</div>}
      <Button className="btn btn-primary mb-3" onClick={copyToClipboard}>
        コピー
      </Button>
      <div className="mb-3">
        <input
          type="text"
          id="deckCode"
          name="deckCode"
          className="form-control d-inline-block w-75"
          value={deckCode}
          onChange={(event) => setDeckCode(event.target.value)}
          placeholder="デッキコードを入力"
        />
        <Button className="btn btn-secondary ml-2" onClick={fetchDeckInfo}>
          デッキ情報を取得
        </Button>
      </div>
      <div className="mb-3 hover-zoom">
        {selectedDeckCards.map((card, index) => (
          <img
            key={`${card}-${index}`}
            src={card}
            alt={`Card ${index}`}
            className="img-thumbnail"
            style={{ width: '100px', margin: '5px' }}
          />
        ))}
      </div>
      {selectedDeckCards.length > 0 && (
        <Button
          className="btn btn-success"
          onClick={saveDeck}
          disabled={!isAuthReady || !isPlayerSlotReady}
        >
          このデッキを保存
        </Button>
      )}
    </div>
  );
};

export default Session;
