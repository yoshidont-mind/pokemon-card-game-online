import React, { useState } from 'react';
import axios from 'axios';

const CardForm = ({ addCard }) => {
    const [number, setNumber] = useState('');

    const handleAddCard = async () => {
        if (number) {
            const url = `http://localhost:3001/card/${number}`;
            try {
                const response = await axios.get(url);
                console.log('HTML Response:', response.data);
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.data, 'text/html');
                const imgElement = doc.querySelector('.LeftBox img.fit');
                console.log('Image Element:', imgElement);

                // imgElement.srcではなく、imgElement.getAttribute('src')を使用
                let imgSrc = imgElement ? imgElement.getAttribute('src') : '';
                console.log('Original Image Source:', imgSrc);

                // 画像URLが相対URLの場合、絶対URLに変換
                if (imgSrc && imgSrc.startsWith('/assets/images')) {
                    imgSrc = `https://www.pokemon-card.com${imgSrc}`;
                }
                console.log('Corrected Image Source:', imgSrc);

                if (imgSrc) {
                    addCard(imgSrc);
                    setNumber('');
                } else {
                    alert('画像が見つかりませんでした。');
                }
            } catch (error) {
                console.error('Error fetching card information:', error);
                alert('カード情報の取得に失敗しました。');
            }
        }
    };

    return (
        <div className="card-form">
            <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="カード番号を入力"
            />
            <button onClick={handleAddCard}>追加</button>
        </div>
    );
};

export default CardForm;
