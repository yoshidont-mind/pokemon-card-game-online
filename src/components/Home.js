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
import { createFloatingCardSpecs } from '../utils/floatingBackgroundCards';

const BACKGROUND_CARD_COUNT = 120;
const HERO_TITLE_LINES = Object.freeze([
    'Pokémon Trading Card Game',
    'Online Simulator',
]);

const Home = () => {
    const navigate = useNavigate();
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [initialPrizeCount, setInitialPrizeCount] = useState(INITIAL_PRIZE_COUNT_DEFAULT);
    const floatingBackgroundCards = useMemo(
        () => createFloatingCardSpecs(BACKGROUND_CARD_COUNT),
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
                <h1
                    className={styles.heroTitle}
                    aria-label="Pokémon Trading Card Game Online Simulator"
                >
                    {HERO_TITLE_LINES.map((line, lineIndex) => (
                        <span key={line} className={styles.heroTitleLine}>
                            {[...line].map((char, charIndex) => (
                                <span
                                    key={`${line}-${char}-${charIndex}`}
                                    className={styles.heroTitleChar}
                                    style={{
                                        '--char-index': charIndex,
                                        '--line-index': lineIndex,
                                    }}
                                >
                                    {char === ' ' ? '\u00A0' : char}
                                </span>
                            ))}
                        </span>
                    ))}
                </h1>

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
