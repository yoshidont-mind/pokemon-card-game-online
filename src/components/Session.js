import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import axios from 'axios';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import db from '../firebase';
import PlayingField from './PlayingField';
import '../css/style.css';
import {
  createEmptySessionV2,
  createPrivateStateFromDeckImageUrls,
} from '../game-state/builders';
import { adaptSessionForClient, hasDeckConfigured } from '../game-state/compatRead';
import { migrateSessionV1ToV2, toPlayerKey } from '../game-state/migrateV1ToV2';
import { SESSION_STATUS, isV1SessionDoc, isV2SessionDoc } from '../game-state/schemaV2';

const INITIAL_HAND_SIZE = 7;

const Session = () => {
  const query = new URLSearchParams(useLocation().search);
  const sessionId = query.get('id');
  const playerIdParam = query.get('playerId');
  const [deckCode, setDeckCode] = useState('');
  const [selectedDeckCards, setSelectedDeckCards] = useState([]);
  const [rawSessionDoc, setRawSessionDoc] = useState(null);
  const [rawPrivateStateDoc, setRawPrivateStateDoc] = useState(null);

  const ownerPlayerId = useMemo(() => {
    try {
      return toPlayerKey(playerIdParam);
    } catch (_error) {
      return null;
    }
  }, [playerIdParam]);

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
    if (selectedDeckCards.length === 0) {
      alert('保存するデッキがありません。');
      return;
    }

    try {
      const now = new Date().toISOString();
      const nextPrivateState = createPrivateStateFromDeckImageUrls({
        ownerPlayerId,
        imageUrls: selectedDeckCards,
        initialHandSize: INITIAL_HAND_SIZE,
        updatedBy: ownerPlayerId,
        now,
        shuffle: true,
      });

      const sessionRef = doc(db, 'sessions', sessionId);
      const privateRef = doc(db, 'sessions', sessionId, 'privateState', ownerPlayerId);

      let nextSessionDoc;
      let migratedPrivateStates = null;

      if (isV1SessionDoc(rawSessionDoc)) {
        const migrated = migrateSessionV1ToV2(rawSessionDoc, {
          createdBy: ownerPlayerId,
          updatedBy: ownerPlayerId,
          now,
        });
        nextSessionDoc = migrated.session;
        migratedPrivateStates = migrated.privateStatesByPlayer;
      } else if (isV2SessionDoc(rawSessionDoc)) {
        nextSessionDoc = structuredClone(rawSessionDoc);
      } else {
        nextSessionDoc = createEmptySessionV2({
          createdBy: ownerPlayerId,
          now,
        });
      }

      const opponentPlayerId = ownerPlayerId === 'player1' ? 'player2' : 'player1';
      const opponentDeckCount = Number(
        nextSessionDoc?.publicState?.players?.[opponentPlayerId]?.counters?.deckCount || 0
      );

      nextSessionDoc.version = 2;
      nextSessionDoc.updatedAt = now;
      nextSessionDoc.updatedBy = ownerPlayerId;
      nextSessionDoc.revision = Number.isFinite(nextSessionDoc.revision)
        ? nextSessionDoc.revision + 1
        : 1;
      nextSessionDoc.publicState.players[ownerPlayerId].counters = {
        deckCount: nextPrivateState.zones.deck.length,
        handCount: nextPrivateState.zones.hand.length,
      };

      if (nextSessionDoc.status !== SESSION_STATUS.PLAYING) {
        nextSessionDoc.status =
          nextPrivateState.initialDeckCardIds.length > 0 && opponentDeckCount > 0
            ? SESSION_STATUS.READY
            : SESSION_STATUS.WAITING;
      }

      await setDoc(sessionRef, nextSessionDoc);

      if (migratedPrivateStates) {
        await Promise.all(
          Object.entries(migratedPrivateStates).map(([playerId, state]) => {
            const stateToWrite = playerId === ownerPlayerId ? nextPrivateState : state;
            return setDoc(doc(db, 'sessions', sessionId, 'privateState', playerId), stateToWrite);
          })
        );
      } else {
        await setDoc(privateRef, nextPrivateState);
      }

      setSelectedDeckCards([]);
      setDeckCode('');
      alert('デッキが保存されました。');
    } catch (error) {
      console.error('Error saving deck:', error);
      alert('デッキの保存に失敗しました。');
    }
  };

  if (!sessionId || !ownerPlayerId) {
    return <div className="container mt-5">URLの `id` / `playerId` を確認してください。</div>;
  }

  if (!rawSessionDoc) {
    return <div className="container mt-5">セッションを読み込み中...</div>;
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
        <Button className="btn btn-success" onClick={saveDeck}>
          このデッキを保存
        </Button>
      )}
    </div>
  );
};

export default Session;
