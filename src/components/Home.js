// src/components/Home.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import db from '../firebase';
import { createEmptyPrivateStateV2, createEmptySessionV2 } from '../game-state/builders';
import {
    INITIAL_PRIZE_COUNT_DEFAULT,
    INITIAL_PRIZE_COUNT_MAX,
    INITIAL_PRIZE_COUNT_MIN,
    normalizeInitialPrizeCount,
} from '../game-state/setupUtils';
import { ensureSignedIn } from '../auth/authClient';
import styles from '../css/home.module.css';

const POKEMON_BACKGROUND_CARD_URLS = Object.freeze([
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045466_P_RAPURASU.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045467_P_MARIRU.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045468_P_MARIRURI.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045469_P_KEROMATSU.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045470_P_GEKOGASHIRA.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045471_P_GEKKOUGAEX.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045472_P_DAKURAIEX.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045473_P_KOMATANA.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045474_P_KIRIKIZAN.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045475_P_DODOGEZAN.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045476_P_OTOSHIDORI.jpg',
    'https://www.pokemon-card.com/assets/images/card_images/large/SVI/045477_P_IBUI.jpg',
]);

const BACKGROUND_LANES = Object.freeze([
    { key: 'lane-a', durationSec: 62, delaySec: 0, reverse: false },
    { key: 'lane-b', durationSec: 76, delaySec: -8, reverse: true },
    { key: 'lane-c', durationSec: 84, delaySec: -20, reverse: false },
]);

const Home = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [initialPrizeCount, setInitialPrizeCount] = useState(INITIAL_PRIZE_COUNT_DEFAULT);

    useEffect(() => {
        let isMounted = true;
        ensureSignedIn()
            .then(() => {
                if (isMounted) {
                    setIsAuthReady(true);
                }
            })
            .catch((error) => {
                console.error('Failed to initialize auth in Home:', error);
                if (isMounted) {
                    setIsAuthReady(false);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const createSession = async () => {
        if (!isAuthReady) {
            alert('認証の初期化中です。数秒待ってから再試行してください。');
            return;
        }

        const user = await ensureSignedIn();
        const actorUid = user?.uid;
        if (!actorUid) {
            alert('認証に失敗しました。ページを再読み込みしてください。');
            return;
        }

        const now = new Date().toISOString();
        const newSession = createEmptySessionV2({
            createdBy: actorUid,
            now,
        });
        newSession.publicState.setup = {
            ...newSession.publicState.setup,
            initialPrizeCount: normalizeInitialPrizeCount(initialPrizeCount),
        };
        newSession.participants.player1 = {
            ...newSession.participants.player1,
            uid: actorUid,
            joinedAt: now,
            lastSeenAt: now,
            connectionState: 'online',
        };
        newSession.updatedBy = actorUid;

        const docRef = await addDoc(collection(db, 'sessions'), newSession);
        await setDoc(
            doc(db, 'sessions', docRef.id, 'privateState', 'player1'),
            createEmptyPrivateStateV2({
                ownerPlayerId: 'player1',
                updatedBy: actorUid,
                now,
            })
        );
        navigate(`/session?id=${docRef.id}&playerId=1`);
    };

    return (
        <div className={styles.page}>
            <div className={styles.backgroundLayer} aria-hidden>
                {BACKGROUND_LANES.map((lane, laneIndex) => (
                    <div
                        key={lane.key}
                        className={styles.backgroundLane}
                        style={{
                            '--lane-top': `${14 + laneIndex * 30}%`,
                            '--lane-duration': `${lane.durationSec}s`,
                            '--lane-delay': `${lane.delaySec}s`,
                        }}
                    >
                        <div
                            className={[
                                styles.backgroundTrack,
                                lane.reverse ? styles.backgroundTrackReverse : '',
                            ].join(' ')}
                        >
                            {[...POKEMON_BACKGROUND_CARD_URLS, ...POKEMON_BACKGROUND_CARD_URLS].map(
                                (imageUrl, cardIndex) => (
                                    <img
                                        key={`${lane.key}-${imageUrl}-${cardIndex}`}
                                        src={imageUrl}
                                        alt=""
                                        className={styles.backgroundCard}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                )
                            )}
                        </div>
                    </div>
                ))}
                <div className={styles.backgroundFade} />
            </div>

            <main className={styles.modal}>
                <p className={styles.productName}>Pokémon Trading Card Game Online Simulator</p>
                <h1 className={styles.heading}>対戦セッションをはじめる</h1>
                <p className={styles.subheading}>
                    デッキ準備からオンライン対戦開始までを、シンプルにセットアップできます。
                </p>

                <section className={styles.setupSection}>
                    <label htmlFor="initial-prize-count" className={styles.sliderLabel}>
                        初期サイド枚数: <strong>{initialPrizeCount} 枚</strong>
                    </label>
                    <input
                        id="initial-prize-count"
                        type="range"
                        className={styles.slider}
                        min={INITIAL_PRIZE_COUNT_MIN}
                        max={INITIAL_PRIZE_COUNT_MAX}
                        step="1"
                        value={initialPrizeCount}
                        onChange={(event) =>
                            setInitialPrizeCount(normalizeInitialPrizeCount(event.target.value))
                        }
                    />
                    <div className={styles.sliderScale}>
                        <span>{INITIAL_PRIZE_COUNT_MIN}枚</span>
                        <span>{INITIAL_PRIZE_COUNT_MAX}枚</span>
                    </div>
                </section>

                <div className={styles.actions}>
                    <button
                        className={styles.primaryButton}
                        onClick={createSession}
                        disabled={!isAuthReady}
                    >
                        セッションを開始
                    </button>
                    <button className={styles.secondaryButton} onClick={() => navigate('/join')}>
                        セッションに参加
                    </button>
                </div>

                {!isAuthReady ? <div className={styles.authHint}>認証を初期化中...</div> : null}
            </main>
        </div>
    );
};

export default Home;
