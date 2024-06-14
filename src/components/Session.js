// src/components/Session.js
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import axios from 'axios';
import db from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import '../css/style.css';

const Session = () => {
    const query = new URLSearchParams(useLocation().search);
    const sessionId = query.get('id');
    const playerId = query.get('playerId');
    const [deckCode, setDeckCode] = useState('');
    const [selectedDeckCards, setSelectedDeckCards] = useState([]);

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
            console.log('Response data:', response.data);

            const parser = new DOMParser();
            const doc = parser.parseFromString(response.data, 'text/html');
            console.log('Parsed document:', doc);

            const hiddenInputs = doc.querySelectorAll('input[type="hidden"]');
            const cardMap = new Map();

            hiddenInputs.forEach(input => {
                const value = input.value;
                const cards = value.split('-');
                cards.forEach(card => {
                    const [id, count] = card.split('_');
                    cardMap.set(id, parseInt(count, 10));
                });
            });

            const scriptTags = Array.from(doc.querySelectorAll('script'));
            const relevantScriptTag = scriptTags.find(script => script.textContent.includes('PCGDECK.searchItemCardPict'));

            if (!relevantScriptTag) {
                throw new Error('Relevant script tag not found');
            }

            const scriptContent = relevantScriptTag.textContent;
            console.log('Script content:', scriptContent);

            const regex = /PCGDECK\.searchItemCardPict\[(\d+)\]='([^']+)';/g;
            let match;
            const newSelectedDeckCards = [];

            while ((match = regex.exec(scriptContent)) !== null) {
                const id = match[1];
                const url = `https://www.pokemon-card.com${match[2]}`;
                const count = cardMap.get(id);

                if (count) {
                    for (let i = 0; i < count; i++) {
                        newSelectedDeckCards.push(url);
                    }
                }
            }

            console.log('Extracted deck cards:', newSelectedDeckCards);
            setSelectedDeckCards(newSelectedDeckCards);
        } catch (error) {
            console.error('Error fetching deck information:', error);
            alert('デッキ情報の取得に失敗しました。');
        }
    };

    const saveDeck = async () => {
        const playerField = `player${playerId}.all`;
        const sessionDoc = doc(db, 'sessions', sessionId);

        try {
            await updateDoc(sessionDoc, {
                [playerField]: selectedDeckCards
            });
            alert('デッキが保存されました。');
        } catch (error) {
            console.error('Error saving deck:', error);
            alert('デッキの保存に失敗しました。');
        }
    };

    return (
        <div className="container mt-5">
            <h3>セッションID: {sessionId}</h3>
            <Button className="btn btn-primary mb-3" onClick={copyToClipboard}>コピー</Button>
            <div className="mb-3">
                <input
                    type="text"
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
