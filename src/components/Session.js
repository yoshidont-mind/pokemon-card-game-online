import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import axios from 'axios';
import db from '../firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import PlayingField from './PlayingField';
import '../css/style.css';

const Session = () => {
    const INITIAL_HAND_SIZE = 7;
    const query = new URLSearchParams(useLocation().search);
    const sessionId = query.get('id');
    const playerId = query.get('playerId');
    const [deckCode, setDeckCode] = useState('');
    const [selectedDeckCards, setSelectedDeckCards] = useState([]);
    const [gameData, setGameData] = useState(null);

    useEffect(() => {
        const sessionDoc = doc(db, 'sessions', sessionId);
        const unsubscribe = onSnapshot(sessionDoc, (doc) => {
            if (doc.exists()) {
                setGameData(doc.data());
            }
        });

        return () => unsubscribe();
    }, [sessionId]);

    const copyToClipboard = () => {
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

            let newSelectedDeckCards = [];
            cardData.forEach(card => {
                const matchingUrls = imageUrls.filter(url => url.includes(card.id));
                if (matchingUrls.length > 0) {
                    for (let i = 0; i < card.count; i++) {
                        newSelectedDeckCards.push(matchingUrls[0]);
                    }
                }
            });

            setSelectedDeckCards(newSelectedDeckCards);
        } catch (error) {
            console.error('Error fetching deck information:', error);
            alert('デッキ情報の取得に失敗しました。');
        }
    };

    const shuffleDeck = (deck) => {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    };

    const saveDeck = async () => {
        const playerFieldAll = `player${playerId}.all`;
        const playerFieldDeck = `player${playerId}.deck`;
        const playerFieldHand = `player${playerId}.hand`;
        const sessionDoc = doc(db, 'sessions', sessionId);

        try {
            const shuffledDeck = shuffleDeck([...selectedDeckCards]);
            const initialHand = shuffledDeck.slice(0, INITIAL_HAND_SIZE);
            const remainingDeck = shuffledDeck.slice(INITIAL_HAND_SIZE);
            await updateDoc(sessionDoc, {
                [playerFieldAll]: selectedDeckCards,
                [playerFieldDeck]: remainingDeck,
                [playerFieldHand]: initialHand
            });
            setSelectedDeckCards([]);
            setDeckCode('');
            alert('デッキが保存されました。');
        } catch (error) {
            console.error('Error saving deck:', error);
            alert('デッキの保存に失敗しました。');
        }
    };

    if (gameData && gameData[`player${playerId}`]?.all?.length > 0) {
        return (
            <PlayingField sessionId={sessionId} playerId={playerId} gameData={gameData} />
        );
    }

    return (
        <div className="container mt-5">
            <h3>セッションID: {sessionId}</h3>
            <Button className="btn btn-primary mb-3" onClick={copyToClipboard}>コピー</Button>
            <div className="mb-3">
                <input
                    type="text"
                    id="deckCode"
                    name="deckCode"
                    className="form-control d-inline-block w-75"
                    value={deckCode}
                    onChange={(e) => setDeckCode(e.target.value)}
                    placeholder="デッキコードを入力"
                />
                <Button className="btn btn-secondary ml-2" onClick={fetchDeckInfo}>デッキ情報を取得</Button>
            </div>
            <div className="mb-3 hover-zoom">
                {selectedDeckCards.map((card, index) => (
                    <img key={index} src={card} alt={`Card ${index}`} className="img-thumbnail" style={{ width: '100px', margin: '5px' }} />
                ))}
            </div>
            {selectedDeckCards.length > 0 && (
                <Button className="btn btn-success" onClick={saveDeck}>このデッキを保存</Button>
            )}
        </div>
    );
};

export default Session;
