// src/App.js
import React, { useState } from 'react';
import './App.css';
import CardForm from './components/CardForm';

function App() {
  const [deckCards, setDeckCards] = useState([]);
  const [deckName, setDeckName] = useState('');

  const addCard = (imgSrc) => {
    setDeckCards([...deckCards, imgSrc]);
  };

  const saveDeck = () => {
    const deck = {
      name: deckName,
      cards: deckCards,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(deck));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'deck_cards.json');
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
      <div className="App">
        <CardForm addCard={addCard} />
        <div className="deck">
          {deckCards.map((src, index) => (
              <img key={index} src={src} alt={`Card ${index}`} />
          ))}
        </div>
        <div className="deck-save">
          <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="デッキ名を入力"
          />
          <button onClick={saveDeck}>デッキを保存</button>
        </div>
      </div>
  );
}

export default App;
