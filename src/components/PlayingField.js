import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import db from '../firebase';
import Pokemon from './Pokemon';
import styles from '../css/playingField.module.css';

const PlayingField = ({ sessionId, playerId }) => {
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

    const opponentId = playerId === '1' ? '2' : '1';
    const opponentData = gameData ? gameData[`player${opponentId}`] : {};
    const playerData = gameData ? gameData[`player${playerId}`] : {};

    if (!gameData) {
        return <div>Loading...</div>;
    }

    return (
        <div className={`game-board container mt-5 text-center ${styles.playingField}`}>
            <div id="opponentField">
                <div className="row mb-4">
                    <div className={`col-3`}>
                        <div className="">
                            <div className={`opponent ${styles.discardPile}`}>トラッシュ（相手）</div>
                        </div>
                        <div className="">
                            <div className={`opponent ${styles.deck}`}>山札（相手）</div>
                        </div>
                    </div>
                    <div className={"col-6"}>
                        <div className={`opponent ${styles.bench}`}>
                            {opponentData.bench?.map((pokemon, index) => (
                                <Pokemon key={index} {...pokemon} />
                            ))}ベンチ（相手）
                        </div>
                        <div className={`row`}>
                            <div className="col-4">
                                <div className={`opponent ${styles.stadium}`}>スタジアム（相手）</div>
                            </div>
                            <div className="col-4">
                                <div className={`opponent ${styles.activeSpot}`}>バトルポケモン（相手）</div>
                            </div>
                            <div className="col-4">
                                <div className={`opponent ${styles.prizeCards}`}>サイド（相手）</div>
                            </div>
                        </div>
                    </div>
                    <div className="col-3">
                        <div className={`opponent ${styles.message}`}>{playerData.message}</div>
                    </div>
                </div>
            </div>
            <div id="playerField">
                <div className="row">
                    <div className={`col-3 self ${styles.hand}`}>
                        <div>手札</div>
                        <div className="action-buttons">
                            <button className="btn btn-primary m-1">見せる</button>
                            <button className="btn btn-primary m-1">ベンチに出す</button>
                            <button className="btn btn-primary m-1">バトル場に出す</button>
                            <button className="btn btn-primary m-1">山札に戻す</button>
                            <button className="btn btn-primary m-1">トラッシュ</button>
                            <button className="btn btn-primary m-1">スタジアムに出す</button>
                        </div>
                    </div>
                    <div className="col-6">
                        <div className="row">
                            <div className="col-4">
                                <div className={`self ${styles.prizeCards}`}>サイド</div>
                            </div>
                            <div className="col-4">
                                <div className={`self ${styles.activeSpot}`}>バトルポケモン（自分）</div>
                            </div>
                            <div className="col-4">
                                <div className={`self ${styles.stadium}`}>スタジアム</div>
                            </div>
                        </div>
                        <div className={`self ${styles.bench}`}>
                            {playerData.bench?.map((pokemon, index) => (
                                <Pokemon key={index} {...pokemon} />
                            ))}ベンチ
                        </div>
                    </div>
                    <div className="col-3">
                        <div className={`self ${styles.deck}`}>山札</div>
                        <div className={`self ${styles.discardPile}`}>トラッシュ</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlayingField;
