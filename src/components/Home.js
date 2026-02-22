// src/components/Home.js
import React, { useEffect, useMemo, useState } from 'react';
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
import backgroundPokemonCardUrls from '../data/homeBackgroundPokemonCards.json';

const BACKGROUND_CARD_COUNT = 120;

function createFloatingCardSpecs(cardUrls, count) {
    const source = Array.isArray(cardUrls)
        ? cardUrls.filter((url) => typeof url === 'string' && url.trim() !== '')
        : [];
    if (source.length === 0) {
        return [];
    }

    const shuffled = [...source];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return Array.from({ length: Math.max(1, count) }, (_, index) => {
        const imageUrl = shuffled[index % shuffled.length];
        const directionDeg = Math.random() * 360;
        const directionRad = (directionDeg * Math.PI) / 180;
        const travelDistance = 26 + Math.random() * 70;
        const moveX = Math.cos(directionRad) * travelDistance;
        const moveY = Math.sin(directionRad) * travelDistance;
        const durationSec = 20 + Math.random() * 28;
        const delaySec = -Math.random() * durationSec;
        const tiltDeg = -24 + Math.random() * 48;
        const spinDeg = -22 + Math.random() * 44;
        const scale = 0.78 + Math.random() * 0.58;
        const opacity = 0.7 + Math.random() * 0.25;
        const startX = -22 + Math.random() * 144;
        const startY = -26 + Math.random() * 152;
        return {
            key: `floating-${index + 1}-${imageUrl}`,
            imageUrl,
            style: {
                '--floating-start-x': `${startX.toFixed(2)}vw`,
                '--floating-start-y': `${startY.toFixed(2)}vh`,
                '--floating-move-x': `${moveX.toFixed(2)}vw`,
                '--floating-move-y': `${moveY.toFixed(2)}vh`,
                '--floating-duration': `${durationSec.toFixed(2)}s`,
                '--floating-delay': `${delaySec.toFixed(2)}s`,
                '--floating-tilt': `${tiltDeg.toFixed(2)}deg`,
                '--floating-spin': `${spinDeg.toFixed(2)}deg`,
                '--floating-scale': scale.toFixed(3),
                '--floating-opacity': opacity.toFixed(3),
            },
        };
    });
}

const Home = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [initialPrizeCount, setInitialPrizeCount] = useState(INITIAL_PRIZE_COUNT_DEFAULT);
    const floatingBackgroundCards = useMemo(
        () => createFloatingCardSpecs(backgroundPokemonCardUrls, BACKGROUND_CARD_COUNT),
        []
    );

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
                {floatingBackgroundCards.map((card) => (
                    <img
                        key={card.key}
                        src={card.imageUrl}
                        alt=""
                        className={styles.backgroundCard}
                        style={card.style}
                        loading="lazy"
                        decoding="async"
                    />
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
